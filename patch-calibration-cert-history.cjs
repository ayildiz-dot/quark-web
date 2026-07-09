const fs = require("fs");
const path = "src/pages/Calibration.jsx";
let src = fs.readFileSync(path, "utf8");
let allOk = true;

// --- patch 1: record every result as history instead of overwriting one row ---
{
  const oldStr = "    await supabase.from('calibration_submissions')\n      .update({ delta, is_calibrated: isCalibrated, status: 'evaluated' })\n      .eq('id', evalSubId)\n\n    const { data: cert } = await supabase.from('calibration_certifications')\n      .select('*').eq('evaluator_id', evalId).eq('scorecard_type', session.type).maybeSingle()\n\n    if (!cert) {\n      await supabase.from('calibration_certifications').insert({\n        evaluator_id: evalId,\n        scorecard_type: session.type,\n        is_active: isCalibrated,\n        consecutive_failures: isCalibrated ? 0 : 1,\n        last_calibrated_at: isCalibrated ? new Date().toISOString() : null,\n        updated_at: new Date().toISOString(),\n      })\n    } else {\n      const newFails = isCalibrated ? 0 : (cert.consecutive_failures || 0) + 1\n      const nowRevoked = newFails >= 3\n      await supabase.from('calibration_certifications').update({\n        is_active: isCalibrated && !nowRevoked,\n        consecutive_failures: newFails,\n        last_calibrated_at: isCalibrated ? new Date().toISOString() : cert.last_calibrated_at,\n        revoked_at: nowRevoked && !cert.revoked_at ? new Date().toISOString() : cert.revoked_at,\n        revocation_reason: nowRevoked && !cert.revoked_at ? '3 consecutive calibration failures' : cert.revocation_reason,\n        updated_at: new Date().toISOString(),\n      }).eq('id', cert.id)\n    }\n  }\n";
  const newStr = "    await supabase.from('calibration_submissions')\n      .update({ delta, is_calibrated: isCalibrated, status: 'evaluated' })\n      .eq('id', evalSubId)\n\n    // Append-only: every result is recorded and tagged to this specific scorecard_id,\n    // never overwritten. Current certification status is derived from this history\n    // in CalibrationHome, not stored/cached here — see calibration_certification_history.\n    await supabase.from('calibration_certification_history').insert({\n      evaluator_id: evalId,\n      scorecard_id: session.scorecard_id,\n      session_id: session.id,\n      is_calibrated: isCalibrated,\n      delta,\n    })\n  }\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 1 applied");
  } else {
    allOk = false;
    console.log("❌ patch 1 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 2: load and derive per-scorecard status from history ---
{
  const oldStr = "    const { data: certsData } = await supabase\n      .from('calibration_certifications')\n      .select('*')\n      .eq('evaluator_id', uid)\n    setCerts(certsData || [])\n";
  const newStr = "    // Append-only history, one row per (evaluator, scorecard, session). Status per\n    // scorecard is derived below from the ordered history — never a single mutable\n    // row, so different scorecards of the same type (e.g. per-division Quality\n    // scorecards) never overwrite or mix into each other.\n    const { data: certHistory } = await supabase\n      .from('calibration_certification_history')\n      .select('scorecard_id, is_calibrated, delta, recorded_at')\n      .eq('evaluator_id', uid)\n      .order('recorded_at', { ascending: false })\n\n    const scorecardIds = [...new Set((certHistory || []).map(h => h.scorecard_id))]\n    let scorecardMap = {}\n    if (scorecardIds.length > 0) {\n      const { data: scs } = await supabase.from('scorecards').select('id, name, type').in('id', scorecardIds)\n      scorecardMap = Object.fromEntries((scs || []).map(s => [s.id, s]))\n    }\n\n    const derivedCerts = scorecardIds.map(scId => {\n      const rows = (certHistory || []).filter(h => h.scorecard_id === scId) // already sorted newest first\n      const latest = rows[0]\n      let consecutiveFailures = 0\n      for (const r of rows) {\n        if (r.is_calibrated) break\n        consecutiveFailures++\n      }\n      const lastPass = rows.find(r => r.is_calibrated)\n      return {\n        scorecard: scorecardMap[scId],\n        isActive: !!latest?.is_calibrated,\n        consecutiveFailures,\n        lastCalibratedAt: lastPass?.recorded_at || null,\n      }\n    })\n    setCerts(derivedCerts)\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 2 applied");
  } else {
    allOk = false;
    console.log("❌ patch 2 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 3: CertCard now takes a derived cert object instead of a fixed type ---
{
  const oldStr = "  function CertCard({ type, label }) {\n    const cert = certs.find(c => c.scorecard_type === type)\n    return (\n      <div style={{ flex: 1, ...cardStyle, textAlign: 'center' }}>\n        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>\n          {label}\n        </div>\n        {!cert ? (\n          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No calibration data yet</div>\n        ) : (\n          <>\n            <div style={{\n              display: 'inline-block', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,\n              backgroundColor: cert.is_active ? '#16a34a22' : '#dc262622',\n              color: cert.is_active ? '#16a34a' : '#dc2626',\n              border: `1px solid ${cert.is_active ? '#16a34a44' : '#dc262644'}`,\n              marginBottom: 8,\n            }}>\n              {cert.is_active ? '✓ Certified' : '✗ Not Certified'}\n            </div>\n            {cert.last_calibrated_at && (\n              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>\n                Last calibrated: {new Date(cert.last_calibrated_at).toLocaleDateString()}\n              </div>\n            )}\n            {!cert.is_active && cert.consecutive_failures >= 3 && (\n              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>\n                Recertification required · {cert.consecutive_failures} consecutive failures\n              </div>\n            )}\n          </>\n        )}\n      </div>\n    )\n  }\n";
  const newStr = "  function CertCard({ cert }) {\n    const label = cert.scorecard?.name || 'Unknown scorecard'\n    return (\n      <div style={{ flex: 1, ...cardStyle, textAlign: 'center' }}>\n        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>\n          {label}\n        </div>\n        <div style={{\n          display: 'inline-block', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,\n          backgroundColor: cert.isActive ? '#16a34a22' : '#dc262622',\n          color: cert.isActive ? '#16a34a' : '#dc2626',\n          border: `1px solid ${cert.isActive ? '#16a34a44' : '#dc262644'}`,\n          marginBottom: 8,\n        }}>\n          {cert.isActive ? '✓ Certified' : '✗ Not Certified'}\n        </div>\n        {cert.lastCalibratedAt && (\n          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>\n            Last calibrated: {new Date(cert.lastCalibratedAt).toLocaleDateString()}\n          </div>\n        )}\n        {!cert.isActive && cert.consecutiveFailures >= 3 && (\n          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>\n            Recertification required · {cert.consecutiveFailures} consecutive failures\n          </div>\n        )}\n      </div>\n    )\n  }\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 3 applied");
  } else {
    allOk = false;
    console.log("❌ patch 3 FAILED (found " + count + " occurrences, expected 1)");
  }
}

// --- patch 4: render one card per scorecard instead of fixed DSAT/Quality cards ---
{
  const oldStr = "        <div style={{ display: 'flex', gap: 16 }}>\n          <CertCard type=\"dsat\"    label=\"DSAT\" />\n          <CertCard type=\"quality\" label=\"Quality\" />\n        </div>\n";
  const newStr = "        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>\n          {certs.length === 0 ? (\n            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No calibration data yet</div>\n          ) : (\n            certs.map(cert => <CertCard key={cert.scorecard?.id || Math.random()} cert={cert} />)\n          )}\n        </div>\n";
  const count = src.split(oldStr).length - 1;
  if (count === 1) {
    src = src.replace(oldStr, newStr);
    console.log("✅ patch 4 applied");
  } else {
    allOk = false;
    console.log("❌ patch 4 FAILED (found " + count + " occurrences, expected 1)");
  }
}

if (!allOk) {
  console.log("\n❌ Aborting: not all anchors matched. No changes written to " + path + ".");
  process.exit(1);
}
fs.writeFileSync(path, src);
console.log("\n✅ All patches applied successfully to " + path);
