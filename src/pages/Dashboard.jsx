import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    // Only submitted Quality evaluations. Drafts and DSAT excluded.
    // Join scorecard to read each scorecard's pass_threshold (defaults to 90).
    const { data: evals } = await supabase
      .from('evaluations')
      .select('id, score, agent_name, channel, submitted_at, scorecard_version, users(name), scorecards!evaluations_scorecard_id_fkey(name, pass_threshold)')
      .eq('status', 'submitted')
      .eq('evaluation_type', 'quality')
      .order('submitted_at', { ascending: false })

    const rows = evals || []

    let passed = 0
    let failed = 0
    let scoreSum = 0
    for (const ev of rows) {
      const threshold = ev.scorecards?.pass_threshold ?? 90
      const score = ev.score ?? 0
      scoreSum += score
      if (score >= threshold) passed++
      else failed++
    }

    const total = rows.length
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
    const avgScore = total > 0 ? Math.round(scoreSum / total) : 0

    setStats({ total, passed, failed, passRate, avgScore, recent: rows.slice(0, 5) })
    setLoading(false)
  }

  if (loading) return <div className="loader-row"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">Welcome back, {profile?.name?.split(' ')[0] || 'there'}</p>
        </div>
      </div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">Quality Evaluations</div><div className="stat-value">{stats.total.toLocaleString()}</div><div className="stat-sub">Submitted</div></div>
        <div className="stat-card"><div className="stat-label">Avg Quality Score</div><div className="stat-value" style={{ color: stats.avgScore >= 90 ? 'var(--success)' : 'var(--danger)' }}>{stats.avgScore}%</div><div className="stat-sub">Across all scorecards</div></div>
        <div className="stat-card"><div className="stat-label">Pass Rate</div><div className="stat-value" style={{ color: stats.passRate >= 75 ? 'var(--success)' : 'var(--danger)' }}>{stats.passRate}%</div><div className="stat-sub">Meeting threshold</div></div>
        <div className="stat-card"><div className="stat-label">Passed / Failed</div><div className="stat-value"><span style={{ color: 'var(--success)' }}>{stats.passed}</span> <span style={{ color: 'var(--text-tertiary)', fontSize: 20 }}>/</span> <span style={{ color: 'var(--danger)' }}>{stats.failed}</span></div><div className="stat-sub">Evaluations</div></div>
      </div>
      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>Recent Quality Evaluations</div>
        {stats.recent.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No quality evaluations submitted yet.</p>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead><tr><th>Agent</th><th>Evaluator</th><th>Channel</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
              <tbody>
                {stats.recent.map(ev => {
                  const threshold = ev.scorecards?.pass_threshold ?? 90
                  const score = ev.score ?? 0
                  const passed = score >= threshold
                  return (
                    <tr key={ev.id}>
                      <td>{ev.agent_name || '—'}</td>
                      <td>{ev.users?.name || '—'}</td>
                      <td>{ev.channel ? <span className="badge badge-channel">{ev.channel}</span> : '—'}</td>
                      <td>{score}%</td>
                      <td><span className={`badge badge-${passed ? 'pass' : 'fail'}`}>{passed ? 'PASS' : 'FAIL'}</span></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{new Date(ev.submitted_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
