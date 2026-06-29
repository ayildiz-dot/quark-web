import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

// ─── Confirm Modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onYes, onNo }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: '#00000066',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="card" style={{ width: 380, padding: '28px 28px 24px', textAlign: 'center' }}>
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

// ─── User Management Tab ───────────────────────────────────────────────────────
function UsersTab({ profile, flash }) {
  const [users,      setUsers]      = useState([])
  const [onlineIds,  setOnlineIds]  = useState(new Set())
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState(new Set())
  const [bulkRole,   setBulkRole]   = useState('evaluator')
  const [expanded,   setExpanded]   = useState(null)
  const [confirm,    setConfirm]    = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [allHubs,    setAllHubs]    = useState([])
  const [allQueues,  setAllQueues]  = useState([])
  const [userQueues, setUserQueues] = useState({})
  const [assigning,  setAssigning]  = useState(null)
  const [assignWs,   setAssignWs]   = useState('')
  const [assignHub,  setAssignHub]  = useState('')
  const [assignQueue,setAssignQueue]= useState('')

  useEffect(() => { loadUsers(); loadGovernance() }, [])

  useEffect(() => {
    const syncPresence = () => {
      const channels = supabase.getChannels()
      const presence = channels.find(c => c.topic === 'realtime:quark-presence')
      if (!presence) return
      const state = presence.presenceState()
      const ids = new Set()
      Object.values(state).forEach(presences => presences.forEach(p => ids.add(p.user_id)))
      setOnlineIds(ids)
    }
    syncPresence()
    const interval = setInterval(syncPresence, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false })
    setUsers(data || [])
  }

  const loadGovernance = async () => {
    const { data: ws }     = await supabase.from('workspaces').select('id, name').order('name')
    const { data: hubs }   = await supabase.from('hubs').select('id, name, workspace_id').order('name')
    const { data: queues } = await supabase.from('queues').select('id, name, hub_id').order('name')
    const { data: uq }     = await supabase.from('user_queues').select('user_id, queue_id')
    setWorkspaces(ws || [])
    setAllHubs(hubs || [])
    setAllQueues(queues || [])
    const map = {}
    ;(uq || []).forEach(({ user_id, queue_id }) => {
      const q = (queues || []).find(x => x.id === queue_id)
      const h = q ? (hubs   || []).find(x => x.id === q.hub_id) : null
      const w = h ? (ws     || []).find(x => x.id === h.workspace_id) : null
      if (!map[user_id]) map[user_id] = []
      map[user_id].push({ queue_id, queue_name: q?.name || '—', hub_name: h?.name || '—', workspace_name: w?.name || '—' })
    })
    setUserQueues(map)
  }

  const [roleFilter, setRoleFilter] = useState('all')
  const [govFilter,  setGovFilter]  = useState('all')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      const hasQueue = (userQueues[u.id] || []).length > 0
      if (govFilter === 'assigned'   && !hasQueue) return false
      if (govFilter === 'unassigned' &&  hasQueue) return false
      return true
    })
  }, [users, search, roleFilter, govFilter, userQueues])

  const toggleSelect  = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll     = () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(u => u.id))) }
  const clearSelected = () => setSelected(new Set())

  const applyBulkRole = async () => {
    const ids = [...selected].filter(id => { const u = users.find(x => x.id === id); return u && u.id !== profile.id && !(profile.role === 'admin' && u.role === 'owner') })
    if (!ids.length) return flash('No eligible users selected.', false)
    await Promise.all(ids.map(id => supabase.from('users').update({ role: bulkRole }).eq('id', id)))
    await loadUsers(); flash(`Role updated to ${bulkRole} for ${ids.length} user(s)`)
  }

  // bulk governance state
  const [bulkWs,    setBulkWs]    = useState('')
  const [bulkHub,   setBulkHub]   = useState('')
  const [bulkQueue, setBulkQueue] = useState('')
  const bulkHubs   = allHubs.filter(h => h.workspace_id === bulkWs)
  const bulkQueues = allQueues.filter(q => q.hub_id === bulkHub)

  const applyBulkQueue = async () => {
    if (!bulkQueue) return flash('Please select a queue to assign.', false)
    const ids = [...selected]
    let count = 0
    for (const userId of ids) {
      const existing = (userQueues[userId] || []).map(x => x.queue_id)
      if (!existing.includes(bulkQueue)) {
        await supabase.from('user_queues').insert({ user_id: userId, queue_id: bulkQueue })
        count++
      }
    }
    await loadGovernance()
    flash(`Queue assigned to ${count} user(s)`)
  }

  const ask = (message, onYes) => setConfirm({ message, onYes })
  const closeConfirm = () => setConfirm(null)

  const changeRole = async (id, role) => {
    if (id === profile.id) return flash('You cannot change your own role.', false)
    const { error } = await supabase.from('users').update({ role }).eq('id', id)
    if (error) return flash(error.message, false)
    await loadUsers(); flash(`Role updated to ${role}`)
  }

  const toggleActive = (u) => ask(
    u.active ? `This will deactivate ${u.name}'\''s account. They will no longer be able to log in.` : `This will reactivate ${u.name}'\''s account.`,
    async () => {
      closeConfirm()
      if (u.id === profile.id) return flash('You cannot deactivate yourself.', false)
      const { error } = await supabase.from('users').update({ active: !u.active }).eq('id', u.id)
      if (error) return flash(error.message, false)
      await loadUsers(); flash(u.active ? 'Account deactivated' : 'Account activated')
    }
  )

  const sendResetLink = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://quark-iota.vercel.app/reset-password' })
    if (error) return flash(error.message, false)
    flash(`Reset link sent to ${email}`)
  }

  const canChangeRole = (u) => {
    if (u.id === profile.id) return false
    if (profile.role === 'owner') return true
    if (profile.role === 'admin' && u.role !== 'owner') return true
    return false
  }

  const filteredHubs   = allHubs.filter(h => h.workspace_id === assignWs)
  const filteredQueues = allQueues.filter(q => q.hub_id === assignHub)

  const startAssign  = (userId) => { setAssigning(userId); setAssignWs(''); setAssignHub(''); setAssignQueue('') }
  const cancelAssign = () => setAssigning(null)

  const addQueueAssignment = async (userId) => {
    if (!assignQueue) return flash('Please select a queue.', false)
    const existing = (userQueues[userId] || []).map(x => x.queue_id)
    if (existing.includes(assignQueue)) return flash('User already assigned to this queue.', false)
    const { error } = await supabase.from('user_queues').insert({ user_id: userId, queue_id: assignQueue })
    if (error) return flash(error.message, false)
    await loadGovernance(); setAssigning(null); flash('Queue assigned')
  }

  const removeQueueAssignment = async (userId, queueId) => {
    await supabase.from('user_queues').delete().eq('user_id', userId).eq('queue_id', queueId)
    await loadGovernance(); flash('Queue removed')
  }

  return (
    <div>
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={closeConfirm} />}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280, height: 36 }}
          placeholder="Search by name or email…" value={search}
          onChange={e => setSearch(e.target.value)} />
        <select className="select" style={{ height: 36, fontSize: 13, minWidth: 130 }}
          value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="evaluator">Evaluator</option>
          <option value="viewer">Agent</option>
        </select>
        <select className="select" style={{ height: 36, fontSize: 13, minWidth: 160 }}
          value={govFilter} onChange={e => setGovFilter(e.target.value)}>
          <option value="all">All governance</option>
          <option value="assigned">Assigned to queue</option>
          <option value="unassigned">Not assigned</option>
        </select>
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center',
            backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '6px 14px', fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{selected.size} selected</span>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text-secondary)' }}>Change role to</span>
            <select className="select select-sm" value={bulkRole} onChange={e => setBulkRole(e.target.value)} style={{ height: 28, fontSize: 12 }}>
              <option value="viewer">Agent</option>
              <option value="evaluator">Evaluator</option>
              <option value="admin">Admin</option>
              {profile.role === 'owner' && <option value="owner">Owner</option>}
            </select>
            <button className="btn btn-primary btn-sm" onClick={applyBulkRole}>Apply</button>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text-secondary)' }}>Governance</span>
            <select className="select select-sm" value={bulkWs}
              onChange={e => { setBulkWs(e.target.value); setBulkHub(''); setBulkQueue('') }}
              style={{ height: 28, fontSize: 12 }}>
              <option value="">Workspace…</option>
              {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {bulkWs && (
              <select className="select select-sm" value={bulkHub}
                onChange={e => { setBulkHub(e.target.value); setBulkQueue('') }}
                style={{ height: 28, fontSize: 12 }}>
                <option value="">Hub…</option>
                {bulkHubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}
            {bulkHub && (
              <select className="select select-sm" value={bulkQueue}
                onChange={e => setBulkQueue(e.target.value)}
                style={{ height: 28, fontSize: 12 }}>
                <option value="">Queue…</option>
                {bulkQueues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
            )}
            {bulkQueue && (
              <button className="btn btn-primary btn-sm" onClick={applyBulkQueue}>Assign</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={clearSelected}>Clear</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 28px 1fr 1fr 90px 1fr 28px',
          gap: 12, alignItems: 'center', padding: '0 16px',
          fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <div />
          <div>Name / Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Governance</div>
          <div />
        </div>

        {filtered.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: 13 }}>
            No users match your search.
          </div>
        )}

        {filtered.map(u => {
          const isOnline   = onlineIds.has(u.id)
          const isExpanded = expanded === u.id
          const queues     = userQueues[u.id] || []
          return (
            <div key={u.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '32px 28px 1fr 1fr 90px 1fr 28px',
                gap: 12, alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
                borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
                onClick={() => setExpanded(isExpanded ? null : u.id)}>
                <div onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} style={{ cursor: 'pointer' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: isOnline ? '#22c55e' : '#64748b',
                    boxShadow: isOnline ? '0 0 6px #22c55e99' : 'none' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{u.email}</div>
                </div>
                <div><span className={`badge badge-${u.role}`}>{u.role === 'viewer' ? 'Agent' : u.role}</span></div>
                <div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    backgroundColor: u.active ? '#22c55e22' : '#ef444422',
                    color: u.active ? '#22c55e' : '#ef4444' }}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {queues.length === 0
                    ? <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No queues</span>
                    : queues.map(q => (
                      <span key={q.queue_id} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                        backgroundColor: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44', whiteSpace: 'nowrap' }}>
                        {q.workspace_name} › {q.hub_name} › {q.queue_name}
                      </span>
                    ))
                  }
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                  {isExpanded ? '▲' : '▼'}
                </div>
              </div>

              {isExpanded && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: 'var(--bg)' }}>
                  <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Account</div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Role</label>
                      {canChangeRole(u) ? (
                        <select className="select select-sm" value={u.role}
                          onChange={e => changeRole(u.id, e.target.value)} style={{ width: '100%', maxWidth: 200 }}>
                          <option value="viewer">Viewer</option>
                          <option value="evaluator">Evaluator</option>
                          <option value="admin">Admin</option>
                          {profile.role === 'owner' && <option value="owner">Owner</option>}
                        </select>
                      ) : (
                        <span className={`badge badge-${u.role}`}>{u.role === 'viewer' ? 'Agent' : u.role}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                      {canChangeRole(u) ? (
                        <>
                          <button className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                            style={{ minWidth: 160 }} onClick={() => toggleActive(u)}>
                            {u.active ? 'Deactivate Account' : 'Activate Account'}
                          </button>
                          <button className="btn btn-sm btn-ghost"
                            style={{ minWidth: 160, color: 'var(--accent)', border: '1px solid var(--accent)44' }}
                            onClick={() => sendResetLink(u.email)}>
                            Send Password Reset
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No actions available</span>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Governance</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                      {queues.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not assigned to any queue</span>
                        : queues.map(q => (
                          <div key={q.queue_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            backgroundColor: 'var(--surface)', borderRadius: 8, padding: '7px 12px', border: '1px solid var(--border)' }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 500 }}>{q.queue_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{q.workspace_name} › {q.hub_name}</div>
                            </div>
                            <button onClick={() => removeQueueAssignment(u.id, q.queue_id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
                              title="Remove assignment">×</button>
                          </div>
                        ))
                      }
                    </div>
                    {assigning === u.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select className="select select-sm" value={assignWs}
                          onChange={e => { setAssignWs(e.target.value); setAssignHub(''); setAssignQueue('') }}>
                          <option value="">Select workspace…</option>
                          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        {assignWs && (
                          <select className="select select-sm" value={assignHub}
                            onChange={e => { setAssignHub(e.target.value); setAssignQueue('') }}>
                            <option value="">Select hub…</option>
                            {filteredHubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                          </select>
                        )}
                        {assignHub && (
                          <select className="select select-sm" value={assignQueue} onChange={e => setAssignQueue(e.target.value)}>
                            <option value="">Select queue…</option>
                            {filteredQueues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                          </select>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => addQueueAssignment(u.id)}>Assign</button>
                          <button className="btn btn-ghost btn-sm" onClick={cancelAssign}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm"
                        style={{ fontSize: 12, color: 'var(--accent)', border: '1px solid var(--accent)44' }}
                        onClick={() => startAssign(u.id)}>
                        + Assign to Queue
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ─── Scorecard Assignment Panel ────────────────────────────────────────────────
function ScorecardAssignmentPanel({ flash }) {
  const [scorecards,  setScorecards]  = useState([])
  const [workspaces,  setWorkspaces]  = useState([])
  const [allHubs,     setAllHubs]     = useState([])
  const [allQueues,   setAllQueues]   = useState([])
  const [saving,      setSaving]      = useState(null) // scorecard id being saved

  // per-row cascade state: { [scorecardId]: { ws, hub, queue } }
  const [selections,  setSelections]  = useState({})

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: sc }, { data: ws }, { data: hubs }, { data: queues }] = await Promise.all([
      supabase.from('scorecards').select('id, name, type, queue_id').eq('is_published', true).order('name'),
      supabase.from('workspaces').select('id, name').order('name'),
      supabase.from('hubs').select('id, name, workspace_id').order('name'),
      supabase.from('queues').select('id, name, hub_id').order('name'),
    ])
    setScorecards(sc || [])
    setWorkspaces(ws || [])
    setAllHubs(hubs || [])
    setAllQueues(queues || [])

    // Pre-populate selections for already-assigned scorecards
    const init = {}
    for (const s of (sc || [])) {
      if (!s.queue_id) continue
      const q = (queues || []).find(x => x.id === s.queue_id)
      const h = q ? (hubs || []).find(x => x.id === q.hub_id) : null
      const w = h ? (ws || []).find(x => x.id === h.workspace_id) : null
      init[s.id] = { ws: w?.id || '', hub: h?.id || '', queue: q?.id || '' }
    }
    setSelections(init)
  }

  const getSel = (scId) => selections[scId] || { ws: '', hub: '', queue: '' }

  const setSel = (scId, key, val) => {
    setSelections(prev => {
      const cur = prev[scId] || { ws: '', hub: '', queue: '' }
      const next = { ...cur, [key]: val }
      if (key === 'ws')  { next.hub = ''; next.queue = '' }
      if (key === 'hub') { next.queue = '' }
      return { ...prev, [scId]: next }
    })
  }

  const saveAssignment = async (scId) => {
    const sel = getSel(scId)
    if (!sel.queue) return flash('Please select a queue before saving.', false)
    setSaving(scId)
    const { error } = await supabase.from('scorecards').update({ queue_id: sel.queue }).eq('id', scId)
    if (error) { flash(error.message, false); setSaving(null); return }
    await loadAll()
    setSaving(null)
    flash('Scorecard assigned to queue')
  }

  const clearAssignment = async (scId) => {
    setSaving(scId)
    const { error } = await supabase.from('scorecards').update({ queue_id: null }).eq('id', scId)
    if (error) { flash(error.message, false); setSaving(null); return }
    setSelections(prev => { const n = { ...prev }; delete n[scId]; return n })
    await loadAll()
    setSaving(null)
    flash('Assignment removed')
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>Scorecard Assignment</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          Assign each published scorecard to a workspace queue to control evaluator visibility
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {scorecards.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 13 }}>
            No published scorecards found.
          </div>
        )}

        {scorecards.map(sc => {
          const sel      = getSel(sc.id)
          const hubs     = allHubs.filter(h => h.workspace_id === sel.ws)
          const queues   = allQueues.filter(q => q.hub_id === sel.hub)
          const isSaving = saving === sc.id

          // Find current assignment path for display
          const assignedQueue = sc.queue_id ? allQueues.find(q => q.id === sc.queue_id) : null
          const assignedHub   = assignedQueue ? allHubs.find(h => h.id === assignedQueue.hub_id) : null
          const assignedWs    = assignedHub   ? workspaces.find(w => w.id === assignedHub.workspace_id) : null
          const assignedPath  = assignedWs
            ? `${assignedWs.name} › ${assignedHub.name} › ${assignedQueue.name}`
            : null

          return (
            <div key={sc.id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>

                {/* Scorecard info */}
                <div style={{ minWidth: 180, flex: '0 0 180px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{sc.name}</div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                      background: sc.type === 'dsat' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
                      color: sc.type === 'dsat' ? 'var(--danger)' : 'var(--accent)',
                      border: `1px solid ${sc.type === 'dsat' ? 'rgba(239,68,68,0.3)' : 'rgba(99,102,241,0.3)'}`,
                      textTransform: 'uppercase'
                    }}>{sc.type}</span>
                  </div>
                  {assignedPath && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)',
                      background: 'var(--bg)', borderRadius: 6, padding: '4px 8px',
                      border: '1px solid var(--border)' }}>
                      ✓ {assignedPath}
                    </div>
                  )}
                  {!assignedPath && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#f59e0b',
                      background: 'rgba(245,158,11,0.08)', borderRadius: 6, padding: '4px 8px',
                      border: '1px solid rgba(245,158,11,0.3)' }}>
                      ⚠ Not assigned
                    </div>
                  )}
                </div>

                {/* Cascade selectors */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                  <select className="select select-sm" value={sel.ws}
                    onChange={e => setSel(sc.id, 'ws', e.target.value)}
                    style={{ minWidth: 150, fontSize: 13 }}>
                    <option value="">Workspace…</option>
                    {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>

                  <select className="select select-sm" value={sel.hub}
                    onChange={e => setSel(sc.id, 'hub', e.target.value)}
                    disabled={!sel.ws}
                    style={{ minWidth: 150, fontSize: 13, opacity: sel.ws ? 1 : 0.5 }}>
                    <option value="">Hub…</option>
                    {hubs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>

                  <select className="select select-sm" value={sel.queue}
                    onChange={e => setSel(sc.id, 'queue', e.target.value)}
                    disabled={!sel.hub}
                    style={{ minWidth: 150, fontSize: 13, opacity: sel.hub ? 1 : 0.5 }}>
                    <option value="">Queue…</option>
                    {queues.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                  </select>

                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!sel.queue || isSaving}
                    onClick={() => saveAssignment(sc.id)}
                    style={{ opacity: sel.queue ? 1 : 0.4 }}>
                    {isSaving ? 'Saving…' : 'Assign'}
                  </button>

                  {assignedPath && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', fontSize: 12 }}
                      disabled={isSaving}
                      onClick={() => clearAssignment(sc.id)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Governance Tab ────────────────────────────────────────────────────────────
function GovernanceTab({ flash }) {
  const [workspaces, setWorkspaces] = useState([])
  const [expanded,   setExpanded]   = useState({})
  const [expandedH,  setExpandedH]  = useState({})
  const [adding,     setAdding]     = useState(null)
  const [addName,    setAddName]    = useState('')
  const [editing,    setEditing]    = useState(null)
  const [editName,   setEditName]   = useState('')
  const [confirm,    setConfirm]    = useState(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const { data: ws } = await supabase.from('workspaces').select('*, hubs(*, queues(*))').order('position')
    setWorkspaces(ws || [])
  }

  const ask = (message, onYes) => setConfirm({ message, onYes })
  const closeConfirm = () => setConfirm(null)

  const toggleWs    = (ws)  => ask(ws.is_active  ? `Deactivate "${ws.name}" workspace?`  : `Activate "${ws.name}" workspace?`,  async () => { closeConfirm(); await supabase.from('workspaces').update({ is_active: !ws.is_active  }).eq('id', ws.id);  await loadAll(); flash(`Workspace ${ws.is_active  ? 'deactivated' : 'activated'}`) })
  const toggleHub   = (hub) => ask(hub.is_active ? `Deactivate "${hub.name}" hub?`        : `Activate "${hub.name}" hub?`,        async () => { closeConfirm(); await supabase.from('hubs').update({ is_active: !hub.is_active }).eq('id', hub.id); await loadAll(); flash(`Hub ${hub.is_active ? 'deactivated' : 'activated'}`) })
  const toggleQueue = (q)   => ask(q.is_active   ? `Deactivate "${q.name}" queue?`        : `Activate "${q.name}" queue?`,        async () => { closeConfirm(); await supabase.from('queues').update({ is_active: !q.is_active   }).eq('id', q.id);   await loadAll(); flash(`Queue ${q.is_active   ? 'deactivated' : 'activated'}`) })
  const deleteWs    = (ws)  => ask(`Permanently delete "${ws.name}"? All hubs and queues inside will also be deleted.`,  async () => { closeConfirm(); await supabase.from('workspaces').delete().eq('id', ws.id);  await loadAll(); flash('Workspace deleted') })
  const deleteHub   = (hub) => ask(`Permanently delete "${hub.name}"? All queues inside will also be deleted.`,          async () => { closeConfirm(); await supabase.from('hubs').delete().eq('id', hub.id); await loadAll(); flash('Hub deleted') })
  const deleteQueue = (q)   => ask(`Permanently delete "${q.name}"? This cannot be undone.`,                             async () => { closeConfirm(); await supabase.from('queues').delete().eq('id', q.id);   await loadAll(); flash('Queue deleted') })

  const startAdd   = (type, parentId = null) => { setAdding({ type, parentId }); setAddName('') }
  const cancelAdd  = () => { setAdding(null); setAddName('') }
  const startEdit  = (id, level, name) => { setEditing({ id, level }); setEditName(name) }
  const cancelEdit = () => { setEditing(null); setEditName('') }

  const confirmAdd = async () => {
    const name = addName.trim()
    if (!name) return flash('Name is required.', false)
    if (adding.type === 'workspace') {
      const { error } = await supabase.from('workspaces').insert({ name, is_active: true, position: workspaces.length })
      if (error) return flash(error.message, false)
    } else if (adding.type === 'hub') {
      const ws = workspaces.find(w => w.id === adding.parentId)
      const { error } = await supabase.from('hubs').insert({ name, workspace_id: adding.parentId, is_active: true, position: ws?.hubs?.length || 0 })
      if (error) return flash(error.message, false)
    } else {
      let hubLen = 0
      for (const ws of workspaces) { const hub = ws.hubs?.find(h => h.id === adding.parentId); if (hub) { hubLen = hub.queues?.length || 0; break } }
      const { error } = await supabase.from('queues').insert({ name, hub_id: adding.parentId, is_active: true, position: hubLen })
      if (error) return flash(error.message, false)
    }
    cancelAdd(); await loadAll(); flash('Created successfully')
  }

  const confirmEdit = async () => {
    const name = editName.trim()
    if (!name) return flash('Name is required.', false)
    const table = editing.level === 'workspace' ? 'workspaces' : editing.level === 'hub' ? 'hubs' : 'queues'
    const { error } = await supabase.from(table).update({ name }).eq('id', editing.id)
    if (error) return flash(error.message, false)
    cancelEdit(); await loadAll(); flash('Renamed successfully')
  }

  const isAdding  = (type, parentId) => adding?.type === type && adding?.parentId === parentId
  const isEditing = (id) => editing?.id === id

  const AddInput = ({ placeholder }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={addName} onChange={e => setAddName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') cancelAdd() }} />
      <button className="btn btn-primary btn-sm" onClick={confirmAdd}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={cancelAdd}>Cancel</button>
    </div>
  )

  const EditInput = ({ placeholder }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={editName} onChange={e => setEditName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit() }} />
      <button className="btn btn-primary btn-sm" onClick={confirmEdit}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
    </div>
  )

  const [govPanel, setGovPanel] = useState('structure')

  return (
    <div>
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={closeConfirm} />}

      {/* Sub-panel switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'structure', label: 'Structure' },
          { key: 'scorecards', label: 'Scorecard Assignment' },
        ].map(p => (
          <button key={p.key} onClick={() => setGovPanel(p.key)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: govPanel === p.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: govPanel === p.key ? 'var(--accent)' : 'var(--text-secondary)',
              marginBottom: -1, transition: 'color .15s'
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {govPanel === 'scorecards' && <ScorecardAssignmentPanel flash={flash} />}

      {govPanel === 'structure' && (
      <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Workspace Structure</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Manage workspaces, hubs, and queues</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => startAdd('workspace')}>+ Add Workspace</button>
      </div>

      {isAdding('workspace', null) && (
        <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New Workspace</div>
          <AddInput placeholder="e.g. Concentrix" />
        </div>
      )}

      {workspaces.length === 0 && !adding && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>No workspaces yet.</div>
      )}

      {workspaces.map(ws => {
        const wsExpanded = expanded[ws.id] ?? true
        const hubs = ws.hubs || []
        return (
          <div key={ws.id} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
              borderBottom: wsExpanded && (hubs.length > 0 || isAdding('hub', ws.id)) ? '1px solid var(--border)' : 'none',
              backgroundColor: 'var(--surface)' }}>
              <button onClick={() => setExpanded(e => ({ ...e, [ws.id]: !wsExpanded }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', fontSize: 13, width: 20, flexShrink: 0 }}>
                {wsExpanded ? '▾' : '▸'}
              </button>
              {isEditing(ws.id) ? <div style={{ flex: 1 }}><EditInput placeholder="Workspace name" /></div> : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</span>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                    backgroundColor: ws.is_active ? '#22c55e22' : '#64748b22', color: ws.is_active ? '#22c55e' : '#94a3b8' }}>
                    {ws.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              )}
              {!isEditing(ws.id) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startAdd('hub', ws.id)}>+ Hub</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ws.id, 'workspace', ws.name)}>Rename</button>
                  <button className={`btn btn-sm ${ws.is_active ? 'btn-danger' : 'btn-success'}`} style={{ fontSize: 12 }} onClick={() => toggleWs(ws)}>{ws.is_active ? 'Deactivate' : 'Activate'}</button>
                  {!ws.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteWs(ws)}>Delete</button>}
                </div>
              )}
            </div>
            {wsExpanded && (
              <div style={{ backgroundColor: 'var(--bg)' }}>
                {isAdding('hub', ws.id) && (
                  <div style={{ padding: '10px 16px 10px 40px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>New Hub</div>
                    <AddInput placeholder="e.g. Concentrix Romania" />
                  </div>
                )}
                {hubs.map((hub, hi) => {
                  const hubExpanded = expandedH[hub.id] ?? true
                  const queues = hub.queues || []
                  const isLast = hi === hubs.length - 1
                  return (
                    <div key={hub.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 40px',
                        borderBottom: (hubExpanded && queues.length > 0) || !isLast || isAdding('queue', hub.id) ? '1px solid var(--border)' : 'none' }}>
                        <button onClick={() => setExpandedH(e => ({ ...e, [hub.id]: !hubExpanded }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', fontSize: 12, width: 16, flexShrink: 0 }}>
                          {hubExpanded ? '▾' : '▸'}
                        </button>
                        {isEditing(hub.id) ? <div style={{ flex: 1 }}><EditInput placeholder="Hub name" /></div> : (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{hub.name}</span>
                            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                              backgroundColor: hub.is_active ? '#22c55e22' : '#64748b22', color: hub.is_active ? '#22c55e' : '#94a3b8' }}>
                              {hub.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        )}
                        {!isEditing(hub.id) && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd('queue', hub.id)}>+ Queue</button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(hub.id, 'hub', hub.name)}>Rename</button>
                            <button className={`btn btn-sm ${hub.is_active ? 'btn-danger' : 'btn-success'}`} style={{ fontSize: 12 }} onClick={() => toggleHub(hub)}>{hub.is_active ? 'Deactivate' : 'Activate'}</button>
                            {!hub.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteHub(hub)}>Delete</button>}
                          </div>
                        )}
                      </div>
                      {hubExpanded && (
                        <div>
                          {isAdding('queue', hub.id) && (
                            <div style={{ padding: '8px 16px 8px 64px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>New Queue</div>
                              <AddInput placeholder="e.g. Colombia Market" />
                            </div>
                          )}
                          {queues.map((q, qi) => (
                            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 64px',
                              borderBottom: qi < queues.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: 'var(--surface)' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: q.is_active ? '#22c55e' : '#64748b' }} />
                              {isEditing(q.id) ? <div style={{ flex: 1 }}><EditInput placeholder="Queue name" /></div> : (
                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{q.name}</span>
                              )}
                              {!isEditing(q.id) && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(q.id, 'queue', q.name)}>Rename</button>
                                  <button className={`btn btn-sm ${q.is_active ? 'btn-danger' : 'btn-success'}`} style={{ fontSize: 12 }} onClick={() => toggleQueue(q)}>{q.is_active ? 'Deactivate' : 'Activate'}</button>
                                  {!q.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteQueue(q)}>Delete</button>}
                                </div>
                              )}
                            </div>
                          ))}
                          {queues.length === 0 && !isAdding('queue', hub.id) && (
                            <div style={{ padding: '8px 16px 8px 64px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No queues yet</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {hubs.length === 0 && !isAdding('hub', ws.id) && (
                  <div style={{ padding: '10px 16px 10px 40px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No hubs yet</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
    </div>
      )}
  )
}

// ─── Sampling Tab ──────────────────────────────────────────────────────────────
function SamplingTab({ profile, flash }) {
  const [sampling, setSampling] = useState([])
  const [newSamp,  setNewSamp]  = useState({ queueName: '', channel: 'all', targetCount: 10, period: 'weekly' })

  useEffect(() => { loadSampling() }, [])

  const loadSampling = async () => {
    const { data } = await supabase.from('sampling_requirements').select('*').order('queue_name')
    setSampling(data || [])
  }

  const addSampling = async () => {
    if (!newSamp.queueName) return flash('Queue name is required.', false)
    const { error } = await supabase.from('sampling_requirements').upsert({
      queue_name: newSamp.queueName, channel: newSamp.channel,
      target_count: newSamp.targetCount, period: newSamp.period,
      updated_by: profile.id, updated_at: new Date().toISOString()
    }, { onConflict: 'queue_name,channel' })
    if (error) return flash(error.message, false)
    await loadSampling(); flash('Sampling requirement saved')
    setNewSamp({ queueName: '', channel: 'all', targetCount: 10, period: 'weekly' })
  }

  const deleteSampling = async (id) => {
    await supabase.from('sampling_requirements').delete().eq('id', id)
    await loadSampling(); flash('Requirement removed')
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Add / Update Requirement</div>
        <div className="form-row">
          <div className="form-field">
            <label>Queue Name</label>
            <input className="input" placeholder="e.g. Payments Support" value={newSamp.queueName}
              onChange={e => setNewSamp(s => ({ ...s, queueName: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Channel</label>
            <select className="select" value={newSamp.channel} onChange={e => setNewSamp(s => ({ ...s, channel: e.target.value }))}>
              <option value="all">All</option><option value="chat">Chat</option><option value="email">Email</option>
            </select>
          </div>
          <div className="form-field">
            <label>Target Count</label>
            <input type="number" className="input" min={1} value={newSamp.targetCount}
              onChange={e => setNewSamp(s => ({ ...s, targetCount: parseInt(e.target.value) }))} />
          </div>
          <div className="form-field">
            <label>Period</label>
            <select className="select" value={newSamp.period} onChange={e => setNewSamp(s => ({ ...s, period: e.target.value }))}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="form-field form-field-btn">
            <label>&nbsp;</label>
            <button className="btn btn-primary" onClick={addSampling}>Save</button>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Queue</th><th>Channel</th><th>Target</th><th>Period</th><th>Updated At</th><th></th></tr></thead>
          <tbody>
            {sampling.length === 0 && <tr><td colSpan="6" className="empty-row">No sampling requirements set.</td></tr>}
            {sampling.map(sr => (
              <tr key={sr.id}>
                <td>{sr.queue_name}</td>
                <td><span className="badge badge-channel">{sr.channel}</span></td>
                <td>{sr.target_count}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{sr.period}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(sr.updated_at).toLocaleDateString()}</td>
                <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteSampling(sr.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('users')
  const [msg, setMsg] = useState(null)

  const flash = (text, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000) }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Panel</h1>
          <p className="page-sub">Manage users, roles, sampling requirements and governance</p>
        </div>
      </div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}
      <div className="tabs">
        <button className={`tab ${tab === 'users'      ? 'active' : ''}`} onClick={() => setTab('users')}>User Management</button>
        <button className={`tab ${tab === 'sampling'   ? 'active' : ''}`} onClick={() => setTab('sampling')}>Sampling Requirements</button>
        <button className={`tab ${tab === 'governance' ? 'active' : ''}`} onClick={() => setTab('governance')}>Governance</button>
      </div>
      {tab === 'users'      && <UsersTab      profile={profile} flash={flash} />}
      {tab === 'sampling'   && <SamplingTab   profile={profile} flash={flash} />}
      {tab === 'governance' && <GovernanceTab flash={flash} />}
    </div>
  )
}
