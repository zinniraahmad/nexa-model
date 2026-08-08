import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applicationSections, declarationFields } from '../src/applicationForm.js'
import { authorizePendingReplacement, detectImageMime, handleApplicationAccess, parseJsonRequest, parseMultipartRequest, parsePhotoSlot, readRequestBody, validateAnswers } from '../src/worker.js'

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

async function tokenHash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function replacementDatabase({ uploadToken, recoveryToken, recoveryActive = true }) {
  const state = {
    uploadHash: uploadToken ? null : undefined,
    recoveryHash: recoveryToken ? null : undefined,
    recoveryActive,
  }
  return Promise.all([
    uploadToken ? tokenHash(uploadToken).then((hash) => { state.uploadHash = hash }) : null,
    recoveryToken ? tokenHash(recoveryToken).then((hash) => { state.recoveryHash = hash }) : null,
  ]).then(() => ({
    prepare(sql) {
      return {
        bind(nextHash, _nextExpiry, _applicationId, presentedHash) {
          return {
            async run() {
              if (sql.includes('recovery_token_hash = ?') && state.recoveryActive && state.recoveryHash === presentedHash) {
                state.recoveryHash = null
                state.uploadHash = nextHash
                return { meta: { changes: 1 } }
              }
              if (sql.includes('AND upload_token_hash = ?') && state.uploadHash === presentedHash) {
                state.uploadHash = nextHash
                return { meta: { changes: 1 } }
              }
              return { meta: { changes: 0 } }
            },
          }
        },
      }
    },
  }))
}

test('requires a matching replacement credential and consumes it atomically', async () => {
  const DB = await replacementDatabase({ uploadToken: 'existing-upload-token', recoveryToken: 'single-use-recovery' })
  const env = { DB }
  const request = (token) => new Request('https://nexa-model.com/api/apply', { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  assert.equal(await authorizePendingReplacement(request('wrong-token'), env, 'application-1', 'next-hash-1', '2099-01-01 00:00:00'), null)
  assert.equal(await authorizePendingReplacement(request('single-use-recovery'), env, 'application-1', 'next-hash-2', '2099-01-01 00:00:00'), 'recovery_token')
  assert.equal(await authorizePendingReplacement(request('single-use-recovery'), env, 'application-1', 'next-hash-3', '2099-01-01 00:00:00'), null)
})

test('accepts possession of the existing upload token even after its upload window', async () => {
  const DB = await replacementDatabase({ uploadToken: 'expired-upload-token' })
  const request = new Request('https://nexa-model.com/api/apply', { headers: { Authorization: 'Bearer expired-upload-token' } })
  assert.equal(await authorizePendingReplacement(request, { DB }, 'application-2', 'rotated-hash', '2099-01-01 00:00:00'), 'upload_token')
})

function accessDatabase(existing) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return sql.includes('SELECT a.application_id') ? existing : null
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

test('returns the same public access response for new, pending and submitted emails', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('siteverify')) return Response.json({ success: true })
    return new Response('', { status: 200 })
  })
  const states = [
    null,
    { application_id: 'pending-id', full_name: 'Pending Applicant', email: 'candidate@example.com', application_status: 'pending_upload' },
    { application_id: 'submitted-id', full_name: 'Submitted Applicant', email: 'candidate@example.com', application_status: 'submitted' },
  ]
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
  assert.deepEqual(responses[1], responses[0])
  assert.deepEqual(responses[2], responses[0])
  assert.equal(responses[0].status, 202)
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

test('privacy notice covers the reviewed bilingual PDPA disclosures', () => {
  const notice = readFileSync(new URL('../src/pages/Privacy.jsx', import.meta.url), 'utf8')
  for (const requiredDisclosure of [
    'Zinnira Ahmad', 'alamat IP',
    'Required and optional information', 'Maklumat wajib dan pilihan',
    'Cloudflare', 'ImageKit', 'Resend', 'WhatsApp', 'Google Drive',
    'Processing outside Malaysia', 'Pemprosesan di luar Malaysia',
    'aduan@pdp.gov.my', 'significant harm', 'kemudaratan ketara',
  ]) {
    assert.ok(notice.includes(requiredDisclosure), `Missing privacy disclosure: ${requiredDisclosure}`)
  }
  assert.doesNotMatch(notice, /\bSSM\b|registered business number|nombor (?:perniagaan|pendaftaran)/i)
  assert.match(declarationFields.find((field) => field.key === 'privacy_notice_consent').label, /outside Malaysia/i)
})
