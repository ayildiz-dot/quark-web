const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: add isKgUser / canManage ---
{
  const oldStr = "export default function Calibration() {\n  const { profile } = useAuth()\n  const isAdmin = ['admin', 'owner'].includes(profile?.role)\n  const [tab, setTab]                = useState('sessions')\n";
  const newStr = "export default function Calibration() {\n  const { profile } = useAuth()\n  const isAdmin = ['admin', 'owner'].includes(profile?.role)\n  const isKgUser = profile?.email?.endsWith('@kaizengaming.com')\n  const canManage = isAdmin || isKgUser\n  const [tab, setTab]                = useState('sessions')\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("✅ patch 1 applied"); }
  else { allOk = false; console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 2: show the tab switcher to any KG user ---
{
  const oldStr = "      {isAdmin && (\n        <div style={{ display: 'flex', marginBottom: 28, borderBottom: '1px solid var(--border)' }}>\n";
  const newStr = "      {canManage && (\n        <div style={{ display: 'flex', marginBottom: 28, borderBottom: '1px solid var(--border)' }}>\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) { src = src.replace(oldStr, newStr); console.log("✅ patch 2 applied"); }
  else { allOk = false; console.log("❌ patch 2 FAILED (found " + count + " occurrences, expected 1)"); }
}

// --- patch 3: render Manage Sessions for any KG user ---
{
  const oldStr = "      {tab === 'admin' && isAdmin && <CalibrationAdmin />}\n";
  const newStr = "      {tab === 'admin' && canManage && <CalibrationAdmin />}\n";
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
