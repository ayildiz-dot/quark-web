import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Evaluations from './pages/Evaluations'
import Admin from './pages/Admin'
import Scorecards from './pages/Scorecards'
import ScorecardBuilder from './pages/ScorecardBuilder'
import EvaluationForm from './pages/EvaluationForm'
import ScorecardHistory from './pages/ScorecardHistory'
import { usePresence } from './hooks/usePresence'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

function UnsavedModal({ show, onLeave, onStay }) {
  if (!show) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 32 }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>⚠️ Unsaved Changes</div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          You have unsaved changes on this scorecard. If you leave now, your changes will be lost.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-danger" onClick={onLeave}>Leave without saving</button>
          <button className="btn btn-primary" onClick={onStay}>Stay on page</button>
        </div>
      </div>
    </div>
  )
}

function AppShell({ user, profile, logout, fetchProfile }) {
  const navigate = useNavigate()
  const [unsavedChanges, setUnsavedChanges] = useState(false)
  const [showNavModal, setShowNavModal] = useState(false)
  const [pendingNavPath, setPendingNavPath] = useState(null)

  usePresence(user)

  const isAdminOrOwner = ['admin', 'owner'].includes(profile?.role)

  const handleLeave = () => {
    setUnsavedChanges(false)
    setShowNavModal(false)
    const dest = pendingNavPath
    setPendingNavPath(null)
    if (dest === -1) navigate(-1)
    else if (dest) navigate(dest)
  }

  const handleStay = () => {
    setShowNavModal(false)
    setPendingNavPath(null)
  }

  return (
    <AuthContext.Provider value={{
      user, profile, logout,
      refreshProfile: () => fetchProfile(user),
      unsavedChanges, setUnsavedChanges,
      showNavModal, setShowNavModal,
      pendingNavPath, setPendingNavPath
    }}>
      <div className="app-shell">
        <UnsavedModal show={showNavModal} onLeave={handleLeave} onStay={handleStay} />
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/evaluations/new" element={<EvaluationForm />} />
            <Route path="/scorecards" element={<Scorecards />} />
            <Route path="/scorecards/:id/edit" element={isAdminOrOwner ? <ScorecardBuilder /> : <Navigate to="/dashboard" replace />} />
            <Route path="/scorecards/:id/history" element={isAdminOrOwner ? <ScorecardHistory /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin" element={isAdminOrOwner ? <Admin /> : <Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (u) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', u.id)
      .maybeSingle()
    if (data) {
      setProfile(data)
    } else {
      const { data: np } = await supabase
        .from('users')
        .upsert({ id: u.id, email: u.email, name: u.email.split('@')[0], role: 'viewer' })
        .select()
        .maybeSingle()
      setProfile(np)
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user)
        if (event === 'SIGNED_IN') {
          supabase.from('users').update({ last_login: new Date().toISOString() }).eq('id', session.user.id).then(({ error }) => {
            if (error) console.error('last_login update failed:', error.message)
            else console.log('last_login updated for', session.user.email)
          })
        }
      } else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  if (loading) return (
    <div className="fullpage-loader">
      <div className="spinner" />
      <span>Loading Quark…</span>
    </div>
  )

  if (!user) return <Login />

  return <AppShell user={user} profile={profile} logout={logout} fetchProfile={fetchProfile} />
}
