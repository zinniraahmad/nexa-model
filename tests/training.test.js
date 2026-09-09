import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { handleTrainingApi } from '../admin/trainingApi.js'
import { getPublicCandidateProgress, hashProgressToken } from '../src/trainingProgress.js'

class D1Statement {
  constructor(database, sql, bindings = []) { this.database = database; this.sql = sql; this.bindings = bindings }
  bind(...bindings) { return new D1Statement(this.database, this.sql, bindings) }
  async all() { return { results: this.database.prepare(this.sql).all(...this.bindings) } }
  async first() { return this.database.prepare(this.sql).get(...this.bindings) || null }
  async run() { const result = this.database.prepare(this.sql).run(...this.bindings); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } } }
}

function database() {
  const raw = new DatabaseSync(':memory:')
  raw.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE applicants (application_id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL, current_location TEXT NOT NULL, deleted_at TEXT);
    CREATE TABLE applicant_details (application_id TEXT PRIMARY KEY, responses_json TEXT NOT NULL DEFAULT '{}', application_status TEXT NOT NULL, submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE);
    CREATE TABLE applicant_photos (file_id TEXT PRIMARY KEY, application_id TEXT NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, photo_type TEXT NOT NULL, FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE);
    INSERT INTO applicants VALUES ('candidate-a', 'Aisha Trainee', 'aisha@example.test', '+60111111111', 'Kuala Lumpur', NULL);
    INSERT INTO applicants VALUES ('candidate-b', 'Other Trainee', 'other@example.test', '+60222222222', 'Johor', NULL);
    INSERT INTO applicant_details (application_id, application_status) VALUES ('candidate-a', 'contacted'), ('candidate-b', 'shortlisted');
    INSERT INTO applicant_photos VALUES ('candidate-a-front', 'candidate-a', 'front.jpg', '/applications/candidate-a/front.jpg', 'front_facing');
  `)
  raw.exec(readFileSync(new URL('../migrations/0019_training_evaluation.sql', import.meta.url), 'utf8'))
  raw.exec(readFileSync(new URL('../migrations/0021_training_appointments.sql', import.meta.url), 'utf8'))
  return { raw, prepare(sql) { return new D1Statement(raw, sql) }, async batch(statements) { return Promise.all(statements.map((statement) => statement.run())) } }
}

async function api(DB, path, method = 'POST', body = {}) {
  const request = new Request(`https://onlyadmin.nexa-model.com${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) })
  return handleTrainingApi(request, { DB, PUBLIC_SITE_URL: 'https://nexa-model.com' }, new URL(request.url), { email: 'admin@example.test' })
}

async function json(response) { return { status: response.status, body: await response.json() } }

test('only Contacted candidates are eligible for the training dropdown and session creation', async () => {
  const DB = database()
  const candidates = (await json(await api(DB, '/api/admin/training/candidates', 'GET'))).body.candidates
  assert.deepEqual(candidates.map((candidate) => candidate.application_id), ['candidate-a'])
  const rejected = await json(await api(DB, '/api/admin/training/candidates/candidate-b/sessions', 'POST', { session_number: 1, pose_count: 5 }))
  assert.equal(rejected.status, 404)
  assert.equal(rejected.body.code, 'CANDIDATE_NOT_FOUND')
})

test('training calendar creates, lists and updates candidate appointments', async () => {
  const DB = database()
  const created = await json(await api(DB, '/api/admin/training/appointments', 'POST', {
    candidate_id: 'candidate-a',
    scheduled_at: '2026-09-10T14:30:00+08:00',
    duration_minutes: 90,
    status: 'SCHEDULED',
    location: 'Nexa Studio',
    notes: 'Bring activewear.',
  }))
  assert.equal(created.status, 201)
  const calendar = await json(await api(DB, '/api/admin/training/calendar?from=2026-09-01&to=2026-09-30', 'GET'))
  assert.equal(calendar.body.appointments.length, 1)
  assert.equal(calendar.body.appointments[0].full_name, 'Aisha Trainee')
  assert.equal(calendar.body.appointments[0].scheduled_at, '2026-09-10T14:30:00+08:00')
  assert.equal(calendar.body.appointments[0].profile_photo_url, '/applications/candidate-a/front.jpg')

  const updated = await json(await api(DB, `/api/admin/training/appointments/${created.body.appointment_id}`, 'PATCH', {
    candidate_id: 'candidate-a',
    scheduled_at: '2026-09-11T10:00:00+08:00',
    duration_minutes: 120,
    status: 'CONFIRMED',
    location: 'Online',
    notes: '',
  }))
  assert.equal(updated.status, 200)
  const stored = DB.raw.prepare('SELECT scheduled_at, duration_minutes, status FROM training_appointments WHERE id = ?').get(created.body.appointment_id)
  assert.deepEqual({ ...stored }, { scheduled_at: '2026-09-11T10:00:00+08:00', duration_minutes: 120, status: 'CONFIRMED' })

  const ineligible = await json(await api(DB, '/api/admin/training/appointments', 'POST', {
    candidate_id: 'candidate-b', scheduled_at: '2026-09-12T10:00:00+08:00', duration_minutes: 60,
  }))
  assert.equal(ineligible.status, 404)
})

test('training enforces sequence, retains redo history and supports unlimited video attempts', async () => {
  const DB = database()
  assert.equal((await api(DB, '/api/admin/training/candidates/candidate-a/sessions', 'POST', { session_number: 1, pose_count: 5 })).status, 201)
  let overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const session = overview.sessions[0]
  assert.deepEqual(session.poses.map((pose) => pose.status), ['LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED'])
  assert.equal((await api(DB, `/api/admin/training/poses/${session.poses[1].id}/start`)).status, 409)

  await api(DB, `/api/admin/training/sessions/${session.id}/start`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  assert.deepEqual(overview.sessions[0].poses.map((pose) => pose.status), ['NOT_STARTED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED'])
  const pose = overview.sessions[0].poses[0]
  await api(DB, `/api/admin/training/poses/${pose.id}/start`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  let current = overview.sessions[0].poses[0]
  const firstAttempt = current.pose_attempts[0]
  const redo = await json(await api(DB, `/api/admin/training/attempts/${firstAttempt.id}`, 'PATCH', { status: 'REDO_REQUIRED', redo_reasons: ['HAND_PLACEMENT'], internal_admin_note: 'Move hand lower.' }))
  assert.equal(redo.body.next_attempt.attempt_number, 2)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  current = overview.sessions[0].poses[0]
  assert.deepEqual(current.pose_attempts.map((attempt) => attempt.status), ['REDO_REQUIRED', 'PENDING'])
  await api(DB, `/api/admin/training/attempts/${current.pose_attempts[1].id}`, 'PATCH', { status: 'APPROVED', redo_reasons: [] })

  await api(DB, `/api/admin/training/poses/${pose.id}/evaluation`, 'PATCH', { video_required: true, internal_admin_note: 'Never public', trainee_feedback: 'Good improvement.', pose_accuracy: 4 })
  await api(DB, `/api/admin/training/poses/${pose.id}/videos`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  current = overview.sessions[0].poses[0]
  await api(DB, `/api/admin/training/videos/${current.video_attempts[0].id}`, 'PATCH', { status: 'INVALID', invalid_reason: 'EDITED_OR_TRIMMED_VIDEO', redo_reasons: [], raw_footage_verified: false })
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  current = overview.sessions[0].poses[0]
  assert.equal(current.video_attempts.length, 2)
  assert.equal(current.video_attempts[0].raw_footage_verified, false)
  await api(DB, `/api/admin/training/videos/${current.video_attempts[1].id}`, 'PATCH', { status: 'APPROVED', redo_reasons: [], raw_footage_verified: true })
  await api(DB, `/api/admin/training/poses/${pose.id}/videos`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  assert.equal(overview.sessions[0].poses[0].video_attempts.length, 3)

  const invalidScore = await api(DB, `/api/admin/training/poses/${pose.id}/evaluation`, 'PATCH', { pose_accuracy: 6 })
  assert.equal(invalidScore.status, 400)
  await api(DB, `/api/admin/training/poses/${pose.id}/complete`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  assert.equal(overview.sessions[0].poses[0].status, 'COMPLETED')
  assert.equal(overview.sessions[0].poses[1].status, 'NOT_STARTED')
  assert.equal((await api(DB, `/api/admin/training/sessions/${session.id}/complete`)).status, 409)
})

test('publication and hashed progress links expose only published trainee-safe data', async () => {
  const DB = database()
  await api(DB, '/api/admin/training/candidates/candidate-a/sessions', 'POST', { session_number: 1, pose_count: 1 })
  let overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const session = overview.sessions[0]
  await api(DB, `/api/admin/training/sessions/${session.id}/start`)
  await api(DB, `/api/admin/training/poses/${session.poses[0].id}/start`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const pose = overview.sessions[0].poses[0]
  await api(DB, `/api/admin/training/attempts/${pose.pose_attempts[0].id}`, 'PATCH', { status: 'APPROVED', redo_reasons: [] })
  await api(DB, `/api/admin/training/poses/${pose.id}/evaluation`, 'PATCH', { pose_accuracy: 5, internal_admin_note: 'Secret pose note', trainee_feedback: 'Excellent control.' })
  await api(DB, `/api/admin/training/poses/${pose.id}/complete`)
  await api(DB, `/api/admin/training/sessions/${session.id}/complete`)
  await api(DB, `/api/admin/training/sessions/${session.id}/evaluation`, 'PATCH', { trainee_session_summary: 'Published summary', session_strengths: 'Control', internal_session_note: 'Secret session note' })

  const generated = await json(await api(DB, '/api/admin/training/candidates/candidate-a/progress-link/generate'))
  const token = generated.body.progress_url.split('/').at(-1)
  const stored = DB.raw.prepare('SELECT token_hash FROM candidate_progress_links WHERE candidate_id = ?').get('candidate-a')
  assert.notEqual(stored.token_hash, token)
  assert.equal(stored.token_hash, await hashProgressToken(token))
  assert.deepEqual((await getPublicCandidateProgress(DB, token)).trainingSessions, [])

  await api(DB, `/api/admin/training/sessions/${session.id}/ready`)
  await api(DB, `/api/admin/training/sessions/${session.id}/publish`)
  const published = await getPublicCandidateProgress(DB, token)
  assert.equal(published.candidateDisplayName, 'Aisha Trainee')
  assert.equal(published.trainingSessions.length, 1)
  assert.equal(published.trainingSessions[0].poseResults[0].scores.pose_accuracy, 5)
  assert.equal(JSON.stringify(published).includes('Secret'), false)
  assert.equal(JSON.stringify(published).includes('candidate-b'), false)

  await api(DB, '/api/admin/training/candidates/candidate-a/progress-link/revoke')
  assert.equal((await getPublicCandidateProgress(DB, token)).error, 'REVOKED_LINK')
  const regenerated = await json(await api(DB, '/api/admin/training/candidates/candidate-a/progress-link/regenerate'))
  const newToken = regenerated.body.progress_url.split('/').at(-1)
  assert.equal((await getPublicCandidateProgress(DB, token)).error, 'INVALID_LINK')
  assert.equal((await getPublicCandidateProgress(DB, newToken)).trainingSessions.length, 1)
  DB.raw.prepare("UPDATE candidate_progress_links SET expires_at = '2020-01-01 00:00:00' WHERE candidate_id = 'candidate-a'").run()
  assert.equal((await getPublicCandidateProgress(DB, newToken)).error, 'EXPIRED_LINK')
})

test('Admin can upload a private ImageKit reference image for every pose', async (context) => {
  const DB = database()
  await api(DB, '/api/admin/training/candidates/candidate-a/sessions', 'POST', { session_number: 1, pose_count: 1 })
  const overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const pose = overview.sessions[0].poses[0]
  context.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://upload.imagekit.io/api/v1/files/upload')
    assert.match(init.headers.Authorization, /^Basic /)
    return Response.json({ fileId: 'reference-file-1', url: '/nexa/training-references/session/pose-1.png' })
  })
  const form = new FormData()
  form.append('file', new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'reference.png', { type: 'image/png' }))
  const request = new Request(`https://onlyadmin.nexa-model.com/api/admin/training/poses/${pose.id}/reference`, { method: 'POST', body: form })
  const response = await handleTrainingApi(request, {
    DB, IMAGEKIT_PRIVATE_KEY: 'private_test_key', IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/test',
  }, new URL(request.url), { email: 'admin@example.test' })
  assert.equal(response.status, 201)
  const stored = DB.raw.prepare('SELECT reference_image_url, reference_storage_key FROM training_poses WHERE id = ?').get(pose.id)
  assert.deepEqual({ ...stored }, { reference_image_url: '/nexa/training-references/session/pose-1.png', reference_storage_key: 'reference-file-1' })
})

test('resetting one pose evaluation clears its inputs and all attempt history', async () => {
  const DB = database()
  await api(DB, '/api/admin/training/candidates/candidate-a/sessions', 'POST', { session_number: 1, pose_count: 1 })
  let overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const session = overview.sessions[0]
  await api(DB, `/api/admin/training/sessions/${session.id}/start`)
  await api(DB, `/api/admin/training/poses/${session.poses[0].id}/start`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const pose = overview.sessions[0].poses[0]
  await api(DB, `/api/admin/training/attempts/${pose.pose_attempts[0].id}`, 'PATCH', { status: 'APPROVED', redo_reasons: [] })
  await api(DB, `/api/admin/training/poses/${pose.id}/evaluation`, 'PATCH', { pose_name: 'Custom pose', instructions: 'Custom instruction', internal_admin_note: 'Private note', pose_accuracy: 4 })
  const reset = await json(await api(DB, `/api/admin/training/poses/${pose.id}/reset-evaluation`))
  assert.equal(reset.body.attempts_removed, true)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const cleared = overview.sessions[0].poses[0]
  assert.equal(cleared.pose_name, 'Pose 1')
  assert.equal(cleared.instructions, '')
  assert.equal(cleared.internal_admin_note, '')
  assert.equal(cleared.pose_accuracy, null)
  assert.equal(cleared.status, 'NOT_STARTED')
  assert.equal(cleared.started_at, null)
  assert.equal(cleared.pose_attempts.length, 0)
  assert.equal(cleared.video_attempts.length, 0)
  assert.equal(overview.sessions[0].status, 'NOT_STARTED')
  assert.equal(overview.sessions[0].started_at, null)
  assert.equal(overview.sessions[0].completed_at, null)

  await api(DB, `/api/admin/training/sessions/${session.id}/start`)
  await api(DB, `/api/admin/training/poses/${pose.id}/start`)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  assert.ok(overview.sessions[0].started_at)
})

test('a later Not Started pose cannot bypass an earlier incomplete pose', async () => {
  const DB = database()
  await api(DB, '/api/admin/training/candidates/candidate-a/sessions', 'POST', { session_number: 1, pose_count: 3 })
  let overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const session = overview.sessions[0]
  await api(DB, `/api/admin/training/sessions/${session.id}/start`)
  DB.raw.prepare("UPDATE training_poses SET status = 'NOT_STARTED' WHERE training_session_id = ?").run(session.id)
  overview = (await json(await api(DB, '/api/admin/training/candidates/candidate-a', 'GET'))).body
  const secondPose = overview.sessions[0].poses[1]
  const response = await json(await api(DB, `/api/admin/training/poses/${secondPose.id}/start`))
  assert.equal(response.status, 409)
  assert.equal(response.body.code, 'EARLIER_POSES_INCOMPLETE')
})
