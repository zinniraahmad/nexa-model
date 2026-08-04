import { Menu, MoveUpRight } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from './ThemeToggle'

export default function Navbar() {
  return (
    <header className="nav-shell">
      <Link className="brand" to="/" aria-label="Nexa Model home">
        NEXA<span>MODEL</span>
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
        <a className="button button-dark" href="#apply">
          Apply Now <MoveUpRight size={16} />
        </a>
        <button className="menu-button" aria-label="Open menu"><Menu /></button>
      </div>
    </header>
  )
}
