import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ClipboardCheck, Clock3, Copy, Eye, Link2, LoaderCircle, Play, Plus, RotateCcw, Save, ShieldOff, Video, X } from 'lucide-react'
import { TraineeSessionResult } from '../../src/pages/TrainingProgress.jsx'

const bundledReferenceModules = import.meta.glob('../../src/assets/references-images/training-*-pose-*.webp', { eager: true, query: '?url', import: 'default' })
const bundledReferences = new Map(Object.entries(bundledReferenceModules).map(([path, url]) => [path.match(/(training-\d+-pose-\d+)\.webp$/)?.[1], url]).filter(([key]) => key))

const poseReasonOptions = ['POSE_ACCURACY', 'BODY_POSITION', 'HAND_PLACEMENT', 'LEG_POSITION', 'BODY_ANGLE', 'POSTURE', 'FACIAL_EXPRESSION', 'CAMERA_ANGLE', 'CAMERA_FRAMING', 'PRODUCT_VISIBILITY', 'REFERENCE_NOT_FOLLOWED', 'OTHER']
const videoReasonOptions = ['POSE_ACCURACY', 'TIMING', 'TRANSITION', 'BODY_CONTROL', 'BALANCE', 'POSE_STABILITY', 'FACIAL_EXPRESSION', 'FRAMING', 'CAMERA_AWARENESS', 'INSTRUCTION_NOT_FOLLOWED', 'EDITED_OR_TRIMMED_VIDEO', 'OTHER']
const invalidOptions = ['WRONG_FILE', 'CORRUPTED_FILE', 'INCOMPLETE_SUBMISSION', 'UNUSABLE_SUBMISSION', 'EDITED_OR_TRIMMED_VIDEO', 'OTHER']
const scoreFields = [
  ['pose_accuracy', 'Pose accuracy'], ['facial_expression', 'Facial expression'], ['product_presentation', 'Product presentation'],
  ['body_control', 'Body control / positioning'], ['feedback_responsiveness', 'Feedback responsiveness'],
  ['movement_control', 'Movement control'], ['transition_quality', 'Transition quality'], ['video_execution_consistency', 'Video consistency'],
  ['instruction_compliance', 'Instruction compliance'], ['camera_awareness', 'Camera awareness'], ['pose_stability', 'Pose stability'],
]
const earlyTrainingScoreKeys = new Set(['pose_accuracy', 'facial_expression', 'body_control', 'movement_control'])

function label(value) {
  return String(value || '').toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function elapsed(start, end = Date.now()) {
  if (!start) return 'Not started'
  const startTime = new Date(`${start.replace(' ', 'T')}Z`).getTime()
  const endTime = typeof end === 'string' ? new Date(`${end.replace(' ', 'T')}Z`).getTime() : end
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000))
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function Status({ value }) { return <span className={`training-status status-${String(value).toLowerCase()}`}>{label(value)}</span> }

function ReviewAttempt({ target, busy, onCancel, onSubmit }) {
  const [reasons, setReasons] = useState([])
  const [note, setNote] = useState('')
  const [invalidReason, setInvalidReason] = useState(target.status === 'INVALID' && target.video ? 'EDITED_OR_TRIMMED_VIDEO' : 'WRONG_FILE')
  const [raw, setRaw] = useState('')
  const options = target.video ? videoReasonOptions : poseReasonOptions
  function toggle(reason) { setReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]) }
  return <div className="training-review-box" role="group" aria-label={`Review ${target.video ? 'video' : 'pose'} attempt`}>
    <div className="training-review-heading"><strong>{label(target.status)} — Attempt {target.attempt.attempt_number}</strong><button type="button" onClick={onCancel} aria-label="Cancel review"><X size={17} /></button></div>
    {target.status === 'REDO_REQUIRED' && <fieldset><legend>Reasons (choose any)</legend><div className="reason-grid">{options.map((reason) => <label key={reason}><input type="checkbox" checked={reasons.includes(reason)} onChange={() => toggle(reason)} />{label(reason)}</label>)}</div></fieldset>}
    {target.status === 'INVALID' && <label>Invalid reason<select value={invalidReason} onChange={(event) => setInvalidReason(event.target.value)}>{invalidOptions.filter((item) => target.video || item !== 'EDITED_OR_TRIMMED_VIDEO').map((item) => <option value={item} key={item}>{label(item)}</option>)}</select></label>}
    {target.video && <label>RAW footage verified<select value={raw} onChange={(event) => setRaw(event.target.value)}><option value="">Not reviewed</option><option value="true">Yes — continuous and unedited</option><option value="false">No</option></select></label>}
    <label>Internal note<textarea rows="2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Visible to Admin only" /></label>
    <div className="training-inline-actions"><button className={target.status === 'APPROVED' ? 'approval-action' : undefined} type="button" disabled={busy} onClick={() => onSubmit({ status: target.status, redo_reasons: reasons, invalid_reason: target.status === 'INVALID' ? invalidReason : null, internal_admin_note: note, ...(target.video ? { raw_footage_verified: raw === '' ? null : raw === 'true' } : {}) })}>{busy ? 'Saving…' : `Confirm ${label(target.status)}`}</button><button className="secondary-button" type="button" onClick={onCancel}>Cancel</button></div>
  </div>
}

function AttemptList({ title, attempts, video, busy, reviewTarget, onReview, onCreate, onCancel, onSubmit }) {
  return <section className="training-attempts"><div className="training-section-heading"><div><p className="eyebrow">{video ? 'DYNAMIC RAW VIDEO' : 'STATIC POSE'}</p><h3>{title}</h3></div><button type="button" className="secondary-button" disabled={busy || attempts.some((item) => item.status === 'PENDING')} onClick={onCreate}><Plus size={15} /> Add {video ? 'video' : 'attempt'}</button></div>
    {!attempts.length ? <p className="training-empty">No attempts recorded.</p> : <ol>{attempts.map((attempt) => <li key={attempt.id}><div><strong>Attempt {attempt.attempt_number}</strong><Status value={attempt.status} />{video && <small>RAW: {attempt.raw_footage_verified === null ? 'not reviewed' : attempt.raw_footage_verified ? 'verified' : 'not verified'}</small>}</div>{attempt.redo_reasons?.length > 0 && <p>{attempt.redo_reasons.map(label).join(', ')}</p>}{attempt.internal_admin_note && <p className="private-note">Internal: {attempt.internal_admin_note}</p>}{attempt.status === 'PENDING' && <div className="attempt-actions"><button className="approval-action" onClick={() => onReview({ attempt, video, status: 'APPROVED' })}><Check size={15} /> Approve</button><button onClick={() => onReview({ attempt, video, status: 'REDO_REQUIRED' })}><RotateCcw size={15} /> Redo</button><button onClick={() => onReview({ attempt, video, status: 'INVALID' })}><X size={15} /> Invalid</button></div>}</li>)}</ol>}
    {reviewTarget && reviewTarget.video === video && <ReviewAttempt target={reviewTarget} busy={busy} onCancel={onCancel} onSubmit={onSubmit} />}
  </section>
}

function PoseConsole({ pose, sessionNumber, busy, reviewTarget, onReload, request, onReviewTarget }) {
  const [form, setForm] = useState(() => ({ ...Object.fromEntries(scoreFields.map(([key]) => [key, pose[key] ?? ''])), pose_name: pose.pose_name, instructions: pose.instructions || '', video_instructions: pose.video_instructions || '', video_required: pose.video_required, internal_admin_note: pose.internal_admin_note || '' }))
  useEffect(() => setForm({ ...Object.fromEntries(scoreFields.map(([key]) => [key, pose[key] ?? ''])), pose_name: pose.pose_name, instructions: pose.instructions || '', video_instructions: pose.video_instructions || '', video_required: pose.video_required, internal_admin_note: pose.internal_admin_note || '' }), [pose])
  const visibleScoreFields = Number(sessionNumber) <= 2 ? scoreFields.filter(([key]) => earlyTrainingScoreKeys.has(key)) : scoreFields
  const referenceImage = bundledReferences.get(`training-${sessionNumber}-pose-${pose.pose_number}`) || pose.reference_image_url
  const latestVideo = pose.video_attempts.at(-1)
  async function action(path, options = {}) { await request(path, options); onReviewTarget(null); onReload() }
  async function saveEvaluation() {
    const body = { ...form, ...Object.fromEntries(scoreFields.map(([key]) => [key, visibleScoreFields.some(([visibleKey]) => visibleKey === key) && form[key] !== '' ? Number(form[key]) : null])) }
    await action(`/api/admin/training/poses/${pose.id}/evaluation`, { method: 'PATCH', body: JSON.stringify(body) })
  }
  async function resetEvaluation() {
    const confirmed = window.confirm(`Reset ${pose.pose_name}?\n\nAll static attempts, video attempts, scores, instructions, notes and timing data for this pose will be permanently erased. The pose will return to Not Started.`)
    if (!confirmed) return
    await action(`/api/admin/training/poses/${pose.id}/reset-evaluation`, { method: 'POST', body: '{}' })
  }
  return <div className="pose-console">
    <section className="pose-live-header"><div><p className="eyebrow">POSE {pose.pose_number}</p><div className="pose-title-row"><h2>{pose.pose_name}</h2>{pose.status === 'NOT_STARTED' && <button className="training-primary-action" disabled={busy} onClick={() => action(`/api/admin/training/poses/${pose.id}/start`, { method: 'POST', body: '{}' })}><Play size={17} /> Start pose</button>}{pose.status !== 'NOT_STARTED' && <Status value={pose.status} />}</div></div><div><Clock3 size={16} /> {elapsed(pose.started_at, pose.completed_at || Date.now())}</div></section>
    {pose.instructions && <section className="training-instructions"><h3>WhatsApp instruction</h3><p>{pose.instructions}</p></section>}
    <div className="training-attempt-grid"><AttemptList title="Pose attempts" attempts={pose.pose_attempts} video={false} busy={busy} reviewTarget={reviewTarget} onReview={onReviewTarget} onCancel={() => onReviewTarget(null)} onCreate={() => action(`/api/admin/training/poses/${pose.id}/attempts`, { method: 'POST', body: '{}' })} onSubmit={(body) => action(`/api/admin/training/attempts/${reviewTarget.attempt.id}`, { method: 'PATCH', body: JSON.stringify(body) })} />
    <AttemptList title="Video attempts" attempts={pose.video_attempts} video busy={busy} reviewTarget={reviewTarget} onReview={onReviewTarget} onCancel={() => onReviewTarget(null)} onCreate={() => action(`/api/admin/training/poses/${pose.id}/videos`, { method: 'POST', body: '{}' })} onSubmit={(body) => action(`/api/admin/training/videos/${reviewTarget.attempt.id}`, { method: 'PATCH', body: JSON.stringify(body) })} /></div>
    <section className="pose-completion-check"><h3>Completion check</h3><div><span>Static pose approved</span><strong>{pose.pose_attempts.some((item) => item.status === 'APPROVED') ? 'Yes' : 'No'}</strong></div><div><span>Video required</span><strong>{pose.video_required ? 'Yes' : 'No'}</strong></div><div><span>Video attempts</span><strong>{pose.video_attempts.length}</strong></div><div><span>Latest video result</span><strong>{pose.video_required ? label(latestVideo?.status || 'Not submitted') : 'Not required'}</strong></div></section>
    <section className="training-evaluation"><div className="training-section-heading"><div><p className="eyebrow">DETAILED REVIEW</p><h3>Pose evaluation</h3></div></div>
      {referenceImage && <figure className="pose-reference evaluation-reference"><img src={referenceImage} alt={`Training ${sessionNumber}, ${pose.pose_name} reference`} /><figcaption>Training {sessionNumber} · Pose {pose.pose_number} reference</figcaption></figure>}
      <div className="training-form-grid"><label className="wide">Pose name<input value={form.pose_name} onChange={(event) => setForm({ ...form, pose_name: event.target.value })} /></label><label className="wide">Pose instruction<textarea rows="3" value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} /></label><label className="wide">Video instruction<textarea rows="4" value={form.video_instructions} onChange={(event) => setForm({ ...form, video_instructions: event.target.value })} placeholder="Configurable RAW movement sequence" /></label><label className="training-check"><input type="checkbox" checked={form.video_required} onChange={(event) => setForm({ ...form, video_required: event.target.checked })} /> Video assessment required</label></div>
      <div className="score-grid">{visibleScoreFields.map(([key, title]) => <label key={key}>{title}<select value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}><option value="">Not scored</option>{[1, 2, 3, 4, 5].map((value) => <option value={value} key={value}>{value} / 5</option>)}</select></label>)}</div>
      <div className="training-form-grid"><label className="wide">Internal Admin note<textarea rows="3" value={form.internal_admin_note} onChange={(event) => setForm({ ...form, internal_admin_note: event.target.value })} placeholder="Admin-only training note" /></label></div>
      <div className="training-inline-actions"><button disabled={busy} onClick={saveEvaluation}><Save size={16} /> Save evaluation</button><button className="reset-evaluation-action" disabled={busy} onClick={resetEvaluation}><RotateCcw size={16} /> Reset evaluation</button>{pose.status !== 'COMPLETED' && <button className="complete-action" disabled={busy} onClick={() => action(`/api/admin/training/poses/${pose.id}/complete`, { method: 'POST', body: '{}' })}><ClipboardCheck size={16} /> Complete pose</button>}</div>
    </section>
  </div>
}

function SessionReview({ session, candidate, busy, request, onReload }) {
  const [preview, setPreview] = useState(null)
  const allPosesCompleted = session.poses.length > 0 && session.poses.every((pose) => pose.status === 'COMPLETED')
  async function action(name, body = {}) { const result = await request(`/api/admin/training/sessions/${session.id}/${name}`, { method: 'POST', body: JSON.stringify(body) }); if (name === 'preview') setPreview(result.session); else onReload() }
  return <section className="session-review"><div className="training-section-heading"><div><p className="eyebrow">SESSION CONTROLS</p><h2>Completion and publication</h2></div><Status value={session.publication_status || 'DRAFT'} /></div>
    <div className="training-inline-actions">{session.status === 'IN_PROGRESS' && <button disabled={busy || !allPosesCompleted} title={allPosesCompleted ? 'Complete this training session' : 'Complete every pose before completing the session'} onClick={() => action('complete')}><ClipboardCheck size={16} /> Complete session</button>}{session.status === 'COMPLETED' && session.publication_status === 'DRAFT' && <button disabled={busy} onClick={() => action('ready')}>Ready to publish</button>}<button className="secondary-button" disabled={busy} onClick={() => action('preview')}><Eye size={16} /> Preview result</button>{session.publication_status === 'READY_TO_PUBLISH' && <button className="publish-action" disabled={busy} onClick={() => action('publish')}>Publish result</button>}{session.publication_status === 'PUBLISHED' && <button className="secondary-button" disabled={busy} onClick={() => action('unpublish')}>Unpublish</button>}</div>
    {session.status === 'IN_PROGRESS' && !allPosesCompleted && <p className="session-completion-help" role="status">Complete all {session.poses.length} poses to enable Complete Session.</p>}
    {preview && <div className="training-preview"><div className="training-review-heading"><strong>Preview for {candidate.full_name}</strong><button onClick={() => setPreview(null)} aria-label="Close preview"><X size={17} /></button></div><TraineeSessionResult session={preview} expanded onToggle={() => {}} /></div>}
  </section>
}

function ProgressLinkControls({ candidateId, progressLink, busy, request, onReload }) {
  const [url, setUrl] = useState('')
  async function action(name) { const result = await request(`/api/admin/training/candidates/${encodeURIComponent(candidateId)}/progress-link/${name}`, { method: 'POST', body: '{}' }); if (result.progress_url) setUrl(result.progress_url); onReload() }
  return <section className="progress-link-controls"><div><p className="eyebrow">PRIVATE TRAINEE ACCESS</p><h2>Progress link</h2><p><Status value={progressLink?.status || 'NOT_CREATED'} /> {progressLink?.last_accessed_at && <small>Last opened {progressLink.last_accessed_at} UTC</small>}</p></div>
    {url && <div className="one-time-link"><label>New link — shown once<input readOnly value={url} /></label><button onClick={() => navigator.clipboard.writeText(url)}><Copy size={16} /> Copy link</button></div>}
    <div className="training-inline-actions">{!progressLink ? <button disabled={busy} onClick={() => action('generate')}><Link2 size={16} /> Generate link</button> : <><button disabled={busy} onClick={() => action('regenerate')}><RotateCcw size={16} /> Regenerate link</button>{progressLink.status === 'ACTIVE' && <button className="danger-button" disabled={busy} onClick={() => action('revoke')}><ShieldOff size={16} /> Disable link</button>}</>}</div>
    {progressLink && !url && <small>For security, the existing plaintext URL is not stored. Regenerate it when a new copy is needed; the previous link will stop working.</small>}
  </section>
}

export default function TrainingPage({ api, showToast }) {
  const [candidates, setCandidates] = useState([])
  const [candidateId, setCandidateId] = useState(() => new URLSearchParams(window.location.search).get('candidate') || '')
  const [data, setData] = useState(null)
  const [sessionId, setSessionId] = useState('')
  const [poseId, setPoseId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewTarget, setReviewTarget] = useState(null)

  async function request(path, options) {
    setBusy(true); setError('')
    try { return await api(path, options) } catch (reason) { setError(reason.message); throw reason } finally { setBusy(false) }
  }
  async function load(id = candidateId, preferredSessionId = sessionId) {
    if (!id) { setData(null); setLoading(false); return }
    setLoading(true); setError('')
    try {
      const result = await api(`/api/admin/training/candidates/${encodeURIComponent(id)}`)
      setData(result)
      const chosenSession = result.sessions.find((item) => item.id === preferredSessionId) || result.sessions.at(-1)
      setSessionId(chosenSession?.id || '')
      setPoseId((current) => chosenSession?.poses.find((item) => item.id === current)?.id || chosenSession?.poses.find((item) => !['LOCKED', 'COMPLETED'].includes(item.status))?.id || chosenSession?.poses[0]?.id || '')
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }
  useEffect(() => { api('/api/admin/training/candidates').then((result) => setCandidates(result.candidates)).catch((reason) => setError(reason.message)).finally(() => setLoading(false)) }, [api])
  useEffect(() => { if (candidateId) { window.history.replaceState(null, '', `/training?candidate=${encodeURIComponent(candidateId)}`); load(candidateId) } }, [candidateId])
  const session = data?.sessions.find((item) => item.id === sessionId)
  const pose = session?.poses.find((item) => item.id === poseId)
  const firstIncompletePoseId = session?.poses.find((item) => item.status !== 'COMPLETED')?.id
  const nextSessionNumber = useMemo(() => { const used = new Set(data?.sessions.map((item) => Number(item.session_number))); return [1, 2, 3, 4].find((number) => !used.has(number)) }, [data])
  async function createSession() { try { const created = await request(`/api/admin/training/candidates/${encodeURIComponent(candidateId)}/sessions`, { method: 'POST', body: JSON.stringify({ session_number: nextSessionNumber, pose_count: 5 }) }); showToast(`Training ${nextSessionNumber} created.`); await load(candidateId, created.session_id) } catch {} }
  return <div className="training-page"><section className="page-heading"><div><p className="eyebrow">LIVE TRAINING & EVALUATION</p><h1>Training</h1><p>Conduct pose-by-pose sessions, evaluate performance and publish private training results.</p></div><label className="candidate-picker">Trainee<select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}><option value="">Select a trainee</option>{candidates.map((candidate) => <option value={candidate.application_id} key={candidate.application_id}>{candidate.full_name} — {label(candidate.application_status)}</option>)}</select></label></section>
    {error && <p className="training-error" role="alert"><AlertTriangle size={17} />{error}</p>}
    {loading ? <div className="analytics-loading"><LoaderCircle className="spin" /> Loading training…</div> : !candidateId ? <section className="training-welcome"><Video /><h2>Select a trainee to begin</h2><p>Training records are linked to the existing Nexa candidate database.</p></section> : data && <>
      <section className="trainee-training-header"><div><small>TRAINEE</small><h2>{data.candidate.full_name}</h2><p>{data.candidate.email}</p></div></section>
      <ProgressLinkControls candidateId={candidateId} progressLink={data.progress_link} busy={busy} request={request} onReload={load} />
      <nav className="training-session-tabs" aria-label="Training sessions">{data.sessions.map((item) => <button className={item.id === sessionId ? 'active' : ''} onClick={() => { setSessionId(item.id); setPoseId(item.poses.find((p) => !['LOCKED', 'COMPLETED'].includes(p.status))?.id || item.poses[0]?.id || '') }} key={item.id}><span>Training {item.session_number}</span><Status value={item.status} /></button>)}{nextSessionNumber && <button className="add-training-tab" disabled={busy} onClick={createSession}><span>Training {nextSessionNumber}</span><small><Plus size={15} /> Add Training</small></button>}</nav>
      {!data.sessions.length ? <section className="training-welcome"><ClipboardCheck /><h2>No training sessions yet</h2><p>Create Training 1 to prepare five sequential poses.</p></section> : <>
        {session && <><section className="training-session-header"><div><p className="eyebrow">TRAINING {session.session_number}</p><h2>Session console</h2><p>{session.started_at ? `${elapsed(session.started_at, session.completed_at || Date.now())} elapsed` : 'Ready to begin'}</p></div>{session.status === 'NOT_STARTED' && <button className="training-primary-action" disabled={busy} onClick={async () => { try { await request(`/api/admin/training/sessions/${session.id}/start`, { method: 'POST', body: '{}' }); load() } catch {} }}><Play size={16} /> Start training session</button>}</section>
          <nav className="pose-stepper" aria-label="Training poses">{session.poses.map((item) => <button disabled={item.status === 'LOCKED' || (item.status === 'NOT_STARTED' && item.id !== firstIncompletePoseId)} className={item.id === poseId ? 'active' : ''} onClick={() => setPoseId(item.id)} key={item.id}><span>{item.status === 'COMPLETED' ? <Check size={16} /> : item.pose_number}</span><strong>{item.pose_name}</strong><small>{label(item.status)}</small></button>)}</nav>
          {pose && <PoseConsole key={pose.id} pose={pose} sessionNumber={session.session_number} busy={busy} reviewTarget={reviewTarget} onReviewTarget={setReviewTarget} request={request} onReload={load} />}
          <SessionReview session={session} candidate={data.candidate} busy={busy} request={request} onReload={load} />
        </>}
      </>}
    </>}
  </div>
}
