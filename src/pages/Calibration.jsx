import { useState, useEffect } from 'react'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

// ── shared ──────────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'var(--bg-card, #fff)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 20px',
}

function TypeBadge({ type }) {
  const isDsat = type === 'dsat'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      backgroundColor: isDsat ? '#dc262622' : '#2563eb22',
      color: isDsat ? '#dc2626' : '#2563eb',
    }}>{(type || '').toUpperCase()}</span>
  )
}

function ResultBadge({ calibrated }) {
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      backgroundColor: calibrated ? '#16a34a22' : '#dc262622',
      color: calibrated ? '#16a34a' : '#dc2626',
      border: `1px solid ${calibrated ? '#16a34a44' : '#dc262644'}`,
    }}>{calibrated ? 'Calibrated' : 'Not Calibrated'}</span>
  )
}

// ── CalibrationHome ──────────────────────────────────────────────────────────

function CalibrationHome({ onScore }) {
  const { profile } = useAuth()
  const uid = profile?.id
  const [certs, setCerts]           = useState([])
  const [activeSessions, setActive] = useState([])
  const [pastResults, setPast]      = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => { if (uid) load() }, [uid])

  async function load() {
    setLoading(true)

    // 1. My certifications
    const { data: certsData } = await supabase
      .from('calibration_certifications')
      .select('*')
      .eq('evaluator_id', uid)
    setCerts(certsData || [])

    // 2. Sessions where I'm a participant
    const { data: parts } = await supabase
      .from('calibration_participants')
      .select('session_id')
      .eq('evaluator_id', uid)

    const sessionIds = (parts || []).map(p => p.session_id)
    let evalSessions = []

    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from('calibration_sessions')
        .select('id, title, type, session_date, status')
        .in('id', sessionIds)
        .in('status', ['open', 'scoring'])
        .order('session_date', { ascending: false })

      const { data: mySubs } = await supabase
        .from('calibration_submissions')
        .select('session_id, id, status, is_calibrated, delta')
        .eq('evaluator_id', uid)
        .in('session_id', sessionIds)

      const subMap = Object.fromEntries((mySubs || []).map(s => [s.session_id, s]))
      evalSessions = (sessions || []).map(s => ({ ...s, submission: subMap[s.id] || null, isGaugeRole: false }))
    }

    // 3. Sessions where I'm the gauge
    const { data: gaugeSessions } = await supabase
      .from('calibration_sessions')
      .select('id, title, type, session_date, status')
      .eq('gauge_user_id', uid)
      .in('status', ['open', 'scoring'])
      .order('session_date', { ascending: false })

    let gaugeSessArr = []
    if ((gaugeSessions || []).length > 0) {
      const gaugeIds = gaugeSessions.map(s => s.id)
      const { data: gaugeSubs } = await supabase
        .from('calibration_submissions')
        .select('session_id, id, status, is_calibrated, delta')
        .eq('evaluator_id', uid)
        .in('session_id', gaugeIds)
      const gsMap = Object.fromEntries((gaugeSubs || []).map(s => [s.session_id, s]))
      const evalIds = new Set(evalSessions.map(s => s.id))
      gaugeSessArr = gaugeSessions
        .filter(s => !evalIds.has(s.id))
        .map(s => ({ ...s, submission: gsMap[s.id] || null, isGaugeRole: true }))
    }

    setActive([...evalSessions, ...gaugeSessArr])

    // 4. Past evaluated results
    const { data: results } = await supabase
      .from('calibration_submissions')
      .select('id, status, is_calibrated, delta, submitted_at, session_id')
      .eq('evaluator_id', uid)
      .eq('status', 'evaluated')
      .order('submitted_at', { ascending: false })
      .limit(20)

    if ((results || []).length > 0) {
      const rsIds = results.map(r => r.session_id)
      const { data: rsSessions } = await supabase
        .from('calibration_sessions')
        .select('id, title, type, session_date')
        .in('id', rsIds)
      const rsMap = Object.fromEntries((rsSessions || []).map(s => [s.id, s]))
      setPast(results.map(r => ({ ...r, session: rsMap[r.session_id] })))
    }

    setLoading(false)
  }

  function CertCard({ type, label }) {
    const cert = certs.find(c => c.scorecard_type === type)
    return (
      <div style={{ flex: 1, ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        {!cert ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No calibration data yet</div>
        ) : (
          <>
            <div style={{
              display: 'inline-block', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              backgroundColor: cert.is_active ? '#16a34a22' : '#dc262622',
              color: cert.is_active ? '#16a34a' : '#dc2626',
              border: `1px solid ${cert.is_active ? '#16a34a44' : '#dc262644'}`,
              marginBottom: 8,
            }}>
              {cert.is_active ? '✓ Certified' : '✗ Not Certified'}
            </div>
            {cert.last_calibrated_at && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Last calibrated: {new Date(cert.last_calibrated_at).toLocaleDateString()}
              </div>
            )}
            {!cert.is_active && cert.consecutive_failures >= 3 && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                Recertification required · {cert.consecutive_failures} consecutive failures
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>
  )

  const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tdStyle = { padding: '10px 16px' }

  return (
    <div>
      {/* Certification status */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Certification Status
        </h2>
        <div style={{ display: 'flex', gap: 16 }}>
          <CertCard type="dsat"    label="DSAT" />
          <CertCard type="quality" label="Quality" />
        </div>
      </section>

      {/* Active sessions */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Active Sessions
        </h2>
        {activeSessions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>
            No active sessions assigned to you
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {activeSessions.map(session => {
                  const sub = session.submission
                  const scored = sub?.status === 'submitted' || sub?.status === 'evaluated'
                  const canScore = session.status === 'scoring' && !scored
                  return (
                    <tr key={session.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{session.title}</td>
                      <td style={tdStyle}><TypeBadge type={session.type} /></td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {session.session_date ? new Date(session.session_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, fontWeight: session.isGaugeRole ? 600 : 400, color: session.isGaugeRole ? '#7c3aed' : 'var(--text-secondary)' }}>
                          {session.isGaugeRole ? 'Gauge' : 'Evaluator'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {scored
                          ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>✓ Submitted</span>
                          : session.status === 'open'
                            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Waiting to open</span>
                            : <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500 }}>● Pending</span>
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {canScore && (
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}
                            onClick={() => onScore(session)}>
                            Score
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Past results */}
      {pastResults.length > 0 && (
        <section>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Past Results
          </h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Session</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Delta</th>
                  <th style={thStyle}>Result</th>
                </tr>
              </thead>
              <tbody>
                {pastResults.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{r.session?.title || '—'}</td>
                    <td style={tdStyle}>{r.session?.type ? <TypeBadge type={r.session.type} /> : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {r.session?.session_date ? new Date(r.session.session_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {r.delta != null ? `${(r.delta * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={tdStyle}><ResultBadge calibrated={r.is_calibrated} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// ── CalibrationSubmit (Step 5 placeholder) ───────────────────────────────────

function CalibrationSubmit({ session, onBack }) {
  return (
    <div>
      <button onClick={onBack}
        style={{ marginBottom: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>
        ← Back to sessions
      </button>
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 14 }}>
        Scoring form for <strong>{session?.title}</strong> — coming soon
      </div>
    </div>
  )
}

// ── CalibrationAdmin (Step 8 placeholder) ────────────────────────────────────

function CalibrationAdmin() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 14 }}>
      Session management coming soon
    </div>
  )
}

// ── Root shell ────────────────────────────────────────────────────────────────

export default function Calibration() {
  const { profile } = useAuth()
  const isAdmin = ['admin', 'owner'].includes(profile?.role)
  const [tab, setTab]                = useState('sessions')
  const [scoringSession, setScoring] = useState(null)

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1>Calibration</h1>
          <p className="page-sub">COPC calibration sessions and certifications</p>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
          {[['sessions', 'My Sessions'], ['admin', 'Manage Sessions']].map(([key, label]) => (
            <button key={key}
              onClick={() => { setTab(key); setScoring(null) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 18px', fontSize: 13,
                fontWeight: tab === key ? 600 : 400,
                color: tab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${tab === key ? 'var(--accent, #2563eb)' : 'transparent'}`,
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'sessions' && (
        scoringSession
          ? <CalibrationSubmit session={scoringSession} onBack={() => setScoring(null)} />
          : <CalibrationHome onScore={s => setScoring(s)} />
      )}
      {tab === 'admin' && isAdmin && <CalibrationAdmin />}
    </div>
  )
}
