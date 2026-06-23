import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword]   = useState('')
  const [confirm,  setConfirm]    = useState('')
  const [loading,  setLoading]    = useState(false)
  const [error,    setError]      = useState(null)
  const [done,     setDone]       = useState(false)
  const [validLink, setValidLink] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setValidLink(true)
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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span style={{ fontSize: 32 }}>⬡</span>
          <span className="brand-name">Quark</span>
        </div>
        <h1 className="login-title">Reset your password</h1>
        <p className="login-sub">Enter a new password for your Quark account</p>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <div style={{
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 10,
              padding: '16px 20px',
              fontSize: 14,
              color: 'var(--text-secondary)',
              textAlign: 'center',
              lineHeight: 1.7,
              width: '100%'
            }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>✅</div>
              <strong style={{ color: 'var(--text-primary)' }}>Password updated successfully!</strong><br />
              You have successfully updated your password.<br />
              You can now sign in with your new credentials.
            </div>
            
              href="/"
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'center',
                textDecoration: 'none'
              }}
            >
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                Go to sign in
              </button>
            </a>
          </div>

        ) : !validLink ? (
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
            Waiting for your reset link to load…<br />
            <span style={{ fontSize: 12 }}>
              If this page stays here, the link may have expired.<br />
              Request a new one from the sign-in page.
            </span>
            <div style={{ marginTop: 14 }}>
              <a href="/" style={{ color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>
                ← Back to sign in
              </a>
            </div>
          </div>

        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && <div className="login-error">{error}</div>}
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
        )}
      </div>
    </div>
  )
}
