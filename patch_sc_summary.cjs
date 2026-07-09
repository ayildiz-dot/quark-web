const fs = require('fs')
const path = './src/pages/ScorecardDashboard.jsx'
let src = fs.readFileSync(path, 'utf8')
let ok = true

// P1: Add overall_comment to the evaluations select
const A1 = `.select('id, score, metadata_values, submitted_at, evaluation_type, status, scorecard_version, hub_id, workspace_id, queue_id, deviated_controllability, is_deviated, deviation_source_evaluation_id')`
const B1 = `.select('id, score, metadata_values, submitted_at, evaluation_type, status, scorecard_version, hub_id, workspace_id, queue_id, deviated_controllability, is_deviated, deviation_source_evaluation_id, overall_comment')`
if (src.includes(A1)) { src = src.replace(A1, () => B1); console.log('✅ P1: overall_comment added') }
else { console.log('❌ P1 not found'); ok = false }

// P2: Insert STOP_WORDS_SC + extractThemesSC + SummaryBubble before main component
const A2 = '/* ===================== main ===================== */'
const INSERT = `/* ===================== summary bubble ===================== */
const STOP_WORDS_SC = new Set([
  'the','a','an','is','was','are','were','be','been','has','had','have','do','did',
  'does','to','of','in','on','at','for','with','this','that','and','or','but','not',
  'no','so','if','it','its','he','she','they','we','you','my','your','their','our',
  'very','too','also','just','from','by','as','up','out','which','when','who','how',
  'what','all','more','could','would','should','will','can','need','there','here',
  'than','then','about','into','after','before','during','while','however','overall',
  'agent','evaluation','evaluated','evaluator','good','great','well','nice','fine',
  'okay','poor','quite','really','some','being','them','these','those','each',
  'customer','service','ticket','case','contact','handling',
])
function extractThemesSC(comments) {
  const freq = {}
  for (const c of comments) {
    if (!c) continue
    for (const word of c.toLowerCase().replace(/[^a-z\\s]/g, '').split(/\\s+/)) {
      if (word.length < 4 || STOP_WORDS_SC.has(word)) continue
      freq[word] = (freq[word] || 0) + 1
    }
  }
  return Object.entries(freq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w)
}
function SummaryBubble({ scorecard, filteredEvals, alignmentVendorEvals, anyActive }) {
  if (!anyActive) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12,
        color: 'var(--text-secondary)', fontSize: 14,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
        <span>You need to choose a filter first to generate a Summary.</span>
      </div>
    )
  }
  const isDsat = scorecard.type === 'dsat'
  const n = filteredEvals.length
  if (n === 0) return null
  let text
  if (isDsat) {
    const ctrl = filteredEvals.filter(isControllable).length
    const ctrlRate = Math.round((ctrl / n) * 100)
    const checked = alignmentVendorEvals.filter(e => e.deviation_source_evaluation_id != null)
    const aligned = checked.filter(e => !e.is_deviated).length
    const alignRate = checked.length ? Math.round((aligned / checked.length) * 100) : null
    const devCtrl = alignmentVendorEvals.filter(e => {
      const effective = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
      return effective === 'Controllable'
    }).length
    const devCtrlRate = alignmentVendorEvals.length ? Math.round((devCtrl / alignmentVendorEvals.length) * 100) : null
    const perfNote = ctrlRate >= 80 ? 'Controllability is healthy.'
      : ctrlRate >= 60 ? 'Controllability is moderate — review uncontrollable cases.'
      : 'Controllability is low — investigation recommended.'
    const alignPart = alignRate != null ? ' Spot-check alignment: ' + alignRate + '%.' : ''
    const devPart = devCtrlRate != null ? ' Deviated controllability: ' + devCtrlRate + '%.' : ''
    const comments = filteredEvals.map(e => e.overall_comment).filter(Boolean)
    const themes = extractThemesSC(comments)
    const themePart = themes.length ? ' Top topics in evaluator comments: ' + themes.join(', ') + '.' : ''
    text = n + ' DSAT evaluation' + (n !== 1 ? 's' : '') + ' match the current filters. Controllability rate is ' + ctrlRate + '% (' + ctrl + ' of ' + n + ' controllable). ' + perfNote + alignPart + devPart + themePart
  } else {
    const threshold = scorecard.pass_threshold ?? 90
    let passed = 0, scoreSum = 0
    for (const ev of filteredEvals) {
      const score = ev.score ?? 0
      scoreSum += score
      if (score >= threshold) passed++
    }
    const avgScore = Math.round(scoreSum / n)
    const passRate = Math.round((passed / n) * 100)
    const failed = n - passed
    const perfNote = passRate >= 90 ? 'Performance is strong.'
      : passRate >= 75 ? 'Performance is on track but has room for improvement.'
      : 'Pass rate is below target — coaching opportunities likely.'
    const comments = filteredEvals.map(e => e.overall_comment).filter(Boolean)
    const themes = extractThemesSC(comments)
    const themePart = themes.length ? ' Top topics in evaluator comments: ' + themes.join(', ') + '.' : ''
    text = n + ' quality evaluation' + (n !== 1 ? 's' : '') + ' match the current filters. Average score is ' + avgScore + '% with a ' + passRate + '% pass rate (' + passed + ' passed, ' + failed + ' failed). ' + perfNote + themePart
  }
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius-lg)',
      padding: '14px 20px', marginBottom: 20,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6,
      }}>Summary</div>
      <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.65, margin: 0 }}>{text}</p>
    </div>
  )
}

/* ===================== main ===================== */`
if (src.includes(A2)) { src = src.replace(A2, () => INSERT); console.log('✅ P2: SummaryBubble inserted') }
else { console.log('❌ P2 not found'); ok = false }

// P3: Render SummaryBubble between filter bar and empty-state card
const A3 = '      {filteredEvals.length === 0 && ('
const B3 = '      {/* Summary bubble */}\n      <SummaryBubble\n        scorecard={scorecard}\n        filteredEvals={filteredEvals}\n        alignmentVendorEvals={alignmentVendorEvals}\n        anyActive={anyActive}\n      />\n\n      {filteredEvals.length === 0 && ('
if (src.includes(A3)) { src = src.replace(A3, () => B3); console.log('✅ P3: render added') }
else { console.log('❌ P3 not found'); ok = false }

if (ok) { fs.writeFileSync(path, src); console.log('✅ All patches applied') }
else { console.log('❌ Some patches failed — file NOT written') }
