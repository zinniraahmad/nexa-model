import { Menu, MoveUpRight } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from './ThemeToggle'
import officialLogo from '../assets/images/official_logo_2Kpx.png'

export default function Navbar() {
  return (
    <header className="nav-shell">
      <Link className="brand" to="/" aria-label="Nexa Model home">
        <img className="brand-logo" src={officialLogo} alt="Nexa Model" />
      </Link>

      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="#about">About</a>
        <a href="#process">Process</a>
        <a href="#talents">For Talents</a>
        <a href="#brands">For Brands</a>
      </nav>

      <div className="nav-actions">
        <ThemeToggle />
        <Link className="text-link" to="/login">Talent Login</Link>
        <Link className="button button-dark" to="/apply">
          Apply Now <MoveUpRight size={16} />
        </Link>
        <button className="menu-button" aria-label="Open menu"><Menu /></button>
      </div>
    </header>
  )
}
