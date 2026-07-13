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
    'loadAll scorecard_questions filter',
    `supabase.from('scorecard_questions').select('*').eq('scorecard_id', id).order('position'),`,
    `supabase.from('scorecard_questions').select('*').eq('scorecard_id', id).eq('is_archived', false).order('position'),`
  ],
  [
    'deleteQuestion soft-archive on FK violation',
`  const deleteQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    await supabase.from('scorecard_questions').delete().eq('id', qId)
    setQuestions(q => q.filter(qs => qs.id !== qId))
    if (isPublished) markChanged()
  }`,
`  const deleteQuestion = async (qId) => {
    if (!confirm('Delete this question?')) return
    const { error } = await supabase.from('scorecard_questions').delete().eq('id', qId)
    if (error) {
      if (error.code === '23503') {
        const { error: archiveErr } = await supabase.from('scorecard_questions').update({ is_archived: true }).eq('id', qId)
        if (archiveErr) return flash('Failed to remove question: ' + archiveErr.message, false)
        setQuestions(q => q.filter(qs => qs.id !== qId))
        if (isPublished) markChanged()
        return flash('This question has past evaluation history, so it was archived instead of deleted. It will no longer appear in new evaluations.')
      }
      return flash('Failed to delete question: ' + error.message, false)
    }
    setQuestions(q => q.filter(qs => qs.id !== qId))
    if (isPublished) markChanged()
  }`
  ],
])

const formOk = patchFile('src/pages/EvaluationForm.jsx', [
  [
    'selectScorecard scorecard_questions filter (new evaluations only, not edit mode)',
`      const [grp, qs] = await Promise.all([
        supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('scorecard_questions').select('*').eq('scorecard_id', sc.id).order('position'),
      ])`,
`      const [grp, qs] = await Promise.all([
        supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('scorecard_questions').select('*').eq('scorecard_id', sc.id).eq('is_archived', false).order('position'),
      ])`
  ],
])

if (!builderOk || !formOk) process.exitCode = 1
