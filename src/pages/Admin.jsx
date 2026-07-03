import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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

  const [roleFilter,   setRoleFilter]   = useState('all')
  const [govFilter,    setGovFilter]    = useState('all')
  const [bpoHubFilter, setBpoHubFilter] = useState('all')
  const [marketFilter, setMarketFilter] = useState('all')

  const bpoHubOptions = useMemo(() =>
    [...new Set(users.map(u => u.user_bpo_hub).filter(v => v && v.trim()))].sort()
  , [users])
  const marketOptions = useMemo(() =>
    [...new Set(users.map(u => u.user_market).filter(v => v && v.trim()))].sort()
  , [users])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      const hasQueue = (userQueues[u.id] || []).length > 0
      if (govFilter === 'assigned'   && !hasQueue) return false
      if (govFilter === 'unassigned' &&  hasQueue) return false
      if (bpoHubFilter !== 'all' && (u.user_bpo_hub || '') !== bpoHubFilter) return false
      if (marketFilter !== 'all' && (u.user_market  || '') !== marketFilter) return false
      return true
    })
  }, [users, search, roleFilter, govFilter, userQueues, bpoHubFilter, marketFilter])

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
        <select className="select" style={{ height: 36, fontSize: 13, minWidth: 150 }}
          value={bpoHubFilter} onChange={e => setBpoHubFilter(e.target.value)}>
          <option value="all">All BPO - Hubs</option>
          {bpoHubOptions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="select" style={{ height: 36, fontSize: 13, minWidth: 140 }}
          value={marketFilter} onChange={e => setMarketFilter(e.target.value)}>
          <option value="all">All Markets</option>
          {marketOptions.map(v => <option key={v} value={v}>{v}</option>)}
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
        <div style={{ display: 'grid', gridTemplateColumns: '28px 20px 1.2fr 80px 70px 90px 90px 1fr 20px',
          gap: 8, alignItems: 'center', padding: '0 12px',
          fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <div />
          <div>Name / Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>BPO - Hub</div>
          <div>Market</div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '28px 20px 1.2fr 80px 70px 90px 90px 1fr 20px',
                gap: 8, alignItems: 'center', padding: '10px 12px', cursor: 'pointer',
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
                <div style={{ fontSize: 12, color: u.user_bpo_hub ? 'var(--text-primary)' : 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.user_bpo_hub || '—'}
                </div>
                <div style={{ fontSize: 12, color: u.user_market ? 'var(--text-primary)' : 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.user_market || '—'}
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
                          <option value="viewer">Agent</option>
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


// ─── Governance Tab ────────────────────────────────────────────────────────────
function GovernanceTab({ profile, flash }) {
  const [workspaces, setWorkspaces] = useState([])
  const [divisions,  setDivisions]  = useState([])   // read-only, from Dashboard
  const [scorecards, setScorecards] = useState([])   // published scorecards, for the queue picker
  const [scMarkets,  setScMarkets]  = useState({})   // scorecardId -> [market option strings]
  const [expanded,   setExpanded]   = useState({})
  const [expandedH,  setExpandedH]  = useState({})
  const [expandedS,  setExpandedS]  = useState({})   // queue.id -> bool : mapping panel open
  const [expandedDiv,setExpandedDiv]= useState({})   // division id (or '__none__') -> bool
  const [adding,     setAdding]     = useState(null)
  const [addName,    setAddName]    = useState('')
  const [editing,    setEditing]    = useState(null)
  const [editName,   setEditName]   = useState('')
  const [confirm,    setConfirm]    = useState(null)
  const [savingQueue,setSavingQueue]= useState(null)  // queue.id currently saving mapping

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: ws }, { data: divs }, { data: sc }] = await Promise.all([
      supabase.from('workspaces').select('*, hubs(*, queues(*))').order('position'),
      supabase.from('divisions').select('id, name, is_active, position').order('position'),
      supabase.from('scorecards').select('id, name, type, is_published').eq('is_published', true).order('name'),
    ])
    setWorkspaces(ws || [])
    setDivisions(divs || [])
    setScorecards(sc || [])
    // Pull each scorecard's builder-defined Market option list.
    const scIds = (sc || []).map(x => x.id)
    if (scIds.length) {
      const { data: mf } = await supabase
        .from('scorecard_metadata_fields')
        .select('scorecard_id, options')
        .eq('label', 'Market')
        .in('scorecard_id', scIds)
      const mm = {}
      ;(mf || []).forEach(row => { mm[row.scorecard_id] = (row.options || []).filter(Boolean) })
      setScMarkets(mm)
    } else {
      setScMarkets({})
    }
  }

  const scorecardById = (id) => scorecards.find(s => s.id === id)

  const ask = (message, onYes) => setConfirm({ message, onYes })
  const closeConfirm = () => setConfirm(null)

  const toggleWs    = (ws)  => ask(ws.is_active  ? `Deactivate "${ws.name}" workspace?`  : `Activate "${ws.name}" workspace?`,  async () => { closeConfirm(); await supabase.from('workspaces').update({ is_active: !ws.is_active  }).eq('id', ws.id);  await loadAll(); flash(`Workspace ${ws.is_active  ? 'deactivated' : 'activated'}`) })
  const toggleHub   = (hub) => ask(hub.is_active ? `Deactivate "${hub.name}" hub?`        : `Activate "${hub.name}" hub?`,        async () => { closeConfirm(); await supabase.from('hubs').update({ is_active: !hub.is_active }).eq('id', hub.id); await loadAll(); flash(`Hub ${hub.is_active ? 'deactivated' : 'activated'}`) })
  const toggleQueue = (q)   => ask(q.is_active   ? `Deactivate "${q.name}" queue?`        : `Activate "${q.name}" queue?`,        async () => { closeConfirm(); await supabase.from('queues').update({ is_active: !q.is_active   }).eq('id', q.id);   await loadAll(); flash(`Queue ${q.is_active   ? 'deactivated' : 'activated'}`) })
  const deleteWs    = (ws)  => ask(`Permanently delete "${ws.name}"? All hubs and queues inside will also be deleted.`,  async () => { closeConfirm(); await supabase.from('workspaces').delete().eq('id', ws.id);  await loadAll(); flash('Workspace deleted') })
  const deleteHub   = (hub) => ask(`Permanently delete "${hub.name}"? All queues inside will also be deleted.`,          async () => { closeConfirm(); await supabase.from('hubs').delete().eq('id', hub.id); await loadAll(); flash('Hub deleted') })
  const deleteQueue = (q)   => ask(`Permanently delete "${q.name}"? This cannot be undone.`,                             async () => { closeConfirm(); await supabase.from('queues').delete().eq('id', q.id);   await loadAll(); flash('Queue deleted') })

  // Assign a workspace to a division (or clear it). Read-only divisions; this only sets the FK.
  const setWorkspaceDivision = async (wsId, divisionId) => {
    const { error } = await supabase.from('workspaces').update({ division_id: divisionId || null }).eq('id', wsId)
    if (error) return flash(error.message, false)
    await loadAll()
    flash(divisionId ? 'Workspace moved to division' : 'Workspace removed from division')
  }

  const startAdd   = (type, parentId = null) => { setAdding({ type, parentId }); setAddName('') }
  const cancelAdd  = () => { setAdding(null); setAddName('') }
  const startEdit  = (id, level, name) => { setEditing({ id, level }); setEditName(name) }
  const cancelEdit = () => { setEditing(null); setEditName('') }

  const confirmAdd = async () => {
    const name = addName.trim()
    if (!name) return flash('Name is required.', false)
    if (adding.type === 'workspace') {
      const { error } = await supabase.from('workspaces').insert({ name, is_active: true, position: workspaces.length, division_id: adding.parentId || null })
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

  // ── Mapping panel for a single QUEUE ────────────────────────────────────────
  // A queue's BPO-Hub is its parent hub (fixed). Here you pick: scorecard + market.
  // Saving stamps scorecard_id, market_value, hub_id (parent), workspace_id (parent's ws).
  const QueueMappingPanel = ({ queue, hub, ws }) => {
    const [scId, setScId]     = useState(queue.scorecard_id || '')
    const [market, setMarket] = useState(queue.market_value || '')

    const [samplingList, setSamplingList] = useState([])
    const [newSamp, setNewSamp] = useState({ channel: 'all', targetCount: 10, period: 'weekly' })
    const [savingSamp, setSavingSamp] = useState(false)

    useEffect(() => { loadSampling() }, [])

    const loadSampling = async () => {
      const { data } = await supabase.from('sampling_requirements').select('*').eq('queue_name', queue.name).order('channel')
      setSamplingList(data || [])
    }

    const addSampling = async () => {
      setSavingSamp(true)
      const { error } = await supabase.from('sampling_requirements').upsert({
        queue_name: queue.name, channel: newSamp.channel,
        target_count: newSamp.targetCount, period: newSamp.period,
        updated_by: profile?.id, updated_at: new Date().toISOString()
      }, { onConflict: 'queue_name,channel' })
      setSavingSamp(false)
      if (error) return flash(error.message, false)
      await loadSampling()
      flash('Sampling requirement saved')
      setNewSamp({ channel: 'all', targetCount: 10, period: 'weekly' })
    }

    const deleteSampling = async (id) => {
      await supabase.from('sampling_requirements').delete().eq('id', id)
      await loadSampling()
      flash('Requirement removed')
    }

    // Market options come live from the selected scorecard's builder list.
    const marketOptions = (scMarkets[scId] || [])
    // If the currently-saved market isn't in the new scorecard's list, surface it
    // so it's still visible (and re-selectable) rather than silently dropped.
    const optionsToShow = market && !marketOptions.includes(market)
      ? [market, ...marketOptions]
      : marketOptions

    const effectiveMarket = market

    const save = async () => {
      if (!scId)            return flash('Select a scorecard for this queue.', false)
      if (!effectiveMarket) return flash('Select or enter a market for this queue.', false)
      setSavingQueue(queue.id)
      const { error } = await supabase.from('queues').update({
        scorecard_id: scId,
        market_value: effectiveMarket,
        hub_id: hub.id,
        workspace_id: ws.id,
      }).eq('id', queue.id)
      setSavingQueue(null)
      if (error) {
        // The unique (scorecard_id, hub_id, market_value) index is the backstop:
        // another queue under this hub already uses this scorecard + market.
        if (error.code === '23505') {
          return flash('Another queue under this hub already uses that scorecard + market combination.', false)
        }
        return flash(error.message, false)
      }
      await loadAll()
      flash('Queue mapping saved')
    }

    const clearMapping = async () => {
      setSavingQueue(queue.id)
      const { error } = await supabase.from('queues').update({
        scorecard_id: null, market_value: null, workspace_id: null,
      }).eq('id', queue.id)
      setSavingQueue(null)
      if (error) return flash(error.message, false)
      await loadAll()
      flash('Queue mapping cleared')
    }

    return (
      <div style={{ padding: '14px 16px 16px 88px', backgroundColor: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Queue Settings
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* BPO - Hub : fixed = parent hub */}
          <div style={{ minWidth: 180 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>BPO - Hub</label>
            <div style={{ fontSize: 13, fontWeight: 500, padding: '7px 0' }}>
              {hub.name}
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8, fontStyle: 'italic' }}>(from parent hub)</span>
            </div>
          </div>

          {/* Scorecard : single select */}
          <div style={{ minWidth: 220 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Scorecard</label>
            <select className="select select-sm" value={scId}
              onChange={e => {
                const next = e.target.value
                setScId(next)
                const opts = scMarkets[next] || []
                if (market && !opts.includes(market)) setMarket('')
              }} style={{ width: '100%', maxWidth: 240 }}>
              <option value="">Select scorecard…</option>
              {scorecards.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.type === 'quality' ? 'Quality' : 'DSAT'})</option>
              ))}
            </select>
          </div>

          {/* Market : single select, driven live by the selected scorecard's builder list */}
          <div style={{ minWidth: 220 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Market</label>
            {!scId ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '7px 0' }}>
                Select a scorecard first.
              </div>
            ) : marketOptions.length === 0 && !market ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '7px 0', maxWidth: 220 }}>
                This scorecard has no markets defined. Add them in the scorecard builder's Market field.
              </div>
            ) : (
              <select className="select select-sm" value={market}
                onChange={e => setMarket(e.target.value)} style={{ maxWidth: 200 }}>
                <option value="">Select market…</option>
                {optionsToShow.map(m => (
                  <option key={m} value={m}>{m}{marketOptions.includes(m) ? '' : ' (not in scorecard)'}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={savingQueue === queue.id}>
            {savingQueue === queue.id ? 'Saving…' : 'Save Mapping'}
          </button>
          {queue.scorecard_id && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--danger)' }}
              onClick={clearMapping} disabled={savingQueue === queue.id}>Clear</button>
          )}
          {queue.scorecard_id && queue.market_value && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Currently: {scorecardById(queue.scorecard_id)?.name || 'Unknown scorecard'} › {queue.market_value}
            </span>
          )}
        </div>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Sampling Settings
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 220 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sampling Configuration</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Not configured yet.</div>
            </div>
            <div style={{ minWidth: 320 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Sampling Requirement</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Channel</label>
                  <select className="select select-sm" value={newSamp.channel}
                    onChange={e => setNewSamp(s => ({ ...s, channel: e.target.value }))}>
                    <option value="all">All</option>
                    <option value="chat">Chat</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Target Count</label>
                  <input type="number" className="input" style={{ width: 90, height: 30 }} min={1} value={newSamp.targetCount}
                    onChange={e => setNewSamp(s => ({ ...s, targetCount: parseInt(e.target.value) }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Period</label>
                  <select className="select select-sm" value={newSamp.period}
                    onChange={e => setNewSamp(s => ({ ...s, period: e.target.value }))}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <button className="btn btn-primary btn-sm" onClick={addSampling} disabled={savingSamp}>
                  {savingSamp ? 'Saving…' : 'Save'}
                </button>
              </div>
              {samplingList.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>No sampling requirements set for this queue.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {samplingList.map(sr => (
                    <div key={sr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: 'var(--surface)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--border)', fontSize: 12 }}>
                      <span><strong>{sr.channel}</strong> · {sr.target_count} / {sr.period}</span>
                      <button onClick={() => deleteSampling(sr.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 12 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── A single workspace card ─────────────────────────────────────────────────
  const WorkspaceCard = ({ ws }) => {
    const wsExpanded = expanded[ws.id] ?? true
    const hubs = ws.hubs || []
    return (
      <div className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
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
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="select select-sm" value={ws.division_id || ''}
                onChange={e => setWorkspaceDivision(ws.id, e.target.value)}
                title="Division" style={{ height: 28, fontSize: 12, maxWidth: 170 }}>
                <option value="">No division</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (inactive)'}</option>
                ))}
              </select>
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
                          <AddInput placeholder="e.g. DSAT · Romania" />
                        </div>
                      )}
                      {queues.map((q, qi) => {
                        const mapOpen = expandedS[q.id] ?? false
                        const mapped = q.scorecard_id && q.market_value
                        return (
                          <div key={q.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px 8px 64px',
                              borderBottom: mapOpen || qi < queues.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: 'var(--surface)' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: q.is_active ? '#22c55e' : '#64748b' }} />
                              {isEditing(q.id) ? <div style={{ flex: 1 }}><EditInput placeholder="Queue name" /></div> : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{q.name}</span>
                                  {mapped && (
                                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                      backgroundColor: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                                      {scorecardById(q.scorecard_id)?.name || 'Scorecard'} · {q.market_value}
                                    </span>
                                  )}
                                </div>
                              )}
                              {!isEditing(q.id) && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: mapOpen ? 'var(--accent)' : undefined, border: mapOpen ? '1px solid var(--accent)44' : undefined }}
                                    onClick={() => setExpandedS(e => ({ ...e, [q.id]: !mapOpen }))}>⚙ Queue Settings</button>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(q.id, 'queue', q.name)}>Rename</button>
                                  <button className={`btn btn-sm ${q.is_active ? 'btn-danger' : 'btn-success'}`} style={{ fontSize: 12 }} onClick={() => toggleQueue(q)}>{q.is_active ? 'Deactivate' : 'Activate'}</button>
                                  {!q.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteQueue(q)}>Delete</button>}
                                </div>
                              )}
                            </div>
                            {mapOpen && <QueueMappingPanel queue={q} hub={hub} ws={ws} />}
                          </div>
                        )
                      })}
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
  }

  const expandAllDivisions = () => {
    const next = { __none__: true }
    divisions.forEach(d => { next[d.id] = true })
    setExpandedDiv(next)
  }
  const collapseAllDivisions = () => {
    const next = { __none__: false }
    divisions.forEach(d => { next[d.id] = false })
    setExpandedDiv(next)
  }

  const wsByDivision = (divId) => workspaces.filter(w => (w.division_id || null) === divId)
  const unassignedWs = workspaces.filter(w => !w.division_id)

  return (
    <div>
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={closeConfirm} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Workspace Structure</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Grouped by division · manage workspaces, hubs, and queues · map each queue to a scorecard + market</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={expandAllDivisions}>Expand all</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={collapseAllDivisions}>Collapse all</button>
          <button className="btn btn-primary btn-sm" onClick={() => startAdd('workspace')}>+ Add Workspace</button>
        </div>
      </div>

      {isAdding('workspace', null) && (
        <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New Workspace</div>
          <AddInput placeholder="e.g. Concentrix" />
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
            You can assign it to a division after creating it.
          </div>
        </div>
      )}

      {workspaces.length === 0 && !adding && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>No workspaces yet.</div>
      )}

      {divisions.map(div => {
        const wsList = wsByDivision(div.id)
        const open = expandedDiv[div.id] ?? true
        return (
          <div key={div.id} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
              paddingBottom: 8, borderBottom: '2px solid var(--border)' }}>
              <button onClick={() => setExpandedDiv(e => ({ ...e, [div.id]: !open }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', fontSize: 14, width: 18, flexShrink: 0 }}>
                {open ? '▾' : '▸'}
              </button>
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.02em' }}>{div.name}</span>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                backgroundColor: div.is_active ? '#22c55e22' : '#64748b22', color: div.is_active ? '#22c55e' : '#94a3b8' }}>
                {div.is_active ? 'Active' : 'Inactive'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                {wsList.length} workspace{wsList.length === 1 ? '' : 's'}
              </span>
            </div>
            {open && (
              wsList.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0 8px 28px' }}>No workspaces in this division.</div>
                : <div style={{ paddingLeft: 4 }}>{wsList.map(ws => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
            )}
          </div>
        )
      })}

      {unassignedWs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            paddingBottom: 8, borderBottom: '2px dashed var(--border)' }}>
            <button onClick={() => setExpandedDiv(e => ({ ...e, ['__none__']: !(e['__none__'] ?? true) }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', fontSize: 14, width: 18, flexShrink: 0 }}>
              {(expandedDiv['__none__'] ?? true) ? '▾' : '▸'}
            </button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>Unassigned</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
              {unassignedWs.length} workspace{unassignedWs.length === 1 ? '' : 's'} · pick a division to place
            </span>
          </div>
          {(expandedDiv['__none__'] ?? true) && (
            <div style={{ paddingLeft: 4 }}>{unassignedWs.map(ws => <WorkspaceCard key={ws.id} ws={ws} />)}</div>
          )}
        </div>
      )}
    </div>
  )
}



// ─── Scorecards Tab ────────────────────────────────────────────────────────────
const CORE_META_FIELDS = [
  { label: 'Ticket ID',          field_type: 'number',   is_required: true },
  { label: 'Communication Date', field_type: 'date',     is_required: true },
  { label: 'Market',             field_type: 'dropdown', is_required: true, options: [] },
  { label: 'BPO - Hub',          field_type: 'dropdown', is_required: true, options: [] },
  { label: "Agent's Email",      field_type: 'text',     is_required: true },
  { label: 'Channel',            field_type: 'dropdown', is_required: true, options: [] },
]
const DSAT_EXTRA_META_FIELDS = [
  { label: 'Category Level 1', field_type: 'dropdown', is_required: true, options: [] },
  { label: 'Category Level 2', field_type: 'dropdown', is_required: true, options: [] },
]
const STARTER_WIDGETS = {
  quality: [
    { widget_type: 'stat_card', title: 'Overall Quality Score', position: 0, config: { measure: 'avg_quality_score', date_field: 'submitted_at' } },
    { widget_type: 'stat_card', title: 'Total Evaluations', position: 1, config: { measure: 'eval_count', date_field: 'submitted_at' } },
    { widget_type: 'line_chart', title: 'Quality — Week over Week', position: 2, config: { date_field: 'submitted_at', bucket: 'week', series: ['avg_quality_score', 'eval_count'] } },
  ],
  dsat: [
    { widget_type: 'stat_card', title: 'Controllability Rate', position: 0, config: { measure: 'controllability_rate', date_field: 'communication_date' } },
    { widget_type: 'stat_card', title: 'Total DSATs Evaluated', position: 1, config: { measure: 'eval_count', date_field: 'communication_date' } },
    { widget_type: 'line_chart', title: 'Controllability — Week over Week', position: 2, config: { date_field: 'communication_date', bucket: 'week', series: ['controllability_rate', 'eval_count'] } },
  ],
}
const starterWidgetsForType = (type) => STARTER_WIDGETS[type] || STARTER_WIDGETS.quality
const seededFieldsForType = (type) => type === 'dsat' ? [...CORE_META_FIELDS, ...DSAT_EXTRA_META_FIELDS] : [...CORE_META_FIELDS]

function ScorecardsTab({ profile, flash }) {
  const navigate = useNavigate()
  const [scorecards, setScorecards] = useState([])
  const [divisions, setDivisions] = useState([])    // [{id,name,is_active}]
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newType, setNewType] = useState('quality')
  const [newThreshold, setNewThreshold] = useState(90)
  const [newDivision, setNewDivision] = useState('')   // division NAME (matches scorecards.division text column)
  const [confirm, setConfirm] = useState(null)

  const canEdit = ['admin', 'owner'].includes(profile?.role)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: sc }, { data: divs }] = await Promise.all([
      supabase.from('scorecards').select('*, users(name)').order('created_at', { ascending: false }),
      supabase.from('divisions').select('id, name, is_active, position').order('position'),
    ])
    setScorecards(sc || [])
    setDivisions(divs || [])
    setLoading(false)
  }

  const ask = (message, onYes) => setConfirm({ message, onYes })
  const closeConfirm = () => setConfirm(null)

  const createScorecard = async () => {
    if (!newName.trim()) return flash('Scorecard name is required.', false)
    if (!newDivision) return flash('Please choose a division. Every scorecard must belong to a division.', false)
    const { data, error } = await supabase
      .from('scorecards')
      .insert({
        name: newName.trim(), description: newDesc.trim(), type: newType,
        created_by: profile.id,
        division: newDivision,
        pass_threshold: newType === 'quality' ? Number(newThreshold) || 90 : null
      })
      .select().single()
    if (error) return flash(error.message, false)

    const seedFields = seededFieldsForType(newType).map((f, i) => ({
      scorecard_id: data.id, label: f.label, field_type: f.field_type,
      is_required: f.is_required, options: f.options ?? null, position: i + 1,
    }))
    await supabase.from('scorecard_metadata_fields').insert(seedFields)

    const starterWidgets = starterWidgetsForType(newType).map(w => ({
      scorecard_id: data.id, widget_type: w.widget_type, title: w.title, config: w.config, position: w.position,
    }))
    await supabase.from('dashboard_widgets').insert(starterWidgets)

    setCreating(false); setNewName(''); setNewDesc(''); setNewType('quality'); setNewThreshold(90); setNewDivision('')
    navigate(`/scorecards/${data.id}/edit`)
  }

  const deleteScorecard = (sc) => ask(
    `Delete "${sc.name}"? This cannot be undone.`,
    async () => { closeConfirm(); await supabase.from('scorecards').delete().eq('id', sc.id); await loadAll(); flash('Scorecard deleted') }
  )

  const published = scorecards.filter(s => s.is_published)
  const drafts    = scorecards.filter(s => !s.is_published)

  const TypeBadge = ({ type }) => (
    <span className={`badge ${type === 'quality' ? 'badge-admin' : 'badge-channel'}`}>
      {type === 'quality' ? 'Quality' : 'DSAT'}
    </span>
  )

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>

  const renderTable = (rows) => (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Division</th>
            <th>Description</th>
            <th>Created By</th>
            <th>Created At</th>
            <th>Last Modified</th>
            {canEdit && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={canEdit ? 8 : 7} className="empty-row">
              {rows === published ? 'No published scorecards.' : 'No draft scorecards.'}
            </td></tr>
          )}
          {rows.map(sc => (
            <tr key={sc.id}>
              <td style={{ fontWeight: 500 }}>{sc.name}</td>
              <td><TypeBadge type={sc.type} /></td>
              <td style={{ color: sc.division ? 'var(--text-primary)' : 'var(--danger)', fontSize: 13 }}>
                {sc.division || 'None'}
              </td>
              <td style={{ color: 'var(--text-secondary)' }}>{sc.description || '-'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{sc.users?.name || '-'}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{new Date(sc.created_at).toLocaleDateString()}</td>
              <td style={{ color: 'var(--text-secondary)' }}>{sc.updated_at ? new Date(sc.updated_at).toLocaleDateString() : '-'}</td>
              {canEdit && (
                <td>
                  <div className="action-group">
                    <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/scorecards/${sc.id}/edit`)}>Edit</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteScorecard(sc)}>Delete</button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const activeDivisions = divisions.filter(d => d.is_active)

  return (
    <div>
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={closeConfirm} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Scorecards</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Build and manage your evaluation scorecards · assign them to queues in the Governance tab
          </div>
        </div>
        {canEdit && !creating && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ New Scorecard</button>
        )}
      </div>

      {creating && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>New Scorecard</div>
          <div className="form-row">
            <div className="form-field">
              <label>Name</label>
              <input className="input" placeholder="e.g. Chat Quality Scorecard" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Division <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select className="select" value={newDivision} onChange={e => setNewDivision(e.target.value)}>
                <option value="">— Select a division —</option>
                {activeDivisions.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Description (optional)</label>
              <input className="input" placeholder="What is this scorecard for?" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select className="select" value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="quality">Quality Evaluation</option>
                <option value="dsat">DSAT</option>
              </select>
            </div>
            {newType === 'quality' && (
              <div className="form-field">
                <label>Pass Threshold (%)</label>
                <input type="number" className="input" min={0} max={100} value={newThreshold} onChange={e => setNewThreshold(e.target.value)} />
              </div>
            )}
            <div className="form-field form-field-btn">
              <label>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={createScorecard}>Create & Edit</button>
                <button className="btn btn-ghost" onClick={() => { setCreating(false); setNewDivision('') }}>Cancel</button>
              </div>
            </div>
          </div>
          {activeDivisions.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>
              No active divisions exist yet. Create one from the Dashboard before adding a scorecard.
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Published ({published.length})
      </div>
      <div style={{ marginBottom: 28 }}>
        {renderTable(published)}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Drafts ({drafts.length})
      </div>
      <div>
        {renderTable(drafts)}
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
          <h1>Control Room</h1>
          <p className="page-sub">Manage users, roles and governance</p>
        </div>
      </div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}
      <div className="tabs">
        <button className={`tab ${tab === 'users'      ? 'active' : ''}`} onClick={() => setTab('users')}>User Management</button>
        <button className={`tab ${tab === 'scorecards' ? 'active' : ''}`} onClick={() => setTab('scorecards')}>Scorecards</button>
        <button className={`tab ${tab === 'governance' ? 'active' : ''}`} onClick={() => setTab('governance')}>Governance</button>
      </div>
      {tab === 'users'      && <UsersTab      profile={profile} flash={flash} />}
      {tab === 'scorecards' && <ScorecardsTab profile={profile} flash={flash} />}
      {tab === 'governance' && <GovernanceTab profile={profile} flash={flash} />}
    </div>
  )
}
