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
  "handle duplicate ticket error on DSAT insert",
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
          if (evalError) throw evalError
        }`,
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
        }`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ Anchor failed. NOTHING WAS WRITTEN. Fix anchor and re-run.');
  process.exit(1);
}

fs.writeFileSync(FILE, content);
console.log(`\n✅ Applied successfully. ${FILE} updated.`);
