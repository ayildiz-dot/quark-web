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

// ─── Report a standalone critical case (KG evaluators + admins only) ──────────
// Type-first: the type chosen decides what is asked next, so a Highly Critical report
// never has to name a scorecard attribute. Scorecard, hub, market and agent options all
// come from the reporter's own queue assignments, so a case can only be filed where they
// actually work — the same governance constraint the evaluation form applies.
function ReportCriticalModal({ profile, flash, onClose, onSaved }) {
  const [type, setType]       = useState('critical')   // 'critical' | 'highly'
  const [queues, setQueues]   = useState([])
  const [scId, setScId]       = useState('')
  const [attrs, setAttrs]     = useState([])
  const [attrId, setAttrId]   = useState('')
  const [reasons, setReasons] = useState([])
  const [reasonId, setReason] = useState('')
  const [agentsByQueue, setAgentsByQueue] = useState({})
  const [agentQ, setAgentQ]   = useState('')
  const [agent, setAgent]     = useState('')
  const [queueId, setQueueId] = useState('')
  const [ticket, setTicket]   = useState('')
  const [occurred, setOccur]  = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes]     = useState('')
  const [busy, setBusy]       = useState(false)

  useEffect(() => {
    (async () => {
      const { data: uq } = await supabase.from('user_queues').select('queue_id').eq('user_id', profile.id)
      const qIds = (uq || []).map(r => r.queue_id)
      if (!qIds.length) return
      const { data: qs } = await supabase.from('queues')
        .select('id, name, market_value, hub_id, workspace_id, scorecard_id, hubs(name, workspace_id, workspaces(name, division_id))')
        .in('id', qIds).is('deleted_at', null)
      setQueues(qs || [])
      // The RPC returns rows of { queue_id, agent_name, agent_email } — keyed by queue so
      // the picker can narrow to the queue chosen below rather than offering every agent.
      const { data: ag } = await supabase.rpc('agents_for_my_queues')
      const byQ = {}
      ;(ag || []).forEach(r => {
        if (!r.agent_email) return
        ;(byQ[r.queue_id] = byQ[r.queue_id] || []).push(r.agent_email)
      })
      setAgentsByQueue(byQ)
    })()
    // eslint-disable-next-line
  }, [])

  // Scorecards available are those mapped to the reporter's queues.
  const scOptions = useMemo(() => {
    const m = {}
    queues.forEach(q => { if (q.scorecard_id) m[q.scorecard_id] = true })
    return Object.keys(m)
  }, [queues])
  const [scNames, setScNames] = useState({})
  useEffect(() => {
    if (!scOptions.length) return
    supabase.from('scorecards').select('id, name, type, division').in('id', scOptions)
      .then(({ data }) => setScNames(Object.fromEntries((data || []).map(s => [s.id, s]))))
  }, [scOptions])

  // Breached-attribute list follows the chosen scorecard; reasons follow its division.
  useEffect(() => {
    setAttrId(''); setAttrs([])
    if (!scId) return
    supabase.from('scorecard_questions').select('id, title')
      .eq('scorecard_id', scId).eq('is_form_critical', true)
      .or('is_archived.is.null,is_archived.eq.false').order('title')
      .then(({ data }) => setAttrs(data || []))
  }, [scId])

  useEffect(() => {
    (async () => {
      setReasons([]); setReason('')
      const divNames = [...new Set(Object.values(scNames).map(s => s.division).filter(Boolean))]
      if (!divNames.length) return
      const { data: divs } = await supabase.from('divisions').select('id, name').in('name', divNames)
      const divIds = (divs || []).map(d => d.id)
      if (!divIds.length) return
      const { data: tags } = await supabase.from('highly_critical_reason_divisions')
        .select('reason_id').in('division_id', divIds)
      const ids = [...new Set((tags || []).map(t => t.reason_id))]
      if (!ids.length) return
      const { data: rs } = await supabase.from('highly_critical_reasons')
        .select('id, name').in('id', ids).eq('is_active', true).order('position').order('name')
      setReasons(rs || [])
    })()
  }, [scNames])

  const q = queues.find(x => x.id === queueId)
  // Narrow to the selected queue once one is chosen; before that, search across every
  // agent on the reporter's queues so the field is usable in either order.
  const agentPool = useMemo(() => {
    const pool = queueId ? (agentsByQueue[queueId] || []) : Object.values(agentsByQueue).flat()
    return [...new Set(pool)].sort()
  }, [agentsByQueue, queueId])
  const agentMatches = agentQ.trim()
    ? agentPool.filter(a => a.toLowerCase().includes(agentQ.trim().toLowerCase())).slice(0, 6)
    : []

  const submit = async () => {
    if (type === 'critical' && (!scId || !attrId)) return flash('Select the scorecard and the breached critical attribute.', false)
    if (type === 'highly' && !reasonId) return flash('Select a Highly Critical reason.', false)
    if (!ticket.trim()) return flash('Ticket ID is required.', false)
    if (!agent) return flash('Select the agent.', false)
    if (!queueId) return flash('Select the BPO-Hub / Market this case belongs to.', false)
    if (!notes.trim()) return flash('Describe what happened.', false)

    setBusy(true)
    const divisionId = q?.hubs?.workspaces?.division_id || null
    const { error } = await supabase.from('critical_cases').insert({
      source: 'standalone',
      severity: type === 'highly' ? 'highly_critical' : 'critical',
      critical_attribute_ids: type === 'critical' && attrId ? [attrId] : [],
      highly_critical_reason_id: type === 'highly' ? reasonId : null,
      ticket_id: ticket.trim(),
      agent_email: agent,
      occurred_on: occurred || null,
      division_id: divisionId,
      workspace_id: q?.workspace_id || q?.hubs?.workspace_id || null,
      hub_id: q?.hub_id || null,
      queue_id: queueId,
      market: q?.market_value || null,
      reported_by: profile.id,
      // Highly Critical carries the 24-hour coaching clock; a plain critical does not.
      sla_due_at: type === 'highly' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
      notes: notes.trim(),
    })
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('Critical case reported — it is now in the coaching queue.')
    onSaved(); onClose()
  }

  const fld = { marginBottom: 10 }
  const lbl = { display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
  const inp = { width: '100%', fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header"><h2>Report a Critical Case</h2><button className="btn-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{ ...lbl, marginBottom: 6 }}>Criticality type *</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[['critical', 'Critical Case', 'A Form Critical attribute was breached'],
              ['highly', 'Highly Critical Case', 'From the managed reason list']].map(([k, t, d]) => (
              <button key={k} onClick={() => setType(k)}
                style={{
                  flex: 1, minWidth: 200, textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                  border: '1.5px solid', borderRadius: 8,
                  borderColor: type === k ? 'var(--accent)' : 'var(--border)',
                  background: type === k ? 'var(--accent-light)' : 'transparent',
                  color: 'var(--text-primary)', fontFamily: 'inherit',
                }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{t}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{d}</span>
              </button>
            ))}
          </div>

          {type === 'critical' ? (
            <>
              <div style={fld}>
                <label style={lbl}>Scorecard *</label>
                <select style={inp} value={scId} onChange={e => setScId(e.target.value)}>
                  <option value="">— Select scorecard —</option>
                  {scOptions.map(id => <option key={id} value={id}>{scNames[id]?.name || id}</option>)}
                </select>
              </div>
              <div style={fld}>
                <label style={lbl}>Breached critical attribute *</label>
                <select style={inp} value={attrId} onChange={e => setAttrId(e.target.value)} disabled={!scId}>
                  <option value="">{scId ? '— Select attribute —' : 'Choose a scorecard first'}</option>
                  {attrs.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                </select>
                {scId && attrs.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--warning, #d97706)', marginTop: 3 }}>
                    This scorecard has no Form Critical attributes.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={fld}>
              <label style={lbl}>Highly Critical reason *</label>
              <select style={inp} value={reasonId} onChange={e => setReason(e.target.value)}>
                <option value="">— Select reason —</option>
                {reasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                Must be coached within 24 hours. No scorecard or attribute needed.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...fld, flex: 1, minWidth: 160 }}>
              <label style={lbl}>Ticket ID *</label>
              <input style={inp} value={ticket} onChange={e => setTicket(e.target.value)} />
            </div>
            <div style={{ ...fld, flex: 1, minWidth: 160 }}>
              <label style={lbl}>Interaction date *</label>
              <input type="date" style={inp} value={occurred} max={new Date().toISOString().slice(0, 10)}
                onChange={e => setOccur(e.target.value)} />
            </div>
          </div>

          <div style={fld}>
            <label style={lbl}>Agent *</label>
            {agent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13 }}>{agent}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setAgent(''); setAgentQ('') }}>Change</button>
              </div>
            ) : (
              <>
                <input style={inp} placeholder="Type to search agents on your queues…" value={agentQ}
                  onChange={e => setAgentQ(e.target.value)} />
                {agentMatches.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 3, overflow: 'hidden' }}>
                    {agentMatches.map(a => (
                      <div key={a} onClick={() => { setAgent(a); setAgentQ('') }}
                        style={{ padding: '6px 10px', fontSize: 12.5, cursor: 'pointer' }}>{a}</div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={fld}>
            <label style={lbl}>BPO-Hub · Market *</label>
            <select style={inp} value={queueId} onChange={e => setQueueId(e.target.value)}>
              <option value="">— Select —</option>
              {queues.map(x => (
                <option key={x.id} value={x.id}>
                  {(x.hubs?.name || 'Hub')} · {x.market_value || '—'}{x.hubs?.workspaces?.name ? ` (${x.hubs.workspaces.name})` : ''}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
              Limited to your assigned queues, so the case is channelled correctly.
            </div>
          </div>

          <div style={fld}>
            <label style={lbl}>What happened *</label>
            <textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Describe the breach…" />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Submit critical case'}
          </button>
        </div>
      </div>
    </div>
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
  const [report, setReport]   = useState(false)
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

  const canMarkCriticality = ['admin', 'owner'].includes(profile?.role)
    || (profile?.role === 'evaluator' && String(profile?.email || '').toLowerCase().endsWith('@kaizengaming.com'))
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
        {/* Reporting is restricted to KG evaluators and admins — Team Leaders coach and
            dispute but never mark. The database enforces the same rule, so hiding the
            button is convenience, not the security boundary. */}
        {canMarkCriticality && (
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setReport(true)}>
            + Report Critical Case
          </button>
        )}
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
      {report && <ReportCriticalModal profile={profile} flash={flash} onClose={() => setReport(false)} onSaved={load} />}
    </div>
  )
}