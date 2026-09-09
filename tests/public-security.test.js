import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applicationSections, declarationFields, photoFields } from '../src/applicationForm.js'
import publicWorker, { applicationsAreClosed, detectImageMime, handleApplicationAccess, handleApply, handleFinalize, handleRecoverApplication, handleStaticRequest, parseJsonRequest, parseMultipartRequest, parsePhotoSlot, readRequestBody, validateAnswers } from '../src/worker.js'
import { API_SECURITY_HEADERS, apiJson } from '../src/apiResponse.js'
import { requireAdmin } from '../admin/access.js'
import { buildRejectedEmail, buildShortlistedEmail, matchesDeletionConfirmation, normalizeTags, parseResponses, recoveryPeriodEnded } from '../admin/worker.js'

function validValue(field) {
  if (field.type === 'checkbox') return [field.options[0]]
  if (field.type === 'radio' || field.type === 'select') return field.options[0]
  if (field.type === 'scale' || field.type === 'number') return field.min
  if (field.type === 'email') return 'candidate@example.com'
  if (field.type === 'url') return 'https://example.com/profile'
  if (field.key === 'phone') return '+60123456789'
  return `${field.key} value`
}

function validAnswers() {
  const fields = [...applicationSections.flatMap((section) => section.fields), ...declarationFields]
  return Object.fromEntries(fields.map((field) => [field.key, validValue(field)]))
}

test('accepts a complete application and rejects missing or unknown fields', () => {
  const answers = validAnswers()
  assert.equal(validateAnswers(answers), null)
  delete answers.full_name
  assert.match(validateAnswers(answers), /required/i)
  answers.full_name = 'Candidate'
  answers.injected = 'unexpected'
  assert.match(validateAnswers(answers), /unknown field/i)
})

test('validates marital status and normalizes legacy admin records', () => {
  const answers = validAnswers()
  answers.marital_status = 'Married'
  assert.equal(validateAnswers(answers), null)
  delete answers.marital_status
  assert.match(validateAnswers(answers), /Marital Status is required/i)
  answers.marital_status = 'Unknown'
  assert.match(validateAnswers(answers), /invalid selection/i)

  assert.equal(parseResponses('{"age":24}').marital_status, null)
  assert.equal(parseResponses('{"marital_status":"Single"}').marital_status, 'Single')
  assert.deepEqual(parseResponses('invalid'), { marital_status: null })
})

test('requires explicit acceptance of the privacy notice', () => {
  const answers = validAnswers()
  answers.privacy_notice_consent = []
  assert.match(validateAnswers(answers), /required/i)
  answers.privacy_notice_consent = ['I understand and agree.']
  assert.equal(validateAnswers(answers), null)
})

test('rejects values outside the server-side schema', () => {
  const answers = validAnswers()
  answers.age = 17
  assert.match(validateAnswers(answers), /allowed range/i)
  answers.age = 18
  answers.gender = 'Invalid'
  assert.match(validateAnswers(answers), /invalid selection/i)
  answers.gender = 'Female'
  answers.age_gate = 'No'
  assert.match(validateAnswers(answers), /eligibility/i)
  answers.age_gate = 'Yes'
  answers.full_name = '   '
  assert.match(validateAnswers(answers), /required/i)
})

test('only accepts declared photo slots within category limits', () => {
  assert.equal(parsePhotoSlot('front_facing_1')?.type, 'front_facing_1')
  assert.equal(parsePhotoSlot('front_facing_2'), null)
  assert.equal(parsePhotoSlot('unknown_1'), null)
  assert.equal(parsePhotoSlot('../front_facing_1'), null)
})

test('detects PNG and JPEG signatures instead of trusting filenames', async () => {
  const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'fake.txt')
  const jpeg = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])], 'fake.bin')
  const executable = new File([Uint8Array.from([0x4d, 0x5a, 0x90, 0x00])], 'malware.jpg')
  assert.equal(await detectImageMime(png), 'image/png')
  assert.equal(await detectImageMime(jpeg), 'image/jpeg')
  assert.equal(await detectImageMime(executable), null)
})

test('mobile photo picker supports adding photos one at a time', () => {
  const application = readFileSync(new URL('../src/pages/TalentApplication.jsx', import.meta.url), 'utf8')
  assert.match(application, /const combinedFiles = \[\.\.\.existingFiles, \.\.\.files\]/)
  assert.match(application, /tap to add more/)
  assert.match(application, /accept="image\/jpeg,image\/png"/)
  assert.match(application, /Clear selected photos/)
  assert.doesNotMatch(application, /click to replace/)
})

test('website control redirects the application page and blocks stale form submissions', async () => {
  const router = readFileSync(new URL('../src/router.jsx', import.meta.url), 'utf8')
  assert.match(router, /requiresServerNavigation\(to\)/)
  assert.match(router, /normalizePath\(pathname\) === '\/apply'/)
  assert.match(router, /window\.location\.assign\(to\)/)

  const DB = {
    prepare() {
      return { async first() { return { enabled: 1 } } }
    },
  }
  assert.equal(await applicationsAreClosed({ DB }), true)
  const redirected = await publicWorker.fetch(new Request('https://nexa-model.com/apply'), { DB })
  assert.equal(redirected.status, 302)
  assert.equal(new URL(redirected.headers.get('Location')).pathname, '/applications-closed')
  assert.match(redirected.headers.get('Cache-Control'), /no-store/)

  const blocked = await publicWorker.fetch(new Request('https://nexa-model.com/api/apply', { method: 'POST' }), { DB })
  assert.equal(blocked.status, 503)
  assert.equal((await blocked.json()).code, 'APPLICATIONS_CLOSED')
})

function accessDatabase(existing) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return sql.includes('JOIN applicant_details') ? existing : null
            },
            async run() {
              return { meta: { changes: 1 } }
            },
          }
        },
      }
    },
  }
}

test('checks finalized applications after Turnstile and sends no pre-application email', async (context) => {
  const outboundUrls = []
  context.mock.method(globalThis, 'fetch', async (url) => {
    outboundUrls.push(String(url))
    if (String(url).includes('siteverify')) return Response.json({ success: true })
    return new Response('', { status: 200 })
  })
  const states = [null, { application_id: 'submitted-1', full_name: 'Submitted Candidate', email: 'candidate@example.com', application_status: 'submitted' }]
  const responses = []
  for (const existing of states) {
    const request = new Request('https://nexa-model.com/api/application-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
      body: JSON.stringify({ email: 'candidate@example.com', turnstile_token: 'verified-token' }),
    })
    const response = await handleApplicationAccess(request, {
      DB: accessDatabase(existing),
      TURNSTILE_SECRET_KEY: 'test-secret',
      RESEND_API_KEY: 'test-resend-key',
      EMAIL_FROM: 'Nexa Model <applications@nexa-model.com>',
      PUBLIC_SITE_URL: 'https://nexa-model.com',
    })
    responses.push({ status: response.status, body: await response.json() })
  }
  assert.equal(responses[0].status, 200)
  assert.equal(responses[0].body.already_submitted, false)
  assert.match(responses[0].body.application_access_token, /^[A-Za-z0-9_-]{40,}$/)
  assert.match(responses[0].body.expires_at, /Z$/)
  assert.equal(responses[1].status, 200)
  assert.equal(responses[1].body.already_submitted, true)
  assert.equal(responses[1].body.application_access_token, undefined)
  assert.equal(outboundUrls.filter((url) => url.includes('siteverify')).length, 2)
  assert.equal(outboundUrls.some((url) => url.includes('resend.com')), false)
})

test('emails a secure recovery link instead of calling an incomplete upload submitted', async (context) => {
  const state = { recoveryClaimed: false, emailCalls: 0 }
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    if (String(url).includes('siteverify')) return Response.json({ success: true })
    assert.equal(String(url), 'https://api.resend.com/emails')
    const payload = JSON.parse(init.body)
    assert.equal(payload.to[0], 'candidate@example.com')
    assert.match(payload.subject, /unfinished/i)
    assert.match(payload.text, /\/apply\?recovery=[A-Za-z0-9_-]+/)
    state.emailCalls += 1
    return new Response('', { status: 200 })
  })
  const env = {
    TURNSTILE_SECRET_KEY: 'test-secret',
    RESEND_API_KEY: 'test-resend',
    EMAIL_FROM: 'Nexa Model <applications@nexa-model.com>',
    PUBLIC_SITE_URL: 'https://nexa-model.com',
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('JOIN applicant_details')) return { application_id: 'pending-1', full_name: 'Pending Candidate', email: 'candidate@example.com', application_status: 'pending_upload' }
                return null
              },
              async run() {
                if (sql.includes('SET recovery_token_hash')) state.recoveryClaimed = true
                return { meta: { changes: 1 } }
              },
            }
          },
        }
      },
    },
  }
  const response = await handleApplicationAccess(new Request('https://nexa-model.com/api/application-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'candidate@example.com', turnstile_token: 'verified-token' }),
  }), env)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.already_submitted, false)
  assert.equal(body.recovery_required, true)
  assert.equal(state.recoveryClaimed, true)
  assert.equal(state.emailCalls, 1)
})

test('valid recovery token replaces only the unfinished application', async (context) => {
  const executedSql = []
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.match(String(url), /siteverify/)
    return Response.json({ success: true })
  })
  const env = {
    TURNSTILE_SECRET_KEY: 'test-secret',
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('JOIN applicant_details')) return { application_id: 'pending-1', application_status: 'pending_upload' }
                return null
              },
              async all() { return { results: [] } },
              async run() {
                executedSql.push(sql)
                return { meta: { changes: sql.includes('recovery_token_hash = ?') ? 1 : 0 } }
              },
            }
          },
        }
      },
      async batch(statements) {
        assert.equal(statements.length, 3)
        return statements.map(() => ({ meta: { changes: 1 } }))
      },
    },
  }
  const response = await handleApply(new Request('https://nexa-model.com/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-recovery-token' },
    body: JSON.stringify({ answers: validAnswers(), turnstile_token: 'verified-token' }),
  }), env)
  const body = await response.json()
  assert.equal(response.status, 201)
  assert.equal(body.application_id, 'pending-1')
  assert.ok(executedSql.some((sql) => sql.includes('recovery_token_hash = ?')))
})

test('secure recovery resumes saved answers and uploaded photo slots', async () => {
  const recoveryToken = 'valid-recovery-token'
  const tokenHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recoveryToken))
  const recoveryTokenHash = Array.from(new Uint8Array(tokenHashBytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const savedAnswers = validAnswers()
  const uploadedTypes = ['front_facing_1', 'side_profile_1', 'side_profile_2', 'side_profile_3']
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('d.recovery_token_hash')) return {
                  application_id: 'pending-1',
                  email: 'candidate@example.com',
                  responses_json: JSON.stringify(savedAnswers),
                  recovery_token_hash: recoveryTokenHash,
                  upload_token_expires_at: '2026-08-09 12:00:00',
                }
                return null
              },
              async run() { return { meta: { changes: 1 } } },
              async all() { return { results: uploadedTypes.map((photo_type) => ({ photo_type })) } },
            }
          },
        }
      },
    },
  }
  const response = await handleRecoverApplication(new Request('https://nexa-model.com/api/recover', {
    method: 'POST', headers: { Authorization: `Bearer ${recoveryToken}` },
  }), env)
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.application_id, 'pending-1')
  assert.deepEqual(body.answers, savedAnswers)
  assert.deepEqual(body.uploaded_types, uploadedTypes)
  assert.notEqual(body.upload_token, recoveryToken)
})

test('requires a separate final Turnstile token before creating an application', async () => {
  const request = new Request('https://nexa-model.com/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer browser-access-token' },
    body: JSON.stringify({ answers: validAnswers() }),
  })
  const response = await handleApply(request, {
    TURNSTILE_SECRET_KEY: 'test-secret',
    DB: { prepare() { throw new Error('D1 must not be reached before final Turnstile verification.') } },
  })
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /Final security verification failed/i)
})

test('submits with no photos and sends one candidate receipt plus one admin notification', async (context) => {
  const state = { status: 'pending_upload', confirmationSentAt: null, adminNotificationSentAt: null, resendCalls: 0 }
  const uploadedRows = []
  const env = {
    RESEND_API_KEY: 'test-resend', EMAIL_FROM: 'Nexa Model <applications@nexa-model.com>', PUBLIC_SITE_URL: 'https://nexa-model.com',
    ADMIN_NOTIFICATION_EMAIL: 'admin@example.com', ADMIN_PORTAL_URL: 'https://onlyadmin.nexa-model.com',
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('SELECT a.application_id')) return { application_id: 'application-1', full_name: 'Candidate Full Name', email: 'candidate@example.com', current_location: 'Shah Alam, Selangor', responses_json: JSON.stringify({ preferred_name: 'Nexa', age: 24 }), submitted_at: '2026-08-08 00:00:00', application_status: state.status, confirmation_sent_at: state.confirmationSentAt, admin_notification_sent_at: state.adminNotificationSentAt }
                return null
              },
              async all() { return { results: uploadedRows } },
              async run() {
                if (sql.includes("application_status = 'submitted'")) state.status = 'submitted'
                if (sql.includes('confirmation_sent_at = CURRENT_TIMESTAMP')) state.confirmationSentAt = '2026-08-08 00:00:00'
                if (sql.includes('admin_notification_sent_at = CURRENT_TIMESTAMP')) state.adminNotificationSentAt = '2026-08-08 00:00:00'
                return { meta: { changes: 1 } }
              },
            }
          },
        }
      },
    },
  }
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), 'https://api.resend.com/emails')
    const payload = JSON.parse(init.body)
    if (payload.to[0] === 'candidate@example.com') {
      assert.equal(init.headers['Idempotency-Key'], 'application-submitted/application-1')
      assert.match(payload.html, /submitted successfully/)
      assert.doesNotMatch(payload.html, /\/apply\?confirm=/)
    } else {
      assert.equal(payload.to[0], 'admin@example.com')
      assert.equal(init.headers['Idempotency-Key'], 'admin-application-submitted/application-1')
      assert.match(payload.subject, /Nexa \(application-1\)/)
      assert.match(payload.html, /Candidate Full Name/)
      assert.match(payload.html, /Shah Alam, Selangor/)
      assert.match(payload.html, /onlyadmin\.nexa-model\.com/)
    }
    state.resendCalls += 1
    return new Response('', { status: 200 })
  })
  const request = () => new Request('https://nexa-model.com/api/finalize', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer upload-token' }, body: JSON.stringify({ application_id: 'application-1' }),
  })
  const first = await handleFinalize(request(), env)
  assert.equal(first.status, 200)
  assert.equal(state.status, 'submitted')
  assert.equal(state.resendCalls, 2)
  const second = await handleFinalize(request(), env)
  assert.equal(second.status, 200)
  assert.equal(state.resendCalls, 2)
})

test('rejects oversized bodies before JSON and multipart parsing', async () => {
  const streamed = new Request('https://nexa-model.com/api/apply', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '123456',
  })
  const limited = await readRequestBody(streamed, 5)
  assert.equal(limited.response.status, 413)

  const oversizedJson = new Request('https://nexa-model.com/api/apply', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': '999999' }, body: '{}',
  })
  assert.equal((await parseJsonRequest(oversizedJson, 100)).response.status, 413)

  const oversizedMultipart = new Request('https://nexa-model.com/api/upload', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': '20000000' }, body: '--test--',
  })
  assert.equal((await parseMultipartRequest(oversizedMultipart)).response.status, 413)
})

test('applies no-store and consistent security headers to public and admin API responses', async () => {
  const responses = [
    apiJson({ success: true }),
    (await requireAdmin(new Request('https://onlyadmin.nexa-model.com/api/admin/session'), {})).error,
  ]
  for (const response of responses) {
    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      assert.equal(response.headers.get(name), value, `Unexpected ${name} header`)
    }
  }
  assert.equal(responses[1].status, 503)
  assert.equal((await responses[1].clone().json()).code, 'AUTH_NOT_CONFIGURED')
})

test('admin exposes actionable session and service error states', () => {
  const access = readFileSync(new URL('../admin/access.js', import.meta.url), 'utf8')
  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')

  for (const code of ['SESSION_EXPIRED', 'FORBIDDEN']) assert.match(access, new RegExp(code))
  for (const code of ['DATABASE_ERROR', 'IMAGEKIT_ERROR']) assert.match(worker, new RegExp(code))
  assert.match(app, /NETWORK_ERROR/)
  assert.match(app, /Sign in again/)
  assert.match(app, /Retry/)
})

test('admin workflow validates tags and uses Malaysia time for dates and filters', () => {
  assert.deepEqual(normalizeTags([' commercial ', 'KL', 'commercial', '']), ['commercial', 'KL'])
  assert.equal(normalizeTags(Array.from({ length: 11 }, (_, index) => `tag-${index}`)), null)
  assert.equal(normalizeTags(['x'.repeat(31)]), null)

  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  assert.match(worker, /date\(d\.submitted_at, '\+8 hours'\)/)
  assert.match(app, /Asia\/Kuala_Lumpur/)
  assert.match(app, /Export CSV/)
  assert.match(app, /Unsaved changes/)
  assert.match(app, /summary-count-skeleton/)
  assert.doesNotMatch(app, /function AnimatedCount/)
  assert.doesNotMatch(app, /<label>Retention/)
})

test('admin accessibility and UX includes modal focus management, skeletons, toasts and keyboard controls', () => {
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  const calendar = readFileSync(new URL('../admin/src/TrainingCalendar.jsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../admin/src/styles.css', import.meta.url), 'utf8')

  assert.match(app, /function useDialogFocus/)
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /event\.key !== 'Tab'/)
  assert.match(app, /returnTarget\?\.isConnected/)
  assert.match(app, /ApplicationListSkeleton/)
  assert.doesNotMatch(app, /Loading applications…<\/div>/)
  assert.match(app, /Clear filters/)
  assert.match(app, /View active applications/)
  assert.match(app, /function Toast/)
  assert.match(app, /Review saved successfully/)
  assert.match(app, /aria-label="Search applications"/)
  assert.match(app, /const \[search, setSearch\] = useState\(''\)/)
  assert.match(app, /aria-label="Clear search"/)
  assert.match(styles, /\.clear-search-button/)
  assert.match(calendar, /End time<input required name="end_time"/)
  assert.match(calendar, /duration_minutes: calculatedDuration/)
  assert.match(calendar, /End time must be later than start time\./)
  assert.match(calendar, /title=\{item\.full_name\}/)
  assert.match(calendar, /durationLabel\(item\.duration_minutes\)/)
  assert.match(calendar, /item\.profile_photo_url/)
  assert.match(calendar, /hour >= 8 && hour <= 11.*time-morning/)
  assert.match(calendar, /hour >= 12 && hour <= 17.*time-afternoon/)
  assert.match(calendar, /hour >= 20 && hour <= 23.*time-night/)
  assert.match(styles, /\.calendar-event\.time-morning/)
  assert.match(styles, /\.calendar-event\.time-afternoon/)
  assert.match(styles, /\.calendar-event\.time-night/)
  assert.match(calendar, /className="agenda-time".*className="agenda-profile-photo"/)
  assert.match(styles, /\.agenda-profile-photo img/)
  assert.match(app, /\['Enter', ' '\]\.includes\(event\.key\)/)
  assert.match(styles, /@media \(max-width: 900px\)/)
  assert.match(styles, /@media \(max-width: 600px\)/)
  assert.match(app, /summary-unavailable/)
  assert.match(app, /aria-label="Data unavailable"/)
  assert.match(app, /mobile-filter-toggle/)
  assert.match(app, /ApplicationListHeader/)
  assert.match(app, /aria-label="Application pages"/)
  assert.match(app, /aria-label=\{collapsed \? 'Show sidebar' : 'Hide sidebar'\}/)
  assert.match(app, /nexa-admin-sidebar-collapsed/)
  assert.match(styles, /\.admin-layout\.sidebar-collapsed/)
  assert.match(styles, /\.sidebar-collapsed \.admin-sidebar a span \{ display: none; \}/)
  assert.match(styles, /\.admin-header \{ position: sticky; top: 0; z-index: 20;/)
  assert.match(styles, /\.admin-sidebar nav \{ position: sticky; top: 94px;/)
  assert.match(styles, /height: calc\(100dvh - 118px\)/)
  assert.match(app, /thumbnail_url \|\| .*file_url/)
  assert.match(styles, /min-height: 44px/)
  assert.match(styles, /\.advanced-filters\.expanded/)
  assert.match(app, /const requestId = \+\+loadRequestRef\.current\s+setLoading\(true\)\s+setError\(null\)/)
  assert.match(app, /setApplications\(\[\]\)\s+setPagination\(emptyPagination\)\s+setLoading\(true\)/)
  assert.match(app, /function RestoreDialog/)
  assert.match(app, /Are you sure you want to restore this candidate/)
  assert.match(app, /className="dialog restore-dialog" role="alertdialog" aria-modal="true"/)
  assert.match(app, /useDialogFocus\(onCancel, restoring\)/)
  assert.match(app, /!deletedView && <label className="row-checkbox-target"/)
  assert.match(styles, /\.application-row\.deleted-row \{ grid-template-columns: minmax\(210px, 2fr\)/)
  assert.match(styles, /\.delete-dialog \.cancel-button, \.delete-dialog \.delete-confirm-button \{[^}]*font-size: 17px;[^}]*white-space: nowrap;/)
  assert.match(styles, /\.restore-dialog \.cancel-button, \.restore-dialog \.restore-confirm-button \{[^}]*font-size: 17px;[^}]*white-space: nowrap;/)
})

test('admin workflow exposes only the active recruitment statuses', () => {
  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  const frontendStatuses = app.match(/const statusLabels = \{[^\n]+/)[0]
  const backendStatuses = worker.match(/const STATUSES = \[[^\n]+/)[0]

  assert.doesNotMatch(frontendStatuses, /interview_scheduled|Interview scheduled/)
  assert.doesNotMatch(backendStatuses, /interview_scheduled/)
  assert.match(frontendStatuses, /submitted.*reviewing.*shortlisted.*contacted.*rejected/)
  assert.match(backendStatuses, /submitted.*reviewing.*shortlisted.*contacted.*rejected/)
})

test('admin detail review includes history, completeness and accessible photo controls', () => {
  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../migrations/0011_application_review_history.sql', import.meta.url), 'utf8')

  assert.match(migration, /CREATE TABLE IF NOT EXISTS application_review_history/)
  assert.match(migration, /ON DELETE CASCADE/)
  assert.match(worker, /INSERT INTO application_review_history/)
  assert.match(worker, /ORDER BY changed_at ASC/)
  assert.match(app, /Application timeline/)
  assert.match(app, /Compare changes/)
  assert.match(app, /Missing required/)
  assert.match(app, /Photo viewer/)
  assert.match(app, /Copy reference ID/)
  assert.match(app, /Loading applicant details/)
})

test('admin deletion uses typed confirmation, a 30-day recovery window and durable audit events', () => {
  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../migrations/0015_safe_application_deletion.sql', import.meta.url), 'utf8')

  assert.match(migration, /application_deletion_audit/)
  assert.match(migration, /soft_deleted.*restored.*permanently_deleted/)
  assert.match(worker, /SOFT_DELETE_DAYS = 30/)
  assert.match(worker, /CONFIRMATION_MISMATCH/)
  assert.match(worker, /RECOVERY_PERIOD_ACTIVE/)
  assert.match(worker, /event_type, deletion_type/)
  assert.match(app, /Type the applicant’s full name or reference ID/)
  assert.match(app, /Recently Deleted/)
  assert.match(app, /Retention cleanup/)
  assert.match(app, /Permanently delete/)

  const applicant = { application_id: 'reference-123', full_name: 'Candidate Name' }
  assert.equal(matchesDeletionConfirmation(' Candidate Name ', applicant), true)
  assert.equal(matchesDeletionConfirmation('REFERENCE-123', applicant), true)
  assert.equal(matchesDeletionConfirmation('Candidate', applicant), false)
  assert.equal(recoveryPeriodEnded('2026-08-01T00:00:00.000Z', Date.parse('2026-08-02T00:00:00.000Z')), true)
  assert.equal(recoveryPeriodEnded('invalid', Date.now()), false)
})

test('shortlisting requires confirmation and creates a bilingual candidate email', () => {
  const message = buildShortlistedEmail({ full_name: 'Candidate Name' })
  assert.equal(message.subject, 'Nexa Model application shortlisted')
  assert.match(message.text, /Hi Candidate Name/)
  assert.match(message.text, /training and assessment stage/)
  assert.match(message.text, /Hai Candidate Name/)
  assert.match(message.text, /peringkat latihan dan penilaian/)
  assert.match(message.text, /Privacy enquiries \/ Pertanyaan privasi: itszinniraahmad@gmail\.com/)

  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  assert.match(worker, /SHORTLIST_CONFIRMATION_REQUIRED/)
  assert.match(worker, /application-shortlisted\/\$\{applicant\.application_id\}/)
  assert.match(worker, /Nexa Model <applications@updates\.nexa-model\.com>/)
  assert.match(app, /Shortlist this candidate\?/)
  assert.match(app, /This action will save the review and send a shortlist email/)
})

test('admin defaults to dark mode without relying on CSP-blocked inline scripts', () => {
  const index = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../admin/src/main.jsx', import.meta.url), 'utf8')

  assert.match(index, /<html lang="en" data-theme="dark">/)
  assert.doesNotMatch(index, /<script>\s*document\.documentElement\.dataset\.theme/)
  assert.match(main, /localStorage\.getItem\('nexa-admin-theme-v2'\) \|\| 'dark'/)
})

test('admin applications support list and icon views with candidate profile thumbnails', () => {
  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  const styles = readFileSync(new URL('../admin/src/styles.css', import.meta.url), 'utf8')

  assert.match(worker, /profile_photo_url/)
  assert.match(worker, /front_facing/)
  assert.match(app, /Candidate view/)
  assert.match(app, /> List</)
  assert.match(app, /> Icon</)
  assert.match(app, /application-icon-grid/)
  assert.match(app, /profile_photo_url/)
  assert.match(styles, /\.application-icon-grid/)
  assert.match(styles, /\.candidate-icon-photo img/)
})

test('rejection requires confirmation and creates a bilingual candidate email', () => {
  const message = buildRejectedEmail({ full_name: 'Candidate Name' })
  assert.equal(message.subject, 'Update on your Nexa Model application')
  assert.match(message.text, /Hi Candidate Name/)
  assert.match(message.text, /will not be progressing with your application/)
  assert.match(message.text, /Hai Candidate Name/)
  assert.match(message.text, /tidak dapat meneruskan permohonan anda/)
  assert.match(message.text, /Nexa Model Admin/)

  const worker = readFileSync(new URL('../admin/worker.js', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  assert.match(worker, /REJECTION_CONFIRMATION_REQUIRED/)
  assert.match(worker, /application-rejected\/\$\{applicant\.application_id\}/)
  assert.match(app, /Reject this candidate\?/)
  assert.match(app, /send a rejection email to the candidate/)
})

test('admin ImageKit analytics shows readable usage, remaining quota, reset timing and refresh', () => {
  const app = readFileSync(new URL('../admin/src/App.jsx', import.meta.url), 'utf8')
  assert.match(app, /Image storage/)
  assert.match(app, /out of/)
  assert.match(app, /function formatGigabytes/)
  assert.match(app, /\.toFixed\(2\)/)
  assert.doesNotMatch(app, /labelHelp=/)
  assert.match(app, /remaining/)
  assert.match(app, /does not reset/)
  assert.match(app, /bandwidth_resets_on/)
  assert.match(app, /Refresh ImageKit and analytics data/)
  assert.match(app, /ImageKit usage has passed 70%/)
  assert.match(app, /ImageKit usage is critically high/)
})

test('privacy notice covers the reviewed bilingual PDPA disclosures', () => {
  const notice = readFileSync(new URL('../src/pages/Privacy.jsx', import.meta.url), 'utf8')
  for (const requiredDisclosure of [
    'Zinnira Ahmad', 'alamat IP',
    'Required and optional information', 'Maklumat wajib dan pilihan',
    'Cloudflare', 'ImageKit', 'Resend', 'WhatsApp', 'Google Drive',
    'Processing outside Malaysia', 'Pemprosesan di luar Malaysia',
    'itszinniraahmad@gmail.com', 'significant harm', 'kemudaratan ketara',
  ]) {
    assert.ok(notice.includes(requiredDisclosure), `Missing privacy disclosure: ${requiredDisclosure}`)
  }
  assert.doesNotMatch(notice, /\bSSM\b|registered business number|nombor (?:perniagaan|pendaftaran)/i)
  assert.match(declarationFields.find((field) => field.key === 'privacy_notice_consent').label, /outside Malaysia/i)
})

test('serves only declared SPA routes and returns a real 404 for unknown paths', async () => {
  const requestedPaths = []
  const env = {
    ASSETS: {
      async fetch(request) {
        const pathname = new URL(request.url).pathname
        requestedPaths.push(pathname)
        if (pathname === '/') return new Response('<div id="root"></div>', { status: 200 })
        if (pathname === '/favicon.svg') return new Response('<svg/>', { status: 200 })
        return new Response('missing', { status: 404 })
      },
    },
  }

  const knownUrl = new URL('https://nexa-model.com/apply?confirm=single-use-token')
  const known = await handleStaticRequest(new Request(knownUrl), env, knownUrl)
  assert.equal(known.status, 200)
  assert.deepEqual(requestedPaths, ['/'])

  const unknown = await handleStaticRequest(new Request('https://nexa-model.com/not-a-page'), env, new URL('https://nexa-model.com/not-a-page'))
  assert.equal(unknown.status, 404)
  assert.equal(unknown.headers.get('X-Robots-Tag'), 'noindex')
  assert.equal(unknown.headers.get('X-Content-Type-Options'), 'nosniff')
  assert.equal(unknown.headers.get('Cache-Control'), 'no-store, max-age=0')
  assert.match(await unknown.text(), /Page not found/i)

  const asset = await handleStaticRequest(new Request('https://nexa-model.com/favicon.svg'), env, new URL('https://nexa-model.com/favicon.svg'))
  assert.equal(asset.status, 200)
})

test('includes crawl assets, social metadata and consistent age wording', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
  const ageGate = applicationSections[0].fields.find((field) => field.key === 'age_gate')
  assert.match(index, /rel="canonical" href="https:\/\/nexa-model\.com\/"/)
  assert.match(index, /property="og:title"/)
  assert.match(index, /name="twitter:card" content="summary"/)
  assert.match(robots, /Sitemap: https:\/\/nexa-model\.com\/sitemap\.xml/)
  assert.match(sitemap, /https:\/\/nexa-model\.com\/apply/)
  assert.equal(ageGate.label, 'Are you aged 18 to 30 years old?')
  assert.equal(ageGate.labelBm, 'Adakah anda berumur 18 hingga 30 tahun?')
})
