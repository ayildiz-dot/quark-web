const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: past-results session lookup never selected results_released ---
{
  const oldStr = "      const { data: rsSessions } = await supabase\n        .from('calibration_sessions')\n        .select('id, title, type, session_date')\n        .in('id', rsIds)";
  const newStr = "      const { data: rsSessions } = await supabase\n        .from('calibration_sessions')\n        .select('id, title, type, session_date, results_released')\n        .in('id', rsIds)";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 1 applied");
  } else {
    allOk = false;
    console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)");
  }
}

if (!allOk) {
  console.log("\n❌ Aborting: anchor didn't match. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n✅ Patch applied successfully to " + path);
