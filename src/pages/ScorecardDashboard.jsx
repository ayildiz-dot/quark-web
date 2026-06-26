import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ================================================================
   MEASURE ENGINE
   Pure functions: take a scorecard + its submitted evaluations,
   return computed numbers for each measure key. No rendering here.
================================================================ */

// Find the controllability answer in a DSAT evaluation's flattened metadata_values.
// We treat the evaluation as "controllable" if any answer value is exactly "Controllable".
function isControllable(ev) {
  const mv = ev.metadata_values
  if (!Array.isArray(mv)) return false
  return mv.some(entry => entry?.value === 'Controllable')
}

// Compute a single measure key against a set of submitted evaluations.
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
      const controllable = evals.filter(isControllable).length
      const rate = Math.round((controllable / n) * 100)
      return { value: rate, display: rate + '%',
               detail: controllable + ' of ' + n + ' controllable' }
    }

    default:
      return { value: null, display: '?', detail: 'Unknown measure: ' + measureKey }
  }
}

/* ================================================================
   SCORECARD DASHBOARD
   Loads the scorecard, its widgets, and its submitted evaluations,
   then renders each widget. Stat cards show real numbers now;
   chart widgets show a placeholder until the next step.
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
      // 1. Scorecard (type + pass_threshold)
      const { data: sc, error: scErr } = await supabase
        .from('scorecards')
        .select('id, name, type, pass_threshold')
        .eq('id', scorecardId)
        .single()
      if (scErr) throw scErr

      // 2. Its widgets, in order
      const { data: w } = await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('scorecard_id', scorecardId)
        .order('position')

      // 3. Its submitted evaluations of the matching type (drafts excluded)
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
    <div className="page">
      <div className="card" style={{ color: 'var(--danger)' }}>Failed to load dashboard: {error}</div>
    </div>
  )

  const statCards = widgets.filter(w => w.widget_type === 'stat_card')
  const charts = widgets.filter(w => w.widget_type !== 'stat_card')

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

      {/* Stat cards */}
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

      {/* Chart widgets — placeholder until the next build step */}
      {charts.map(w => (
        <div key={w.id} className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>{w.title}</div>
          <div style={{
            height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px dashed var(--border-light)', borderRadius: 'var(--radius)',
            color: 'var(--text-tertiary)', fontSize: 13
          }}>
            Chart renders in the next step — measure engine verified first
          </div>
        </div>
      ))}

      {/* TEMP: raw measure debug panel so we can verify the math against the data */}
      <div className="card" style={{ marginTop: 20, background: 'var(--bg-secondary)' }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Engine check (temporary)</div>
        <div style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>Scorecard type: {scorecard.type}</div>
          <div>Submitted evaluations loaded: {evals.length}</div>
          {scorecard.type === 'quality' && (
            <>
              <div>avg_quality_score → {computeMeasure('avg_quality_score', evals, scorecard).display}</div>
              <div>eval_count → {computeMeasure('eval_count', evals, scorecard).display}</div>
            </>
          )}
          {scorecard.type === 'dsat' && (
            <>
              <div>controllability_rate → {computeMeasure('controllability_rate', evals, scorecard).display} ({computeMeasure('controllability_rate', evals, scorecard).detail || 'n/a'})</div>
              <div>eval_count → {computeMeasure('eval_count', evals, scorecard).display}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
