import officialLogo from '../assets/images/official_logo_2Kpx.webp'
import { Link } from '../router'

export default function Footer() {
  return (
    <footer className="footer">
      <div>
        <div className="brand brand-light"><img className="brand-logo brand-logo-light" src={officialLogo} alt="Nexa Model" /></div>
        <p>Talent for movement, fashion and performance.</p>
      </div>
      <div className="footer-links">
        <a href="#about">About</a>
        <a href="#talents">Talents</a>
        <a href="#brands">Brands</a>
        <Link to="/privacy">Privacy</Link>
        <a href="mailto:itszinniraahmad@gmail.com">Contact</a>
      </div>
      <p className="copyright">© 2026 Nexa Model. All rights reserved.</p>
    </footer>
  )
}
