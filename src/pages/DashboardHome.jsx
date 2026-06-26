import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* Region maps — real, simplified geographic outlines (Natural Earth 110m,
   heavily simplified for a clean silhouette). Stroke-only, currentColor. */
const MAP_PATHS = {
  brazil:   {"viewBox":"0 0 120 120","d":"M62.9,120L63.4,116.4L61.7,114L52.3,107.4L50.4,107.7L57.6,99.9L62.1,96.7L62.1,94.1L59.2,92.9L60.2,87.3L57,87.1L56.3,82.9L53.8,81.1L49.5,81.1L48.8,75.1L50.8,68.9L48.5,66.1L48.6,63.2L43,63L42,55.5L34.1,52L30.8,51.5L27.6,48.9L27.8,43.5L24,44L19.2,47.2L12.5,47.2L12.7,42.7L7.7,44.3L2.5,36.8L5,34.2L5.7,30.2L11.8,27.2L14.5,27.3L15.8,19.3L14.1,13.1L14.7,9.7L20.4,9.8L24.9,12.6L31.2,10.3L33.4,7.6L30.9,7.4L29.9,2.5L34.4,3.7L43.5,0L44.8,3.1L43.5,6.6L46.3,10.9L51.3,9L55.2,9.4L55.3,7.4L62.8,8.7L65.3,7.4L68.9,2.4L72.9,11.7L71.6,15L76.8,15.4L76.9,18.3L79.2,16.4L87.7,19.3L88.7,22.6L92.1,21.7L97.8,23.3L102.2,23.1L110.2,28.9L116.1,30.8L117.5,36.3L116.4,41.2L110.8,47.3L105.2,55.6L105.4,61.2L102.8,73.3L99.8,77.4L99.3,80.7L96.3,83.9L88.5,85.2L83.1,87.5L77.2,93.3L76,102.5L74,104.4L70.7,110.3L66.2,114.7Z"},
  latam_on: {"viewBox":"0 0 160 120","d":"M61.7,55.6L59.3,54.1L55.1,45.8L52.2,45.3L52.2,33.4L58.9,32.2L66.4,35.3L76.5,35.8L76.3,29.9L81.2,37.9L76.8,44.6L77.8,48.5L83.1,50.3L86.1,49L85.3,43L92.4,45.2L97.1,53L91.4,54.6L92,59.8L89.9,56.8L83,61.1L82.9,58.5L76.3,55.6ZM82.2,42.9L82.2,42.9L82.2,42.9ZM84.4,28.3L84.4,28.3L84.4,28.3ZM84.1,43.3L84.1,43.3L84.1,43.3ZM77.1,24.2L77.1,24.2L77.1,24.2ZM77,18.5L77,18.5L77,18.5ZM75.5,15.4L75.5,15.4L75.5,15.4ZM80,25.4L80,25.4L80,25.4ZM67.8,17L67.8,17L67.8,17ZM68,15.2L68,15.2L68,15.2ZM97.1,53.7L98.7,56.8L95.2,56.7ZM82.2,39.7L82.2,39.7L82.2,39.7ZM84.9,29.1L90.2,32.1L93.8,37.5L92.2,42.6L85.4,39.5L87.8,35.8L79.7,32.3L79.8,27ZM76.6,25.9L76.6,25.9L76.6,25.9ZM61.7,21.8L61.7,21.8L61.7,21.8ZM56.5,51.4L56.5,51.4L56.5,51.4ZM70.9,13.9L70.9,13.9L70.9,13.9ZM61.4,56L61.4,56L61.4,56ZM62.4,25.2L65.6,27.1L61.6,31.5ZM69.6,22.4L69.6,22.4L69.6,22.4ZM70.3,27.8L73.2,32.9L66.7,35.1L64.3,28.5ZM73.5,28.5L73.5,28.5L73.5,28.5ZM70.3,26.9L70.3,26.9L70.3,26.9ZM74.5,20.4L74.5,20.4L74.5,20.4ZM75.8,9.9L81.2,13.8L77.5,16.5ZM78.2,5.5L88,0L93.8,3.7L87.5,13.6L84,21.7L79.3,21L81.6,13.7ZM86.8,36.7L86.8,36.7L86.8,36.7ZM75.7,33.7L75.7,33.7L75.7,33.7ZM92.4,54.9L92.4,54.9L92.4,54.9ZM92.7,57.2L92.7,57.2L92.7,57.2ZM90.3,118L91.1,120L90.3,118ZM96,102L96.5,106.2L93.6,107.5L90.3,117.7L87.8,116.1L91.1,97.6L93.4,97.3L97.6,99.3ZM90.3,118L91.1,120L90.3,118ZM89.8,94.7L91.1,97.6L87.8,116.1L90.3,117.7L86.9,117.7L86.6,113.1L88.8,103.3L89.3,95.1ZM64.7,67.2L70.3,67.6L75.3,71.2L76.7,75.6L80.6,73.7L77.8,77.6L71.9,75.5L70.6,73ZM96,102L97.6,99.3L95.8,96.1L95.7,94L89.8,91.1L87.4,89.3L89.6,87.6L91.2,84.6L94.4,82.5L95.3,84.6L99.4,83.1L100.8,85.4L107.8,88.2L104.3,97.7L101.9,98.4L98.3,104.2ZM89.8,91.1L95.7,94L95.8,96.1L93.4,97.3L91.1,97.6L89.8,94.7ZM89.6,87.6L87.4,89.3L89.8,91.1L89.8,94.7L89.3,95.1L86.4,93.1L83.5,87.8L86.7,85.4ZM91.2,84.6L89.6,87.6L86.7,85.4L84.9,84.6L86.7,79.7L88.8,79L88.5,81.6L90.9,82.1ZM94.4,82.5L91.2,84.6L90.9,82.1L88.5,81.6L88.8,79L93.8,79.6ZM95.8,96.1L97.6,99.3L93.4,97.3Z"},
  eur_afr:  {"viewBox":"0 0 130 150","d":"M83.8,122.7L84.7,127.5L85.1,131.3L80.1,135.7L80.3,140L78.5,142.1L74.6,147.9L67.4,150L64.6,143.8L60.7,133.5L62.3,129L61.2,123.9L61.8,122.8L60.2,122.1L58.3,119.7L60.4,116.9L58,114.8L55.8,115.2L53.2,113.5L52.5,113.6L51.8,113.8L48.5,114.6L44.4,115.1L41.3,113.1L39.8,111.3L39.4,108.1L36.9,108.3L37.1,105L36.6,100.7L36.6,100.4L38.8,95.9L42.9,92.4L45.9,86.6L49.1,87.2L52.1,85.7L58,85.4L60.5,89.3L66.9,92.1L68.4,89.7L72,90.8L79.3,91.4L78.4,93.6L81.9,99.8L83.1,103.4L86.5,108.2L87.6,111L91,112L93.8,108.6L92.4,113.1L85.8,120.2ZM75.2,144.2L75.2,144.2L75.2,144.2ZM77.6,141.3L77.8,142.1L77.6,141.3ZM75.5,122.6L76.4,119.7L75.7,119.9ZM63.6,3.1L69,6.4L65.3,15L59.7,3.2ZM68.2,37.4L65,39.9L60.9,49.9L60.2,57.3L55.7,57.7L55.1,52L59.7,47.3L63.3,40.4L71.5,32.7L77.2,34.2L74.9,37.5L76.1,49.1L74.5,54.6L70.1,55.7L68.6,50.9L72.2,46.1ZM73.9,1.3L67.8,3.6L65.5,0ZM71.7,11L71.7,11L71.7,11ZM7.5,115.3L5.1,116.8L5.6,113.9ZM59.2,63.3L62.8,65L65.7,63.5L70,64.2L68.6,61.7L71.3,59L70.5,56.8L74.5,56.6L73.8,59.5L73.1,62.3L70.6,64.8L70.7,68.1L76.6,68.4L79.2,67L84.5,70.7L84.3,72.8L75.8,76L74.9,77.9L72.8,80L70.1,81.5L71.1,84L69.1,85.5L67.8,82.5L70.2,80.6L69.9,77.3L67.9,75L66.7,75.3L66.9,76.5L66.5,79.1L63.4,76.3L64.8,74.6L64.5,74.1L62.5,74.6L61.5,77.4L66.3,81.7L63.8,82L58.4,77.1L57.1,77.9L53.4,79.3L49.1,85.6L44.6,85.2L42.9,83.4L43.3,80L44.2,77.8L49.3,78.2L49.9,75.2L47,71.9L49.5,71.9L53,68.6L53.7,68.4L56.7,65.4L58.1,63.3ZM74.6,75.8L73.2,72.4L74.6,75.8ZM56,70L55.7,70.8L56.1,70.8ZM92.5,129.3L93.3,131.7L90.4,140.4L87.9,140.5L87.2,137.8L88.2,132.6ZM124.9,94.4L122.5,95.5L118.1,93.5L119.4,91.9ZM45.7,64.9L42.5,67.7L44.5,63.1ZM48.3,65.5L45.7,60.6L49.2,59.2L51.4,69.1L46,69.9Z"},
}

const RegionMap = ({ which }) => {
  const m = MAP_PATHS[which]
  return (
    <svg viewBox={m.viewBox} fill="none" stroke="currentColor" strokeWidth="1.2"
      strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"
      style={{ width: '100%', height: '100%' }}>
      <path d={m.d} />
    </svg>
  )
}

const REGIONS = [
  { key: 'brazil', label: 'Brazil', sub: 'BR operations', map: 'brazil' },
  { key: 'latam-on', label: 'LATAM + ON', sub: 'Latin America & Ontario', map: 'latam_on' },
  { key: 'emea', label: 'EMEA', sub: 'Europe, Middle East & Africa', map: 'eur_afr' },
]

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

/* ============================== REGION LANDING ============================== */
function RegionLanding() {
  const navigate = useNavigate()
  const lift = useLift()
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboards</h1>
          <p className="page-sub">Choose a region to begin</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
        {REGIONS.map(({ key, label, sub, map }) => (
          <button key={key} {...lift}
            onClick={() => navigate(`/dashboard/${key}`)}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '32px 24px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
              transition: 'all .18s ease', textAlign: 'center', color: 'var(--text-primary)'
            }}>
            <div style={{ width: 150, height: 120, color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RegionMap which={map} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px' }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* =============================== TYPE PICKER =============================== */
const TYPE_CARDS = [
  {
    key: 'quality', label: 'Quality', accent: 'var(--accent)',
    desc: 'Score trends, pass rates, and per-question performance.',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
        <path d="M8 30 L18 20 L26 26 L40 12" />
        <path d="M40 12 L40 20 M40 12 L32 12" />
      </svg>
    ),
  },
  {
    key: 'dsat', label: 'DSAT', accent: 'var(--danger)',
    desc: 'Controllability rates and detractor breakdowns over time.',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '100%', height: '100%' }}>
        <circle cx="24" cy="24" r="16" />
        <path d="M24 16 L24 26 M24 32 L24 32.4" />
      </svg>
    ),
  },
]

function TypePicker() {
  const { region } = useParams()
  const navigate = useNavigate()
  const lift = useLift()
  const regionMeta = REGIONS.find(r => r.key === region)
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate('/dashboard')}>← Regions</button>
          <h1>{regionMeta?.label || 'Region'}</h1>
          <p className="page-sub">Choose a dashboard type</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 720 }}>
        {TYPE_CARDS.map(({ key, label, desc, accent, icon }) => (
          <button key={key} {...lift}
            onClick={() => navigate(`/dashboard/${region}/${key}`)}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', padding: '28px 24px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start',
              transition: 'all .18s ease', textAlign: 'left', color: 'var(--text-primary)'
            }}>
            <div style={{ width: 44, height: 44, color: accent }}>{icon}</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px' }}>{label}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ============================ SCORECARD PICKER ============================ */
function ScorecardPicker() {
  const { region, type } = useParams()
  const navigate = useNavigate()
  const lift = useLift()
  const [scorecards, setScorecards] = useState([])
  const [loading, setLoading] = useState(true)
  const regionMeta = REGIONS.find(r => r.key === region)

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('scorecards')
        .select('id, name, description, is_published')
        .eq('type', type)
        .eq('is_published', true)
        .order('name')
      setScorecards(data || [])
      setLoading(false)
    })()
  }, [type])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate(`/dashboard/${region}`)}>← {regionMeta?.label || 'Region'}</button>
          <h1>{type === 'dsat' ? 'DSAT' : 'Quality'} Dashboards</h1>
          <p className="page-sub">Choose a scorecard</p>
        </div>
      </div>

      {loading ? (
        <div className="loader-row"><div className="spinner" /></div>
      ) : scorecards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No published {type === 'dsat' ? 'DSAT' : 'Quality'} scorecards yet. Publish one to see its dashboard here.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {scorecards.map(sc => (
            <button key={sc.id} {...lift}
              onClick={() => navigate(`/dashboard/${region}/${type}/${sc.id}`)}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', padding: '22px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start',
                transition: 'all .18s ease', textAlign: 'left', color: 'var(--text-primary)',
                minHeight: 110
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{sc.name}</span>
                <span className={`badge ${type === 'dsat' ? 'badge-fail' : 'badge-eval'}`} style={{ marginLeft: 'auto' }}>
                  {type === 'dsat' ? 'DSAT' : 'Quality'}
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
  const { region, type, scorecardId } = useParams()
  if (scorecardId) return null
  if (region && type) return <ScorecardPicker />
  if (region) return <TypePicker />
  return <RegionLanding />
}
