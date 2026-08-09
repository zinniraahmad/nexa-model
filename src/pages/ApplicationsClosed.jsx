import { ArrowLeft, Clock3 } from 'lucide-react'
import Navbar from '../components/Navbar'
import { Link } from '../router'

export default function ApplicationsClosed() {
  return <main className="applications-closed-page" id="main-content">
    <Navbar applicationsClosed />
    <section className="applications-closed-content" aria-labelledby="applications-closed-title">
      <span className="applications-closed-icon" aria-hidden="true"><Clock3 /></span>
      <p className="section-label">APPLICATION UPDATE</p>
      <h1 id="applications-closed-title">Application is currently closed.</h1>
      <p>Thank you for your patience</p>
      <Link className="button button-dark" to="/"><ArrowLeft size={17} /> Return to homepage</Link>
    </section>
  </main>
}
