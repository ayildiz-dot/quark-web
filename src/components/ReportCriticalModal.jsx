import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Report a standalone critical case ────────────────────────────────────────
// For criticals spotted outside an evaluation. Restricted to KG evaluators and
// admins/owners — Team Leaders coach and dispute but never mark. The database enforces
// the same rule, so gating the button is convenience, not the security boundary.
//
// Type-first: the chosen type decides what is asked next, so a Highly Critical report
// never has to name a scorecard attribute.
//
// Scoping: an evaluator sees only their own queues (and the agents/scorecards on them),
// while admins and owners see everything — they generally have no queue assignments at
// all, so scoping them to user_queues would leave every dropdown empty.
export default function ReportCriticalModal({ profile, flash, onClose, onSaved }) {
  const isPriv = ['admin', 'owner'].includes(profile?.role)

  const [type, setType]         = useState('critical')   // 'critical' | 'highly'
  const [queues, setQueues]     = useState([])
  const [scorecards, setScards] = useState([])
  const [allReasons, setAllR]   = useState([])
  const [reasonTags, setTags]   = useState([])           // [{reason_id, division_id}]
  const [agentRows, setAgents]  = useState([])           // [{queue_id, email}]
  const [attrs, setAttrs]       = useState([])
  const [loading, setLoading]   = useState(true)

  const [scId, setScId]         = useState('')
  const [attrId, setAttrId]     = useState('')
  const [reasonId, setReason]   = useState('')
  const [queueId, setQueueId]   = useState('')
  const [agentQ, setAgentQ]     = useState('')
  const [agent, setAgent]       = useState('')
  const [ticket, setTicket]     = useState('')
  const [occurred, setOccur]    = useState(() => {
    // Local date parts, not toISOString() — that converts to UTC first and can hand back
    // yesterday for anyone west of UTC in the evening.
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [notes, setNotes]       = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    (async () => {
      let qIds = null
      if (!isPriv) {
        const { data: uq } = await supabase.from('user_queues').select('queue_id').eq('user_id', profile.id)
        qIds = (uq || []).map(r => r.queue_id)
      }

      let qq = supabase.from('queues')
        .select('id, market_value, hub_id, workspace_id, scorecard_id, hubs(name, workspace_id, workspaces(name, division_id))')
        .is('deleted_at', null)
      if (qIds) {
        if (!qIds.length) { setLoading(false); return }
        qq = qq.in('id', qIds)
      }

      // Reasons are loaded whole, then narrowed by the selected queue's division at render
      // time. They must NOT depend on the scorecard: on the Highly Critical path there is
      // no scorecard, so deriving them from one leaves the list permanently empty.
      const [{ data: qs }, { data: rs }, { data: tg }] = await Promise.all([
        qq,
        supabase.from('highly_critical_reasons').select('id, name').eq('is_active', true).order('position').order('name'),
        supabase.from('highly_critical_reason_divisions').select('reason_id, division_id'),
      ])
      setQueues(qs || []); setAllR(rs || []); setTags(tg || [])

      // Criticals are breaches of Form Critical attributes, which live on Quality
      // scorecards. Privileged users get all published ones; evaluators get those mapped
      // to their queues.
      let sq = supabase.from('scorecards')
        .select('id, name, division')
        .eq('type', 'quality').eq('is_published', true).eq('is_calibration', false)
        .is('deleted_at', null).order('name')
      if (!isPriv) {
        const mapped = [...new Set((qs || []).map(x => x.scorecard_id).filter(Boolean))]
        if (!mapped.length) { setScards([]) } else sq = sq.in('id', mapped)
        if (mapped.length) { const { data } = await sq; setScards(data || []) }
      } else {
        const { data } = await sq; setScards(data || [])
      }

      // Agents: the RPC is queue-scoped, which returns nothing for an admin with no
      // queues — so privileged users fall back to the full agent directory.
      if (isPriv) {
        const { data: ags } = await supabase.from('users').select('email, role').eq('role', 'viewer').order('email')
        setAgents((ags || []).filter(a => a.email).map(a => ({ queue_id: null, email: a.email })))
      } else {
        const { data: ags } = await supabase.rpc('agents_for_my_queues')
        setAgents((ags || []).filter(a => a.agent_email).map(a => ({ queue_id: a.queue_id, email: a.agent_email })))
      }
      setLoading(false)
    })()
    // eslint-disable-next-line
  }, [])

  // Attribute list follows the chosen scorecard.
  useEffect(() => {
    setAttrId(''); setAttrs([])
    if (!scId) return
    supabase.from('scorecard_questions').select('id, title')
      .eq('scorecard_id', scId).eq('is_form_critical', true)
      .or('is_archived.is.null,is_archived.eq.false').order('title')
      .then(({ data }) => setAttrs(data || []))
  }, [scId])

  const q = queues.find(x => x.id === queueId)
  const divisionId = q?.hubs?.workspaces?.division_id || null

  // Narrowed to the selected hub's division once one is chosen; everything the user can
  // reach before that, so the field is never mysteriously empty.
  const reasonOptions = useMemo(() => {
    if (!divisionId) return allReasons
    const ok = new Set(reasonTags.filter(t => t.division_id === divisionId).map(t => t.reason_id))
    return allReasons.filter(r => ok.has(r.id))
  }, [allReasons, reasonTags, divisionId])

  // Drop a reason that stops being valid after the hub changes.
  useEffect(() => {
    if (reasonId && !reasonOptions.some(r => r.id === reasonId)) setReason('')
    // eslint-disable-next-line
  }, [reasonOptions])

  const agentPool = useMemo(() => {
    const pool = queueId
      ? agentRows.filter(a => a.queue_id === null || a.queue_id === queueId).map(a => a.email)
      : agentRows.map(a => a.email)
    return [...new Set(pool)].sort()
  }, [agentRows, queueId])
  const agentMatches = agentQ.trim()
    ? agentPool.filter(a => a.toLowerCase().includes(agentQ.trim().toLowerCase())).slice(0, 6)
    : []

  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const submit = async () => {
    if (type === 'critical' && (!scId || !attrId)) return flash('Select the scorecard and the breached critical attribute.', false)
    if (type === 'highly' && !reasonId) return flash('Select a Highly Critical reason.', false)
    if (!ticket.trim()) return flash('Ticket ID is required.', false)
    if (!agent) return flash('Select the agent.', false)
    if (!queueId) return flash('Select the BPO-Hub · Market this case belongs to.', false)
    if (occurred && occurred > todayStr) return flash('The interaction date cannot be in the future.', false)
    if (!notes.trim()) return flash('Describe what happened.', false)

    setBusy(true)
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
      // Only Highly Critical carries the 24-hour coaching clock.
      sla_due_at: type === 'highly' ? new Date(Date.now() + 24 * 3600 * 1000).toISOString() : null,
      notes: notes.trim(),
    })
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('Critical case reported — it is now in the Coaching Queue.')
    onSaved?.(); onClose()
  }

  const fld = { marginBottom: 12 }
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }
  const hint = { fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }
  const warn = { fontSize: 11, color: 'var(--warning, #d97706)', marginTop: 4 }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Report a Critical Case</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
          ) : queues.length === 0 ? (
            <div style={{ padding: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
              You have no queue assignments, so there is nowhere to file a case. Ask an admin to assign you
              to a queue in Control Room → Governance.
            </div>
          ) : (
            <>
              <div style={{ ...lbl, marginBottom: 7 }}>Criticality type <span style={{ color: 'var(--danger)' }}>*</span></div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                {[['critical', 'Critical Case', 'A Form Critical attribute was breached'],
                  ['highly', 'Highly Critical Case', 'From the managed reason list']].map(([k, t, d]) => (
                  <button key={k} onClick={() => setType(k)}
                    style={{
                      flex: 1, minWidth: 210, textAlign: 'left', padding: '11px 13px', cursor: 'pointer',
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

              {/* Hub first for the Highly Critical path, because the reason list is
                  division-scoped and the division comes from the hub. */}
              <div style={fld}>
                <label style={lbl}>BPO-Hub · Market <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select className="select" style={{ width: '100%' }} value={queueId} onChange={e => setQueueId(e.target.value)}>
                  <option value="">— Select —</option>
                  {queues.map(x => (
                    <option key={x.id} value={x.id}>
                      {(x.hubs?.name || 'Hub')} · {x.market_value || '—'}{x.hubs?.workspaces?.name ? ` (${x.hubs.workspaces.name})` : ''}
                    </option>
                  ))}
                </select>
                <div style={hint}>Determines where the case is filed, and which Highly Critical reasons apply.</div>
              </div>

              {type === 'critical' ? (
                <>
                  <div style={fld}>
                    <label style={lbl}>Scorecard <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select className="select" style={{ width: '100%' }} value={scId} onChange={e => setScId(e.target.value)}>
                      <option value="">— Select scorecard —</option>
                      {scorecards.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {scorecards.length === 0 && <div style={warn}>No published Quality scorecards are available to you.</div>}
                  </div>
                  <div style={fld}>
                    <label style={lbl}>Breached critical attribute <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select className="select" style={{ width: '100%' }} value={attrId} onChange={e => setAttrId(e.target.value)} disabled={!scId}>
                      <option value="">{scId ? '— Select attribute —' : 'Choose a scorecard first'}</option>
                      {attrs.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
                    </select>
                    {scId && attrs.length === 0 && <div style={warn}>This scorecard has no Form Critical attributes.</div>}
                  </div>
                </>
              ) : (
                <div style={fld}>
                  <label style={lbl}>Highly Critical reason <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="select" style={{ width: '100%' }} value={reasonId} onChange={e => setReason(e.target.value)}>
                    <option value="">— Select reason —</option>
                    {reasonOptions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  {reasonOptions.length === 0 ? (
                    <div style={warn}>
                      No Highly Critical reasons are enabled{divisionId ? " for this hub's division" : ''}.
                      An admin can add and tag them in Control Room → Reference Data.
                    </div>
                  ) : (
                    <div style={hint}>Must be coached within 24 hours. No scorecard or attribute needed.</div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ ...fld, flex: 1, minWidth: 150 }}>
                  <label style={lbl}>Ticket ID <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input className="input" style={{ width: '100%' }} value={ticket} onChange={e => setTicket(e.target.value)} />
                </div>
                <div style={{ ...fld, flex: 1, minWidth: 150 }}>
                  <label style={lbl}>Interaction date <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input type="date" className="input" style={{ width: '100%' }} value={occurred} max={todayStr}
                    onChange={e => setOccur(e.target.value)} />
                </div>
              </div>

              <div style={fld}>
                <label style={lbl}>Agent <span style={{ color: 'var(--danger)' }}>*</span></label>
                {agent ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13 }}>{agent}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setAgent(''); setAgentQ('') }}>Change</button>
                  </div>
                ) : (
                  <>
                    <input className="input" style={{ width: '100%' }} placeholder="Type to search agents…"
                      value={agentQ} onChange={e => setAgentQ(e.target.value)} />
                    {agentMatches.length > 0 && (
                      <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                        {agentMatches.map(a => (
                          <div key={a} onClick={() => { setAgent(a); setAgentQ('') }}
                            style={{ padding: '7px 11px', fontSize: 12.5, cursor: 'pointer' }}>{a}</div>
                        ))}
                      </div>
                    )}
                    {agentQ.trim() && agentMatches.length === 0 && <div style={hint}>No matching agents.</div>}
                  </>
                )}
              </div>

              <div style={fld}>
                <label style={lbl}>What happened <span style={{ color: 'var(--danger)' }}>*</span></label>
                <textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical' }}
                  value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the breach…" />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={busy} onClick={submit}>
                  {busy ? 'Submitting…' : 'Submit critical case'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}