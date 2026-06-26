import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function isControllable(ev) {
  const mv = ev.metadata_values
  if (!Array.isArray(mv)) return false
  return mv.some(entry => entry?.value === 'Controllable')
}

function computeMeasure(measureKey, evals, scorecard) {
  const n = evals.length
  switch (measureKey) {
    case 'eval_count': return { value: n, display: String(n) }
    case 'avg_quality_score': {
      if (n === 0) return { value: 0, display: '—' }
      const sum = evals.reduce((acc, e) => acc + (e.score ?? 0), 0)
      return { value: 0, display: Math.round(sum / n) + '%' }
    }
    case 'controllability_rate': {
      if (n === 0) return { value: 0, display: '—' }
      const c = evals.filter(isControllable).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    default: return { display: '?' }
  }
}

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
    setLoading(true); setError(null)
    try {
      const { data: sc, error: scErr } = await supabase
        .from('scorecards').select('id, name, type, pass_threshold').eq('id', scorecardId).single()
      if (scErr) throw scErr
      const { data: w } = await supabase
        .from('dashboard_widgets').select('*').eq('scorecard_id', scorecardId).order('position')
      const { data: ev } = await supabase
        .from('evaluations')
        .select('id, score, metadata_values, submitted_at, evaluation_type, status')
        .eq('scorecard_id', scorecardId).eq('status', 'submitted').eq('evaluation_type', sc.type)
      setScorecard(sc); setWidgets(w || []); setEvals(ev || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  if (loading) return <div className="page"><div className="loader-row"><div className="spinner" /></div></div>
  if (error) return <div className="page"><div className="card" style={{ color: 'var(--danger)' }}>Failed: {error}</div></div>

  const statCards = widgets.filter(w => w.widget_type === 'stat_card')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate(`/dashboard/${region}/${type}`)}>← Scorecards</button>
          <h1>{scorecard.name}</h1>
          <p className="page-sub">{scorecard.type} dashboard · {evals.length} submitted · {widgets.length} widgets</p>
        </div>
      </div>

      <div style={{ background: '#fee2e2', border: '2px solid #dc2626', color: '#7f1d1d', padding: 14, marginBottom: 16, fontSize: 14, borderRadius: 8 }}>
        DIAGNOSTIC BUILD — chart removed. Stat cards below should appear. ({statCards.length} stat cards found)
      </div>

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
    </div>
  )
}
