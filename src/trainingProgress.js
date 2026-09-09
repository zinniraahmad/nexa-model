const TOKEN_BYTES = 32

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function createProgressToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)))
}

export async function hashProgressToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function parseList(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite)
  return numbers.length ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100 : null
}

function secondsBetween(start, end) {
  if (!start || !end) return null
  const seconds = (new Date(`${end.replace(' ', 'T')}Z`) - new Date(`${start.replace(' ', 'T')}Z`)) / 1000
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : null
}

async function safeSessionResult(DB, session) {
  const poses = (await DB.prepare(`
    SELECT p.id, p.pose_number, p.pose_name, p.started_at, p.completed_at,
           e.pose_accuracy, e.facial_expression, e.product_presentation, e.body_control,
           e.feedback_responsiveness, e.movement_control, e.transition_quality,
           e.video_execution_consistency, e.instruction_compliance, e.camera_awareness, e.pose_stability
    FROM training_poses p
    LEFT JOIN pose_evaluations e ON e.training_pose_id = p.id
    WHERE p.training_session_id = ? AND p.status = 'COMPLETED'
    ORDER BY p.pose_number
  `).bind(session.id).all()).results

  const poseResults = []
  for (const pose of poses) {
    const attempts = (await DB.prepare(`SELECT status FROM pose_attempts WHERE training_pose_id = ? ORDER BY attempt_number`).bind(pose.id).all()).results
    const videos = (await DB.prepare(`SELECT status FROM video_attempts WHERE training_pose_id = ? ORDER BY attempt_number`).bind(pose.id).all()).results
    const scoreKeys = ['pose_accuracy', 'facial_expression', 'product_presentation', 'body_control', 'feedback_responsiveness', 'movement_control', 'transition_quality', 'video_execution_consistency', 'instruction_compliance', 'camera_awareness', 'pose_stability']
    poseResults.push({
      poseNumber: Number(pose.pose_number),
      poseName: pose.pose_name,
      scores: Object.fromEntries(scoreKeys.filter((key) => pose[key] !== null && pose[key] !== undefined).map((key) => [key, Number(pose[key])])),
      metrics: {
        attemptCount: attempts.length,
        redoCount: attempts.filter((item) => item.status === 'REDO_REQUIRED').length,
        firstAttemptSuccess: attempts.find((item) => item.status !== 'INVALID')?.status === 'APPROVED',
        completionSeconds: secondsBetween(pose.started_at, pose.completed_at),
        videoAttemptCount: videos.length,
        invalidVideoCount: videos.filter((item) => item.status === 'INVALID').length,
      },
    })
  }

  const attempts = poseResults.map((pose) => pose.metrics.attemptCount)
  const completionTimes = poseResults.map((pose) => pose.metrics.completionSeconds).filter((value) => value !== null)
  const scoreAverages = {}
  for (const key of ['pose_accuracy', 'facial_expression', 'product_presentation', 'body_control', 'feedback_responsiveness']) {
    const value = average(poseResults.map((pose) => pose.scores[key]).filter((score) => score !== undefined))
    if (value !== null) scoreAverages[key] = value
  }

  return {
    sessionNumber: Number(session.session_number),
    sessionStatus: session.status,
    publicationStatus: session.publication_status,
    publishedAt: session.published_at,
    summary: session.trainee_session_summary || '',
    strengths: session.session_strengths || '',
    areasForImprovement: session.session_areas_for_improvement || '',
    nextTrainingFocus: session.next_training_focus || '',
    poseResults,
    performanceMetrics: {
      posesCompleted: poseResults.length,
      totalPoseAttempts: attempts.reduce((sum, value) => sum + value, 0),
      totalRedos: poseResults.reduce((sum, pose) => sum + pose.metrics.redoCount, 0),
      firstAttemptSuccessCount: poseResults.filter((pose) => pose.metrics.firstAttemptSuccess).length,
      averageAttempts: average(attempts),
      averageCompletionSeconds: average(completionTimes),
      totalVideoAttempts: poseResults.reduce((sum, pose) => sum + pose.metrics.videoAttemptCount, 0),
      invalidVideoCount: poseResults.reduce((sum, pose) => sum + pose.metrics.invalidVideoCount, 0),
      scoreAverages,
    },
  }
}

export async function getTraineeSafeSession(DB, sessionId, { publishedOnly = true } = {}) {
  const condition = publishedOnly ? "AND e.status = 'PUBLISHED'" : ''
  const session = await DB.prepare(`
    SELECT s.id, s.session_number, s.status, e.status AS publication_status, e.published_at,
           e.trainee_session_summary, e.session_strengths, e.session_areas_for_improvement, e.next_training_focus
    FROM training_sessions s
    JOIN session_evaluations e ON e.training_session_id = s.id
    WHERE s.id = ? ${condition}
  `).bind(sessionId).first()
  return session ? safeSessionResult(DB, session) : null
}

export async function getPublicCandidateProgress(DB, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ''))) return { error: 'INVALID_LINK' }
  const tokenHash = await hashProgressToken(token)
  const link = await DB.prepare(`
    SELECT l.id, l.candidate_id, l.status, l.expires_at, a.full_name
    FROM candidate_progress_links l
    JOIN applicants a ON a.application_id = l.candidate_id
    WHERE l.token_hash = ? AND a.deleted_at IS NULL
  `).bind(tokenHash).first()
  if (!link) return { error: 'INVALID_LINK' }
  if (link.status !== 'ACTIVE') return { error: 'REVOKED_LINK' }
  if (link.expires_at && new Date(`${link.expires_at.replace(' ', 'T')}Z`).getTime() <= Date.now()) return { error: 'EXPIRED_LINK' }

  const sessions = (await DB.prepare(`
    SELECT s.id, s.session_number, s.status, e.status AS publication_status, e.published_at,
           e.trainee_session_summary, e.session_strengths, e.session_areas_for_improvement, e.next_training_focus
    FROM training_sessions s
    JOIN session_evaluations e ON e.training_session_id = s.id
    WHERE s.candidate_id = ? AND e.status = 'PUBLISHED'
    ORDER BY s.session_number
  `).bind(link.candidate_id).all()).results
  const trainingSessions = []
  for (const session of sessions) trainingSessions.push(await safeSessionResult(DB, session))
  await DB.prepare('UPDATE candidate_progress_links SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?').bind(link.id).run()

  return {
    candidateDisplayName: link.full_name,
    overallTrainingStatus: trainingSessions.length >= 4 ? 'COMPLETE' : trainingSessions.length ? 'IN_PROGRESS' : 'NOT_STARTED',
    trainingSessions,
    progressComparison: trainingSessions.map((session) => ({
      sessionNumber: session.sessionNumber,
      averageAttempts: session.performanceMetrics.averageAttempts,
      averageCompletionSeconds: session.performanceMetrics.averageCompletionSeconds,
      ...session.performanceMetrics.scoreAverages,
    })),
  }
}

export { parseList }
