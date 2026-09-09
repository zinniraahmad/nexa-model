import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'])

function detectedMediaType(filePath) {
  const handle = fs.openSync(filePath, 'r')
  const bytes = Buffer.alloc(24)
  let length
  try { length = fs.readSync(handle, bytes, 0, bytes.length, 0) } finally { fs.closeSync(handle) }
  const header = bytes.subarray(0, length)
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'IMAGE'
  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'IMAGE'
  if (header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a') return 'IMAGE'
  if (header.subarray(0, 2).toString('ascii') === 'BM') return 'IMAGE'
  if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') return 'IMAGE'
  if (header.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = header.subarray(8, 12).toString('ascii').toLowerCase()
    return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand) ? 'IMAGE' : 'VIDEO'
  }
  if (header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'VIDEO'
  if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'AVI ') return 'VIDEO'
  return null
}

function cleanName(value, fallback = 'candidate') {
  const cleaned = String(value || '').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim()
  return (cleaned || fallback).slice(0, 80)
}

function fileHash(filePath) {
  const hash = crypto.createHash('sha256')
  const handle = fs.openSync(filePath, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytes = 0
    do {
      bytes = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytes) hash.update(buffer.subarray(0, bytes))
    } while (bytes)
  } finally { fs.closeSync(handle) }
  return hash.digest('hex')
}

export function inspectStorageRoot(rootPath) {
  const result = { rootPath, exists: false, writable: false, ready: false, totalBytes: 0, freeBytes: 0, error: null }
  try {
    fs.accessSync(rootPath, fs.constants.R_OK | fs.constants.W_OK)
    result.exists = true
    result.writable = true
    const stats = fs.statfsSync(rootPath, { bigint: true })
    result.totalBytes = Number(stats.blocks * stats.bsize)
    result.freeBytes = Number(stats.bavail * stats.bsize)
    result.ready = true
  } catch (error) {
    result.error = error.code === 'ENOENT' ? 'PRIVATE_SSD (X:) is unavailable or locked.' : `PRIVATE_SSD (X:) is not writable: ${error.message}`
  }
  return result
}

export class DesktopStore {
  constructor(rootPath, dataFolder = 'NexaTraining') {
    this.rootPath = path.resolve(rootPath)
    this.dataRoot = path.join(this.rootPath, cleanName(dataFolder, 'NexaTraining'))
    this.databasePath = path.join(this.dataRoot, 'database', 'nexa-training.db')
    this.db = null
  }

  open() {
    for (const folder of ['database', 'candidates', 'reports', 'thumbnails', 'imports', 'recovery']) fs.mkdirSync(path.join(this.dataRoot, folder), { recursive: true })
    this.db = new DatabaseSync(this.databasePath)
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS desktop_candidates (
        id TEXT PRIMARY KEY, reference_id TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL,
        email TEXT, source TEXT NOT NULL DEFAULT 'LOCAL', application_status TEXT,
        online_application_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS desktop_sessions (
        id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL, session_number INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'NOT_STARTED', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(candidate_id, session_number), FOREIGN KEY(candidate_id) REFERENCES desktop_candidates(id)
      );
      CREATE TABLE IF NOT EXISTS desktop_poses (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, pose_number INTEGER NOT NULL, pose_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'NOT_STARTED', elapsed_seconds INTEGER NOT NULL DEFAULT 0,
        timer_started_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, pose_number), FOREIGN KEY(session_id) REFERENCES desktop_sessions(id)
      );
      CREATE TABLE IF NOT EXISTS desktop_media (
        id TEXT PRIMARY KEY, pose_id TEXT NOT NULL, media_type TEXT NOT NULL, original_name TEXT NOT NULL,
        storage_path TEXT NOT NULL UNIQUE, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pose_id, sha256), FOREIGN KEY(pose_id) REFERENCES desktop_poses(id)
      );
      CREATE TABLE IF NOT EXISTS desktop_evaluations (
        pose_id TEXT PRIMARY KEY, scores_json TEXT NOT NULL DEFAULT '{}', internal_note TEXT NOT NULL DEFAULT '',
        candidate_feedback TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(pose_id) REFERENCES desktop_poses(id)
      );
    `)
    const candidateColumns = new Set(this.db.prepare('PRAGMA table_info(desktop_candidates)').all().map((column) => column.name))
    if (!candidateColumns.has('email')) this.db.exec('ALTER TABLE desktop_candidates ADD COLUMN email TEXT')
    if (!candidateColumns.has('source')) this.db.exec("ALTER TABLE desktop_candidates ADD COLUMN source TEXT NOT NULL DEFAULT 'LOCAL'")
    if (!candidateColumns.has('application_status')) this.db.exec('ALTER TABLE desktop_candidates ADD COLUMN application_status TEXT')
    if (!candidateColumns.has('online_application_id')) this.db.exec('ALTER TABLE desktop_candidates ADD COLUMN online_application_id TEXT')
    const poseColumns = new Set(this.db.prepare('PRAGMA table_info(desktop_poses)').all().map((column) => column.name))
    if (!poseColumns.has('elapsed_seconds')) this.db.exec('ALTER TABLE desktop_poses ADD COLUMN elapsed_seconds INTEGER NOT NULL DEFAULT 0')
    if (!poseColumns.has('timer_started_at')) this.db.exec('ALTER TABLE desktop_poses ADD COLUMN timer_started_at TEXT')
    return this.summary()
  }

  summary() { return { dataRoot: this.dataRoot, databasePath: this.databasePath } }

  close() {
    if (this.db) { this.db.close(); this.db = null }
  }

  listCandidates() {
    return this.db.prepare('SELECT * FROM desktop_candidates ORDER BY updated_at DESC, full_name').all()
  }

  createCandidate({ fullName, referenceId }) {
    const name = String(fullName || '').trim().slice(0, 120)
    if (!name) throw new Error('Candidate name is required.')
    const id = crypto.randomUUID()
    const ref = cleanName(referenceId || `NEXA-${Date.now()}`, id)
    this.db.prepare('INSERT INTO desktop_candidates (id, reference_id, full_name) VALUES (?, ?, ?)').run(id, ref, name)
    return this.db.prepare('SELECT * FROM desktop_candidates WHERE id = ?').get(id)
  }

  syncContactedCandidates(candidates) {
    const accepted = (Array.isArray(candidates) ? candidates : []).filter((candidate) => String(candidate?.application_status || '').toLowerCase() === 'contacted' && candidate?.application_id && candidate?.full_name)
    const statement = this.db.prepare(`
      INSERT INTO desktop_candidates (id, reference_id, full_name, email, source, application_status, online_application_id)
      VALUES (?, ?, ?, ?, 'NEXA_ADMIN', 'contacted', ?)
      ON CONFLICT(reference_id) DO UPDATE SET full_name = excluded.full_name, email = excluded.email,
        source = 'NEXA_ADMIN', application_status = 'contacted', online_application_id = excluded.online_application_id,
        updated_at = CURRENT_TIMESTAMP
    `)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const candidate of accepted) {
        const existing = this.db.prepare('SELECT id FROM desktop_candidates WHERE reference_id = ?').get(String(candidate.application_id))
        statement.run(existing?.id || crypto.randomUUID(), String(candidate.application_id), String(candidate.full_name).trim().slice(0, 120), String(candidate.email || '').trim().slice(0, 254) || null, String(candidate.application_id))
      }
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return { imported: accepted.length, candidates: this.listCandidates() }
  }

  seedDemoCandidates() {
    return this.syncContactedCandidates([
      { application_id: 'DEMO-CONTACTED-001', full_name: 'Alya Demo', email: 'alya.demo@example.test', application_status: 'contacted' },
      { application_id: 'DEMO-CONTACTED-002', full_name: 'Mei Demo', email: 'mei.demo@example.test', application_status: 'contacted' },
      { application_id: 'DEMO-CONTACTED-003', full_name: 'Sara Demo', email: 'sara.demo@example.test', application_status: 'contacted' },
    ])
  }

  ensureSession(candidateId, sessionNumber) {
    const number = Number(sessionNumber)
    if (!Number.isInteger(number) || number < 1 || number > 4) throw new Error('Training number must be from 1 to 4.')
    let session = this.db.prepare('SELECT * FROM desktop_sessions WHERE candidate_id = ? AND session_number = ?').get(candidateId, number)
    if (session) return session
    const candidate = this.db.prepare('SELECT id FROM desktop_candidates WHERE id = ?').get(candidateId)
    if (!candidate) throw new Error('Candidate not found.')
    if (number > 1) {
      const previous = this.db.prepare('SELECT id FROM desktop_sessions WHERE candidate_id = ? AND session_number = ?').get(candidateId, number - 1)
      if (!previous) throw new Error(`Complete Training ${number - 1} before creating Training ${number}.`)
      const previousIncomplete = this.db.prepare("SELECT COUNT(*) AS count FROM desktop_poses WHERE session_id = ? AND status <> 'EVALUATED'").get(previous.id)
      if (Number(previousIncomplete.count) > 0) throw new Error(`Evaluate every pose in Training ${number - 1} before creating Training ${number}.`)
    }
    const sessionId = crypto.randomUUID()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('INSERT INTO desktop_sessions (id, candidate_id, session_number) VALUES (?, ?, ?)').run(sessionId, candidateId, number)
      const insertPose = this.db.prepare('INSERT INTO desktop_poses (id, session_id, pose_number, pose_name) VALUES (?, ?, ?, ?)')
      for (let pose = 1; pose <= 5; pose += 1) insertPose.run(crypto.randomUUID(), sessionId, pose, `Pose ${pose}`)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return this.db.prepare('SELECT * FROM desktop_sessions WHERE id = ?').get(sessionId)
  }

  getWorkspace(candidateId) {
    const candidate = this.db.prepare('SELECT * FROM desktop_candidates WHERE id = ?').get(candidateId)
    if (!candidate) return null
    const sessions = this.db.prepare('SELECT * FROM desktop_sessions WHERE candidate_id = ? ORDER BY session_number').all(candidateId)
    for (const session of sessions) {
      session.poses = this.db.prepare(`
        SELECT p.*, e.scores_json, e.internal_note, e.candidate_feedback
        FROM desktop_poses p LEFT JOIN desktop_evaluations e ON e.pose_id = p.id
        WHERE p.session_id = ? ORDER BY p.pose_number
      `).all(session.id).map((pose) => ({ ...pose, scores: JSON.parse(pose.scores_json || '{}'), media: this.db.prepare('SELECT * FROM desktop_media WHERE pose_id = ? ORDER BY imported_at').all(pose.id) }))
    }
    return { candidate, sessions }
  }

  importMedia({ candidateId, sessionNumber, poseNumber, filePaths }) {
    const workspace = this.getWorkspace(candidateId)
    const session = workspace?.sessions.find((item) => Number(item.session_number) === Number(sessionNumber))
    const pose = session?.poses.find((item) => Number(item.pose_number) === Number(poseNumber))
    if (!pose) throw new Error('Create the training session before importing media.')
    const imported = []
    const rejected = []
    for (const sourcePath of [...new Set(filePaths || [])]) {
      try {
        const extension = path.extname(sourcePath).toLowerCase()
        const expectedType = IMAGE_EXTENSIONS.has(extension) ? 'IMAGE' : VIDEO_EXTENSIONS.has(extension) ? 'VIDEO' : null
        if (!expectedType) { rejected.push({ sourcePath, reason: 'Unsupported image or video format.' }); continue }
        const stat = fs.statSync(sourcePath)
        if (!stat.isFile()) { rejected.push({ sourcePath, reason: 'Not a file.' }); continue }
        const mediaType = detectedMediaType(sourcePath)
        if (mediaType !== expectedType) { rejected.push({ sourcePath, reason: 'The file contents do not match its image or video extension.' }); continue }
        const sha256 = fileHash(sourcePath)
        const duplicate = this.db.prepare('SELECT * FROM desktop_media WHERE pose_id = ? AND sha256 = ?').get(pose.id, sha256)
        if (duplicate) { imported.push({ ...duplicate, duplicate: true }); continue }
        const folder = path.join(this.dataRoot, 'candidates', cleanName(workspace.candidate.reference_id), `training-${sessionNumber}`, `pose-${poseNumber}`, mediaType === 'IMAGE' ? 'images' : 'videos')
        fs.mkdirSync(folder, { recursive: true })
        const baseName = cleanName(path.basename(sourcePath, extension), 'media')
        const destination = path.join(folder, `${baseName}-${sha256.slice(0, 10)}${extension}`)
        fs.copyFileSync(sourcePath, destination, fs.constants.COPYFILE_EXCL)
        const id = crypto.randomUUID()
        this.db.prepare('INSERT INTO desktop_media (id, pose_id, media_type, original_name, storage_path, sha256, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, pose.id, mediaType, path.basename(sourcePath), destination, sha256, stat.size)
        imported.push(this.db.prepare('SELECT * FROM desktop_media WHERE id = ?').get(id))
      } catch (error) { rejected.push({ sourcePath, reason: error.message }) }
    }
    return { imported, rejected }
  }

  deleteMedia(mediaId) {
    const media = this.db.prepare('SELECT * FROM desktop_media WHERE id = ?').get(mediaId)
    if (!media) throw new Error('Uploaded media not found.')
    const resolved = this.mediaPath(mediaId)
    if (!resolved) throw new Error('The uploaded media path is outside PRIVATE_SSD storage.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM desktop_media WHERE id = ?').run(mediaId)
      if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return { success: true, mediaId }
  }

  replaceMedia({ mediaId, filePath }) {
    const media = this.db.prepare(`
      SELECT m.*, p.pose_number, s.session_number, c.reference_id
      FROM desktop_media m
      JOIN desktop_poses p ON p.id = m.pose_id
      JOIN desktop_sessions s ON s.id = p.session_id
      JOIN desktop_candidates c ON c.id = s.candidate_id
      WHERE m.id = ?
    `).get(mediaId)
    if (!media) throw new Error('Uploaded media not found.')
    const sourcePath = path.resolve(String(filePath || ''))
    const extension = path.extname(sourcePath).toLowerCase()
    const expectedType = IMAGE_EXTENSIONS.has(extension) ? 'IMAGE' : VIDEO_EXTENSIONS.has(extension) ? 'VIDEO' : null
    if (!expectedType) throw new Error('Choose a supported image or video file.')
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile() || detectedMediaType(sourcePath) !== expectedType) throw new Error('The selected file contents do not match its extension.')
    const sha256 = fileHash(sourcePath)
    const duplicate = this.db.prepare('SELECT id FROM desktop_media WHERE pose_id = ? AND sha256 = ? AND id <> ?').get(media.pose_id, sha256, mediaId)
    if (duplicate) throw new Error('This file is already uploaded for the pose.')
    const folder = path.join(this.dataRoot, 'candidates', cleanName(media.reference_id), `training-${media.session_number}`, `pose-${media.pose_number}`, expectedType === 'IMAGE' ? 'images' : 'videos')
    fs.mkdirSync(folder, { recursive: true })
    const destination = path.join(folder, `${cleanName(path.basename(sourcePath, extension), 'media')}-${sha256.slice(0, 10)}${extension}`)
    const oldPath = this.mediaPath(mediaId)
    if (!oldPath) throw new Error('The existing media path is outside PRIVATE_SSD storage.')
    if (path.resolve(destination) !== path.resolve(oldPath)) fs.copyFileSync(sourcePath, destination, fs.constants.COPYFILE_EXCL)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`UPDATE desktop_media SET media_type = ?, original_name = ?, storage_path = ?, sha256 = ?, size_bytes = ?, imported_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(expectedType, path.basename(sourcePath), destination, sha256, stat.size, mediaId)
      if (path.resolve(destination) !== path.resolve(oldPath) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      if (path.resolve(destination) !== path.resolve(oldPath) && fs.existsSync(destination)) fs.unlinkSync(destination)
      throw error
    }
    return this.db.prepare('SELECT * FROM desktop_media WHERE id = ?').get(mediaId)
  }

  startPoseTimer(poseId) {
    const pose = this.db.prepare('SELECT id, session_id, pose_number, status, timer_started_at FROM desktop_poses WHERE id = ?').get(poseId)
    if (!pose) throw new Error('Pose not found.')
    if (pose.status === 'EVALUATED') throw new Error('This pose is already evaluated.')
    const earlierIncomplete = this.db.prepare("SELECT COUNT(*) AS count FROM desktop_poses WHERE session_id = ? AND pose_number < ? AND status <> 'EVALUATED'").get(pose.session_id, pose.pose_number)
    if (Number(earlierIncomplete.count) > 0) throw new Error('Evaluate the previous pose before starting this stopwatch.')
    if (!pose.timer_started_at) this.db.prepare("UPDATE desktop_poses SET timer_started_at = ?, status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(new Date().toISOString(), poseId)
    this.db.prepare("UPDATE desktop_sessions SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(pose.session_id)
    return this.db.prepare('SELECT * FROM desktop_poses WHERE id = ?').get(poseId)
  }

  stopPoseTimer(poseId) {
    const pose = this.db.prepare('SELECT id, timer_started_at, elapsed_seconds FROM desktop_poses WHERE id = ?').get(poseId)
    if (!pose) throw new Error('Pose not found.')
    if (!pose.timer_started_at) throw new Error('The stopwatch is not running.')
    const startedAt = Date.parse(pose.timer_started_at)
    const additionalSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
    const elapsedSeconds = Number(pose.elapsed_seconds || 0) + additionalSeconds
    this.db.prepare("UPDATE desktop_poses SET timer_started_at = NULL, elapsed_seconds = ?, status = 'PAUSED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(elapsedSeconds, poseId)
    return this.db.prepare('SELECT * FROM desktop_poses WHERE id = ?').get(poseId)
  }

  resetPoseTimer(poseId) {
    const pose = this.db.prepare('SELECT id, status FROM desktop_poses WHERE id = ?').get(poseId)
    if (!pose) throw new Error('Pose not found.')
    this.db.prepare("UPDATE desktop_poses SET timer_started_at = NULL, elapsed_seconds = 0, status = CASE WHEN status = 'EVALUATED' THEN status ELSE 'NOT_STARTED' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(poseId)
    return this.db.prepare('SELECT * FROM desktop_poses WHERE id = ?').get(poseId)
  }

  saveEvaluation({ poseId, scores = {}, candidateFeedback = '' }) {
    const pose = this.db.prepare('SELECT id, session_id, pose_number, timer_started_at FROM desktop_poses WHERE id = ?').get(poseId)
    if (!pose) throw new Error('Pose not found.')
    if (pose.timer_started_at) throw new Error('Stop the stopwatch before saving this evaluation.')
    const earlierIncomplete = this.db.prepare("SELECT COUNT(*) AS count FROM desktop_poses WHERE session_id = ? AND pose_number < ? AND status <> 'EVALUATED'").get(pose.session_id, pose.pose_number)
    if (Number(earlierIncomplete.count) > 0) throw new Error('Evaluate the previous pose first.')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare(`
        INSERT INTO desktop_evaluations (pose_id, scores_json, internal_note, candidate_feedback)
        VALUES (?, ?, '', ?)
        ON CONFLICT(pose_id) DO UPDATE SET scores_json = excluded.scores_json,
          internal_note = '', candidate_feedback = excluded.candidate_feedback,
          updated_at = CURRENT_TIMESTAMP
      `).run(poseId, JSON.stringify(scores), String(candidateFeedback).slice(0, 5000))
      this.db.prepare("UPDATE desktop_poses SET status = 'EVALUATED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(poseId)
      const incomplete = this.db.prepare("SELECT COUNT(*) AS count FROM desktop_poses WHERE session_id = ? AND status <> 'EVALUATED'").get(pose.session_id)
      this.db.prepare("UPDATE desktop_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(Number(incomplete.count) === 0 ? 'EVALUATED' : 'IN_PROGRESS', pose.session_id)
      this.db.exec('COMMIT')
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
    return { success: true, status: 'EVALUATED' }
  }

  mediaPath(mediaId) {
    const media = this.db.prepare('SELECT storage_path FROM desktop_media WHERE id = ?').get(mediaId)
    if (!media) return null
    const resolved = path.resolve(media.storage_path)
    const relative = path.relative(this.dataRoot, resolved)
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved
  }
}
