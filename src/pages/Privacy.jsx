import { ArrowLeft } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from '../components/ThemeToggle'

const sections = [
  ['Information we collect', 'Maklumat yang kami kumpulkan',
    'We collect application details such as your name, age, contact details, location, social profiles, measurements, availability, experience, declarations and submitted photographs.',
    'Kami mengumpulkan maklumat permohonan seperti nama, umur, butiran hubungan, lokasi, profil sosial, ukuran, ketersediaan, pengalaman, pengisytiharan dan gambar yang dihantar.'],
  ['Why we use it', 'Tujuan penggunaan',
    'Nexa Model uses this information to assess suitability, communicate about your application, conduct training or assessment, and consider you for relevant modelling opportunities.',
    'Nexa Model menggunakan maklumat ini untuk menilai kesesuaian, berhubung mengenai permohonan, menjalankan latihan atau penilaian, dan mempertimbangkan anda untuk peluang modelling yang berkaitan.'],
  ['Sharing and service providers', 'Perkongsian dan penyedia perkhidmatan',
    'Your profile is shared with a brand or client only where your application consent permits legitimate casting. Cloudflare provides hosting and security, ImageKit stores submitted photographs, and Resend may deliver application emails. Access is limited to operational needs.',
    'Profil anda hanya dikongsi dengan jenama atau client apabila persetujuan permohonan membenarkan casting yang sah. Cloudflare menyediakan hosting dan keselamatan, ImageKit menyimpan gambar, dan Resend mungkin menghantar e-mel permohonan. Akses dihadkan kepada keperluan operasi.'],
  ['Retention', 'Tempoh penyimpanan',
    'Application information and photographs are normally retained for six months from submission. Nexa Model reviews records before deletion and may retain an active record longer where you remain shortlisted, engaged in training or involved in an assignment, or where retention is otherwise reasonably required.',
    'Maklumat permohonan dan gambar biasanya disimpan selama enam bulan dari tarikh penghantaran. Nexa Model menyemak rekod sebelum pemadaman dan mungkin menyimpan rekod aktif lebih lama jika anda masih disenarai pendek, mengikuti latihan, terlibat dalam tugasan, atau penyimpanan masih diperlukan secara munasabah.'],
  ['Your choices and rights', 'Pilihan dan hak anda',
    'You may request access, correction or deletion of your personal data, or withdraw consent where applicable. You may contact Nexa Model through its official social-media direct messages or the privacy email below. Identity verification may be requested before acting on a data request.',
    'Anda boleh meminta akses, pembetulan atau pemadaman data peribadi, atau menarik balik persetujuan jika berkenaan. Anda boleh menghubungi Nexa Model melalui direct message media sosial rasmi atau e-mel privasi di bawah. Pengesahan identiti mungkin diminta sebelum permintaan data dilaksanakan.'],
  ['Security', 'Keselamatan',
    'We use access controls, bot protection, rate limits, private image storage and time-limited links. No online system can guarantee absolute security, but access is restricted to authorized administration.',
    'Kami menggunakan kawalan akses, perlindungan bot, rate limit, penyimpanan gambar private dan pautan bertempoh. Tiada sistem dalam talian dapat menjamin keselamatan mutlak, tetapi akses dihadkan kepada pentadbiran yang dibenarkan.'],
]

export default function Privacy() {
  return <main className="privacy-page">
    <header className="privacy-header"><Link className="back-link" to="/"><ArrowLeft size={17} /> Back to website</Link><ThemeToggle /></header>
    <article className="privacy-content">
      <p className="section-label">NEXA MODEL</p>
      <h1>Privacy Notice</h1>
      <p className="privacy-bm-title">Notis Privasi</p>
      <p className="privacy-lead">Nexa Model is an online-only talent operation and the data controller for information submitted through this website.</p>
      <p className="bm-text">Nexa Model ialah operasi bakat secara dalam talian dan merupakan pengendali data bagi maklumat yang dihantar melalui laman web ini.</p>
      {sections.map(([title, titleBm, text, textBm]) => <section key={title}><h2>{title}</h2><h3>{titleBm}</h3><p>{text}</p><p className="bm-text">{textBm}</p></section>)}
      <section><h2>Contact</h2><h3>Hubungi</h3><p>Privacy requests: <a href="mailto:itszinniraahmad@gmail.com">itszinniraahmad@gmail.com</a>, or send a direct message to Nexa Model's official social-media account.</p><p className="bm-text">Permintaan privasi: <a href="mailto:itszinniraahmad@gmail.com">itszinniraahmad@gmail.com</a>, atau hantar direct message kepada akaun media sosial rasmi Nexa Model.</p></section>
      <small>Effective date: 7 August 2026 · Tarikh berkuat kuasa: 7 Ogos 2026</small>
    </article>
  </main>
}
