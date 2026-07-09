const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 60: load the shared BPO/HUB/Market list for the Insights filters ---
{
  const oldStr = "  const [filterDateFrom, setFilterDateFrom] = useState('')\n  const [filterDateTo, setFilterDateTo] = useState('')\n\n  useEffect(() => { if (profile) load() }, [profile])\n\n  async function load() {\n    setLoading(true)\n";
  const newStr = "  const [filterDateFrom, setFilterDateFrom] = useState('')\n  const [filterDateTo, setFilterDateTo] = useState('')\n  const [metaOptions, setMetaOptions] = useState({ bpo: [], hub: [], market: [] })\n\n  useEffect(() => { if (profile) load() }, [profile])\n\n  async function load() {\n    setLoading(true)\n\n    // BPO/HUB/Market filter choices come from the shared metadata list (the same one\n    // used on the New Session form), not just from sessions that already have results —\n    // so a newly added BPO/HUB/Market shows up as a filter option right away, even\n    // before any session using it has been evaluated.\n    const { data: metaRows } = await supabase.from('calibration_metadata_options').select('category, name')\n    const metaByCategory = cat => [...new Set((metaRows || []).filter(o => o.category === cat).map(o => o.name))].sort()\n    setMetaOptions({ bpo: metaByCategory('bpo'), hub: metaByCategory('hub'), market: metaByCategory('market') })\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("\u2705 patch 60 applied"); }
  else { allOk = false; console.log("\u274c patch 60 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 61: use the shared list instead of deriving from evaluated rows only ---
{
  const oldStr = "  // Filter dropdown options come from the data itself, so a filter never points at\n  // an empty result set.\n  const bpoOptions = [...new Set(rows.map(r => r.bpo).filter(Boolean))].sort()\n  const hubOptions = [...new Set(rows.map(r => r.hub).filter(Boolean))].sort()\n  const marketOptions = [...new Set(rows.map(r => r.market).filter(Boolean))].sort()\n  const scorecardOptions = [...new Set(rows.map(r => r.scorecardName).filter(Boolean))].sort()\n  const gaugeOptions = [...new Set(rows.map(r => r.gaugeName).filter(Boolean))].sort()\n  const evaluatorOptions = [...new Set(rows.map(r => r.evaluatorName).filter(Boolean))].sort()\n";
  const newStr = "  // BPO/HUB/Market options come from the shared metadata list loaded above, so they\n  // show up as filters as soon as they exist — even before any session using them has\n  // been evaluated. Scorecard/Gauge/Evaluator options are derived from the data itself,\n  // since those only make sense once there's actually something to filter.\n  const bpoOptions = metaOptions.bpo\n  const hubOptions = metaOptions.hub\n  const marketOptions = metaOptions.market\n  const scorecardOptions = [...new Set(rows.map(r => r.scorecardName).filter(Boolean))].sort()\n  const gaugeOptions = [...new Set(rows.map(r => r.gaugeName).filter(Boolean))].sort()\n  const evaluatorOptions = [...new Set(rows.map(r => r.evaluatorName).filter(Boolean))].sort()\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("\u2705 patch 61 applied"); }
  else { allOk = false; console.log("\u274c patch 61 FAILED (found " + count + " occurrences, expected 1)"); }
}

if (!allOk) {
  console.log("\n\u274c Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n\u2705 All patches applied successfully to " + path);
