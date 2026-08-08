import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applicationSections, declarationFields, photoFields } from '../src/applicationForm.js'
import { detectImageMime, handleApplicationAccess, handleApply, handleFinalize, handleStaticRequest, parseJsonRequest, parseMultipartRequest, parsePhotoSlot, readRequestBody, validateAnswers } from '../src/worker.js'
import { API_SECURITY_HEADERS, apiJson } from '../src/apiResponse.js'
import { requireAdmin } from '../admin/access.js'
import { normalizeTags } from '../admin/worker.js'

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

function accessDatabase(existing) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return sql.includes('SELECT 1 AS present') ? existing : null
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

test('checks existing email after Turnstile and sends no pre-application email', async (context) => {
  const outboundUrls = []
  context.mock.method(globalThis, 'fetch', async (url) => {
    outboundUrls.push(String(url))
    if (String(url).includes('siteverify')) return Response.json({ success: true })
    return new Response('', { status: 200 })
  })
  const states = [null, { present: 1 }]
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

test('submits immediately and sends one candidate receipt plus one admin notification', async (context) => {
  const state = { status: 'pending_upload', confirmationSentAt: null, adminNotificationSentAt: null, resendCalls: 0 }
  const uploadedRows = photoFields.flatMap((field) => Array.from({ length: field.min }, (_, index) => ({ photo_type: `${field.key}_${index + 1}`, count: 1 })))
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
})

test('admin defaults to dark mode without relying on CSP-blocked inline scripts', () => {
  const index = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../admin/src/main.jsx', import.meta.url), 'utf8')

  assert.match(index, /<html lang="en" data-theme="dark">/)
  assert.doesNotMatch(index, /<script>\s*document\.documentElement\.dataset\.theme/)
  assert.match(main, /localStorage\.getItem\('nexa-admin-theme-v2'\) \|\| 'dark'/)
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
