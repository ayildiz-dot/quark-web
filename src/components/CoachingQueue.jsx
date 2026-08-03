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

// Rows per page in the queue table.
const PAGE_SIZE = 20

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

// Reuses the wording of the existing dispute tracks so the vocabulary stays consistent.
const DISPUTE_LABEL = {
  evaluator_pending:  'Awaiting the evaluator who marked it',
  evaluator_rejected: 'Rejected by the evaluator',
  admin_pending:      'Awaiting admin decision',
  upheld:             'Upheld — marking removed',
  rejected_final:     'Rejected (final) — marking stands',
  cancelled:          'Withdrawn',
  accepted:           'Closed',
}

// 24-hour SLA state for a Highly Critical case. Plain criticals carry no deadline, so
// they return null and render as "n/a". The clock stops on AGENT ACKNOWLEDGEMENT, not on
// the coach completing — "delivered" is what the RTA escalation acts on.
const criticalSla = (cc, coaching) => {
  if (!cc || cc.severity !== 'highly_critical' || !cc.sla_due_at) return null
  if (coaching?.status === 'acknowledged') return { label: 'Met', bg: '#d1fae5', color: '#047857' }
  if (cc.sla_paused_at) return { label: 'Paused — disputed', bg: '#e2e8f0', color: '#475569' }
  const ms = new Date(cc.sla_due_at).getTime() - Date.now()
  const hrs = Math.max(1, Math.round(Math.abs(ms) / 3600000))
  if (ms <= 0) return { label: `OVERDUE ${hrs}h`, bg: '#fee2e2', color: '#b91c1c' }
  if (hrs <= 4) return { label: `Due in ${hrs}h`, bg: '#fef3c7', color: '#b45309' }
  return { label: `Due in ${hrs}h`, bg: '#e2e8f0', color: '#475569' }
}
const SlaChip = ({ cc, coaching }) => {
  const s = criticalSla(cc, coaching)
  if (!s) return <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>n/a</span>
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
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
    if (error) {
      // Two coaches on the same hub can open this case and hit "Assign to me" at the same
      // moment. The unique indexes on eval_coachings.evaluation_id / .critical_case_id make
      // the loser's insert fail with 23505 (unique_violation) — translate that into
      // something readable instead of leaking the raw constraint name, and refresh so the
      // row immediately shows who actually took it.
      const isTaken = error.code === '23505' || /duplicate key|unique constraint/i.test(error.message || '')
      if (isTaken) {
        flash('This coaching has already been assigned to another Coach.', false)
        onChanged(); onClose()
        return
      }
      return flash(error.message, false)
    }
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

  // ── Criticality dispute ────────────────────────────────────────────────────
  // A Highly Critical marking can get an agent blocked from tooling, so a Team Leader on
  // the agent's queue can challenge it. The marking KG evaluator answers; a rejected
  // challenge can be escalated to a KG admin, who has the final word.
  const dispute = item.dispute
  const disputeOpen = dispute && !['upheld', 'rejected_final', 'cancelled', 'accepted'].includes(dispute.status)
  const [canDispute, setCanDispute] = useState(false)
  const [showRaise, setShowRaise]   = useState(false)
  const [dComment, setDComment]     = useState('')

  useEffect(() => {
    // Asked of the database rather than guessed from the role, because eligibility also
    // depends on sharing a queue with the agent.
    if (!item.crit || disputeOpen) return
    supabase.rpc('quark_can_dispute_criticality', { p_case_id: item.crit.id })
      .then(({ data }) => setCanDispute(!!data))
    // eslint-disable-next-line
  }, [])

  const callDispute = async (fn, args, okMsg) => {
    setBusy(true)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return flash(error.message, false)
    flash(okMsg); onChanged(); onClose()
  }

  const raiseDispute = () => {
    if (!dComment.trim()) return flash('Explain why the marking is wrong.', false)
    callDispute('raise_criticality_dispute',
      { p_case_id: item.crit.id, p_comment: dComment.trim() },
      'Dispute raised — the 24-hour clock is paused while it is reviewed')
  }

  // Recording that RTA was contacted is an audit stamp, not an action Quark takes —
  // Quark never blocks an agent itself. Admins/owners only, and only once.
  const recordRta = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('mark_rta_escalated', { p_case_id: item.crit.id })
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('RTA escalation recorded'); onChanged(); onClose()
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
              {item.crit.sla_breached_at && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠ 24-hour SLA breached on {new Date(item.crit.sla_breached_at).toLocaleString()}
                  </div>
                  {item.crit.rta_escalated_at ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                      RTA escalation recorded {new Date(item.crit.rta_escalated_at).toLocaleString()}
                    </div>
                  ) : isPrivileged ? (
                    <div style={{ marginTop: 6 }}>
                      <button className="btn btn-outline btn-sm" disabled={busy} onClick={recordRta}>
                        Record RTA escalation
                      </button>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Stamps the audit trail once you have contacted RTA. Quark does not contact them and does not block the agent.
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                      An admin will decide whether to escalate to RTA.
                    </div>
                  )}
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
                <span><b style={{ color: 'var(--text-secondary)' }}>Communication Date:</b> {cc.occurred_on ? new Date(cc.occurred_on).toLocaleDateString() : '—'}</span>
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

          {/* Criticality dispute. Shown only where it can act: there is a marking to
              challenge, or a live dispute the viewer has a part in. */}
          {item.crit && (dispute || canDispute) && (
            <>
              <div style={label}>Criticality dispute</div>
              {!dispute ? (
                showRaise ? (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg-secondary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      This goes to the evaluator who applied the marking. The 24-hour coaching clock pauses until it is resolved.
                    </div>
                    <textarea className="input" rows={3} style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                      placeholder="Why should this marking be removed or downgraded?"
                      value={dComment} onChange={e => setDComment(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowRaise(false); setDComment('') }}>Cancel</button>
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={raiseDispute}>Raise dispute</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={() => setShowRaise(true)}>Dispute this marking</button>
                )
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                    <b>Status:</b> {DISPUTE_LABEL[dispute.status] || dispute.status}
                    {dispute.resolved_at && (
                      <span style={{ color: 'var(--text-secondary)' }}> · resolved {new Date(dispute.resolved_at).toLocaleDateString()}</span>
                    )}
                  </div>

                  {/* The marker answers first. */}
                  {dispute.status === 'evaluator_pending' && (
                    (dispute.evaluator_id === profile.id || isPrivileged) ? (
                      <>
                        <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                          placeholder="Your reasoning (required either way)"
                          value={dComment} onChange={e => setDComment(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_marker_decide',
                              { p_dispute_id: dispute.id, p_approve: true, p_comment: dComment.trim() },
                              'Dispute upheld — the marking has been removed')}>
                            Uphold — remove the marking
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_marker_decide',
                              { p_dispute_id: dispute.id, p_approve: false, p_comment: dComment.trim() },
                              'Dispute rejected — the marking stands')}>
                            Reject — the marking stands
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Awaiting the evaluator who applied the marking.
                      </div>
                    )
                  )}

                  {/* Rejected: the raiser may escalate to a KG admin, or let it stand. */}
                  {dispute.status === 'evaluator_rejected' && (
                    (dispute.tl_id === profile.id || isPrivileged) ? (
                      <>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                          The evaluator rejected the challenge. You can escalate to an admin for a final decision, or withdraw.
                        </div>
                        <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                          placeholder="Anything to add for the admin (optional)"
                          value={dComment} onChange={e => setDComment(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_escalate_to_admin',
                              { p_dispute_id: dispute.id, p_comment: dComment.trim() },
                              'Escalated to admin')}>
                            Escalate to admin
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_cancel_dispute',
                              { p_dispute_id: dispute.id, p_comment: dComment.trim() },
                              'Dispute withdrawn — the clock has resumed')}>
                            Withdraw
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Rejected by the evaluator. The Team Leader who raised it may escalate.
                      </div>
                    )
                  )}

                  {/* Kaizen Gaming has the final word, because the RTA consequence is theirs. */}
                  {dispute.status === 'admin_pending' && (
                    isPrivileged ? (
                      <>
                        <textarea className="input" rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                          placeholder="Your decision and reasoning (required)"
                          value={dComment} onChange={e => setDComment(e.target.value)} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_admin_decide',
                              { p_dispute_id: dispute.id, p_approve: true, p_comment: dComment.trim() },
                              'Upheld — the marking has been removed')}>
                            Uphold — remove the marking
                          </button>
                          <button className="btn btn-outline btn-sm" disabled={busy}
                            onClick={() => callDispute('criticality_admin_decide',
                              { p_dispute_id: dispute.id, p_approve: false, p_comment: dComment.trim() },
                              'Rejected — the marking stands')}>
                            Reject (final)
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Escalated — awaiting an admin decision.
                      </div>
                    )
                  )}

                  {disputeOpen && dispute.status === 'evaluator_pending' && dispute.tl_id === profile.id && (
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy}
                        onClick={() => callDispute('criticality_cancel_dispute',
                          { p_dispute_id: dispute.id, p_comment: '' },
                          'Dispute withdrawn — the clock has resumed')}>
                        Withdraw dispute
                      </button>
                    </div>
                  )}

                  {!disputeOpen && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {dispute.status === 'upheld'
                        ? 'The marking was removed. The coaching obligation and the 24-hour clock were cleared with it.'
                        : dispute.status === 'cancelled'
                        ? 'Withdrawn. The clock resumed from where it paused.'
                        : 'The marking stands. The clock resumed from where it paused.'}
                    </div>
                  )}
                </div>
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

export default function CoachingQueue({ profile, isPrivileged, flash, gov, openCriticalId }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems]     = useState([])
  const [detail, setDetail]   = useState(null)
  const [tabFilter, setTab]   = useState('all')
  const [page, setPage]       = useState(1)   // 1-based; see PAGE_SIZE below
  const [fType, setFType]   = useState('')
  const [fScore, setFScore] = useState('')
  const [fAgent, setFAgent] = useState('')
  const [fDiv, setFDiv]     = useState('')
  const [fBpo, setFBpo]     = useState('')
  const [fHub, setFHub]     = useState('')
  const [fMarket, setFMkt]  = useState('')
  const [fCoach, setFCoach] = useState('')
  const [fCrit, setFCrit]   = useState('')
  const [fSla, setFSla]     = useState('')
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
    // An evaluation that carries a critical case must appear in this queue even when it
    // would not otherwise count as "coachable". A Highly Critical reason is set
    // independently of scoring, so a 100% Quality evaluation — or a NON-controllable DSAT
    // ("Independent of controllability — a non-controllable DSAT can still breach a
    // critical standard") — can still be Highly Critical. Both were being filtered out:
    // the first by the .or() below, the second by isCoachable. The result was a case that
    // could never be coached at all, and a critical notification whose deep link opened
    // nothing. So: find the critical-carrying evaluations first, then union them in.
    let ccq = supabase.from('critical_cases')
      .select('evaluation_id')
      .not('evaluation_id', 'is', null)
      .is('deleted_at', null)
    if (hubIds) ccq = ccq.in('hub_id', hubIds)
    const { data: critEvRows } = await ccq
    const critEvIds = [...new Set((critEvRows || []).map(r => r.evaluation_id).filter(Boolean))]

    const EV_COLS = 'id, eval_id, score, evaluation_type, metadata_values, submitted_at, hub_id, workspace_id, queue_id, deviated_controllability, overall_comment, scorecards!evaluations_scorecard_id_fkey(name, type)'

    let q = supabase.from('evaluations')
      .select(EV_COLS)
      .eq('status', 'submitted')
      .or('and(evaluation_type.eq.quality,score.lt.100),evaluation_type.eq.dsat')
      .order('submitted_at', { ascending: false })
      .limit(500)
    if (hubIds) q = q.in('hub_id', hubIds)
    const { data: evs } = await q

    // Second pass for the critical-carrying evaluations the .or() above would have dropped.
    let critEvs = []
    if (critEvIds.length) {
      let cq = supabase.from('evaluations').select(EV_COLS).eq('status', 'submitted').in('id', critEvIds)
      if (hubIds) cq = cq.in('hub_id', hubIds)
      const { data: cdata } = await cq
      critEvs = cdata || []
    }

    // Merge and de-duplicate, then re-sort — concatenating two result sets loses the
    // newest-first ordering the table relies on.
    const byId = {}
    ;[...(evs || []), ...critEvs].forEach(e => { byId[e.id] = e })
    const allEvs = Object.values(byId)
      .sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0))

    const critIdSet = new Set(critEvIds)
    const candidates = allEvs.filter(ev => isCoachable(ev) || critIdSet.has(ev.id))
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
          .select('id, evaluation_id, severity, critical_attribute_ids, sla_due_at, sla_paused_at, sla_breached_at, rta_escalated_at, reason:highly_critical_reasons!critical_cases_highly_critical_reason_id_fkey(name)')
          .in('evaluation_id', ids)
          .is('deleted_at', null),
      ])
      ;(cs || []).forEach(c => { coachMap[c.evaluation_id] = c })
      ;(ccs || []).forEach(c => { critMap[c.evaluation_id] = c })
    }

    // Standalone critical cases have no evaluation behind them, so they are a second
    // source of coachable work. They are anchored on eval_coachings.critical_case_id
    // rather than evaluation_id (Phase 3b schema).
    // Embeds are named explicitly rather than by shorthand: a second FK to the same table
    // would otherwise make them ambiguous and fail the whole query — the exact fault that
    // silently emptied the Evaluations page earlier.
    let sq = supabase.from('critical_cases')
      .select('*, reason:highly_critical_reasons!critical_cases_highly_critical_reason_id_fkey(name), reporter:users!critical_cases_reported_by_fkey(name)')
      .eq('source', 'standalone')
      .is('deleted_at', null)
      .order('reported_at', { ascending: false })
      .limit(500)
    if (hubIds) sq = sq.in('hub_id', hubIds)
    const { data: sas, error: saErr } = await sq
    // Surfaced, not swallowed: an empty list and a failed query look identical otherwise.
    if (saErr) { console.error('standalone critical cases failed to load:', saErr.message); flash('Could not load standalone critical cases: ' + saErr.message, false) }
    const standalone = sas || []
    const saCoach = {}
    if (standalone.length) {
      const { data: scs } = await supabase.from('eval_coachings')
        .select('*, coach:users!eval_coachings_coach_id_fkey(name)')
        .in('critical_case_id', standalone.map(c => c.id))
      ;(scs || []).forEach(c => { saCoach[c.critical_case_id] = c })
    }

    // Criticality disputes, so the queue can show a paused clock and the detail can offer
    // the right decision to the right person. Newest per case wins.
    const caseIds = [
      ...Object.values(critMap).map(c => c.id),
      ...standalone.map(c => c.id),
    ].filter(Boolean)
    const dispMap = {}
    if (caseIds.length) {
      const { data: ds, error: dErr } = await supabase.from('disputes')
        .select('id, critical_case_id, status, evaluator_id, tl_id, admin_id, created_at, resolved_at, outcome')
        .eq('kind', 'criticality')
        .in('critical_case_id', caseIds)
        .order('created_at', { ascending: false })
      if (dErr) console.error('criticality disputes failed to load:', dErr.message)
      ;(ds || []).forEach(d => { if (!dispMap[d.critical_case_id]) dispMap[d.critical_case_id] = d })
    }

    setItems([
      ...candidates.map(ev => ({
        kind: 'eval', ev, cc: null,
        coaching: coachMap[ev.id] || null,
        crit: critMap[ev.id] || null,
        dispute: critMap[ev.id] ? (dispMap[critMap[ev.id].id] || null) : null,
      })),
      ...standalone.map(cc => ({
        kind: 'standalone', ev: null, cc,
        coaching: saCoach[cc.id] || null,
        crit: cc,
        dispute: dispMap[cc.id] || null,
      })),
    ])
    setLoading(false)
  }
  useEffect(() => { if (profile?.id) load() /* eslint-disable-next-line */ }, [profile?.id])

  // Arrived from a Critical / Highly Critical notification (/coaching?critical=<case id>).
  // Open that case's detail modal straight away rather than leaving the coach to find the
  // row. Keyed on items too, so it still fires when the deep link lands before the queue
  // has finished loading. Matches on it.crit.id, which is the critical_cases id for both
  // evaluation-linked and standalone cases.
  useEffect(() => {
    if (!openCriticalId || !items.length) return
    const target = items.find(it => String(it.crit?.id) === String(openCriticalId))
    if (target) setDetail(target)
    // Say so rather than failing silently — otherwise clicking the notification appears to
    // do nothing at all. Most likely causes: the case was deleted, or it sits outside this
    // user's hub scope.
    else flash('That critical case is no longer in your coaching queue — it may have been removed or reassigned to another hub.', false)
    window.history.replaceState({}, '', '/coaching')
    // eslint-disable-next-line
  }, [openCriticalId, items])

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
      // Standalone cases store hub/workspace/market directly, because a hub+market can be
      // served by several queues so queue_id may be null. Names come from the governance
      // maps rather than the queue context in that case.
      _div: ctx.division_name || '',
      _bpo: sa ? (ctx.workspace_name || gov?.ws?.[cc.workspace_id] || '') : (ctx.workspace_name || ''),
      _hub: sa ? (ctx.hub_name || gov?.hub?.[cc.hub_id] || '') : (ctx.hub_name || ''),
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
      _sla: (() => {
        const st = criticalSla(it.crit, it.coaching)
        if (!st) return ''
        if (st.label === 'Met') return 'met'
        if (st.label.startsWith('Paused')) return 'paused'
        return st.label.startsWith('OVERDUE') ? 'overdue' : 'due'
      })(),
      _ref: sa ? ('CR-' + String(cc.id).slice(0, 6).toUpperCase()) : ('#' + (ev.eval_id || ev.id)),
      // Millisecond timestamp so the two sources interleave properly. Without this the
      // standalone cases sit in a block after every evaluation, however recent they are.
      _ts: sa
        ? (cc.reported_at ? new Date(cc.reported_at).getTime() : 0)
        : (ev.submitted_at ? new Date(ev.submitted_at).getTime() : 0),
    }
  }).sort((a, b) => b._ts - a._ts), [items, gov])

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
      (!fSla || it._sla === fSla) &&
      (!fFrom || (it._date && it._date >= fFrom)) && (!fTo || (it._date && it._date <= fTo))
  }), [deco, tabFilter, profile?.id, fType, fScore, fAgent, fDiv, fBpo, fHub, fMarket, fCoach, fCrit, fSla, fFrom, fTo])

  // Paginate client-side. The whole candidate list is already in memory (the queue is a
  // union of two tables that both have to be fetched in full to be interleaved by date),
  // so paging here costs nothing and keeps every filter and the sort order intact —
  // filters narrow the list first, then the page is taken from the result.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  // Clamp rather than reset: if filtering shrinks the list while you are on page 5, land
  // on the last real page instead of an empty one. Deriving it (rather than only fixing it
  // in an effect) means the very first render after a filter change is already correct.
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Any change to the filters or tab sends you back to page 1 — staying on page 3 of a
  // freshly filtered list is disorienting and usually looks like "no results".
  useEffect(() => { setPage(1) },
    [tabFilter, fType, fScore, fAgent, fDiv, fBpo, fHub, fMarket, fCoach, fCrit, fSla, fFrom, fTo])

  const showCoach = tabFilter === 'all' || tabFilter === 'done'
  const statusOf = (it) => it.coaching ? it.coaching.status : 'pending'
  const clearAll = () => { setFType(''); setFScore(''); setFAgent(''); setFDiv(''); setFBpo(''); setFHub(''); setFMkt(''); setFCoach(''); setFCrit(''); setFSla(''); setFrom(''); setTo('') }
  const anyFilter = fType || fScore || fAgent || fDiv || fBpo || fHub || fMarket || fCoach || fCrit || fSla || fFrom || fTo
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
        <select style={sel} value={fSla} onChange={e => setFSla(e.target.value)}>
          <option value="">All 24h SLA</option>
          <option value="overdue">Overdue</option>
          <option value="due">Due</option>
          <option value="paused">Paused</option>
          <option value="met">Met</option>
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
        // overflowX rather than hidden: a clipped final column silently hides the primary
        // action, which is exactly how the Assign/View button disappeared. A {/* */}
        // comment cannot go here — in expression position it parses as an object literal.
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 940 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={thStyle}>#</th><th style={thStyle}>Type</th><th style={thStyle}>Agent</th><th style={thStyle}>Scorecard</th>
              <th style={thStyle}>Score / Ctrl.</th><th style={thStyle}>Criticality</th><th style={thStyle}>Date</th>
              {showCoach && <th style={thStyle}>Coach</th>}
              <th style={thStyle}>Coaching</th><th style={{ ...thStyle, textAlign: 'right' }}></th>
            </tr></thead>
            <tbody>
              {pageItems.length === 0 && <tr><td colSpan={showCoach ? 10 : 9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)' }}>Nothing here.</td></tr>}
              {pageItems.map(it => {
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
                    {/* SLA sits under the criticality chip rather than in its own column:
                        11 columns overflowed the card and pushed the action button out of
                        view. They belong together anyway — the deadline only means
                        anything in the context of the severity that created it. */}
                    <td style={tdStyle}>
                      <CritChip severity={it._crit} reason={it._critReason} />
                      {it._crit === 'highly_critical' && (
                        <div style={{ marginTop: 4 }}><SlaChip cc={it.crit} coaching={it.coaching} /></div>
                      )}
                    </td>
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

      {/* Pager. Hidden when everything fits on one page — a lone "Page 1 of 1" with two
          dead buttons is noise. The count of matching rows is always useful though, so it
          shows whenever there is anything at all. */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {filtered.length === 1
              ? '1 case'
              : `Showing ${(safePage - 1) * PAGE_SIZE + 1}\u2013${Math.min(safePage * PAGE_SIZE, filtered.length)} of ${filtered.length} cases`}
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(1, Math.min(p, totalPages) - 1))}>
                &larr; Previous
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                Page {safePage} of {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, Math.min(p, totalPages) + 1))}>
                Next &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      {detail && <QueueDetail item={detail} profile={profile} isPrivileged={isPrivileged} flash={flash} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  )
}