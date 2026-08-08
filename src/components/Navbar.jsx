import { useEffect, useRef, useState } from 'react'
import { Menu, MoveUpRight, X } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from './ThemeToggle'
import officialLogo from '../assets/images/official_logo_2Kpx.webp'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined

    const desktopQuery = window.matchMedia('(min-width: 901px)')
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    const handleDesktopChange = (event) => {
      if (event.matches) setMenuOpen(false)
    }

    document.body.classList.add('mobile-menu-open')
    document.addEventListener('keydown', handleKeyDown)
    desktopQuery.addEventListener('change', handleDesktopChange)

    return () => {
      document.body.classList.remove('mobile-menu-open')
      document.removeEventListener('keydown', handleKeyDown)
      desktopQuery.removeEventListener('change', handleDesktopChange)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

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
        <button
          ref={menuButtonRef}
          className="menu-button"
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {menuOpen && <nav className="mobile-nav" id="mobile-navigation" aria-label="Mobile navigation">
        <a href="#about" onClick={closeMenu}>About</a>
        <a href="#process" onClick={closeMenu}>Process</a>
        <a href="#talents" onClick={closeMenu}>For Talents</a>
        <a href="#brands" onClick={closeMenu}>For Brands</a>
        <Link to="/login" onClick={closeMenu}>Talent Login</Link>
        <Link className="mobile-nav-apply" to="/apply" onClick={closeMenu}>Apply Now <MoveUpRight size={18} /></Link>
      </nav>}
    </header>
  )
}
