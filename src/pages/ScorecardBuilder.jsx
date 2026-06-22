import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function ScorecardBuilder() {
  const { id } = useParams()
  const { profile, unsavedChanges, setUnsavedChanges, setShowNavModal, setPendingNavPath } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('settings')
  const [scorecard, setScorecard] = useState(null)
  const [metadata, setMetadata] = useState([])
  const [groups, setGroups] = useState([])
  const [questions, setQuestions] = useState([])
  const [sections, setSections] = useState([])
  const [dsatQuestions, setDsatQuestions] = useState([])
  const [dsatOptions, setDsatOptions] = useState([])
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeQuestion, setActiveQuestion] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 }
  }))

  const leavingRef = React.useRef(false)

  const markChanged = () => setUnsavedChanges(true)
  const clearChanged = () => setUnsavedChanges(false)

  const logHistory = async (changeType) => {
    try {
      await supabase.from('scorecard_history').insert({
        scorecard_id: id,
        changed_by: profile.id,
        change_type: changeType,
        changed_at: new Date().toISOString(),
        snapshot: {
          scorecard: { name: scorecard.name, description: scorecard.description, is_published: scorecard.is_published },
          questions: questions.map(q => ({
            title: q.title, weight: q.weight, description: q.description,
            is_form_critical: q.is_form_critical, allow_na: q.allow_na
          }))
        }
      })
    } catch (e) {
      console.warn('History log failed:', e.message)
    }
  }

  

  useEffect(() => {
    return () => {
      leavingRef.current = true
      setUnsavedChanges(false)
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (unsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [unsavedChanges])

  useEffect(() => {
    if (!unsavedChanges) return
    // Push a dummy state so we can intercept the back button
    window.history.pushState(null, '', window.location.href)
    const handlePopState = () => {
      if (unsavedChanges) {
        // Push again to prevent the navigation
        window.history.pushState(null, '', window.location.href)
        setPendingNavPath(-1)
        setShowNavModal(true)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [unsavedChanges])

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

    if (sc.data?.type === 'dsat') {
      const [secs, dqs, opts] = await Promise.all([
        supabase.from('dsat_sections').select('*').eq('scorecard_id', id).order('position'),
        supabase.from('dsat_questions').select('*').eq('scorecard_id', id).order('position'),
        supabase.from('dsat_options').select('*').order('position'),
      ])
      setSections(secs.data || [])
      setDsatQuestions(dqs.data || [])
      setDsatOptions(opts.data || [])
    }
    setLoading(false)
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const isPublished = scorecard?.is_published

  const checkTotalWeight = () => {
    if (scorecard?.type !== 'quality') return true
    const total = questions.reduce((sum, q) => sum + (q.weight || 1), 0)
    if (total > 100) {
      return confirm(`The total weight of all questions is ${total}, which exceeds 100. Scores will still calculate correctly as a percentage but may not reflect your intended scoring. Are you sure you want to continue?`)
    }
    if (total < 100) {
      return confirm(`The total weight of all questions is ${total}, which is below 100. Scores will still calculate correctly as a percentage but may not reflect your intended scoring. Are you sure you want to continue?`)
    }
    return true
  }

  const saveAllChanges = async () => {
    if (leavingRef.current) return
    if (!checkTotalWeight()) return
    try {
      await supabase.from('scorecards').update({
        name: scorecard.name,
        description: scorecard.description,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      await Promise.all(questions.map((q, i) =>
        supabase.from('scorecard_questions').update({
          title: q.title, description: q.description,
          weight: q.weight, is_weighted: q.is_weighted,
          is_form_critical: q.is_form_critical,
          is_group_critical: q.is_group_critical,
          allow_na: q.allow_na,
          group_id: q.group_id, position: i + 1
        }).eq('id', q.id)
      ))

      await Promise.all(groups.map(g =>
        supabase.from('scorecard_question_groups')
          .update({ name: g.name }).eq('id', g.id)
      ))

      await Promise.all(metadata.map(f =>
        supabase.from('scorecard_metadata_fields').update({
          label: f.label, field_type: f.field_type,
          is_required: f.is_required, options: f.options
        }).eq('id', f.id)
      ))

      if (scorecard.type === 'dsat') {
        await Promise.all(sections.map(s =>
          supabase.from('dsat_sections')
            .update({ title: s.title, description: s.description }).eq('id', s.id)
        ))
        await Promise.all(dsatQuestions.map(q =>
          supabase.from('dsat_questions').update({
            title: q.title, description: q.description, is_required: q.is_required,
            question_type: q.question_type || 'options'
          }).eq('id', q.id)
        ))
        await Promise.all(dsatOptions.map(o =>
          supabase.from('dsat_options').update({
            label: o.label, jump_to_section_id: o.jump_to_section_id
          }).eq('id', o.id)
        ))
      }

      clearChanged()
      await logHistory('save')
    flash('All changes saved ✓')
    } catch (err) {
      flash('Failed to save: ' + err.message, false)
    }
  }

  const togglePublish = async () => {
    if (!scorecard.is_published && !checkTotalWeight()) return
    if (unsavedChanges) await saveAllChanges()
    const newVal = !scorecard.is_published
    const { error } = await supabase.from('scorecards').update({ is_published: newVal }).eq('id', id)
    if (error) return flash(error.message, false)
    setScorecard(s => ({ ...s, is_published: newVal }))
    await logHistory(newVal ? 'publish' : 'unpublish')
  flash(newVal ? 'Scorecard published' : 'Scorecard unpublished')
  }

  const addMetaField = async () => {
    if (metadata.length >= 10) return flash('Maximum 10 metadata fields allowed.', false)
    const { data, error } = await supabase.from('scorecard_metadata_fields').insert({
      scorecard_id: id, label: 'New Field', field_type: 'text',
      is_required: true, position: metadata.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setMetadata(m => [...m, data])
    markChanged()
  }

  const updateMetaField = async (fieldId, updates) => {
    setMetadata(m => m.map(f => f.id === fieldId ? { ...f, ...updates } : f))
    if (!isPublished) await supabase.from('scorecard_metadata_fields').update(updates).eq('id', fieldId)
    else markChanged()
  }

  const deleteMetaField = async (fieldId) => {
    await supabase.from('scorecard_metadata_fields').delete().eq('id', fieldId)
    setMetadata(m => m.filter(f => f.id !== fieldId))
    if (isPublished) markChanged()
  }

  const addGroup = async () => {
    const { data, error } = await supabase.from('scorecard_question_groups').insert({
      scorecard_id: id, name: 'New Group', position: groups.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setGroups(g => [...g, data])
    if (isPublished) markChanged()
  }

  const updateGroup = async (groupId, updates) => {
    setGroups(g => g.map(gr => gr.id === groupId ? { ...gr, ...updates } : gr))
    if (!isPublished) await supabase.from('scorecard_question_groups').update(updates).eq('id', groupId)
    else markChanged()
  }

  const deleteGroup = async (groupId) => {
    if (!confirm('Delete this group? Questions inside will become ungrouped.')) return
    await supabase.from('scorecard_question_groups').delete().eq('id', groupId)
    setGroups(g => g.filter(gr => gr.id !== groupId))
    setQuestions(q => q.map(qs => qs.group_id === groupId ? { ...qs, group_id: null } : qs))
    if (isPublished) markChanged()
  }

  const addQuestion = async (groupId = null) => {
    const { data, error } = await supabase.from('scorecard_questions').insert({
      scorecard_id: id, group_id: groupId, title: 'New Question',
      weight: 1, is_weighted: true, is_form_critical: false,
      is_group_critical: false, allow_na: true, position: questions.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setQuestions(q => [...q, data])
    if (isPublished) markChanged()
  }

  const updateQuestion = async (qId, updates) => {
    setQuestions(q => q.map(qs => qs.id === qId ? { ...qs, ...updates } : qs))
    if (!isPublished) await supabase.from('scorecard_questions').update(updates).eq('id', qId)
    else markChanged()
  }

  const deleteQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('scorecard_questions').delete().eq('id', qId)
    setQuestions(q => q.filter(qs => qs.id !== qId))
    if (isPublished) markChanged()
  }

  const handleDragStart = (event) => {
    const q = questions.find(q => q.id === event.active.id)
    setActiveQuestion(q)
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    setActiveQuestion(null)
    if (!over) return
    const activeQ = questions.find(q => q.id === active.id)
    if (!activeQ) return

    let newGroupId = activeQ.group_id
    if (over.id.startsWith('group-')) newGroupId = over.id.replace('group-', '')
    else if (over.id === 'ungrouped') newGroupId = null
    else {
      const overQ = questions.find(q => q.id === over.id)
      if (overQ) newGroupId = overQ.group_id
    }

    let reordered = questions.map(q =>
      q.id === active.id ? { ...q, group_id: newGroupId } : q
    )
    const oldIndex = reordered.findIndex(q => q.id === active.id)
    const newIndex = over.id === active.id ? oldIndex : reordered.findIndex(q => q.id === over.id)
    if (newIndex !== -1 && oldIndex !== newIndex) reordered = arrayMove(reordered, oldIndex, newIndex)

    setQuestions(reordered)

    if (!isPublished) {
      await Promise.all(reordered.map((q, i) =>
        supabase.from('scorecard_questions').update({ position: i + 1, group_id: q.group_id }).eq('id', q.id)
      ))
    } else {
      markChanged()
    }
  }

  const addSection = async () => {
    const { data, error } = await supabase.from('dsat_sections').insert({
      scorecard_id: id, title: 'New Section', position: sections.length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setSections(s => [...s, data])
    if (isPublished) markChanged()
  }

  const addCommentSection = async () => {
    const { data: sectionData, error: sectionError } = await supabase.from('dsat_sections').insert({
      scorecard_id: id, title: 'Comments', position: sections.length + 1
    }).select().single()
    if (sectionError) return flash(sectionError.message, false)
    setSections(s => [...s, sectionData])

    const { data: questionData, error: questionError } = await supabase.from('dsat_questions').insert({
      scorecard_id: id, section_id: sectionData.id, title: 'Comments',
      is_required: false, question_type: 'free_text',
      position: 1
    }).select().single()
    if (questionError) return flash(questionError.message, false)
    setDsatQuestions(q => [...q, questionData])

    if (isPublished) markChanged()
    flash('Comment section added ✓')
  }

  const updateSection = async (sId, updates) => {
    setSections(s => s.map(sec => sec.id === sId ? { ...sec, ...updates } : sec))
    if (!isPublished) await supabase.from('dsat_sections').update(updates).eq('id', sId)
    else markChanged()
  }

  const deleteSection = async (sId) => {
    if (!confirm('Delete this section and all its questions?')) return
    await supabase.from('dsat_sections').delete().eq('id', sId)
    setSections(s => s.filter(sec => sec.id !== sId))
    setDsatQuestions(q => q.filter(dq => dq.section_id !== sId))
    if (isPublished) markChanged()
  }

  const addDsatQuestion = async (sectionId) => {
    const { data, error } = await supabase.from('dsat_questions').insert({
      scorecard_id: id, section_id: sectionId, title: 'New Question',
      is_required: true, position: dsatQuestions.filter(q => q.section_id === sectionId).length + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setDsatQuestions(q => [...q, data])
    if (isPublished) markChanged()
  }

  const updateDsatQuestion = async (qId, updates) => {
    setDsatQuestions(q => q.map(dq => dq.id === qId ? { ...dq, ...updates } : dq))
    if (!isPublished) await supabase.from('dsat_questions').update(updates).eq('id', qId)
    else markChanged()
  }

  const deleteDsatQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('dsat_questions').delete().eq('id', qId)
    setDsatQuestions(q => q.filter(dq => dq.id !== qId))
    setDsatOptions(o => o.filter(opt => opt.question_id !== qId))
    if (isPublished) markChanged()
  }

  const addOption = async (questionId) => {
    const count = dsatOptions.filter(o => o.question_id === questionId).length
    const { data, error } = await supabase.from('dsat_options').insert({
      question_id: questionId, label: `Option ${count + 1}`, position: count + 1
    }).select().single()
    if (error) return flash(error.message, false)
    setDsatOptions(o => [...o, data])
    if (isPublished) markChanged()
  }

  const updateOption = async (optId, updates) => {
    setDsatOptions(o => o.map(opt => opt.id === optId ? { ...opt, ...updates } : opt))
    if (!isPublished) await supabase.from('dsat_options').update(updates).eq('id', optId)
    else markChanged()
  }

  const deleteOption = async (optId) => {
    await supabase.from('dsat_options').delete().eq('id', optId)
    setDsatOptions(o => o.filter(opt => opt.id !== optId))
    if (isPublished) markChanged()
  }

  if (loading) return <div className="page"><div className="spinner" /></div>
  if (!scorecard) return <div className="page"><p>Scorecard not found.</p></div>

  const ungroupedQuestions = questions.filter(q => !q.group_id)
  const tabs = scorecard.type === 'dsat' ? ['settings', 'metadata', 'sections'] : ['settings', 'metadata', 'questions']

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate('/scorecards')}>
            ← Back to Scorecards
          </button>
          <h1>{scorecard.name}</h1>
          <p className="page-sub">
            {scorecard.type === 'quality' ? 'Quality Scorecard Builder' : 'DSAT Scorecard Builder'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {unsavedChanges && (
            <span style={{ fontSize: 12, color: '#f59e0b' }}>● Unsaved changes</span>
          )}
          <span className={`badge ${scorecard.is_published ? 'badge-pass' : 'badge-fail'}`}>
            {scorecard.is_published ? 'Published' : 'Draft'}
          </span>
          {scorecard.is_published && (
            <button
              className="btn btn-sm btn-primary"
              style={{ opacity: unsavedChanges ? 1 : 0.4 }}
              onClick={unsavedChanges ? saveAllChanges : undefined}>
              Save Changes
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/scorecards/${id}/history`)}>
            History
          </button>
          <button
            className={`btn btn-sm ${scorecard.is_published ? 'btn-danger' : 'btn-primary'}`}
            onClick={togglePublish}>
            {scorecard.is_published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}

      <div className="tabs">
        {tabs.map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'settings' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>Scorecard Settings</div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Name</label>
            <input className="input" value={scorecard.name}
              onChange={e => { setScorecard(s => ({ ...s, name: e.target.value })); markChanged() }} />
          </div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Description</label>
            <textarea className="input" rows={3} value={scorecard.description || ''}
              onChange={e => { setScorecard(s => ({ ...s, description: e.target.value })); markChanged() }}
              style={{ resize: 'vertical' }} />
          </div>
          <div className="form-field" style={{ marginBottom: 16 }}>
            <label>Type</label>
            <input className="input" value={scorecard.type === 'quality' ? 'Quality Evaluation' : 'DSAT'}
              disabled style={{ opacity: 0.6 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
              Scorecard type cannot be changed after creation.
            </span>
          </div>
          {!isPublished && (
            <button className="btn btn-primary" onClick={async () => {
              const { error } = await supabase.from('scorecards')
                .update({ name: scorecard.name, description: scorecard.description, updated_at: new Date().toISOString() })
                .eq('id', id)
              if (error) return flash(error.message, false)
              clearChanged()
              flash('Settings saved')
            }}>Save Settings</button>
          )}
        </div>
      )}

      {tab === 'metadata' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ color: 'var(--text-secondary)' }}>{metadata.length}/10 metadata fields</p>
            <button className="btn btn-primary btn-sm" onClick={addMetaField} disabled={metadata.length >= 10}>
              + Add Field
            </button>
          </div>
          {metadata.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
              No metadata fields yet.
            </div>
          )}
          {metadata.map(field => (
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
                    <label>Options — type and press Enter or comma to add (max 50)</label>
                    <DropdownOptionsEditor
                      options={field.options || []}
                      onChange={opts => updateMetaField(field.id, { options: opts })}
                    />
                  </div>
                )}
                <div className="form-field form-field-btn">
                  <label>&nbsp;</label>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => deleteMetaField(field.id)}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'questions' && scorecard.type === 'quality' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={() => addQuestion(null)}>+ Add Question</button>
              <button className="btn btn-ghost btn-sm" onClick={addGroup}>+ Add Group</button>
            </div>
            {(() => {
              const total = questions.reduce((sum, q) => sum + (q.weight || 1), 0)
              const color = total === 100 ? 'var(--success)' : total > 100 ? 'var(--danger)' : '#f59e0b'
              const label = total === 100 ? '✓' : total > 100 ? '▲' : '▼'
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13
                }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Weight:</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color }}>{total}</span>
                  <span style={{ color, fontSize: 12 }}>{label} {total === 100 ? 'Perfect' : total > 100 ? 'Exceeds 100' : 'Below 100'}</span>
                </div>
              )
            })()}
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <DroppableZone id="ungrouped">
              <div style={{ minHeight: 40 }}>
                {ungroupedQuestions.length === 0 && (
                  <div style={{
                    padding: '12px 16px', border: '2px dashed var(--border)', borderRadius: 8,
                    color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8, textAlign: 'center'
                  }}>Drop questions here to ungroup them</div>
                )}
                <SortableContext items={ungroupedQuestions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                  {ungroupedQuestions.map(q => (
                    <SortableQuestionCard key={q.id} question={q}
                      onUpdate={updateQuestion} onDelete={deleteQuestion} groupId={null} />
                  ))}
                </SortableContext>
              </div>
            </DroppableZone>

            {groups.map(group => {
              const groupQs = questions.filter(q => q.group_id === group.id)
              return (
                <div key={group.id} className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <input className="input" style={{ fontWeight: 600, fontSize: 15, maxWidth: 400 }}
                      value={group.name} onChange={e => updateGroup(group.id, { name: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => addQuestion(group.id)}>
                        + Add Question to Group
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                        onClick={() => deleteGroup(group.id)}>Delete Group</button>
                    </div>
                  </div>
                  <DroppableZone id={`group-${group.id}`}>
                    <div style={{ minHeight: 40 }}>
                      {groupQs.length === 0 && (
                        <div style={{
                          padding: '12px 16px', border: '2px dashed var(--border)', borderRadius: 8,
                          color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center'
                        }}>Drop questions here</div>
                      )}
                      <SortableContext items={groupQs.map(q => q.id)} strategy={verticalListSortingStrategy}>
                        {groupQs.map(q => (
                          <SortableQuestionCard key={q.id} question={q}
                            onUpdate={updateQuestion} onDelete={deleteQuestion} groupId={group.id} />
                        ))}
                      </SortableContext>
                    </div>
                  </DroppableZone>
                </div>
              )
            })}

            <DragOverlay>
              {activeQuestion && (
                <div className="card" style={{ borderLeft: '3px solid var(--accent)', opacity: 0.9, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  <div style={{ padding: '8px 12px', fontWeight: 500 }}>{activeQuestion.title}</div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {tab === 'sections' && scorecard.type === 'dsat' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <p style={{ color: 'var(--text-secondary)' }}>
              Build sections and questions. Each answer option can jump to a specific section.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={addSection}>+ Add Section</button>
              <button className="btn btn-ghost btn-sm" onClick={addCommentSection}>+ Add Comment Section</button>
            </div>
          </div>
          {sections.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
              No sections yet.
            </div>
          )}
          {sections.map((section, sIdx) => (
            <div key={section.id} className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ flex: 1, marginRight: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>SECTION {sIdx + 1}</div>
                  <input className="input" style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}
                    value={section.title} onChange={e => updateSection(section.id, { title: e.target.value })} />
                  <input className="input" style={{ fontSize: 13 }} placeholder="Section description (optional)"
                    value={section.description || ''} onChange={e => updateSection(section.id, { description: e.target.value })} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => addDsatQuestion(section.id)}>+ Add Question</button>
                  <button className="btn btn-sm btn-ghost" style={{ color: 'var(--danger)' }}
                    onClick={() => deleteSection(section.id)}>Delete Section</button>
                </div>
              </div>
              {dsatQuestions.filter(q => q.section_id === section.id).map(q => (
                <DsatQuestionCard key={q.id} question={q}
                  options={dsatOptions.filter(o => o.question_id === q.id)}
                  sections={sections}
                  onUpdateQuestion={updateDsatQuestion}
                  onDeleteQuestion={deleteDsatQuestion}
                  onAddOption={addOption}
                  onUpdateOption={updateOption}
                  onDeleteOption={deleteOption} />
              ))}
              {dsatQuestions.filter(q => q.section_id === section.id).length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No questions in this section yet.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DroppableZone({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} style={{
      transition: 'background 0.2s',
      background: isOver ? 'rgba(99,102,241,0.07)' : 'transparent',
      borderRadius: 8, padding: 4
    }}>
      {children}
    </div>
  )
}

function SortableQuestionCard({ question, onUpdate, onDelete, groupId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const [expanded, setExpanded] = useState(false)

  return (
    <div ref={setNodeRef} style={{ ...style, marginBottom: 10 }}>
      <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span {...attributes} {...listeners}
              style={{ cursor: 'grab', color: 'var(--text-secondary)', fontSize: 18, userSelect: 'none', touchAction: 'none' }}>
              ⠿
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => !e)}>
              {expanded ? '▲' : '▼'}
            </button>
            <input className="input" style={{ flex: 1 }} value={question.title}
              onChange={e => onUpdate(question.id, { title: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
            {question.is_form_critical && <span className="badge badge-fail">Form Critical</span>}
            {question.is_group_critical && groupId && <span className="badge badge-fail">Group Critical</span>}
            {!question.allow_na && <span className="badge badge-channel">No N/A</span>}
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
              onClick={() => onDelete(question.id)}>✕</button>
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
                  value={question.weight} disabled={!question.is_weighted}
                  onChange={e => onUpdate(question.id, { weight: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: 12 }}>
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
                <label>Allow N/A?</label>
                <select className="select" value={question.allow_na !== false ? 'yes' : 'no'}
                  onChange={e => onUpdate(question.id, { allow_na: e.target.value === 'yes' })}>
                  <option value="yes">Yes — evaluator can select N/A</option>
                  <option value="no">No — must be Pass or Fail</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DsatQuestionCard({ question, options, sections, onUpdateQuestion, onDeleteQuestion, onAddOption, onUpdateOption, onDeleteOption, freeTextValue, onFreeTextChange }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="card" style={{ marginBottom: 10, borderLeft: '3px solid var(--accent)', background: 'var(--bg-main)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(e => !e)}>
            {expanded ? '▲' : '▼'}
          </button>
          <input className="input" style={{ flex: 1 }} value={question.title}
            onChange={e => onUpdateQuestion(question.id, { title: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
          <span className={`badge ${question.is_required ? 'badge-fail' : 'badge-channel'}`}>
            {question.is_required ? 'Required' : 'Optional'}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
            onClick={() => onDeleteQuestion(question.id)}>✕</button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <div className="form-row">
            <div className="form-field" style={{ flex: 3 }}>
              <label>Description (optional)</label>
              <input className="input" placeholder="Add helper text..."
                value={question.description || ''}
                onChange={e => onUpdateQuestion(question.id, { description: e.target.value })} />
            </div>
            <div className="form-field">
              <label>Required?</label>
              <select className="select" value={question.is_required ? 'yes' : 'no'}
                onChange={e => onUpdateQuestion(question.id, { is_required: e.target.value === 'yes' })}>
                <option value="yes">Required</option>
                <option value="no">Optional</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            {question.question_type === 'free_text' ? (
              <div>
                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>FREE TEXT RESPONSE</label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Evaluator will type their response here…"
                  disabled
                  style={{ resize: 'vertical', opacity: 0.6, cursor: 'not-allowed', width: '100%' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  This field will accept free-text input during evaluation.
                </span>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>ANSWER OPTIONS</label>
                  <button className="btn btn-ghost btn-sm" onClick={() => onAddOption(question.id)}>+ Add Option</button>
                </div>
                {options.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No options yet. Add at least 2.</p>
                )}
                {options.map(opt => (
                  <div key={opt.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>○</span>
                    <input className="input" style={{ flex: 2 }} placeholder="Option label"
                      value={opt.label} onChange={e => onUpdateOption(opt.id, { label: e.target.value })} />
                    <select className="select" style={{ flex: 2 }}
                      value={opt.jump_to_section_id || ''}
                      onChange={e => onUpdateOption(opt.id, { jump_to_section_id: e.target.value || null })}>
                      <option value="">Continue to next section</option>
                      {sections.map(s => (
                        <option key={s.id} value={s.id}>Jump to: {s.title}</option>
                      ))}
                      <option value="end">End of form</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                      onClick={() => onDeleteOption(opt.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DropdownOptionsEditor({ options, onChange }) {
  const [inputVal, setInputVal] = useState('')

  const addOption = (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (options.length >= 50) return
    if (options.includes(trimmed)) return
    onChange([...options, trimmed])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addOption(inputVal)
      setInputVal('')
    } else if (e.key === 'Backspace' && inputVal === '' && options.length > 0) {
      onChange(options.slice(0, -1))
    }
  }

  const removeOption = (idx) => {
    onChange(options.filter((_, i) => i !== idx))
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '6px 8px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        minHeight: 42,
        cursor: 'text'
      }}
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      {options.map((opt, idx) => (
        <span key={idx} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-main)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 13,
          color: 'var(--text-primary)', whiteSpace: 'nowrap'
        }}>
          {opt}
          <button
            onClick={() => removeOption(idx)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 14, padding: 0,
              lineHeight: 1, display: 'flex', alignItems: 'center'
            }}
          >×</button>
        </span>
      ))}
      {options.length < 50 && (
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { addOption(inputVal); setInputVal('') }}
          placeholder={options.length === 0 ? 'Type an option, press Enter or comma…' : '+'}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 13,
            minWidth: options.length === 0 ? 260 : 40, flex: 1
          }}
        />
      )}
      {options.length >= 50 && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          Max 50 options reached
        </span>
      )}
    </div>
  )
}
// force redeploy Fri Jun 19 08:45:34 UTC 2026
