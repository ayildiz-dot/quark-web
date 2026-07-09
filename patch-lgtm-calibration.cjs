const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1 ---
{
  const oldStr = "import { useState, useEffect } from 'react'";
  const newStr = "import { useState, useEffect, useRef } from 'react'";
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
  const oldStr = "  const [existingSub, setExistingSub] = useState(null)\n  const [error, setError]             = useState('')";
  const newStr = "  const [existingSub, setExistingSub] = useState(null)\n  const [error, setError]             = useState('')\n  const [showLgtmConfirm, setShowLgtmConfirm] = useState(false)\n  const commentRef = useRef(null)";
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
  const oldStr = "  // ── Submit handler ─────────────────────────────────────────────────────────\n\n  async function handleSubmit() {";
  const newStr = "  // \"Looks Good to Me\" — bulk-marks every attribute as Pass, then jumps\n  // straight to the Overall Comment field. Hidden for DSAT-type sessions.\n  function applyLgtm() {\n    setAnswers(prev => {\n      const next = { ...prev }\n      for (const q of questions) next[q.id] = 'pass'\n      return next\n    })\n    setShowLgtmConfirm(false)\n    setTimeout(() => {\n      commentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })\n      commentRef.current?.focus()\n    }, 50)\n  }\n\n  // ── Submit handler ─────────────────────────────────────────────────────────\n\n  async function handleSubmit() {";
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
  const oldStr = "            <h2 style={{ margin: 0, marginBottom: 6 }}>{session.title}</h2>\n            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>\n              <TypeBadge type={session.type} />\n              {isGauge && (\n                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>You are the Gauge</span>\n              )}\n              {session.session_date && (\n                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>\n                  {new Date(session.session_date).toLocaleDateString()}\n                </span>\n              )}\n            </div>\n          </div>";
  const newStr = "            <h2 style={{ margin: 0, marginBottom: 6 }}>{session.title}</h2>\n            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>\n              <TypeBadge type={session.type} />\n              {isGauge && (\n                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>You are the Gauge</span>\n              )}\n              {session.session_date && (\n                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>\n                  {new Date(session.session_date).toLocaleDateString()}\n                </span>\n              )}\n            </div>\n            {session.type !== 'dsat' && (\n              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>\n                <button className=\"btn btn-ghost btn-sm\" onClick={() => setShowLgtmConfirm(true)}\n                  style={{ fontWeight: 600 }}>\n                  LGTM\n                </button>\n                <span\n                  title='Clicking this button will mark all the attributes as \"Pass\" and will take you directly to the comments section.'\n                  style={{\n                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',\n                    width: 16, height: 16, borderRadius: '50%', fontSize: 11, fontWeight: 700,\n                    border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'help'\n                  }}>\n                  ?\n                </span>\n              </div>\n            )}\n          </div>";
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
  const oldStr = "        <textarea\n          placeholder=\"Optional overall comment on this calibration…\"\n          value={overallComment}\n          onChange={e => setComment(e.target.value)}";
  const newStr = "        <textarea\n          ref={commentRef}\n          placeholder=\"Optional overall comment on this calibration…\"\n          value={overallComment}\n          onChange={e => setComment(e.target.value)}";
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
  const oldStr = "        <button className=\"btn btn-primary\" onClick={handleSubmit} disabled={submitting || !allAnswered}>\n          {submitting ? 'Submitting…' : isGauge ? 'Submit as Gauge' : 'Submit Scoring'}\n        </button>\n      </div>\n    </div>\n  )\n}";
  const newStr = "        <button className=\"btn btn-primary\" onClick={handleSubmit} disabled={submitting || !allAnswered}>\n          {submitting ? 'Submitting…' : isGauge ? 'Submit as Gauge' : 'Submit Scoring'}\n        </button>\n      </div>\n\n      {showLgtmConfirm && (\n        <div className=\"modal-backdrop\" onClick={() => setShowLgtmConfirm(false)}>\n          <div className=\"modal\" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>\n            <div className=\"modal-body\" style={{ padding: '32px 28px' }}>\n              <h2 style={{ marginBottom: 12, fontSize: 17 }}>Mark all as Pass?</h2>\n              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>\n                This will mark every attribute on this scorecard as \"Pass\" and take you to the comments section. Any existing answers will be overwritten.\n              </p>\n              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>\n                <button className=\"btn btn-ghost\" onClick={() => setShowLgtmConfirm(false)}>Cancel</button>\n                <button className=\"btn btn-primary\" onClick={applyLgtm}>Yes, mark all Pass</button>\n              </div>\n            </div>\n          </div>\n        </div>\n      )}\n    </div>\n  )\n}";
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
