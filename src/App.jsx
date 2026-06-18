import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Evaluations from './pages/Evaluations'
import Admin from './pages/Admin'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user)
      else { setProfile(null); setLoading(false) }
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

  return (
    <AuthContext.Provider value={{ user, profile, logout, refreshProfile: () => fetchProfile(user) }}>
      <div className="app-shell">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/admin" element={['admin', 'owner'].includes(profile?.role) ? <Admin /> : <Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  )
}
