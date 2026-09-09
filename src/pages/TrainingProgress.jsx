import { useEffect, useState } from 'react'
import { AlertCircle, Award, CheckCircle2, Clock3, LoaderCircle, TrendingUp } from 'lucide-react'

const scoreLabels = {
  pose_accuracy: 'Pose accuracy', facial_expression: 'Facial expression', product_presentation: 'Product presentation',
  body_control: 'Body control', feedback_responsiveness: 'Feedback response', movement_control: 'Movement control',
  transition_quality: 'Transition quality', video_execution_consistency: 'Video consistency',
  instruction_compliance: 'Instruction compliance', camera_awareness: 'Camera awareness', pose_stability: 'Pose stability',
}

function duration(seconds) {
  if (seconds === null || seconds === undefined) return '—'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

function Paragraphs({ value }) {
  if (!value) return <p className="progress-muted">No feedback entered.</p>
  return String(value).split(/\n+/).map((line) => <p key={line}>{line}</p>)
}

export function TraineeSessionResult({ session, expanded, onToggle }) {
  const metrics = session.performanceMetrics
  return <article className="progress-session-card">
    <button className="progress-session-heading" type="button" aria-expanded={expanded} onClick={onToggle}>
      <span><small>PUBLISHED RESULT</small><strong>Training {session.sessionNumber}</strong></span>
      <span className="progress-published"><CheckCircle2 size={17} /> Complete</span>
    </button>
    {expanded && <div className="progress-session-content">
      {session.summary && <section className="progress-summary"><h3>Trainer summary</h3><Paragraphs value={session.summary} /></section>}
      <dl className="progress-metrics">
        <div><dt>Poses completed</dt><dd>{metrics.posesCompleted}</dd></div>
        {metrics.averageAttempts !== null && <div><dt>Average attempts</dt><dd>{metrics.averageAttempts}</dd></div>}
        {metrics.averageCompletionSeconds !== null && <div><dt>Average pose time</dt><dd>{duration(metrics.averageCompletionSeconds)}</dd></div>}
        <div><dt>First-attempt success</dt><dd>{metrics.firstAttemptSuccessCount} / {metrics.posesCompleted}</dd></div>
      </dl>
      <div className="progress-feedback-grid">
        <section><h3><Award size={18} /> Strengths</h3><Paragraphs value={session.strengths} /></section>
        <section><h3><TrendingUp size={18} /> Areas to improve</h3><Paragraphs value={session.areasForImprovement} /></section>
        <section><h3><Clock3 size={18} /> Next training focus</h3><Paragraphs value={session.nextTrainingFocus} /></section>
      </div>
      {session.poseResults.length > 0 && <section className="progress-poses"><h3>Pose results</h3>{session.poseResults.map((pose) => <details key={pose.poseNumber}>
        <summary><span>Pose {pose.poseNumber}</span><strong>{pose.poseName}</strong></summary>
        <div>{Object.entries(pose.scores).length > 0 && <div className="progress-scores">{Object.entries(pose.scores).map(([key, value]) => <div key={key}><span>{scoreLabels[key] || key}</span><strong>{value}<small>/5</small></strong></div>)}</div>}
        </div>
      </details>)}</section>}
    </div>}
  </article>
}

export default function TrainingProgress({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/public/progress/${encodeURIComponent(token)}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Training progress is temporarily unavailable.')
        return body
      })
      .then((body) => { setData(body); setExpanded(body.trainingSessions.at(-1)?.sessionNumber ?? null) })
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message) })
    return () => controller.abort()
  }, [token])

  return <main id="main-content" className="trainee-progress-page">
    <header className="progress-brand"><a href="/" aria-label="Nexa Model home">NEXA MODEL</a><span>TRAINING PROGRESS</span></header>
    {!data && !error && <section className="progress-state" aria-live="polite"><LoaderCircle className="progress-spin" /><h1>Loading your progress…</h1><p>Your published training results are being prepared.</p></section>}
    {error && <section className="progress-state progress-error"><AlertCircle /><h1>Progress unavailable</h1><p>{error}</p><small>Please contact Nexa if you need a new link.</small></section>}
    {data && <div className="progress-wrap">
      <section className="progress-hero"><p className="progress-eyebrow">PRIVATE TRAINING RECORD</p><h1>{data.candidateDisplayName}</h1><p>Follow your improvement across the Nexa training programme. Only results approved and published by your trainer appear here.</p></section>
      <section className="progress-track" aria-label="Four-session training progress">{[1, 2, 3, 4].map((number) => {
        const published = data.trainingSessions.some((session) => session.sessionNumber === number)
        return <div className={published ? 'is-published' : ''} key={number}><span>{published ? <CheckCircle2 size={18} /> : number}</span><strong>Training {number}</strong><small>{published ? 'Published' : 'Not published'}</small></div>
      })}</section>
      {data.trainingSessions.length ? <section className="progress-results"><h2>Published results</h2>{data.trainingSessions.map((session) => <TraineeSessionResult key={session.sessionNumber} session={session} expanded={expanded === session.sessionNumber} onToggle={() => setExpanded((current) => current === session.sessionNumber ? null : session.sessionNumber)} />)}</section> : <section className="progress-empty"><Clock3 /><h2>No published results yet</h2><p>Your trainer is still preparing your evaluation. Return to this same private link after the result is published.</p></section>}
      <footer className="progress-footer"><strong>NEXA MODEL</strong><p>This page is private. Please do not share its link.</p></footer>
    </div>}
  </main>
}
