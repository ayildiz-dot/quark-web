const fs = require('fs');

const FILE = 'src/pages/ScorecardDashboard.jsx';
let content = fs.readFileSync(FILE, 'utf8');

const results = [];

function apply(name, oldStr, newStr, count = 1) {
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== count) {
    results.push([name, false, `expected ${count} occurrence(s), found ${occurrences}`]);
    return;
  }
  content = content.replace(oldStr, newStr);
  results.push([name, true, null]);
}

apply(
  "add alignment_rate and deviated_controllability_rate to computeMeasure",
  `    case 'controllability_rate': {
      if (!n) return { display: '—' }
      const c = evals.filter(isControllable).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    default: return { display: '?' }`,
  `    case 'controllability_rate': {
      if (!n) return { display: '—' }
      const c = evals.filter(isControllable).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    // Spot-check measures — operate on Vendor-shaped evaluation rows only
    // (deviated_controllability / is_deviated / deviation_source_evaluation_id).
    // Alignment Rate's denominator is spot-checked rows only; a Vendor row
    // nobody ever reviewed has no alignment to speak of.
    case 'alignment_rate': {
      const checked = evals.filter(e => e.deviation_source_evaluation_id != null)
      if (!checked.length) return { display: '—' }
      const aligned = checked.filter(e => !e.is_deviated).length
      return { display: Math.round((aligned / checked.length) * 100) + '%', detail: aligned + ' of ' + checked.length + ' spot-checked' }
    }
    case 'deviated_controllability_rate': {
      if (!n) return { display: '—' }
      const c = evals.filter(e => {
        const effective = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return effective === 'Controllable'
      }).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    default: return { display: '?' }`
);

apply(
  "add buildSpotCheckWeeklySeries after buildWeeklySeries",
  `function buildAgentSeries(evals, scorecard) {`,
  `// Buckets Vendor-shaped rows by Communication Date (shared between paired
// Vendor and KG evaluations by design — see spot-check metadata auto-fill).
// measureKey is 'alignment_rate' or 'deviated_controllability_rate'.
function buildSpotCheckWeeklySeries(vendorEvals, measureKey) {
  const buckets = new Map()
  for (const ev of vendorEvals) {
    const raw = getMetaValue(ev, 'Communication Date'); if (!raw) continue
    const ws = weekStartOf(raw); if (!ws) continue
    const key = ws.toISOString().slice(0,10)
    if (!buckets.has(key)) buckets.set(key, { weekStart: ws, evals: [] })
    buckets.get(key).evals.push(ev)
  }
  return [...buckets.values()].sort((a,b)=>a.weekStart-b.weekStart).map(b => {
    let count, rate
    if (measureKey === 'alignment_rate') {
      const checked = b.evals.filter(e => e.deviation_source_evaluation_id != null)
      count = checked.length
      const aligned = checked.filter(e => !e.is_deviated).length
      rate = count ? Math.round(aligned / count * 100) : 0
    } else {
      count = b.evals.length
      const c = b.evals.filter(e => {
        const effective = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return effective === 'Controllable'
      }).length
      rate = count ? Math.round(c / count * 100) : 0
    }
    return { weekLabel: b.weekStart.toLocaleDateString(undefined,{month:'short',day:'numeric'}), rate, count }
  })
}

function buildAgentSeries(evals, scorecard) {`
);

apply(
  "add spot-check widgets to WIDGET_CATALOG.dsat",
  `  dsat: [
    { widget_type: 'stat_card',  title: 'Controllability Rate',          config: { measure: 'controllability_rate' } },
    { widget_type: 'stat_card',  title: 'Total DSATs Evaluated',         config: { measure: 'eval_count' } },
    { widget_type: 'line_chart', title: 'Controllability \\u2014 Week over Week', config: {} },
    { widget_type: 'bar_chart',  title: 'Controllability by Agent',      config: { measure: 'controllability_rate' } },
  ],`,
  `  dsat: [
    { widget_type: 'stat_card',  title: 'Controllability Rate',          config: { measure: 'controllability_rate' } },
    { widget_type: 'stat_card',  title: 'Total DSATs Evaluated',         config: { measure: 'eval_count' } },
    { widget_type: 'line_chart', title: 'Controllability \\u2014 Week over Week', config: {} },
    { widget_type: 'bar_chart',  title: 'Controllability by Agent',      config: { measure: 'controllability_rate' } },
    { widget_type: 'stat_card',  title: 'Alignment Rate',                config: { measure: 'alignment_rate' } },
    { widget_type: 'stat_card',  title: 'Deviated Controllability Rate', config: { measure: 'deviated_controllability_rate' } },
    { widget_type: 'line_chart', title: 'Alignment Rate \\u2014 Week over Week', config: { measure: 'alignment_rate' } },
    { widget_type: 'line_chart', title: 'Deviated Controllability \\u2014 Week over Week', config: { measure: 'deviated_controllability_rate' } },
  ],`
);

apply(
  "add alignmentVendorEvals state",
  `  const [govQueues, setGovQueues] = useState([]) // [{id, hub_id, hub_name, market_value}] mapped to this scorecard
  const [loading, setLoading] = useState(true)`,
  `  const [govQueues, setGovQueues] = useState([]) // [{id, hub_id, hub_name, market_value}] mapped to this scorecard
  // Vendor-shaped rows for the two spot-check measures (Alignment Rate, Deviated
  // Controllability). On the Vendor (non-spot-check) scorecard's own dashboard,
  // these ARE filteredEvals already. On the KG spot-check scorecard's dashboard,
  // this is a separate fetch of the Vendor rows that the filtered KG rows point
  // back to (via deviation_source_evaluation_id), refetched whenever the KG-side
  // filtered set changes.
  const [isSpotCheckScorecard, setIsSpotCheckScorecard] = useState(false)
  const [alignmentVendorEvals, setAlignmentVendorEvals] = useState([])
  const [loading, setLoading] = useState(true)`
);

apply(
  "capture is_spot_check on scorecard select and load",
  `      const { data: sc, error: scErr } = await supabase
        .from('scorecards').select('id, name, type, pass_threshold').eq('id', scorecardId).single()
      if (scErr) throw scErr`,
  `      const { data: sc, error: scErr } = await supabase
        .from('scorecards').select('id, name, type, pass_threshold, is_spot_check').eq('id', scorecardId).single()
      if (scErr) throw scErr
      setIsSpotCheckScorecard(!!sc.is_spot_check)`
);

apply(
  "select deviated_controllability/is_deviated/deviation_source_evaluation_id in the main evals query",
  `          let evQ = supabase.from('evaluations')
            .select('id, score, metadata_values, submitted_at, evaluation_type, status, scorecard_version, hub_id, workspace_id, queue_id')
            .eq('scorecard_id', scorecardId).eq('status', 'submitted').eq('evaluation_type', sc.type)`,
  `          let evQ = supabase.from('evaluations')
            .select('id, score, metadata_values, submitted_at, evaluation_type, status, scorecard_version, hub_id, workspace_id, queue_id, deviated_controllability, is_deviated, deviation_source_evaluation_id')
            .eq('scorecard_id', scorecardId).eq('status', 'submitted').eq('evaluation_type', sc.type)`
);

apply(
  "add effect to populate alignmentVendorEvals based on scorecard side",
  `  const weeklyData = useMemo(() => scorecard ? buildWeeklySeries(filteredEvals, scorecard) : [], [filteredEvals, scorecard])
  const agentData  = useMemo(() => scorecard ? buildAgentSeries(filteredEvals, scorecard) : [],  [filteredEvals, scorecard])`,
  `  const weeklyData = useMemo(() => scorecard ? buildWeeklySeries(filteredEvals, scorecard) : [], [filteredEvals, scorecard])
  const agentData  = useMemo(() => scorecard ? buildAgentSeries(filteredEvals, scorecard) : [],  [filteredEvals, scorecard])

  // Populate alignmentVendorEvals: direct pass-through on the Vendor scorecard's
  // own dashboard, or a lookup-by-back-reference fetch on the KG scorecard's
  // dashboard. Refetches whenever the filtered KG row set changes.
  useEffect(() => {
    if (!scorecard) { setAlignmentVendorEvals([]); return }
    if (!isSpotCheckScorecard) { setAlignmentVendorEvals(filteredEvals); return }
    const kgIds = filteredEvals.map(e => e.id)
    if (!kgIds.length) { setAlignmentVendorEvals([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('id, metadata_values, deviated_controllability, is_deviated, deviation_source_evaluation_id')
        .in('deviation_source_evaluation_id', kgIds)
      if (!cancelled) setAlignmentVendorEvals(data || [])
    })()
    return () => { cancelled = true }
  }, [scorecard, isSpotCheckScorecard, filteredEvals])

  const alignmentWeeklyData = useMemo(() => buildSpotCheckWeeklySeries(alignmentVendorEvals, 'alignment_rate'), [alignmentVendorEvals])
  const deviatedWeeklyData  = useMemo(() => buildSpotCheckWeeklySeries(alignmentVendorEvals, 'deviated_controllability_rate'), [alignmentVendorEvals])`
);

apply(
  "route stat_card rendering to alignmentVendorEvals for spot-check measures",
  `    if (w.widget_type === 'stat_card') {
      const r = computeMeasure(w.config?.measure, filteredEvals, scorecard)
      return (`,
  `    if (w.widget_type === 'stat_card') {
      const spotCheckMeasure = w.config?.measure === 'alignment_rate' || w.config?.measure === 'deviated_controllability_rate'
      const r = computeMeasure(w.config?.measure, spotCheckMeasure ? alignmentVendorEvals : filteredEvals, scorecard)
      return (`
);

apply(
  "route line_chart rendering to the spot-check series when configured",
  `    if (w.widget_type === 'line_chart') {
      return (
        <div key={w.id} className="card" style={{ marginBottom:16, position:'relative' }}>
          {removeBtn}
          <div className="card-title" style={{ marginBottom:16 }}>{w.title}</div>
          <WowComboChart data={weeklyData} scorecard={scorecard} />
        </div>
      )
    }`,
  `    if (w.widget_type === 'line_chart') {
      const measure = w.config?.measure
      const chartData = measure === 'alignment_rate' ? alignmentWeeklyData
        : measure === 'deviated_controllability_rate' ? deviatedWeeklyData
        : weeklyData
      const rateLabel = measure === 'alignment_rate' ? 'Alignment Rate %'
        : measure === 'deviated_controllability_rate' ? 'Deviated Controllability %'
        : null
      return (
        <div key={w.id} className="card" style={{ marginBottom:16, position:'relative' }}>
          {removeBtn}
          <div className="card-title" style={{ marginBottom:16 }}>{w.title}</div>
          <WowComboChart data={chartData} scorecard={scorecard} rateLabelOverride={rateLabel} />
        </div>
      )
    }`
);

apply(
  "add rateLabelOverride prop to WowComboChart",
  `function WowComboChart({ data, scorecard }) {
  const isDsat = scorecard.type === 'dsat'
  const rateName = isDsat ? 'Controllability %' : 'Quality Score %'`,
  `function WowComboChart({ data, scorecard, rateLabelOverride }) {
  const isDsat = scorecard.type === 'dsat'
  const rateName = rateLabelOverride || (isDsat ? 'Controllability %' : 'Quality Score %')`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ One or more anchors failed. NOTHING WAS WRITTEN. Fix anchors and re-run.');
  process.exit(1);
}

fs.writeFileSync(FILE, content);
console.log(`\n✅ All anchors applied successfully. ${FILE} updated.`);
