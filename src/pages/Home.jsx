import { ArrowDown, ArrowRight, Check, MoveUpRight } from 'lucide-react'
import { Link } from '../router'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

const steps = [
  ['01', 'Apply', 'Submit your profile, measurements and portfolio.'],
  ['02', 'Screening', 'Our team reviews your suitability and potential.'],
  ['03', 'Train', 'Complete guided online training modules.'],
  ['04', 'Assess', 'Submit your movement and camera assessment.'],
  ['05', 'Cast', 'Get considered for suitable brand opportunities.'],
]

export default function Home() {
  return (
    <div>
      <Navbar />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">ACTIVEWEAR TALENT NETWORK · MALAYSIA</p>
            <h1>Talent<br />in <em>motion.</em></h1>
            <p className="hero-description">
              Connecting modern activewear brands with confident talent built for movement, wellness and performance.
            </p>
            <div className="hero-actions">
              <Link className="button button-dark" to="/apply">Join our network <ArrowRight size={17} /></Link>
              <a className="underlined-link" href="#brands">I represent a brand</a>
            </div>
          </div>

          <div className="hero-visual" aria-label="Editorial activewear visual placeholder">
            <div className="hero-image-overlay">
              <span>EDITORIAL · MOVEMENT · WELLNESS</span>
              <strong>01 / 04</strong>
            </div>
          </div>

          <a className="scroll-cue" href="#about"><ArrowDown size={18} /> Discover Nexa</a>
        </section>

        <section className="statement" id="about">
          <p className="section-label">WHO WE ARE</p>
          <h2>Not just faces.<br />We represent <em>energy.</em></h2>
          <p>
            Nexa Model is a specialised talent platform for yoga, Pilates, gym, sportswear and activewear campaigns. We discover, prepare and connect talent with suitable brands.
          </p>
        </section>

        <section className="process" id="process">
          <div className="section-heading">
            <p className="section-label">THE NEXA PROCESS</p>
            <h2>Your path from<br />application to <em>casting.</em></h2>
          </div>
          <div className="steps">
            {steps.map(([number, title, copy]) => (
              <article className="step" key={number}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="split-section" id="talents">
          <div className="split-image talent-image" />
          <div className="split-copy">
            <p className="section-label">FOR TALENTS</p>
            <h2>Build confidence.<br /><em>Move forward.</em></h2>
            <p>Track every step of your journey through a private talent portal—from profile completion to final assessment.</p>
            <ul>
              <li><Check size={17} /> Guided online training</li>
              <li><Check size={17} /> Personal progress dashboard</li>
              <li><Check size={17} /> Secure assessment submission</li>
              <li><Check size={17} /> Casting consideration</li>
            </ul>
            <Link className="button button-dark" to="/login">Open talent portal <MoveUpRight size={16} /></Link>
          </div>
        </section>

        <section className="split-section reverse" id="brands">
          <div className="split-image brand-image" />
          <div className="split-copy dark-panel">
            <p className="section-label">FOR BRANDS</p>
            <h2>Find talent that<br /><em>fits the movement.</em></h2>
            <p>Access a curated network of screened talent with the right image, movement confidence and activewear focus.</p>
            <a className="button button-light" href="mailto:hello@nexamodel.example">Discuss a casting <ArrowRight size={16} /></a>
          </div>
        </section>

        <section className="apply-section" id="apply">
          <p className="section-label">JOIN THE NETWORK</p>
          <h2>Ready for your<br /><em>next move?</em></h2>
          <p>Applications are open for new and experienced activewear talent.</p>
          <Link className="button button-dark large-button" to="/apply">
            Start your application <MoveUpRight size={18} />
          </Link>
          <small>It takes about 5 minutes. Have up to 5 recent photos ready.</small>
        </section>
      </main>
      <Footer />
    </div>
  )
}
