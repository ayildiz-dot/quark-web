const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: CalibrationAdmin needs to know who's asking ---
{
  const oldStr = "function CalibrationAdmin() {\n  const [sessions, setSessions]     = useState([])\n";
  const newStr = "function CalibrationAdmin() {\n  const { profile } = useAuth()\n  const [sessions, setSessions]     = useState([])\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("✅ patch 1 applied"); }
  else { allOk = false; console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 2: results filtered to my own Gauge sessions unless admin/owner ---
{
  const oldStr = "  useEffect(() => { loadResults() }, [])\n\n  async function loadResults() {\n    setLR(true)\n    const { data: subs } = await supabase\n      .from('calibration_submissions')\n      .select('evaluator_id, session_id, status, overall_score, is_calibrated, delta, submitted_at')\n      .eq('status', 'evaluated')\n      .eq('is_gauge', false)\n      .order('submitted_at', { ascending: false })\n      .limit(200)\n\n    if ((subs || []).length > 0) {\n";
  const newStr = "  useEffect(() => { if (profile) loadResults() }, [profile])\n\n  async function loadResults() {\n    setLR(true)\n    // Admins/owners see every evaluator's results. Everyone else (any @kaizengaming.com\n    // user, now that Manage Sessions is open to all of them) only sees results for\n    // sessions where THEY are the Gauge — never other people's calibrations.\n    const isPrivileged = ['admin', 'owner'].includes(profile?.role)\n    let gaugeSessionIds = null\n    if (!isPrivileged) {\n      const { data: myGaugeSessions } = await supabase\n        .from('calibration_sessions')\n        .select('id')\n        .eq('gauge_user_id', profile?.id)\n      gaugeSessionIds = (myGaugeSessions || []).map(s => s.id)\n      if (gaugeSessionIds.length === 0) { setAllResults([]); setLR(false); return }\n    }\n\n    let resultsQuery = supabase\n      .from('calibration_submissions')\n      .select('evaluator_id, session_id, status, overall_score, is_calibrated, delta, submitted_at')\n      .eq('status', 'evaluated')\n      .eq('is_gauge', false)\n    if (gaugeSessionIds) resultsQuery = resultsQuery.in('session_id', gaugeSessionIds)\n    const { data: subs } = await resultsQuery\n      .order('submitted_at', { ascending: false })\n      .limit(200)\n\n    if ((subs || []).length > 0) {\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("✅ patch 2 applied"); }
  else { allOk = false; console.log("❌ patch 2 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 3: session list filtered to my own Gauge sessions unless admin/owner ---
{
  const oldStr = "  useEffect(() => { loadAll() }, [])\n\n  async function loadAll() {\n    setLoading(true)\n    const [{ data: sess }, { data: scs }, { data: us }] = await Promise.all([\n      supabase.from('calibration_sessions').select('*').order('created_at', { ascending: false }),\n      supabase.from('scorecards').select('id, name, type').eq('is_calibration', true).eq('is_published', true).order('name'),\n      supabase.from('users').select('id, name, email').ilike('email', '%@kaizengaming.com').order('email'),\n    ])\n    setSessions(sess || [])\n";
  const newStr = "  useEffect(() => { if (profile) loadAll() }, [profile])\n\n  async function loadAll() {\n    setLoading(true)\n    // Same rule as loadResults: admins/owners see every session; everyone else only\n    // sees sessions where they are the Gauge.\n    const isPrivileged = ['admin', 'owner'].includes(profile?.role)\n    let sessionsQuery = supabase.from('calibration_sessions').select('*').order('created_at', { ascending: false })\n    if (!isPrivileged) sessionsQuery = sessionsQuery.eq('gauge_user_id', profile?.id)\n    const [{ data: sess }, { data: scs }, { data: us }] = await Promise.all([\n      sessionsQuery,\n      supabase.from('scorecards').select('id, name, type').eq('is_calibration', true).eq('is_published', true).order('name'),\n      supabase.from('users').select('id, name, email').ilike('email', '%@kaizengaming.com').order('email'),\n    ])\n    setSessions(sess || [])\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("✅ patch 3 applied"); }
  else { allOk = false; console.log("❌ patch 3 FAILED (found " + count + " occurrences, expected 1)"); }
}

if (!allOk) {
  console.log("\n❌ Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n✅ All patches applied successfully to " + path);
