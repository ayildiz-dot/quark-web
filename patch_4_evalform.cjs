const fs = require('fs');

const FILE = 'src/pages/EvaluationForm.jsx';
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
  "add getFirstAnswerFromMetaValues helper before submitFullyAligned",
  `  // Copies the Vendor's walked answer chain onto this (KG) scorecard's own`,
  `  // Reads the value of the first-position section's first-position question
  // (i.e. "Controllability") out of a stored metadata_values array. Used by
  // both the fully-align path and the reconciliation resolver below, since
  // both need "what did this evaluation answer for Controllability". Assumes
  // the Vendor and KG DSAT scorecards share the same first-question title by
  // convention (confirmed and expected to remain true for both scorecards).
  const getFirstAnswerFromMetaValues = (metaValues, sections, dqs) => {
    const sortedSections = [...sections].sort((a, b) => a.position - b.position)
    const firstSection = sortedSections[0]
    if (!firstSection) return null
    const sectionQs = dqs.filter(q => q.section_id === firstSection.id).sort((a, b) => a.position - b.position)
    const routingQ = sectionQs.find(q => q.question_type === 'options') || sectionQs[0]
    if (!routingQ) return null
    const found = (metaValues || []).find(m => m.label === routingQ.title)
    return found?.value || null
  }

  // Copies the Vendor's walked answer chain onto this (KG) scorecard's own`
);

apply(
  "fetch the inserted row id and run the reconciliation resolver on spot-check submit",
  `        } else {
          const { error: evalError } = await supabase.from('evaluations').insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score: 100, failed_critical: false,
            metadata_values: [...metaPayload, ...dsatPayload],
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            overall_comment: null, status: 'submitted',
            evaluation_type: selectedScorecard.type,
            scorecard_version: selectedScorecard.version || 1,
            submitted_at: new Date().toISOString()
          })
          if (evalError) {
            if (evalError.code === '23505' && evalError.message?.includes('evaluations_dsat_ticket_unique')) {
              throw new Error('This ticket has already been evaluated on this scorecard. Go to Evaluations → find the existing evaluation → Edit (available for 72 hours after submission) to make changes.')
            }
            throw evalError
          }
        }`,
  `        } else {
          const { data: insertedDsatEval, error: evalError } = await supabase.from('evaluations').insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score: 100, failed_critical: false,
            metadata_values: [...metaPayload, ...dsatPayload],
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            overall_comment: null, status: 'submitted',
            evaluation_type: selectedScorecard.type,
            scorecard_version: selectedScorecard.version || 1,
            submitted_at: new Date().toISOString()
          }).select().single()
          if (evalError) {
            if (evalError.code === '23505' && evalError.message?.includes('evaluations_dsat_ticket_unique')) {
              throw new Error('This ticket has already been evaluated on this scorecard. This can only be corrected by an admin or owner — please contact one to make the change.')
            }
            throw evalError
          }

          // ── Reconciliation resolver (spot-check only) ────────────────────
          // Runs once, right here at submit, for KG - DSAT Evaluation submissions
          // only. Stamps deviated_controllability / is_deviated / deviation_source_evaluation_id
          // onto the Vendor's evaluation row. Never re-runs later — a Vendor edit to
          // Controllability after this point makes the stamp stale, which is a known
          // gap flagged for the future notifications system, not silently re-resolved here.
          if (selectedScorecard.is_spot_check && vendorEval && insertedDsatEval) {
            const kgAnswer = getFirstAnswerFromMetaValues(dsatPayload, dsatSections, dsatQuestions)
            const vendorAnswer = getFirstAnswerFromMetaValues(vendorEval.metadata_values, dsatSections, dsatQuestions)
            if (kgAnswer) {
              await supabase.from('evaluations').update({
                deviated_controllability: kgAnswer,
                is_deviated: vendorAnswer !== null && kgAnswer !== vendorAnswer,
                deviation_source_evaluation_id: insertedDsatEval.id,
              }).eq('id', vendorEval.id)
            }
          }
        }`
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
