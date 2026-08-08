import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Clock, Database, Download, ExternalLink, Image, ImageOff, LoaderCircle, LogIn, LogOut, Mail, MapPin, Moon, Phone, RefreshCw, Search, ShieldAlert, Sun, Tag, Trash2, Users, WifiOff, X } from 'lucide-react'
import { applicationSections, declarationFields, photoFields } from '../../src/applicationForm.js'

const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'
const statusLabels = { submitted: 'Submitted', reviewing: 'Reviewing', contacted: 'Contacted', interview_scheduled: 'Interview scheduled', shortlisted: 'Shortlisted', rejected: 'Rejected' }
const emptySummary = { submitted: 0, reviewing: 0, contacted: 0, interview_scheduled: 0, shortlisted: 0, rejected: 0, retention_overdue: 0 }
const sortOptions = [
  ['submitted_at:desc', 'Newest first'], ['submitted_at:asc', 'Oldest first'],
  ['age:asc', 'Age: youngest first'], ['age:desc', 'Age: oldest first'],
  ['location:asc', 'Location: A–Z'], ['location:desc', 'Location: Z–A'],
  ['status:asc', 'Status: A–Z'], ['status:desc', 'Status: Z–A'],
]
const fieldMap = new Map(
  [...applicationSections.flatMap((section) => section.fields), ...declarationFields]
    .map((field) => [field.key, field.label]),
)
const photoMap = new Map(photoFields.map((field) => [field.key, field.label]))
const photoCategories = [
  { key: 'portfolio', label: 'Portfolio', prefixes: ['portfolio'] },
  { key: 'activewear', label: 'Activewear', prefixes: ['activewear_portfolio'] },
  { key: 'casual', label: 'Casual', prefixes: ['casual_lifestyle'] },
  { key: 'front-facing', label: 'Front Facing', prefixes: ['front_facing', 'front_profile'] },
  { key: 'full-body', label: 'Full Body', prefixes: ['full_body_front', 'full_body_side'] },
  { key: 'side-profile', label: 'Side Profile', prefixes: ['side_profile'] },
]

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

function Detail({ applicationId, previousId, nextId, onBack, onNavigate, onUpdated }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('submitted')
  const [notes, setNotes] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [savedAt, setSavedAt] = useState(null)

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

  async function saveReview(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const tags = [...new Set(tagsText.split(',').map((tag) => tag.trim()).filter(Boolean))]
      await api(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH', body: JSON.stringify({ status, notes, tags }),
      })
      setRecord((current) => ({ ...current, application_status: status, admin_notes: notes, tags }))
      setTagsText(tags.join(', '))
      setSavedAt(new Date().toISOString())
      onUpdated()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (error && !record) return <ErrorState error={error} onRetry={loadDetail} onBack={onBack} />
  if (!record) return <div className="empty"><LoaderCircle className="spin" /> Loading application…</div>

  const categorizedPhotos = photoCategories.map((category) => ({
    ...category,
    photos: record.photos.filter((photo) => photoMatchesCategory(photo, category)),
  })).filter((category) => category.photos.length)
  const otherPhotos = record.photos.filter((photo) => !photoCategories.some((category) => photoMatchesCategory(photo, category)))
  if (otherPhotos.length) categorizedPhotos.push({ key: 'other', label: 'Other Photos', photos: otherPhotos })
  const currentTags = (record.tags || []).join(', ')
  const unsaved = status !== record.application_status || notes !== (record.admin_notes || '') || tagsText !== currentTags
  return <>
    <div className="detail-navigation">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> All applications</button>
      <div><button disabled={!previousId} onClick={() => onNavigate(previousId)}><ChevronLeft size={16} /> Previous</button><button disabled={!nextId} onClick={() => onNavigate(nextId)}>Next <ChevronRight size={16} /></button></div>
    </div>
    <section className="detail-heading">
      <div><p className="eyebrow">{record.application_id}</p><h2>{record.full_name}</h2><p>Submitted {formatDate(record.submitted_at)} · Review for deletion by {formatDate(record.retention_due_at)}</p></div>
      <StatusBadge status={record.application_status} />
    </section>
    <div className="detail-layout">
      <main className="detail-main">
        <section className="panel contact-grid">
          <a href={`mailto:${record.email}`}><Mail size={17} /><span>{record.email}</span></a>
          <a href={`https://wa.me/${record.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Phone size={17} /><span>{record.phone}</span></a>
          <div><MapPin size={17} /><span>{record.current_location}</span></div>
        </section>

        {applicationSections.map((section) => {
          const rows = section.fields.filter((field) => field.key in record.responses)
          if (!rows.length) return null
          return <section className="panel response-section" key={section.id}>
            <p className="eyebrow">{section.eyebrow}</p><h3>{section.title}</h3>
            <dl>{rows.map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{displayValue(record.responses[field.key])}</dd></div>)}</dl>
          </section>
        })}

        <section className="panel response-section">
          <p className="eyebrow">FINAL</p><h3>Declaration & notes</h3>
          <dl>{declarationFields.filter((field) => field.key in record.responses).map((field) => <div key={field.key}><dt>{fieldMap.get(field.key)}</dt><dd>{displayValue(record.responses[field.key])}</dd></div>)}</dl>
        </section>

        <section className="panel photos-panel">
          <p className="eyebrow">IMAGEKIT</p><h3>Submitted photos</h3>
          {categorizedPhotos.map((category) => <div className="photo-group" key={category.key}>
            <h4>{category.label}</h4>
            <div className="photo-grid">{category.photos.map((photo) => <a href={photo.file_url} target="_blank" rel="noreferrer" key={photo.file_id}>
              <img src={photo.file_url} alt={photoMap.get(photo.photo_type) || category.label} loading="lazy" />
              <span><ExternalLink size={14} /> {photo.file_name}</span>
            </a>)}</div>
          </div>)}
        </section>
      </main>

      <aside className="review-panel panel">
        <p className="eyebrow">INTERNAL REVIEW</p><h3>Decision</h3>
        <form onSubmit={saveReview}>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Tags<div className="tag-input"><Tag size={15} /><input value={tagsText} maxLength="320" onChange={(event) => setTagsText(event.target.value)} placeholder="e.g. commercial, KL, priority" /></div><span>Comma-separated, up to 10 tags.</span></label>
          <label>Private notes<textarea rows="9" maxLength="10000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add review notes…" /></label>
          {error && <p className="form-error" role="alert">{error.message || error}{error.code === 'SESSION_EXPIRED' && <button type="button" className="inline-action" onClick={signInAgain}>Sign in again</button>}</p>}
          <div className={`save-state${unsaved ? ' unsaved' : ''}`}>{unsaved ? 'Unsaved changes' : savedAt ? `Saved ${formatDate(savedAt)} MYT` : 'No unsaved changes'}</div>
          <button className="primary-button" disabled={saving || !unsaved}>{saving ? 'Saving…' : 'Save review'}</button>
        </form>
        {record.reviewed_by && <small>Last reviewed by {record.reviewed_by}<br />{formatDate(record.reviewed_at)}</small>}
      </aside>
    </div>
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
    <div className="admin-body">
      {!selected && <>
        <section className="page-heading"><div><p className="eyebrow">TALENT DATABASE</p><h1>Applications</h1><p>Review applicant information and photos in one place.</p></div><div className="result-meta"><div className="total"><strong>{applications.length}</strong><span>results</span></div>{lastUpdated && <small>Updated {formatDate(lastUpdated)} MYT</small>}</div></section>
        <section className="summary-grid" aria-label="Application summary">
          {Object.entries(statusLabels).map(([key, label]) => <article className={`summary-card summary-${key}`} key={key}>
            <span className="summary-label"><i aria-hidden="true" />{label}</span>
            <strong>{summary[key]}</strong>
          </article>)}
          <article className="summary-card summary-overdue">
            <span className="summary-label"><AlertTriangle size={15} aria-hidden="true" />Retention overdue</span>
            <strong>{summary.retention_overdue}</strong>
          </article>
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
          {selectedIds.size > 0 && <div><strong>{selectedIds.size} selected</strong><select aria-label="Bulk status" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><button onClick={updateSelectedStatus} disabled={bulkSaving}>{bulkSaving ? 'Updating…' : 'Apply status'}</button></div>}
          {bulkMessage && <span role="status">{bulkMessage}</span>}
        </section>}
        {error ? <ErrorState error={error} onRetry={loadApplications} /> : <ApplicationList applications={applications} loading={loading} selectedIds={selectedIds} onToggle={toggleApplication} onSelect={selectApplication} onDelete={(item) => { setDeleteError(''); setDeleteTarget(item) }} />}
      </>}
      {selected && <Detail applicationId={selected} previousId={previousId} nextId={nextId} onBack={() => setSelected(null)} onNavigate={selectApplication} onUpdated={loadApplications} />}
    </div>
    {deleteTarget && <DeleteDialog application={deleteTarget} deleting={deleting} error={deleteError} onCancel={() => setDeleteTarget(null)} onConfirm={deleteApplication} />}
  </div>
}
