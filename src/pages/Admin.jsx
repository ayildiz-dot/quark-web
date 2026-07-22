import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

// ─── Row Menu (kebab menu for rare/destructive actions) ────────────────────────
function RowMenu({ isActive, onToggleActive, onDelete, activeLabel = 'Deactivate', inactiveLabel = 'Activate', extraContent }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const itemStyle = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
    fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn btn-ghost btn-sm"
        style={{ padding: '4px 9px', fontSize: 15, lineHeight: 1, color: 'var(--text-secondary)' }}
        title="More actions">
        ⋮
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60, minWidth: 180,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}>
          {extraContent && (
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              {extraContent}
            </div>
          )}
          <button
            style={{ ...itemStyle, color: isActive ? 'var(--danger)' : 'var(--success)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => { setOpen(false); onToggleActive() }}>
            {isActive ? activeLabel : inactiveLabel}
          </button>
          {!isActive && onDelete && (
            <button
              style={{ ...itemStyle, color: 'var(--danger)', borderTop: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              onClick={() => { setOpen(false); onDelete() }}>
              Delete
            </button>
          )}
        </div>
      )}
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
  const [divisions,  setDivisions]  = useState([])
  const [allHubs,    setAllHubs]    = useState([])
  const [allQueues,  setAllQueues]  = useState([])
  const [userQueues, setUserQueues] = useState({})
  const [assigning,  setAssigning]  = useState(null)
  const [assignDiv,  setAssignDiv]  = useState('')
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
    const { data: ws }     = await supabase.from('workspaces').select('id, name, division_id').order('name')
    const { data: hubs }   = await supabase.from('hubs').select('id, name, workspace_id').order('name')
    const { data: queues } = await supabase.from('queues').select('id, name, hub_id').order('name')
    const { data: uq }     = await supabase.from('user_queues').select('user_id, queue_id')
    const { data: divs }   = await supabase.from('divisions').select('id, name').order('name')
    setDivisions(divs || [])
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

  const [bulkDiv,   setBulkDiv]   = useState('')
  const [bulkWs,    setBulkWs]    = useState('')
  const [bulkHub,   setBulkHub]   = useState('')
  const [bulkQueue, setBulkQueue] = useState('')
  const bulkWorkspaces = workspaces.filter(w => (w.division_id || '') === bulkDiv)
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
    u.active ? `This will deactivate ${u.name}'s account. They will no longer be able to log in.` : `This will reactivate ${u.name}'s account.`,
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

  const assignWorkspaces = workspaces.filter(w => (w.division_id || '') === assignDiv)
  const filteredHubs   = allHubs.filter(h => h.workspace_id === assignWs)
  const filteredQueues = allQueues.filter(q => q.hub_id === assignHub)

  const startAssign  = (userId) => { setAssigning(userId); setAssignDiv(''); setAssignWs(''); setAssignHub(''); setAssignQueue('') }
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
          <option value="evaluator">Evaluator</option><option value="team_leader">Team Leader</option>
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
              <option value="evaluator">Evaluator</option><option value="team_leader">Team Leader</option>
              <option value="admin">Admin</option>
              {profile.role === 'owner' && <option value="owner">Owner</option>}
            </select>
            <button className="btn btn-primary btn-sm" onClick={applyBulkRole}>Apply</button>
            <span style={{ color: 'var(--border)' }}>|</span>
            <span style={{ color: 'var(--text-secondary)' }}>Governance</span>
            <select className="select select-sm" value={bulkDiv}
              onChange={e => { setBulkDiv(e.target.value); setBulkWs(''); setBulkHub(''); setBulkQueue('') }}
              style={{ height: 28, fontSize: 12 }}>
              <option value="">Division…</option>
              {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {bulkDiv && (
            <select className="select select-sm" value={bulkWs}
              onChange={e => { setBulkWs(e.target.value); setBulkHub(''); setBulkQueue('') }}
              style={{ height: 28, fontSize: 12 }}>
              <option value="">Workspace…</option>
              {bulkWorkspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            )}
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
        <div style={{ display: 'grid', gridTemplateColumns: '28px 20px minmax(0, 1.2fr) 80px 70px 90px 90px minmax(0, 1fr)',
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
            <div key={u.id} className={`card user-card ${isExpanded ? 'user-card-open' : ''}`} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '28px 20px minmax(0, 1.2fr) 80px 70px 90px 90px minmax(0, 1fr)',
                gap: 8, alignItems: 'flex-start', padding: '10px 12px', cursor: 'pointer',
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
                <div><span className={`badge badge-${u.role}`}>{u.role === 'viewer' ? 'Agent' : u.role === 'team_leader' ? 'Team Leader' : u.role}</span></div>
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
                          <option value="evaluator">Evaluator</option><option value="team_leader">Team Leader</option>
                          <option value="admin">Admin</option>
                          {profile.role === 'owner' && <option value="owner">Owner</option>}
                        </select>
                      ) : (
                        <span className={`badge badge-${u.role}`}>{u.role === 'viewer' ? 'Agent' : u.role === 'team_leader' ? 'Team Leader' : u.role}</span>
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
                        <select className="select select-sm" value={assignDiv}
                          onChange={e => { setAssignDiv(e.target.value); setAssignWs(''); setAssignHub(''); setAssignQueue('') }}>
                          <option value="">Select division…</option>
                          {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {assignDiv && (
                        <select className="select select-sm" value={assignWs}
                          onChange={e => { setAssignWs(e.target.value); setAssignHub(''); setAssignQueue('') }}>
                          <option value="">Select workspace…</option>
                          {assignWorkspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                        )}
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

// ─── Small reusable inline inputs (top-level so they never lose focus/state) ───
function AddInputInline({ value, onChange, onSave, onCancel, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
      <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function EditInputInline({ value, onChange, onSave, onCancel, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
      <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function InfoTooltip({ text }) {
  return (
    <span className="info-tip">
      <span className="info-tip-icon">?</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  )
}

// ─── Small inline pencil-icon edit trigger (replaces text "Rename" buttons) ───
function EditIconButton({ onClick, title = 'Rename' }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: hover ? 'var(--accent)' : 'var(--text-tertiary)',
        fontSize: 13, lineHeight: 1,
        transition: 'color .15s', flexShrink: 0,
      }}>
      ✎
    </button>
  )
}

// ─── Floating "back to top" button — appears once the page is scrolled down ───
function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!visible) return null
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title="Back to top"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 500,
        width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border)',
        background: 'var(--bg-surface)', color: 'var(--accent)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, boxShadow: 'var(--shadow)', transition: 'transform .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
    >
      ↑
    </button>
  )
}

// ─── Queue Settings panel (top-level component — preserves its own state across re-renders) ───
function QueueMappingPanel({ queue, hub, ws, scorecards, scMarkets, profile, flash, onMappingSaved, onToggleActive, onDelete }) {
  const [scId, setScId]     = useState(queue.scorecard_id || '')
  const [market, setMarket] = useState(queue.market_value || '')
  const [team, setTeam]     = useState(queue.team || '')

  const scorecardById = (id) => scorecards.find(s => s.id === id)
  const marketOptions = (scMarkets[scId] || [])
  const optionsToShow = market && !marketOptions.includes(market) ? [market, ...marketOptions] : marketOptions

  const clearMapping = async () => {
    setSaving(true)
    const { error } = await supabase.from('queues').update({ scorecard_id: null, market_value: null, workspace_id: null }).eq('id', queue.id)
    setSaving(false)
    if (error) return flash(error.message, false)
    setScId(''); setMarket('')
    await onMappingSaved()
    flash('Queue mapping cleared')
  }

  const [samplingConfig, setSamplingConfig] = useState(null)
  const [samplingRules, setSamplingRules]   = useState([])
  const [cycleFrequency, setCycleFrequency] = useState('weekly')
  const [runDay, setRunDay]                 = useState('monday')
  const [captureDays, setCaptureDays]       = useState([])
  const [globalMin, setGlobalMin]           = useState('')
  const [minTotalCases, setMinTotalCases]   = useState('')
  const [maxTotalCases, setMaxTotalCases]   = useState('')

  const [evaluators, setEvaluators]         = useState([])
  const [assignmentRules, setAssignmentRules] = useState({})

  const [manualSampling, setManualSampling] = useState(queue.manual_sampling || false)
  const [notifyAgent, setNotifyAgent] = useState(queue.notify_agent_on_evaluation || false)

  const [saving, setSaving] = useState(false)

  const WEEKDAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
  const DIMENSIONS = [
    { value: 'category', label: 'Category' },
    { value: 'subcategory', label: 'Subcategory' },
    { value: 'channel', label: 'Channel' },
  ]

  useEffect(() => { loadSamplingConfig(); loadAssignmentSettings() }, [])

  const loadSamplingConfig = async () => {
    const { data: cfg } = await supabase.from('sampling_configurations').select('*').eq('queue_id', queue.id).maybeSingle()
    if (cfg) {
      setSamplingConfig(cfg)
      setCycleFrequency(cfg.cycle_frequency)
      setRunDay(cfg.run_day || 'monday')
      setCaptureDays(cfg.cycle_frequency === 'daily' ? [] : (cfg.capture_days || []))
      setGlobalMin(cfg.global_min_cases_per_agent ?? '')
      setMinTotalCases(cfg.min_total_cases ?? '')
      setMaxTotalCases(cfg.max_total_cases ?? '')
      const { data: rules } = await supabase.from('sampling_stratification_rules').select('*').eq('sampling_configuration_id', cfg.id).order('position')
      setSamplingRules((rules || []).map(r => ({ ...r, _localId: r.id })))
    } else {
      setSamplingConfig(null)
      setCycleFrequency('weekly')
      setRunDay('monday')
      setCaptureDays([])
      setGlobalMin('')
      setMinTotalCases('')
      setMaxTotalCases('')
      setSamplingRules([])
    }
  }

  const loadAssignmentSettings = async () => {
    const { data: uq } = await supabase.from('user_queues').select('user_id, users(id, name, email, role)').eq('queue_id', queue.id)
    const evalList = (uq || []).map(r => r.users).filter(u => u && u.role === 'evaluator')
    setEvaluators(evalList)

    const { data: settings } = await supabase.from('evaluator_assignment_settings').select('*').eq('queue_id', queue.id)
    const settingIds = (settings || []).map(s => s.id)
    let groups = []
    let conditions = []
    if (settingIds.length > 0) {
      const { data: g } = await supabase.from('evaluator_assignment_groups').select('*').in('assignment_setting_id', settingIds).order('position')
      groups = g || []
      const groupIds = groups.map(x => x.id)
      if (groupIds.length > 0) {
        const { data: c } = await supabase.from('evaluator_assignment_conditions').select('*').in('group_id', groupIds).order('position')
        conditions = c || []
      }
    }

    const rules = {}
    evalList.forEach((ev, i) => {
      const setting = (settings || []).find(s => s.user_id === ev.id)
      const evGroups = setting ? groups.filter(g => g.assignment_setting_id === setting.id) : []
      rules[ev.id] = {
        settingId: setting?.id || null,
        priority: setting?.priority ?? i,
        maxCases: setting?.max_cases_per_cycle ?? '',
        groups: evGroups.map(g => ({
          _localId: g.id, id: g.id,
          conditions: conditions.filter(c => c.group_id === g.id).map(c => ({ _localId: c.id, id: c.id, dimension: c.dimension, value: c.value }))
        }))
      }
    })
    setAssignmentRules(rules)
  }

  const toggleCaptureDay = (day) => setCaptureDays(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day])

  const siblingsOf = (parentLocalId) => samplingRules.filter(r => (r.parent_id || null) === (parentLocalId || null))
  const groupDimension  = (parentLocalId) => siblingsOf(parentLocalId)[0]?.dimension || ''
  const groupSizingMode = (parentLocalId) => siblingsOf(parentLocalId)[0]?.sizing_mode || 'percentage'

  const addNode = (parentLocalId, isFallback) => {
    const siblings = siblingsOf(parentLocalId)
    if (isFallback && siblings.some(r => r.is_fallback)) return flash('This group already has a fallback rule.', false)
    const dimension = siblings.length > 0 ? groupDimension(parentLocalId) : ''
    const sizingMode = siblings.length > 0 ? groupSizingMode(parentLocalId) : 'percentage'
    setSamplingRules(rs => [...rs, {
      _localId: 'new-' + Date.now() + '-' + Math.random(),
      parent_id: parentLocalId || null,
      dimension, value: isFallback ? null : '',
      sizing_mode: sizingMode, sizing_value: sizingMode === 'percentage' ? 10 : sizingMode === 'moe' ? 3 : 20,
      min_cases_per_agent: '', is_fallback: isFallback, position: rs.length,
    }])
  }

  const updateNode = (localId, field, value) => {
    setSamplingRules(rs => {
      const node = rs.find(r => r._localId === localId)
      if (!node) return rs
      if (field === 'dimension') {
        const parentKey = node.parent_id || null
        return rs.map(r => ((r.parent_id || null) === parentKey) ? { ...r, dimension: value, value: r.is_fallback ? null : '' } : r)
      }
      if (field === 'sizing_mode') {
        const parentKey = node.parent_id || null
        const defaultVal = value === 'moe' ? 3 : value === 'percentage' ? 10 : 20
        return rs.map(r => ((r.parent_id || null) === parentKey) ? { ...r, sizing_mode: value, sizing_value: defaultVal } : r)
      }
      return rs.map(r => r._localId === localId ? { ...r, [field]: value } : r)
    })
  }

  const removeNode = (localId) => {
    setSamplingRules(rs => {
      const toRemove = new Set([localId])
      let changed = true
      while (changed) {
        changed = false
        rs.forEach(r => { if (r.parent_id && toRemove.has(r.parent_id) && !toRemove.has(r._localId)) { toRemove.add(r._localId); changed = true } })
      }
      return rs.filter(r => !toRemove.has(r._localId))
    })
  }

  const hasChildren = (localId) => samplingRules.some(r => r.parent_id === localId)

  const incompleteRuleCount = samplingRules.filter(r => !r.dimension || !r.sizing_value || (!r.is_fallback && !r.value)).length

  const addGroup = (userId) => {
    setAssignmentRules(prev => {
      const cur = prev[userId] || { settingId: null, priority: 0, maxCases: '', groups: [] }
      return { ...prev, [userId]: { ...cur, groups: [...cur.groups, { _localId: 'new-' + Date.now() + '-' + Math.random(), id: null, conditions: [] }] } }
    })
  }

  const removeGroup = (userId, groupLocalId) => {
    setAssignmentRules(prev => {
      const cur = prev[userId]
      if (!cur) return prev
      return { ...prev, [userId]: { ...cur, groups: cur.groups.filter(g => g._localId !== groupLocalId) } }
    })
  }

  const addCondition = (userId, groupLocalId) => {
    setAssignmentRules(prev => {
      const cur = prev[userId]
      if (!cur) return prev
      const groups = cur.groups.map(g => g._localId === groupLocalId
        ? { ...g, conditions: [...g.conditions, { _localId: 'new-' + Date.now() + '-' + Math.random(), id: null, dimension: '', value: '' }] }
        : g)
      return { ...prev, [userId]: { ...cur, groups } }
    })
  }

  const updateCondition = (userId, groupLocalId, conditionLocalId, field, value) => {
    setAssignmentRules(prev => {
      const cur = prev[userId]
      if (!cur) return prev
      const groups = cur.groups.map(g => g._localId === groupLocalId
        ? { ...g, conditions: g.conditions.map(c => c._localId === conditionLocalId
            ? { ...c, [field]: value, ...(field === 'dimension' ? { value: '' } : {}) }
            : c) }
        : g)
      return { ...prev, [userId]: { ...cur, groups } }
    })
  }

  const removeCondition = (userId, groupLocalId, conditionLocalId) => {
    setAssignmentRules(prev => {
      const cur = prev[userId]
      if (!cur) return prev
      const groups = cur.groups.map(g => g._localId === groupLocalId
        ? { ...g, conditions: g.conditions.filter(c => c._localId !== conditionLocalId) }
        : g)
      return { ...prev, [userId]: { ...cur, groups } }
    })
  }

  const updatePriority = (userId, value) => {
    setAssignmentRules(prev => ({ ...prev, [userId]: { ...(prev[userId] || { groups: [], maxCases: '' }), priority: value } }))
  }
  const updateMaxCases = (userId, value) => {
    setAssignmentRules(prev => ({ ...prev, [userId]: { ...(prev[userId] || { groups: [], priority: 0 }), maxCases: value } }))
  }

  const incompleteAssignmentCount = Object.values(assignmentRules).reduce((sum, rule) => {
    return sum + rule.groups.reduce((gsum, g) => {
      if (g.conditions.length === 0) return gsum + 1
      return gsum + g.conditions.filter(c => !c.dimension || !c.value).length
    }, 0)
  }, 0)

  const saveQueueSettings = async () => {
    if (!scId)   return flash('Select a scorecard for this queue.', false)
    if (!market) return flash('Select or enter a market for this queue.', false)
    if (!team)   return flash('Select a Team (Kaizen or BPO) for this queue.', false)
    if (!manualSampling && cycleFrequency === 'weekly' && !runDay) return flash('Select a run day for the weekly cycle.', false)
    if (!manualSampling && cycleFrequency === 'weekly' && captureDays.length === 0) return flash('Select at least one capture day.', false)
    if (!manualSampling && incompleteRuleCount > 0) return flash(incompleteRuleCount + ' stratification rule(s) are missing a dimension, value, or sizing amount — fill them in or remove them.', false)
    if (!manualSampling && minTotalCases !== '' && maxTotalCases !== '' && parseInt(minTotalCases) > parseInt(maxTotalCases)) return flash('Min Total Cases cannot exceed Max Total Cases.', false)
    if (!manualSampling && incompleteAssignmentCount > 0) return flash(incompleteAssignmentCount + ' assignment condition(s) are incomplete or empty — fill them in or remove the group.', false)

    setSaving(true)

    const { error: mapError } = await supabase.from('queues').update({
      scorecard_id: scId, market_value: market, hub_id: hub.id, workspace_id: ws.id, manual_sampling: manualSampling,
      notify_agent_on_evaluation: notifyAgent, team,
    }).eq('id', queue.id)
    if (mapError) {
      setSaving(false)
      if (mapError.code === '23505') return flash('Another queue under this hub already uses that scorecard + market combination.', false)
      return flash(mapError.message, false)
    }

    if (manualSampling) {
      setSaving(false)
      await onMappingSaved()
      flash('Queue settings saved')
      return
    }

    const payload = {
      queue_id: queue.id,
      global_min_cases_per_agent: globalMin === '' ? null : parseInt(globalMin),
      min_total_cases: minTotalCases === '' ? null : parseInt(minTotalCases),
      max_total_cases: maxTotalCases === '' ? null : parseInt(maxTotalCases),
      cycle_frequency: cycleFrequency,
      run_day: cycleFrequency === 'weekly' ? runDay : null,
      capture_days: captureDays,
      updated_by: profile?.id,
      updated_at: new Date().toISOString(),
    }
    const { data: cfg, error: cfgError } = await supabase
      .from('sampling_configurations')
      .upsert({ ...(samplingConfig ? { id: samplingConfig.id } : {}), ...payload, created_by: samplingConfig?.created_by || profile?.id }, { onConflict: 'queue_id' })
      .select().single()
    if (cfgError) { setSaving(false); return flash(cfgError.message, false) }

    await supabase.from('sampling_stratification_rules').delete().eq('sampling_configuration_id', cfg.id)

    if (samplingRules.length > 0) {
      const localIdToDbId = {}
      let remaining = [...samplingRules]
      let position = 0
      let guard = 0
      while (remaining.length > 0 && guard < 50) {
        guard++
        const ready = remaining.filter(r => !r.parent_id || localIdToDbId[r.parent_id])
        if (ready.length === 0) break
        for (const r of ready) {
          const row = {
            sampling_configuration_id: cfg.id,
            parent_id: r.parent_id ? localIdToDbId[r.parent_id] : null,
            dimension: r.dimension,
            value: r.is_fallback ? null : (r.value || null),
            sizing_mode: r.sizing_mode,
            sizing_value: parseFloat(r.sizing_value) || 0,
            min_cases_per_agent: hasChildren(r._localId) ? null : ((r.min_cases_per_agent === '' || r.min_cases_per_agent == null) ? null : parseInt(r.min_cases_per_agent)),
            is_fallback: r.is_fallback,
            position: position++,
          }
          const { data: inserted, error: insertError } = await supabase.from('sampling_stratification_rules').insert(row).select().single()
          if (insertError) {
            setSaving(false)
            if (insertError.code === '23505') return flash('Only one fallback rule is allowed per group.', false)
            return flash(insertError.message, false)
          }
          localIdToDbId[r._localId] = inserted.id
        }
        remaining = remaining.filter(r => !ready.includes(r))
      }
    }

    for (const ev of evaluators) {
      const rule = assignmentRules[ev.id]
      const hasContent = rule && (rule.maxCases !== '' || rule.groups.some(g => g.conditions.length > 0))
      if (!hasContent) {
        if (rule?.settingId) await supabase.from('evaluator_assignment_settings').delete().eq('id', rule.settingId)
        continue
      }
      const { data: setting, error: settingError } = await supabase
        .from('evaluator_assignment_settings')
        .upsert({
          ...(rule.settingId ? { id: rule.settingId } : {}),
          queue_id: queue.id, user_id: ev.id,
          priority: parseInt(rule.priority) || 0,
          max_cases_per_cycle: rule.maxCases === '' ? null : parseInt(rule.maxCases),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'queue_id,user_id' })
        .select().single()
      if (settingError) { setSaving(false); return flash(settingError.message, false) }

      await supabase.from('evaluator_assignment_groups').delete().eq('assignment_setting_id', setting.id)
      let groupPosition = 0
      for (const g of rule.groups) {
        if (g.conditions.length === 0) continue
        const { data: insertedGroup, error: groupError } = await supabase
          .from('evaluator_assignment_groups')
          .insert({ assignment_setting_id: setting.id, position: groupPosition++ })
          .select().single()
        if (groupError) { setSaving(false); return flash(groupError.message, false) }
        const condRows = g.conditions.map((c, i) => ({ group_id: insertedGroup.id, dimension: c.dimension, value: c.value, position: i }))
        const { error: condError } = await supabase.from('evaluator_assignment_conditions').insert(condRows)
        if (condError) { setSaving(false); return flash(condError.message, false) }
      }
    }

    setSaving(false)
    await Promise.all([loadSamplingConfig(), loadAssignmentSettings()])
    await onMappingSaved()
    flash('Queue settings saved')
  }

  const smallLabel = { fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }

  const renderAddToolbar = (parentLocalId) => {
    const hasFallback = siblingsOf(parentLocalId).some(r => r.is_fallback)
    return (
      <div style={{ display: 'flex', gap: 12, marginTop: 4, marginBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addNode(parentLocalId, false)}>
          {parentLocalId ? '+ Add Subconfiguration' : '+ Add Rule'}
        </button>
        {!hasFallback && (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addNode(parentLocalId, true)}>
              {parentLocalId ? '+ Add Fallback Subconfiguration' : '+ Add Fallback Rule'}
            </button>
            <InfoTooltip text="Catches whatever isn't claimed by the named rules in this group (e.g. any category not explicitly listed). Sized the same way as its siblings — percentage or fixed count." />
          </span>
        )}
      </div>
    )
  }

  const renderNode = (r, depth) => {
    const children = siblingsOf(r._localId)
    const isLeaf = children.length === 0
    const incomplete = !r.dimension || !r.sizing_value || (!r.is_fallback && !r.value)
    return (
      <div key={r._localId} style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
          backgroundColor: 'var(--surface)', border: '1px solid ' + (incomplete ? 'var(--danger)' : 'var(--border)'), borderRadius: 8, padding: '10px 12px' }}>
          <div>
            <label style={smallLabel}>Dimension</label>
            <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={r.dimension}
              onChange={e => updateNode(r._localId, 'dimension', e.target.value)}>
              <option value="">Select…</option>
              {DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          {r.is_fallback ? (
            <div style={{ fontSize: 12, fontWeight: 600, minWidth: 160, padding: '0 0 6px' }}>
              Fallback (remaining {r.dimension || 'values'})
            </div>
          ) : (
            <div>
              <label style={smallLabel}>Value</label>
              {r.dimension === 'channel' ? (
                <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={r.value || ''}
                  onChange={e => updateNode(r._localId, 'value', e.target.value)}>
                  <option value="">Select…</option>
                  <option value="chat">Chat</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="social">Social Media</option>
                </select>
              ) : (
                <input className="input" style={{ width: 140, height: 30, fontSize: 12 }} value={r.value || ''}
                  onChange={e => updateNode(r._localId, 'value', e.target.value)}
                  placeholder={r.dimension === 'subcategory' ? 'e.g. Account Closure' : 'e.g. Account'} />
              )}
            </div>
          )}
          <div>
            <label style={smallLabel}>Sizing</label>
            <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={r.sizing_mode}
              onChange={e => updateNode(r._localId, 'sizing_mode', e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed_count">Fixed Count</option>
              <option value="moe">Margin of Error</option>
            </select>
          </div>
          <div>
            <label style={smallLabel}>{r.sizing_mode === 'fixed_count' ? 'Case Count' : r.sizing_mode === 'moe' ? 'Margin of Error' : (depth === 0 ? '% of population' : "% of parent's budget")}</label>
            {r.sizing_mode === 'moe' ? (
              <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={r.sizing_value}
                onChange={e => updateNode(r._localId, 'sizing_value', e.target.value)}>
                <option value="1">±1%</option>
                <option value="2">±2%</option>
                <option value="3">±3%</option>
                <option value="4">±4%</option>
                <option value="5">±5%</option>
              </select>
            ) : (
              <input type="number" className="input" style={{ width: 90, height: 30, fontSize: 12 }} min={0}
                step={r.sizing_mode === 'percentage' ? '0.01' : '1'}
                value={r.sizing_value} onChange={e => updateNode(r._localId, 'sizing_value', e.target.value)} />
            )}
          </div>
          {r.sizing_mode === 'moe' && (
            <div style={{ width: '100%', fontSize: 10, color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: -2 }}>
              Confidence level is set to 95% by default.
            </div>
          )}
          {isLeaf && (
            <div>
              <label style={smallLabel}>Min / Agent<InfoTooltip text="Within this rule's own slice, guarantees every agent who appears in it has at least this many cases (or all of their cases, if they handled fewer)." /></label>
              <input type="number" className="input" style={{ width: 70, height: 30, fontSize: 12 }} min={0}
                value={r.min_cases_per_agent ?? ''} placeholder="—"
                onChange={e => updateNode(r._localId, 'min_cases_per_agent', e.target.value)} />
            </div>
          )}
          <button onClick={() => removeNode(r._localId)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 12, height: 30 }}>Remove</button>
        </div>
        <div style={{ marginLeft: 24, marginTop: 6 }}>
          {children.map(c => renderNode(c, depth + 1))}
          {renderAddToolbar(r._localId)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '14px 16px 16px 88px', backgroundColor: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        Queue Settings
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 180 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>BPO - Hub</label>
          <div style={{ fontSize: 13, fontWeight: 500, padding: '7px 0' }}>
            {hub.name}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8, fontStyle: 'italic' }}>(from parent hub)</span>
          </div>
        </div>
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
            {scorecards.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type === 'quality' ? 'Quality' : 'DSAT'})</option>)}
          </select>
        </div>
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Market</label>
          {!scId ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '7px 0' }}>Select a scorecard first.</div>
          ) : marketOptions.length === 0 && !market ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '7px 0', maxWidth: 220 }}>
              This scorecard has no markets defined. Add them in the scorecard builder's Market field.
            </div>
          ) : (
            <select className="select select-sm" value={market} onChange={e => setMarket(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">Select market…</option>
              {optionsToShow.map(m => <option key={m} value={m}>{m}{marketOptions.includes(m) ? '' : ' (not in scorecard)'}</option>)}
            </select>
          )}
        </div>
        <div style={{ minWidth: 220 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Team</label>
          <select className="select select-sm" value={team} onChange={e => setTeam(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">Select team…</option>
            <option value="Kaizen">Kaizen</option>
            <option value="BPO">BPO</option>
          </select>
        </div>
      </div>

      {queue.scorecard_id && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: 'var(--danger)' }} onClick={clearMapping} disabled={saving}>Clear Mapping</button>
          {queue.market_value && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              Currently: {scorecardById(queue.scorecard_id)?.name || 'Unknown scorecard'} › {queue.market_value}
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <span onClick={() => setNotifyAgent(v => !v)} style={{ position: 'relative', width: 36, height: 20, borderRadius: 10, flexShrink: 0, marginTop: 2, backgroundColor: notifyAgent ? 'var(--accent)' : 'var(--border)', transition: 'background-color 0.15s ease' }}>
            <span style={{ position: 'absolute', top: 2, left: notifyAgent ? 18 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 2px #00000033', transition: 'left 0.15s ease' }} />
          </span>
          <span>
            <span style={{ fontSize: 13, fontWeight: 600, color: notifyAgent ? 'var(--accent)' : 'var(--text-primary)' }}>Notify agent when they receive a Quality evaluation</span>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, maxWidth: 460 }}>
              When on, each agent evaluated on this queue gets a notification to open and confirm they have read their Quality evaluation. Leave off for high-volume queues to avoid over-notifying.
            </div>
          </span>
        </label>
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Sampling Configuration
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: manualSampling ? 'var(--accent)' : 'var(--text-secondary)' }}>
              Manual Sampling Ingestion
            </span>
            <span
              onClick={() => setManualSampling(m => !m)}
              style={{
                position: 'relative', width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                backgroundColor: manualSampling ? 'var(--accent)' : 'var(--border)',
                transition: 'background-color 0.15s ease', cursor: 'pointer',
              }}>
              <span style={{
                position: 'absolute', top: 2, left: manualSampling ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
                boxShadow: '0 1px 2px #00000033', transition: 'left 0.15s ease',
              }} />
            </span>
            <InfoTooltip text="When on, evaluators source and submit cases for this queue manually. Stratification, cycle, and automatic assignment rules don't apply." />
          </label>
        </div>

        {manualSampling ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
            This queue is running on manual evaluation submission. Evaluators assigned to this queue select and submit cases directly.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Stratification Rules</label>

              {siblingsOf(null).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
                  No stratification rules yet — leaving this empty means a fully randomized sample will be drawn from this queue's market-filtered population once the Echo integration provides case data.
                </div>
              ) : (
                <div>{siblingsOf(null).map(r => renderNode(r, 0))}</div>
              )}
              {renderAddToolbar(null)}

              {incompleteRuleCount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                  {incompleteRuleCount} rule(s) outlined in red are missing a dimension, value, or sizing amount.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cycle Frequency</label>
                <select className="select select-sm" value={cycleFrequency} onChange={e => { const v = e.target.value; setCycleFrequency(v); if (v === 'daily') setCaptureDays([]) }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              {cycleFrequency === 'weekly' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Run Day</label>
                  <select className="select select-sm" value={runDay} onChange={e => setRunDay(e.target.value)}>
                    {WEEKDAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Global Minimum Cases / Agent<InfoTooltip text="Guarantees every agent has at least this many cases across the ENTIRE sample, combining all rules. Tops up from pools they already qualify for if anyone falls short." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={globalMin} placeholder="None" onChange={e => setGlobalMin(e.target.value)} />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, maxWidth: 180 }}>Applies across the whole sample, on top of any per-rule minimums above.</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Total Cases<InfoTooltip text="The sample must contain at least this many cases in total. If the rules produce fewer, you'll get a warning — nothing is auto-added to close the gap." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={minTotalCases} placeholder="No floor" onChange={e => setMinTotalCases(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Total Cases<InfoTooltip text="The sample won't exceed this many cases in total. If the rules would produce more, the excess is trimmed proportionally, never breaking a rule's own Min / Agent floor." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={maxTotalCases} placeholder="No ceiling" onChange={e => setMaxTotalCases(e.target.value)} />
              </div>
            </div>

            {cycleFrequency === 'weekly' ? (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Days (whose handled cases get pulled in)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {WEEKDAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleCaptureDay(d)} className="btn btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px',
                        backgroundColor: captureDays.includes(d) ? 'var(--accent)' : 'var(--surface)',
                        color: captureDays.includes(d) ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid ' + (captureDays.includes(d) ? 'var(--accent)' : 'var(--border)') }}>
                      {d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Window</label>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', maxWidth: 320 }}>
                  Daily cycles always capture the previous day's cases (Day-1). No selection needed.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {!manualSampling && (
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Evaluator Assignment Rules
        </div>

        {evaluators.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No evaluators are assigned to this queue yet — assign them in User Management first.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {evaluators.map(ev => {
              const rule = assignmentRules[ev.id] || { priority: 0, maxCases: '', groups: [] }
              return (
                <div key={ev.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ev.email}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div>
                        <label style={smallLabel}>Priority<InfoTooltip text="When more than one evaluator's rules match the same case, whoever has the lower priority number wins." /></label>
                        <input type="number" className="input" style={{ width: 70, height: 30, fontSize: 12 }}
                          value={rule.priority} onChange={e => updatePriority(ev.id, e.target.value)} />
                      </div>
                      <div>
                        <label style={smallLabel}>Max Cases / Cycle<InfoTooltip text="Advisory only — if a matching rule would push this evaluator over the cap, they still get the case. It's flagged as an overage on their screen rather than reassigned elsewhere." /></label>
                        <input type="number" className="input" style={{ width: 90, height: 30, fontSize: 12 }} min={1}
                          value={rule.maxCases} placeholder="No cap" onChange={e => updateMaxCases(ev.id, e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {rule.groups.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
                      No conditions set — this evaluator won't receive automatic assignments.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                      {rule.groups.map((g, gi) => (
                        <div key={g._localId}>
                          {gi > 0 && <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, margin: '6px 0' }}>OR</div>}
                          <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                            {g.conditions.length === 0 ? (
                              <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>Empty group — add at least one condition or remove it.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {g.conditions.map((c, ci) => (
                                  <div key={c._localId} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    {ci > 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, alignSelf: 'center' }}>AND</span>}
                                    <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={c.dimension}
                                      onChange={e => updateCondition(ev.id, g._localId, c._localId, 'dimension', e.target.value)}>
                                      <option value="">Select…</option>
                                      {DIMENSIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                    </select>
                                    {c.dimension === 'channel' ? (
                                      <select className="select select-sm" style={{ height: 30, fontSize: 12 }} value={c.value}
                                        onChange={e => updateCondition(ev.id, g._localId, c._localId, 'value', e.target.value)}>
                                        <option value="">Select…</option>
                                        <option value="chat">Chat</option>
                                        <option value="email">Email</option>
                                        <option value="phone">Phone</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="social">Social Media</option>
                                      </select>
                                    ) : (
                                      <input className="input" style={{ width: 140, height: 30, fontSize: 12 }} value={c.value}
                                        onChange={e => updateCondition(ev.id, g._localId, c._localId, 'value', e.target.value)}
                                        placeholder="e.g. Account" />
                                    )}
                                    <button onClick={() => removeCondition(ev.id, g._localId, c._localId)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 11 }}>Remove</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addCondition(ev.id, g._localId)}>+ Add Condition (AND)</button>
                              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => removeGroup(ev.id, g._localId)}>Remove Group</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addGroup(ev.id)}>+ Add OR-Group</button>
                </div>
              )
            })}
          </div>
        )}
        {incompleteAssignmentCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>
            {incompleteAssignmentCount} condition(s)/group(s) outlined above need attention before saving.
          </div>
        )}
      </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={saveQueueSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save Queue Settings'}
        </button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Danger Zone
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={`btn btn-sm ${queue.is_active ? 'btn-danger' : 'btn-success'}`} onClick={onToggleActive}>
            {queue.is_active ? 'Deactivate Queue' : 'Activate Queue'}
          </button>
          {!queue.is_active && (
            <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete Queue</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Workspace card (top-level component — preserves its own state across re-renders) ───
function WorkspaceCard({ ws, divisions, scorecards, scMarkets, profile, flash, ui, actions, samplingByQueue }) {
  const { expanded, setExpanded, expandedH, setExpandedH, expandedS, setExpandedS, adding, addName, setAddName, editing, editName, setEditName } = ui
  const { isAdding, isEditing, startAdd, cancelAdd, confirmAdd, startEdit, cancelEdit, confirmEdit, toggleWs, toggleHub, toggleQueue, deleteWs, deleteHub, deleteQueue, setWorkspaceDivision, scorecardById, reloadAll } = actions

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
        <span title={ws.is_active ? 'Active' : 'Inactive'}
          style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: ws.is_active ? '#22c55e' : '#64748b' }} />
        {isEditing(ws.id) ? (
          <div style={{ flex: 1 }}>
            <EditInputInline value={editName} onChange={setEditName} onSave={confirmEdit} onCancel={cancelEdit} placeholder="Workspace name" />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</span>
            <EditIconButton onClick={() => startEdit(ws.id, 'workspace', ws.name)} />
          </div>
        )}
        {!isEditing(ws.id) && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => startAdd('hub', ws.id)}>+ Hub</button>
            <RowMenu isActive={ws.is_active} onToggleActive={() => toggleWs(ws)} onDelete={() => deleteWs(ws)}
              extraContent={
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Division</label>
                  <select className="select select-sm" value={ws.division_id || ''}
                    onChange={e => setWorkspaceDivision(ws.id, e.target.value)}
                    style={{ width: '100%', fontSize: 12 }}>
                    <option value="">No division</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name}{d.is_active ? '' : ' (inactive)'}</option>)}
                  </select>
                </div>
              } />
          </div>
        )}
      </div>
      {wsExpanded && (
        <div style={{ backgroundColor: 'var(--bg)' }}>
          {isAdding('hub', ws.id) && (
            <div style={{ padding: '10px 16px 10px 40px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>New Hub</div>
              <AddInputInline value={addName} onChange={setAddName} onSave={confirmAdd} onCancel={cancelAdd} placeholder="e.g. Concentrix Romania" />
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
                  <span title={hub.is_active ? 'Active' : 'Inactive'}
                    style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: hub.is_active ? '#22c55e' : '#64748b' }} />
                  {isEditing(hub.id) ? (
                    <div style={{ flex: 1 }}>
                      <EditInputInline value={editName} onChange={setEditName} onSave={confirmEdit} onCancel={cancelEdit} placeholder="Hub name" />
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{hub.name}</span>
                      <EditIconButton onClick={() => startEdit(hub.id, 'hub', hub.name)} />
                    </div>
                  )}
                  {!isEditing(hub.id) && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd('queue', hub.id)}>+ Queue</button>
                      <RowMenu isActive={hub.is_active} onToggleActive={() => toggleHub(hub)} onDelete={() => deleteHub(hub)} />
                    </div>
                  )}
                </div>

                {hubExpanded && (
                  <div>
                    {isAdding('queue', hub.id) && (
                      <div style={{ padding: '8px 16px 8px 64px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>New Queue</div>
                        <AddInputInline value={addName} onChange={setAddName} onSave={confirmAdd} onCancel={cancelAdd} placeholder="e.g. DSAT · Romania" />
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
                            {isEditing(q.id) ? (
                              <div style={{ flex: 1 }}>
                                <EditInputInline value={editName} onChange={setEditName} onSave={confirmEdit} onCancel={cancelEdit} placeholder="Queue name" />
                              </div>
                            ) : (
                              <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 240px 190px', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
                                  <EditIconButton onClick={() => startEdit(q.id, 'queue', q.name)} />
                                </span>
                                <span>
                                  {mapped && (
                                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                      backgroundColor: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44' }}>
                                      {scorecardById(q.scorecard_id)?.name || 'Scorecard'} · {q.market_value}{q.team ? ' · ' + q.team : ''}
                                    </span>
                                  )}
                                </span>
                                <span>
                                  {q.manual_sampling ? (
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      ✋ Manual
                                      <InfoTooltip text="This queue runs on manual evaluation submission — evaluators pick and submit cases directly. No automatic sampling schedule applies." />
                                    </span>
                                  ) : samplingByQueue[q.id] && (
                                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                      backgroundColor: '#8b5cf622', color: '#8b5cf6', border: '1px solid #8b5cf644',
                                      display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                      🎯 {samplingByQueue[q.id] === 'weekly' ? 'Weekly' : 'Daily'} Cycle
                                      <InfoTooltip text={`This queue automatically pulls a stratified sample of cases on a ${samplingByQueue[q.id]} cycle, based on its configured sampling rules.`} />
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {!isEditing(q.id) && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: mapOpen ? 'var(--accent)' : undefined, border: mapOpen ? '1px solid var(--accent)44' : undefined }}
                                  onClick={() => setExpandedS(e => ({ ...e, [q.id]: !mapOpen }))}>⚙ Queue Settings</button>
                              </div>
                            )}
                          </div>
                          {mapOpen && (
                            <QueueMappingPanel queue={q} hub={hub} ws={ws} scorecards={scorecards} scMarkets={scMarkets}
                              profile={profile} flash={flash} onMappingSaved={reloadAll}
                              onToggleActive={() => toggleQueue(q)} onDelete={() => deleteQueue(q)} />
                          )}
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

// ─── Governance Tab ────────────────────────────────────────────────────────────
function GovernanceTab({ profile, flash }) {
  const [workspaces, setWorkspaces] = useState([])
  const [divisions,  setDivisions]  = useState([])
  const [scorecards, setScorecards] = useState([])
  const [scMarkets,  setScMarkets]  = useState({})
  const [expanded,   setExpanded]   = useState({})
  const [expandedH,  setExpandedH]  = useState({})
  const [expandedS,  setExpandedS]  = useState({})
  const [expandedDiv,setExpandedDiv]= useState({})
  const [adding,     setAdding]     = useState(null)
  const [addName,    setAddName]    = useState('')
  const [editing,    setEditing]    = useState(null)
  const [editName,   setEditName]   = useState('')
  const [confirm,    setConfirm]    = useState(null)
  const [samplingByQueue, setSamplingByQueue] = useState({})

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: ws }, { data: divs }, { data: sc }, { data: sampCfgs }] = await Promise.all([
      supabase.from('workspaces').select('*, hubs(*, queues(*))').order('position'),
      supabase.from('divisions').select('id, name, is_active, position').order('position'),
      supabase.from('scorecards').select('id, name, type, is_published').eq('is_published', true).eq('is_calibration', false).is('deleted_at', null).order('name'),
      supabase.from('sampling_configurations').select('queue_id, cycle_frequency'),
    ])
    const activeWs = (ws || [])
      .filter(w => !w.deleted_at)
      .map(w => ({
        ...w,
        hubs: (w.hubs || [])
          .filter(h => !h.deleted_at)
          .map(h => ({ ...h, queues: (h.queues || []).filter(q => !q.deleted_at) }))
      }))
    setWorkspaces(activeWs)
    setDivisions(divs || [])
    setScorecards(sc || [])
    const sbq = {}
    ;(sampCfgs || []).forEach(row => { sbq[row.queue_id] = row.cycle_frequency })
    setSamplingByQueue(sbq)
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
  const deleteWs    = (ws)  => ask(`Permanently delete "${ws.name}"? All hubs and queues inside will also be deleted.`,  async () => { closeConfirm(); const { error } = await supabase.from('workspaces').update({ deleted_at: new Date().toISOString() }).eq('id', ws.id); if (error) return flash(error.message, false); await loadAll(); flash('Workspace deleted') })
  const deleteHub   = (hub) => ask(`Permanently delete "${hub.name}"? All queues inside will also be deleted.`,          async () => { closeConfirm(); const { error } = await supabase.from('hubs').update({ deleted_at: new Date().toISOString() }).eq('id', hub.id); if (error) return flash(error.message, false); await loadAll(); flash('Hub deleted') })
  const deleteQueue = (q)   => ask(`Permanently delete "${q.name}"? This cannot be undone.`,                             async () => { closeConfirm(); const { error } = await supabase.from('queues').update({ deleted_at: new Date().toISOString() }).eq('id', q.id); if (error) return flash(error.message, false); await loadAll(); flash('Queue deleted') })

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
      if (error) {
        if (error.code === '23505') return flash('A hub with this name already exists. Hub names must be unique across all workspaces.', false)
        return flash(error.message, false)
      }
    } else {
      let hubLen = 0
      for (const ws of workspaces) { const hub = ws.hubs?.find(h => h.id === adding.parentId); if (hub) { hubLen = hub.queues?.length || 0; break } }
      const { error } = await supabase.from('queues').insert({ name, hub_id: adding.parentId, is_active: true, position: hubLen, manual_sampling: true })
      if (error) return flash(error.message, false)
    }
    cancelAdd(); await loadAll(); flash('Created successfully')
  }

  const confirmEdit = async () => {
    const name = editName.trim()
    if (!name) return flash('Name is required.', false)
    const table = editing.level === 'workspace' ? 'workspaces' : editing.level === 'hub' ? 'hubs' : 'queues'
    const { error } = await supabase.from(table).update({ name }).eq('id', editing.id)
    if (error) {
      if (error.code === '23505' && editing.level === 'hub') return flash('A hub with this name already exists. Hub names must be unique across all workspaces.', false)
      return flash(error.message, false)
    }
    cancelEdit(); await loadAll(); flash('Renamed successfully')
  }

  const isAdding  = (type, parentId) => adding?.type === type && adding?.parentId === parentId
  const isEditing = (id) => editing?.id === id

  const expandAllDivisions = () => {
    const nextDiv = { __none__: true }
    divisions.forEach(d => { nextDiv[d.id] = true })
    setExpandedDiv(nextDiv)
    const nextWs = {}
    const nextHub = {}
    workspaces.forEach(w => {
      nextWs[w.id] = true
      ;(w.hubs || []).forEach(h => { nextHub[h.id] = true })
    })
    setExpanded(nextWs)
    setExpandedH(nextHub)
  }
  const collapseAllDivisions = () => {
    const nextDiv = { __none__: false }
    divisions.forEach(d => { nextDiv[d.id] = false })
    setExpandedDiv(nextDiv)
    const nextWs = {}
    workspaces.forEach(w => { nextWs[w.id] = false })
    setExpanded(nextWs)
  }

  const wsByDivision = (divId) => workspaces.filter(w => (w.division_id || null) === divId)
  const unassignedWs = workspaces.filter(w => !w.division_id)

  const ui = { expanded, setExpanded, expandedH, setExpandedH, expandedS, setExpandedS, adding, addName, setAddName, editing, editName, setEditName }
  const actions = { isAdding, isEditing, startAdd, cancelAdd, confirmAdd, startEdit, cancelEdit, confirmEdit, toggleWs, toggleHub, toggleQueue, deleteWs, deleteHub, deleteQueue, setWorkspaceDivision, scorecardById, reloadAll: loadAll }

  return (
    <div className="gov-tab">
      {confirm && <ConfirmModal message={confirm.message} onYes={confirm.onYes} onNo={closeConfirm} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Workspace Structure</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Grouped by division · manage workspaces, hubs, and queues · map each queue to a scorecard + market</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={expandAllDivisions} title="Expand every division, workspace, and hub">Expand all</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={collapseAllDivisions} title="Collapse every division and workspace">Collapse all</button>
          <button className="btn btn-primary btn-sm" onClick={() => startAdd('workspace')}>+ Add Workspace</button>
        </div>
        <ScrollToTopButton />
      </div>

      {isAdding('workspace', null) && (
        <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New Workspace</div>
          <AddInputInline value={addName} onChange={setAddName} onSave={confirmAdd} onCancel={cancelAdd} placeholder="e.g. Concentrix" />
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
              <span title={div.is_active ? 'Active' : 'Inactive'}
                style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: div.is_active ? '#22c55e' : '#64748b' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                {wsList.length} workspace{wsList.length === 1 ? '' : 's'}
              </span>
            </div>
            {open && (
              wsList.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', padding: '4px 0 8px 28px' }}>No workspaces in this division.</div>
                : <div style={{ paddingLeft: 4 }}>{wsList.map(ws => (
                    <WorkspaceCard key={ws.id} ws={ws} divisions={divisions} scorecards={scorecards} scMarkets={scMarkets}
                      profile={profile} flash={flash} ui={ui} actions={actions} samplingByQueue={samplingByQueue} />
                  ))}</div>
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
            <div style={{ paddingLeft: 4 }}>{unassignedWs.map(ws => (
              <WorkspaceCard key={ws.id} ws={ws} divisions={divisions} scorecards={scorecards} scMarkets={scMarkets}
                profile={profile} flash={flash} ui={ui} actions={actions} samplingByQueue={samplingByQueue} />
            ))}</div>
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
  const [archived, setArchived] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  const [divisions, setDivisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newType, setNewType] = useState('quality')
  const [newThreshold, setNewThreshold] = useState(90)
  const [newDivision, setNewDivision] = useState('')
  const [confirm, setConfirm] = useState(null)

  const canEdit = ['admin', 'owner'].includes(profile?.role)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [{ data: sc }, { data: divs }, { data: arch }] = await Promise.all([
      supabase.from('scorecards').select('*, users(name)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('divisions').select('id, name, is_active, position').order('position'),
      supabase.from('scorecards').select('*, users(name)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    setScorecards(sc || [])
    setArchived(arch || [])
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
    `Archive "${sc.name}"? It will be hidden from all scorecard lists. Its evaluations are kept and remain exportable by admins/owners.`,
    async () => {
      closeConfirm()
      const { data: arch, error } = await supabase.from('scorecards').update({ deleted_at: new Date().toISOString() }).eq('id', sc.id).select()
      if (error) return flash(error.message, false)
      if (!arch || arch.length === 0) return flash('Could not archive this scorecard — you may not have permission.', false)
      await loadAll(); flash('Scorecard archived')
    }
  )

  const [duplicatingId, setDuplicatingId] = useState(null)

  const duplicateScorecard = async (sc) => {
    setDuplicatingId(sc.id)
    const { data: newId, error } = await supabase.rpc('duplicate_scorecard', {
      source_id: sc.id,
      actor_id: profile.id,
    })
    setDuplicatingId(null)
    if (error) return flash('Duplicate failed: ' + error.message, false)
    await loadAll()
    flash('Scorecard duplicated as a draft — remember to review and publish it separately.')
    navigate(`/scorecards/${newId}/edit`)
  }

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
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <TypeBadge type={sc.type} />
                  {sc.is_calibration && (
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 6, fontWeight: 600,
                      backgroundColor: '#7c3aed22', color: '#7c3aed', border: '1px solid #7c3aed44' }}>Calibration</span>
                  )}
                </div>
              </td>
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
                    <button className="btn btn-sm btn-ghost" disabled={duplicatingId === sc.id} onClick={() => duplicateScorecard(sc)}>
                      {duplicatingId === sc.id ? 'Duplicating…' : 'Duplicate'}
                    </button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => deleteScorecard(sc)}>Archive</button>
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

      <div style={{ marginTop: 32 }}>
        <button onClick={() => setShowArchived(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>{showArchived ? '▾' : '▸'}</span>
          Archived ({archived.length})
        </button>
        {showArchived && (
          <div style={{ marginTop: 12 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Division</th>
                    <th>Description</th>
                    <th>Created By</th>
                    <th>Archived On</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.length === 0 && (
                    <tr><td colSpan={6} className="empty-row">No archived scorecards.</td></tr>
                  )}
                  {archived.map(sc => (
                    <tr key={sc.id} style={{ opacity: 0.7 }}>
                      <td style={{ fontWeight: 500 }}>{sc.name}</td>
                      <td><TypeBadge type={sc.type} /></td>
                      <td style={{ fontSize: 13 }}>{sc.division || 'None'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{sc.description || '-'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{sc.users?.name || '-'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{sc.deleted_at ? new Date(sc.deleted_at).toLocaleDateString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Admin ────────────────────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'users')
  const [msg, setMsg] = useState(null)

  const flash = (text, ok = true) => { setMsg({ text, ok }); if (ok) setTimeout(() => setMsg(null), 3000) }

  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-header">
        <div>
          <h1>Control Room</h1>
          <p className="page-sub">Manage users, roles and governance</p>
        </div>
      </div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}
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
