import { useEffect, useState } from 'react'

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/'
  return pathname.replace(/\/+$/, '') || '/'
}

export function navigate(to, { replace = false } = {}) {
  const target = normalizePath(to)
  const method = replace ? 'replaceState' : 'pushState'
  window.history[method]({}, '', target)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0, behavior: 'instant' })
}

export function usePathname() {
  const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname))

  useEffect(() => {
    const handleNavigation = () => setPathname(normalizePath(window.location.pathname))
    window.addEventListener('popstate', handleNavigation)
    return () => window.removeEventListener('popstate', handleNavigation)
  }, [])

  return pathname
}

export function Link({ to, onClick, children, ...props }) {
  function handleClick(event) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) return

    event.preventDefault()
    navigate(to)
  }

  return <a href={to} onClick={handleClick} {...props}>{children}</a>
}
