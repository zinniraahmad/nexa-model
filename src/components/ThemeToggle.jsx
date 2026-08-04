import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme'

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <Sun className="theme-icon sun-icon" size={16} aria-hidden="true" />
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb" />
      </span>
      <Moon className="theme-icon moon-icon" size={16} aria-hidden="true" />
    </button>
  )
}
