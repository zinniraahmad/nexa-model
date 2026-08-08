import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Copy, Database, Download, ExternalLink, Image, ImageOff, LoaderCircle, LogIn, LogOut, Mail, MapPin, Moon, Phone, RefreshCw, Search, ShieldAlert, Sun, Tag, Trash2, Users, WifiOff, X, ZoomIn, ZoomOut } from 'lucide-react'
import { applicationSections, declarationFields, photoFields } from '../../src/applicationForm.js'

const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'
const statusLabels = { submitted: 'Submitted', reviewing: 'Reviewing', contacted: 'Contacted', interview_scheduled: 'Interview scheduled', shortlisted: 'Shortlisted', rejected: 'Rejected' }
const reviewStatusOptions = [
  ['submitted', 'Submitted'],
  ['reviewing', 'Reviewing'],
  ['shortlisted', 'Shortlisted'],
  ['contacted', 'Contacted'],
  ['rejected', 'Rejected'],
]
const emptySummary = { total: 0, submitted: 0, reviewing: 0, contacted: 0, interview_scheduled: 0, shortlisted: 0, rejected: 0, retention_overdue: 0 }
const sortOptions = [
  ['submitted_at:desc', 'Newest first'], ['submitted_at:asc', 'Oldest first'],
  ['age:asc', 'Age: youngest first'], ['age:desc', 'Age: oldest first'],
  ['location:asc', 'Location: A–Z'], ['location:desc', 'Location: Z–A'],
  ['status:asc', 'Status: A–Z'], ['status:desc', 'Status: Z–A'],
]
const photoMap = new Map(photoFields.map((field) => [field.key, field.label]))
const photoCategories = [
  { key: 'side-profile', label: 'Side Profile', prefixes: ['side_profile'] },
  { key: 'full-body', label: 'Full Body', prefixes: ['full_body_front', 'full_body_side'] },
  { key: 'portfolio', label: 'Portfolio', prefixes: ['portfolio'] },
  { key: 'casual', label: 'Casual', prefixes: ['casual_lifestyle'] },
  { key: 'activewear', label: 'Activewear', prefixes: ['activewear_portfolio'] },
]
const importantFields = new Set(['full_name', 'age', 'current_state', 'current_location', 'phone', 'instagram', 'height_cm', 'weekend_availability', 'start_availability'])

function photoMatchesCategory(photo, category) {
  return category.prefixes.some((prefix) => photo.photo_type === prefix || photo.photo_type?.startsWith(`${prefix}_`))
}

function formatDate(value) {
  if (!value) return '—'
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short', timeZone: MALAYSIA_TIME_ZONE }).format(new Date(normalized))
}

function initialParam(name, fallback = '') {
  return new URLSearchParams(window.location.search).get(name) || fallback
}

function initialSort() {
  const value = initialParam('sort', 'submitted_at:desc')
  return sortOptions.some(([option]) => option === value) ? value : 'submitted_at:desc'
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function exportApplications(applications) {
  const header = ['Application reference', 'Full name', 'Age', 'Location', 'Status', 'Submitted (Malaysia)', 'Retention due (Malaysia)', 'Tags']
  const rows = applications.map((item) => [item.application_id, item.full_name, item.age, item.current_location, statusLabels[item.application_status] || item.application_status, formatDate(item.submitted_at), formatDate(item.retention_due_at), item.tags?.join(', ') || ''])
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `nexa-applications-${new Date().toLocaleDateString('en-CA', { timeZone: MALAYSIA_TIME_ZONE })}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

function ResponseValue({ value }) {
  const displayed = displayValue(value)
  const url = typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) ? value.trim() : null
  if (!url) return displayed

  return <>
    <a className="desktop-response-link" href={url} target="_blank" rel="noopener noreferrer" title="Open link in a new tab">{displayed}</a>
    <span className="mobile-response-text">{displayed}</span>
  </>
}

function isMissing(value) {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)
}

function ResponseField({ field, value, missing }) {
  return <div className={missing ? 'missing-field' : undefined}>
    <dt>{field.label}<span className="field-markers">{importantFields.has(field.key) && <em>Important</em>}{missing && <em className="missing-marker">Missing required</em>}</span></dt>
    <dd><ResponseValue value={value} /></dd>
  </div>
}

function ReviewTimeline({ record }) {
  const events = [{ key: 'submitted', title: 'Application submitted', detail: 'Applicant completed the application.', at: record.submitted_at }]
  const history = record.history || []
  history.forEach((entry) => events.push({
    key: `review-${entry.id || entry.changed_at}`,
    title: entry.previous_status === entry.new_status ? 'Review updated' : `Status changed to ${statusLabels[entry.new_status] || entry.new_status}`,
    detail: entry.changed_by ? `Updated by ${entry.changed_by}` : 'Admin review updated.',
    at: entry.changed_at,
    entry,
  }))
  if (!history.length && record.reviewed_at) events.push({ key: 'legacy-review', title: `Current status: ${statusLabels[record.application_status] || record.application_status}`, detail: record.reviewed_by ? `Last reviewed by ${record.reviewed_by}` : 'Previously reviewed.', at: record.reviewed_at })
  return <section className="panel timeline-panel" aria-labelledby="timeline-title">
    <p className="eyebrow">ACTIVITY</p><h3 id="timeline-title">Application timeline</h3>
    <ol>{events.map((event) => <li className={event.warning ? 'timeline-warning' : undefined} key={event.key}><span /><div><strong>{event.title}</strong><p>{event.detail}</p><time>{formatDate(event.at)} MYT</time>{event.entry && <details className="timeline-changes"><summary>Compare changes</summary>
      {event.entry.previous_status !== event.entry.new_status && <p><span>Status</span><del>{statusLabels[event.entry.previous_status] || event.entry.previous_status || 'None'}</del><b>→</b><ins>{statusLabels[event.entry.new_status] || event.entry.new_status}</ins></p>}
      {event.entry.previous_notes !== event.entry.new_notes && <p><span>Private notes</span><del>{event.entry.previous_notes || 'No notes'}</del><b>→</b><ins>{event.entry.new_notes || 'No notes'}</ins></p>}
      {JSON.stringify(event.entry.previous_tags || []) !== JSON.stringify(event.entry.new_tags || []) && <p><span>Tags</span><del>{event.entry.previous_tags?.join(', ') || 'No tags'}</del><b>→</b><ins>{event.entry.new_tags?.join(', ') || 'No tags'}</ins></p>}
    </details>}</div></li>)}</ol>
  </section>
}

class AdminApiError extends Error {
  constructor(message, { code = 'UNKNOWN_ERROR', status = 0 } = {}) {
    super(message)
    this.name = 'AdminApiError'
    this.code = code
    this.status = status
  }
}

async function api(path, options) {
  let response
  try {
    response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  } catch {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine
    throw new AdminApiError(offline ? 'You are offline. Check your internet connection and try again.' : 'The admin service could not be reached. Check your connection and try again.', { code: 'NETWORK_ERROR' })
  }

  const isJson = response.headers.get('Content-Type')?.includes('application/json')
  const data = isJson ? await response.json().catch(() => ({})) : {}
  if (response.status === 401 || (!isJson && response.redirected)) {
    throw new AdminApiError('Your Cloudflare Access session has expired. Sign in again to continue.', { code: 'SESSION_EXPIRED', status: 401 })
  }
  if (response.status === 403) {
    throw new AdminApiError(data.error || 'You do not have permission to access this admin page.', { code: 'FORBIDDEN', status: 403 })
  }
  if (!response.ok || !isJson) {
    throw new AdminApiError(data.error || 'The admin service returned an unexpected response.', {
      code: data.code || (response.status >= 500 ? 'SERVICE_ERROR' : 'UNKNOWN_ERROR'),
      status: response.status,
    })
  }
  return data
}

const errorIcons = {
  SESSION_EXPIRED: LogIn,
  FORBIDDEN: ShieldAlert,
  DATABASE_ERROR: Database,
  IMAGEKIT_ERROR: ImageOff,
  EMAIL_ERROR: Mail,
  EMAIL_NOT_CONFIGURED: Mail,
  NETWORK_ERROR: WifiOff,
}

function signInAgain() {
  const returnUrl = encodeURIComponent(window.location.href)
  window.location.assign(`/cdn-cgi/access/login?redirect_url=${returnUrl}`)
}

function ErrorState({ error, onRetry, onBack }) {
  const Icon = errorIcons[error?.code] || AlertTriangle
  const sessionExpired = error?.code === 'SESSION_EXPIRED'
  const canRetry = onRetry && !sessionExpired && error?.code !== 'FORBIDDEN'
  return <div className="empty error-state" role="alert">
    <span className="error-icon"><Icon size={22} /></span>
    <div><strong>{sessionExpired ? 'Session expired' : error?.code === 'FORBIDDEN' ? 'Access denied' : 'Something went wrong'}</strong><p>{error?.message || 'Unable to load admin data.'}</p></div>
    <div className="error-actions">
      {canRetry && <button onClick={onRetry}><RefreshCw size={15} /> Retry</button>}
      {sessionExpired && <button onClick={signInAgain}><LogIn size={15} /> Sign in again</button>}
      {onBack && <button className="secondary-button" onClick={onBack}>Back</button>}
    </div>
  </div>
}

function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{status === 'orphaned' ? 'Cleanup needed' : (statusLabels[status] || status)}</span>
}

function AnimatedCount({ value }) {
  const target = Number(value || 0)
  const [displayed, setDisplayed] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) {
      setDisplayed(target)
      return undefined
    }
    setDisplayed(0)
    const startedAt = performance.now()
    const duration = 650
    let frame
    function update(now) {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - ((1 - progress) ** 3)
      setDisplayed(Math.min(target, Math.floor(target * eased)))
      if (progress < 1) frame = requestAnimationFrame(update)
      else setDisplayed(target)
    }
    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return <strong aria-label={String(target)}>{displayed}</strong>
}

function ApplicationList({ applications, loading, selectedIds, onToggle, onSelect, onDelete }) {
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Loading applications…</div>
  if (!applications.length) return <div className="empty"><Users /> No applications match your filters.</div>
  return <div className="application-list">
    {applications.map((item) => <div className={`application-row${item.retention_warning ? ' retention-row' : ''}${item.application_status === 'orphaned' ? ' orphaned-row' : ''}${selectedIds.has(item.application_id) ? ' selected-row' : ''}`} key={item.application_id} role={item.application_status === 'orphaned' ? undefined : 'button'} tabIndex={item.application_status === 'orphaned' ? undefined : '0'} onClick={() => { if (item.application_status !== 'orphaned') onSelect(item.application_id) }} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter' && item.application_status !== 'orphaned') onSelect(item.application_id) }}>
      <input className="row-checkbox" type="checkbox" checked={selectedIds.has(item.application_id)} disabled={item.application_status === 'orphaned'} aria-label={`Select ${item.full_name}`} onClick={(event) => event.stopPropagation()} onChange={() => onToggle(item.application_id)} />
      <div className="applicant-primary"><strong>{item.full_name}</strong><span>{item.email}</span></div>
      <span className="location">{item.current_location}</span>
      <span className="age">{item.age ?? '—'} yrs</span>
      <span className="photo-count"><Image size={15} /> {item.photo_count}</span>
      <StatusBadge status={item.application_status} />
      <time className={item.retention_overdue ? 'retention-overdue' : ''} title={`Review for deletion by ${formatDate(item.retention_due_at)}`}>{item.retention_warning ? <Clock size={13} /> : null}{formatDate(item.submitted_at)}</time>
      <button className="delete-row-button" title={`Delete ${item.full_name}`} aria-label={`Delete ${item.full_name}`} onClick={(event) => { event.stopPropagation(); onDelete(item) }}><Trash2 size={17} /></button>
    </div>)}
  </div>
}

function DeleteDialog({ application, deleting, error, onCancel, onConfirm }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) onCancel() }}>
    <section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
      <button className="dialog-close" onClick={onCancel} disabled={deleting} aria-label="Close"><X size={18} /></button>
      <div className="dialog-icon"><Trash2 size={22} /></div>
      <h2 id="delete-title">Are you sure you want to delete?</h2>
      <p><strong>{application.full_name}</strong>, all application records and every stored ImageKit photo will be permanently removed.{application.application_status === 'orphaned' ? ' This is an incomplete legacy record marked for cleanup.' : ''}</p>
      {error && <p className="form-error" role="alert">{error.message || error}{error.code === 'SESSION_EXPIRED' && <button type="button" className="inline-action" onClick={signInAgain}>Sign in again</button>}</p>}
      <div className="dialog-actions"><button className="cancel-button" onClick={onCancel} disabled={deleting}>Cancel</button><button className="delete-confirm-button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes'}</button></div>
    </section>
  </div>
}

function ShortlistDialog({ application, confirming, error, onCancel, onConfirm }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirming) onCancel() }}>
    <section className="dialog shortlist-dialog" role="alertdialog" aria-modal="true" aria-labelledby="shortlist-title">
      <button className="dialog-close" onClick={onCancel} disabled={confirming} aria-label="Close"><X size={18} /></button>
      <div className="dialog-icon"><Mail size={22} /></div>
      <h2 id="shortlist-title">Shortlist this candidate?</h2>
      <p>Are you sure you want to shortlist <strong>{application.full_name}</strong>? This action will save the review and send a shortlist email to the candidate.</p>
      {error && <p className="form-error" role="alert">{error.message || error}{error.code === 'SESSION_EXPIRED' && <button type="button" className="inline-action" onClick={signInAgain}>Sign in again</button>}</p>}
      <div className="dialog-actions"><button className="cancel-button" onClick={onCancel} disabled={confirming}>No</button><button className="shortlist-confirm-button" onClick={onConfirm} disabled={confirming}>{confirming ? 'Sending…' : 'Yes'}</button></div>
    </section>
  </div>
}

function Detail({ applicationId, previousId, nextId, onBack, onNavigate, onUpdated }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('submitted')
  const [notes, setNotes] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [savedAt, setSavedAt] = useState(null)
  const [copied, setCopied] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [shortlistDialogOpen, setShortlistDialogOpen] = useState(false)
  const [shortlisting, setShortlisting] = useState(false)
  const [shortlistError, setShortlistError] = useState(null)

  function loadDetail() {
    setError(null)
    api(`/api/admin/applications/${encodeURIComponent(applicationId)}`)
      .then(({ application }) => {
        setRecord(application)
        setStatus(application.application_status)
        setNotes(application.admin_notes || '')
        setTagsText((application.tags || []).join(', '))
        setSavedAt(null)
      })
      .catch(setError)
  }

  useEffect(loadDetail, [applicationId])

  useEffect(() => {
    if (lightboxIndex === null) return undefined
    const photos = record?.photos || []
    function handleKeyDown(event) {
      if (event.key === 'Escape') setLightboxIndex(null)
      if (event.key === 'ArrowLeft' && photos.length) { setLightboxIndex((current) => (current - 1 + photos.length) % photos.length); setZoom(1) }
      if (event.key === 'ArrowRight' && photos.length) { setLightboxIndex((current) => (current + 1) % photos.length); setZoom(1) }
      if (event.key === '+' || event.key === '=') setZoom((current) => Math.min(3, current + .5))
      if (event.key === '-') setZoom((current) => Math.max(1, current - .5))
    }
    document.body.classList.add('lightbox-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => { document.body.classList.remove('lightbox-open'); window.removeEventListener('keydown', handleKeyDown) }
  }, [lightboxIndex, record?.photos])

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(record.application_id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  async function saveReview(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))]
      const result = await api(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH', body: JSON.stringify({ status, notes, tags }),
      })
      applySavedReview(result, status, notes, tags)
      setTagsText(tags.join(', '))
      setSavedAt(new Date().toISOString())
      onUpdated()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  function applySavedReview(result, nextStatus, nextNotes, tags) {
    setRecord((current) => ({
      ...current,
      application_status: nextStatus,
      admin_notes: nextNotes,
      tags,
      reviewed_at: result.review?.changed_at || current.reviewed_at,
      reviewed_by: result.review?.changed_by || current.reviewed_by,
      shortlisted_email_sent_at: result.shortlisted_email_sent_at || current.shortlisted_email_sent_at,
      history: result.review ? [...(current.history || []), result.review] : current.history,
    }))
  }

  function changeStatus(nextStatus) {
    if (nextStatus === 'shortlisted' && record.application_status !== 'shortlisted') {
      setShortlistError(null)
      setShortlistDialogOpen(true)
      return
    }
    setStatus(nextStatus)
  }

  async function confirmShortlist() {
    setShortlisting(true)
    setShortlistError(null)
    setError(null)
    try {
      const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))]
      const result = await api(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'shortlisted', notes, tags, send_shortlisted_email: true }),
      })
      setStatus('shortlisted')
      setTagsText(tags.join(', '))
      applySavedReview(result, 'shortlisted', notes, tags)
      setSavedAt(new Date().toISOString())
      setShortlistDialogOpen(false)
      onUpdated()
    } catch (err) {
      setShortlistError(err)
    } finally {
      setShortlisting(false)
    }
  }

  if (error && !record) return <ErrorState error={error} onRetry={loadDetail} onBack={onBack} />
  if (!record) return <div className="empty"><LoaderCircle className="spin" /> Loading application…</div>

  const categorizedPhotos = photoCategories.map((category) => ({
    ...category,
    photos: record.photos.filter((photo) => photoMatchesCategory(photo, category)),
  })).filter((category) => category.photos.length)
  const otherPhotos = record.photos.filter((photo) => !photoMatchesCategory(photo, { prefixes: ['front_facing', 'front_profile'] }) && !photoCategories.some((category) => photoMatchesCategory(photo, category)))
  if (otherPhotos.length) categorizedPhotos.push({ key: 'other', label: 'Other Photos', photos: otherPhotos })
  const missingFields = [...applicationSections.flatMap((section) => section.fields), ...declarationFields]
    .filter((field) => field.required && isMissing(record.responses[field.key]))
  const missingFieldKeys = new Set(missingFields.map((field) => field.key))
  const missingPhotos = photoFields.filter((field) => {
    const count = record.photos.filter((photo) => photo.photo_type === field.key || photo.photo_type?.startsWith(`${field.key}_`)).length
    return field.required && count < field.min
  })
  const incompleteCount = missingFields.length + missingPhotos.length
  const currentTags = (record.tags || []).join(', ')
  const unsaved = status !== record.application_status || notes !== (record.admin_notes || '') || tagsText !== currentTags
  const activePhoto = lightboxIndex === null ? null : record.photos[lightboxIndex]
  const featuredPhoto = record.photos.find((photo) => photo.photo_type === 'front_facing' || photo.photo_type?.startsWith('front_facing_'))
  return <>
    <div className="detail-navigation">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> All applications</button>
      <div><button disabled={!previousId} onClick={() => onNavigate(previousId)}><ChevronLeft size={16} /> Previous</button><button disabled={!nextId} onClick={() => onNavigate(nextId)}>Next <ChevronRight size={16} /></button></div>
    </div>
    <section className="applicant-hero">
      <div className="featured-photo">
        {featuredPhoto ? <button type="button" onClick={() => { setLightboxIndex(record.photos.findIndex((photo) => photo.file_id === featuredPhoto.file_id)); setZoom(1) }} aria-label="Open front-facing photo">
          <img src={featuredPhoto.file_url} alt="Front-facing applicant" />
          <span><ZoomIn size={16} /> View photo</span>
        </button> : <div className="featured-photo-missing"><ImageOff size={28} /><span>Front-facing photo unavailable</span></div>}
      </div>
      <div className="applicant-hero-content">
        <div className="hero-meta-row">
          <div className="reference-id"><span>Reference ID</span><code>{record.application_id}</code><button type="button" onClick={copyReference} aria-label="Copy reference ID">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : 'Copy'}</button></div>
          <StatusBadge status={record.application_status} />
        </div>
        <h2>{record.full_name}</h2>
        <div className="hero-facts">
          <div><span>Age</span><strong>{displayValue(record.responses.age)} years</strong></div>
          <div><span>Current location</span><strong><MapPin size={17} />{record.current_location || displayValue(record.responses.current_location)}</strong></div>
        </div>
        <div className="hero-contact">
          <a href={`mailto:${record.email}`}><Mail size={17} /><span>{record.email}</span></a>
          <a href={`https://wa.me/${record.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Phone size={17} /><span>{record.phone}</span></a>
        </div>
        <p className="hero-dates">Submitted {formatDate(record.submitted_at)} · Review for deletion by {formatDate(record.retention_due_at)}</p>
      </div>
    </section>
    <div className="detail-layout">
      <main className="detail-main">
        <ReviewTimeline record={record} />

        <section className={`panel application-overview${incompleteCount ? ' has-incomplete' : ''}`}>
          <div><p className="eyebrow">OVERVIEW</p><h3>Information categories</h3></div>
          <div className="completeness-status">{incompleteCount ? <><AlertCircle size={18} /><strong>{incompleteCount} incomplete required item{incompleteCount === 1 ? '' : 's'}</strong></> : <><Check size={18} /><strong>Required information complete</strong></>}</div>
          <nav aria-label="Application information categories">
            {applicationSections.map((section) => <a href={`#section-${section.id}`} key={section.id}>{section.title}{section.fields.some((field) => missingFieldKeys.has(field.key)) && <span>!</span>}</a>)}
            <a href="#section-declaration">Declaration{declarationFields.some((field) => missingFieldKeys.has(field.key)) && <span>!</span>}</a>
            <a href="#section-photos">Photos{missingPhotos.length > 0 && <span>!</span>}</a>
          </nav>
        </section>

        {applicationSections.map((section) => {
          const rows = section.fields.filter((field) => field.required || field.key in record.responses)
          if (!rows.length) return null
          return <section className="panel response-section" id={`section-${section.id}`} key={section.id}>
            <p className="eyebrow">{section.eyebrow}</p><h3>{section.title}</h3>
            <dl>{rows.map((field) => <ResponseField field={field} value={record.responses[field.key]} missing={missingFieldKeys.has(field.key)} key={field.key} />)}</dl>
          </section>
        })}

        <section className="panel response-section" id="section-declaration">
          <p className="eyebrow">FINAL</p><h3>Declaration & notes</h3>
          <dl>{declarationFields.filter((field) => field.required || field.key in record.responses).map((field) => <ResponseField field={field} value={record.responses[field.key]} missing={missingFieldKeys.has(field.key)} key={field.key} />)}</dl>
        </section>

        <section className="panel photos-panel" id="section-photos">
          <p className="eyebrow">IMAGEKIT</p><h3>Submitted photos</h3>
          {missingPhotos.length > 0 && <div className="missing-photo-alert"><AlertCircle size={17} /><span>Missing required: {missingPhotos.map((field) => field.label).join(', ')}</span></div>}
          {categorizedPhotos.map((category) => <div className="photo-group" key={category.key}>
            <h4>{category.label}</h4>
            <div className="photo-grid">{category.photos.map((photo) => <button type="button" onClick={() => { setLightboxIndex(record.photos.findIndex((item) => item.file_id === photo.file_id)); setZoom(1) }} key={photo.file_id}>
              <img src={photo.file_url} alt={photoMap.get(photo.photo_type) || category.label} loading="lazy" />
              <span><ZoomIn size={14} /> {photo.file_name}</span>
            </button>)}</div>
          </div>)}
        </section>
      </main>

      <aside className="review-panel panel">
        <p className="eyebrow">INTERNAL REVIEW</p><h3>Decision</h3>
        <form onSubmit={saveReview}>
          <label>Status<select value={status} onChange={(event) => changeStatus(event.target.value)}>{record.application_status === 'interview_scheduled' && <option value="interview_scheduled">Interview scheduled (legacy)</option>}{reviewStatusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Tags<div className="tag-input"><Tag size={15} /><input value={tagsText} maxLength="320" onChange={(event) => setTagsText(event.target.value)} placeholder="e.g. commercial, KL, priority" /></div><span>Comma-separated, up to 10 tags.</span></label>
          <label>Private notes<textarea rows="9" maxLength="10000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add review notes…" /></label>
          {unsaved && <section className="change-preview" aria-label="Unsaved review comparison">
            <strong>Before → After</strong>
            {status !== record.application_status && <div><span>Status</span><p><del>{statusLabels[record.application_status] || record.application_status}</del><b>→</b><ins>{statusLabels[status] || status}</ins></p></div>}
            {notes !== (record.admin_notes || '') && <div><span>Private notes</span><p className="notes-comparison"><del>{record.admin_notes || 'No notes'}</del><b>→</b><ins>{notes || 'No notes'}</ins></p></div>}
          </section>}
          {error && <p className="form-error" role="alert">{error.message || error}{error.code === 'SESSION_EXPIRED' && <button type="button" className="inline-action" onClick={signInAgain}>Sign in again</button>}</p>}
          <div className={`save-state${unsaved ? ' unsaved' : ''}`}>{unsaved ? 'Unsaved changes' : savedAt ? `Saved ${formatDate(savedAt)} MYT` : 'No unsaved changes'}</div>
          <button className="primary-button" disabled={saving || !unsaved}>{saving ? 'Saving…' : 'Save review'}</button>
        </form>
        {record.shortlisted_email_sent_at && <small className="email-sent-state"><Check size={14} /> Shortlist email sent<br /><span>{formatDate(record.shortlisted_email_sent_at)} MYT</span></small>}
        {record.reviewed_by && <small>Last reviewed by {record.reviewed_by}<br />{formatDate(record.reviewed_at)}</small>}
      </aside>
    </div>
    {shortlistDialogOpen && <ShortlistDialog application={record} confirming={shortlisting} error={shortlistError} onCancel={() => { setShortlistDialogOpen(false); setShortlistError(null) }} onConfirm={confirmShortlist} />}
    {activePhoto && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxIndex(null) }}>
      <div className="lightbox-toolbar">
        <span>{lightboxIndex + 1} / {record.photos.length}</span>
        <div><button type="button" onClick={() => setZoom((current) => Math.max(1, current - .5))} disabled={zoom === 1} aria-label="Zoom out"><ZoomOut /></button><strong>{Math.round(zoom * 100)}%</strong><button type="button" onClick={() => setZoom((current) => Math.min(3, current + .5))} disabled={zoom === 3} aria-label="Zoom in"><ZoomIn /></button><a href={activePhoto.file_url} target="_blank" rel="noreferrer" aria-label="Open original in new tab"><ExternalLink /></a><button type="button" onClick={() => setLightboxIndex(null)} aria-label="Close photo viewer"><X /></button></div>
      </div>
      <button className="lightbox-previous" type="button" onClick={() => { setLightboxIndex((lightboxIndex - 1 + record.photos.length) % record.photos.length); setZoom(1) }} aria-label="Previous photo"><ChevronLeft /></button>
      <div className="lightbox-canvas"><img src={activePhoto.file_url} alt={photoMap.get(activePhoto.photo_type) || activePhoto.file_name} style={{ transform: `scale(${zoom})` }} /></div>
      <button className="lightbox-next" type="button" onClick={() => { setLightboxIndex((lightboxIndex + 1) % record.photos.length); setZoom(1) }} aria-label="Next photo"><ChevronRight /></button>
      <div className="lightbox-caption"><strong>{photoMap.get(activePhoto.photo_type) || activePhoto.file_name}</strong><span>Use ← → to navigate, + − to zoom, Esc to close</span></div>
    </div>}
  </>
}

export default function App() {
  const [applications, setApplications] = useState([])
  const [summary, setSummary] = useState(emptySummary)
  const [selected, setSelected] = useState(() => initialParam('application') || null)
  const [search, setSearch] = useState(() => initialParam('search'))
  const [status, setStatus] = useState(() => initialParam('status'))
  const [dateFrom, setDateFrom] = useState(() => initialParam('date_from'))
  const [dateTo, setDateTo] = useState(() => initialParam('date_to'))
  const [retention, setRetention] = useState(() => initialParam('retention'))
  const [sortValue, setSortValue] = useState(initialSort)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [email, setEmail] = useState('')
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkStatus, setBulkStatus] = useState('reviewing')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const [sort, direction] = sortValue.split(':')
  const query = useMemo(() => new URLSearchParams({
    ...(search && { search }), ...(status && { status }), ...(dateFrom && { date_from: dateFrom }),
    ...(dateTo && { date_to: dateTo }), ...(retention && { retention }), sort, direction,
  }).toString(), [search, status, dateFrom, dateTo, retention, sort, direction])
  const retentionWarnings = applications.filter((application) => application.retention_warning)
  const selectedIndex = applications.findIndex((application) => application.application_id === selected)
  const previousId = selectedIndex > 0 ? applications[selectedIndex - 1].application_id : null
  const nextId = selectedIndex >= 0 && selectedIndex < applications.length - 1 ? applications[selectedIndex + 1].application_id : null

  function loadApplications() {
    setLoading(true)
    setError(null)
    api(`/api/admin/applications?${query}`)
      .then((data) => {
        setApplications(data.applications)
        setSummary(data.summary || emptySummary)
        setLastUpdated(new Date().toISOString())
        const availableIds = new Set(data.applications.map((application) => application.application_id))
        setSelectedIds((current) => new Set([...current].filter((id) => availableIds.has(id))))
      })
      .catch(setError)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(loadApplications, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const params = new URLSearchParams(query)
    if (selected) params.set('application', selected)
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [query, selected])

  useEffect(() => { api('/api/admin/session').then((data) => setEmail(data.email)).catch(() => {}) }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    localStorage.setItem('nexa-admin-theme-v2', nextTheme)
    setTheme(nextTheme)
  }

  function selectApplication(applicationId) {
    setSelected(applicationId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleApplication(applicationId) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(applicationId)) next.delete(applicationId)
      else next.add(applicationId)
      return next
    })
  }

  function toggleAllVisible() {
    const visibleIds = applications.filter((item) => item.application_status !== 'orphaned').map((item) => item.application_id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds))
  }

  async function updateSelectedStatus() {
    setBulkSaving(true)
    setBulkMessage('')
    try {
      const result = await api('/api/admin/applications/bulk', {
        method: 'PATCH', body: JSON.stringify({ application_ids: [...selectedIds], status: bulkStatus }),
      })
      setBulkMessage(`${result.updated} application${result.updated === 1 ? '' : 's'} updated.`)
      setSelectedIds(new Set())
      loadApplications()
    } catch (err) {
      setBulkMessage(err.message)
    } finally {
      setBulkSaving(false)
    }
  }

  async function deleteApplication() {
    setDeleting(true)
    setDeleteError('')
    try {
      await api(`/api/admin/applications/${encodeURIComponent(deleteTarget.application_id)}`, { method: 'DELETE' })
      setDeleteTarget(null)
      loadApplications()
    } catch (err) {
      setDeleteError(err)
    } finally {
      setDeleting(false)
    }
  }

  return <div className="admin-shell">
    <header className="admin-header"><div><span className="wordmark">NEXA MODEL</span><span className="admin-label">ADMIN</span></div><div className="account"><span>{email}</span><button className="theme-button" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><a href="/cdn-cgi/access/logout" title="Sign out"><LogOut size={17} /></a></div></header>
    <div className={`admin-body${selected ? ' detail-page' : ''}`}>
      {!selected && <>
        <section className="page-heading"><div><p className="eyebrow">TALENT DATABASE</p><h1>Applications</h1><p>Review applicant information and photos in one place.</p></div><div className="result-meta"><div className="total"><strong>{applications.length}</strong><span>results</span></div>{lastUpdated && <small>Updated {formatDate(lastUpdated)} MYT</small>}</div></section>
        <section className="summary-grid" aria-label="Application summary">
          <article className="summary-card summary-total">
            <span className="summary-label"><i aria-hidden="true" />Total applications</span>
            <AnimatedCount value={summary.total} />
          </article>
          {Object.entries(statusLabels).map(([key, label]) => <article className={`summary-card summary-${key}`} key={key}>
            <span className="summary-label"><i aria-hidden="true" />{label}</span>
            <AnimatedCount value={summary[key]} />
          </article>)}
        </section>
        {retentionWarnings.length > 0 && <section className="retention-alert" role="status"><AlertTriangle size={20} /><div><strong>{retentionWarnings.length} retention review{retentionWarnings.length === 1 ? '' : 's'} due</strong><span>These applications reach their six-month deletion date within 30 days or are already overdue. Review before deleting.</span></div></section>}
        <section className="toolbar primary-filters"><label><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone or reference" /></label><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></section>
        <section className="advanced-filters" aria-label="Application filters">
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label>Retention<select value={retention} onChange={(event) => setRetention(event.target.value)}><option value="">All retention</option><option value="warning">Due within 30 days</option><option value="overdue">Overdue</option></select></label>
          <label>Sort<select value={sortValue} onChange={(event) => setSortValue(event.target.value)}>{sortOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <button className="secondary-button clear-filters" onClick={() => { setSearch(''); setStatus(''); setDateFrom(''); setDateTo(''); setRetention(''); setSortValue('submitted_at:desc') }}>Clear</button>
          <button className="export-button" disabled={loading || !applications.length} onClick={() => exportApplications(applications)}><Download size={16} /> Export CSV</button>
        </section>
        {!error && !loading && applications.length > 0 && <section className="selection-toolbar">
          <label><input type="checkbox" checked={applications.filter((item) => item.application_status !== 'orphaned').length > 0 && applications.filter((item) => item.application_status !== 'orphaned').every((item) => selectedIds.has(item.application_id))} onChange={toggleAllVisible} /> Select all visible</label>
          {selectedIds.size > 0 && <div><strong>{selectedIds.size} selected</strong><select aria-label="Bulk status" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>{Object.entries(statusLabels).filter(([value]) => value !== 'shortlisted').map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button onClick={updateSelectedStatus} disabled={bulkSaving}>{bulkSaving ? 'Updating…' : 'Apply status'}</button></div>}
          {bulkMessage && <span role="status">{bulkMessage}</span>}
        </section>}
        {error ? <ErrorState error={error} onRetry={loadApplications} /> : <ApplicationList applications={applications} loading={loading} selectedIds={selectedIds} onToggle={toggleApplication} onSelect={selectApplication} onDelete={(item) => { setDeleteError(''); setDeleteTarget(item) }} />}
      </>}
      {selected && <Detail applicationId={selected} previousId={previousId} nextId={nextId} onBack={() => setSelected(null)} onNavigate={selectApplication} onUpdated={loadApplications} />}
    </div>
    {deleteTarget && <DeleteDialog application={deleteTarget} deleting={deleting} error={deleteError} onCancel={() => setDeleteTarget(null)} onConfirm={deleteApplication} />}
  </div>
}
