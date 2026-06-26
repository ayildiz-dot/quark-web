import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'

/* ================================================================
   MEASURE ENGINE — verified. Computes numbers from submitted evals.
================================================================ */

function isControllable(ev) {
  const mv = ev.metadata_values
  if (!Array.isArray(mv)) return false
  return mv.some(entry => entry?.value === 'Controllable')
}

// Pull the Communication Date (ISO string) from a DSAT eval's metadata.
function getCommunicationDate(ev) {
  const mv = ev.metadata_values
  if (!Array.isArray(mv)) return null
  const f = mv.find(e => e?.label === 'Communication Date')
  return f?.value || null
}

function computeMeasure(measureKey, evals, scorecard) {
  const n = evals.length
  switch (measureKey) {
    case 'eval_count':
      return { value: n, display: String(n) }
    case 'avg_quality_score': {
      if (n === 0) return { value: 0, display: '—' }
      const sum = evals.reduce((acc, e) => acc + (e.score ?? 0), 0)
      const avg = Math.round(sum / n)
      return { value: avg, display: avg + '%' }
    }
    case 'controllability_rate': {
      if (n === 0) return { value: 0, display: '—' }
      const c = evals.filter(isControllable).length
      const rate = Math.round((c / n) * 100)
      return { value: rate, display: rate + '%', detail: c + ' of ' + n + ' controllable' }
    }
    default:
      return { value: null, display: '?', detail: 'Unknown measure: ' + measureKey }
  }
}

/* ================================================================
   WEEK BUCKETING for the WoW chart.
   - Quality: bucket by submitted_at
   - DSAT: bucket by Communication Date (from metadata)
   Returns sorted array of { weekLabel, weekStart, rate, count }.
   Weeks with no data simply don't appear (gaps).
================================================================ */

// Monday-start of the week for a given date.
function weekStartOf(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  const day = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function buildWeeklySeries(evals, scorecard) {
  const isDsat = scorecard.type === 'dsat'
  const buckets = new Map() // key: ISO week-start, value: { evals: [] }

  for (const ev of evals) {
    const rawDate = isDsat ? getCommunicationDate(ev) : ev.submitted_at
    if (!rawDate) continue
    const ws = weekStartOf(rawDate)
    if (!ws) continue
    const key = ws.toISOString().slice(0, 10)
    if (!buckets.has(key)) buckets.set(key, { weekStart: ws, evals: [] })
    buckets.get(key).evals.push(ev)
  }

  const rows = [...buckets.values()]
    .sort((a, b) => a.weekStart - b.weekStart)
    .map(b => {
      const count = b.evals.length
      let rate
      if (isDsat) {
        const c = b.evals.filter(isControllable).length
        rate = count ? Math.round((c / count) * 100) : 0
      } else {
        const sum = b.evals.reduce((acc, e) => acc + (e.score ?? 0), 0)
        rate = count ? Math.round(sum / count) : 0
      }
      const label = b.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      return { weekLabel: label, rate, count }
    })

  return rows
}

/* ================================================================
   COMBO CHART — bars for volume, line for rate, dual axis.
   Themed via CSS variables read at render.
================================================================ */

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v?.trim() || fallback
}

function WowComboChart({ data, scorecard }) {
  const isDsat = scorecard.type === 'dsat'
  const rateName = isDsat ? 'Controllability %' : 'Quality Score %'
  const accent = cssVar('--accent', '#3b82f6')
  const barColor = cssVar('--border-light', '#2d3f5e')
  const grid = cssVar('--border', '#1e293b')
  const textSec = cssVar('--text-secondary', '#94a3b8')
  const surface = cssVar('--bg-surface', '#1a2235')

  if (!data.length) {
    return (
      <div style={{
        height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-tertiary)', fontSize: 13
      }}>
        No dated evaluations yet. The trend appears once evaluations have dates.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="weekLabel" stroke={textSec} fontSize={12} tickLine={false} />
        <YAxis yAxisId="left" stroke={textSec} fontSize={12} domain={[0, 100]}
          tickLine={false} axisLine={false} unit="%" width={44} />
        <YAxis yAxisId="right" orientation="right" stroke={textSec} fontSize={12}
          allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          contentStyle={{ background: surface, border: '1px solid ' + grid, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'var(--text-primary)' }}
          labelFormatter={l => 'Week of ' + l}
          formatter={(value, name) => name === rateName ? [value + '%', name] : [value, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="right" dataKey="count" name="Evaluations" fill={barColor} radius={[3, 3, 0, 0]} barSize={28} />
        <Line yAxisId="left" type="monotone" dataKey="rate" name={rateName}
          stroke={accent} strokeWidth={2.5} dot={{ r: 3, fill: accent }} activeDot={{ r: 5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ================================================================
   SCORECARD DASHBOARD
================================================================ */

export default function ScorecardDashboard() {
  const { region, type, scorecardId } = useParams()
  const navigate = useNavigate()
  const [scorecard, setScorecard] = useState(null)
  const [widgets, setWidgets] = useState([])
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { load() }, [scorecardId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: sc, error: scErr } = await supabase
        .from('scorecards')
        .select('id, name, type, pass_threshold')
        .eq('id', scorecardId)
        .single()
      if (scErr) throw scErr

      const { data: w } = await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('scorecard_id', scorecardId)
        .order('position')

      const { data: ev } = await supabase
        .from('evaluations')
        .select('id, score, metadata_values, submitted_at, evaluation_type, status')
        .eq('scorecard_id', scorecardId)
        .eq('status', 'submitted')
        .eq('evaluation_type', sc.type)

      setScorecard(sc)
      setWidgets(w || [])
      setEvals(ev || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page"><div className="loader-row"><div className="spinner" /></div></div>
  if (error) return (
    <div className="page"><div className="card" style={{ color: 'var(--danger)' }}>Failed to load dashboard: {error}</div></div>
  )

  const statCards = widgets.filter(w => w.widget_type === 'stat_card')
  const charts = widgets.filter(w => w.widget_type === 'line_chart')
  const weeklyData = buildWeeklySeries(evals, scorecard)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate(`/dashboard/${region}/${type}`)}>← Scorecards</button>
          <h1>{scorecard.name}</h1>
          <p className="page-sub">
            {scorecard.type === 'dsat' ? 'DSAT' : 'Quality'} dashboard · {evals.length} submitted evaluation{evals.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {evals.length === 0 && (
        <div className="card" style={{ marginBottom: 20, color: 'var(--text-secondary)', textAlign: 'center', padding: 32 }}>
          No submitted evaluations for this scorecard yet. Numbers will populate once evaluations are submitted.
        </div>
      )}

      <div className="stats-grid">
        {statCards.map(w => {
          const result = computeMeasure(w.config?.measure, evals, scorecard)
          return (
            <div key={w.id} className="stat-card">
              <div className="stat-label">{w.title}</div>
              <div className="stat-value">{result.display}</div>
              {result.detail && <div className="stat-sub">{result.detail}</div>}
            </div>
          )
        })}
      </div>

      {charts.map(w => (
        <div key={w.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>{w.title}</div>
          <WowComboChart data={weeklyData} scorecard={scorecard} />
        </div>
      ))}
    </div>
  )
}
