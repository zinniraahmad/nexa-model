import { ArrowLeft } from 'lucide-react'
import { Link } from '../router'
import Navbar from '../components/Navbar'

export default function NotFound() {
  return <main className="not-found-page" id="main-content">
    <Navbar />
    <section className="not-found-content" aria-labelledby="not-found-title">
      <p className="section-label">404</p>
      <h1 id="not-found-title">Page not found.</h1>
      <p>The page you requested does not exist or may have moved.</p>
      <p className="bm-text">Halaman yang anda minta tidak wujud atau mungkin telah dipindahkan.</p>
      <Link className="button button-dark" to="/"><ArrowLeft size={17} /> Return to homepage</Link>
    </section>
  </main>
}
