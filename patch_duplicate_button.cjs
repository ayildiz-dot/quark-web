const fs = require('fs')
const path = 'src/pages/Scorecards.jsx'
let src = fs.readFileSync(path, 'utf8')
let ok = true

function apply(label, anchor, replacement) {
  if (!src.includes(anchor)) {
    console.log(`❌ ${label}: anchor not found`)
    ok = false
    return
  }
  const count = src.split(anchor).length - 1
  if (count > 1) {
    console.log(`❌ ${label}: anchor matched ${count} times, expected 1`)
    ok = false
    return
  }
  src = src.replace(anchor, replacement)
  console.log(`✅ ${label}`)
}

apply(
  'Add duplicateScorecard handler',
  `  const deleteScorecard = async (id) => {
    if (!confirm('Delete this scorecard? This cannot be undone.')) return
    await supabase.from('scorecards').delete().eq('id', id)
    await loadScorecards()
    flash('Scorecard deleted')
  }`,
  `  const deleteScorecard = async (id) => {
    if (!confirm('Delete this scorecard? This cannot be undone.')) return
    await supabase.from('scorecards').delete().eq('id', id)
    await loadScorecards()
    flash('Scorecard deleted')
  }

  const [duplicatingId, setDuplicatingId] = useState(null)

  const duplicateScorecard = async (id) => {
    setDuplicatingId(id)
    const { data: newId, error } = await supabase.rpc('duplicate_scorecard', {
      source_id: id,
      actor_id: profile.id,
    })
    setDuplicatingId(null)
    if (error) return flash('Duplicate failed: ' + error.message, false)
    await loadScorecards()
    flash('Scorecard duplicated as a draft — remember to review and publish it separately.')
    navigate(\`/scorecards/\${newId}/edit\`)
  }`
)

apply(
  'Add Duplicate button to action group',
  `                      <button className="btn btn-sm btn-ghost"
                        onClick={() => navigate(\`/scorecards/\${sc.id}/edit\`)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => deleteScorecard(sc.id)}>
                        Delete
                      </button>`,
  `                      <button className="btn btn-sm btn-ghost"
                        onClick={() => navigate(\`/scorecards/\${sc.id}/edit\`)}>
                        Edit
                      </button>
                      <button className="btn btn-sm btn-ghost"
                        disabled={duplicatingId === sc.id}
                        onClick={() => duplicateScorecard(sc.id)}>
                        {duplicatingId === sc.id ? 'Duplicating…' : 'Duplicate'}
                      </button>
                      <button className="btn btn-sm btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => deleteScorecard(sc.id)}>
                        Delete
                      </button>`
)

if (ok) {
  fs.writeFileSync(path, src)
  console.log('\nAll patches applied successfully.')
} else {
  console.log('\nOne or more patches FAILED. File was not modified.')
  process.exit(1)
}
