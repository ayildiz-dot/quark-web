import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function EvaluationForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('select')
  const [scorecards, setScorecards] = useState([])
  const [selectedScorecard, setSelectedScorecard] = useState(null)
  const [metadata, setMetadata] = useState([])
  const [groups, setGroups] = useState([])
  const [questions, setQuestions] = useState([])
  const [metaValues, setMetaValues] = useState({})
  const [answers, setAnswers] = useState({})
  const [msg, setMsg] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [overallComment, setOverallComment] = useState('')
  const [dsatSections,        setDsatSections]        = useState([])
  const [dsatQuestions,       setDsatQuestions]       = useState([])
  const [dsatOptions,         setDsatOptions]         = useState([])
  const [dsatAnswers,         setDsatAnswers]         = useState({})
  const [dsatCurrentSectionId, setDsatCurrentSectionId] = useState(null)
  const [dsatSectionHistory,  setDsatSectionHistory]  = useState([])

  useEffect(() => { loadScorecards() }, [])

  const loadScorecards = async () => {
    const { data } = await supabase
      .from('scorecards')
      .select('*')
      .eq('is_published', true)
      .order('name')
    setScorecards(data || [])
  }

  const selectScorecard = async (sc) => {
    setSelectedScorecard(sc)
    // Always load metadata fields
    const { data: metaData } = await supabase
      .from('scorecard_metadata_fields')
      .select('*').eq('scorecard_id', sc.id).order('position')
    setMetadata(metaData || [])
    setMetaValues({})

    if (sc.type === 'dsat') {
      // Load DSAT-specific tables
      const [secs, dqs, opts] = await Promise.all([
        supabase.from('dsat_sections').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_questions').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_options').select('*').order('position'),
      ])
      const secsData = secs.data || []
      setDsatSections(secsData)
      setDsatQuestions(dqs.data || [])
      setDsatOptions(opts.data || [])
      const initDsatAnswers = {}
      for (const q of (dqs.data || [])) {
        initDsatAnswers[q.id] = { value: '' }
      }
      setDsatAnswers(initDsatAnswers)
      // Start at the first section (lowest position)
      const firstSection = secsData.sort((a, b) => a.position - b.position)[0]
      setDsatCurrentSectionId(firstSection?.id || null)
      setDsatSectionHistory([])
      setGroups([])
      setQuestions([])
      setAnswers({})
    } else {
      // Load quality scorecard tables
      const [grp, qs] = await Promise.all([
        supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('scorecard_questions').select('*').eq('scorecard_id', sc.id).order('position'),
      ])
      setGroups(grp.data || [])
      setQuestions(qs.data || [])
      const initAnswers = {}
      for (const q of (qs.data || [])) {
        initAnswers[q.id] = { score: null, comment: '' }
      }
      setAnswers(initAnswers)
      setDsatSections([])
      setDsatQuestions([])
      setDsatOptions([])
      setDsatAnswers({})
    }
    setStep('metadata')
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  const metaValid = () => {
    for (const f of metadata) {
      if (f.is_required && !metaValues[f.id]) return false
    }
    return true
  }

  const questionsValid = () => {
    if (selectedScorecard?.type === 'dsat') {
      for (const q of dsatQuestions) {
        if (q.is_required && !dsatAnswers[q.id]?.value) return false
      }
      return true
    }
    for (const q of questions) {
      if (answers[q.id]?.score === null || answers[q.id]?.score === undefined) return false
    }
    return true
  }

  const calculateScore = () => {
    for (const q of questions) {
      if (q.is_form_critical && answers[q.id]?.score === 'fail') {
        return { score: 0, failed_critical: true }
      }
    }
    let totalWeight = 0
    let earnedWeight = 0
    for (const q of questions) {
      const ans = answers[q.id]?.score
      if (ans === 'na') continue
      if (!q.is_weighted) continue
      const weight = q.weight || 1
      totalWeight += weight
      if (ans === 'pass') earnedWeight += weight
    }
    if (totalWeight === 0) return { score: 100, failed_critical: false }
    const score = Math.round((earnedWeight / totalWeight) * 100)
    return { score, failed_critical: false }
  }

  const submitEvaluation = async () => {
    if (!metaValid()) return flash('Please fill in all required metadata fields.', false)
    if (!questionsValid()) return flash('Please answer all required questions before submitting.', false)
    if (selectedScorecard.type !== 'dsat' && !overallComment.trim()) return flash('Please add an overall comment before submitting.', false)
    setSubmitting(true)
    try {
      const metaPayload = metadata.map(f => ({
        field_id: f.id,
        label: f.label,
        value: metaValues[f.id] || ''
      }))

      if (selectedScorecard.type === 'dsat') {
        // DSAT evaluations have no scoring — just store answers as metadata
        const dsatPayload = dsatQuestions.map(q => ({
          field_id: q.id,
          label: q.title,
          value: dsatAnswers[q.id]?.value || ''
        }))
        const { error: evalError } = await supabase
          .from('evaluations')
          .insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score: 100,
            failed_critical: false,
            metadata_values: [...metaPayload, ...dsatPayload],
            overall_comment: null,
            status: 'submitted',
            submitted_at: new Date().toISOString()
          })
        if (evalError) throw evalError
      } else {
        const { score, failed_critical } = calculateScore()
        const { data: evaluation, error: evalError } = await supabase
          .from('evaluations')
          .insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score,
            failed_critical,
            metadata_values: metaPayload,
            overall_comment: overallComment.trim(),
            status: 'submitted',
            submitted_at: new Date().toISOString()
          })
          .select()
          .single()
        if (evalError) throw evalError
        const scoreRows = questions.map(q => ({
          evaluation_id: evaluation.id,
          question_id: q.id,
          score: answers[q.id]?.score,
          comment: answers[q.id]?.comment || null
        }))
        const { error: scoresError } = await supabase
          .from('evaluation_scores')
          .insert(scoreRows)
        if (scoresError) throw scoresError
      }
      setStep('done')
    } catch (err) {
      flash('Failed to submit: ' + err.message, false)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'select') return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>New Evaluation</h1>
          <p className="page-sub">Select a scorecard to begin</p>
        </div>
      </div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}
      {scorecards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No published scorecards available. Ask an admin to publish a scorecard first.
        </div>
      )}
      <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        {scorecards.map(sc => (
          <div key={sc.id} className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
            onClick={() => selectScorecard(sc)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{sc.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: sc.type === 'dsat' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
                    color: sc.type === 'dsat' ? 'var(--danger)' : 'var(--accent)',
                    border: sc.type === 'dsat' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.3)',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {sc.type === 'dsat' ? 'DSAT' : 'Quality'}
                  </span>
                </div>
                {sc.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sc.description}</div>
                )}
              </div>
              <span style={{ fontSize: 20, color: 'var(--text-secondary)' }}>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (step === 'metadata') return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => setStep('select')}>← Back</button>
          <h1>{selectedScorecard.name}</h1>
          <p className="page-sub">Step 1 of 2 — Interaction details</p>
        </div>
      </div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}
      {metadata.length === 0 ? (
        <div className="card" style={{ maxWidth: 600, color: 'var(--text-secondary)', padding: 24 }}>
          No metadata fields configured for this scorecard.
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title" style={{ marginBottom: 20 }}>Interaction Details</div>
          {metadata.map(field => (
            <div key={field.id} className="form-field" style={{ marginBottom: 16 }}>
              <label>
                {field.label}
                {field.is_required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </label>
              {field.field_type === 'dropdown' ? (
                <SearchableDropdown
                  options={field.options || []}
                  value={metaValues[field.id] || ''}
                  onChange={val => setMetaValues(v => ({ ...v, [field.id]: val }))}
                  placeholder="Select..."
                />
              ) : field.field_type === 'date' ? (
                <input type="date" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => setMetaValues(v => ({ ...v, [field.id]: e.target.value }))} />
              ) : field.field_type === 'number' ? (
                <input type="number" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => setMetaValues(v => ({ ...v, [field.id]: e.target.value }))} />
              ) : (
                <input type="text" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => setMetaValues(v => ({ ...v, [field.id]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 24, maxWidth: 600 }}>
        <button className="btn btn-primary"
          onClick={() => {
            if (!metaValid()) return flash('Please fill in all required fields.', false)
            setStep('questions')
          }}>
          Continue to Questions →
        </button>
      </div>
    </div>
  )

  if (step === 'questions') {
    const isDsat = selectedScorecard?.type === 'dsat'
    const ungrouped = questions.filter(q => !q.group_id)
    const answered = isDsat
      ? Object.values(dsatAnswers).filter(a => a.value).length
      : Object.values(answers).filter(a => a.score !== null).length
    const total = isDsat ? dsatQuestions.length : questions.length
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
              onClick={() => setStep('metadata')}>← Back</button>
            <h1>{selectedScorecard.name}</h1>
            <p className="page-sub">Step 2 of 2 — {isDsat ? 'Complete the DSAT form' : 'Score each question'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {answered}/{total} answered
            </span>
            <button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 24 }}>
          <div style={{
            height: 4, borderRadius: 4, background: 'var(--accent)',
            width: `${pct}%`, transition: 'width 0.3s'
          }} />
        </div>
        {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`}>{msg.text}</div>}

        {isDsat ? (
          (() => {
            const sortedSections = [...dsatSections].sort((a, b) => a.position - b.position)
            const currentSection = dsatSections.find(s => s.id === dsatCurrentSectionId)
            if (!currentSection) return null
            const sectionQs = dsatQuestions
              .filter(q => q.section_id === currentSection.id)
              .sort((a, b) => a.position - b.position)
            const isLastSection = currentSection.position === Math.max(...dsatSections.map(s => s.position))
            const currentSectionComplete = sectionQs.every(q =>
              !q.is_required || dsatAnswers[q.id]?.value
            )
            const goToNextSection = () => {
              const routingQ = sectionQs.find(q => q.question_type === 'options')
              let nextSectionId = null
              if (routingQ) {
                const chosenLabel = dsatAnswers[routingQ.id]?.value
                const chosenOpt = dsatOptions.find(
                  o => o.question_id === routingQ.id && o.label === chosenLabel
                )
                if (chosenOpt?.jump_to_section_id) {
                  nextSectionId = chosenOpt.jump_to_section_id
                }
              }
              if (!nextSectionId) {
                const currentIdx = sortedSections.findIndex(s => s.id === currentSection.id)
                nextSectionId = sortedSections[currentIdx + 1]?.id || null
              }
              if (nextSectionId) {
                setDsatSectionHistory(h => [...h, currentSection.id])
                setDsatCurrentSectionId(nextSectionId)
              }
            }
            const goToPrevSection = () => {
              const prev = dsatSectionHistory[dsatSectionHistory.length - 1]
              if (prev) {
                setDsatSectionHistory(h => h.slice(0, -1))
                setDsatCurrentSectionId(prev)
              }
            }
            return (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Section: <strong style={{ color: 'var(--text-primary)' }}>{currentSection.title}</strong>
                </div>
                {sectionQs.map(q => {
                  const qOpts = dsatOptions
                    .filter(o => o.question_id === q.id)
                    .sort((a, b) => a.position - b.position)
                  return (
                    <div key={q.id} className="card" style={{ marginBottom: 12,
                      borderLeft: dsatAnswers[q.id]?.value
                        ? '3px solid var(--accent)'
                        : '3px solid var(--border)'
                    }}>
                      <div style={{ fontWeight: 500, marginBottom: 12 }}>
                        {q.title}
                        {q.is_required && (
                          <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>
                        )}
                      </div>
                      {q.question_type === 'free_text' ? (
                        <textarea
                          className="input"
                          rows={3}
                          placeholder="Type your answer…"
                          value={dsatAnswers[q.id]?.value || ''}
                          onChange={e => setDsatAnswers(a => ({
                            ...a, [q.id]: { value: e.target.value }
                          }))}
                          style={{ resize: 'vertical', fontSize: 13 }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {qOpts.map(opt => {
                            const selected = dsatAnswers[q.id]?.value === opt.label
                            return (
                              <button
                                key={opt.id}
                                onClick={() => setDsatAnswers(a => ({
                                  ...a, [q.id]: { value: opt.label }
                                }))}
                                style={{
                                  padding: '7px 16px', borderRadius: 6,
                                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                  border: '1.5px solid',
                                  borderColor: selected ? 'var(--accent)' : 'var(--border)',
                                  background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                                  color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                  transition: 'all 0.15s'
                                }}
                              >
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}>
                  {dsatSectionHistory.length > 0 && (
                    <button className="btn btn-ghost" onClick={goToPrevSection}>← Back</button>
                  )}
                  {!isLastSection && (
                    <button
                      className="btn btn-primary"
                      onClick={goToNextSection}
                      disabled={!currentSectionComplete}
                    >
                      Next →
                    </button>
                  )}
                </div>
                {isLastSection && (
                  <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}
                      style={{ marginRight: 12 }}>
                      {submitting ? 'Submitting…' : 'Submit Evaluation'}
                    </button>
                    <button className="btn btn-ghost" onClick={goToPrevSection}>
                      ← Back
                    </button>
                  </div>
                )}
              </div>
            )
          })()
        ) : (
          <>
            {ungrouped.map(q => (
              <QuestionCard key={q.id} question={q}
                answer={answers[q.id]}
                onChange={(updates) => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))} />
            ))}
            {groups.map(group => {
              const groupQs = questions.filter(q => q.group_id === group.id)
              if (groupQs.length === 0) return null
              return (
                <div key={group.id} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    marginBottom: 10, paddingLeft: 2
                  }}>
                    {group.name}
                  </div>
                  {groupQs.map(q => (
                    <QuestionCard key={q.id} question={q}
                      answer={answers[q.id]}
                      onChange={(updates) => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))} />
                  ))}
                </div>
              )
            })}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
              <div className="form-field" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, fontSize: 14 }}>
                  Overall Comment <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Add an overall comment for this evaluation…"
                  value={overallComment}
                  onChange={e => setOverallComment(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 13 }}
                />
              </div>
              <button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}
                style={{ marginRight: 12 }}>
                {submitting ? 'Submitting…' : 'Submit Evaluation'}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('metadata')}>
                ← Back to Details
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (step === 'done') {
    const { score, failed_critical } = calculateScore()
    return (
      <div className="page">
        <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {failed_critical ? '❌' : score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌'}
          </div>
          <h1 style={{ marginBottom: 8 }}>Evaluation Submitted</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
            {selectedScorecard.name}
          </p>
          <div className="card" style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Final Score</div>
            <div style={{
              fontSize: 48, fontWeight: 700,
              color: failed_critical ? 'var(--danger)' : score >= 80 ? 'var(--success)' : score >= 60 ? '#f59e0b' : 'var(--danger)'
            }}>
              {failed_critical ? '0%' : `${score}%`}
            </div>
            {failed_critical && (
              <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>
                A form-critical question was failed
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => {
              setStep('select')
              setSelectedScorecard(null)
              setAnswers({})
              setMetaValues({})
              setOverallComment('')
            }}>
              Start New Evaluation
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/evaluations')}>
              View All Evaluations
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function QuestionCard({ question, answer, onChange }) {
  const score = answer?.score
  const comment = answer?.comment || ''
  const btnStyle = (val) => ({
    flex: 1, padding: '8px 0', borderRadius: 6, fontWeight: 500, fontSize: 13,
    cursor: 'pointer', border: '1.5px solid',
    borderColor: score === val
      ? val === 'pass' ? 'var(--success)' : val === 'fail' ? 'var(--danger)' : 'var(--text-secondary)'
      : 'var(--border)',
    background: score === val
      ? val === 'pass' ? 'rgba(34,197,94,0.12)' : val === 'fail' ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.12)'
      : 'transparent',
    color: score === val
      ? val === 'pass' ? 'var(--success)' : val === 'fail' ? 'var(--danger)' : 'var(--text-secondary)'
      : 'var(--text-secondary)',
    transition: 'all 0.15s'
  })
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: score === null || score === undefined ? '3px solid var(--border)' : score === 'pass' ? '3px solid var(--success)' : score === 'fail' ? '3px solid var(--danger)' : '3px solid var(--text-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {question.title}
            {question.is_form_critical && (
              <span className="badge badge-fail" style={{ marginLeft: 8, fontSize: 11 }}>Form Critical</span>
            )}

            {question.is_weighted && (
              <span style={{
                marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 7px', fontWeight: 500
              }}>
                Weight: {question.weight}
              </span>
            )}
          </div>
          {question.description && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {question.description}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, minWidth: 220 }}>
          <button style={btnStyle('pass')} onClick={() => onChange({ score: 'pass' })}>✓ Pass</button>
          <button style={btnStyle('fail')} onClick={() => onChange({ score: 'fail' })}>✕ Fail</button>
          {question.allow_na !== false && (
            <button style={btnStyle('na')} onClick={() => onChange({ score: 'na' })}>N/A</button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <input className="input" placeholder="Add a comment (optional)…"
          value={comment}
          onChange={e => onChange({ comment: e.target.value })}
          style={{ fontSize: 13 }} />
      </div>
    </div>
  )
}

function SearchableDropdown({ options, value, onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef(null)

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="select"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none'
        }}
        onClick={() => { setOpen(o => !o); setSearch('') }}
      >
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {value || placeholder}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              className="input"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 13, padding: '6px 10px' }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                No options match
              </div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); setSearch('') }}
                  style={{
                    padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                    color: opt === value ? 'var(--accent)' : 'var(--text-primary)',
                    background: opt === value ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderLeft: opt === value ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => {
                    if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  }}
                  onMouseLeave={e => {
                    if (opt !== value) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {opt}
                </div>
              ))
            )}
          </div>
          {value && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', fontSize: 12 }}
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
