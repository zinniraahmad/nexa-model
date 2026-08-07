import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ImagePlus, LoaderCircle } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from '../components/ThemeToggle'
import officialLogo from '../assets/images/official_logo_2Kpx.png'
import poseA from '../assets/images/cat_A.png'
import poseB from '../assets/images/cat_B.png'
import poseC from '../assets/images/cat_C.png'
import poseD from '../assets/images/cat_D.png'
import poseE from '../assets/images/cat_E.png'
import trainingImage from '../assets/images/training.png'
import { Introduction } from './Apply'
import { applicationSections, declarationFields, photoFields } from '../applicationForm'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg']
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/
const poseReferences = [
  ['A', 'Standing Pose', poseA], ['B', 'Side Angle Pose', poseB],
  ['C', 'Floor Pose', poseC], ['D', 'Movement Pose', poseD], ['E', 'Product-Focused Pose', poseE],
]

function OptionText({ option }) {
  const separator = ' — '
  if (!option.includes(separator)) return <span>{option}</span>
  const [title, ...description] = option.split(separator)
  return <span className="described-option"><strong>{title}</strong><small>{description.join(separator)}</small></span>
}

function FileThumbnail({ file }) {
  const [url, setUrl] = useState('')
  const [previewFailed, setPreviewFailed] = useState(false)
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])
  if (previewFailed) return <span className="raw-file-preview">IMAGE<small>{file.name}</small></span>
  return url ? <img src={url} alt={file.name} onError={() => setPreviewFailed(true)} /> : null
}

function TurnstileWidget({ onToken, resetKey }) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef()
  const [siteKey, setSiteKey] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Configuration unavailable')))
      .then((config) => {
        if (!config.turnstile_site_key) throw new Error('Security verification is not configured')
        setSiteKey(config.turnstile_site_key)
      })
      .catch(() => setLoadError('Security verification is temporarily unavailable.'))
  }, [])

  useEffect(() => {
    if (!siteKey || !containerRef.current) return undefined
    let cancelled = false
    let widgetId
    const render = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return
      containerRef.current.replaceChildren()
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        retry: 'auto',
        'retry-interval': 3000,
        callback: (token) => { setLoadError(''); onToken(token) },
        'expired-callback': () => { setLoadError('Security verification expired. Please try again.'); onToken('') },
        'error-callback': (errorCode) => {
          setLoadError(`Security verification could not connect. Retrying automatically… (${errorCode || 'network error'})`)
          onToken('')
          return false
        },
      })
      widgetIdRef.current = widgetId
    }
    const existing = document.querySelector('script[data-nexa-turnstile]')
    if (window.turnstile) render()
    else if (existing) existing.addEventListener('load', render, { once: true })
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.nexaTurnstile = 'true'
      script.addEventListener('load', render, { once: true })
      script.addEventListener('error', () => setLoadError('Security verification could not be loaded.'), { once: true })
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      existing?.removeEventListener('load', render)
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId)
      widgetIdRef.current = undefined
    }
  }, [siteKey, resetKey, onToken])

  return <div className="turnstile-field">
    <div ref={containerRef} />
    {loadError && <div className="turnstile-recovery" role="alert"><small className="field-warning">{loadError}</small>{widgetIdRef.current !== undefined && <button type="button" className="underlined-button" onClick={() => { setLoadError(''); window.turnstile?.reset(widgetIdRef.current) }}>Try again</button>}</div>}
  </div>
}

function CustomSelect({ field, value, onChange, fieldId }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  function choose(option) {
    onChange(option)
    setOpen(false)
  }

  return <div className={`custom-select${open ? ' is-open' : ''}`} ref={containerRef}>
    <button id={fieldId} className="custom-select-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <span className={value ? '' : 'custom-select-placeholder'}>{value || 'Select an option'}</span><ChevronDown size={17} />
    </button>
    {open && <div className="custom-select-menu" role="listbox" aria-labelledby={fieldId}>
      {field.options.map((option) => <button type="button" role="option" aria-selected={value === option} className={value === option ? 'selected' : ''} key={option} onClick={() => choose(option)}>{option}</button>)}
    </div>}
  </div>
}

function SectionExtras({ sectionId }) {
  if (sectionId === 'poses') return <div className="reference-block"><h3>Posing references <em>Rujukan pose</em></h3><div className="reference-gallery">{poseReferences.map(([category, title, image]) => <figure key={category}><figcaption><b>Category {category} - {title}</b></figcaption><img src={image} alt={`Category ${category}: ${title}`} /></figure>)}</div></div>
  if (sectionId === 'rates') return <div className="section-rate-list"><div><span>Free Hair <em>Tidak bertudung</em></span><strong>RM160–RM180 <small>/ hour · jam</small></strong></div><div><span>Free Hair OR Hijab <em>Tidak bertudung ATAU bertudung</em></span><strong>RM180–RM200 <small>/ hour · jam</small></strong></div><div><span>Both Free Hair AND Hijab <em>Tidak bertudung DAN bertudung</em></span><strong>RM380–RM400 <small>/ hour · jam</small></strong></div><p>Final rates and assignment details will be confirmed before you accept a project.<em>Kadar akhir dan maklumat tugasan akan disahkan sebelum anda menerima projek.</em></p></div>
  if (sectionId === 'training') return <div className="reference-block"><h3>Training reference <em>Rujukan latihan</em></h3><figure className="training-reference"><img src={trainingImage} alt="Nexa Model training reference" /></figure></div>
  return null
}

function Field({ field, value, onChange, onBlur }) {
  const fieldId = `field-${field.key}`
  const label = <><span>{field.label}{field.required && <b className="required-mark"> *</b>}</span>{field.labelBm && <small className="bm-text">{field.labelBm}</small>}{field.help && <small className="field-help">{field.help}</small>}{field.helpBm && <small className="field-help bm-text">{field.helpBm}</small>}</>

  if (field.type === 'radio') return (
    <fieldset className="choice-field"><legend>{label}</legend><div className="choice-grid">{field.options.map((option) => <label className="choice-option" key={option}><input type="radio" name={field.key} value={option} checked={value === option} onChange={() => onChange(option)} required={field.required} /><OptionText option={option} /></label>)}</div></fieldset>
  )

  if (field.type === 'checkbox') {
    const selected = Array.isArray(value) ? value : []
    return <fieldset className="choice-field"><legend>{label}</legend><div className="choice-grid">{field.options.map((option, index) => <label className="choice-option" key={option}><input type="checkbox" checked={selected.includes(option)} required={field.required && index === 0 && !selected.length} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span>{option}</span></label>)}</div></fieldset>
  }

  if (field.type === 'scale') return (
    <fieldset className="choice-field"><legend>{label}</legend><div className="scale-options">{Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min + index).map((number) => <label key={number}><span>{number}</span><input type="radio" name={field.key} value={number} checked={Number(value) === number} onChange={() => onChange(number)} required={field.required} /></label>)}</div><div className="scale-labels"><span>{field.minLabel}</span><span>{field.maxLabel}</span></div></fieldset>
  )

  if (field.type === 'textarea') return <label className="text-field" htmlFor={fieldId}>{label}<textarea id={fieldId} value={value || ''} onChange={(event) => onChange(event.target.value)} rows="5" required={field.required} /></label>
  if (field.type === 'select') return <div className="text-field select-field"><div className="field-label">{label}</div><CustomSelect field={field} fieldId={fieldId} value={value} onChange={onChange} /></div>

  const showEmailWarning = field.type === 'email' && value && !VALID_EMAIL.test(value)
  return <label className={`text-field${showEmailWarning ? ' field-invalid' : ''}`} htmlFor={fieldId}>{label}<input id={fieldId} type={field.type || 'text'} value={value || ''} onChange={(event) => onChange(event.target.value)} onBlur={() => onBlur?.(value)} required={field.required} min={field.min} max={field.max} maxLength={field.maxLength} autoComplete={field.autocomplete} placeholder={field.placeholder} pattern={field.type === 'email' ? '[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}' : undefined} />{showEmailWarning && <small className="field-warning" role="alert">Please enter a complete email address, for example name@gmail.com or name@yahoo.com.<em>Sila masukkan alamat e-mel yang lengkap, contohnya nama@gmail.com atau nama@yahoo.com.</em></small>}</label>
}

function FormSection({ section, answers, setAnswer, onBack, onNext, onFieldBlur }) {
  function submit(event) {
    event.preventDefault()
    onNext()
  }
  return <form className="application-form expanded-form" onSubmit={submit}>
    <header className="form-section-heading"><p className="section-label">{section.eyebrow}</p><h2>{section.title}</h2><em className="section-title-bm">{section.titleBm}</em><p>{section.description}</p><p className="bm-text">{section.descriptionBm}</p></header>
    <SectionExtras sectionId={section.id} />
    <div className="form-fields">{section.fields.map((field) => <Field key={field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswer(field.key, value)} onBlur={(value) => onFieldBlur?.(field, value)} />)}</div>
    <div className="application-actions"><button className="underlined-button" type="button" onClick={onBack}>Back</button><button className="button button-dark" type="submit">Continue <ArrowRight size={17} /></button></div>
  </form>
}

export default function TalentApplication() {
  const [step, setStep] = useState(0)
  const [introductionAccepted, setIntroductionAccepted] = useState(false)
  const [answers, setAnswers] = useState({})
  const [photos, setPhotos] = useState({})
  const [applicationId, setApplicationId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [message, setMessage] = useState('')
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const [uploadToken, setUploadToken] = useState('')

  const photoStep = applicationSections.length + 1
  const declarationStep = photoStep + 1
  const successStep = declarationStep + 1
  const totalSteps = declarationStep + 1

  function moveTo(nextStep) {
    setMessage('')
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setAnswer(key, value) {
    setAnswers((current) => ({ ...current, [key]: value }))
  }

  async function continueSection() {
    if (step === 1 && !VALID_EMAIL.test(String(answers.email || ''))) return setMessage('Please enter a complete email address with a valid domain, for example name@gmail.com or name@yahoo.com.')
    if (step === 1 && answers.age_gate !== 'Yes') return setMessage('This application is only available to candidates aged 18 to 30.')
    if (step === 1 && answers.voluntary_application !== 'Yes') return setMessage('You must be applying voluntarily to continue.')
    const currentSection = applicationSections[step - 1]
    const missingSelect = currentSection?.fields.find((field) => field.type === 'select' && field.required && !answers[field.key])
    if (missingSelect) return setMessage(`Please select an option for ${missingSelect.label}.`)
    moveTo(step + 1)
  }

  function selectPhotos(field, event) {
    const files = Array.from(event.target.files || [])
    if (files.length > field.max) {
      setMessage(`Please select no more than ${field.max} file(s) for ${field.label}.`)
      event.target.value = ''
      return
    }
    const normalizedNames = files.map((file) => file.name.trim().toLowerCase())
    const duplicateInSelection = normalizedNames.find((name, index) => normalizedNames.indexOf(name) !== index)
    const namesInOtherCategories = new Set(Object.entries(photos).filter(([key]) => key !== field.key).flatMap(([, selectedFiles]) => selectedFiles.map((file) => file.name.trim().toLowerCase())))
    const duplicateAcrossCategories = normalizedNames.find((name) => namesInOtherCategories.has(name))
    const duplicateName = duplicateInSelection || duplicateAcrossCategories
    if (duplicateName) {
      const originalName = files.find((file) => file.name.trim().toLowerCase() === duplicateName)?.name || duplicateName
      setMessage(`${originalName} has already been selected. Please upload a different image with a unique filename.`)
      event.target.value = ''
      return
    }
    const invalid = files.find((file) => !ACCEPTED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension)) || file.size > MAX_FILE_SIZE)
    if (invalid) {
      setMessage(`${invalid.name} must be a PNG, JPG or JPEG image under 10 MB.`)
      event.target.value = ''
      return
    }
    setPhotos((current) => ({ ...current, [field.key]: files }))
    setMessage('')
  }

  function continueFromPhotos() {
    const missing = photoFields.find((field) => field.required && (photos[field.key]?.length || 0) < field.min)
    if (missing) return setMessage(`${missing.label} requires at least ${missing.min} photo(s).`)
    moveTo(declarationStep)
  }

  async function submitApplication(event) {
    event.preventDefault()
    if (!applicationId && !turnstileToken) {
      setMessage('Please complete the security verification before submitting.')
      return
    }
    setSubmitting(true)
    setMessage('Saving your application...')
    try {
      let id = applicationId
      let token = uploadToken
      if (!id) {
        const response = await fetch('/api/apply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: answers.full_name, email: answers.email, phone: answers.phone,
            current_location: answers.current_location, answers, turnstile_token: turnstileToken,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.success) throw new Error(data.error || 'Unable to save application.')
        id = data.application_id
        token = data.upload_token
        setApplicationId(id)
        setUploadToken(token)
      }

      const initialProgress = Object.fromEntries(photoFields.filter((field) => photos[field.key]?.length).map((field) => [field.key, { label: field.label, uploaded: 0, total: photos[field.key].length, status: 'waiting' }]))
      setUploadProgress(initialProgress)
      const uploads = photoFields.flatMap((field) => (photos[field.key] || []).map((file, index) => ({ file, fieldKey: field.key, type: `${field.key}_${index + 1}` })))
      for (let index = 0; index < uploads.length; index += 1) {
        const currentUpload = uploads[index]
        setUploadProgress((current) => ({ ...current, [currentUpload.fieldKey]: { ...current[currentUpload.fieldKey], status: 'uploading' } }))
        setMessage(`Uploading photo ${index + 1} of ${uploads.length}...`)
        const body = new FormData()
        body.append('file', currentUpload.file)
        body.append('application_id', id)
        body.append('photo_type', currentUpload.type)
        const response = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) throw new Error(result.error || `Photo ${index + 1} failed to upload.`)
        setUploadProgress((current) => { const item = current[currentUpload.fieldKey]; const uploaded = item.uploaded + 1; return { ...current, [currentUpload.fieldKey]: { ...item, uploaded, status: uploaded === item.total ? 'complete' : 'uploading' } } })
      }
      setMessage('Finalizing your application...')
      const finalizeResponse = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ application_id: id }),
      })
      const finalizeResult = await finalizeResponse.json().catch(() => ({}))
      if (!finalizeResponse.ok || !finalizeResult.success) throw new Error(finalizeResult.error || 'Unable to finalize application.')
      moveTo(successStep)
    } catch (error) {
      setUploadProgress((current) => Object.fromEntries(Object.entries(current).map(([key, item]) => [key, item.status === 'uploading' ? { ...item, status: 'failed' } : item])))
      setMessage(error.message || 'Submission failed. Please try again.')
      if (!applicationId) {
        setTurnstileToken('')
        setTurnstileResetKey((current) => current + 1)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return <main className="application-page">
    <header className="application-header"><Link className="brand" to="/" aria-label="Nexa Model home"><img className="brand-logo" src={officialLogo} alt="Nexa Model" /></Link><ThemeToggle /></header>
    <section className="application-shell"><div className="application-card">
      <div className="application-progress"><span style={{ width: `${Math.min(((step + 1) / totalSteps) * 100, 100)}%` }} /></div>
      {step !== successStep && !alreadySubmitted && <div className="application-topline"><Link className="back-link" to="/"><ArrowLeft size={16} /> Back to home</Link><p className="section-label">APPLICATION · {String(step + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</p></div>}

      {alreadySubmitted && <section className="success-step duplicate-application"><div className="success-icon"><Check size={28} /></div><p className="section-label">APPLICATION ALREADY RECEIVED</p><h2>Your application has been submitted.</h2><p>Thank you for your patience. Nexa Model will contact you through WhatsApp if you are shortlisted.</p><p className="bm-text">Permohonan anda telah dihantar. Terima kasih atas kesabaran anda. Nexa Model akan menghubungi anda melalui WhatsApp sekiranya anda disenarai pendek.</p><Link className="button button-dark" to="/">Return home</Link></section>}
      {!alreadySubmitted && <>
      {!alreadySubmitted && step === 0 && <Introduction accepted={introductionAccepted} setAccepted={setIntroductionAccepted} onContinue={() => moveTo(1)} />}
      {!alreadySubmitted && step >= 1 && step <= applicationSections.length && <FormSection section={applicationSections[step - 1]} answers={answers} setAnswer={setAnswer} onBack={() => moveTo(step - 1)} onNext={continueSection} />}

      {step === photoStep && <section className="photo-step expanded-form"><header className="form-section-heading"><p className="section-label">SECTION 10</p><h2>Photo Submission</h2><em className="section-title-bm">Penghantaran Gambar</em><p>Select one or multiple recent, clear and unfiltered PNG, JPG or JPEG images. Maximum 10 MB each.</p><p className="bm-text">Pilih satu atau beberapa gambar PNG, JPG atau JPEG yang terkini, jelas dan tanpa filter. Maksimum 10 MB setiap gambar.</p></header><div className="photo-field-list">{photoFields.map((field) => <label className="upload-zone compact-upload" key={field.key}><ImagePlus size={25} /><strong>{field.label}{field.required && <b className="required-mark"> *</b>}</strong><em className="bm-text">{field.labelBm}</em><span>{photos[field.key]?.length ? `${photos[field.key].length} selected — click to replace` : field.min === field.max ? `${field.min} file(s)` : `${field.min}–${field.max} file(s)`}</span>{photos[field.key]?.length > 0 && <div className="photo-preview-grid">{photos[field.key].map((file) => <FileThumbnail key={`${file.name}-${file.lastModified}`} file={file} />)}</div>}<input type="file" accept=".png,.jpg,.jpeg" multiple={field.max > 1} onChange={(event) => selectPhotos(field, event)} /></label>)}</div><div className="application-actions"><button className="underlined-button" type="button" onClick={() => moveTo(step - 1)}>Back</button><button className="button button-dark" type="button" onClick={continueFromPhotos}>Continue <ArrowRight size={17} /></button></div></section>}

      {step === declarationStep && <form className="application-form expanded-form" onSubmit={submitApplication}><header className="form-section-heading"><p className="section-label">SECTION 11</p><h2>Final Declaration</h2><em className="section-title-bm">Pengisytiharan Akhir</em><p>Review your information carefully before submitting.</p><p className="bm-text">Semak maklumat anda dengan teliti sebelum menghantar.</p><p className="privacy-form-link">Please review the <Link to="/privacy" target="_blank" rel="noreferrer">Privacy Notice / Notis Privasi</Link> before confirming.</p></header><div className="form-fields">{declarationFields.map((field) => <Field key={field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswer(field.key, value)} />)}</div>{!applicationId && <TurnstileWidget onToken={setTurnstileToken} resetKey={turnstileResetKey} />}{Object.keys(uploadProgress).length > 0 && <div className="upload-progress-panel"><h3>Photo upload status <em>Status muat naik gambar</em></h3>{Object.entries(uploadProgress).map(([key, item]) => <div className={`upload-progress-row ${item.status}`} key={key}><div><span>{item.label}</span><b>{item.status === 'failed' ? 'Failed — retry submission' : `${item.uploaded}/${item.total} · ${item.status}`}</b></div><progress max={item.total} value={item.uploaded} /></div>)}</div>}<div className="application-actions"><button className="underlined-button" type="button" onClick={() => moveTo(photoStep)} disabled={submitting}>Back</button><button className="button button-dark" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Submitting</> : <>Submit application <ArrowRight size={17} /></>}</button></div></form>}

      {step === successStep && <section className="success-step"><div className="success-icon"><Check size={28} /></div><p className="section-label">APPLICATION RECEIVED</p><h2>Thank you.</h2><p>Your application and photos have been submitted. If shortlisted, Nexa Model will contact you through WhatsApp.</p><p className="bm-text">Permohonan dan gambar anda telah diterima. Jika disenarai pendek, Nexa Model akan menghubungi anda melalui WhatsApp.</p><p className="reference-label">Your application reference <em>Rujukan permohonan anda</em></p><code>{applicationId}</code><small className="reference-help">Keep this reference for future communication with Nexa Model.<em>Simpan rujukan ini untuk urusan dengan Nexa Model pada masa hadapan.</em></small><Link className="button button-dark" to="/">Return home</Link></section>}
      </>}
      {!alreadySubmitted && message && <p className="form-message" role="status">{message}</p>}
    </div></section>
  </main>
}
