const fs = require('fs');

const FILE = 'src/pages/Admin.jsx';
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
  "add manualSampling state",
  `  const [evaluators, setEvaluators]         = useState([])
  const [assignmentRules, setAssignmentRules] = useState({})

  const [saving, setSaving] = useState(false)`,
  `  const [evaluators, setEvaluators]         = useState([])
  const [assignmentRules, setAssignmentRules] = useState({})

  const [manualSampling, setManualSampling] = useState(queue.manual_sampling || false)

  const [saving, setSaving] = useState(false)`
);

apply(
  "gate validation checks on manualSampling",
  `    if (cycleFrequency === 'weekly' && !runDay) return flash('Select a run day for the weekly cycle.', false)
    if (cycleFrequency === 'weekly' && captureDays.length === 0) return flash('Select at least one capture day.', false)
    if (incompleteRuleCount > 0) return flash(incompleteRuleCount + ' stratification rule(s) are missing a dimension, value, or sizing amount — fill them in or remove them.', false)
    if (minTotalCases !== '' && maxTotalCases !== '' && parseInt(minTotalCases) > parseInt(maxTotalCases)) return flash('Min Total Cases cannot exceed Max Total Cases.', false)
    if (incompleteAssignmentCount > 0) return flash(incompleteAssignmentCount + ' assignment condition(s) are incomplete or empty — fill them in or remove the group.', false)`,
  `    if (!manualSampling && cycleFrequency === 'weekly' && !runDay) return flash('Select a run day for the weekly cycle.', false)
    if (!manualSampling && cycleFrequency === 'weekly' && captureDays.length === 0) return flash('Select at least one capture day.', false)
    if (!manualSampling && incompleteRuleCount > 0) return flash(incompleteRuleCount + ' stratification rule(s) are missing a dimension, value, or sizing amount — fill them in or remove them.', false)
    if (!manualSampling && minTotalCases !== '' && maxTotalCases !== '' && parseInt(minTotalCases) > parseInt(maxTotalCases)) return flash('Min Total Cases cannot exceed Max Total Cases.', false)
    if (!manualSampling && incompleteAssignmentCount > 0) return flash(incompleteAssignmentCount + ' assignment condition(s) are incomplete or empty — fill them in or remove the group.', false)`
);

apply(
  "persist manual_sampling and short-circuit save",
  `    const { error: mapError } = await supabase.from('queues').update({
      scorecard_id: scId, market_value: market, hub_id: hub.id, workspace_id: ws.id,
    }).eq('id', queue.id)
    if (mapError) {
      setSaving(false)
      if (mapError.code === '23505') return flash('Another queue under this hub already uses that scorecard + market combination.', false)
      return flash(mapError.message, false)
    }

    const payload = {`,
  `    const { error: mapError } = await supabase.from('queues').update({
      scorecard_id: scId, market_value: market, hub_id: hub.id, workspace_id: ws.id, manual_sampling: manualSampling,
    }).eq('id', queue.id)
    if (mapError) {
      setSaving(false)
      if (mapError.code === '23505') return flash('Another queue under this hub already uses that scorecard + market combination.', false)
      return flash(mapError.message, false)
    }

    if (manualSampling) {
      setSaving(false)
      await onMappingSaved()
      flash('Queue settings saved')
      return
    }

    const payload = {`
);

apply(
  "add toggle header and gate stratification/cycle sections",
  `      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Sampling Configuration
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Stratification Rules</label>

          {siblingsOf(null).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
              No stratification rules yet — leaving this empty means a fully randomized sample will be drawn from this queue's market-filtered population once the Echo integration provides case data.
            </div>
          ) : (
            <div>{siblingsOf(null).map(r => renderNode(r, 0))}</div>
          )}
          {renderAddToolbar(null)}

          {incompleteRuleCount > 0 && (
            <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
              {incompleteRuleCount} rule(s) outlined in red are missing a dimension, value, or sizing amount.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cycle Frequency</label>
            <select className="select select-sm" value={cycleFrequency} onChange={e => { const v = e.target.value; setCycleFrequency(v); if (v === 'daily') setCaptureDays([]) }}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {cycleFrequency === 'weekly' && (
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Run Day</label>
              <select className="select select-sm" value={runDay} onChange={e => setRunDay(e.target.value)}>
                {WEEKDAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Global Minimum Cases / Agent<InfoTooltip text="Guarantees every agent has at least this many cases across the ENTIRE sample, combining all rules. Tops up from pools they already qualify for if anyone falls short." /></label>
            <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={globalMin} placeholder="None" onChange={e => setGlobalMin(e.target.value)} />
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, maxWidth: 180 }}>Applies across the whole sample, on top of any per-rule minimums above.</div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Total Cases<InfoTooltip text="The sample must contain at least this many cases in total. If the rules produce fewer, you'll get a warning — nothing is auto-added to close the gap." /></label>
            <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={minTotalCases} placeholder="No floor" onChange={e => setMinTotalCases(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Total Cases<InfoTooltip text="The sample won't exceed this many cases in total. If the rules would produce more, the excess is trimmed proportionally, never breaking a rule's own Min / Agent floor." /></label>
            <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={maxTotalCases} placeholder="No ceiling" onChange={e => setMaxTotalCases(e.target.value)} />
          </div>
        </div>

        {cycleFrequency === 'weekly' ? (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Days (whose handled cases get pulled in)</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {WEEKDAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleCaptureDay(d)} className="btn btn-sm"
                  style={{ fontSize: 11, padding: '4px 10px',
                    backgroundColor: captureDays.includes(d) ? 'var(--accent)' : 'var(--surface)',
                    color: captureDays.includes(d) ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid ' + (captureDays.includes(d) ? 'var(--accent)' : 'var(--border)') }}>
                  {d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Window</label>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', maxWidth: 320 }}>
              Daily cycles always capture the previous day's cases (Day-1). No selection needed.
            </div>
          </div>
        )}
      </div>`,
  `      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Sampling Configuration
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: manualSampling ? 'var(--accent)' : 'var(--text-secondary)' }}>
              Manual Sampling Ingestion
            </span>
            <span
              onClick={() => setManualSampling(m => !m)}
              style={{
                position: 'relative', width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                backgroundColor: manualSampling ? 'var(--accent)' : 'var(--border)',
                transition: 'background-color 0.15s ease', cursor: 'pointer',
              }}>
              <span style={{
                position: 'absolute', top: 2, left: manualSampling ? 18 : 2,
                width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
                boxShadow: '0 1px 2px #00000033', transition: 'left 0.15s ease',
              }} />
            </span>
            <InfoTooltip text="When on, evaluators source and submit cases for this queue manually. Stratification, cycle, and automatic assignment rules don't apply." />
          </label>
        </div>

        {manualSampling ? (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
            This queue is running on manual evaluation submission. Evaluators assigned to this queue select and submit cases directly.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Stratification Rules</label>

              {siblingsOf(null).length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>
                  No stratification rules yet — leaving this empty means a fully randomized sample will be drawn from this queue's market-filtered population once the Echo integration provides case data.
                </div>
              ) : (
                <div>{siblingsOf(null).map(r => renderNode(r, 0))}</div>
              )}
              {renderAddToolbar(null)}

              {incompleteRuleCount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
                  {incompleteRuleCount} rule(s) outlined in red are missing a dimension, value, or sizing amount.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 18, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Cycle Frequency</label>
                <select className="select select-sm" value={cycleFrequency} onChange={e => { const v = e.target.value; setCycleFrequency(v); if (v === 'daily') setCaptureDays([]) }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
              {cycleFrequency === 'weekly' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Run Day</label>
                  <select className="select select-sm" value={runDay} onChange={e => setRunDay(e.target.value)}>
                    {WEEKDAYS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Global Minimum Cases / Agent<InfoTooltip text="Guarantees every agent has at least this many cases across the ENTIRE sample, combining all rules. Tops up from pools they already qualify for if anyone falls short." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={globalMin} placeholder="None" onChange={e => setGlobalMin(e.target.value)} />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3, maxWidth: 180 }}>Applies across the whole sample, on top of any per-rule minimums above.</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Total Cases<InfoTooltip text="The sample must contain at least this many cases in total. If the rules produce fewer, you'll get a warning — nothing is auto-added to close the gap." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={minTotalCases} placeholder="No floor" onChange={e => setMinTotalCases(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Total Cases<InfoTooltip text="The sample won't exceed this many cases in total. If the rules would produce more, the excess is trimmed proportionally, never breaking a rule's own Min / Agent floor." /></label>
                <input type="number" className="input" style={{ width: 90, height: 30 }} min={0} value={maxTotalCases} placeholder="No ceiling" onChange={e => setMaxTotalCases(e.target.value)} />
              </div>
            </div>

            {cycleFrequency === 'weekly' ? (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Days (whose handled cases get pulled in)</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {WEEKDAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleCaptureDay(d)} className="btn btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px',
                        backgroundColor: captureDays.includes(d) ? 'var(--accent)' : 'var(--surface)',
                        color: captureDays.includes(d) ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid ' + (captureDays.includes(d) ? 'var(--accent)' : 'var(--border)') }}>
                      {d.slice(0,3).charAt(0).toUpperCase() + d.slice(1,3)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Capture Window</label>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', maxWidth: 320 }}>
                  Daily cycles always capture the previous day's cases (Day-1). No selection needed.
                </div>
              </div>
            )}
          </>
        )}
      </div>`
);

apply(
  "gate evaluator assignment rules section",
  `      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Evaluator Assignment Rules
        </div>

        {evaluators.length === 0 ? (`,
  `      {!manualSampling && (
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Evaluator Assignment Rules
        </div>

        {evaluators.length === 0 ? (`
);

apply(
  "close evaluator assignment rules gate",
  `        {incompleteAssignmentCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>
            {incompleteAssignmentCount} condition(s)/group(s) outlined above need attention before saving.
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={saveQueueSettings} disabled={saving}>`,
  `        {incompleteAssignmentCount > 0 && (
          <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>
            {incompleteAssignmentCount} condition(s)/group(s) outlined above need attention before saving.
          </div>
        )}
      </div>
      )}

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={saveQueueSettings} disabled={saving}>`
);

apply(
  "add manual sampling badge in workspace card queue row",
  `                                {samplingByQueue[q.id] && (
                                  <span title={\`Sampling configuration set (\${samplingByQueue[q.id]} cycle)\`}
                                    style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                    backgroundColor: '#8b5cf622', color: '#8b5cf6', border: '1px solid #8b5cf644' }}>
                                    🎯 Sampling · {samplingByQueue[q.id] === 'weekly' ? 'Weekly' : 'Daily'}
                                  </span>
                                )}`,
  `                                {q.manual_sampling ? (
                                  <span title="Manual sampling ingestion is active for this queue"
                                    style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                    backgroundColor: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                                    ✋ Manual Sampling
                                  </span>
                                ) : samplingByQueue[q.id] && (
                                  <span title={\`Sampling configuration set (\${samplingByQueue[q.id]} cycle)\`}
                                    style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, fontWeight: 500,
                                    backgroundColor: '#8b5cf622', color: '#8b5cf6', border: '1px solid #8b5cf644' }}>
                                    🎯 Sampling · {samplingByQueue[q.id] === 'weekly' ? 'Weekly' : 'Daily'}
                                  </span>
                                )}`
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
