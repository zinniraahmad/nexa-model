import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  return (
    <main className="auth-layout">
      <section className="auth-visual">
        <Link className="back-link light-link" to="/"><ArrowLeft size={17} /> Back to website</Link>
        <div>
          <p className="eyebrow light-eyebrow">NEXA TALENT PORTAL</p>
          <h1>Your journey.<br /><em>Your progress.</em></h1>
        </div>
      </section>
      <section className="auth-panel">
        <ThemeToggle className="auth-theme-toggle" />
        <div className="auth-box">
          <div className="auth-icon"><LockKeyhole size={22} /></div>
          <p className="section-label">COMING SOON</p>
          <h2>Login Page is currently not available.</h2>
          <p>The development is still under progress. Stay tune !</p>
          <Link className="button button-dark full-button auth-home-button" to="/">Return to homepage <ArrowRight size={17} /></Link>
        </div>
      </section>
    </main>
  )
}
