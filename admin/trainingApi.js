import { apiJson } from '../src/apiResponse.js'
import { createProgressToken, getTraineeSafeSession, hashProgressToken, parseList } from '../src/trainingProgress.js'
import ImageKit from '@imagekit/nodejs'

const POSE_REDO_REASONS = new Set(['POSE_ACCURACY', 'BODY_POSITION', 'HAND_PLACEMENT', 'LEG_POSITION', 'BODY_ANGLE', 'POSTURE', 'FACIAL_EXPRESSION', 'CAMERA_ANGLE', 'CAMERA_FRAMING', 'PRODUCT_VISIBILITY', 'REFERENCE_NOT_FOLLOWED', 'OTHER'])
const VIDEO_REDO_REASONS = new Set(['POSE_ACCURACY', 'TIMING', 'TRANSITION', 'BODY_CONTROL', 'BALANCE', 'POSE_STABILITY', 'FACIAL_EXPRESSION', 'FRAMING', 'CAMERA_AWARENESS', 'INSTRUCTION_NOT_FOLLOWED', 'EDITED_OR_TRIMMED_VIDEO', 'OTHER'])
const INVALID_REASONS = new Set(['WRONG_FILE', 'CORRUPTED_FILE', 'INCOMPLETE_SUBMISSION', 'UNUSABLE_SUBMISSION', 'EDITED_OR_TRIMMED_VIDEO', 'OTHER'])
const ATTEMPT_STATUSES = new Set(['APPROVED', 'REDO_REQUIRED', 'INVALID'])
const SCORE_FIELDS = ['pose_accuracy', 'facial_expression', 'product_presentation', 'body_control', 'feedback_responsiveness', 'movement_control', 'transition_quality', 'video_execution_consistency', 'instruction_compliance', 'camera_awareness', 'pose_stability']
const APPOINTMENT_STATUSES = new Set(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])

function error(message, code, status = 400) {
  return apiJson({ error: message, code }, { status })
}

function text(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max)
}

function jsonArray(value) {
  return parseList(value)
}

function validateReasons(value, allowed) {
  if (!Array.isArray(value) || value.some((reason) => !allowed.has(reason))) return null
  return [...new Set(value)]
}

function scoresFromBody(body) {
  const result = {}
  for (const field of SCORE_FIELDS) {
    const value = body?.[field]
    if (value === null || value === undefined || value === '') result[field] = null
    else if (!Number.isInteger(value) || value < 1 || value > 5) return null
    else result[field] = value
  }
  return result
}

async function readBody(request) {
  return request.json().catch(() => null)
}

function validSchedule(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?\+08:00$/.test(String(value || '')) && Number.isFinite(Date.parse(value))
}

async function listAppointments(env, url) {
  const from = text(url.searchParams.get('from'), 10)
  const to = text(url.searchParams.get('to'), 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return error('Choose a valid calendar date range.', 'VALIDATION_ERROR')
  const rows = await env.DB.prepare(`
    SELECT t.id, t.candidate_id, t.scheduled_at, t.duration_minutes, t.status, t.location, t.notes,
           t.created_by, t.created_at, t.updated_at, a.full_name, a.email, a.phone,
           (
             SELECT p.file_url
             FROM applicant_photos p
             WHERE p.application_id = a.application_id
             ORDER BY CASE WHEN p.photo_type = 'front_facing' OR p.photo_type LIKE 'front_facing_%' THEN 0 ELSE 1 END,
                      p.photo_type, p.file_name
             LIMIT 1
           ) AS profile_photo_url
    FROM training_appointments t
    JOIN applicants a ON a.application_id = t.candidate_id
    WHERE a.deleted_at IS NULL AND substr(t.scheduled_at, 1, 10) BETWEEN ? AND ?
    ORDER BY t.scheduled_at, a.full_name COLLATE NOCASE
  `).bind(from, to).all()
  return apiJson({
    appointments: rows.results.map(({ profile_photo_url: profilePhotoUrl, ...appointment }) => ({
      ...appointment,
      profile_photo_url: signedProfilePhotoUrl(env, profilePhotoUrl),
    })),
    time_zone: 'Asia/Kuala_Lumpur',
  })
}

async function saveAppointment(request, env, auth, appointmentId = null) {
  const body = await readBody(request)
  const candidateId = text(body?.candidate_id, 100)
  const scheduledAt = text(body?.scheduled_at, 40)
  const duration = Number(body?.duration_minutes ?? 90)
  const status = text(body?.status || 'SCHEDULED', 20).toUpperCase()
  if (!candidateId || !validSchedule(scheduledAt) || !Number.isInteger(duration) || duration < 15 || duration > 480 || !APPOINTMENT_STATUSES.has(status)) {
    return error('Candidate, Malaysia date and time, duration, and status are required.', 'VALIDATION_ERROR')
  }
  const candidate = await env.DB.prepare(`
    SELECT a.application_id FROM applicants a
    JOIN applicant_details d ON d.application_id = a.application_id
    WHERE a.application_id = ? AND a.deleted_at IS NULL AND d.application_status = 'contacted'
  `).bind(candidateId).first()
  if (!candidate) return error('Only contacted candidates can be scheduled for training.', 'CANDIDATE_NOT_FOUND', 404)
  const location = text(body?.location, 200)
  const notes = text(body?.notes, 2000)
  if (appointmentId) {
    const existing = await env.DB.prepare('SELECT id FROM training_appointments WHERE id = ?').bind(appointmentId).first()
    if (!existing) return error('Training appointment not found.', 'APPOINTMENT_NOT_FOUND', 404)
    await env.DB.prepare('UPDATE training_appointments SET candidate_id = ?, scheduled_at = ?, duration_minutes = ?, status = ?, location = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(candidateId, scheduledAt, duration, status, location, notes, appointmentId).run()
    return apiJson({ success: true, appointment_id: appointmentId })
  }
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO training_appointments (id, candidate_id, scheduled_at, duration_minutes, status, location, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, candidateId, scheduledAt, duration, status, location, notes, auth.email).run()
  return apiJson({ success: true, appointment_id: id }, { status: 201 })
}

async function getPose(DB, poseId) {
  return DB.prepare(`
    SELECT p.*, s.candidate_id, s.status AS session_status
    FROM training_poses p JOIN training_sessions s ON s.id = p.training_session_id
    WHERE p.id = ?
  `).bind(poseId).first()
}

function signedReferenceUrl(env, url) {
  if (!url || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) return url || null
  const imagekit = new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY })
  return imagekit.helper.buildSrc({ urlEndpoint: env.IMAGEKIT_URL_ENDPOINT, src: url, signed: true, expiresIn: 300 })
}

function signedProfilePhotoUrl(env, url) {
  if (!url || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) return url || null
  const imagekit = new ImageKit({ privateKey: env.IMAGEKIT_PRIVATE_KEY })
  return imagekit.helper.buildSrc({
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
    src: url,
    signed: true,
    expiresIn: 300,
    transformation: [{ width: 128, height: 128, quality: 75, format: 'webp' }],
  })
}

async function getTrainingOverview(env, candidateId) {
  const { DB } = env
  const candidate = await DB.prepare(`
    SELECT a.application_id, a.full_name, a.email, d.application_status
    FROM applicants a JOIN applicant_details d ON d.application_id = a.application_id
    WHERE a.application_id = ? AND a.deleted_at IS NULL AND d.application_status = 'contacted'
  `).bind(candidateId).first()
  if (!candidate) return null
  const sessions = (await DB.prepare(`
    SELECT s.*, e.status AS publication_status, e.evaluator_id, e.trainee_session_summary,
           e.session_strengths, e.session_areas_for_improvement, e.next_training_focus,
           e.internal_session_note, e.published_at
    FROM training_sessions s
    LEFT JOIN session_evaluations e ON e.training_session_id = s.id
    WHERE s.candidate_id = ? ORDER BY s.session_number
  `).bind(candidateId).all()).results

  for (const session of sessions) {
    session.poses = (await DB.prepare(`
      SELECT p.*, e.evaluator_id, e.pose_accuracy, e.facial_expression, e.product_presentation,
             e.body_control, e.feedback_responsiveness, e.movement_control, e.transition_quality,
             e.video_execution_consistency, e.instruction_compliance, e.camera_awareness, e.pose_stability
      FROM training_poses p LEFT JOIN pose_evaluations e ON e.training_pose_id = p.id
      WHERE p.training_session_id = ? ORDER BY p.pose_number
    `).bind(session.id).all()).results
    for (const pose of session.poses) {
      pose.video_required = Boolean(pose.video_required)
      pose.reference_image_url = signedReferenceUrl(env, pose.reference_image_url)
      pose.pose_attempts = (await DB.prepare('SELECT * FROM pose_attempts WHERE training_pose_id = ? ORDER BY attempt_number').bind(pose.id).all()).results.map((attempt) => ({ ...attempt, redo_reasons: jsonArray(attempt.redo_reasons_json) }))
      pose.video_attempts = (await DB.prepare('SELECT * FROM video_attempts WHERE training_pose_id = ? ORDER BY attempt_number').bind(pose.id).all()).results.map((attempt) => ({ ...attempt, redo_reasons: jsonArray(attempt.redo_reasons_json), raw_footage_verified: attempt.raw_footage_verified === null ? null : Boolean(attempt.raw_footage_verified) }))
    }
  }
  const progressLink = await DB.prepare('SELECT status, created_at, updated_at, last_accessed_at, revoked_at, expires_at FROM candidate_progress_links WHERE candidate_id = ?').bind(candidateId).first()
  return { candidate, sessions, progress_link: progressLink || null }
}

async function uploadPoseReference(request, env, poseId) {
  if (!env.IMAGEKIT_PRIVATE_KEY) return error('ImageKit is not configured for training reference uploads.', 'IMAGEKIT_NOT_CONFIGURED', 503)
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size <= 0 || file.size > 10 * 1024 * 1024) return error('Choose a PNG, JPEG or WebP image under 10 MB.', 'VALIDATION_ERROR')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const webp = bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  if (!png && !jpeg && !webp) return error('Choose a genuine PNG, JPEG or WebP image.', 'VALIDATION_ERROR')
  const extension = png ? 'png' : jpeg ? 'jpg' : 'webp'
  const upload = new FormData()
  upload.append('file', new File([file], `pose-${pose.pose_number}.${extension}`, { type: png ? 'image/png' : jpeg ? 'image/jpeg' : 'image/webp' }))
  upload.append('fileName', `training-${pose.training_session_id}-pose-${pose.pose_number}.${extension}`)
  upload.append('folder', `/nexa/training-references/${pose.training_session_id}`)
  upload.append('useUniqueFileName', 'true')
  upload.append('isPrivateFile', 'true')
  const authorization = `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}`
  const response = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', headers: { Authorization: authorization }, body: upload })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.fileId || !result.url) return error('ImageKit could not save the pose reference.', 'IMAGEKIT_ERROR', 502)
  await env.DB.prepare('UPDATE training_poses SET reference_image_url = ?, reference_storage_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(result.url, result.fileId, poseId).run()
  if (pose.reference_storage_key) fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(pose.reference_storage_key)}`, { method: 'DELETE', headers: { Authorization: authorization } }).catch(() => {})
  return apiJson({ success: true, reference_image_url: signedReferenceUrl(env, result.url) }, { status: 201 })
}

async function resetPoseEvaluation(env, poseId) {
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  const publication = await env.DB.prepare(`SELECT e.status FROM session_evaluations e JOIN training_sessions s ON s.id = e.training_session_id WHERE s.id = ?`).bind(pose.training_session_id).first()
  if (publication?.status === 'PUBLISHED') return error('Unpublish the training result before resetting a pose evaluation.', 'EVALUATION_PUBLISHED', 409)
  await env.DB.batch([
    env.DB.prepare(`UPDATE training_poses SET pose_name = ?, status = CASE WHEN EXISTS (SELECT 1 FROM training_poses earlier WHERE earlier.training_session_id = ? AND earlier.pose_number < ? AND earlier.status <> 'COMPLETED') THEN 'LOCKED' ELSE 'NOT_STARTED' END, instructions = '', video_instructions = '', reference_image_url = NULL, reference_storage_key = NULL, video_required = 0, internal_admin_note = '', trainee_feedback = '', started_at = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(`Pose ${pose.pose_number}`, pose.training_session_id, pose.pose_number, poseId),
    env.DB.prepare('DELETE FROM pose_evaluations WHERE training_pose_id = ?').bind(poseId),
    env.DB.prepare('DELETE FROM pose_attempts WHERE training_pose_id = ?').bind(poseId),
    env.DB.prepare('DELETE FROM video_attempts WHERE training_pose_id = ?').bind(poseId),
    env.DB.prepare("UPDATE training_sessions SET status = 'NOT_STARTED', started_at = NULL, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(pose.training_session_id),
  ])
  if (pose.reference_storage_key && env.IMAGEKIT_PRIVATE_KEY) {
    const authorization = `Basic ${btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`)}`
    fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(pose.reference_storage_key)}`, { method: 'DELETE', headers: { Authorization: authorization } }).catch(() => {})
  }
  return apiJson({ success: true, attempts_removed: true })
}

async function createSession(request, env, candidateId, evaluatorId) {
  const body = await readBody(request)
  const sessionNumber = Number(body?.session_number)
  const poseCount = body?.pose_count === undefined ? 5 : Number(body.pose_count)
  if (!Number.isInteger(sessionNumber) || sessionNumber < 1 || !Number.isInteger(poseCount) || poseCount < 1 || poseCount > 20) return error('Session and pose numbers must be positive.', 'VALIDATION_ERROR')
  const candidate = await env.DB.prepare(`SELECT a.application_id FROM applicants a JOIN applicant_details d ON d.application_id = a.application_id WHERE a.application_id = ? AND a.deleted_at IS NULL AND d.application_status = 'contacted'`).bind(candidateId).first()
  if (!candidate) return error('Candidate not found.', 'CANDIDATE_NOT_FOUND', 404)
  const sessionId = crypto.randomUUID()
  const statements = [
    env.DB.prepare('INSERT INTO training_sessions (id, candidate_id, session_number) VALUES (?, ?, ?)').bind(sessionId, candidateId, sessionNumber),
    env.DB.prepare('INSERT INTO session_evaluations (training_session_id, evaluator_id) VALUES (?, ?)').bind(sessionId, evaluatorId),
  ]
  for (let index = 1; index <= poseCount; index += 1) {
    statements.push(env.DB.prepare(`INSERT INTO training_poses (id, training_session_id, pose_number, pose_name, status) VALUES (?, ?, ?, ?, 'LOCKED')`).bind(crypto.randomUUID(), sessionId, index, body?.pose_names?.[index - 1] || `Pose ${index}`))
  }
  try {
    await env.DB.batch(statements)
  } catch (exception) {
    if (/unique/i.test(String(exception))) return error('That training session already exists.', 'SESSION_EXISTS', 409)
    throw exception
  }
  return apiJson({ success: true, session_id: sessionId }, { status: 201 })
}

async function startSession(env, sessionId) {
  const session = await env.DB.prepare('SELECT status FROM training_sessions WHERE id = ?').bind(sessionId).first()
  if (!session) return error('Training session not found.', 'SESSION_NOT_FOUND', 404)
  if (session.status !== 'NOT_STARTED') return error('Only a not-started session can be started.', 'INVALID_STATUS_TRANSITION', 409)
  await env.DB.batch([
    env.DB.prepare("UPDATE training_sessions SET status = 'IN_PROGRESS', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sessionId),
    env.DB.prepare("UPDATE training_poses SET status = CASE WHEN status = 'COMPLETED' THEN 'COMPLETED' WHEN pose_number = (SELECT MIN(next_pose.pose_number) FROM training_poses next_pose WHERE next_pose.training_session_id = ? AND next_pose.status <> 'COMPLETED') THEN 'NOT_STARTED' ELSE 'LOCKED' END, updated_at = CURRENT_TIMESTAMP WHERE training_session_id = ?").bind(sessionId, sessionId),
  ])
  return apiJson({ success: true })
}

async function startPose(env, poseId) {
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  if (!['NOT_STARTED', 'REDO_REQUIRED'].includes(pose.status) || pose.session_status !== 'IN_PROGRESS') return error('This pose cannot be started yet.', 'INVALID_STATUS_TRANSITION', 409)
  const earlierIncomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM training_poses WHERE training_session_id = ? AND pose_number < ? AND status <> 'COMPLETED'").bind(pose.training_session_id, pose.pose_number).first()
  if (Number(earlierIncomplete.count) > 0) return error('Complete the earlier poses before starting this pose.', 'EARLIER_POSES_INCOMPLETE', 409)
  const existing = await env.DB.prepare('SELECT id FROM pose_attempts WHERE training_pose_id = ? AND status = ?').bind(poseId, 'PENDING').first()
  const statements = [
    env.DB.prepare("UPDATE training_poses SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(poseId),
    env.DB.prepare('UPDATE training_sessions SET started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(pose.training_session_id),
  ]
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM pose_attempts WHERE training_pose_id = ?').bind(poseId).first()
    statements.push(env.DB.prepare('INSERT INTO pose_attempts (id, training_pose_id, attempt_number) VALUES (?, ?, ?)').bind(crypto.randomUUID(), poseId, Number(count.count) + 1))
  }
  await env.DB.batch(statements)
  return apiJson({ success: true })
}

async function createAttempt(env, poseId, video = false) {
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  if (['LOCKED', 'NOT_STARTED', 'COMPLETED'].includes(pose.status)) return error('Start the pose before recording an attempt.', 'INVALID_STATUS_TRANSITION', 409)
  const table = video ? 'video_attempts' : 'pose_attempts'
  const pending = await env.DB.prepare(`SELECT id FROM ${table} WHERE training_pose_id = ? AND status = 'PENDING'`).bind(poseId).first()
  if (pending) return error('A pending attempt already exists.', 'PENDING_ATTEMPT_EXISTS', 409)
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE training_pose_id = ?`).bind(poseId).first()
  const id = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO ${table} (id, training_pose_id, attempt_number) VALUES (?, ?, ?)`).bind(id, poseId, Number(count.count) + 1).run()
  return apiJson({ success: true, attempt_id: id, attempt_number: Number(count.count) + 1 }, { status: 201 })
}

async function reviewAttempt(request, env, attemptId, video = false) {
  const body = await readBody(request)
  if (!ATTEMPT_STATUSES.has(body?.status)) return error('Choose Approved, Redo required or Invalid.', 'VALIDATION_ERROR')
  const table = video ? 'video_attempts' : 'pose_attempts'
  const attempt = await env.DB.prepare(`SELECT a.*, p.status AS pose_status FROM ${table} a JOIN training_poses p ON p.id = a.training_pose_id WHERE a.id = ?`).bind(attemptId).first()
  if (!attempt) return error('Attempt not found.', 'ATTEMPT_NOT_FOUND', 404)
  if (attempt.status !== 'PENDING') return error('Reviewed attempts cannot be overwritten.', 'ATTEMPT_ALREADY_REVIEWED', 409)
  const allowedReasons = video ? VIDEO_REDO_REASONS : POSE_REDO_REASONS
  const reasons = validateReasons(body.redo_reasons || [], allowedReasons)
  if (!reasons) return error('One or more redo reasons are invalid.', 'VALIDATION_ERROR')
  const invalidReason = body.status === 'INVALID' ? text(body.invalid_reason, 100) : ''
  if (body.status === 'INVALID' && !INVALID_REASONS.has(invalidReason)) return error('Choose a valid reason for the invalid attempt.', 'VALIDATION_ERROR')
  if (video && body.raw_footage_verified !== null && body.raw_footage_verified !== undefined && typeof body.raw_footage_verified !== 'boolean') return error('RAW verification must be yes, no or not reviewed.', 'VALIDATION_ERROR')
  const poseStatus = body.status === 'APPROVED' && !video ? 'APPROVED' : body.status === 'APPROVED' ? attempt.pose_status : 'REDO_REQUIRED'
  const statements = [
    env.DB.prepare(`UPDATE ${table} SET status = ?, redo_reasons_json = ?, invalid_reason = ?, internal_admin_note = ?, ${video ? 'raw_footage_verified = ?,' : ''} reviewed_at = CURRENT_TIMESTAMP, submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(...(video ? [body.status, JSON.stringify(reasons), invalidReason || null, text(body.internal_admin_note), body.raw_footage_verified === null || body.raw_footage_verified === undefined ? null : Number(body.raw_footage_verified), attemptId] : [body.status, JSON.stringify(reasons), invalidReason || null, text(body.internal_admin_note), attemptId])),
    env.DB.prepare('UPDATE training_poses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(poseStatus, attempt.training_pose_id),
  ]
  let nextAttempt = null
  if (body.status !== 'APPROVED' && body.create_next_attempt !== false) {
    const id = crypto.randomUUID()
    nextAttempt = { id, attempt_number: Number(attempt.attempt_number) + 1 }
    statements.push(env.DB.prepare(`INSERT INTO ${table} (id, training_pose_id, attempt_number) VALUES (?, ?, ?)`).bind(id, attempt.training_pose_id, nextAttempt.attempt_number))
  }
  await env.DB.batch(statements)
  return apiJson({ success: true, next_attempt: nextAttempt })
}

async function savePose(request, env, poseId, evaluatorId) {
  const body = await readBody(request)
  const scores = scoresFromBody(body)
  if (!scores) return error('Scores must be blank or an integer from 1 to 5.', 'INVALID_SCORE')
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  await env.DB.batch([
    env.DB.prepare(`UPDATE training_poses SET pose_name = ?, instructions = ?, video_instructions = ?, video_required = ?, internal_admin_note = ?, trainee_feedback = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(text(body.pose_name, 120) || pose.pose_name, text(body.instructions), text(body.video_instructions), Number(Boolean(body.video_required)), text(body.internal_admin_note), poseId),
    env.DB.prepare(`INSERT INTO pose_evaluations (training_pose_id, evaluator_id, ${SCORE_FIELDS.join(', ')}) VALUES (?, ?, ${SCORE_FIELDS.map(() => '?').join(', ')}) ON CONFLICT(training_pose_id) DO UPDATE SET evaluator_id = excluded.evaluator_id, ${SCORE_FIELDS.map((field) => `${field} = excluded.${field}`).join(', ')}, updated_at = CURRENT_TIMESTAMP`).bind(poseId, evaluatorId, ...SCORE_FIELDS.map((field) => scores[field])),
  ])
  return apiJson({ success: true })
}

async function completePose(request, env, poseId) {
  const body = await readBody(request)
  const pose = await getPose(env.DB, poseId)
  if (!pose) return error('Training pose not found.', 'POSE_NOT_FOUND', 404)
  const approvedStatic = await env.DB.prepare("SELECT id FROM pose_attempts WHERE training_pose_id = ? AND status = 'APPROVED' LIMIT 1").bind(poseId).first()
  const approvedVideo = await env.DB.prepare("SELECT id FROM video_attempts WHERE training_pose_id = ? AND status = 'APPROVED' LIMIT 1").bind(poseId).first()
  if (!body?.override && (!approvedStatic || (pose.video_required && !approvedVideo))) return error('Approve the static attempt and any required video before completing this pose.', 'POSE_REQUIREMENTS_INCOMPLETE', 409)
  const nextPose = await env.DB.prepare('SELECT id FROM training_poses WHERE training_session_id = ? AND pose_number = ?').bind(pose.training_session_id, Number(pose.pose_number) + 1).first()
  const statements = [env.DB.prepare("UPDATE training_poses SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(poseId)]
  if (nextPose) statements.push(env.DB.prepare("UPDATE training_poses SET status = 'NOT_STARTED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'LOCKED'").bind(nextPose.id))
  await env.DB.batch(statements)
  return apiJson({ success: true, unlocked_pose_id: nextPose?.id || null })
}

async function completeSession(request, env, sessionId) {
  const body = await readBody(request)
  const session = await env.DB.prepare('SELECT status FROM training_sessions WHERE id = ?').bind(sessionId).first()
  if (!session) return error('Training session not found.', 'SESSION_NOT_FOUND', 404)
  const incomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM training_poses WHERE training_session_id = ? AND status <> 'COMPLETED'").bind(sessionId).first()
  if (!body?.override && Number(incomplete.count) > 0) return error('Complete every pose before completing this session.', 'SESSION_POSES_INCOMPLETE', 409)
  await env.DB.prepare("UPDATE training_sessions SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sessionId).run()
  return apiJson({ success: true })
}

async function saveSessionEvaluation(request, env, sessionId, evaluatorId) {
  const body = await readBody(request)
  const session = await env.DB.prepare('SELECT id FROM training_sessions WHERE id = ?').bind(sessionId).first()
  if (!session) return error('Training session not found.', 'SESSION_NOT_FOUND', 404)
  await env.DB.prepare(`UPDATE session_evaluations SET evaluator_id = ?, trainee_session_summary = ?, session_strengths = ?, session_areas_for_improvement = ?, next_training_focus = ?, internal_session_note = ?, updated_at = CURRENT_TIMESTAMP WHERE training_session_id = ?`).bind(evaluatorId, text(body?.trainee_session_summary), text(body?.session_strengths), text(body?.session_areas_for_improvement), text(body?.next_training_focus), text(body?.internal_session_note), sessionId).run()
  return apiJson({ success: true })
}

async function publicationAction(env, sessionId, action) {
  const row = await env.DB.prepare(`SELECT s.status AS session_status, e.status FROM training_sessions s JOIN session_evaluations e ON e.training_session_id = s.id WHERE s.id = ?`).bind(sessionId).first()
  if (!row) return error('Training session not found.', 'SESSION_NOT_FOUND', 404)
  if (action === 'ready' && row.session_status !== 'COMPLETED') return error('Complete the training session before preparing publication.', 'SESSION_NOT_COMPLETED', 409)
  if (action === 'publish' && row.status !== 'READY_TO_PUBLISH') return error('Mark the evaluation ready and preview it before publishing.', 'EVALUATION_NOT_READY', 409)
  const status = action === 'publish' ? 'PUBLISHED' : action === 'unpublish' ? 'DRAFT' : 'READY_TO_PUBLISH'
  await env.DB.prepare(`UPDATE session_evaluations SET status = ?, published_at = ${action === 'publish' ? 'CURRENT_TIMESTAMP' : 'NULL'}, updated_at = CURRENT_TIMESTAMP WHERE training_session_id = ?`).bind(status, sessionId).run()
  return apiJson({ success: true, status })
}

async function progressLinkAction(request, env, candidateId, action) {
  const candidate = await env.DB.prepare('SELECT application_id FROM applicants WHERE application_id = ? AND deleted_at IS NULL').bind(candidateId).first()
  if (!candidate) return error('Candidate not found.', 'CANDIDATE_NOT_FOUND', 404)
  if (action === 'revoke') {
    await env.DB.prepare("UPDATE candidate_progress_links SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE candidate_id = ?").bind(candidateId).run()
    return apiJson({ success: true, status: 'REVOKED' })
  }
  const body = await readBody(request)
  const expiresAt = body?.expires_at || null
  if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return error('Expiry must be a valid date.', 'VALIDATION_ERROR')
  const token = createProgressToken()
  const tokenHash = await hashProgressToken(token)
  const id = crypto.randomUUID()
  await env.DB.prepare(`INSERT INTO candidate_progress_links (id, candidate_id, token_hash, status, expires_at) VALUES (?, ?, ?, 'ACTIVE', ?) ON CONFLICT(candidate_id) DO UPDATE SET id = excluded.id, token_hash = excluded.token_hash, status = 'ACTIVE', expires_at = excluded.expires_at, revoked_at = NULL, last_accessed_at = NULL, updated_at = CURRENT_TIMESTAMP`).bind(id, candidateId, tokenHash, expiresAt).run()
  const base = env.PUBLIC_SITE_URL || 'https://nexa-model.com'
  return apiJson({ success: true, status: 'ACTIVE', progress_url: `${base}/progress/${token}`, shown_once: true }, { status: action === 'generate' ? 201 : 200 })
}

export async function handleTrainingApi(request, env, url, auth) {
  if (url.pathname === '/api/admin/training/calendar' && request.method === 'GET') return listAppointments(env, url)
  if (url.pathname === '/api/admin/training/appointments' && request.method === 'POST') return saveAppointment(request, env, auth)
  const appointmentMatch = url.pathname.match(/^\/api\/admin\/training\/appointments\/([^/]+)$/)
  if (appointmentMatch && request.method === 'PATCH') return saveAppointment(request, env, auth, appointmentMatch[1])

  if (url.pathname === '/api/admin/training/candidates' && request.method === 'GET') {
    const rows = await env.DB.prepare(`SELECT a.application_id, a.full_name, a.email, d.application_status FROM applicants a JOIN applicant_details d ON d.application_id = a.application_id WHERE a.deleted_at IS NULL AND d.application_status = 'contacted' ORDER BY a.full_name COLLATE NOCASE`).all()
    return apiJson({ candidates: rows.results })
  }

  let match = url.pathname.match(/^\/api\/admin\/training\/candidates\/([^/]+)$/)
  if (match && request.method === 'GET') {
    const overview = await getTrainingOverview(env, decodeURIComponent(match[1]))
    return overview ? apiJson(overview) : error('Candidate not found.', 'CANDIDATE_NOT_FOUND', 404)
  }
  match = url.pathname.match(/^\/api\/admin\/training\/candidates\/([^/]+)\/sessions$/)
  if (match && request.method === 'POST') return createSession(request, env, decodeURIComponent(match[1]), auth.email)
  match = url.pathname.match(/^\/api\/admin\/training\/candidates\/([^/]+)\/progress-link\/(generate|regenerate|revoke)$/)
  if (match && request.method === 'POST') return progressLinkAction(request, env, decodeURIComponent(match[1]), match[2])

  match = url.pathname.match(/^\/api\/admin\/training\/sessions\/([^/]+)\/(start|complete|ready|publish|unpublish|preview)$/)
  if (match && request.method === 'POST') {
    const [, sessionId, action] = match
    if (action === 'start') return startSession(env, sessionId)
    if (action === 'complete') return completeSession(request, env, sessionId)
    if (action === 'preview') {
      const result = await getTraineeSafeSession(env.DB, sessionId, { publishedOnly: false })
      return result ? apiJson({ session: result }) : error('Training session not found.', 'SESSION_NOT_FOUND', 404)
    }
    return publicationAction(env, sessionId, action)
  }
  match = url.pathname.match(/^\/api\/admin\/training\/sessions\/([^/]+)\/evaluation$/)
  if (match && request.method === 'PATCH') return saveSessionEvaluation(request, env, match[1], auth.email)

  match = url.pathname.match(/^\/api\/admin\/training\/poses\/([^/]+)\/(start|complete|attempts|videos|evaluation)$/)
  if (match) {
    const [, poseId, action] = match
    if (action === 'start' && request.method === 'POST') return startPose(env, poseId)
    if (action === 'complete' && request.method === 'POST') return completePose(request, env, poseId)
    if (action === 'attempts' && request.method === 'POST') return createAttempt(env, poseId, false)
    if (action === 'videos' && request.method === 'POST') return createAttempt(env, poseId, true)
    if (action === 'evaluation' && request.method === 'PATCH') return savePose(request, env, poseId, auth.email)
  }
  match = url.pathname.match(/^\/api\/admin\/training\/poses\/([^/]+)\/reference$/)
  if (match && request.method === 'POST') return uploadPoseReference(request, env, match[1])
  match = url.pathname.match(/^\/api\/admin\/training\/poses\/([^/]+)\/reset-evaluation$/)
  if (match && request.method === 'POST') return resetPoseEvaluation(env, match[1])
  match = url.pathname.match(/^\/api\/admin\/training\/(attempts|videos)\/([^/]+)$/)
  if (match && request.method === 'PATCH') return reviewAttempt(request, env, match[2], match[1] === 'videos')
  return null
}

export { getTrainingOverview, scoresFromBody }
