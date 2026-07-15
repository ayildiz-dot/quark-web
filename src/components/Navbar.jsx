import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'
import NotificationBell from './NotificationBell'

const SCHEMES = [
  { key: 'default',  label: 'Default',  swatch: '#3b82f6' },
  { key: 'midnight', label: 'Violet',   swatch: '#7c6fd6' },
  { key: 'forest',   label: 'Forest',   swatch: '#10b981' },
  { key: 'slate',    label: 'Sunset',   swatch: '#d85a30' },
  { key: 'plum',     label: 'Plum',     swatch: '#a855f7' },
  { key: 'crimson',  label: 'Berry',    swatch: '#d6409f' },
]

export default function Navbar() {
  const { profile, logout, unsavedChanges, setShowNavModal, setPendingNavPath } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Fast cache (avoids flash) — DB is source of truth, synced once profile loads.
  const [theme, setTheme]   = useState(() => localStorage.getItem('quark-theme') || 'dark')
  const [scheme, setScheme] = useState(() => localStorage.getItem('quark-scheme') || 'default')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const settingsRef = useRef(null)

  // Apply theme + scheme to <html> and cache them.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('quark-theme', theme)
  }, [theme])
  useEffect(() => {
    if (scheme && scheme !== 'default') document.documentElement.setAttribute('data-scheme', scheme)
    else document.documentElement.removeAttribute('data-scheme')
    localStorage.setItem('quark-scheme', scheme)
  }, [scheme])

  // Once profile loads, sync preferences from the DB (source of truth).
  useEffect(() => {
    if (!profile) return
    if (profile.theme && profile.theme !== theme) setTheme(profile.theme)
    if (profile.color_scheme && profile.color_scheme !== scheme) setScheme(profile.color_scheme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // Close the settings menu on outside click.
  useEffect(() => {
    const h = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const persist = async (patch) => {
    if (!profile?.id) return
    await supabase.from('users').update(patch).eq('id', profile.id)
  }

  const chooseTheme = (t) => { setTheme(t); persist({ theme: t }) }
  const chooseScheme = (sc) => { setScheme(sc); persist({ color_scheme: sc }) }

  const sendPasswordReset = async () => {
    if (!profile?.email) return
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: 'https://quark-iota.vercel.app/reset-password'
    })
    setFlash(error ? { ok: false, text: error.message } : { ok: true, text: 'Password reset link sent to your email.' })
    if (!error) setTimeout(() => setFlash(null), 4000)
  }

  const isActive = (path) => location.pathname.startsWith(path)
  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  const roleLabel = profile?.role === 'viewer' ? 'Agent' : (profile?.role || 'viewer')
  const roleClass = profile?.role || 'viewer' // real CSS class (role-viewer, role-admin, etc.)

  const safeNavigate = (path) => {
    if (unsavedChanges) { setPendingNavPath(path); setShowNavModal(true) }
    else navigate(path)
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-icon"><svg width="22" height="22" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(0 45 45)" />
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(60 45 45)" />
          <ellipse cx="45" cy="45" rx="38" ry="15" fill="none" stroke="#5f6d85" strokeWidth="2.2" transform="rotate(120 45 45)" />
          <circle cx="45" cy="45" r="11" fill="#d85a30" />
          <circle cx="45" cy="7" r="5" fill="#3b82f6" />
          <circle cx="7" cy="64" r="5" fill="#10b981" />
          <circle cx="83" cy="64" r="5" fill="#f59e0b" />
        </svg></span>
        <span className="brand-name">Quark</span>
        <span className="brand-sub">Kaizen Gaming · QC</span>
      </div>

      <div className="navbar-links">
        <button className={`nav-item ${isActive('/dashboard') ? 'active' : ''}`}
          onClick={() => safeNavigate('/dashboard')}>
          <i className="ti ti-layout-dashboard" aria-hidden="true" />
          Dashboard
        </button>
        <button className={`nav-item ${isActive('/evaluations') ? 'active' : ''}`}
          onClick={() => safeNavigate('/evaluations')}>
          <i className="ti ti-clipboard-check" aria-hidden="true" />
          Evaluations
        </button>
        <button className={`nav-item ${isActive('/coaching') ? 'active' : ''}`}
          onClick={() => safeNavigate('/coaching')}>
          <i className="ti ti-school" aria-hidden="true" />
          Coaching
        </button>
        {profile?.email?.endsWith('@kaizengaming.com') && profile?.role !== 'team_leader' && (
          <button className={`nav-item ${isActive('/calibration') ? 'active' : ''}`}
            onClick={() => safeNavigate('/calibration')}>
            <i className="ti ti-target" aria-hidden="true" />
            Calibration
          </button>
        )}
        {['admin', 'owner'].includes(profile?.role) && (
          <button className={`nav-item ${isActive('/admin') ? 'active' : ''}`}
            onClick={() => safeNavigate('/admin')}>
            <i className="ti ti-settings" aria-hidden="true" />
            Control Room
          </button>
        )}
      </div>

      <div className="navbar-user" ref={settingsRef} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <NotificationBell />
          {/* Clickable account area → opens settings */}
          <button
            onClick={() => setSettingsOpen(o => !o)}
            style={{
              flex: 1, background: settingsOpen ? 'var(--bg-hover)' : 'transparent',
              border: 'none', borderRadius: 'var(--radius)', padding: '8px',
              cursor: 'pointer', textAlign: 'left', transition: 'background .15s',
            }}
            title="Account settings">
            <div className="user-info">
              <div className="avatar">{initials}</div>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Account</div>
                <div className="user-name">{profile?.name || 'User'}</div>
              </div>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{settingsOpen ? '▾' : '▸'}</span>
            </div>
          </button>
        </div>

        {/* Settings popover */}
        {settingsOpen && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 8, right: 8, zIndex: 200,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: '14px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)',
              textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
              Account Settings
            </div>
            <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{profile?.name || 'User'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{profile?.email || ''}</div>
              <span className={`role-chip role-${roleClass}`}>{roleLabel}</span>
            </div>

            {/* Appearance: theme toggle */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Appearance</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, justifyContent: 'center' }} onClick={() => chooseTheme('dark')}>☾ Dark</button>
                <button className={`btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, justifyContent: 'center' }} onClick={() => chooseTheme('light')}>☀ Light</button>
              </div>
            </div>

            {/* Color scheme */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>Color scheme</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {SCHEMES.map(sc => (
                  <button key={sc.key} onClick={() => chooseScheme(sc.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                      borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
                      border: `1.5px solid ${scheme === sc.key ? 'var(--accent)' : 'var(--border)'}`,
                      background: scheme === sc.key ? 'var(--accent-light)' : 'transparent',
                      color: scheme === sc.key ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: scheme === sc.key ? 600 : 400,
                      overflow: 'hidden', whiteSpace: 'nowrap',
                    }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: sc.swatch, flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.2)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Inline flash for password reset result */}
            {flash && (
              <div style={{ fontSize: 12, marginBottom: 10, padding: '6px 10px', borderRadius: 6,
                background: flash.ok ? 'var(--success-light)' : 'var(--danger-light)',
                color: flash.ok ? 'var(--success)' : 'var(--danger)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>{flash.text}</span>
                <button onClick={() => setFlash(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1, padding: 0 }}>
                  ✕
                </button>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center',
                color: 'var(--accent)', border: '1px solid var(--accent-light)' }}
                onClick={sendPasswordReset}>
                Send Password Reset Link
              </button>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}
                onClick={logout}>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
