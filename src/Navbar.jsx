import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App'

export default function Navbar() {
  const { profile, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const isActive  = (path) => location.pathname === path
  console.log('NAVBAR ROLE:', profile?.role) // temporary debug line

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

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
          onClick={() => navigate('/dashboard')}>
          <i className="ti ti-layout-dashboard" aria-hidden="true" />
          Dashboard
        </button>
        <button
          className={`nav-item ${isActive('/evaluations') ? 'active' : ''}`}
          onClick={() => navigate('/evaluations')}>
          <i className="ti ti-clipboard-check" aria-hidden="true" />
          Evaluations
        </button>
            {['admin', 'owner'].includes(profile?.role) && (
          <button
            className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
            onClick={() => navigate('/admin')}>
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
        <span className={`role-chip role-${profile?.role || 'viewer'}`}>
          {profile?.role || 'viewer'}
        </span>
        <button
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}
          onClick={logout}>
          Sign out
        </button>
      </div>
    </nav>
  )
}