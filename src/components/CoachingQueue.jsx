import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getEvaluatorScope } from '../lib/evaluatorScope'
import { AgentEmailChip } from './AgentPerfModal'

// Exported so Coaching Insights derives its case list from the same definition of
// "coachable" that this queue uses — two copies would drift and the SLA figures would
// stop matching the queue they describe.
export const getMeta = (ev, label) => {
  const m = (ev?.metadata_values || []).find(x => x.label?.toLowerCase() === label.toLowerCase())
  return m?.value || ''
}
// Effective controllability matches the dashboard: deviated_controllability if stamped,
// else derived from whether any metadata answer equals 'Controllable'.
export const isControllable = (ev) => {
  const eff = ev.deviated_controllability ?? ((ev.metadata_values || []).some(e => e?.value === 'Controllable') ? 'Controllable' : 'Non-Controllable')
  return eff === 'Controllable'
}

// A submitted evaluation is coachable when Quality scored under 100% or a DSAT is
// effectively controllable. Used by both the queue and Coaching Insights.
export const isCoachable = (ev) =>
  ev.evaluation_type === 'quality' ? (ev.score ?? 100) < 100 : isControllable(ev)

// 48-hour coaching SLA. Clock starts when the evaluation is submitted (the moment the
// case became coachable — the eval_coachings row doesn't exist until someone takes it
// over, so its created_at would measure nothing) and stops when the coach completes.
// Returns 'met', 'breached' (completed late, or still uncoached past the window),
// 'open' (uncoached but still inside the window) or 'unknown'.
export const COACHING_SLA_HOURS = 48
export const coachingSla = (submittedAt, completedAt) => {
  if (!submittedAt) return { hours: null, state: 'unknown' }
  const start = new Date(submittedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : null
  const hours = ((end ?? Date.now()) - start) / 3600000
  const state = end
    ? (hours <= COACHING_SLA_HOURS ? 'met' : 'breached')
    : (hours > COACHING_SLA_HOURS ? 'breached' : 'open')
  return { hours: Math.round(hours * 10) / 10, state }
}

const CSTATUS = {
  pending:      { label: 'Pending',      color: '#f59e0b', bg: '#f59e0b22' },
  in_progress:  { label: 'In progress',  color: '#6366f1', bg: '#6366f122' },
  completed:    { label: 'Pending Acknowledgement', color: '#0ea5e9', bg: '#0ea5e922' },
  acknowledged: { label: 'Acknowledged', color: '#22c55e', bg: '#22c55e22' },
}
const Badge = ({ s }) => {
  const c = CSTATUS[s] || CSTATUS.pending
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
}

// Criticality chip. Highly Critical outranks Critical, and the two are never summed —
// a highly critical case is still one critical mistake, just a worse one. The reason is
// shown on hover so the coach can see what they are coaching against from the list.
const CRIT = {
  highly_critical: { label: 'Highly Critical', color: '#b91c1c', bg: '#fee2e2' },
  critical:        { label: 'Critical',        color: '#b45309', bg: '#fef3c7' },
}
const CritChip = ({ severity, reason }) => {
  const c = CRIT[severity]
  if (!c) return <span style={{ color: 'var(--text-tertiary)' }}>—</span>
  return (
    <span title={reason ? `Reason: ${reason}` : undefined}
      style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function QueueDetail({ item, profile, isPrivileged, flash, onClose, onChanged }) {
  const sa = item.kind === 'standalone'
  const ev = item.ev
  const cc = item.cc
  const coaching = item.coaching
  const isDsat = !sa && ev.evaluation_type === 'dsat'
  const [scores, setScores] = useState([])
  const [notes, setNotes]   = useState(coaching?.notes || '')
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    // Standalone cases have no evaluation and therefore no per-question scores.
    if (!sa && !isDsat) {
      supabase.from('evaluation_scores')
        .select('*, scorecard_questions(title, is_form_critical)')
        .eq('evaluation_id', ev.id)
        .then(({ data }) => setScores(data || []))
    }
    // eslint-disable-next-line
  }, [])

  // Anchored on critical_case_id for standalone cases and evaluation_id otherwise —
  // the eval_coachings_one_anchor constraint requires exactly one of the two.
  const takeOver = async () => {
    setBusy(true)
    const row = sa
      ? {
          critical_case_id: cc.id, eval_type: 'standalone',
          agent_email: cc.agent_email || null,
          coach_id: profile.id, status: 'in_progress',
          market: cc.market || null,
          hub_id: cc.hub_id || null, workspace_id: cc.workspace_id || null, queue_id: cc.queue_id || null,
        }
      : {
          evaluation_id: ev.id, eval_type: ev.evaluation_type,
          agent_email: getMeta(ev, "Agent's Email") || null,
          coach_id: profile.id, status: 'in_progress',
          market: getMeta(ev, 'Market') || null,
          hub_id: ev.hub_id || null, workspace_id: ev.workspace_id || null, queue_id: ev.queue_id || null,
        }
    const { error } = await supabase.from('eval_coachings').insert(row)
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('Assigned to you'); onChanged(); onClose()
  }

  const complete = async () => {
    if (!notes.trim()) return flash('Add a note describing the coaching before completing.', false)
    setBusy(true)
    const { error } = await supabase.from('eval_coachings')
      .update({ notes: notes.trim(), status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', coaching.id)
    if (error) { setBusy(false); return flash(error.message, false) }
    await supabase.rpc('create_coaching_ack_notification', { p_eval_coaching_id: coaching.id })
    setBusy(false)
    flash('Coaching completed — agent notified to acknowledge'); onChanged(); onClose()
  }

  const mineOrPriv = coaching && (coaching.coach_id === profile.id || isPrivileged)
  const label = { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '16px 0 8px' }
  const box = { fontSize: 13, lineHeight: 1.6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap' }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{sa ? `Coaching · Standalone case ${String(cc.id).slice(0, 6).toUpperCase()}` : `Coaching · Evaluation #${ev.eval_id || ev.id}`}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <span><b>Type:</b> {sa ? 'Standalone report' : (isDsat ? 'DSAT' : 'Quality')}</span>
            {!sa && !isDsat && <span><b>Score:</b> {ev.score}%</span>}
            {!sa && isDsat && <span><b>Controllability:</b> {ev.deviated_controllability ?? 'Controllable'}</span>}
            {!sa && <span><b>Scorecard:</b> {ev.scorecards?.name || '—'}</span>}
            {sa && cc.ticket_id && <span><b>Ticket:</b> {cc.ticket_id}</span>}
            <span><b>Agent:</b> {(() => {
              const ae = sa ? cc.agent_email : getMeta(ev, "Agent's Email")
              return ae && ae !== '—' ? <AgentEmailChip email={ae} /> : '—'
            })()}</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {sa
                ? (cc.occurred_on ? new Date(cc.occurred_on).toLocaleDateString() : new Date(cc.reported_at).toLocaleDateString())
                : new Date(ev.submitted_at).toLocaleDateString()}
            </span>
            {sa && cc.reporter?.name && <span style={{ color: 'var(--text-secondary)' }}><b>Reported by:</b> {cc.reporter.name}</span>}
          </div>

          {/* Criticality banner. A coach told only "Highly Critical" has nothing concrete
              to work with, so the reason and the breached attributes are spelled out here,
              along with the 24-hour deadline where one applies. */}
          {item.crit && (
            <div style={{
              marginTop: 14, borderRadius: 8, padding: '11px 14px',
              border: `1px solid ${item.crit.severity === 'highly_critical' ? 'var(--danger)' : 'var(--warning, #d97706)'}`,
              background: item.crit.severity === 'highly_critical' ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <CritChip severity={item.crit.severity} reason={item.crit.reason?.name} />
                {item.crit.severity === 'highly_critical' && item.crit.sla_due_at && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    Must be coached by <b style={{ color: 'var(--text-primary)' }}>{new Date(item.crit.sla_due_at).toLocaleString()}</b>
                  </span>
                )}
              </div>
              {item.crit.reason?.name && (
                <div style={{ fontSize: 12.5 }}><b style={{ color: 'var(--text-secondary)' }}>Reason:</b> {item.crit.reason.name}</div>
              )}
              {(item.crit.critical_attribute_ids || []).length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {item.crit.critical_attribute_ids.length} critical attribute{item.crit.critical_attribute_ids.length === 1 ? '' : 's'} breached
                  {!sa && !isDsat && ' — see the failed questions below'}
                </div>
              )}
            </div>
          )}

          {sa ? (
            <>
              {/* No evaluation behind a standalone case, so the reporter's own account of
                  what happened IS the material the coach works from. */}
              <div style={label}>What was reported</div>
              <div style={box}>{cc.notes || '—'}</div>
              <div style={label}>Case details</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
                <span><b style={{ color: 'var(--text-secondary)' }}>Ticket:</b> {cc.ticket_id || '—'}</span>
                <span><b style={{ color: 'var(--text-secondary)' }}>Interaction date:</b> {cc.occurred_on ? new Date(cc.occurred_on).toLocaleDateString() : '—'}</span>
                <span><b style={{ color: 'var(--text-secondary)' }}>Market:</b> {cc.market || '—'}</span>
                <span><b style={{ color: 'var(--text-secondary)' }}>Reported:</b> {new Date(cc.reported_at).toLocaleString()}</span>
              </div>
            </>
          ) : (
          <>
          <div style={label}>Interaction details</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {(ev.metadata_values || []).map((m, i) => <span key={i} style={{ fontSize: 12 }}><b style={{ color: 'var(--text-secondary)' }}>{m.label}:</b> {m.value || '—'}</span>)}
          </div>

          {isDsat ? (
            <>
              <div style={label}>Answers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(ev.metadata_values || []).map((m, i) => <div key={i} style={box}><b>{m.label}:</b> {m.value || '—'}</div>)}
              </div>
            </>
          ) : (
            <>
              <div style={label}>Question scores</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scores.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px' }}>
                    <span>{s.scorecard_questions?.title || '—'}{s.scorecard_questions?.is_form_critical && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--danger)' }}>critical</span>}</span>
                    <span style={{ fontWeight: 700, color: s.score === 'pass' ? 'var(--success)' : s.score === 'fail' ? 'var(--danger)' : 'var(--text-secondary)' }}>{(s.score || 'na').toUpperCase()}</span>
                  </div>
                ))}
                {scores.filter(s => s.comment).map((s, i) => <div key={'c' + i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>“{s.comment}”</div>)}
              </div>
              {ev.overall_comment && (<><div style={label}>Overall comment</div><div style={box}>{ev.overall_comment}</div></>)}
            </>
          )}
          </>
          )}

          <div style={label}>Coaching</div>
          {!coaching ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>This case is waiting to be coached.</p>
              <button className="btn btn-primary" disabled={busy} onClick={takeOver}>Assign to me</button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <Badge s={coaching.status} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Coach: {coaching.coach?.name || '—'}</span>
              </div>
              {(coaching.status === 'in_progress' && mineOrPriv) ? (
                <>
                  <textarea className="input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', resize: 'vertical', marginBottom: 10 }} placeholder="What did you coach the agent on? (shared with the agent to acknowledge)" />
                  <button className="btn btn-primary" disabled={busy} onClick={complete}>Complete & notify agent</button>
                </>
              ) : (
                <>
                  {coaching.notes && <div style={box}>{coaching.notes}</div>}
                  {coaching.status === 'completed' && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>Awaiting agent acknowledgement.</div>}
                  {coaching.status === 'acknowledged' && <div style={{ fontSize: 12, color: 'var(--success)', marginTop: 8 }}>✓ Acknowledged by agent{coaching.acknowledged_at ? ' on ' + new Date(coaching.acknowledged_at).toLocaleDateString() : ''}</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CoachingQueue({ profile, isPrivileged, flash, gov }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems]     = useState([])
  const [detail, setDetail]   = useState(null)
  const [tabFilter, setTab]   = useState('all')
  const [fType, setFType]   = useState('')
  const [fScore, setFScore] = useState('')
  const [fAgent, setFAgent] = useState('')
  const [fDiv, setFDiv]     = useState('')
  const [fBpo, setFBpo]     = useState('')
  const [fHub, setFHub]     = useState('')
  const [fMarket, setFMkt]  = useState('')
  const [fCoach, setFCoach] = useState('')
  const [fCrit, setFCrit]   = useState('')
  const [fFrom, setFrom]    = useState('')
  const [fTo, setTo]        = useState('')

  const load = async () => {
    setLoading(true)
    let hubIds = null
    if (!isPrivileged) {
      const scope = await getEvaluatorScope(profile.id)
      hubIds = scope.hubIds || []
      if (!hubIds.length) { setItems([]); setLoading(false); return }
    }
    let q = supabase.from('evaluations')
      .select('id, eval_id, score, evaluation_type, metadata_values, submitted_at, hub_id, workspace_id, queue_id, deviated_controllability, overall_comment, scorecards!evaluations_scorecard_id_fkey(name, type)')
      .eq('status', 'submitted')
      .or('and(evaluation_type.eq.quality,score.lt.100),evaluation_type.eq.dsat')
      .order('submitted_at', { ascending: false })
      .limit(500)
    if (hubIds) q = q.in('hub_id', hubIds)
    const { data: evs } = await q
    const candidates = (evs || []).filter(isCoachable)
    const ids = candidates.map(e => e.id)
    const coachMap = {}
    const critMap = {}
    if (ids.length) {
      // Criticality comes from the register, which the sync trigger keeps in step with the
      // evaluations — so if a critical is corrected away, or a dispute is upheld, the chip
      // disappears here with no extra work. The reason name is joined in because a coach
      // who only sees "Highly Critical" has nothing concrete to coach against.
      const [{ data: cs }, { data: ccs }] = await Promise.all([
        supabase.from('eval_coachings')
          .select('*, coach:users!eval_coachings_coach_id_fkey(name)')
          .in('evaluation_id', ids),
        supabase.from('critical_cases')
          .select('evaluation_id, severity, critical_attribute_ids, sla_due_at, reason:highly_critical_reasons(name)')
          .in('evaluation_id', ids)
          .is('deleted_at', null),
      ])
      ;(cs || []).forEach(c => { coachMap[c.evaluation_id] = c })
      ;(ccs || []).forEach(c => { critMap[c.evaluation_id] = c })
    }

    // Standalone critical cases have no evaluation behind them, so they are a second
    // source of coachable work. They are anchored on eval_coachings.critical_case_id
    // rather than evaluation_id (Phase 3b schema).
    let sq = supabase.from('critical_cases')
      .select('*, reason:highly_critical_reasons(name), reporter:users(name)')
      .eq('source', 'standalone')
      .is('deleted_at', null)
      .order('reported_at', { ascending: false })
      .limit(500)
    if (hubIds) sq = sq.in('hub_id', hubIds)
    const { data: sas } = await sq
    const standalone = sas || []
    const saCoach = {}
    if (standalone.length) {
      const { data: scs } = await supabase.from('eval_coachings')
        .select('*, coach:users!eval_coachings_coach_id_fkey(name)')
        .in('critical_case_id', standalone.map(c => c.id))
      ;(scs || []).forEach(c => { saCoach[c.critical_case_id] = c })
    }

    setItems([
      ...candidates.map(ev => ({ kind: 'eval', ev, cc: null, coaching: coachMap[ev.id] || null, crit: critMap[ev.id] || null })),
      ...standalone.map(cc => ({ kind: 'standalone', ev: null, cc, coaching: saCoach[cc.id] || null, crit: cc })),
    ])
    setLoading(false)
  }
  useEffect(() => { if (profile?.id) load() /* eslint-disable-next-line */ }, [profile?.id])

  // One shape for both sources, so filtering, sorting and the table body don't need to
  // know which kind a row is.
  const deco = useMemo(() => items.map(it => {
    const sa = it.kind === 'standalone'
    const ev = it.ev
    const cc = it.cc
    const queueId = sa ? cc.queue_id : ev.queue_id
    const ctx = (gov && gov.queueCtx && gov.queueCtx[queueId]) || {}
    return { ...it,
      _type: sa ? 'Standalone' : (ev.evaluation_type === 'dsat' ? 'DSAT' : 'Quality'),
      _agent: sa ? (cc.agent_email || '') : (getMeta(ev, "Agent's Email") || ''),
      _scorecard: sa ? '' : (ev.scorecards?.name || ''),
      _div: ctx.division_name || '',
      _bpo: ctx.workspace_name || '',
      _hub: ctx.hub_name || '',
      _market: sa ? (cc.market || ctx.market || '') : (ctx.market || getMeta(ev, 'Market') || ''),
      _coach: it.coaching?.coach?.name || '',
      // Standalone cases are dated by when they were reported — that is when the clock
      // starts for them, just as submission is for an evaluation.
      _date: sa
        ? (cc.reported_at ? String(cc.reported_at).slice(0, 10) : '')
        : (ev.submitted_at ? String(ev.submitted_at).slice(0, 10) : ''),
      // '' when not a critical case at all — so the filter can offer "Not critical" too.
      _crit: it.crit?.severity || '',
      _critReason: it.crit?.reason?.name || '',
      _ref: sa ? ('CR-' + String(cc.id).slice(0, 6).toUpperCase()) : ('#' + (ev.eval_id || ev.id)),
    }
  }), [items, gov])

  const opts = (key) => [...new Set(deco.map(r => r[key]).filter(Boolean))].sort()

  const filtered = useMemo(() => deco.filter(it => {
    const c = it.coaching
    if (tabFilter === 'open' && c) return false
    if (tabFilter === 'mine' && !(c && c.coach_id === profile.id)) return false
    if (tabFilter === 'done' && !(c && (c.status === 'completed' || c.status === 'acknowledged'))) return false
    return (!fType || it._type === fType) && (!fScore || it._scorecard === fScore) &&
      (!fAgent || it._agent === fAgent) && (!fDiv || it._div === fDiv) && (!fBpo || it._bpo === fBpo) &&
      (!fHub || it._hub === fHub) && (!fMarket || it._market === fMarket) && (!fCoach || it._coach === fCoach) &&
      (!fCrit || (fCrit === 'none' ? !it._crit : it._crit === fCrit)) &&
      (!fFrom || (it._date && it._date >= fFrom)) && (!fTo || (it._date && it._date <= fTo))
  }), [deco, tabFilter, profile?.id, fType, fScore, fAgent, fDiv, fBpo, fHub, fMarket, fCoach, fCrit, fFrom, fTo])

  const showCoach = tabFilter === 'all' || tabFilter === 'done'
  const statusOf = (it) => it.coaching ? it.coaching.status : 'pending'
  const clearAll = () => { setFType(''); setFScore(''); setFAgent(''); setFDiv(''); setFBpo(''); setFHub(''); setFMkt(''); setFCoach(''); setFCrit(''); setFrom(''); setTo('') }
  const anyFilter = fType || fScore || fAgent || fDiv || fBpo || fHub || fMarket || fCoach || fCrit || fFrom || fTo
  const sel = { padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 12 }
  const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tdStyle = { padding: '10px 16px' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['all', 'All'], ['open', 'Unassigned'], ['mine', 'Assigned to me'], ['done', 'Completed']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${tabFilter === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Filter:</span>
        <select style={sel} value={fType} onChange={e => setFType(e.target.value)}><option value="">All Types</option><option>Quality</option><option>DSAT</option></select>
        <select style={sel} value={fCrit} onChange={e => setFCrit(e.target.value)}>
          <option value="">All Criticality</option>
          <option value="highly_critical">Highly Critical</option>
          <option value="critical">Critical</option>
          <option value="none">Not critical</option>
        </select>
        <select style={sel} value={fScore} onChange={e => setFScore(e.target.value)}><option value="">All Scorecards</option>{opts('_scorecard').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fAgent} onChange={e => setFAgent(e.target.value)}><option value="">All Agents</option>{opts('_agent').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fDiv} onChange={e => setFDiv(e.target.value)}><option value="">All Divisions</option>{opts('_div').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fBpo} onChange={e => setFBpo(e.target.value)}><option value="">All BPOs</option>{opts('_bpo').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fHub} onChange={e => setFHub(e.target.value)}><option value="">All Hubs</option>{opts('_hub').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fMarket} onChange={e => setFMkt(e.target.value)}><option value="">All Markets</option>{opts('_market').map(o => <option key={o}>{o}</option>)}</select>
        <select style={sel} value={fCoach} onChange={e => setFCoach(e.target.value)}><option value="">All Coaches</option>{opts('_coach').map(o => <option key={o}>{o}</option>)}</select>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>from</span>
        <input type="date" style={sel} value={fFrom} onChange={e => setFrom(e.target.value)} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>to</span>
        <input type="date" style={sel} value={fTo} onChange={e => setTo(e.target.value)} />
        {anyFilter && <button className="btn btn-ghost btn-sm" onClick={clearAll}>Clear filters</button>}
      </div>
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>#</th><th style={thStyle}>Type</th><th style={thStyle}>Agent</th><th style={thStyle}>Scorecard</th>
              <th style={thStyle}>Score / Ctrl.</th><th style={thStyle}>Criticality</th><th style={thStyle}>Date</th>
              {showCoach && <th style={thStyle}>Coach</th>}
              <th style={thStyle}>Coaching</th><th style={{ ...thStyle, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={showCoach ? 10 : 9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here.</td></tr>}
              {filtered.map(it => {
                const sa = it.kind === 'standalone'
                const ev = it.ev
                const isDsat = !sa && ev.evaluation_type === 'dsat'
                return (
                  <tr key={sa ? 'cc-' + it.cc.id : 'ev-' + ev.id}
                    style={{ borderBottom: '1px solid var(--border)', background: sa ? 'var(--accent-light)' : undefined }}>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{it._ref}</td>
                    <td style={tdStyle}>
                      {sa ? <span title="Reported without an evaluation">Standalone</span> : (isDsat ? 'DSAT' : 'Quality')}
                    </td>
                    <td style={tdStyle}>{it._agent ? <AgentEmailChip email={it._agent} /> : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{sa ? '—' : (ev.scorecards?.name || '—')}</td>
                    <td style={tdStyle}>{sa ? '—' : (isDsat ? (ev.deviated_controllability ?? 'Controllable') : `${ev.score}%`)}</td>
                    <td style={tdStyle}><CritChip severity={it._crit} reason={it._critReason} /></td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {it._date ? new Date(it._date).toLocaleDateString() : '—'}
                    </td>
                    {showCoach && <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{it._coach || '—'}</td>}
                    <td style={tdStyle}><Badge s={statusOf(it)} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => setDetail(it)}>{!it.coaching ? 'Assign to me' : 'View'}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {detail && <QueueDetail item={detail} profile={profile} isPrivileged={isPrivileged} flash={flash} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  )
}