import { useEffect } from 'react'
import Home from './pages/Home'
import Login from './pages/Login'
import Apply from './pages/TalentApplication'
import Privacy from './pages/Privacy'
import NotFound from './pages/NotFound'
import { usePathname } from './router'

const SITE_URL = 'https://nexa-model.com'
const pageMetadata = {
  '/': { title: 'Nexa Model — Talent in Motion', description: 'Nexa Model connects activewear brands with modern movement talent.' },
  '/apply': { title: 'Apply | Nexa Model', description: 'Apply to Nexa Model through a secure talent application.' },
  '/privacy': { title: 'Privacy Notice | Nexa Model', description: 'Read the Nexa Model Privacy Notice.' },
  '/login': { title: 'Login unavailable | Nexa Model', description: 'Nexa Model login is currently unavailable while development continues.' },
  '/portal': { title: 'Login unavailable | Nexa Model', description: 'Nexa Model login is currently unavailable while development continues.' },
}

function setMeta(selector, attribute, content) {
  const element = document.head.querySelector(selector)
  if (element) element.setAttribute(attribute, content)
}

export default function App() {
  const pathname = usePathname()

  const metadata = pageMetadata[pathname]

  useEffect(() => {
    const page = metadata || { title: 'Page not found | Nexa Model', description: 'The page you requested could not be found.' }
    document.title = page.title
    setMeta('meta[name="description"]', 'content', page.description)
    setMeta('meta[property="og:title"]', 'content', page.title)
    setMeta('meta[property="og:description"]', 'content', page.description)
    setMeta('meta[property="og:url"]', 'content', `${SITE_URL}${pathname}`)
    setMeta('meta[name="twitter:title"]', 'content', page.title)
    setMeta('meta[name="twitter:description"]', 'content', page.description)
    setMeta('link[rel="canonical"]', 'href', `${SITE_URL}${pathname}`)
  }, [metadata, pathname])

  let page
  if (pathname === '/login' || pathname === '/portal') page = <Login />
  else if (pathname === '/apply') page = <Apply />
  else if (pathname === '/privacy') page = <Privacy />
  else if (pathname === '/') page = <Home />
  else page = <NotFound />

  return <><a className="skip-link" href="#main-content">Skip to main content</a>{page}</>
}
