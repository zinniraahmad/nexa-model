import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import adminWorker, { ADMIN_PAGE_SIZE, enforceAdminRateLimit, handleApi, signPhotoUrls } from '../admin/worker.js'
import { requireAdmin } from '../admin/access.js'
import { recordOperationalFailure, safeContext } from '../admin/observability.js'

class D1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database
    this.sql = sql
    this.bindings = bindings
  }

  bind(...bindings) { return new D1Statement(this.database, this.sql, bindings) }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) } }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.bindings)
    return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } }
  }
}

function createTestDatabase() {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE applicants (
      application_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL,
      phone TEXT NOT NULL, current_location TEXT NOT NULL, deleted_at TEXT,
      delete_after TEXT, deleted_by TEXT, deletion_type TEXT
    );
    CREATE TABLE applicant_details (
      application_id TEXT PRIMARY KEY, responses_json TEXT NOT NULL,
      application_status TEXT NOT NULL, submitted_at TEXT NOT NULL,
      admin_notes TEXT NOT NULL DEFAULT '', reviewed_at TEXT, reviewed_by TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]', shortlisted_email_sent_at TEXT,
      FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
    );
    CREATE TABLE applicant_photos (
      file_id TEXT PRIMARY KEY, application_id TEXT NOT NULL, file_name TEXT NOT NULL,
      file_url TEXT NOT NULL, photo_type TEXT NOT NULL,
      FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
    );
    CREATE TABLE application_review_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL,
      previous_status TEXT, new_status TEXT NOT NULL, previous_notes TEXT NOT NULL DEFAULT '',
      new_notes TEXT NOT NULL DEFAULT '', previous_tags_json TEXT NOT NULL DEFAULT '[]',
      new_tags_json TEXT NOT NULL DEFAULT '[]', changed_at TEXT NOT NULL,
      changed_by TEXT, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
    );
    CREATE TABLE application_deletion_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL,
      applicant_name TEXT NOT NULL, event_type TEXT NOT NULL, deletion_type TEXT,
      occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, performed_by TEXT NOT NULL
    );
  `)
  database.exec(readFileSync(new URL('../migrations/0016_admin_security_operations.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../migrations/0017_email_analytics.sql', import.meta.url), 'utf8'))
  database.exec(readFileSync(new URL('../migrations/0018_website_controls.sql', import.meta.url), 'utf8'))
  database.exec(`
    INSERT INTO applicants (application_id, full_name, email, phone, current_location)
    VALUES
      ('app-alice', 'Alice Candidate', 'alice@example.test', '+60111111111', 'Shah Alam'),
      ('app-bob', 'Bob Candidate', 'bob@example.test', '+60222222222', 'Johor Bahru');
    INSERT INTO applicant_details (application_id, responses_json, application_status, submitted_at, admin_notes, tags_json)
    VALUES
      ('app-alice', '{"age":24,"marital_status":"single"}', 'submitted', '2026-08-08 01:00:00', '', '["commercial"]'),
      ('app-bob', '{"age":27,"marital_status":"married"}', 'reviewing', '2026-08-07 01:00:00', '', '[]');
  `)
  return {
    raw: database,
    prepare(sql) { return new D1Statement(database, sql) },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())) },
  }
}

const authenticate = async () => ({ email: 'admin@example.test' })

async function callApi(env, path, init = {}) {
  const request = new Request(`https://onlyadmin.nexa-model.com${path}`, init)
  return handleApi(request, env, new URL(request.url), authenticate)
}

test('admin authorization rejects missing Access token and records a durable denial audit', async () => {
  const DB = createTestDatabase()
  const response = await requireAdmin(new Request('https://onlyadmin.nexa-model.com/api/admin/session', {
    headers: { 'cf-ray': 'synthetic-ray' },
  }), { DB, ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'test-audience' })

  assert.equal(response.error.status, 401)
  assert.equal((await response.error.json()).code, 'SESSION_EXPIRED')
  assert.deepEqual({ ...DB.raw.prepare(`
    SELECT event_type, reason_code, request_id FROM admin_security_audit
  `).get() }, { event_type: 'authentication_denied', reason_code: 'missing_token', request_id: 'synthetic-ray' })
})

test('admin list endpoint applies search, status and date filters to live SQL', async () => {
  const DB = createTestDatabase()
  const response = await callApi({ DB }, '/api/admin/applications?search=Alice&status=submitted&date_from=2026-08-08&date_to=2026-08-08&sort=age&direction=asc')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.applications.length, 1)
  assert.equal(body.applications[0].application_id, 'app-alice')
  assert.deepEqual(body.applications[0].tags, ['commercial'])
  assert.equal(body.summary.total, 2)
  assert.deepEqual(body.pagination, { page: 1, page_size: 50, total: 1, total_pages: 1, has_previous: false, has_next: false })
})

test('admin list endpoint enforces fixed server-side pagination', async () => {
  const DB = createTestDatabase()
  const insertApplicant = DB.raw.prepare('INSERT INTO applicants (application_id, full_name, email, phone, current_location) VALUES (?, ?, ?, ?, ?)')
  const insertDetails = DB.raw.prepare("INSERT INTO applicant_details (application_id, responses_json, application_status, submitted_at) VALUES (?, '{\"age\":22}', 'submitted', ?)")
  for (let index = 0; index < 53; index += 1) {
    const id = `extra-${String(index).padStart(3, '0')}`
    insertApplicant.run(id, `Candidate ${index}`, `${id}@example.test`, '+60333333333', 'Kuala Lumpur')
    insertDetails.run(id, `2026-07-${String((index % 28) + 1).padStart(2, '0')} 01:00:00`)
  }

  const response = await callApi({ DB }, '/api/admin/applications?page=2')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(ADMIN_PAGE_SIZE, 50)
  assert.equal(body.applications.length, 5)
  assert.deepEqual(body.pagination, { page: 2, page_size: 50, total: 55, total_pages: 2, has_previous: true, has_next: false })
})

test('admin analytics endpoint returns complete date ranges plus email and ImageKit usage metadata', async (context) => {
  const DB = createTestDatabase()
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    const requestUrl = new URL(url)
    assert.equal(requestUrl.pathname, '/v1/accounts/usage')
    assert.match(requestUrl.searchParams.get('startDate'), /^\d{4}-\d{2}-01$/)
    assert.match(requestUrl.searchParams.get('endDate'), /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(init.headers.Authorization, `Basic ${btoa('private_test_key:')}`)
    return Response.json({
      bandwidthBytes: 1_250_000_000,
      mediaLibraryStorageBytes: 750_000_000,
      videoProcessingUnitsCount: 0,
      extensionUnitsCount: 2,
      originalCacheStorageBytes: 0,
    })
  })
  DB.raw.prepare(`
    INSERT INTO email_messages (
      resend_email_id, application_id, message_type, recipient_type, status,
      provider_http_status, daily_quota_used, monthly_quota_used, attempted_at, accepted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run('resend-test-1', 'app-alice', 'candidate_receipt', 'candidate', 'accepted', 200, 4, 19)

  const response = await callApi({
    DB,
    IMAGEKIT_PRIVATE_KEY: 'private_test_key',
    IMAGEKIT_BANDWIDTH_LIMIT_BYTES: 20_000_000_000,
    IMAGEKIT_STORAGE_LIMIT_BYTES: 3_000_000_000,
  }, '/api/admin/analytics?days=7')
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.range_days, 7)
  assert.equal(body.application_trend.length, 7)
  assert.equal(body.email_trend.length, 7)
  assert.equal(body.email_summary.accepted, 1)
  assert.equal(body.quota.daily_quota_used, 4)
  assert.equal(body.quota.monthly_quota_used, 19)
  assert.equal(body.email_types[0].message_type, 'candidate_receipt')
  assert.equal(body.imagekit_usage.available, true)
  assert.equal(body.imagekit_usage.bandwidth_bytes, 1_250_000_000)
  assert.equal(body.imagekit_usage.storage_bytes, 750_000_000)
  assert.equal(body.imagekit_usage.extension_units, 2)
  assert.match(body.imagekit_usage.bandwidth_resets_on, /^\d{4}-\d{2}-01$/)
  assert.equal(body.imagekit_usage.limits.bandwidth_bytes, 20_000_000_000)
  assert.equal(body.imagekit_usage.limits.storage_bytes, 3_000_000_000)
})

test('admin analytics remains available when ImageKit usage cannot be loaded', async (context) => {
  const DB = createTestDatabase()
  context.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }))
  const response = await callApi({ DB, IMAGEKIT_PRIVATE_KEY: 'private_test_key' }, '/api/admin/analytics?days=30')
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.application_summary.total, 2)
  assert.deepEqual(body.imagekit_usage, {
    available: false,
    reason: 'provider_error',
    limits: { bandwidth_bytes: 20_000_000_000, storage_bytes: 3_000_000_000 },
  })
})

test('website control closes applications only after the public redirect is verified', async (context) => {
  const DB = createTestDatabase()
  context.mock.method(globalThis, 'fetch', async () => new Response(null, {
    status: 302, headers: { Location: 'https://nexa-model.com/applications-closed' },
  }))
  const response = await callApi({ DB, PUBLIC_SITE_URL: 'https://nexa-model.com' }, '/api/admin/website-control', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applications_closed: true }),
  })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.applications_closed, true)
  assert.equal(body.verification.destination, '/applications-closed')
  assert.equal(DB.raw.prepare("SELECT enabled FROM website_controls WHERE control_key = 'applications_closed'").get().enabled, 1)
})

test('website control rolls back when the public state cannot be verified', async (context) => {
  const DB = createTestDatabase()
  context.mock.method(globalThis, 'fetch', async () => new Response('unexpected', { status: 200 }))
  const response = await callApi({ DB, PUBLIC_SITE_URL: 'https://nexa-model.com' }, '/api/admin/website-control', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ applications_closed: true }),
  })
  assert.equal(response.status, 502)
  assert.equal(DB.raw.prepare("SELECT enabled FROM website_controls WHERE control_key = 'applications_closed'").get().enabled, 0)
})

test('admin photo response provides expiring original and transformed thumbnail URLs', () => {
  const [photo] = signPhotoUrls({ IMAGEKIT_PRIVATE_KEY: 'private_test_key', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test' }, [
    { file_id: 'photo-1', file_url: '/private/photo.jpg' },
  ])
  assert.match(photo.file_url, /ik-t=.*ik-s=/)
  assert.doesNotMatch(photo.file_url, /(?:\?|&)tr=/)
  assert.match(photo.thumbnail_url, /tr=w-480,q-75,f-webp/)
  assert.match(photo.thumbnail_url, /ik-t=.*ik-s=/)
})

test('admin update endpoint changes status and writes review history', async () => {
  const DB = createTestDatabase()
  const response = await callApi({ DB }, '/api/admin/applications/app-alice', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'reviewing', notes: 'Strong portfolio', tags: ['commercial', 'KL'] }),
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.review.previous_status, 'submitted')
  assert.equal(body.review.new_status, 'reviewing')
  assert.deepEqual({ ...DB.raw.prepare('SELECT application_status, admin_notes, reviewed_by FROM applicant_details WHERE application_id = ?').get('app-alice') }, {
    application_status: 'reviewing', admin_notes: 'Strong portfolio', reviewed_by: 'admin@example.test',
  })
  assert.deepEqual({ ...DB.raw.prepare('SELECT previous_status, new_status, changed_by FROM application_review_history').get() }, {
    previous_status: 'submitted', new_status: 'reviewing', changed_by: 'admin@example.test',
  })
})

test('admin deletion endpoints enforce confirmation, soft delete, restore and delayed purge', async () => {
  const DB = createTestDatabase()
  const mismatch = await callApi({ DB }, '/api/admin/applications/app-alice', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'wrong', deletion_type: 'manual' }),
  })
  assert.equal(mismatch.status, 400)

  const removed = await callApi({ DB }, '/api/admin/applications/app-alice', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'Alice Candidate', deletion_type: 'manual' }),
  })
  assert.equal(removed.status, 200)
  assert.ok(DB.raw.prepare('SELECT deleted_at FROM applicants WHERE application_id = ?').get('app-alice').deleted_at)

  const restored = await callApi({ DB }, '/api/admin/applications/app-alice/restore', { method: 'POST' })
  assert.equal(restored.status, 200)
  assert.equal(DB.raw.prepare('SELECT deleted_at FROM applicants WHERE application_id = ?').get('app-alice').deleted_at, null)

  await callApi({ DB }, '/api/admin/applications/app-alice', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'app-alice', deletion_type: 'manual' }),
  })
  DB.raw.prepare("UPDATE applicants SET delete_after = '2026-01-01T00:00:00.000Z' WHERE application_id = ?").run('app-alice')
  const purged = await callApi({ DB }, '/api/admin/applications/app-alice/purge', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'app-alice' }),
  })
  assert.equal(purged.status, 200)
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS count FROM applicants WHERE application_id = ?').get('app-alice').count, 0)
  assert.deepEqual(DB.raw.prepare('SELECT event_type FROM application_deletion_audit ORDER BY id').all().map((row) => row.event_type), [
    'soft_deleted', 'restored', 'soft_deleted', 'permanently_deleted',
  ])
})

test('admin rate limit separates reads and mutations and returns 429 from the Worker', async () => {
  const keys = []
  const limiter = { async limit({ key }) { keys.push(key); return { success: false } } }
  const request = new Request('https://onlyadmin.nexa-model.com/api/admin/session', {
    headers: { 'CF-Connecting-IP': '203.0.113.20' },
  })
  assert.equal(await enforceAdminRateLimit(request, { ADMIN_RATE_LIMITER: limiter }), false)
  assert.deepEqual(keys, ['203.0.113.20:read'])

  const DB = createTestDatabase()
  const response = await adminWorker.fetch(request, { DB, ADMIN_RATE_LIMITER: limiter })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('Retry-After'), '60')
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS count FROM admin_security_audit WHERE event_type = 'rate_limited'").get().count, 0)
})

test('three operational failures send one deduplicated alert and retain no applicant data', async (context) => {
  const DB = createTestDatabase()
  const messages = []
  context.mock.method(globalThis, 'fetch', async (_url, init) => {
    messages.push(JSON.parse(init.body))
    return new Response('', { status: 200 })
  })
  const env = { DB, RESEND_API_KEY: 'test-key', OPERATIONS_ALERT_EMAIL: 'ops@example.test' }
  for (let index = 0; index < 4; index += 1) {
    await recordOperationalFailure(env, { service: 'imagekit', eventName: 'provider.imagekit_deletion_failed', httpStatus: 502 })
  }

  assert.equal(messages.length, 1)
  assert.match(messages[0].subject, /Repeated imagekit failures/)
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS count FROM admin_operational_alerts').get().count, 1)
  assert.deepEqual(safeContext({ email: 'candidate@example.test', token: 'secret', path: '/api/admin/applications', httpStatus: 503 }), {
    httpStatus: 503, path: '/api/admin/applications',
  })
})
