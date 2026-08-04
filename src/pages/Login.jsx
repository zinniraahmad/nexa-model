import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react'
import { Link, navigate } from '../router'
import ThemeToggle from '../components/ThemeToggle'

export default function Login() {
  function handleSubmit(event) {
    event.preventDefault()
    navigate('/portal')
  }

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
          <p className="section-label">PRIVATE ACCESS</p>
          <h2>Welcome back.</h2>
          <p>Sign in to update your profile and continue your assessment.</p>
          <form onSubmit={handleSubmit}>
            <label>Email address<input type="email" placeholder="talent@example.com" required /></label>
            <label>Password<input type="password" placeholder="••••••••" required /></label>
            <div className="form-row"><label className="checkbox"><input type="checkbox" /> Remember me</label><a href="#reset">Forgot password?</a></div>
            <button className="button button-dark full-button" type="submit">Sign in <ArrowRight size={17} /></button>
          </form>
          <p className="demo-note">Demo mode: any email and password will open the dashboard.</p>
        </div>
      </section>
    </main>
  )
}
