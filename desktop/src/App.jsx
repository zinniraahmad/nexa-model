import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudDownload, FileDown, Film, FolderOpen, HardDrive, ImagePlus, LoaderCircle, LockKeyhole, Play, Plus, RefreshCw, RotateCcw, Save, Square, Star, Timer, Trash2 } from 'lucide-react'

const referenceModules = import.meta.glob('../../src/assets/references-images/training-*-pose-*.webp', { eager: true, import: 'default' })
const references = new Map(Object.entries(referenceModules).map(([file, url]) => [file.match(/training-\d+-pose-\d+/)?.[0], url]).filter(([key]) => key))
const scoreFields = [['pose_accuracy', 'Pose accuracy'], ['facial_expression', 'Facial expression'], ['body_control', 'Body control / positioning'], ['movement_control', 'Movement control']]
const watermarkText = 'PROPERTY OF NEXA MODEL — PRIVATE & CONFIDENTIAL'

function titleStatus(value) { return String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function mediaUrl(item) { return `nexa-media://media/${encodeURIComponent(item.id)}?v=${encodeURIComponent(item.sha256 || item.imported_at || '')}` }
function duration(seconds) { const value = Math.max(0, Math.floor(Number(seconds) || 0)); const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); const remainder = value % 60; return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` }
function scoreText(value) { return value === 'N/A' ? 'N/A' : Number(value) ? `${Number(value)} / 5` : 'Not scored' }

function Watermark() {
  return <div className="watermark-grid" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <span key={index}>{watermarkText}</span>)}</div>
}

function ProtectedMedia({ item, alt, onBrowse, disabled }) {
  if (!item) return <button type="button" className="empty-media browse-media" disabled={disabled} onClick={onBrowse}><ImagePlus /><span>Drop files here or click to browse</span><small>Select multiple images or videos</small></button>
  return <div className="protected-media dynamic-preview">{item.media_type === 'VIDEO' ? <video src={mediaUrl(item)} controls preload="metadata" /> : <img src={mediaUrl(item)} alt={alt} />}<Watermark /></div>
}

function DriveGate({ status, loading, onRetry }) {
  return <main className="drive-gate"><section><div className="gate-icon"><LockKeyhole /></div><p className="eyebrow">LOCAL PRIVATE STORAGE</p><h1>Unlock PRIVATE_SSD</h1><p>The evaluation workspace requires the BitLocker-protected <strong>PRIVATE_SSD (X:)</strong>. Candidate media and evaluations never fall back to the computer’s system drive.</p>
    {status?.error && <div className="drive-error"><AlertTriangle />{status.error}</div>}
    <button onClick={onRetry} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <RefreshCw />} Check X: again</button>
    <small>Connect and unlock X: in Windows, then retry.</small>
  </section></main>
}

function CandidatePanel({ candidates, selectedId, onSelect, onSync, busy, demoMode }) {
  return <section className="candidate-panel"><div><p className="eyebrow">OFFLINE CANDIDATE WORKSPACE {demoMode && <span className="demo-chip">DEMO DATABASE</span>}</p><h1>Training Evaluation</h1><p>{demoMode ? 'Safe development data isolated from the production candidate database.' : 'Review WhatsApp and Google Drive media locally on PRIVATE_SSD.'}</p></div><div className="candidate-actions"><label>Candidate<select value={selectedId} onChange={(event) => onSelect(event.target.value)}><option value="">Select a candidate</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.full_name} — {candidate.application_status === 'contacted' ? 'Contacted' : candidate.reference_id}</option>)}</select></label><button className="secondary sync-icon-button" aria-label="Sync Contacted candidates" disabled={busy || demoMode} title={demoMode ? 'Live Admin sync is disabled in demo mode' : 'Sync Contacted candidates from Nexa Admin'} onClick={onSync}><CloudDownload /></button></div>
  </section>
}

function StarRating({ label, value, onChange }) {
  const notApplicable = value === 'N/A'
  const score = Number(value) || 0
  return <fieldset className="star-rating"><legend>{label}</legend><div className="star-buttons" role="group" aria-label={`${label} rating`}><button type="button" className={`na-rating ${notApplicable ? 'selected' : ''}`} aria-label={`${label} is not applicable`} aria-pressed={notApplicable} onClick={() => onChange('N/A')}>N/A</button>{[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} className={!notApplicable && star <= score ? 'selected' : ''} aria-label={`${star} star${star === 1 ? '' : 's'}`} aria-pressed={!notApplicable && score === star} onClick={() => onChange(star)}><Star /></button>)}</div><span>{notApplicable ? 'Not applicable' : score ? `${score} / 5` : 'Not scored'}</span>{(notApplicable || score > 0) && <button type="button" className="clear-rating" onClick={() => onChange(null)}>Clear</button>}</fieldset>
}

function PoseWorkspace({ candidate, session, pose, onReload, onExport, onShowExport, exportedReportPath, notify }) {
  const [selectedMediaId, setSelectedMediaId] = useState(pose.media[0]?.id || '')
  const [scores, setScores] = useState(pose.scores || {})
  const [feedback, setFeedback] = useState(pose.candidate_feedback || '')
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const replacementInput = useRef(null)
  const browseInput = useRef(null)
  useEffect(() => { setSelectedMediaId((current) => pose.media.some((item) => item.id === current) ? current : pose.media.at(-1)?.id || ''); setScores(pose.scores || {}); setFeedback(pose.candidate_feedback || '') }, [pose])
  useEffect(() => { if (!pose.timer_started_at) return undefined; setClock(Date.now()); const timer = window.setInterval(() => setClock(Date.now()), 250); return () => window.clearInterval(timer) }, [pose.timer_started_at])
  const selectedMedia = pose.media.find((item) => item.id === selectedMediaId) || pose.media[0]
  const reference = references.get(`training-${session.session_number}-pose-${pose.pose_number}`)
  const running = Boolean(pose.timer_started_at)
  const liveSeconds = Number(pose.elapsed_seconds || 0) + (running ? Math.max(0, Math.floor((clock - Date.parse(pose.timer_started_at)) / 1000)) : 0)
  async function importFiles(filePaths) {
    setBusy(true)
    try {
      const result = await window.nexaDesktop.importMedia({ candidateId: candidate.id, sessionNumber: session.session_number, poseNumber: pose.pose_number, filePaths })
      notify(`${result.imported.length} file${result.imported.length === 1 ? '' : 's'} secured on X:${result.rejected.length ? `; ${result.rejected.length} rejected` : ''}.`)
      await onReload()
    } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  async function dropMedia(event) {
    event.preventDefault(); setDragging(false)
    if (busy) return
    const filePaths = [...event.dataTransfer.files].map((file) => window.nexaDesktop.pathForFile(file)).filter(Boolean)
    if (filePaths.length) await importFiles(filePaths)
  }
  async function toggleTimer() {
    setBusy(true)
    try { await (running ? window.nexaDesktop.stopPoseTimer(pose.id) : window.nexaDesktop.startPoseTimer(pose.id)); notify(running ? `Stopwatch stopped at ${duration(liveSeconds)}.` : 'Stopwatch started.'); await onReload() } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  async function resetTimer() {
    if (!window.confirm('Warning: resetting the stopwatch will stop it and permanently clear the saved duration for this pose. Continue?')) return
    setBusy(true)
    try { await window.nexaDesktop.resetPoseTimer(pose.id); notify('Stopwatch reset to 00:00.'); await onReload() } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  async function replaceSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedMedia) return
    const filePath = window.nexaDesktop.pathForFile(file)
    if (!filePath) return
    setBusy(true)
    try { await window.nexaDesktop.replaceMedia({ mediaId: selectedMedia.id, filePath }); notify('Selected submission replaced.'); await onReload() } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  async function browseFiles(event) {
    const filePaths = [...(event.target.files || [])].map((file) => window.nexaDesktop.pathForFile(file)).filter(Boolean)
    event.target.value = ''
    if (filePaths.length) await importFiles(filePaths)
  }
  async function deleteSelected() {
    if (!selectedMedia || !window.confirm(`Delete “${selectedMedia.original_name}” from this pose? This cannot be undone.`)) return
    setBusy(true)
    try { await window.nexaDesktop.deleteMedia(selectedMedia.id); notify('Selected submission deleted.'); await onReload() } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  async function save() {
    setBusy(true)
    try { await window.nexaDesktop.saveEvaluation({ poseId: pose.id, scores, candidateFeedback: feedback }); notify('Evaluation saved. The next pose is now available.'); await onReload() } catch (error) { notify(error.message, true) } finally { setBusy(false) }
  }
  return <section className="pose-workspace"><header><div><p className="eyebrow">TRAINING {session.session_number} · POSE {pose.pose_number}</p><h2>{pose.pose_name}</h2></div><div className="pose-live-controls"><div className={`stopwatch ${running ? 'running' : ''}`}><Timer /><strong>{duration(liveSeconds)}</strong><span>{running ? 'Running' : liveSeconds ? 'Stopped' : 'Not started'}</span></div><button className={running ? 'stop-timer' : ''} disabled={busy || pose.status === 'EVALUATED'} onClick={toggleTimer}>{running ? <><Square /> Stop stopwatch</> : <><Play /> Start stopwatch</>}</button><button className="reset-timer" disabled={busy} onClick={resetTimer}><RotateCcw /> Reset stopwatch</button><span className="status-chip">{titleStatus(pose.status)}</span></div></header>
    <div className="comparison-grid"><figure><figcaption>Reference pose</figcaption>{reference ? <img src={reference} alt={`Training ${session.session_number} pose ${pose.pose_number} reference`} /> : <div className="empty-media">Reference image not available</div>}</figure><figure className={`candidate-drop-target ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={dropMedia}><figcaption>Candidate submission <small>Drop multiple images or videos directly here</small></figcaption><ProtectedMedia item={selectedMedia} alt={`${candidate.full_name}, ${pose.pose_name}`} disabled={busy} onBrowse={() => browseInput.current?.click()} />{selectedMedia && <div className="media-actions"><button className="secondary" disabled={busy} onClick={() => browseInput.current?.click()}><ImagePlus /> Browse files</button><button className="secondary" disabled={busy} onClick={() => replacementInput.current?.click()}><RefreshCw /> Replace selected</button><button className="delete-media" disabled={busy} onClick={deleteSelected}><Trash2 /> Delete selected</button></div>}<input ref={browseInput} type="file" accept="image/*,video/*" multiple onChange={browseFiles} hidden /><input ref={replacementInput} type="file" accept="image/*,video/*" onChange={replaceSelected} hidden />{dragging && <div className="drop-overlay"><ImagePlus /><strong>Release to secure all selected files</strong></div>}</figure></div>
    {!!pose.media.length && <div className="media-strip">{pose.media.map((item) => <button className={item.id === selectedMedia?.id ? 'active' : ''} key={item.id} onClick={() => setSelectedMediaId(item.id)}>{item.media_type === 'VIDEO' ? <Film /> : <img src={mediaUrl(item)} alt="" />}<span>{item.original_name}</span></button>)}</div>}
    <div className="evaluation-form"><h3>Pose evaluation</h3><div className="score-grid">{scoreFields.map(([key, label]) => <StarRating key={key} label={label} value={scores[key]} onChange={(value) => setScores({ ...scores, [key]: value })} />)}</div><label>Candidate report comments<textarea rows="3" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Included in the exported evaluation report" /></label><div className="evaluation-actions"><button className="save-evaluation" onClick={save} disabled={busy || running}><Save /> Save evaluation</button><div className="export-actions"><button className="export-report" onClick={onExport} disabled={busy}><FileDown /> Export PDF</button>{exportedReportPath && <button className="show-in-folder" onClick={onShowExport} disabled={busy} title={exportedReportPath}><FolderOpen /> Show in folder</button>}</div></div></div>
  </section>
}

function PrintableReport({ workspace }) {
  if (!workspace) return null
  return <article className="print-report"><header><p>NEXA MODEL</p><h1>Training Evaluation Report</h1><dl><div><dt>Candidate</dt><dd>{workspace.candidate.full_name}</dd></div><div><dt>Reference</dt><dd>{workspace.candidate.reference_id}</dd></div><div><dt>Classification</dt><dd>Private &amp; Confidential</dd></div></dl></header>{workspace.sessions.map((session) => <section key={session.id}><h2>Training {session.session_number}</h2>{session.poses.map((pose) => { const reference = references.get(`training-${session.session_number}-pose-${pose.pose_number}`); const candidateImage = pose.media.find((item) => item.media_type === 'IMAGE'); return <div className="report-pose" key={pose.id}><h3>{pose.pose_name} · {duration(pose.elapsed_seconds)} elapsed</h3><div className="report-comparison"><figure><figcaption>Reference</figcaption>{reference ? <img src={reference} alt="Reference pose" /> : <p>Not available</p>}</figure><figure><figcaption>Candidate</figcaption>{candidateImage ? <div className="protected-media"><img src={mediaUrl(candidateImage)} alt={`${workspace.candidate.full_name}, ${pose.pose_name}`} /><Watermark /></div> : <p>No image selected</p>}</figure></div><div className="report-scores">{scoreFields.map(([key, label]) => <span key={key}>{label}: <strong>{scoreText(pose.scores?.[key])}</strong></span>)}</div>{pose.candidate_feedback && <p className="report-feedback">{pose.candidate_feedback}</p>}</div>})}</section>)}</article>
}

export default function App() {
  const [drive, setDrive] = useState(null)
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState([])
  const [candidateId, setCandidateId] = useState('')
  const [workspace, setWorkspace] = useState(null)
  const [sessionId, setSessionId] = useState('')
  const [poseId, setPoseId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [runtime, setRuntime] = useState({ demoMode: false, dataFolder: 'NexaTraining' })
  const [exportedReportPath, setExportedReportPath] = useState('')
  const bridge = window.nexaDesktop
  function notify(text, error = false) { setMessage({ text, error }); window.setTimeout(() => setMessage(null), 5000) }
  async function boot() {
    setLoading(true)
    try {
      const [status, runtimeInfo] = await Promise.all([bridge.getDriveStatus(), bridge.getRuntimeInfo()]); setDrive(status); setRuntime(runtimeInfo)
      if (status.ready) { await bridge.initializeStorage(); const list = await bridge.listCandidates(); setCandidates(list); if (!candidateId && list[0]) setCandidateId(list[0].id) }
    } catch (error) { setDrive({ ready: false, error: error.message }) } finally { setLoading(false) }
  }
  async function loadWorkspace(id = candidateId, preferredSessionId = sessionId, preferredPoseId = poseId) {
    if (!id) { setWorkspace(null); return }
    const result = await bridge.getWorkspace(id); setWorkspace(result)
    const session = result.sessions.find((item) => item.id === preferredSessionId) || result.sessions.find((item) => item.status !== 'EVALUATED') || result.sessions.at(-1)
    setSessionId(session?.id || '')
    const pose = session?.poses.find((item) => item.id === preferredPoseId) || session?.poses.find((item) => item.status !== 'EVALUATED') || session?.poses[0]
    setPoseId(pose?.id || '')
  }
  useEffect(() => { boot() }, [])
  useEffect(() => { setExportedReportPath('') }, [candidateId])
  useEffect(() => {
    if (!drive?.ready) return undefined
    const interval = window.setInterval(async () => {
      try { const status = await bridge.getDriveStatus(); if (!status.ready) setDrive(status) } catch (error) { setDrive({ ready: false, error: error.message }) }
    }, 10000)
    return () => window.clearInterval(interval)
  }, [bridge, drive?.ready])
  useEffect(() => { if (drive?.ready && candidateId) loadWorkspace(candidateId, '', '') }, [candidateId, drive?.ready])
  const session = workspace?.sessions.find((item) => item.id === sessionId)
  const pose = session?.poses.find((item) => item.id === poseId)
  const nextTraining = useMemo(() => { const used = new Set(workspace?.sessions.map((item) => Number(item.session_number))); return [1, 2, 3, 4].find((number) => !used.has(number)) }, [workspace])
  async function syncCandidates() { setBusy(true); try { const result = await bridge.syncContactedCandidates(); setCandidates(result.candidates); if (!candidateId && result.candidates[0]) setCandidateId(result.candidates[0].id); notify(`${result.imported} Contacted candidate${result.imported === 1 ? '' : 's'} synced to X:.`) } catch (error) { notify(error.message, true) } finally { setBusy(false) } }
  async function addTraining() { setBusy(true); try { const created = await bridge.ensureSession(candidateId, nextTraining); await loadWorkspace(candidateId, created.id, ''); notify(`Training ${nextTraining} created locally.`) } catch (error) { notify(error.message, true) } finally { setBusy(false) } }
  async function exportReport() { setBusy(true); try { const result = await bridge.exportPdf(`${workspace.candidate.reference_id}-training-evaluation`); if (!result.canceled) { setExportedReportPath(result.filePath); notify(`PDF exported to ${result.filePath}`) } } catch (error) { notify(error.message, true) } finally { setBusy(false) } }
  async function showExportedReport() { setBusy(true); try { await bridge.showExportedReportInFolder(); notify('Exported PDF shown in Windows Explorer.') } catch (error) { setExportedReportPath(''); notify(error.message, true) } finally { setBusy(false) } }
  if (!bridge) return <DriveGate status={{ error: 'Desktop security bridge is unavailable. Start this project with npm run desktop:start.' }} loading={false} onRetry={() => {}} />
  if (loading || !drive?.ready) return <DriveGate status={drive} loading={loading} onRetry={boot} />
  return <><main className="app-shell"><CandidatePanel candidates={candidates} selectedId={candidateId} onSelect={setCandidateId} onSync={syncCandidates} busy={busy} demoMode={runtime.demoMode} />
    {message && <div className={`toast ${message.error ? 'error' : ''}`}>{message.error ? <AlertTriangle /> : <CheckCircle2 />}{message.text}</div>}
    {!workspace ? <section className="welcome"><HardDrive /><h2>Create or select a candidate</h2><p>All candidate records will be stored only on PRIVATE_SSD.</p></section> : <>
      <section className="workspace-heading"><div><p className="eyebrow">{workspace.candidate.reference_id}</p><h2>{workspace.candidate.full_name}</h2></div></section>
      <nav className="session-tabs">{workspace.sessions.map((item, index) => { const unlocked = workspace.sessions.slice(0, index).every((previous) => previous.status === 'EVALUATED'); return <button key={item.id} disabled={!unlocked} className={item.id === sessionId ? 'active' : ''} onClick={() => { setSessionId(item.id); setPoseId(item.poses.find((entry) => entry.status !== 'EVALUATED')?.id || item.poses[0]?.id || '') }}><strong>Training {item.session_number}</strong><span>{titleStatus(item.status)}</span></button> })}{nextTraining && <button className="add" onClick={addTraining} disabled={busy || (workspace.sessions.length > 0 && workspace.sessions.at(-1).status !== 'EVALUATED')}><strong>Training {nextTraining}</strong><span><Plus /> Add Training</span></button>}</nav>
      {!session ? <section className="welcome"><Plus /><h2>Add Training 1</h2><p>Create the first five-pose evaluation workspace.</p></section> : <><nav className="pose-tabs">{session.poses.map((item, index) => { const unlocked = session.poses.slice(0, index).every((previous) => previous.status === 'EVALUATED'); return <button key={item.id} disabled={!unlocked} className={item.id === poseId ? 'active' : ''} onClick={() => setPoseId(item.id)}><span>{item.pose_number}</span><strong>{item.pose_name}</strong><small>{item.timer_started_at ? `Running · ${duration(Number(item.elapsed_seconds || 0) + Math.max(0, Math.floor((Date.now() - Date.parse(item.timer_started_at)) / 1000)))}` : `${duration(item.elapsed_seconds)} · ${item.media.length} media`}</small></button> })}</nav>{pose && <PoseWorkspace candidate={workspace.candidate} session={session} pose={pose} onReload={() => loadWorkspace(candidateId, session.id, pose.id)} onExport={exportReport} onShowExport={showExportedReport} exportedReportPath={exportedReportPath} notify={notify} />}</>}
    </>}
  </main><PrintableReport workspace={workspace} /></>
}
