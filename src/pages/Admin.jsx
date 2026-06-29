import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

// ─── Governance helpers ───────────────────────────────────────────────────────

function GovernanceTab({ flash }) {
  const [workspaces, setWorkspaces] = useState([])
  const [expanded,   setExpanded]   = useState({})
  const [expandedH,  setExpandedH]  = useState({})
  const [adding, setAdding] = useState(null)
  const [addName, setAddName] = useState('')
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('*, hubs(*, queues(*))')
      .order('position')
    setWorkspaces(ws || [])
  }

  const toggleWs = async (ws) => {
    await supabase.from('workspaces').update({ is_active: !ws.is_active }).eq('id', ws.id)
    await loadAll()
    flash(`Workspace ${ws.is_active ? 'deactivated' : 'activated'}`)
  }
  const toggleHub = async (hub) => {
    await supabase.from('hubs').update({ is_active: !hub.is_active }).eq('id', hub.id)
    await loadAll()
    flash(`Hub ${hub.is_active ? 'deactivated' : 'activated'}`)
  }
  const toggleQueue = async (q) => {
    await supabase.from('queues').update({ is_active: !q.is_active }).eq('id', q.id)
    await loadAll()
    flash(`Queue ${q.is_active ? 'deactivated' : 'activated'}`)
  }

  const startAdd = (type, parentId = null) => { setAdding({ type, parentId }); setAddName('') }
  const cancelAdd = () => { setAdding(null); setAddName('') }

  const confirmAdd = async () => {
    const name = addName.trim()
    if (!name) return flash('Name is required.', false)
    if (adding.type === 'workspace') {
      const { error } = await supabase.from('workspaces').insert({ name, is_active: true, position: workspaces.length })
      if (error) return flash(error.message, false)
    } else if (adding.type === 'hub') {
      const ws = workspaces.find(w => w.id === adding.parentId)
      const { error } = await supabase.from('hubs').insert({ name, workspace_id: adding.parentId, is_active: true, position: (ws?.hubs?.length || 0) })
      if (error) return flash(error.message, false)
    } else if (adding.type === 'queue') {
      let hubLen = 0
      for (const ws of workspaces) {
        const hub = ws.hubs?.find(h => h.id === adding.parentId)
        if (hub) { hubLen = hub.queues?.length || 0; break }
      }
      const { error } = await supabase.from('queues').insert({ name, hub_id: adding.parentId, is_active: true, position: hubLen })
      if (error) return flash(error.message, false)
    }
    cancelAdd()
    await loadAll()
    flash('Created successfully')
  }

  const startEdit = (id, level, name) => { setEditing({ id, level }); setEditName(name) }
  const cancelEdit = () => { setEditing(null); setEditName('') }

  const confirmEdit = async () => {
    const name = editName.trim()
    if (!name) return flash('Name is required.', false)
    const table = editing.level === 'workspace' ? 'workspaces' : editing.level === 'hub' ? 'hubs' : 'queues'
    const { error } = await supabase.from(table).update({ name }).eq('id', editing.id)
    if (error) return flash(error.message, false)
    cancelEdit()
    await loadAll()
    flash('Renamed successfully')
  }

  const isAdding = (type, parentId) => adding?.type === type && adding?.parentId === parentId
  const isEditing = (id) => editing?.id === id

  const AddInput = ({ placeholder }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <input
        autoFocus
        className="input"
        style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder}
        value={addName}
        onChange={e => setAddName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') cancelAdd() }}
      />
      <button className="btn btn-primary btn-sm" onClick={confirmAdd}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={cancelAdd}>Cancel</button>
    </div>
  )

  const EditInput = ({ placeholder }) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        autoFocus
        className="input"
        style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder}
        value={editName}
        onChange={e => setEditName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') cancelEdit() }}
      />
      <button className="btn btn-primary btn-sm" onClick={confirmEdit}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Workspace Structure</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Manage workspaces, hubs, and queues
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => startAdd('workspace')}>
          + Add Workspace
        </button>
      </div>

      {isAdding('workspace', null) && (
        <div className="card" style={{ marginBottom: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>New Workspace</div>
          <AddInput placeholder="e.g. Concentrix" />
        </div>
      )}

      {workspaces.length === 0 && !adding && (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '20px 0' }}>
          No workspaces yet. Add one above.
        </div>
      )}

      {workspaces.map(ws => {
        const wsExpanded = expanded[ws.id] ?? true
        const hubs = ws.hubs || []

        return (
          <div key={ws.id} className="card" style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>

            {/* Workspace row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px',
              borderBottom: wsExpanded && (hubs.length > 0 || isAdding('hub', ws.id)) ? '1px solid var(--border)' : 'none',
              backgroundColor: 'var(--surface)'
            }}>
              <button
                onClick={() => setExpanded(e => ({ ...e, [ws.id]: !wsExpanded }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--text-secondary)', fontSize: 13, width: 20, flexShrink: 0 }}>
                {wsExpanded ? '▾' : '▸'}
              </button>

              {isEditing(ws.id) ? (
                <div style={{ flex: 1 }}><EditInput placeholder="Workspace name" /></div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{ws.name}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                    backgroundColor: ws.is_active ? '#22c55e22' : '#64748b22',
                    color: ws.is_active ? '#22c55e' : '#94a3b8'
                  }}>
                    {ws.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              )}

              {!isEditing(ws.id) && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startAdd('hub', ws.id)}>+ Hub</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ws.id, 'workspace', ws.name)}>Rename</button>
                  <button
                    className={`btn btn-sm ${ws.is_active ? 'btn-danger' : 'btn-success'}`}
                    style={{ fontSize: 12 }}
                    onClick={() => toggleWs(ws)}>
                    {ws.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              )}
            </div>

            {/* Hubs */}
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
                      {/* Hub row */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 16px 10px 40px',
                        borderBottom: (hubExpanded && queues.length > 0) || !isLast || isAdding('queue', hub.id)
                          ? '1px solid var(--border)' : 'none',
                      }}>
                        <button
                          onClick={() => setExpandedH(e => ({ ...e, [hub.id]: !hubExpanded }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                            color: 'var(--text-secondary)', fontSize: 12, width: 16, flexShrink: 0 }}>
                          {hubExpanded ? '▾' : '▸'}
                        </button>

                        {isEditing(hub.id) ? (
                          <div style={{ flex: 1 }}><EditInput placeholder="Hub name" /></div>
                        ) : (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{hub.name}</span>
                            <span style={{
                              fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600,
                              backgroundColor: hub.is_active ? '#22c55e22' : '#64748b22',
                              color: hub.is_active ? '#22c55e' : '#94a3b8'
                            }}>
                              {hub.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        )}

                        {!isEditing(hub.id) && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd('queue', hub.id)}>+ Queue</button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(hub.id, 'hub', hub.name)}>Rename</button>
                            <button
                              className={`btn btn-sm ${hub.is_active ? 'btn-danger' : 'btn-success'}`}
                              style={{ fontSize: 12 }}
                              onClick={() => toggleHub(hub)}>
                              {hub.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Queues */}
                      {hubExpanded && (
                        <div>
                          {isAdding('queue', hub.id) && (
                            <div style={{ padding: '8px 16px 8px 64px', borderBottom: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>New Queue</div>
                              <AddInput placeholder="e.g. Colombia Market" />
                            </div>
                          )}

                          {queues.map((q, qi) => (
                            <div key={q.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 16px 8px 64px',
                              borderBottom: qi < queues.length - 1 ? '1px solid var(--border)' : 'none',
                              backgroundColor: 'var(--surface)'
                            }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                backgroundColor: q.is_active ? '#22c55e' : '#64748b' }} />

                              {isEditing(q.id) ? (
                                <div style={{ flex: 1 }}><EditInput placeholder="Queue name" /></div>
                              ) : (
                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{q.name}</span>
                              )}

                              {!isEditing(q.id) && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(q.id, 'queue', q.name)}>Rename</button>
                                  <button
                                    className={`btn btn-sm ${q.is_active ? 'btn-danger' : 'btn-success'}`}
                                    style={{ fontSize: 12 }}
                                    onClick={() => toggleQueue(q)}>
                                    {q.is_active ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                          {queues.length === 0 && !isAdding('queue', hub.id) && (
                            <div style={{ padding: '8px 16px 8px 64px', fontSize: 12,
                              color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              No queues yet
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {hubs.length === 0 && !isAdding('hub', ws.id) && (
                  <div style={{ padding: '10px 16px 10px 40px', fontSize: 12,
                    color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No hubs yet
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Admin page ──────────────────────────────────────────────────────────

export default function Admin() {
  const { profile } = useAuth()
  const [tab,       setTab]       = useState('users')
  const [users,     setUsers]     = useState([])
  const [onlineIds, setOnlineIds] = useState(new Set())
  const [sampling,  setSampling]  = useState([])
  const [msg,       setMsg]       = useState(null)
  const [newSamp,   setNewSamp]   = useState({
    queueName: '', channel: 'all', targetCount: 10, period: 'weekly'
  })

  useEffect(() => { loadUsers(); loadSampling() }, [])

  useEffect(() => {
    const syncPresence = () => {
      const channels = supabase.getChannels()
      const presence = channels.find(c => c.topic === 'realtime:quark-presence')
      if (!presence) return
      const state = presence.presenceState()
      const ids = new Set()
      Object.values(state).forEach(presences => {
        presences.forEach(p => ids.add(p.user_id))
      })
      setOnlineIds(ids)
    }
    syncPresence()
    const interval = setInterval(syncPresence, 3000)
    return () => clearInterval(interval)
  }, [])

  const loadUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers(data || [])
  }

  const loadSampling = async () => {
    const { data } = await supabase
      .from('sampling_requirements')
      .select('*')
      .order('queue_name')
    setSampling(data || [])
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const changeRole = async (id, role) => {
    if (id === profile.id) return flash('You cannot change your own role.', false)
    const { error } = await supabase.from('users').update({ role }).eq('id', id)
    if (error) return flash(error.message, false)
    await loadUsers()
    flash(`Role updated to ${role}`)
  }

  const toggleActive = async (id, active) => {
    if (id === profile.id) return flash('You cannot deactivate yourself.', false)
    const { error } = await supabase.from('users').update({ active }).eq('id', id)
    if (error) return flash(error.message, false)
    await loadUsers()
    flash(active ? 'Account activated' : 'Account deactivated')
  }

  const sendResetLink = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://quark-iota.vercel.app/reset-password'
    })
    if (error) return flash(error.message, false)
    flash(`Reset link sent to ${email}`)
  }

  const addSampling = async () => {
    if (!newSamp.queueName) return flash('Queue name is required.', false)
    const { error } = await supabase.from('sampling_requirements').upsert({
      queue_name:   newSamp.queueName,
      channel:      newSamp.channel,
      target_count: newSamp.targetCount,
      period:       newSamp.period,
      updated_by:   profile.id,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'queue_name,channel' })
    if (error) return flash(error.message, false)
    await loadSampling()
    flash('Sampling requirement saved')
    setNewSamp({ queueName: '', channel: 'all', targetCount: 10, period: 'weekly' })
  }

  const deleteSampling = async (id) => {
    await supabase.from('sampling_requirements').delete().eq('id', id)
    await loadSampling()
    flash('Requirement removed')
  }

  const canChangeRole = (u) => {
    if (u.id === profile.id) return false
    if (profile.role === 'owner') return true
    if (profile.role === 'admin' && u.role !== 'owner') return true
    return false
  }

  const canDeactivate = (u) => {
    if (u.id === profile.id) return false
    if (profile.role === 'owner') return true
    if (profile.role === 'admin' && u.role !== 'owner') return true
    return false
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Panel</h1>
          <p className="page-sub">Manage users, roles, sampling requirements and governance</p>
        </div>
      </div>

      {msg && (
        <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}>
          User Management
        </button>
        <button className={`tab ${tab === 'sampling' ? 'active' : ''}`}
          onClick={() => setTab('sampling')}>
          Sampling Requirements
        </button>
        <button className={`tab ${tab === 'governance' ? 'active' : ''}`}
          onClick={() => setTab('governance')}>
          Governance
        </button>
      </div>

      {tab === 'users' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Online</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan="6" className="empty-row">No users yet.</td></tr>
              )}
              {users.map(u => {
                const isOnline = onlineIds.has(u.id)
                return (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                    <td>
                      <span className={`badge badge-${u.role}`}>{u.role}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%',
                          backgroundColor: isOnline ? '#22c55e' : '#64748b',
                          flexShrink: 0,
                          boxShadow: isOnline ? '0 0 6px #22c55e99' : 'none',
                        }} />
                        <span style={{ fontSize: 13, color: isOnline ? '#22c55e' : 'var(--text-secondary)' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td>
                      <div className="action-group">
                        {canChangeRole(u) && (
                          <select className="select select-sm"
                            value={u.role}
                            onChange={e => changeRole(u.id, e.target.value)}>
                            <option value="viewer">Viewer</option>
                            <option value="evaluator">Evaluator</option>
                            <option value="admin">Admin</option>
                            {profile.role === 'owner' && (
                              <option value="owner">Owner</option>
                            )}
                          </select>
                        )}
                        {canDeactivate(u) && (
                          <button
                            className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggleActive(u.id, !u.active)}>
                            {u.active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {canDeactivate(u) && (
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ color: 'var(--accent)' }}
                            onClick={() => sendResetLink(u.email)}>
                            Reset Password
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sampling' && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title" style={{ marginBottom: 16 }}>
              Add / Update Requirement
            </div>
            <div className="form-row">
              <div className="form-field">
                <label>Queue Name</label>
                <input className="input" placeholder="e.g. Payments Support"
                  value={newSamp.queueName}
                  onChange={e => setNewSamp(s => ({ ...s, queueName: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Channel</label>
                <select className="select" value={newSamp.channel}
                  onChange={e => setNewSamp(s => ({ ...s, channel: e.target.value }))}>
                  <option value="all">All</option>
                  <option value="chat">Chat</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div className="form-field">
                <label>Target Count</label>
                <input type="number" className="input" min={1}
                  value={newSamp.targetCount}
                  onChange={e => setNewSamp(s => ({ ...s, targetCount: parseInt(e.target.value) }))} />
              </div>
              <div className="form-field">
                <label>Period</label>
                <select className="select" value={newSamp.period}
                  onChange={e => setNewSamp(s => ({ ...s, period: e.target.value }))}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
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
              <thead>
                <tr>
                  <th>Queue</th>
                  <th>Channel</th>
                  <th>Target</th>
                  <th>Period</th>
                  <th>Updated At</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sampling.length === 0 && (
                  <tr><td colSpan="6" className="empty-row">No sampling requirements set.</td></tr>
                )}
                {sampling.map(sr => (
                  <tr key={sr.id}>
                    <td>{sr.queue_name}</td>
                    <td><span className="badge badge-channel">{sr.channel}</span></td>
                    <td>{sr.target_count}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{sr.period}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(sr.updated_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => deleteSampling(sr.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'governance' && (
        <GovernanceTab flash={flash} />
      )}
    </div>
  )
}
