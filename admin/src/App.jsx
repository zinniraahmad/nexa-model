import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Image, LoaderCircle, LogOut, Mail, MapPin, Moon, Phone, Search, Sun, Trash2, Users, X } from 'lucide-react'
import { applicationSections, declarationFields, photoFields } from '../../src/applicationForm.js'

const statusLabels = { submitted: 'Submitted', reviewing: 'Reviewing', shortlisted: 'Shortlisted', rejected: 'Rejected' }
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
  return new Intl.DateTimeFormat('en-MY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${value.replace(' ', 'T')}Z`))
}

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return value === null || value === undefined || value === '' ? '—' : String(value)
}

async function api(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Unable to load admin data.')
  return data
}

function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{statusLabels[status] || status}</span>
}

function ApplicationList({ applications, loading, onSelect, onDelete }) {
  if (loading) return <div className="empty"><LoaderCircle className="spin" /> Loading applications…</div>
  if (!applications.length) return <div className="empty"><Users /> No applications match your filters.</div>
  return <div className="application-list">
    {applications.map((item) => <div className="application-row" key={item.application_id} role="button" tabIndex="0" onClick={() => onSelect(item.application_id)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(item.application_id) }}>
      <div className="applicant-primary"><strong>{item.full_name}</strong><span>{item.email}</span></div>
      <span className="location">{item.current_location}</span>
      <span className="photo-count"><Image size={15} /> {item.photo_count}</span>
      <StatusBadge status={item.application_status} />
      <time>{formatDate(item.submitted_at)}</time>
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
      <p><strong>{application.full_name}</strong> and all application records will be permanently removed from the database.</p>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions"><button className="cancel-button" onClick={onCancel} disabled={deleting}>Cancel</button><button className="delete-confirm-button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes'}</button></div>
    </section>
  </div>
}

function Detail({ applicationId, onBack, onUpdated }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('submitted')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    api(`/api/admin/applications/${encodeURIComponent(applicationId)}`)
      .then(({ application }) => {
        setRecord(application)
        setStatus(application.application_status)
        setNotes(application.admin_notes || '')
      })
      .catch((err) => setError(err.message))
  }, [applicationId])

  async function saveReview(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(`/api/admin/applications/${encodeURIComponent(applicationId)}`, {
        method: 'PATCH', body: JSON.stringify({ status, notes }),
      })
      setRecord((current) => ({ ...current, application_status: status, admin_notes: notes }))
      onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (error && !record) return <div className="empty error">{error}<button onClick={onBack}>Back</button></div>
  if (!record) return <div className="empty"><LoaderCircle className="spin" /> Loading application…</div>

  const categorizedPhotos = photoCategories.map((category) => ({
    ...category,
    photos: record.photos.filter((photo) => photoMatchesCategory(photo, category)),
  })).filter((category) => category.photos.length)
  const otherPhotos = record.photos.filter((photo) => !photoCategories.some((category) => photoMatchesCategory(photo, category)))
  if (otherPhotos.length) categorizedPhotos.push({ key: 'other', label: 'Other Photos', photos: otherPhotos })
  return <>
    <button className="back-button" onClick={onBack}><ArrowLeft size={17} /> All applications</button>
    <section className="detail-heading">
      <div><p className="eyebrow">{record.application_id}</p><h2>{record.full_name}</h2><p>Submitted {formatDate(record.submitted_at)}</p></div>
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
          <label>Private notes<textarea rows="9" maxLength="10000" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add review notes…" /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save review'}</button>
        </form>
        {record.reviewed_by && <small>Last reviewed by {record.reviewed_by}<br />{formatDate(record.reviewed_at)}</small>}
      </aside>
    </div>
  </>
}

export default function App() {
  const [applications, setApplications] = useState([])
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const query = useMemo(() => new URLSearchParams({ ...(search && { search }), ...(status && { status }) }).toString(), [search, status])

  function loadApplications() {
    setLoading(true)
    setError('')
    api(`/api/admin/applications?${query}`)
      .then((data) => setApplications(data.applications))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(loadApplications, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => { api('/api/admin/session').then((data) => setEmail(data.email)).catch(() => {}) }, [])

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = nextTheme
    localStorage.setItem('nexa-admin-theme', nextTheme)
    setTheme(nextTheme)
  }

  async function deleteApplication() {
    setDeleting(true)
    setDeleteError('')
    try {
      await api(`/api/admin/applications/${encodeURIComponent(deleteTarget.application_id)}`, { method: 'DELETE' })
      setApplications((current) => current.filter((item) => item.application_id !== deleteTarget.application_id))
      setDeleteTarget(null)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  return <div className="admin-shell">
    <header className="admin-header"><div><span className="wordmark">NEXA MODEL</span><span className="admin-label">ADMIN</span></div><div className="account"><span>{email}</span><button className="theme-button" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button><a href="/cdn-cgi/access/logout" title="Sign out"><LogOut size={17} /></a></div></header>
    <div className="admin-body">
      {!selected && <>
        <section className="page-heading"><div><p className="eyebrow">TALENT DATABASE</p><h1>Applications</h1><p>Review applicant information and photos in one place.</p></div><div className="total"><strong>{applications.length}</strong><span>results</span></div></section>
        <section className="toolbar"><label><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone or reference" /></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></section>
        {error ? <div className="empty error">{error}</div> : <ApplicationList applications={applications} loading={loading} onSelect={setSelected} onDelete={(item) => { setDeleteError(''); setDeleteTarget(item) }} />}
      </>}
      {selected && <Detail applicationId={selected} onBack={() => setSelected(null)} onUpdated={loadApplications} />}
    </div>
    {deleteTarget && <DeleteDialog application={deleteTarget} deleting={deleting} error={deleteError} onCancel={() => setDeleteTarget(null)} onConfirm={deleteApplication} />}
  </div>
}
