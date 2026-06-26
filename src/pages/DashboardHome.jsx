import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

function useLift() {
  return {
    onMouseEnter: e => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.borderColor = 'var(--border-light)'
      e.currentTarget.style.boxShadow = 'var(--shadow)'
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.borderColor = 'var(--border)'
      e.currentTarget.style.boxShadow = 'none'
    },
  }
}

/* ============================== DIVISION PICKER ============================== */
function DivisionPicker() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const lift = useLift()
  const canManage = ['admin', 'owner'].includes(profile?.role)
  const [divisions, setDivisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data } = await supabase.from('divisions').select('*').order('position')
    setDivisions(data || [])
    setLoading(false)
  }

  const toggleActive = async (div) => {
    setBusyId(div.id)
    try {
      const { error } = await supabase.from('divisions')
        .update({ is_active: !div.is_active }).eq('id', div.id)
      if (error) throw error
      setDivisions(ds => ds.map(d => d.id === div.id ? { ...d, is_active: !d.is_active } : d))
    } catch (e) {
      alert('Failed to update division: ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  // Non-managers only see active divisions; managers see all (with toggle)
  const visible = canManage ? divisions : divisions.filter(d => d.is_active)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboards</h1>
          <p className="page-sub">Choose a division to begin</p>
        </div>
      </div>

      {loading ? (
        <div className="loader-row"><div className="spinner" /></div>
      ) : visible.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No divisions yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {visible.map(div => {
            const inactive = !div.is_active
            return (
              <div key={div.id}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)', padding: '28px 24px',
                  display: 'flex', flexDirection: 'column', gap: 16,
                  transition: 'all .18s ease', position: 'relative',
                  opacity: inactive ? 0.55 : 1,
                }}>
                <button
                  {...(inactive ? {} : lift)}
                  onClick={() => !inactive && navigate(`/dashboard/${encodeURIComponent(div.name)}`)}
                  disabled={inactive}
                  style={{
                    background: 'transparent', border: 'none', padding: 0,
                    cursor: inactive ? 'default' : 'pointer', textAlign: 'left',
                    color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                  <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px' }}>{div.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {inactive ? 'Inactive — hidden from evaluators' : 'View dashboards →'}
                  </div>
                </button>

                {canManage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {div.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => toggleActive(div)}
                      disabled={busyId === div.id}
                      role="switch"
                      aria-checked={div.is_active}
                      style={{
                        marginLeft: 'auto', width: 40, height: 22, borderRadius: 11,
                        border: 'none', cursor: 'pointer', position: 'relative',
                        background: div.is_active ? 'var(--accent)' : 'var(--border-light)',
                        transition: 'background .15s', opacity: busyId === div.id ? 0.5 : 1,
                      }}>
                      <span style={{
                        position: 'absolute', top: 2, left: div.is_active ? 20 : 2,
                        width: 18, height: 18, borderRadius: '50%', background: '#fff',
                        transition: 'left .15s',
                      }} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ============================ SCORECARD PICKER ============================ */
function ScorecardPicker() {
  const { division } = useParams()
  const navigate = useNavigate()
  const lift = useLift()
  const [scorecards, setScorecards] = useState([])
  const [loading, setLoading] = useState(true)
  const divisionName = decodeURIComponent(division)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('scorecards')
        .select('id, name, description, is_published, type, division')
        .eq('is_published', true)
        .eq('division', divisionName)
        .order('type')
        .order('name')
      setScorecards(data || [])
      setLoading(false)
    })()
  }, [divisionName])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate('/dashboard')}>← Divisions</button>
          <h1>{divisionName}</h1>
          <p className="page-sub">Choose a scorecard</p>
        </div>
      </div>

      {loading ? (
        <div className="loader-row"><div className="spinner" /></div>
      ) : scorecards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No published scorecards in this division yet. Assign a scorecard to {divisionName} to see its dashboard here.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {scorecards.map(sc => (
            <button key={sc.id} {...lift}
              onClick={() => navigate(`/dashboard/${encodeURIComponent(division)}/${sc.id}`)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '22px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
                transition: 'all .18s ease', textAlign: 'left', color: 'var(--text-primary)',
                minHeight: 110
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{sc.name}</span>
                <span className={`badge ${sc.type === 'dsat' ? 'badge-fail' : 'badge-eval'}`} style={{ marginLeft: 'auto' }}>
                  {sc.type === 'dsat' ? 'DSAT' : 'Quality'}
                </span>
              </div>
              {sc.description && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sc.description}</div>
              )}
              <span style={{ fontSize: 12, color: 'var(--accent)', marginTop: 'auto' }}>View dashboard →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardHome() {
  const { division, scorecardId } = useParams()
  if (scorecardId) return null
  if (division) return <ScorecardPicker />
  return <DivisionPicker />
}
