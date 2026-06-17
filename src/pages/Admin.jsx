import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function Admin() {
  const { profile } = useAuth()
  const [tab,      setTab]      = useState('users')
  const [users,    setUsers]    = useState([])
  const [sampling, setSampling] = useState([])
  const [msg,      setMsg]      = useState(null)
  const [newSamp,  setNewSamp]  = useState({
    queueName: '', channel: 'all', targetCount: 10, period: 'weekly'
  })

  useEffect(() => { loadUsers(); loadSampling() }, [])

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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Admin Panel</h1>
          <p className="page-sub">Manage users, roles and sampling requirements</p>
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
      </div>

      {/* USER MANAGEMENT */}
      {tab === 'users' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan="6" className="empty-row">No users yet.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>
                    <span className={`badge badge-${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    <span className={`badge ${u.active ? 'badge-pass' : 'badge-fail'}`}>
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    <div className="action-group">
                      <select className="select select-sm"
                        value={u.role}
                        onChange={e => changeRole(u.id, e.target.value)}>
                        <option value="viewer">Viewer</option>
                        <option value="evaluator">Evaluator</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        className={`btn btn-sm ${u.active ? 'btn-danger' : 'btn-success'}`}
                        onClick={() => toggleActive(u.id, !u.active)}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SAMPLING REQUIREMENTS */}
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
    </div>
  )
}