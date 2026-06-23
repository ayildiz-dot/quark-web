import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [done,      setDone]      = useState(false)
  const [validLink, setValidLink] = useState(false)
  const [checking,  setChecking]  = useState(true)

  useEffect(() => {
    // Supabase verify link lands here after exchanging the token for a session
    // By the time we mount, the session may already exist — check immediately
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setValidLink(true)
        setChecking(false)
        return
      }
      setChecking(false)
    }
    init()

    // Also listen for the event in case it fires after mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) setValidLink(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleReset = async () => {
    if (!password) return setError('Please enter a new password.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setDone(true)
    await supabase.auth.signOut()
    setLoading(false)
  }

  const goToLogin = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <span style={{ fontSize: 32 }}>⬡</span>
            <span className="brand-name">Quark</span>
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Verifying your reset link…
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <span style={{ fontSize: 32 }}>⬡</span>
            <span className="brand-name">Quark</span>
          </div>
          <h1 className="login-title">Password updated</h1>
          <div style={{
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 10,
            padding: '16px 20px',
            fontSize: 14,
            color: 'var(--text-secondary)',
            textAlign: 'center',
            lineHeight: 1.7,
            marginBottom: 20
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
            <strong style={{ color: 'var(--text-primary)' }}>You have successfully updated your password.</strong>
            <br />
            You can now sign in with your new credentials.
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={goToLogin}
          >
            Go to sign in
          </button>
        </div>
      </div>
    )
  }

  if (!validLink) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <span style={{ fontSize: 32 }}>⬡</span>
            <span className="brand-name">Quark</span>
          </div>
          <h1 className="login-title">Reset your password</h1>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '16px 20px',
            fontSize: 13,
            color: 'var(--text-secondary)',
            textAlign: 'center',
            lineHeight: 1.7
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⏳</div>
            This reset link has expired or is invalid.
            <br />
            <span style={{ fontSize: 12 }}>
              Reset links are single-use and expire after 1 hour.
            </span>
            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--accent)' }}
                onClick={goToLogin}
              >
                Request a new link
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span style={{ fontSize: 32 }}>⬡</span>
          <span className="brand-name">Quark</span>
        </div>
        <h1 className="login-title">Reset your password</h1>
        <p className="login-sub">Enter a new password for your Quark account</p>
        {error && <div className="login-error">{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-field" style={{ minWidth: 'auto' }}>
            <label>New password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-field" style={{ minWidth: 'auto' }}>
            <label>Confirm new password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReset()}
              style={{ width: '100%' }}
            />
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
            onClick={handleReset}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </div>
      </div>
    </div>
  )
}
