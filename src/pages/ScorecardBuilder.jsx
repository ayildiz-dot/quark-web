import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function ScorecardBuilder() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('settings')
  const [scorecard, setScorecard] = useState(null)
  const [metadata, setMetadata] = useState([])
  const [groups, setGroups] = useState([])
  const [questions, setQuestions] = useState([])
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [id])

  const loadAll = async () => {
    const [sc, meta, grp, qs] = await Promise.all([
      supabase.from('scorecards').select('*').eq('id', id).single(),
      supabase.from('scorecard_metadata_fields').select('*').eq('scorecard_id', id).order('position'),
      supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', id).order('position'),
      supabase.from('scorecard_questions').select('*').eq('scorecard_id', id).order('position'),
    ])
    setScorecard(sc.data)
    setMetadata(meta.data || [])
    setGroups(grp.data || [])
    setQuestions(qs.data || [])
    setLoading(false)
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  // SETTINGS
  const saveSettings = async () => {
    const { error } = await supabase.from('scorecards')
      .update({ name: scorecard.name, description: scorecard.description, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return flash(error.message, false)
    flash('Settings saved')
  }

  const togglePublish = async () => {
    const newVal = !scorecard.is_published
    const { error } = await supabase.from('scorecards').update({ is_published: newVal }).eq('id', id)
    if (error) return flash(error.message, false)
    setScorecard(s => ({ ...s, is_published: newVal }))
    flash(newVal ? 'Scorecard published' : 'Scorecard unpublished')
  }

  // METADATA
  const addMetaField = async () => {
    if (metadata.length >= 10) return flash('Maximum 10 metadata fields allowed.', false)
    const { data, error } = await supabase.from('scorecard_metadata_fields').insert({
      scorecard_id: id, label: 'New Field', field_type: 'text',
      is_required: true, position: metadata.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setMetadata(m => [...m, data])
  }

  const updateMetaField = async (fieldId, updates) => {
    setMetadata(m => m.map(f => f.id === fieldId ? { ...f, ...updates } : f))
    await supabase.from('scorecard_metadata_fields').update(updates).eq('id', fieldId)
  }

  const deleteMetaField = async (fieldId) => {
    await supabase.from('scorecard_metadata_fields').delete().eq('id', fieldId)
    setMetadata(m => m.filter(f => f.id !== fieldId))
    flash('Field removed')
  }

  // GROUPS
  const addGroup = async () => {
    const { data, error } = await supabase.from('scorecard_question_groups').insert({
      scorecard_id: id, name: 'New Group', position: groups.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setGroups(g => [...g, data])
  }

  const updateGroup = async (groupId, updates) => {
    setGroups(g => g.map(gr => gr.id === groupId ? { ...gr, ...updates } : gr))
    await supabase.from('scorecard_question_groups').update(updates).eq('id', groupId)
  }

  const deleteGroup = async (groupId) => {
    if (!confirm('Delete this group? Questions inside will become ungrouped.')) return
    await supabase.from('scorecard_question_groups').delete().eq('id', groupId)
    setGroups(g => g.filter(gr => gr.id !== groupId))
    setQuestions(q => q.map(qs => qs.group_id === groupId ? { ...qs, group_id: null } : qs))
    flash('Group deleted')
  }

  // QUESTIONS
  const addQuestion = async (groupId = null) => {
    const { data, error } = await supabase.from('scorecard_questions').insert({
      scorecard_id: id, group_id: groupId, title: 'New Question',
      weight: 1, is_weighted: true, is_form_critical: false,
      is_group_critical: false, position: questions.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setQuestions(q => [...q, data])
  }

  const updateQuestion = async (qId, updates) => {
    setQuestions(q => q.map(qs => qs.id === qId ? { ...qs, ...updates } : qs))
    await supabase.from('scorecard_questions').update(updates).eq('id', qId)
  }

  const deleteQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('scorecard_questions').delete().eq('id', qId)
    setQuestions(q => q.filter(qs => qs.id !== qId))
    flash('Question deleted')
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!scorecard) return <div className="page"><p>Scorecard not found.</p></div>

  const ungroupedQuestions = questions.filter(q => !q.group_id)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate('/scorecards')}>
            ← Back to Scorecards
          </button>
          <h1>{scorecard.name}</h1>
          <p className="page-sub">Scorecard Builder</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${scorecard.is_published ? 'badge-pass' : 'badge-fail'}`}>
            {scorecard.is_published ? 'Published' : 'Draft'}
          </span>
          <button
            className={`btn btn-sm ${scorecard.is_published ? 'btn-danger' : 'btn-primary'}`}
            onClick={togglePublish}>
            {scorecard.is_published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}

      <div className="tabs">
        {['settings', 'metadata', 'questions'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* SETTINGS TAB */}
      {tab === 'settings' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Scorecard Settings</div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Name</label>
            <input className="input" value={scorecard.name}
              onChange={e => setScorecard(s => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Description</label>
            <textarea className="input" rows={3} value={scorecard.description || ''}
              onChange={e => setScorecard(s => ({ ...s, description: e.target.value }))}
              style={{ resize: 'vertical' }} />
          </div>
          <button className="btn btn-primary" onClick={saveSettings}>Save Settings</button>
        </div>
      )}

      {/* METADATA TAB */}
      {tab === 'metadata' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              {metadata.length}/10 metadata fields — these appear at the top of the evaluation form
            </p>
            <button className="btn btn-primary btn-sm" onClick={addMetaField}
              disabled={metadata.length >= 10}>
              + Add Field
            </button>
          </div>

          {metadata.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
              No metadata fields yet. Add fields like Agent Name, Queue, Channel etc.
            </div>
          )}

          {metadata.map((field, idx) => (
            <div key={field.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="form-field" style={{ flex: 2, minWidth: 180 }}>
                  <label>Field Label</label>
                  <input className="input" value={field.label}
                    onChange={e => updateMetaField(field.id, { label: e.target.value })} />
                </div>
                <div className="form-field" style={{ flex: 1, minWidth: 120 }}>
                  <label>Type</label>
                  <select className="select" value={field.field_type}
                    onChange={e => updateMetaField(field.id, { field_type: e.target.value })}>
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="dropdown">Dropdown</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <div className="form-field" style={{ flex: 1, minWidth: 120 }}>
                  <label>Required?</label>
                  <select className="select" value={field.is_required ? 'yes' : 'no'}
                    onChange={e => updateMetaField(field.id, { is_required: e.target.value === 'yes' })}>
                    <option value="yes">Required</option>
                    <option value="no">Optional</option>
                  </select>
                </div>
                {field.field_type === 'dropdown' && (
                  <div className="form-field" style={{ flex: 3, minWidth: 200 }}>
                    <label>Options (comma separated)</label>
                    <input className="input"
                      placeholder="e.g. Chat, Email, Phone"
                      value={(field.options || []).join(', ')}
                      onChange={e => updateMetaField(field.id, {
                        options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                      })} />
                  </div>
                )}
                <div className="form-field form-field-btn">
                  <label>&nbsp;</label>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => deleteMetaField(field.id)}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QUESTIONS TAB */}
      {tab === 'questions' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button className="btn btn-primary btn-sm" onClick={() => addQuestion(null)}>
              + Add Question
            </button>
            <button className="btn btn-ghost btn-sm" onClick={addGroup}>
              + Add Group
            </button>
          </div>

          {questions.length === 0 && groups.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
              No questions yet. Add a question or create a group first.
            </div>
          )}

          {/* UNGROUPED QUESTIONS */}
          {ungroupedQuestions.map(q => (
            <QuestionCard key={q.id} question={q} questions={questions}
              onUpdate={updateQuestion} onDelete={deleteQuestion} groupId={null} />
          ))}

          {/* GROUPS */}
          {groups.map(group => (
            <div key={group.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <input
                  className="input"
                  style={{ fontWeight: 600, fontSize: 15, maxWidth: 400 }}
                  value={group.name}
                  onChange={e => updateGroup(group.id, { name: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-ghost"
                    onClick={() => addQuestion(group.id)}>
                    + Add Question to Group
                  </button>
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                    onClick={() => deleteGroup(group.id)}>
                    Delete Group
                  </button>
                </div>
              </div>

              {questions.filter(q => q.group_id === group.id).length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>
                  No questions in this group yet.
                </p>
              )}

              {questions.filter(q => q.group_id === group.id).map(q => (
                <QuestionCard key={q.id} question={q} questions={questions}
                  onUpdate={updateQuestion} onDelete={deleteQuestion} groupId={group.id} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuestionCard({ question, questions, onUpdate, onDelete, groupId }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--accent)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲' : '▼'}
          </button>
          <input className="input" style={{ flex: 1 }}
            value={question.title}
            onChange={e => onUpdate(question.id, { title: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          {question.is_form_critical && <span className="badge badge-fail">Form Critical</span>}
          {question.is_group_critical && groupId && <span className="badge badge-fail">Group Critical</span>}
          {!question.is_weighted && <span className="badge badge-channel">No Weight</span>}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
            onClick={() => onDelete(question.id)}>
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="form-row">
            <div className="form-field" style={{ flex: 3 }}>
              <label>Description (optional)</label>
              <input className="input" placeholder="Add helper text for evaluators..."
                value={question.description || ''}
                onChange={e => onUpdate(question.id, { description: e.target.value })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Weight</label>
              <input type="number" className="input" min={0} step={0.5}
                value={question.weight}
                disabled={!question.is_weighted}
                onChange={e => onUpdate(question.id, { weight: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-field">
              <label>Weighted?</label>
              <select className="select" value={question.is_weighted ? 'yes' : 'no'}
                onChange={e => onUpdate(question.id, { is_weighted: e.target.value === 'yes' })}>
                <option value="yes">Yes</option>
                <option value="no">No (context only)</option>
              </select>
            </div>
            <div className="form-field">
              <label>Form Critical?</label>
              <select className="select" value={question.is_form_critical ? 'yes' : 'no'}
                onChange={e => onUpdate(question.id, { is_form_critical: e.target.value === 'yes' })}>
                <option value="no">No</option>
                <option value="yes">Yes — fails entire evaluation</option>
              </select>
            </div>
            {groupId && (
              <div className="form-field">
                <label>Group Critical?</label>
                <select className="select" value={question.is_group_critical ? 'yes' : 'no'}
                  onChange={e => onUpdate(question.id, { is_group_critical: e.target.value === 'yes' })}>
                  <option value="no">No</option>
                  <option value="yes">Yes — fails group score</option>
                </select>
              </div>
            )}
            <div className="form-field">
              <label>Validation</label>
              <select className="select" value={question.validation_rule || ''}
                onChange={e => onUpdate(question.id, { validation_rule: e.target.value || null })}>
                <option value="">None</option>
                <option value="numbers_only">Numbers only</option>
                <option value="max:200">Max 200 characters</option>
                <option value="required">Required comment</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
