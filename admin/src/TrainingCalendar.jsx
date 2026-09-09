import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MapPin, MessageCircle, Plus, X } from 'lucide-react'
import { whatsappUrl } from './whatsapp.js'

const TIME_ZONE = 'Asia/Kuala_Lumpur'
const statusLabels = { SCHEDULED: 'Scheduled', CONFIRMED: 'Confirmed', COMPLETED: 'Completed', CANCELLED: 'Cancelled', NO_SHOW: 'No show' }
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthGrid(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

function appointmentTime(value) {
  return new Intl.DateTimeFormat('en-MY', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIME_ZONE }).format(new Date(value))
}

function appointmentTimeClass(value) {
  const hour = Number(new Intl.DateTimeFormat('en-MY', { hour: '2-digit', hourCycle: 'h23', timeZone: TIME_ZONE }).format(new Date(value)))
  if (hour >= 8 && hour <= 11) return 'time-morning'
  if (hour >= 12 && hour <= 17) return 'time-afternoon'
  if (hour >= 20 && hour <= 23) return 'time-night'
  return 'time-other'
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return (hours * 60) + minutes
}

function addMinutesToTime(value, minutesToAdd) {
  const total = timeToMinutes(value) + minutesToAdd
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function durationMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0
  return timeToMinutes(endTime) - timeToMinutes(startTime)
}

function durationLabel(minutes) {
  if (minutes <= 0) return '—'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!hours) return `${remainingMinutes} minutes`
  return `${hours} ${hours === 1 ? 'Hour' : 'Hours'}${remainingMinutes ? ` ${remainingMinutes} minutes` : ''}`
}

function defaultForm(date = new Date()) {
  const nextHour = Math.min(18, Math.max(9, new Date().getHours() + 1))
  const time = `${String(nextHour).padStart(2, '0')}:00`
  return { candidate_id: '', date: dateKey(date), time, end_time: addMinutesToTime(time, 90), status: 'SCHEDULED', location: 'Decided by Candidate', notes: '' }
}

function AppointmentDialog({ appointment, candidates, selectedDate, saving, error, onClose, onSave }) {
  const [form, setForm] = useState(() => appointment ? {
    candidate_id: appointment.candidate_id,
    date: appointment.scheduled_at.slice(0, 10),
    time: appointment.scheduled_at.slice(11, 16),
    end_time: addMinutesToTime(appointment.scheduled_at.slice(11, 16), appointment.duration_minutes),
    status: appointment.status,
    location: appointment.location || '',
    notes: appointment.notes || '',
  } : defaultForm(selectedDate))
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))
  function submit(event) {
    event.preventDefault()
    const calculatedDuration = durationMinutes(form.time, form.end_time)
    if (calculatedDuration <= 0) {
      event.currentTarget.elements.end_time.setCustomValidity('End time must be later than start time.')
      event.currentTarget.reportValidity()
      return
    }
    onSave({
      ...form,
      scheduled_at: `${form.date}T${form.time}:00+08:00`,
      duration_minutes: calculatedDuration,
    })
  }
  const calculatedDuration = durationMinutes(form.time, form.end_time)
  return <div className="calendar-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <form className="calendar-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-dialog-title" onSubmit={submit}>
      <header><div><p className="eyebrow">TRAINING APPOINTMENT</p><h2 id="appointment-dialog-title">{appointment ? 'Edit schedule' : 'Schedule candidate'}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close"><X size={20} /></button></header>
      <div className="appointment-form-grid">
        <label className="wide">Candidate<select required value={form.candidate_id} onChange={update('candidate_id')}><option value="">Select a candidate</option>{candidates.map((candidate) => <option value={candidate.application_id} key={candidate.application_id}>{candidate.full_name}</option>)}</select></label>
        <label>Date<input required type="date" value={form.date} onChange={update('date')} /></label>
        <label>Status<select value={form.status} onChange={update('status')}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Start time<input required type="time" value={form.time} onChange={update('time')} /></label>
        <label>End time<input required name="end_time" type="time" value={form.end_time} onChange={(event) => { event.target.setCustomValidity(''); update('end_time')(event) }} /></label>
        <label className="wide duration-field">Duration<input value={durationLabel(calculatedDuration)} readOnly aria-readonly="true" /></label>
        <label className="wide">Location<input value={form.location} onChange={update('location')} placeholder="Studio or online meeting" /></label>
        <label className="wide">Private notes<textarea rows="3" value={form.notes} onChange={update('notes')} placeholder="Preparation, availability, or follow-up notes" /></label>
      </div>
      {error && <p className="calendar-form-error" role="alert">{error}</p>}
      <footer><button className="secondary-button" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="calendar-primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <CalendarDays size={17} />}{appointment ? 'Save changes' : 'Add to calendar'}</button></footer>
    </form>
  </div>
}

export default function TrainingCalendar({ api, showToast }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [appointments, setAppointments] = useState([])
  const [candidates, setCandidates] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [editing, setEditing] = useState(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const days = useMemo(() => monthGrid(month), [month])
  const range = useMemo(() => ({ from: dateKey(days[0]), to: dateKey(days.at(-1)) }), [days])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [calendar, candidateData] = await Promise.all([
        api(`/api/admin/training/calendar?from=${range.from}&to=${range.to}`),
        api('/api/admin/training/candidates'),
      ])
      setAppointments(calendar.appointments)
      setCandidates(candidateData.candidates)
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }, [api, range.from, range.to])
  useEffect(() => { load() }, [load])

  const byDate = useMemo(() => appointments.reduce((groups, appointment) => {
    const key = appointment.scheduled_at.slice(0, 10)
    groups[key] = [...(groups[key] || []), appointment]
    return groups
  }, {}), [appointments])
  const selectedKey = dateKey(selectedDate)
  const selectedAppointments = byDate[selectedKey] || []
  const activeAppointments = appointments.filter((item) => !['CANCELLED', 'COMPLETED'].includes(item.status))
  const confirmed = activeAppointments.filter((item) => item.status === 'CONFIRMED').length
  const upcoming = activeAppointments.filter((item) => Date.parse(item.scheduled_at) >= Date.now()).length

  function openNew(date = selectedDate) { setSelectedDate(date); setEditing(null); setDialogOpen(true) }
  function moveMonth(delta) { setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1)) }
  async function saveAppointment(form) {
    setSaving(true); setError('')
    try {
      await api(editing ? `/api/admin/training/appointments/${editing.id}` : '/api/admin/training/appointments', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(form) })
      setDialogOpen(false); setEditing(null)
      showToast(editing ? 'Training appointment updated.' : 'Candidate added to the training calendar.')
      await load()
    } catch (reason) { setError(reason.message) } finally { setSaving(false) }
  }

  return <div className="training-calendar-page">
    <section className="page-heading calendar-page-heading"><div><h1>Training calendar</h1></div></section>
    <section className="calendar-summary" aria-label="Calendar summary">
      <article><span>Appointments shown</span><strong>{appointments.length}</strong><small>{range.from} to {range.to}</small></article>
      <article><span>Upcoming</span><strong>{upcoming}</strong><small>Still requiring action</small></article>
      <article><span>Confirmed</span><strong>{confirmed}</strong><small>Candidates ready to attend</small></article>
    </section>
    {error && !dialogOpen && <p className="training-error" role="alert">{error}<button onClick={load}>Try again</button></p>}
    <div className="calendar-workspace">
      <section className="calendar-panel" aria-busy={loading}>
        <header className="calendar-toolbar"><div><button onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft /></button><button onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight /></button><button className="calendar-today" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(today) }}>Today</button></div><h2>{new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric' }).format(month)}</h2></header>
        <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        {loading ? <div className="calendar-loading"><LoaderCircle className="spin" /> Loading schedule…</div> : <div className="calendar-grid">{days.map((day) => {
          const key = dateKey(day); const items = byDate[key] || []; const muted = day.getMonth() !== month.getMonth(); const today = key === dateKey(new Date())
          return <button type="button" className={`calendar-day${muted ? ' outside-month' : ''}${today ? ' today' : ''}${key === selectedKey ? ' selected' : ''}`} onClick={() => setSelectedDate(day)} onDoubleClick={() => openNew(day)} key={key} aria-label={`${key}, ${items.length} appointments`}>
            <span className="calendar-day-number">{day.getDate()}</span>
            <span className="calendar-day-events">{items.slice(0, 3).map((item) => <span className={`calendar-event event-${item.status.toLowerCase()} ${appointmentTimeClass(item.scheduled_at)}`} title={item.full_name} key={item.id}><b>{appointmentTime(item.scheduled_at)}</b>{item.full_name}</span>)}{items.length > 3 && <small>+{items.length - 3} more</small>}</span>
          </button>
        })}</div>}
      </section>
      <aside className="calendar-agenda">
        <header><div><p>{new Intl.DateTimeFormat('en-MY', { weekday: 'long' }).format(selectedDate)}</p><h2>{new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'long' }).format(selectedDate)}</h2></div><button onClick={() => openNew(selectedDate)} aria-label="Add appointment on selected date"><Plus size={19} /></button></header>
        {!selectedAppointments.length ? <div className="agenda-empty"><CalendarDays /><strong>No training scheduled</strong></div> : <div className="agenda-list">{selectedAppointments.map((item) => <article key={item.id}>
          <div className="agenda-time"><strong>{appointmentTime(item.scheduled_at)}</strong><span>{durationLabel(item.duration_minutes)}</span><div className="agenda-profile-photo">{item.profile_photo_url ? <img src={item.profile_photo_url} alt="" loading="lazy" /> : <span aria-hidden="true">{item.full_name.charAt(0)}</span>}</div></div>
          <div className="agenda-details"><span className={`appointment-status appointment-${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span><h3>{item.full_name}</h3><p><Clock3 size={14} /> Training appointment</p>{item.location && <p><MapPin size={14} /> {item.location}</p>}{item.notes && <small>{item.notes}</small>}
            <div className="agenda-actions"><button onClick={() => { setEditing(item); setDialogOpen(true) }}>Edit</button><a href={whatsappUrl(item.phone, `Hi ${item.full_name.split(' ')[0]}, this is a reminder about your training appointment on ${new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE }).format(new Date(item.scheduled_at))} at ${appointmentTime(item.scheduled_at)}.`)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a></div>
          </div>
        </article>)}</div>}
      </aside>
    </div>
    {dialogOpen && <AppointmentDialog appointment={editing} candidates={candidates} selectedDate={selectedDate} saving={saving} error={error} onClose={() => { setDialogOpen(false); setEditing(null); setError('') }} onSave={saveAppointment} />}
  </div>
}
