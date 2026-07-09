const fs = require("fs");
const path = "src/pages/EvaluationForm.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1 ---
{
  const oldStr = "  const [overallComment, setOverallComment] = useState('')\n  const [dsatSections,         setDsatSections]         = useState([])";
  const newStr = "  const [overallComment, setOverallComment] = useState('')\n  const [showLgtmConfirm, setShowLgtmConfirm] = useState(false)\n  const [dsatSections,         setDsatSections]         = useState([])";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 1 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 1 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 2 ---
{
  const oldStr = "  const stateRef = useRef({})\n  const draftIdRef = useRef(null)";
  const newStr = "  const stateRef = useRef({})\n  const draftIdRef = useRef(null)\n  const overallCommentRef = useRef(null)";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 2 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 2 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 3 ---
{
  const oldStr = "  const flash = (text, ok = true) => {";
  const newStr = "  // \"Looks Good to Me\" — bulk-marks every quality question as Pass, then jumps\n  // straight to the Overall Comment field. Quality + Calibration scorecards only\n  // (never DSAT, which has no per-question Pass/Fail scoring in this form).\n  const applyLgtm = () => {\n    setAnswers(prev => {\n      const next = {}\n      for (const q of questions) {\n        next[q.id] = { ...prev[q.id], score: 'pass' }\n      }\n      return next\n    })\n    setShowLgtmConfirm(false)\n    triggerAutoSave()\n    setTimeout(() => {\n      overallCommentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })\n      overallCommentRef.current?.focus()\n    }, 50)\n  }\n\n  const flash = (text, ok = true) => {";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 3 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 3 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 4 ---
{
  const oldStr = "            <h1>{selectedScorecard.name}</h1>\n            <p className=\"page-sub\">Step 2 of 2 — {isDsat ? 'Complete the DSAT form' : 'Score each question'}</p>\n          </div>\n          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>";
  const newStr = "            <h1>{selectedScorecard.name}</h1>\n            <p className=\"page-sub\">Step 2 of 2 — {isDsat ? 'Complete the DSAT form' : 'Score each question'}</p>\n            {!isDsat && (\n              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>\n                <button className=\"btn btn-ghost btn-sm\" onClick={() => setShowLgtmConfirm(true)}\n                  style={{ fontWeight: 600 }}>\n                  LGTM\n                </button>\n                <span\n                  title='Clicking this button will mark all the attributes as \"Pass\" and will take you directly to the comments section.'\n                  style={{\n                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',\n                    width: 16, height: 16, borderRadius: '50%', fontSize: 11, fontWeight: 700,\n                    border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'help'\n                  }}>\n                  ?\n                </span>\n              </div>\n            )}\n          </div>\n          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 4 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 4 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 5 ---
{
  const oldStr = "        <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 24 }}>\n          <div style={{\n            height: 4, borderRadius: 4, background: 'var(--accent)',\n            width: `${pct}%`, transition: 'width 0.3s'\n          }} />\n        </div>\n        {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className=\"btn btn-sm\" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}\n\n        {isDsat ? (";
  const newStr = "        <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, marginBottom: 24 }}>\n          <div style={{\n            height: 4, borderRadius: 4, background: 'var(--accent)',\n            width: `${pct}%`, transition: 'width 0.3s'\n          }} />\n        </div>\n        {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className=\"btn btn-sm\" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}\n        {showLgtmConfirm && (\n          <div className=\"modal-backdrop\" onClick={() => setShowLgtmConfirm(false)}>\n            <div className=\"modal\" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>\n              <div className=\"modal-body\" style={{ padding: '32px 28px' }}>\n                <h2 style={{ marginBottom: 12, fontSize: 17 }}>Mark all as Pass?</h2>\n                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>\n                  This will mark every attribute on this scorecard as \"Pass\" and take you to the comments section. Any existing answers will be overwritten.\n                </p>\n                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>\n                  <button className=\"btn btn-ghost\" onClick={() => setShowLgtmConfirm(false)}>Cancel</button>\n                  <button className=\"btn btn-primary\" onClick={applyLgtm}>Yes, mark all Pass</button>\n                </div>\n              </div>\n            </div>\n          </div>\n        )}\n\n        {isDsat ? (";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 5 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 5 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 6 ---
{
  const oldStr = "                <textarea className=\"input\" rows={4}\n                  placeholder=\"Add an overall comment for this evaluation…\"\n                  value={overallComment}\n                  onChange={e => setOverallComment(e.target.value)}\n                  style={{ resize: 'vertical', fontSize: 13 }} />";
  const newStr = "                <textarea className=\"input\" rows={4}\n                  ref={overallCommentRef}\n                  placeholder=\"Add an overall comment for this evaluation…\"\n                  value={overallComment}\n                  onChange={e => setOverallComment(e.target.value)}\n                  style={{ resize: 'vertical', fontSize: 13 }} />";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("\u2705 patch 6 applied");
  } else {
    allOk = false;
    console.log("\u274c patch 6 FAILED (found " + count + " occurrences, expected 1)");
  }
}

if (!allOk) {
  console.log("\n\u274c Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n\u2705 All patches applied successfully to " + path);
