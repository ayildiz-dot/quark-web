const fs = require('fs')

function patchFile(path, edits) {
  let src = fs.readFileSync(path, 'utf8')
  let allOk = true
  for (const [label, anchor, replacement] of edits) {
    const count = src.split(anchor).length - 1
    if (count !== 1) {
      console.log(`❌ ${path} :: ${label} — expected 1 match, found ${count}`)
      allOk = false
      continue
    }
    src = src.replace(anchor, replacement)
    console.log(`✅ ${path} :: ${label}`)
  }
  if (allOk) {
    fs.writeFileSync(path, src)
    console.log(`--- ${path} written ---`)
  } else {
    console.log(`--- ${path} NOT written (fix anchors above) ---`)
  }
  return allOk
}

const builderOk = patchFile('src/pages/ScorecardBuilder.jsx', [
  [
    'deleteMetaField error check',
`  const deleteMetaField = async (fieldId) => {
    await supabase.from('scorecard_metadata_fields').delete().eq('id', fieldId)
    setMetadata(m => m.filter(f => f.id !== fieldId))
    if (isPublished) markChanged()
  }`,
`  const deleteMetaField = async (fieldId) => {
    const { error } = await supabase.from('scorecard_metadata_fields').delete().eq('id', fieldId)
    if (error) return flash('Failed to delete field: ' + error.message, false)
    setMetadata(m => m.filter(f => f.id !== fieldId))
    if (isPublished) markChanged()
  }`
  ],
  [
    'deleteGroup: persist ungroup to DB + error check',
`  const deleteGroup = async (groupId) => {
    if (!confirm('Delete this group? Questions inside will become ungrouped.')) return
    await supabase.from('scorecard_question_groups').delete().eq('id', groupId)
    setGroups(g => g.filter(gr => gr.id !== groupId))
    setQuestions(q => q.map(qs => qs.group_id === groupId ? { ...qs, group_id: null } : qs))
    if (isPublished) markChanged()
  }`,
`  const deleteGroup = async (groupId) => {
    if (!confirm('Delete this group? Questions inside will become ungrouped.')) return
    const { error: ungroupErr } = await supabase.from('scorecard_questions').update({ group_id: null }).eq('group_id', groupId)
    if (ungroupErr) return flash('Failed to ungroup questions: ' + ungroupErr.message, false)
    const { error } = await supabase.from('scorecard_question_groups').delete().eq('id', groupId)
    if (error) return flash('Failed to delete group: ' + error.message, false)
    setGroups(g => g.filter(gr => gr.id !== groupId))
    setQuestions(q => q.map(qs => qs.group_id === groupId ? { ...qs, group_id: null } : qs))
    if (isPublished) markChanged()
  }`
  ],
  [
    'deleteSection: clean up children + routing + error check',
`  const deleteSection = async (sId) => {
    if (!confirm('Delete this section and all its questions?')) return
    await supabase.from('dsat_sections').delete().eq('id', sId)
    setSections(s => s.filter(sec => sec.id !== sId))
    setDsatQuestions(q => q.filter(dq => dq.section_id !== sId))
    if (isPublished) markChanged()
  }`,
`  const deleteSection = async (sId) => {
    if (!confirm('Delete this section and all its questions?')) return
    const childQIds = dsatQuestions.filter(q => q.section_id === sId).map(q => q.id)
    if (childQIds.length) {
      const { error: optErr } = await supabase.from('dsat_options').delete().in('question_id', childQIds)
      if (optErr) return flash('Failed to delete section: ' + optErr.message, false)
      const { error: qErr } = await supabase.from('dsat_questions').delete().in('id', childQIds)
      if (qErr) return flash('Failed to delete section: ' + qErr.message, false)
    }
    const { error: routeErr } = await supabase.from('dsat_options').update({ jump_to_section_id: null }).eq('jump_to_section_id', sId)
    if (routeErr) return flash('Failed to clear routing into this section: ' + routeErr.message, false)
    const { error } = await supabase.from('dsat_sections').delete().eq('id', sId)
    if (error) return flash('Failed to delete section: ' + error.message, false)
    setSections(s => s.filter(sec => sec.id !== sId))
    setDsatQuestions(q => q.filter(dq => dq.section_id !== sId))
    if (isPublished) markChanged()
  }`
  ],
  [
    'deleteDsatQuestion: clean up options first + error check',
`  const deleteDsatQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('dsat_questions').delete().eq('id', qId)
    setDsatQuestions(q => q.filter(dq => dq.id !== qId))
    setDsatOptions(o => o.filter(opt => opt.question_id !== qId))
    if (isPublished) markChanged()
  }`,
`  const deleteDsatQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    const { error: optErr } = await supabase.from('dsat_options').delete().eq('question_id', qId)
    if (optErr) return flash('Failed to delete question: ' + optErr.message, false)
    const { error } = await supabase.from('dsat_questions').delete().eq('id', qId)
    if (error) return flash('Failed to delete question: ' + error.message, false)
    setDsatQuestions(q => q.filter(dq => dq.id !== qId))
    setDsatOptions(o => o.filter(opt => opt.question_id !== qId))
    if (isPublished) markChanged()
  }`
  ],
  [
    'deleteOption error check',
`  const deleteOption = async (optId) => {
    await supabase.from('dsat_options').delete().eq('id', optId)
    setDsatOptions(o => o.filter(opt => opt.id !== optId))
    if (isPublished) markChanged()
  }`,
`  const deleteOption = async (optId) => {
    const { error } = await supabase.from('dsat_options').delete().eq('id', optId)
    if (error) return flash('Failed to delete option: ' + error.message, false)
    setDsatOptions(o => o.filter(opt => opt.id !== optId))
    if (isPublished) markChanged()
  }`
  ],
])

const formOk = patchFile('src/pages/EvaluationForm.jsx', [
  [
    'compute question numbers in render order',
`    const ungrouped = questions.filter(q => !q.group_id)`,
`    const ungrouped = questions.filter(q => !q.group_id)
    const questionNumbers = new Map()
    let _qNumCounter = 0
    for (const q of ungrouped) questionNumbers.set(q.id, ++_qNumCounter)
    for (const group of groups) {
      for (const q of questions.filter(gq => gq.group_id === group.id)) questionNumbers.set(q.id, ++_qNumCounter)
    }`
  ],
  [
    'pass number to ungrouped QuestionCards',
`            {ungrouped.map(q => (
              <QuestionCard key={q.id} question={q}
                answer={answers[q.id]}
                aiSuggested={aiSuggestedIds.has(q.id)}
                aiReasoning={aiSuggestions[q.id]?.reasoning}
                onChange={(updates) => {
                  setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                  setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                }} />
            ))}`,
`            {ungrouped.map(q => (
              <QuestionCard key={q.id} question={q}
                answer={answers[q.id]}
                number={questionNumbers.get(q.id)}
                aiSuggested={aiSuggestedIds.has(q.id)}
                aiReasoning={aiSuggestions[q.id]?.reasoning}
                onChange={(updates) => {
                  setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                  setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                }} />
            ))}`
  ],
  [
    'pass number to grouped QuestionCards',
`                  {groupQs.map(q => (
                    <QuestionCard key={q.id} question={q}
                      answer={answers[q.id]}
                      aiSuggested={aiSuggestedIds.has(q.id)}
                      aiReasoning={aiSuggestions[q.id]?.reasoning}
                      onChange={(updates) => {
                        setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                        setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                      }} />
                  ))}`,
`                  {groupQs.map(q => (
                    <QuestionCard key={q.id} question={q}
                      answer={answers[q.id]}
                      number={questionNumbers.get(q.id)}
                      aiSuggested={aiSuggestedIds.has(q.id)}
                      aiReasoning={aiSuggestions[q.id]?.reasoning}
                      onChange={(updates) => {
                        setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                        setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                      }} />
                  ))}`
  ],
  [
    'QuestionCard accepts number prop',
`function QuestionCard({ question, answer, onChange, aiSuggested, aiReasoning }) {`,
`function QuestionCard({ question, answer, onChange, aiSuggested, aiReasoning, number }) {`
  ],
  [
    'render number + persistent AI Attribute badge',
`          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {question.title}
            {aiSuggested && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>✨ AI suggested — review</span>
            )}`,
`          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {number != null ? \`\${number}. \` : ''}{question.title}
            {question.is_ai_attribute && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>✨ AI Attribute</span>
            )}
            {aiSuggested && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>✨ AI suggested — review</span>
            )}`
  ],
])

if (!builderOk || !formOk) process.exitCode = 1
