import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Clickable agent email -> 30-day performance popup (quality + DSAT controllability).
// Reusable across Evaluations, Coaching, Dashboard, etc.
export function AgentPerfModal({ email, onClose }) {
  const [loading, setLoading] = useState(true)
  const [quality, setQuality] = useState([])
  const [dsat, setDsat] = useState([])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const since = new Date(Date.now() - 30 * 864e5).toISOString()
      const { data } = await supabase.from('evaluations')
        .select('id, score, failed_critical, submitted_at, metadata_values, scorecards!evaluations_scorecard_id_fkey(type, name, pass_threshold)')
        .eq('status', 'submitted')
        .gte('submitted_at', since)
        .filter('metadata_values', 'cs', JSON.stringify([{ label: "Agent's Email", value: email }]))
        .order('submitted_at', { ascending: false })
      if (!alive) return
      const rows = data || []
      setQuality(rows.filter(r => r.scorecards?.type === 'quality'))
      setDsat(rows.filter(r => r.scorecards?.type === 'dsat'))
      setLoading(false)
    })()
    return () => { alive = false }
  }, [email])

  const isCtrl = (ev) => (ev.metadata_values || []).some(m => m.value === 'Controllable')
  const catOf = (ev) => (ev.metadata_values || []).find(m => m.label === 'Category Level 1' || m.label === 'Category')?.value || 'Uncategorised'

  const qCount = quality.length
  const qAvg = qCount ? Math.round(quality.reduce((s, r) => s + (r.score || 0), 0) / qCount) : 0
  const qPass = quality.filter(r => (r.score || 0) >= (r.scorecards?.pass_threshold ?? 90)).length
  const qCrit = quality.filter(r => r.failed_critical).length

  const dCount = dsat.length
  const dCtrlList = dsat.filter(isCtrl)
  const dCtrl = dCtrlList.length
  const dRate = dCount ? Math.round((dCtrl / dCount) * 100) : 0
  const perCat = {}
  dCtrlList.forEach(ev => { const c = catOf(ev); perCat[c] = (perCat[c] || 0) + 1 })
  const perCatArr = Object.entries(perCat).sort((a, b) => b[1] - a[1])

  const chip = { flex: 1, minWidth: 92, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }
  const chipNum = { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }
  const chipLbl = { fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }
  const h = { fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '18px 0 8px' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Agent performance</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{email} · last 30 days</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
        ) : (qCount === 0 && dCount === 0) ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No evaluations for this agent in the last 30 days.</div>
        ) : (
          <>
            {qCount > 0 && (
              <div>
                <div style={h}>Quality</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={chip}><div style={chipNum}>{qCount}</div><div style={chipLbl}>Evaluations</div></div>
                  <div style={chip}><div style={{ ...chipNum, color: qAvg >= 90 ? 'var(--success)' : qAvg >= 75 ? '#b45309' : 'var(--danger)' }}>{qAvg}%</div><div style={chipLbl}>Avg score</div></div>
                  <div style={chip}><div style={chipNum}>{qPass}/{qCount}</div><div style={chipLbl}>Passed</div></div>
                  <div style={chip}><div style={{ ...chipNum, color: qCrit ? 'var(--danger)' : 'var(--text-primary)' }}>{qCrit}</div><div style={chipLbl}>Failed critical</div></div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.6 }}>
                  Averaged <b style={{ color: 'var(--text-primary)' }}>{qAvg}%</b> across {qCount} quality evaluation{qCount === 1 ? '' : 's'}{qCrit > 0 ? `, with ${qCrit} critical failure${qCrit === 1 ? '' : 's'}.` : ', with no critical failures.'}
                </div>
              </div>
            )}
            {dCount > 0 && (
              <div>
                <div style={h}>Controllability (DSAT)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <div style={chip}><div style={chipNum}>{dCount}</div><div style={chipLbl}>DSAT evaluations</div></div>
                  <div style={chip}><div style={chipNum}>{dCtrl}</div><div style={chipLbl}>Controllable</div></div>
                  <div style={chip}><div style={{ ...chipNum, color: dRate <= 20 ? 'var(--success)' : dRate <= 40 ? '#b45309' : 'var(--danger)' }}>{dRate}%</div><div style={chipLbl}>Controllable rate</div></div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '12px 0 6px' }}>Controllable cases by category</div>
                {perCatArr.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No controllable cases in the last 30 days.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {perCatArr.map(([cat, n]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <span>{cat}</span><span style={{ fontWeight: 700 }}>{n}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function AgentEmailChip({ email }) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  if (!email) return <span>—</span>
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="View 30-day performance"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
          font: 'inherit', color: 'var(--accent)', cursor: 'pointer',
          background: hover ? 'var(--accent-light)' : 'transparent',
          border: '1px solid transparent', borderRadius: 6, padding: '2px 7px',
          transition: 'background 0.12s',
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.8 }} aria-hidden="true">
          <line x1="6" y1="20" x2="6" y2="13" />
          <line x1="12" y1="20" x2="12" y2="8" />
          <line x1="18" y1="20" x2="18" y2="4" />
        </svg>
      </button>
      {open && <AgentPerfModal email={email} onClose={() => setOpen(false)} />}
    </>
  )
}