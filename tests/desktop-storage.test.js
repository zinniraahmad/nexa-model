import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DesktopStore, inspectStorageRoot } from '../desktop/storage.mjs'

function temporaryRoot(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexa-desktop-'))
  context.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('desktop storage creates an isolated candidate workspace and five-pose session', (context) => {
  const root = temporaryRoot(context)
  const store = new DesktopStore(root)
  const summary = store.open()
  const candidate = store.createCandidate({ fullName: 'Local Candidate', referenceId: 'NEXA-LOCAL-01' })
  store.ensureSession(candidate.id, 1)
  const workspace = store.getWorkspace(candidate.id)
  assert.equal(summary.dataRoot, path.join(root, 'NexaTraining'))
  assert.equal(workspace.candidate.full_name, 'Local Candidate')
  assert.equal(workspace.sessions.length, 1)
  assert.equal(workspace.sessions[0].poses.length, 5)
  assert.equal(inspectStorageRoot(root).ready, true)
  store.close()
})

test('desktop media import copies genuine files, rejects renamed payloads, and deduplicates by checksum', (context) => {
  const root = temporaryRoot(context)
  const source = path.join(root, 'whatsapp-source')
  fs.mkdirSync(source)
  const imagePath = path.join(source, 'candidate-pose.png')
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))
  const fakeImagePath = path.join(source, 'renamed-malware.jpg')
  fs.writeFileSync(fakeImagePath, 'not an image')
  const store = new DesktopStore(root)
  store.open()
  const candidate = store.createCandidate({ fullName: 'Media Candidate', referenceId: 'NEXA-MEDIA-01' })
  store.ensureSession(candidate.id, 1)
  const first = store.importMedia({ candidateId: candidate.id, sessionNumber: 1, poseNumber: 1, filePaths: [imagePath, fakeImagePath] })
  assert.equal(first.imported.length, 1)
  assert.equal(first.rejected.length, 1)
  assert.equal(fs.existsSync(first.imported[0].storage_path), true)
  assert.notEqual(path.resolve(first.imported[0].storage_path), path.resolve(imagePath))
  const duplicate = store.importMedia({ candidateId: candidate.id, sessionNumber: 1, poseNumber: 1, filePaths: [imagePath] })
  assert.equal(duplicate.imported[0].duplicate, true)
  assert.equal(store.getWorkspace(candidate.id).sessions[0].poses[0].media.length, 1)
  store.close()
})

test('desktop media can be manually replaced and deleted without orphaning stored files', (context) => {
  const root = temporaryRoot(context)
  const source = path.join(root, 'manual-media-source')
  fs.mkdirSync(source)
  const originalPath = path.join(source, 'original.png')
  const replacementPath = path.join(source, 'replacement.png')
  fs.writeFileSync(originalPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))
  fs.writeFileSync(replacementPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 2]))
  const store = new DesktopStore(root)
  store.open()
  const candidate = store.createCandidate({ fullName: 'Replace Candidate', referenceId: 'NEXA-REPLACE-01' })
  store.ensureSession(candidate.id, 1)
  const imported = store.importMedia({ candidateId: candidate.id, sessionNumber: 1, poseNumber: 1, filePaths: [originalPath] }).imported[0]
  const oldStoredPath = imported.storage_path
  const replaced = store.replaceMedia({ mediaId: imported.id, filePath: replacementPath })
  assert.equal(replaced.original_name, 'replacement.png')
  assert.equal(fs.existsSync(oldStoredPath), false)
  assert.equal(fs.existsSync(replaced.storage_path), true)
  store.deleteMedia(replaced.id)
  assert.equal(fs.existsSync(replaced.storage_path), false)
  assert.equal(store.getWorkspace(candidate.id).sessions[0].poses[0].media.length, 0)
  store.close()
})

test('desktop candidate sync stores only Contacted candidates from Nexa Admin', (context) => {
  const root = temporaryRoot(context)
  const store = new DesktopStore(root)
  store.open()
  const result = store.syncContactedCandidates([
    { application_id: 'contacted-1', full_name: 'Contacted Candidate', email: 'contacted@example.test', application_status: 'contacted' },
    { application_id: 'shortlisted-1', full_name: 'Shortlisted Candidate', email: 'shortlisted@example.test', application_status: 'shortlisted' },
  ])
  assert.equal(result.imported, 1)
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].reference_id, 'contacted-1')
  assert.equal(result.candidates[0].application_status, 'contacted')
  store.close()
})

test('desktop demo candidates use a separately named data root', (context) => {
  const root = temporaryRoot(context)
  const store = new DesktopStore(root, 'NexaTraining-Development')
  store.open()
  const result = store.seedDemoCandidates()
  assert.equal(store.dataRoot, path.join(root, 'NexaTraining-Development'))
  assert.equal(result.candidates.length, 3)
  assert.equal(result.candidates.every((candidate) => candidate.application_status === 'contacted'), true)
  store.close()
})

test('desktop pose stopwatch persists accumulated duration', (context) => {
  const root = temporaryRoot(context)
  const store = new DesktopStore(root)
  store.open()
  const candidate = store.createCandidate({ fullName: 'Timed Candidate', referenceId: 'NEXA-TIMER-01' })
  store.ensureSession(candidate.id, 1)
  const pose = store.getWorkspace(candidate.id).sessions[0].poses[0]
  const started = store.startPoseTimer(pose.id)
  assert.equal(started.status, 'IN_PROGRESS')
  assert.ok(started.timer_started_at)
  store.db.prepare('UPDATE desktop_poses SET timer_started_at = ? WHERE id = ?').run(new Date(Date.now() - 10_000).toISOString(), pose.id)
  const stopped = store.stopPoseTimer(pose.id)
  assert.equal(stopped.status, 'PAUSED')
  assert.equal(stopped.timer_started_at, null)
  assert.ok(stopped.elapsed_seconds >= 9)
  const reset = store.resetPoseTimer(pose.id)
  assert.equal(reset.status, 'NOT_STARTED')
  assert.equal(reset.elapsed_seconds, 0)
  assert.equal(reset.timer_started_at, null)
  store.close()
})

test('desktop training and pose evaluation must progress in order', (context) => {
  const root = temporaryRoot(context)
  const store = new DesktopStore(root)
  store.open()
  const candidate = store.createCandidate({ fullName: 'Sequence Candidate', referenceId: 'NEXA-SEQUENCE-01' })
  store.ensureSession(candidate.id, 1)
  const firstSession = store.getWorkspace(candidate.id).sessions[0]
  assert.throws(() => store.startPoseTimer(firstSession.poses[1].id), /previous pose/i)
  assert.throws(() => store.saveEvaluation({ poseId: firstSession.poses[1].id }), /previous pose/i)
  assert.throws(() => store.ensureSession(candidate.id, 2), /every pose/i)

  for (const [index, pose] of firstSession.poses.entries()) store.saveEvaluation({ poseId: pose.id, scores: { pose_accuracy: 4, facial_expression: index === 0 ? 'N/A' : 4 } })

  const secondSession = store.ensureSession(candidate.id, 2)
  const workspace = store.getWorkspace(candidate.id)
  assert.equal(workspace.sessions[0].status, 'EVALUATED')
  assert.equal(workspace.sessions[0].poses[0].scores.facial_expression, 'N/A')
  assert.equal(secondSession.session_number, 2)
  store.close()
})
