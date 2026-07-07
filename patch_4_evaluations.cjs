const fs = require('fs');

const FILE = 'src/pages/Evaluations.jsx';
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
  "replace within72h/canEdit with type-aware edit windows",
  `  // An evaluation is editable for 72h after submission, by its author or an admin/owner.
  const within72h = (submittedAt) => {
    if (!submittedAt) return false
    const ms = Date.now() - new Date(submittedAt).getTime()
    return ms < 72 * 60 * 60 * 1000
  }
  const canEdit = (ev) => {
    const privileged = ['admin', 'owner'].includes(profile?.role)
    const isAuthor = ev.evaluator_id === profile?.id
    return within72h(ev.submitted_at) && (isAuthor || privileged)
  }`,
  `  // Edit windows differ by scorecard type:
  // - Quality: author OR admin/owner, within 72 hours of submission.
  // - DSAT (Vendor and KG spot-check alike): admin/owner ONLY, within 1 month —
  //   regular evaluators have no edit rights on DSAT submissions at all, since
  //   duplicate-ticket corrections and Controllability corrections on DSAT rows
  //   need to go through an admin/owner rather than the original author.
  const withinWindow = (submittedAt, hours) => {
    if (!submittedAt) return false
    const ms = Date.now() - new Date(submittedAt).getTime()
    return ms < hours * 60 * 60 * 1000
  }
  const canEdit = (ev) => {
    const privileged = ['admin', 'owner'].includes(profile?.role)
    const isAuthor = ev.evaluator_id === profile?.id
    if (ev.evaluation_type === 'dsat') {
      return privileged && withinWindow(ev.submitted_at, 24 * 30)
    }
    return withinWindow(ev.submitted_at, 72) && (isAuthor || privileged)
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
