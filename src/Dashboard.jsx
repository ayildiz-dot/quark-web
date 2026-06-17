import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadStats() }, [])

  const loadStats = async () => {
    const [totalRes, passRes, failRes, recentRes] = await Promise.all([
      supabase.from('evaluations').select('*', { count: 'exact', head: true }),
      supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('pass_fail', 'pass'),
      supabase.from('evaluations').select('*', { count: 'exact', head: true }).eq('pass_fail', 'fail'),
      supabase.from('evaluations')
        .select('*, users(name)')
        .order('submitted_at', { ascending: false })
        .limit(5)
    ])
    const total   = totalRes.count || 0
    const passed  = passRes.count  || 0
    const failed  = failRes.count  || 0
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
    setStats({ total, passed, failed, passRate, recent: recentRes.data || [] })
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
        <div className="stat-card">
          <div className="stat-label">Total Evaluations</div>
          <div className="stat-value">{stats.total.toLocaleString()}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pass Rate</div>
          <div className="stat-value" style={{ color: stats.passRate >= 75 ? 'var(--success)' : 'var(--danger)' }}>
            {stats.passRate}%
          </div>
          <div className="stat-sub">Target: 75%</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Passed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{stats.passed.toLocaleString()}</div>
          <div className="stat-sub">Interactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{stats.failed.toLocaleString()}</div>
          <div className="stat-sub">Interactions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 16 }}>Recent Evaluations</div>
        {stats.recent.length === 0 ? (
          <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            No evaluations submitted yet.
          </p>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Evaluator</th>
                  <th>Channel</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map(ev => (
                  <tr key={ev.id}>
                    <td>{ev.agent_name}</td>
                    <td>{ev.users?.name || '—'}</td>
                    <td><span className="badge badge-channel">{ev.channel}</span></td>
                    <td>{ev.total_score}/{ev.max_score}</td>
                    <td>
                      <span className={`badge badge-${ev.pass_fail}`}>
                        {ev.pass_fail?.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(ev.submitted_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}