import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('login')

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
      setError(e.message)
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
          <div className="form-field" style={{ minWidth: 'auto' }}>
            <label>Password</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} style={{ width: '100%' }} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={handleSubmit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
