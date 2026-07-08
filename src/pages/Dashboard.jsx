import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: null },
]

const STOP_WORDS = new Set([
  'the','a','an','is','was','are','were','be','been','has','had','have','do','did',
  'does','to','of','in','on','at','for','with','this','that','and','or','but','not',
  'no','so','if','it','its','he','she','they','we','you','my','your','their','our',
  'very','too','also','just','from','by','as','up','out','which','when','who','how',
  'what','all','more','could','would','should','will','can','need','there','here',
  'than','then','about','into','after','before','during','while','however','overall',
  'agent','evaluation','evaluated','evaluator','good','great','well','nice','fine',
  'okay','poor','quite','really','some','being','their','them','these','those','each',
])

function extractThemes(comments) {
  const freq = {}
  for (const c of comments) {
    if (!c) continue
    for (const word of c.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)) {
      if (word.length < 4 || STOP_WORDS.has(word)) continue
      freq[word] = (freq[word] || 0) + 1
    }
  }
  return Object.entries(freq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
}

function SummaryBubble({ stats, activePreset }) {
  if (!activePreset) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 24,
        display: 'flex', alignItems: 'center', gap: 12,
        color: 'var(--text-secondary)', fontSize: 14,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
        <span>You need to choose a filter first to generate a Summary.</span>
      </div>
    )
  }

  if (!stats) return null

  const { total, passed, failed, passRate, avgScore, themes, scorecardNames } = stats

  let text
  if (total === 0) {
    text = `No quality evaluations were submitted ${activePreset.days ? `in the ${activePreset.label.toLowerCase()}` : 'yet'}.`
  } else {
    const scopeLabel = activePreset.days ? `Over the ${activePreset.label.toLowerCase()}` : 'Across all time'
    const scorecardPart = scorecardNames.length
      ? ` across ${scorecardNames.length} scorecard${scorecardNames.length > 1 ? 's' : ''}`
      : ''
    const perfNote =
      passRate >= 90 ? 'Performance is strong.'
      : passRate >= 75 ? 'Performance is on track but has room for improvement.'
      : 'Pass rate is below target — coaching opportunities likely.'
    const themePart = themes.length
      ? ` Top topics in evaluator comments: ${themes.join(', ')}.`
      : ''
    text = `${scopeLabel}, ${total} quality evaluation${total !== 1 ? 's were' : ' was'} submitted${scorecardPart}. The average score was ${avgScore}% with a ${passRate}% pass rate (${passed} passed, ${failed} failed). ${perfNote}${themePart}`
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius-lg)',
      padding: '14px 20px', marginBottom: 24,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6,
      }}>
        Summary — {activePreset.label}
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>
        {text}
      </p>
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePreset, setActivePreset] = useState(null)

  useEffect(() => { loadStats(null) }, [])

  const loadStats = async (preset) => {
    setLoading(true)
    let query = supabase
      .from('evaluations')
      .select('id, score, agent_name, channel, submitted_at, overall_comment, scorecard_version, users(name), scorecards!evaluations_scorecard_id_fkey(name, pass_threshold)')
      .eq('status', 'submitted')
      .eq('evaluation_type', 'quality')
      .order('submitted_at', { ascending: false })

    if (preset?.days) {
      const since = new Date()
      since.setDate(since.getDate() - preset.days)
      query = query.gte('submitted_at', since.toISOString())
    }

    const { data: evals } = await query
    const rows = evals || []

    let passed = 0, failed = 0, scoreSum = 0
    const comments = [], scNames = new Set()
    for (const ev of rows) {
      const threshold = ev.scorecards?.pass_threshold ?? 90
      const score = ev.score ?? 0
      scoreSum += score
      if (score >= threshold) passed++; else failed++
      if (ev.overall_comment) comments.push(ev.overall_comment)
      if (ev.scorecards?.name) scNames.add(ev.scorecards.name)
    }

    const total = rows.length
    setStats({
      total, passed, failed,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
      avgScore: total > 0 ? Math.round(scoreSum / total) : 0,
      themes: extractThemes(comments),
      scorecardNames: [...scNames],
      recent: rows.slice(0, 5),
    })
    setLoading(false)
  }

  const handlePreset = (p) => {
    setActivePreset(p)
    loadStats(p)
  }

  return (
    <div className="page">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Dashboard</h1>
          <p className="page-sub">Welcome back, {profile?.name?.split(' ')[0] || 'there'}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              className={`btn btn-sm ${activePreset?.label === p.label ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handlePreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <SummaryBubble stats={stats} activePreset={activePreset} />

      {loading ? (
        <div className="loader-row"><div className="spinner" /></div>
      ) : stats ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Quality Evaluations</div>
              <div className="stat-value">{stats.total.toLocaleString()}</div>
              <div className="stat-sub">Submitted</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Avg Quality Score</div>
              <div className="stat-value" style={{ color: stats.avgScore >= 90 ? 'var(--success)' : 'var(--danger)' }}>
                {stats.avgScore}%
              </div>
              <div className="stat-sub">Across all scorecards</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pass Rate</div>
              <div className="stat-value" style={{ color: stats.passRate >= 75 ? 'var(--success)' : 'var(--danger)' }}>
                {stats.passRate}%
              </div>
              <div className="stat-sub">Meeting threshold</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Passed / Failed</div>
              <div className="stat-value">
                <span style={{ color: 'var(--success)' }}>{stats.passed}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 20 }}> / </span>
                <span style={{ color: 'var(--danger)' }}>{stats.failed}</span>
              </div>
              <div className="stat-sub">Evaluations</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>Recent Quality Evaluations</div>
            {stats.recent.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
                No quality evaluations submitted yet.
              </p>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table className="table">
                  <thead>
                    <tr><th>Agent</th><th>Evaluator</th><th>Channel</th><th>Score</th><th>Result</th><th>Date</th></tr>
                  </thead>
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
        </>
      ) : null}
    </div>
  )
}
