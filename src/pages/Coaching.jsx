import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

// ─── Coaching constants ─────────────────────────────────────────────────────
const MODELS = [
  { value: 'GROW',     label: 'GROW (Goal · Reality · Options · Will)' },
  { value: 'CLEAR',    label: 'CLEAR (Contract · Listen · Explore · Action · Review)' },
  { value: 'freeform', label: 'Free-form' },
]

const STATUS = {
  draft:                { label: 'Draft',              color: '#64748b', bg: '#64748b22' },
  active:               { label: 'Active',             color: '#6366f1', bg: '#6366f122' },
  pending_verification: { label: 'Pending verification', color: '#f59e0b', bg: '#f59e0b22' },
  closed_met:           { label: 'Closed · Met',       color: '#22c55e', bg: '#22c55e22' },
  closed_not_met:       { label: 'Closed · Not met',   color: '#ef4444', bg: '#ef444422' },
  cancelled:            { label: 'Cancelled',          color: '#94a3b8', bg: '#94a3b822' },
}

const StatusBadge = ({ status }) => {
  const s = STATUS[status] || STATUS.draft
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
      backgroundColor: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
  )
}

// ─── Confirm modal (same pattern as Control Room) ───────────────────────────
function ConfirmModal({ message, onYes, onNo }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#00000066',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 400, padding: '28px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Are you sure?</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-danger" style={{ minWidth: 80 }} onClick={onYes}>Yes</button>
          <button className="btn btn-ghost" style={{ minWidth: 80 }} onClick={onNo}>No</button>
        </div>
      </div>
    </div>
  )
}

// ─── New session form (coach only) — free, overall coaching ─────────────────
function NewSessionForm({ profile, agents, parent, flash, onSaved, onCancel }) {
  const [agentId, setAgentId]   = useState(parent?.agent_id || '')
  const [model, setModel]       = useState('GROW')
  const [strengths, setStr]     = useState('')
  const [observations, setObs]  = useState('')
  const [rootCause, setRoot]    = useState('')
  const [focus, setFocus]       = useState([{ label: '', baseline: '' }])
  const [actions, setActions]   = useState([{ description: '', done_test: '', due_date: '' }])
  const [saving, setSaving]     = useState(false)

  const setFocusField  = (i, k, v) => setFocus(f => f.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const setActionField = (i, k, v) => setActions(a => a.map((x, j) => j === i ? { ...x, [k]: v } : x))

  const save = async (deliver) => {
    if (!agentId) return flash('Select the agent being coached.', false)
    const cleanFocus   = focus.filter(f => f.label.trim())
    const cleanActions = actions.filter(a => a.description.trim())
    if (deliver && cleanFocus.length === 0) return flash('Add at least one focus area before delivering.', false)
    if (deliver && cleanActions.length === 0) return flash('Add at least one action item before delivering.', false)

    setSaving(true)
    const { data: session, error } = await supabase.from('coaching_sessions').insert({
      agent_id: agentId,
      coach_id: profile.id,
      status: deliver ? 'active' : 'draft',
      coaching_model: model,
      strengths: strengths.trim() || null,
      observations: observations.trim() || null,
      root_cause: rootCause.trim() || null,
      parent_session_id: parent?.id || null,
    }).select().single()
    if (error) { setSaving(false); return flash(error.message, false) }

    if (cleanFocus.length) {
      await supabase.from('coaching_focus_areas').insert(cleanFocus.map((f, i) => ({
        session_id: session.id, label: f.label.trim(),
        baseline_score: f.baseline === '' ? null : Number(f.baseline), sort_order: i,
      })))
    }
    if (cleanActions.length) {
      await supabase.from('coaching_action_items').insert(cleanActions.map((a, i) => ({
        session_id: session.id, description: a.description.trim(),
        done_test: a.done_test.trim() || null,
        owner_id: agentId, due_date: a.due_date || null, sort_order: i,
      })))
    }
    setSaving(false)
    flash(deliver ? 'Coaching session delivered' : 'Draft saved')
    onSaved()
  }

  const labelStyle = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }
  const sectionTitle = { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '22px 0 12px' }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
        {parent ? 'Re-coaching session' : 'New coaching session'}
      </div>
      {parent && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Follow-up to a previous session that was not sustained.
        </div>
      )}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ minWidth: 240 }}>
          <label style={labelStyle}>Agent being coached</label>
          <select className="select" value={agentId} disabled={!!parent}
            onChange={e => setAgentId(e.target.value)} style={{ minWidth: 240 }}>
            <option value="">Select agent…</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 260 }}>
          <label style={labelStyle}>Coaching model</label>
          <select className="select" value={model} onChange={e => setModel(e.target.value)} style={{ minWidth: 260 }}>
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      <div style={sectionTitle}>Session notes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Strengths / what went well</label>
          <textarea className="input" rows={2} value={strengths} onChange={e => setStr(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }} placeholder="Recognise what the agent is doing well." />
        </div>
        <div>
          <label style={labelStyle}>Observations</label>
          <textarea className="input" rows={2} value={observations} onChange={e => setObs(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }} placeholder="What you've observed overall." />
        </div>
        <div>
          <label style={labelStyle}>Agreed root cause</label>
          <textarea className="input" rows={2} value={rootCause} onChange={e => setRoot(e.target.value)}
            style={{ width: '100%', resize: 'vertical' }} placeholder="The root cause you and the agent agreed on." />
        </div>
      </div>

      <div style={sectionTitle}>Focus areas
        <span style={{ textTransform: 'none', fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>
          (keep to 1–2 — targeted coaching)
        </span>
      </div>
      {focus.map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={labelStyle}>Focus area {i + 1}</label>
            <input className="input" value={f.label} onChange={e => setFocusField(i, 'label', e.target.value)}
              style={{ width: '100%' }} placeholder="e.g. Empathy statements" />
          </div>
          <div style={{ width: 130 }}>
            <label style={labelStyle}>Baseline % (opt.)</label>
            <input type="number" className="input" min={0} max={100} value={f.baseline}
              onChange={e => setFocusField(i, 'baseline', e.target.value)} style={{ width: '100%' }} placeholder="—" />
          </div>
          {focus.length > 1 && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
              onClick={() => setFocus(f => f.filter((_, j) => j !== i))}>Remove</button>
          )}
        </div>
      ))}
      {focus.length < 3 && (
        <button className="btn btn-ghost btn-sm" onClick={() => setFocus(f => [...f, { label: '', baseline: '' }])}>+ Add focus area</button>
      )}

      <div style={sectionTitle}>Action plan
        <span style={{ textTransform: 'none', fontWeight: 400, marginLeft: 8, color: 'var(--text-secondary)' }}>
          (each item: what to do, a measurable "done test", and a due date)
        </span>
      </div>
      {actions.map((a, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Action {i + 1} — what the agent will do</label>
            <input className="input" value={a.description} onChange={e => setActionField(i, 'description', e.target.value)}
              style={{ width: '100%' }} placeholder="e.g. Open every chat with a personalised greeting" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={labelStyle}>Done test (how we'll know it worked)</label>
              <input className="input" value={a.done_test} onChange={e => setActionField(i, 'done_test', e.target.value)}
                style={{ width: '100%' }} placeholder="e.g. Empathy scored PASS on next 3 evaluations" />
            </div>
            <div style={{ width: 160 }}>
              <label style={labelStyle}>Due date</label>
              <input type="date" className="input" value={a.due_date} onChange={e => setActionField(i, 'due_date', e.target.value)} style={{ width: '100%' }} />
            </div>
            {actions.length > 1 && (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                onClick={() => setActions(a => a.filter((_, j) => j !== i))}>Remove</button>
            )}
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => setActions(a => [...a, { description: '', done_test: '', due_date: '' }])}>+ Add action item</button>

      <div style={{ display: 'flex', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
          {saving ? 'Saving…' : 'Deliver session'}
        </button>
        <button className="btn btn-ghost" disabled={saving} onClick={() => save(false)}>Save as draft</button>
        <button className="btn btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Session detail modal ───────────────────────────────────────────────────
function SessionDetail({ session, profile, isCoach, flash, onClose, onChanged, onRecoach }) {
  const [focus, setFocus]     = useState([])
  const [actions, setActions] = useState([])
  const [followup, setFollow] = useState(session.followup_score ?? '')
  const [ackComment, setAck]  = useState('')
  const [confirm, setConfirm] = useState(null)
  const isOwnAgent = session.agent_id === profile.id

  const load = async () => {
    const [{ data: f }, { data: a }] = await Promise.all([
      supabase.from('coaching_focus_areas').select('*').eq('session_id', session.id).order('sort_order'),
      supabase.from('coaching_action_items').select('*').eq('session_id', session.id).order('sort_order'),
    ])
    setFocus(f || [])
    setActions(a || [])
  }
  useEffect(() => { load() }, [])

  const setActionStatus = async (item, status) => {
    const patch = { status }
    if (status === 'met' || status === 'not_met') {
      patch.verified_by = profile.id
      patch.verified_at = new Date().toISOString()
    }
    const { error } = await supabase.from('coaching_action_items').update(patch).eq('id', item.id)
    if (error) return flash(error.message, false)
    await load()
  }

  const saveFollowup = async () => {
    const { error } = await supabase.from('coaching_sessions')
      .update({ followup_score: followup === '' ? null : Number(followup) }).eq('id', session.id)
    if (error) return flash(error.message, false)
    flash('Follow-up score saved'); onChanged()
  }

  const moveToVerification = async () => {
    const { error } = await supabase.from('coaching_sessions').update({ status: 'pending_verification' }).eq('id', session.id)
    if (error) return flash(error.message, false)
    flash('Moved to pending verification'); onChanged(); onClose()
  }

  const closeSession = (met) => setConfirm({
    message: met ? 'Close this session as MET — improvement was verified and sustained?'
                  : 'Close this session as NOT MET? You can then create a re-coaching session.',
    onYes: async () => {
      setConfirm(null)
      const { error } = await supabase.from('coaching_sessions')
        .update({ status: met ? 'closed_met' : 'closed_not_met', closed_at: new Date().toISOString(),
                  followup_score: followup === '' ? null : Number(followup) }).eq('id', session.id)
      if (error) return flash(error.message, false)
      flash(met ? 'Session closed — met' : 'Session closed — not met')
      onChanged(); onClose()
      if (!met) onRecoach(session)
    }
  })

  const acknowledge = async () => {
    const { error } = await supabase.from('coaching_sessions')
      .update({ agent_acknowledged_at: new Date().toISOString(), agent_comment: ackComment.trim() || null })
      .eq('id', session.id)
    if (error) return flash(error.message, false)
    flash('Acknowledged'); onChanged(); onClose()
  }

  const allResolved = actions.length > 0 && actions.every(a => a.status === 'met' || a.status === 'not_met')
  const label = { fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '18px 0 8px' }
  const box = { fontSize: 13, lineHeight: 1.6, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap' }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={() => setConfirm(null)} />}
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>Coaching session</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={session.status} />
            <span style={{ fontSize: 13 }}><b>Agent:</b> {session.agent?.name || '—'}</span>
            <span style={{ fontSize: 13 }}><b>Coach:</b> {session.coach?.name || '—'}</span>
            <span style={{ fontSize: 13 }}><b>Model:</b> {session.coaching_model}</span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(session.session_date || session.created_at).toLocaleDateString()}</span>
          </div>

          {session.followup_score != null && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <b>Follow-up score:</b> {session.followup_score}%
            </div>
          )}

          {session.strengths && (<><div style={label}>Strengths</div><div style={box}>{session.strengths}</div></>)}
          {session.observations && (<><div style={label}>Observations</div><div style={box}>{session.observations}</div></>)}
          {session.root_cause && (<><div style={label}>Agreed root cause</div><div style={box}>{session.root_cause}</div></>)}

          {focus.length > 0 && (
            <>
              <div style={label}>Focus areas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {focus.map(f => (
                  <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13,
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px' }}>
                    <span>{f.label}</span>
                    {f.baseline_score != null && <span style={{ color: 'var(--text-secondary)' }}>baseline {f.baseline_score}%</span>}
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={label}>Action plan</div>
          {actions.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No action items.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.map(a => (
                <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.description}</div>
                    <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                      color: a.status === 'met' ? 'var(--success)' : a.status === 'not_met' ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {a.status === 'met' ? '✓ Met' : a.status === 'not_met' ? '✗ Not met' : a.status === 'in_progress' ? 'In progress' : 'Open'}
                    </span>
                  </div>
                  {a.done_test && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Done test: {a.done_test}</div>}
                  {a.due_date && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Due: {new Date(a.due_date).toLocaleDateString()}</div>}
                  {isCoach && session.status !== 'closed_met' && session.status !== 'closed_not_met' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setActionStatus(a, 'in_progress')}>In progress</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={() => setActionStatus(a, 'met')}>Mark met</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setActionStatus(a, 'not_met')}>Mark not met</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Agent acknowledgement */}
          {isOwnAgent && !session.agent_acknowledged_at && session.status !== 'draft' && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={label}>Your acknowledgement</div>
              <textarea className="input" rows={2} value={ackComment} onChange={e => setAck(e.target.value)}
                style={{ width: '100%', resize: 'vertical', marginBottom: 8 }} placeholder="Optional comment…" />
              <button className="btn btn-primary btn-sm" onClick={acknowledge}>Acknowledge session</button>
            </div>
          )}
          {session.agent_acknowledged_at && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--success)' }}>
              ✓ Acknowledged by agent on {new Date(session.agent_acknowledged_at).toLocaleDateString()}
              {session.agent_comment && <div style={{ ...box, marginTop: 6, color: 'var(--text-primary)' }}>{session.agent_comment}</div>}
            </div>
          )}

          {/* Coach close-loop controls */}
          {isCoach && session.status !== 'closed_met' && session.status !== 'closed_not_met' && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={label}>Verification & close-out</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ width: 180 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Follow-up score % (opt.)</label>
                  <input type="number" min={0} max={100} className="input" value={followup} onChange={e => setFollow(e.target.value)} style={{ width: '100%' }} placeholder="—" />
                </div>
                <button className="btn btn-ghost btn-sm" onClick={saveFollowup}>Save follow-up</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {session.status === 'active' && (
                  <button className="btn btn-ghost btn-sm" onClick={moveToVerification}>Move to pending verification</button>
                )}
                <button className="btn btn-sm btn-primary" disabled={!allResolved}
                  title={allResolved ? '' : 'Resolve all action items first'} onClick={() => closeSession(true)}>Close — Met</button>
                <button className="btn btn-sm btn-danger" disabled={!allResolved}
                  title={allResolved ? '' : 'Resolve all action items first'} onClick={() => closeSession(false)}>Close — Not met</button>
              </div>
              {!allResolved && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>Mark every action item met or not met to close the session.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Coaching page ─────────────────────────────────────────────────────
export default function Coaching() {
  const { profile } = useAuth()
  const isCoach = ['owner', 'admin', 'evaluator'].includes(profile?.role)

  const [sessions, setSessions] = useState([])
  const [agents, setAgents]     = useState([])
  const [counts, setCounts]     = useState({})
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)
  const [recoachOf, setRecoach] = useState(null)
  const [detail, setDetail]     = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [msg, setMsg]           = useState(null)

  const flash = (text, ok = true) => { setMsg({ text, ok }); if (ok) setTimeout(() => setMsg(null), 3000) }

  const loadSessions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('coaching_sessions')
      .select('*, agent:users!coaching_sessions_agent_id_fkey(name, email), coach:users!coaching_sessions_coach_id_fkey(name, email)')
      .order('created_at', { ascending: false })
    const rows = data || []
    setSessions(rows)
    const ids = rows.map(r => r.id)
    if (ids.length) {
      const { data: items } = await supabase.from('coaching_action_items').select('session_id, status').in('session_id', ids)
      const c = {}
      ;(items || []).forEach(it => {
        c[it.session_id] = c[it.session_id] || { total: 0, done: 0 }
        c[it.session_id].total++
        if (it.status === 'met' || it.status === 'not_met') c[it.session_id].done++
      })
      setCounts(c)
    } else setCounts({})
    setLoading(false)
  }

  const loadAgents = async () => {
    const { data } = await supabase.from('users').select('id, name, email, role, active').eq('role', 'viewer').order('name')
    setAgents((data || []).filter(a => a.active !== false))
  }

  useEffect(() => { if (profile?.id) { loadSessions(); if (isCoach) loadAgents() } }, [profile])

  const filtered = useMemo(() =>
    statusFilter === 'all' ? sessions : sessions.filter(s => s.status === statusFilter)
  , [sessions, statusFilter])

  const startRecoach = (parent) => { setDetail(null); setRecoach(parent); setCreating(true) }
  const closeForm = () => { setCreating(false); setRecoach(null) }
  const afterSave = () => { closeForm(); loadSessions() }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Coaching</h1>
        </div>
        {isCoach && !creating && (
          <button className="btn btn-primary" onClick={() => { setRecoach(null); setCreating(true) }}>+ New Coaching Session</button>
        )}
      </div>

      {msg && (
        <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{msg.text}</span>
          <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button>
        </div>
      )}

      {creating && isCoach && (
        <NewSessionForm profile={profile} agents={agents} parent={recoachOf} flash={flash} onSaved={afterSave} onCancel={closeForm} />
      )}

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Coach</th>
                <th>Date</th>
                <th>Status</th>
                <th>Action plan</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan="7" className="empty-row">
                  {isCoach ? 'No coaching sessions yet. Start one with + New Coaching Session.' : 'You have no coaching sessions yet.'}
                </td></tr>
              )}
              {filtered.map(s => {
                const c = counts[s.id] || { total: 0, done: 0 }
                return (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 500 }}>{s.agent?.name || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{s.coach?.name || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(s.session_date || s.created_at).toLocaleDateString()}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{c.total ? `${c.done}/${c.total} resolved` : '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{s.followup_score != null ? `${s.followup_score}%` : '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setDetail(s)}>View</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <SessionDetail session={detail} profile={profile} isCoach={isCoach} flash={flash}
          onClose={() => setDetail(null)} onChanged={loadSessions} onRecoach={startRecoach} />
      )}
    </div>
  )
}
