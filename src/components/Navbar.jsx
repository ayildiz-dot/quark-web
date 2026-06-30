import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App'

export default function Navbar() {
  const { profile, logout, unsavedChanges, setShowNavModal, setPendingNavPath } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => localStorage.getItem('quark-theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('quark-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')
  const location = useLocation()
  const isActive = (path) => location.pathname.startsWith(path)

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const safeNavigate = (path) => {
    if (unsavedChanges) {
      setPendingNavPath(path)
      setShowNavModal(true)
    } else {
      navigate(path)
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-icon">⬡</span>
        <span className="brand-name">Quark</span>
        <span className="brand-sub">Kaizen Gaming · QC</span>
      </div>

      <div className="navbar-links">
        <button
          className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
          onClick={() => safeNavigate('/dashboard')}>
          <i className="ti ti-layout-dashboard" aria-hidden="true" />
          Dashboard
        </button>
        <button
          className={`nav-item ${isActive('/evaluations') ? 'active' : ''}`}
          onClick={() => safeNavigate('/evaluations')}>
          <i className="ti ti-clipboard-check" aria-hidden="true" />
          Evaluations
        </button>

        {['admin', 'owner'].includes(profile?.role) && (
          <button
            className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
            onClick={() => safeNavigate('/admin')}>
            <i className="ti ti-settings" aria-hidden="true" />
            Admin
          </button>
        )}
      </div>

      <div className="navbar-user">
        <div className="user-info">
          <div className="avatar">{initials}</div>
          <div style={{ overflow: 'hidden' }}>
            <div className="user-name">{profile?.name || 'User'}</div>
            <div className="user-email">{profile?.email || ''}</div>
          </div>
        </div>
        <span className={`role-chip role-${profile?.role === 'viewer' ? 'Agent' : (profile?.role || 'viewer')}`}>
          {profile?.role === 'viewer' ? 'Agent' : (profile?.role || 'viewer')}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}
          onClick={toggleTheme}>
          {theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: '4px', justifyContent: 'center' }}
          onClick={logout}>
          Sign out
        </button>
      </div>
    </nav>
  )
}
