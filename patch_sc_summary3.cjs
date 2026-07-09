const fs = require('fs')
const path = './src/pages/ScorecardDashboard.jsx'
let src = fs.readFileSync(path, 'utf8')
let ok = true

// P1: Replace entire summary bubble section
const startMarker = '/* ===================== summary bubble ===================== */'
const endMarker = '\n\n/* ===================== main ===================== */'
const startIdx = src.indexOf(startMarker)
const endIdx = src.indexOf(endMarker)
if (startIdx === -1 || endIdx === -1) { console.log('❌ P1: section markers not found'); ok = false }
else {
  const NEW_BUBBLE = `/* ===================== summary bubble ===================== */
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
    .slice(0, 4)
    .map(([w]) => w)
}
function SummaryBubble({ scorecard, filteredEvals, alignmentVendorEvals, anyActive, evals, agentData, weeklyData, deviatedWeeklyData }) {
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

  const lines = []

  // ── 1. Core metrics ──
  if (isDsat) {
    // Eval count + scope note
    let countText = n + ' DSAT evaluation' + (n !== 1 ? 's' : '') + ' in the filtered view'
    if (evals && evals.length > 0 && evals.length !== n) countText += ' (' + n + ' of ' + evals.length + ' total)'
    lines.push({ text: countText + '.', type: 'primary' })

    // Deviated controllability — official metric, target <=20%
    if (alignmentVendorEvals.length > 0) {
      const devCtrl = alignmentVendorEvals.filter(e => {
        const eff = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return eff === 'Controllable'
      }).length
      const devRate = Math.round((devCtrl / alignmentVendorEvals.length) * 100)
      const onTarget = devRate <= 20
      const gap = Math.abs(devRate - 20)
      const note = onTarget
        ? 'on target (<=20%).'
        : 'out of target — ' + gap + 'pp above the 20% threshold. Review controllable DSAT drivers.'
      lines.push({
        text: 'Deviated controllability: ' + devRate + '% (' + devCtrl + ' of ' + alignmentVendorEvals.length + ' controllable) — ' + note,
        type: onTarget ? 'success' : 'warning',
      })
    }

    // Alignment rate — target >=98%
    const checked = alignmentVendorEvals.filter(e => e.deviation_source_evaluation_id != null)
    if (checked.length > 0) {
      const aligned = checked.filter(e => !e.is_deviated).length
      const alignRate = Math.round((aligned / checked.length) * 100)
      const onTarget = alignRate >= 98
      const gap = Math.abs(alignRate - 98)
      const note = onTarget
        ? 'on target (>=98%) — KG and vendor assessments are well aligned.'
        : 'out of target — ' + gap + 'pp below the 98% threshold. Review discrepant spot-checks.'
      lines.push({
        text: 'Alignment rate: ' + alignRate + '% (' + aligned + ' of ' + checked.length + ' spot-checks aligned) — ' + note,
        type: onTarget ? 'success' : 'warning',
      })
    }
  } else {
    // Quality score — target >=90%
    let scoreSum = 0
    for (const ev of filteredEvals) scoreSum += (ev.score ?? 0)
    const avgScore = Math.round(scoreSum / n)
    const onTarget = avgScore >= 90
    const gap = Math.abs(avgScore - 90)
    let scoreText = n + ' quality evaluation' + (n !== 1 ? 's' : '') + ' in the filtered view. Quality score: ' + avgScore + '%'
    if (evals && evals.length > 0 && evals.length !== n) {
      let baseSum = 0
      for (const ev of evals) baseSum += (ev.score ?? 0)
      const baseAvg = Math.round(baseSum / evals.length)
      const delta = avgScore - baseAvg
      scoreText += ' (' + (delta >= 0 ? '+' : '') + delta + 'pp vs overall avg of ' + baseAvg + '%)'
    }
    const note = onTarget
      ? 'on target (>=90%).'
      : 'out of target — ' + gap + 'pp below the 90% threshold. Quality coaching recommended.'
    lines.push({ text: scoreText + ' — ' + note, type: onTarget ? 'success' : 'warning' })
  }

  // ── 2. Weekly trend — DSAT uses deviatedWeeklyData, Quality uses weeklyData ──
  const trendData = isDsat ? (deviatedWeeklyData || []) : (weeklyData || [])
  const trendLabel = isDsat ? 'deviated controllability' : 'quality score'
  if (trendData.length >= 2) {
    const best = trendData.reduce((a, b) => a.rate >= b.rate ? a : b)
    const latest = trendData[trendData.length - 1]
    const prev = trendData[trendData.length - 2]
    const wowDelta = latest.rate - prev.rate
    let trendText = 'Weekly ' + trendLabel + ' trend: '
    if (best.weekLabel !== latest.weekLabel) {
      trendText += 'Peak was ' + best.weekLabel + ' (' + best.rate + '%, ' + best.count + ' eval' + (best.count !== 1 ? 's' : '') + '). '
    }
    trendText += 'Most recent (' + latest.weekLabel + '): ' + latest.rate + '% (' + latest.count + ' eval' + (latest.count !== 1 ? 's' : '') + ') — ' + (wowDelta >= 0 ? '+' : '') + wowDelta + 'pp vs prior week (' + prev.weekLabel + ', ' + prev.rate + '%).'
    lines.push({ text: trendText, type: 'primary' })
  }

  // ── 3. Agent outliers ──
  if (agentData && agentData.length >= 2) {
    const top = agentData[0]
    const bottom = agentData[agentData.length - 1]
    const fmt = a => a && a.includes('@') ? a.split('@')[0] : (a || 'Unknown').slice(0, 20)
    const metric = isDsat ? 'controllability' : 'quality score'
    let agentText = 'Agent performance: ' + fmt(top.agent) + ' leads at ' + top.value + '% ' + metric + ' (' + top.count + ' case' + (top.count !== 1 ? 's' : '') + ').'
    if (bottom.agent !== top.agent && bottom.value !== top.value) {
      agentText += ' Watch list: ' + fmt(bottom.agent) + ' at ' + bottom.value + '% (' + bottom.count + ' case' + (bottom.count !== 1 ? 's' : '') + ').'
    }
    lines.push({ text: agentText, type: 'primary' })
  }

  // ── 4. Comment themes ──
  const themes = extractThemesSC(filteredEvals.map(e => e.overall_comment).filter(Boolean))
  if (themes.length) {
    lines.push({ text: 'Recurring topics in evaluator comments: ' + themes.join(', ') + '.', type: 'primary' })
  }

  // ── 5. Category / Subcategory — volume-based, auto-populates once Echo is active ──
  const hasCategory = filteredEvals.some(e => getMetaValue(e, 'Category'))
  if (hasCategory) {
    const catMap = new Map()
    for (const ev of filteredEvals) {
      const cat = getMetaValue(ev, 'Category'); if (!cat) continue
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat).push(ev)
    }
    const catRanked = [...catMap.entries()]
      .map(([cat, evs]) => ({ cat, n: evs.length, evs }))
      .sort((a, b) => b.n - a.n).slice(0, 3)
    let catText = 'Top categories by volume: ' + catRanked.map(c => c.cat + ' (' + c.n + ' eval' + (c.n !== 1 ? 's' : '') + ')').join('; ') + '.'
    const topCat = catRanked[0]
    if (topCat) {
      const subMap = new Map()
      for (const ev of topCat.evs) {
        const sub = getMetaValue(ev, 'Subcategory'); if (!sub) continue
        if (!subMap.has(sub)) subMap.set(sub, [])
        subMap.get(sub).push(ev)
      }
      const subRanked = [...subMap.entries()]
        .map(([sub, evs]) => ({ sub, n: evs.length }))
        .sort((a, b) => b.n - a.n).slice(0, 3)
      if (subRanked.length) {
        catText += ' Under ' + topCat.cat + ': ' + subRanked.map(s => s.sub + ' (' + s.n + ' eval' + (s.n !== 1 ? 's' : '') + ')').join(', ') + '.'
      }
    }
    lines.push({ text: catText, type: 'primary' })
  } else {
    lines.push({ text: 'Category & subcategory breakdown not yet available — will auto-populate once Echo integration is active.', type: 'muted' })
  }

  // ── 6. Sample size warning ──
  if (n < 20) {
    lines.push({ text: 'Note: based on only ' + n + ' evaluation' + (n !== 1 ? 's' : '') + ' — treat these figures as directional, not statistically definitive.', type: 'warning' })
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius-lg)',
      padding: '16px 20px', marginBottom: 20,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10,
      }}>Summary</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lines.map((line, i) => (
          <p key={i} style={{
            fontSize: 13.5, lineHeight: 1.65, margin: 0,
            color: line.type === 'muted' ? 'var(--text-secondary)'
                 : line.type === 'warning' ? '#f59e0b'
                 : line.type === 'success' ? 'var(--success)'
                 : 'var(--text-primary)',
          }}>{line.text}</p>
        ))}
      </div>
    </div>
  )
}`
  src = src.slice(0, startIdx) + NEW_BUBBLE + src.slice(endIdx)
  console.log('✅ P1: SummaryBubble replaced with threshold-aware version')
}

// P2: Add deviatedWeeklyData to the render call
const A2 = '        weeklyData={weeklyData}\n      />'
const B2 = '        weeklyData={weeklyData}\n        deviatedWeeklyData={deviatedWeeklyData}\n      />'
if (src.includes(A2)) { src = src.replace(A2, () => B2); console.log('✅ P2: deviatedWeeklyData prop added') }
else { console.log('❌ P2: render call anchor not found'); ok = false }

if (ok) { fs.writeFileSync(path, src); console.log('✅ All patches applied') }
else { console.log('❌ Some patches failed — file NOT written') }
