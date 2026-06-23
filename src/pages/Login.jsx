import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('login')
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async () => {
    if (!email || !password) return setError('Please enter your email and password.')
    setLoading(true)
    setError(null)
    try {
      let result
      if (mode === 'login') {
        result = await supabase.auth.signInWithPassword({ email, password })
      } else {
        result = await supabase.auth.signUp({ email, password, options: { data: { full_name: email.split('@')[0] } } })
      }
      if (result.error) throw result.error
    } catch (e) {
      setError(e.message || e.error_description || e.msg || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    if (!email) return setError('Please enter your email address above.')
    setLoading(true)
    setError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://quark-iota.vercel.app/reset-password'
      })
      if (error) throw error
      setResetSent(true)
    } catch (e) {
      setError(e.message || e.error_description || e.msg || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <span style={{ fontSize: 32 }}>⬡</span>
          <span className="brand-name">Quark</span>
        </div>
        <h1 className="login-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="login-sub">{mode === 'login' ? 'Sign in to your Kaizen Gaming QC account' : 'Sign up with your Kaizen Gaming email'}</p>
        {error && <div className="login-error">{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-field" style={{ minWidth: 'auto' }}>
            <label>Email address</label>
            <input className="input" type="email" placeholder="you@kaizengaming.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ width: '100%' }} />
          </div>
          {mode !== 'forgot' && (
          <div className="form-field" style={{ minWidth: 'auto' }}>
            <label>Password</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ width: '100%' }} />
          </div>
          )}
          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: -4, marginBottom: -4 }}>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12 }}
                onClick={() => { setMode('forgot'); setError(null); setResetSent(false) }}>
                Forgot password?
              </button>
            </div>
          )}
          {mode === 'forgot' && resetSent ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
              ✅ Reset link sent! Check your inbox (and spam folder).<br/>
              <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, marginTop: 8 }}
                onClick={() => { setMode('login'); setResetSent(false); setError(null) }}>
                Back to sign in
              </button>
            </div>
          ) : mode === 'forgot' ? (
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={handleForgotPassword} disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          ) : (
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          )}
        </div>
        {mode !== 'forgot' && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
        {mode === 'forgot' && !resetSent && (
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
            <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}
              onClick={() => { setMode('login'); setError(null) }}>
              ← Back to sign in
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
