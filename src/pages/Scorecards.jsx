import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

// Default metadata fields seeded on every new scorecard, pre-tagged for the dashboard.
// Admins can edit or delete these afterwards — they are sensible defaults, not locked-in.
const CORE_META_FIELDS = [
  { label: 'Ticket ID',          field_type: 'number',   system_tag: 'ticket_id',          is_required: true },
  { label: 'Communication Date', field_type: 'date',     system_tag: 'communication_date', is_required: true },
  { label: 'Market',             field_type: 'dropdown', system_tag: 'market',             is_required: true,  options: [] },
  { label: 'BPO',                field_type: 'dropdown', system_tag: 'bpo',                is_required: true,  options: [] },
  { label: "Agent's Email",      field_type: 'text',     system_tag: 'agent_email',        is_required: true },
  { label: 'Channel',            field_type: 'dropdown', system_tag: 'channel',            is_required: true,  options: [] },
]

// DSAT scorecards additionally capture the agent's own category selections.
const DSAT_EXTRA_META_FIELDS = [
  { label: 'Category Level 1', field_type: 'dropdown', system_tag: 'category_level_1', is_required: true, options: [] },
  { label: 'Category Level 2', field_type: 'dropdown', system_tag: 'category_level_2', is_required: true, options: [] },
]

const seededFieldsForType = (type) =>
  type === 'dsat' ? [...CORE_META_FIELDS, ...DSAT_EXTRA_META_FIELDS] : [...CORE_META_FIELDS]

export default function Scorecards() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [scorecards, setScorecards] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newType, setNewType] = useState('quality')
  const [msg, setMsg] = useState(null)

  const canEdit = ['admin', 'owner'].includes(profile?.role)

  useEffect(() => { loadScorecards() }, [])

  const loadScorecards = async () => {
    const { data } = await supabase
      .from('scorecards')
      .select('*, users(name)')
      .order('created_at', { ascending: false })
    setScorecards(data || [])
    setLoading(false)
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const createScorecard = async () => {
    if (!newName.trim()) return flash('Scorecard name is required.', false)
    const { data, error } = await supabase
      .from('scorecards')
      .insert({ name: newName.trim(), description: newDesc.trim(), type: newType, created_by: profile.id })
      .select()
      .single()
    if (error) return flash(error.message, false)

    // Seed default, pre-tagged metadata fields so the dashboard has reliable fields to query.
    const seedFields = seededFieldsForType(newType).map((f, i) => ({
      scorecard_id: data.id,
      label: f.label,
      field_type: f.field_type,
      is_required: f.is_required,
      options: f.options ?? null,
      system_tag: f.system_tag,
      position: i + 1,
    }))
    const { error: seedError } = await supabase.from('scorecard_metadata_fields').insert(seedFields)
    if (seedError) flash('Scorecard created, but seeding metadata failed: ' + seedError.message, false)

    setCreating(false)
    setNewName('')
    setNewDesc('')
    setNewType('quality')
    navigate(`/scorecards/${data.id}/edit`)
  }

  const deleteScorecard = async (id) => {
    if (!confirm('Delete this scorecard? This cannot be undone.')) return
    await supabase.from('scorecards').delete().eq('id', id)
    await loadScorecards()
    flash('Scorecard deleted')
  }

  if (loading) return <div className="page"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Scorecards</h1>
          <p className="page-sub">Build and manage your evaluation scorecards</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New Scorecard
          </button>
        )}
      </div>

      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}

      {creating && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>New Scorecard</div>
          <div className="form-row">
            <div className="form-field">
              <label>Name</label>
              <input className="input" placeholder="e.g. Chat Quality Scorecard"
                value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Description (optional)</label>
              <input className="input" placeholder="What is this scorecard for?"
                value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select className="select" value={newType} onChange={e => setNewType(e.target.value)}>
                <option value="quality">Quality Evaluation</option>
                <option value="dsat">DSAT</option>
              </select>
            </div>
            <div className="form-field form-field-btn">
              <label>&nbsp;</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={createScorecard}>Create & Edit</button>
                <button className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            {newType === 'quality'
              ? '📋 Quality scorecards include weighted questions, critical question logic, and automatic scoring.'
              : '📊 DSAT scorecards include free answer options, sections, and conditional branching — no scoring.'}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Description</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Created At</th>
              <th>Last Modified</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {scorecards.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7} className="empty-row">No scorecards yet. Create your first one.</td></tr>
            )}
            {scorecards.map(sc => (
              <tr key={sc.id}>
                <td style={{ fontWeight: 500 }}>{sc.name}</td>
                <td>
                  <span className={`badge ${sc.type === 'quality' ? 'badge-admin' : 'badge-channel'}`}>
                    {sc.type === 'quality' ? 'Quality' : 'DSAT'}
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{sc.description || '-'}</td>
                <td>
                  <span className={`badge ${sc.is_published ? 'badge-pass' : 'badge-fail'}`}>
                    {sc.is_published ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{sc.users?.name || '-'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {new Date(sc.created_at).toLocaleDateString()}
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>
                  {sc.updated_at ? new Date(sc.updated_at).toLocaleDateString() : '-'}
                </td>
                {canEdit && (
                  <td>
                    <div className="action-group">
                      <button className="btn btn-sm btn-ghost"
                        onClick={() => navigate(`/scorecards/${sc.id}/edit`)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => deleteScorecard(sc.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
