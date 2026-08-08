import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, ImagePlus, LoaderCircle } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from '../components/ThemeToggle'
import officialLogo from '../assets/images/official_logo_2Kpx.webp'

const MAX_PHOTOS = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']

const processSteps = [
  ['01', 'Submit Your Application', 'Hantar Permohonan Anda', 'Complete this form with your personal information, modelling profile, availability and required photos.', 'Lengkapkan borang ini dengan maklumat peribadi, profil modelling, ketersediaan serta gambar yang diperlukan.'],
  ['02', 'Profile Screening', 'Semakan Profil', 'Nexa will review submitted profiles based on the requirements of available modelling opportunities.', 'Pihak Nexa akan menyemak profil yang dihantar berdasarkan keperluan peluang modelling yang tersedia.'],
  ['03', 'Shortlisting', 'Senarai Pendek', 'Candidates who meet the initial requirements will be shortlisted and contacted through WhatsApp.', 'Calon yang memenuhi keperluan awal akan disenarai pendek dan dihubungi melalui WhatsApp.'],
  ['04', 'Real-Time Training & Assessment', 'Latihan & Penilaian Secara Real-Time', 'Shortlisted candidates will undergo real-time pose training and assessment from home or another suitable location.', 'Calon yang disenarai pendek akan menjalani latihan pose dan penilaian secara real-time dari rumah atau lokasi yang sesuai.'],
  ['05', 'Pose Instructions & Practice', 'Arahan Pose & Latihan', 'The trainer will provide pose instructions and references. Candidates will perform, record and submit the requested poses.', 'Trainer akan memberikan arahan dan rujukan pose. Calon perlu melakukan, merakam dan menghantar pose yang diberikan.'],
  ['06', 'Feedback & Improvement', 'Maklum Balas & Penambahbaikan', 'The trainer will review poses, presentation and image or video quality. Candidates may be asked to improve or repeat certain poses.', 'Trainer akan menyemak pose, presentation serta kualiti gambar atau video. Calon mungkin diminta memperbaiki atau mengambil semula pose tertentu.'],
  ['07', 'Training Completion', 'Tamat Latihan', 'Session count varies by performance. Candidates should generally prepare for approximately 3–4 training and assessment sessions.', 'Jumlah sesi berbeza mengikut prestasi. Secara umum, calon perlu bersedia untuk sekitar 3–4 sesi latihan dan penilaian.'],
]

export function Introduction({ accepted, setAccepted, onContinue }) {
  return (
    <section className="application-information">
      <div className="information-hero">
        <h2>Welcome to<br /><em>Nexa Model</em></h2>
        <p className="section-label">BEFORE YOU APPLY · SEBELUM MEMOHON</p>
        <div className="bilingual-copy">
          <p>Nexa Model connects suitable talents with modelling opportunities for activewear, sportswear, gym wear, yoga wear and Pilates wear. We are building a talent pool for real-time photoshoots, product content and brand campaigns. Selected candidates will undergo real-time training and assessment before being considered for opportunities. Submission does not guarantee selection or a modelling job.</p>
          <p className="bm-text">Nexa Model menghubungkan talent yang sesuai dengan peluang peragaan activewear, sportswear, gym wear, yoga wear dan Pilates wear. Kami sedang membina kumpulan talent untuk photoshoot, kandungan produk serta kempen jenama. Calon terpilih akan menjalani latihan dan penilaian secara real-time sebelum dipertimbangkan. Penghantaran borang tidak menjamin pemilihan atau tawaran kerja modelling.</p>
        </div>
      </div>

      <div className="information-section">
        <p className="section-label">HOW IT WORKS · BAGAIMANA PROSES INI BERJALAN</p>
        <div className="information-timeline">
          {processSteps.map(([number, english, malay, englishCopy, malayCopy]) => (
            <article key={number}><span>{number}</span><div><h3>{english}</h3><strong className="bm-text">{malay}</strong><p>{englishCopy}</p><p className="bm-text">{malayCopy}</p></div></article>
          ))}
        </div>
      </div>

      <div className="information-section">
        <p className="section-label">MODELLING OPPORTUNITIES · PELUANG MODELLING</p>
        <div className="bilingual-copy">
          <p>Talents who complete training and assessment may be considered for suitable opportunities based on client, campaign and brand requirements. Potential future directions include local and international activewear, lifestyle and sports brands.</p>
          <p className="bm-text">Talent yang melengkapkan latihan dan penilaian boleh dipertimbangkan untuk peluang bersesuaian berdasarkan keperluan client, kempen dan jenama, termasuk potensi kempen activewear, lifestyle dan sukan tempatan serta antarabangsa.</p>
        </div>
        <p className="brand-direction">Lululemon · Ariani Active · Omcore · Alo Yoga · Oysho · Gymshark · CSB · Oner Active · LSKD · Cotton On Body · Cheak · Liberty Active · Kydra</p>
        <p className="disclaimer">These names represent Nexa's potential future casting direction. Opportunities depend on project availability, client criteria and talent suitability. Completion does not guarantee placement, collaboration or employment with any brand.<span className="bm-text spaced-bm">Nama-nama ini menunjukkan hala tuju casting bagi Nexa Model. Peluang bergantung pada ketersediaan projek, kriteria client dan kesesuaian talent. Tamat latihan tidak menjamin penempatan, kolaborasi atau pekerjaan dengan mana-mana jenama.</span></p>
      </div>

      <div className="information-section information-grid">
        <article><p className="section-label">TRAINING · LATIHAN</p><h3>Real-time, online and free of charge.</h3><p>Training and assessment can be completed from home. Pose instructions, guidelines and visual references will be provided. Photos and videos will be submitted through a Google Drive folder provided by Nexa.</p><p className="bm-text">Latihan dan penilaian boleh dilakukan dari rumah tanpa sebarang yuran. Arahan pose, guideline dan visual reference akan disediakan. Gambar dan video akan dihantar melalui folder Google Drive daripada Nexa.</p><p className="disclaimer">Training and assessment sessions are unpaid and conducted solely for preparation and evaluation.<span className="bm-text">Sesi latihan dan penilaian tidak berbayar dan dijalankan khusus untuk persediaan serta penilaian.</span></p></article>
        <article><p className="section-label">WHAT YOU MAY NEED · PERALATAN</p><h3>A simple home setup.</h3><strong className="malay-subtitle bm-text">Persediaan ringkas di rumah.</strong><ul className="bilingual-equipment"><li><span>Smartphone with a good camera</span><small className="bm-text">Smartphone dengan kamera yang baik</small></li><li><span>Tripod or phone stand</span><small className="bm-text">Tripod atau pemegang telefon</small></li><li><span>Suitable indoor or outdoor space</span><small className="bm-text">Ruang dalaman atau luaran yang sesuai</small></li><li><span>Natural or suitable lighting</span><small className="bm-text">Pencahayaan semula jadi atau yang sesuai</small></li></ul><p>Professional camera equipment is not required unless specifically requested.<span className="bm-text">Kamera profesional tidak diwajibkan kecuali diminta untuk projek tertentu.</span></p></article>
      </div>

      <div className="information-section rates-section">
        <p className="section-label">MODELLING RATES · KADAR MODELLING</p>
        <h3>Expected rates for suitable paid modelling opportunities</h3>
        <div className="rate-list"><div><span>Hijab <small className="bm-text">Bertudung</small></span><strong>RM160–RM180 <small>/ hour · <i className="bm-text">jam</i></small></strong></div><div><span>Free Hair <small className="bm-text">Tidak Bertudung</small></span><strong>RM180–RM200 <small>/ hour · <i className="bm-text">jam</i></small></strong></div><div><span>Both Free Hair AND Hijab <small className="bm-text">Bertudung dan tidak bertudung</small></span><strong>RM380–RM400 <small>/ hour · <i className="bm-text">jam</i></small></strong></div></div>
        <p>*Final rates and project requirements will be discussed upon acceptance.<span className="bm-text">*Kadar akhir serta keperluan projek akan dimaklumkan sebelum calon menerima peluang modelling.</span></p>
      </div>

      <div className="information-section confirmation-section">
        <p className="section-label">BEFORE YOU CONTINUE · SEBELUM MENERUSKAN</p>
        <h3>Please confirm that you understand:</h3>
        <strong className="malay-subtitle bm-text">Sila sahkan bahawa anda memahami:</strong>
        <ul className="confirmation-list"><li><Check size={17} /><span>Information provided must be accurate and current.<small>Maklumat yang diberikan mestilah tepat dan terkini.</small></span></li><li><Check size={17} /><span>Training and assessment are conducted in real-time.<small>Latihan dan penilaian dijalankan secara real-time.</small></span></li><li><Check size={17} /><span>Submission does not guarantee selection.<small>Penghantaran permohonan tidak menjamin pemilihan.</small></span></li><li><Check size={17} /><span>Training is free of charge and unpaid.<small>Latihan tidak dikenakan bayaran dan sesi latihan tidak berbayar.</small></span></li><li><Check size={17} /><span>Opportunities depend on profile suitability and project requirements.<small>Peluang bergantung pada kesesuaian profil dan keperluan projek.</small></span></li><li><Check size={17} /><span>Shortlisted candidates will be contacted through WhatsApp.<small>Calon yang disenarai pendek akan dihubungi melalui WhatsApp.</small></span></li></ul>
        <label className="consent-row introduction-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><strong>I have read and understood the information above.</strong><span className="bm-text">Saya telah membaca dan memahami maklumat di atas.</span></span></label>
        <button className="button button-dark button-bilingual" type="button" disabled={!accepted} onClick={onContinue}><span>Continue to application<em>Teruskan permohonan</em></span><ArrowRight size={17} /></button>
      </div>
    </section>
  )
}

export default function Apply() {
  const [step, setStep] = useState(0)
  const [introductionAccepted, setIntroductionAccepted] = useState(false)
  const [applicationId, setApplicationId] = useState(null)
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', current_location: '' })
  const [consent, setConsent] = useState(false)
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  function handleChange(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function handlePhotos(event) {
    const files = Array.from(event.target.files || [])
    if (files.length > MAX_PHOTOS) {
      setMessage(`Please select no more than ${MAX_PHOTOS} photos.`)
      event.target.value = ''
      return
    }
    const invalid = files.find((file) => !acceptedTypes.includes(file.type) || file.size > MAX_FILE_SIZE)
    if (invalid) {
      setMessage(`${invalid.name} must be a JPG, PNG or WebP under 10 MB.`)
      event.target.value = ''
      return
    }
    setMessage('')
    setPhotos(files)
  }

  async function createApplication(event) {
    event.preventDefault()
    if (!consent) return setMessage('Please confirm your consent before continuing.')

    setSubmitting(true)
    setMessage('')
    try {
      const response = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to create application.')
      setApplicationId(data.application_id)
      setStep(2)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function uploadPhotos() {
    if (!photos.length) return setMessage('Please select at least one photo.')
    setSubmitting(true)
    setMessage('')
    try {
      for (let index = 0; index < photos.length; index += 1) {
        setMessage(`Uploading photo ${index + 1} of ${photos.length}...`)
        const body = new FormData()
        body.append('file', photos[index])
        body.append('application_id', applicationId)
        body.append('photo_type', `photo_${index + 1}`)
        const response = await fetch('/api/upload', { method: 'POST', body })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.success) throw new Error(result.error || `Photo ${index + 1} failed to upload.`)
      }
      setMessage('')
      setStep(3)
    } catch (error) {
      setMessage(typeof error.message === 'string' ? error.message : 'Upload failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="application-page">
      <header className="application-header">
        <Link className="brand" to="/" aria-label="Nexa Model home"><img className="brand-logo" src={officialLogo} alt="Nexa Model" /></Link>
        <ThemeToggle />
      </header>

      <section className="application-shell">
        <div className="application-card">
          <div className="application-progress"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
          <div className="application-topline">
            <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to home</Link>
            <p className="section-label">LET'S JOIN THE TEAM · {String(step + 1).padStart(2, '0')} / 04</p>
          </div>

          {step === 0 && <Introduction accepted={introductionAccepted} setAccepted={setIntroductionAccepted} onContinue={() => { setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}

          {step === 1 && (
            <form className="application-form" onSubmit={createApplication}>
              <div><p className="section-label">STEP ONE</p><h2>Your details</h2></div>
              <label>Full name<input name="full_name" value={form.full_name} onChange={handleChange} autoComplete="name" maxLength="100" required /></label>
              <label>Email address<input type="email" name="email" value={form.email} onChange={handleChange} autoComplete="email" maxLength="254" required /></label>
              <label>Phone number<input type="tel" name="phone" value={form.phone} onChange={handleChange} autoComplete="tel" maxLength="30" required /></label>
              <label>Current location<input name="current_location" value={form.current_location} onChange={handleChange} autoComplete="address-level2" maxLength="100" required /></label>
              <label className="consent-row"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> <span>I consent to Nexa Model storing and reviewing my information and photos for talent selection.</span></label>
              <button className="button button-dark full-button" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={17} /> : <>Continue <ArrowRight size={17} /></>}</button>
            </form>
          )}

          {step === 2 && (
            <section className="photo-step">
              <div><p className="section-label">STEP TWO</p><h2>Recent photos</h2><p>Upload 1–5 clear, unfiltered JPG, PNG or WebP photos. Maximum 10 MB each.</p></div>
              <label className="upload-zone"><ImagePlus size={30} /><strong>Choose photos</strong><span>{photos.length ? `${photos.length} selected` : 'Front, side and full-length recommended'}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handlePhotos} /></label>
              <div className="application-actions"><button className="underlined-button" type="button" onClick={() => setStep(1)} disabled={submitting}>Back</button><button className="button button-dark" type="button" onClick={uploadPhotos} disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Uploading</> : <>Submit application <ArrowRight size={17} /></>}</button></div>
            </section>
          )}

          {step === 3 && (
            <section className="success-step"><div className="success-icon"><Check size={28} /></div><p className="section-label">APPLICATION RECEIVED</p><h2>Thank you.</h2><p>Your application and photos have been submitted. Keep this reference for your records.</p><code>{applicationId}</code><Link className="button button-dark" to="/">Return home</Link></section>
          )}

          {message && <p className="form-message" role="status">{message}</p>}
        </div>
      </section>
    </main>
  )
}
