import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* Region maps — real, simplified geographic outlines (Natural Earth 110m,
   heavily simplified for a clean silhouette). Stroke-only, currentColor. */
const MAP_PATHS = {
  brazil:   {"viewBox":"0 0 120 120","d":"M62.9,120L63.4,116.4L61.7,114L52.3,107.4L50.4,107.7L57.6,99.9L62.1,96.7L62.1,94.1L59.2,92.9L60.2,87.3L57,87.1L56.3,82.9L53.8,81.1L49.5,81.1L48.8,75.1L50.8,68.9L48.5,66.1L48.6,63.2L43,63L42,55.5L34.1,52L30.8,51.5L27.6,48.9L27.8,43.5L24,44L19.2,47.2L12.5,47.2L12.7,42.7L7.7,44.3L2.5,36.8L5,34.2L5.7,30.2L11.8,27.2L14.5,27.3L15.8,19.3L14.1,13.1L14.7,9.7L20.4,9.8L24.9,12.6L31.2,10.3L33.4,7.6L30.9,7.4L29.9,2.5L34.4,3.7L43.5,0L44.8,3.1L43.5,6.6L46.3,10.9L51.3,9L55.2,9.4L55.3,7.4L62.8,8.7L65.3,7.4L68.9,2.4L72.9,11.7L71.6,15L76.8,15.4L76.9,18.3L79.2,16.4L87.7,19.3L88.7,22.6L92.1,21.7L97.8,23.3L102.2,23.1L110.2,28.9L116.1,30.8L117.5,36.3L116.4,41.2L110.8,47.3L105.2,55.6L105.4,61.2L102.8,73.3L99.8,77.4L99.3,80.7L96.3,83.9L88.5,85.2L83.1,87.5L77.2,93.3L76,102.5L74,104.4L70.7,110.3L66.2,114.7Z"},
  latam_on: {"viewBox":"0 0 160 120","d":"M61.7,55.6L59.3,54.1L55.1,45.8L52.2,45.3L52.2,33.4L58.9,32.2L66.4,35.3L76.5,35.8L76.3,29.9L81.2,37.9L76.8,44.6L77.8,48.5L83.1,50.3L86.1,49L85.3,43L92.4,45.2L97.1,53L91.4,54.6L92,59.8L89.9,56.8L83,61.1L82.9,58.5L76.3,55.6ZM82.2,42.9L82.2,42.9L82.2,42.9ZM84.4,28.3L84.4,28.3L84.4,28.3ZM84.1,43.3L84.1,43.3L84.1,43.3ZM77.1,24.2L77.1,24.2L77.1,24.2ZM77,18.5L77,18.5L77,18.5ZM75.5,15.4L75.5,15.4L75.5,15.4ZM80,25.4L80,25.4L80,25.4ZM67.8,17L67.8,17L67.8,17ZM68,15.2L68,15.2L68,15.2ZM97.1,53.7L98.7,56.8L95.2,56.7ZM82.2,39.7L82.2,39.7L82.2,39.7ZM84.9,29.1L90.2,32.1L93.8,37.5L92.2,42.6L85.4,39.5L87.8,35.8L79.7,32.3L79.8,27ZM76.6,25.9L76.6,25.9L76.6,25.9ZM61.7,21.8L61.7,21.8L61.7,21.8ZM56.5,51.4L56.5,51.4L56.5,51.4ZM70.9,13.9L70.9,13.9L70.9,13.9ZM61.4,56L61.4,56L61.4,56ZM62.4,25.2L65.6,27.1L61.6,31.5ZM69.6,22.4L69.6,22.4L69.6,22.4ZM70.3,27.8L73.2,32.9L66.7,35.1L64.3,28.5ZM73.5,28.5L73.5,28.5L73.5,28.5ZM70.3,26.9L70.3,26.9L70.3,26.9ZM74.5,20.4L74.5,20.4L74.5,20.4ZM75.8,9.9L81.2,13.8L77.5,16.5ZM78.2,5.5L88,0L93.8,3.7L87.5,13.6L84,21.7L79.3,21L81.6,13.7ZM86.8,36.7L86.8,36.7L86.8,36.7ZM75.7,33.7L75.7,33.7L75.7,33.7ZM92.4,54.9L92.4,54.9L92.4,54.9ZM92.7,57.2L92.7,57.2L92.7,57.2ZM90.3,118L91.1,120L90.3,118ZM96,102L96.5,106.2L93.6,107.5L90.3,117.7L87.8,116.1L91.1,97.6L93.4,97.3L97.6,99.3ZM90.3,118L91.1,120L90.3,118ZM89.8,94.7L91.1,97.6L87.8,116.1L90.3,117.7L86.9,117.7L86.6,113.1L88.8,103.3L89.3,95.1ZM64.7,67.2L70.3,67.6L75.3,71.2L76.7,75.6L80.6,73.7L77.8,77.6L71.9,75.5L70.6,73ZM96,102L97.6,99.3L95.8,96.1L95.7,94L89.8,91.1L87.4,89.3L89.6,87.6L91.2,84.6L94.4,82.5L95.3,84.6L99.4,83.1L100.8,85.4L107.8,88.2L104.3,97.7L101.9,98.4L98.3,104.2ZM89.8,91.1L95.7,94L95.8,96.1L93.4,97.3L91.1,97.6L89.8,94.7ZM89.6,87.6L87.4,89.3L89.8,91.1L89.8,94.7L89.3,95.1L86.4,93.1L83.5,87.8L86.7,85.4ZM91.2,84.6L89.6,87.6L86.7,85.4L84.9,84.6L86.7,79.7L88.8,79L88.5,81.6L90.9,82.1ZM94.4,82.5L91.2,84.6L90.9,82.1L88.5,81.6L88.8,79L93.8,79.6ZM95.8,96.1L97.6,99.3L93.4,97.3Z"},
  eur_afr:  {"viewBox":"0 0 130 150","d":"M79.6,98.4L77.5,98.8L76.8,98L76.1,97.6L75.6,96.2L77.2,95ZM75.6,96.2L76.1,97.6L73.6,98.6L72.8,97.3L69.4,96.8L69.4,96.7L69.7,96.3L71.7,93.1L75.7,93ZM73.3,90.6L73.6,87.4L74,86.5L78.3,86.5L78.2,89.3L77.3,91.5ZM73.6,87.4L73.3,90.6L70.5,91.9L70.2,89.9L70.4,86.1ZM98.9,42L98.9,42L98.9,42ZM102.1,45.7L102.1,45.7L102.1,45.7ZM115.1,51L115.1,51L115.1,51ZM118.5,52.2L118.5,52.2L118.5,52.2ZM115.5,54.8L115.5,54.8L115.5,54.8ZM81.2,42.9L81.2,42.9L81.2,42.9ZM73.2,71.2L72.1,71.1L73.2,71.2ZM84.3,54.3L89.6,49.8L83.6,57.1ZM116.6,71.5L116.6,71.5L116.6,71.5ZM0,59.8L0,59.8L3.6,62.6L0,63.5L0,63.5L0,59.8ZM130,63.5L130,63.5L126.5,67.5L124.1,67.5L121.6,73.1L121.1,70.5L124.1,66.5L116.3,68L113.8,70.9L116,71.9L115.6,74.6L112.3,77.6L112.3,74.9L110.5,72.1L105,74.2L100.7,72.5L96.5,74.1L92.6,71.2L87.2,71.4L86.5,73.4L83.3,72.7L81.8,74.6L82.5,78L78.2,76.3L78.8,75.3L78.8,75.3L76.5,72.5L75.1,67L75.3,59.7L76.2,59.2L79.9,61.9L77.6,63.9L84.5,57L89.8,54L96.5,52.5L105.1,50.1L104.5,53.8L110.4,54.8L115.5,57.1L115.7,55.5L123.1,59.3L130,59.8L130,63.5ZM130,57.8L129.6,57.9L129.5,57.5L130,57L130,57.8ZM0,57L0,57L0,57L0,57.8L0,57.8L0,57ZM77.1,75.9L77.6,76L77.1,75.9ZM70.5,44.9L70.5,44.9L70.5,44.9ZM76.2,59.2L75.3,59.7L72.5,59.6L69.3,65L69,68.2L66.8,65.9L71.9,58.9ZM74.9,44.1L74.9,44.1L74.9,44.1ZM73.9,48.3L73.9,48.3L73.9,48.3ZM70.9,105.4L72.2,103.9L76.3,102.9L76.5,104.3L76.6,104.6L76.9,104.6L75.2,107.2L72.1,108ZM75.5,105.5L75.5,105.5L75.5,105.5ZM46.3,93.1L46.3,93.1L46.3,93.1ZM67.2,74L67.7,75L66.1,77.6L64.3,77.2L63.3,74.4ZM68.2,77.6L68.2,77.6L68.2,77.6ZM72.2,103.9L70.9,105.4L69.2,101L73.4,101L74.1,101.1ZM60.6,89.3L63,88.9L63.2,85.3L66.5,87.6L65.1,89.2L63,90.8ZM61.9,84.3L63.2,85.3L63,88.9L60.6,89.3L59.1,88.7ZM70.4,86.1L70.2,89.9L70.1,90.1L66.3,90.4L65.1,89.2L66.5,87.6L69.3,85.9ZM66.3,90.4L70.1,90.1L67.1,93.1ZM76.1,97.6L76.8,98L77,99.7L75.9,100.3L74.1,101.1L73.4,101L73.6,98.6ZM77.5,98.8L79.6,98.4L79.7,100L77.6,101.9L76.9,104.6L76.6,104.6L76.5,104.3L76.3,102.9L75.9,100.3L77,99.7ZM69.7,96.3L69.4,96.7L69.7,96.3ZM69.4,96.8L72.8,97.3L73.6,98.6L73.4,101L69.2,101ZM61.9,84.3L61.9,84.2L64.2,81L68,80.2L68.4,83.1L69.3,85.9L66.5,87.6L63.2,85.3ZM69,68.2L69.3,65L72.5,59.6L73.6,62.6L69.7,70.5ZM76.5,72.5L78.8,75.3L77.6,76L77.1,75.9L73.1,74.2L73.5,72.8ZM73.5,72.8L73.1,74.2L70.4,73.1L70.1,71.5L72.1,71.1L73.2,71.2ZM70.1,71.5L70.4,73.1L67.7,75L67.2,74L67.6,71.5ZM64.3,77.2L66.1,77.6L64.2,80.4L62.3,80.2L62.1,77ZM75.3,59.7L75.1,67L73.3,67.5L73.6,62.6L72.5,59.6ZM64.2,81L61.9,84.2L59.7,86.7L59.8,84.8L62.9,80.8ZM78.3,86.5L74,86.5L74.1,82.6L77.2,82.8ZM74,86.5L73.6,87.4L70.4,86.1L69.3,85.9L68.4,83.1L69.1,81.9L71.9,83.1L74.1,82.6ZM77.3,91.5L78.2,89.3L79.8,89.5L81.2,92.8L78.1,93Z"},
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
