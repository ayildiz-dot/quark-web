const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: Gauge/Participant picker wasn't restricted to KG users ---
{
  const oldStr = "      supabase.from('users').select('id, name, email').order('email'),\n";
  const newStr = "      supabase.from('users').select('id, name, email').ilike('email', '%@kaizengaming.com').order('email'),\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 1 applied");
  } else {
    allOk = false;
    console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 2: session only auto-completed on the Gauge's submit path ---
{
  const oldStr = "    for (const es of (evalSubs || [])) {\n      await runDeltaForOne(es.id, es.overall_score, es.evaluator_id, gaugeSubId, gaugeScore)\n    }\n\n    const { data: allParts } = await supabase.from('calibration_participants')\n      .select('evaluator_id').eq('session_id', session.id)\n    const { data: evalDone } = await supabase.from('calibration_submissions')\n      .select('id').eq('session_id', session.id).eq('is_gauge', false).eq('status', 'evaluated')\n\n    if ((evalDone?.length || 0) >= (allParts?.length || 1) && (allParts?.length || 0) > 0) {\n      await supabase.from('calibration_sessions').update({ status: 'completed' }).eq('id', session.id)\n    }\n  }\n";
  const newStr = "    for (const es of (evalSubs || [])) {\n      await runDeltaForOne(es.id, es.overall_score, es.evaluator_id, gaugeSubId, gaugeScore)\n    }\n\n    await checkSessionCompletion()\n  }\n\n  // Marks the session 'completed' once the Gauge has submitted AND every participant's\n  // submission has reached 'evaluated'. Called from both the Gauge's own submit path\n  // (runDeltaForAll, above) and the regular-evaluator submit path below — previously this\n  // only ran inside runDeltaForAll, so a session where the Gauge submitted before all\n  // participants finished would silently stay stuck on \"Scoring\" forever.\n  async function checkSessionCompletion() {\n    const { data: gaugeSub } = await supabase.from('calibration_submissions')\n      .select('id').eq('session_id', session.id).eq('is_gauge', true).eq('status', 'submitted').maybeSingle()\n    if (!gaugeSub) return\n\n    const { data: allParts } = await supabase.from('calibration_participants')\n      .select('evaluator_id').eq('session_id', session.id)\n    const { data: evalDone } = await supabase.from('calibration_submissions')\n      .select('id').eq('session_id', session.id).eq('is_gauge', false).eq('status', 'evaluated')\n\n    if ((evalDone?.length || 0) >= (allParts?.length || 1) && (allParts?.length || 0) > 0) {\n      await supabase.from('calibration_sessions').update({ status: 'completed' }).eq('id', session.id)\n    }\n  }\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 2 applied");
  } else {
    allOk = false;
    console.log("❌ patch 2 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 3: also check completion on the regular-evaluator submit path ---
{
  const oldStr = "        if (gaugeSub) {\n          await runDeltaForOne(subId, score, uid, gaugeSub.id, gaugeSub.overall_score)\n        }\n";
  const newStr = "        if (gaugeSub) {\n          await runDeltaForOne(subId, score, uid, gaugeSub.id, gaugeSub.overall_score)\n          await checkSessionCompletion()\n        }\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 3 applied");
  } else {
    allOk = false;
    console.log("❌ patch 3 FAILED (found " + count + " occurrences, expected 1)");
  }
}

if (!allOk) {
  console.log("\n❌ Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n✅ All patches applied successfully to " + path);
