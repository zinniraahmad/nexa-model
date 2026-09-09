import { useEffect } from 'react'
import Home from './pages/Home'
import Login from './pages/Login'
import Apply from './pages/TalentApplication'
import Privacy from './pages/Privacy'
import NotFound from './pages/NotFound'
import ApplicationsClosed from './pages/ApplicationsClosed'
import TrainingProgress from './pages/TrainingProgress'
import { usePathname } from './router'

const SITE_URL = 'https://nexa-model.com'
const pageMetadata = {
  '/': { title: 'Nexa Model — Talent in Motion', description: 'Nexa Model connects activewear brands with modern movement talent.' },
  '/apply': { title: 'Apply | Nexa Model', description: 'Apply to Nexa Model through a secure talent application.' },
  '/applications-closed': { title: 'Applications closed | Nexa Model', description: 'Nexa Model applications are currently closed.' },
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
  const progressToken = pathname.match(/^\/progress\/([A-Za-z0-9_-]+)$/)?.[1]

  useEffect(() => {
    const page = progressToken ? { title: 'Training Progress | Nexa Model', description: 'Private Nexa training progress.' } : metadata || { title: 'Page not found | Nexa Model', description: 'The page you requested could not be found.' }
    const publicMetadataUrl = progressToken ? `${SITE_URL}/progress` : `${SITE_URL}${pathname}`
    document.title = page.title
    setMeta('meta[name="description"]', 'content', page.description)
    setMeta('meta[property="og:title"]', 'content', page.title)
    setMeta('meta[property="og:description"]', 'content', page.description)
    setMeta('meta[property="og:url"]', 'content', publicMetadataUrl)
    setMeta('meta[name="twitter:title"]', 'content', page.title)
    setMeta('meta[name="twitter:description"]', 'content', page.description)
    setMeta('link[rel="canonical"]', 'href', publicMetadataUrl)
    setMeta('meta[name="robots"]', 'content', progressToken ? 'noindex,nofollow,noarchive' : metadata ? 'index,follow' : 'noindex')
  }, [metadata, pathname, progressToken])

  let page
  if (progressToken) page = <TrainingProgress token={progressToken} />
  else if (pathname === '/login' || pathname === '/portal') page = <Login />
  else if (pathname === '/apply') page = <Apply />
  else if (pathname === '/applications-closed') page = <ApplicationsClosed />
  else if (pathname === '/privacy') page = <Privacy />
  else if (pathname === '/') page = <Home />
  else page = <NotFound />

  return <><a className="skip-link" href="#main-content">Skip to main content</a>{page}</>
}
