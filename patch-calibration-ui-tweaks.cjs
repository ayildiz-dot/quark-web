const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: remove subtitle under "Calibration" title ---
{
  const oldStr = "        <div>\n          <h1>Calibration</h1>\n          <p className=\"page-sub\">COPC calibration sessions and certifications</p>\n        </div>\n";
  const newStr = "        <div>\n          <h1>Calibration</h1>\n        </div>\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 1 applied");
  } else {
    allOk = false;
    console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 2: make the currently-managed session row clearly stand out ---
{
  const oldStr = "                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: selected?.id === s.id ? 'var(--bg-secondary)' : 'transparent' }}>\n";
  const newStr = "                  <tr key={s.id} style={{\n                    borderBottom: '1px solid var(--border)',\n                    background: selected?.id === s.id ? 'rgba(37,99,235,0.08)' : 'transparent',\n                    borderLeft: selected?.id === s.id ? '3px solid #2563eb' : '3px solid transparent',\n                  }}>\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 2 applied");
  } else {
    allOk = false;
    console.log("❌ patch 2 FAILED (found " + count + " occurrences, expected 1)");
  }
}

if (!allOk) {
  console.log("\n❌ Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n✅ All patches applied successfully to " + path);
