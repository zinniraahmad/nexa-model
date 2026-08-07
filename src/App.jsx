import { useEffect } from 'react'
import Home from './pages/Home'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Apply from './pages/TalentApplication'
import { navigate, usePathname } from './router'

export default function App() {
  const pathname = usePathname()

  useEffect(() => {
    if (!['/', '/login', '/portal', '/apply'].includes(pathname)) {
      navigate('/', { replace: true })
    }
  }, [pathname])

  if (pathname === '/login') return <Login />
  if (pathname === '/portal') return <Dashboard />
  if (pathname === '/apply') return <Apply />
  return <Home />
}
