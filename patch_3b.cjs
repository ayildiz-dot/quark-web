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
  "add submitFullyAligned function before submitEvaluation",
  `  const submitEvaluation = async () => {
    if (!metaValid()) return flash('Please fill in all required metadata fields.', false)
    if (!questionsValid()) return flash('Please answer all required questions before submitting.', false)
    if (selectedScorecard.type !== 'dsat' && !overallComment.trim()) return flash('Please add an overall comment before submitting.', false)`,
  `  // Copies the Vendor's walked answer chain onto this (KG) scorecard's own
  // dsatAnswers, matching by question title / option label (IDs differ between
  // scorecards but titles and labels are shared by convention). Then submits
  // immediately, mirroring the Vendor's full path.
  const submitFullyAligned = async () => {
    if (!vendorChain.length) return
    const newDsatAnswers = { ...dsatAnswers }
    const visitedSectionIds = []
    let currentSection = [...dsatSections].sort((a, b) => a.position - b.position)[0]
    for (const step of vendorChain) {
      if (!currentSection) break
      visitedSectionIds.push(currentSection.id)
      const q = dsatQuestions.find(q => q.section_id === currentSection.id && q.title === step.questionTitle)
      if (!q) break
      newDsatAnswers[q.id] = { value: step.answerValue }
      const opt = dsatOptions.find(o => o.question_id === q.id && o.label === step.answerValue)
      currentSection = opt?.jump_to_section_id ? dsatSections.find(s => s.id === opt.jump_to_section_id) : null
    }
    setDsatAnswers(newDsatAnswers)
    setDsatSectionHistory(visitedSectionIds.slice(0, -1))
    setDsatCurrentSectionId(visitedSectionIds[visitedSectionIds.length - 1] || dsatCurrentSectionId)
    submitEvaluation({ dsatAnswersOverride: newDsatAnswers, visitedSectionIdsOverride: visitedSectionIds })
  }

  const submitEvaluation = async (opts = {}) => {
    const effectiveDsatAnswers = opts.dsatAnswersOverride || dsatAnswers
    const effectiveVisitedIds = opts.visitedSectionIdsOverride || null

    if (!metaValid()) return flash('Please fill in all required metadata fields.', false)
    if (selectedScorecard?.is_spot_check) {
      if (vendorLookupState === 'not_found') return flash('No Vendor DSAT evaluation was found for this Ticket ID. A spot-check cannot be submitted until the Vendor has evaluated this ticket.', false)
      if (vendorLookupState === 'conflict') return flash('This Ticket ID matches more than one Vendor DSAT evaluation, which should not happen. Please contact an admin to resolve this before submitting.', false)
      if (vendorLookupState !== 'found') return flash('Please enter a valid Ticket ID and wait for the Vendor evaluation lookup to complete.', false)
    }
    if (!opts.dsatAnswersOverride && !questionsValid()) return flash('Please answer all required questions before submitting.', false)
    if (selectedScorecard.type !== 'dsat' && !overallComment.trim()) return flash('Please add an overall comment before submitting.', false)`
);

apply(
  "use effective dsat answers and visited ids when building dsatPayload",
  `      if (selectedScorecard.type === 'dsat') {
        const visitedSectionIds = new Set([...dsatSectionHistory, dsatCurrentSectionId])
        const visitedQuestions = dsatQuestions.filter(q => visitedSectionIds.has(q.section_id))
        const dsatPayload = visitedQuestions.map(q => ({
          field_id: q.id, label: q.title, value: dsatAnswers[q.id]?.value || ''
        }))`,
  `      if (selectedScorecard.type === 'dsat') {
        const visitedSectionIds = new Set(effectiveVisitedIds || [...dsatSectionHistory, dsatCurrentSectionId])
        const visitedQuestions = dsatQuestions.filter(q => visitedSectionIds.has(q.section_id))
        const dsatPayload = visitedQuestions.map(q => ({
          field_id: q.id, label: q.title, value: effectiveDsatAnswers[q.id]?.value || ''
        }))`
);

apply(
  "fix bare onClick submitEvaluation bindings to avoid passing the click event as opts",
  `<button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}>`,
  `<button className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}>`
);

apply(
  "fix bare onClick submitEvaluation binding in dsat last-section footer",
  `                    <button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}
                      style={{ marginRight: 12 }}>`,
  `                    <button className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}
                      style={{ marginRight: 12 }}>`
);

apply(
  "fix bare onClick submitEvaluation binding in quality footer",
  `              <button className="btn btn-primary" onClick={submitEvaluation} disabled={submitting}
                style={{ marginRight: 12 }}>`,
  `              <button className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}
                style={{ marginRight: 12 }}>`
);

apply(
  "add isFirstSection/showVendorBanner and Vendor answer-chain banner with fully-align checkbox",
  `            const goToPrevSection = () => {
              const prev = dsatSectionHistory[dsatSectionHistory.length - 1]
              if (prev) {
                setDsatSectionHistory(h => h.slice(0, -1))
                setDsatCurrentSectionId(prev)
              }
            }
            return (
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Section: <strong style={{ color: 'var(--text-primary)' }}>{currentSection.title}</strong>
                </div>
                {sectionQs.map(q => {
                  const qOpts = dsatOptions`,
  `            const goToPrevSection = () => {
              const prev = dsatSectionHistory[dsatSectionHistory.length - 1]
              if (prev) {
                setDsatSectionHistory(h => h.slice(0, -1))
                setDsatCurrentSectionId(prev)
              }
            }
            const isFirstSection = currentSection.position === Math.min(...dsatSections.map(s => s.position))
            const showVendorBanner = selectedScorecard.is_spot_check && !editingEvalId && isFirstSection && vendorLookupState === 'found'
            return (
              <div>
                {showVendorBanner && (
                  <div style={{
                    marginBottom: 20, padding: '14px 16px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Vendor's Evaluation
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                      {vendorChain.map((step, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>→</span>}
                          <span style={{
                            fontSize: 12, fontWeight: 500, padding: '3px 9px', borderRadius: 6,
                            background: 'var(--accent-light)', color: 'var(--accent)'
                          }}>
                            {step.answerValue}
                          </span>
                        </React.Fragment>
                      ))}
                      {vendorChain.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          No answers recorded on the Vendor's evaluation.
                        </span>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={fullyAligned}
                        onChange={e => {
                          setFullyAligned(e.target.checked)
                          if (e.target.checked) submitFullyAligned()
                        }} />
                      I fully align with the BPO's evaluation
                    </label>
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Section: <strong style={{ color: 'var(--text-primary)' }}>{currentSection.title}</strong>
                </div>
                {sectionQs.map(q => {
                  const qOpts = dsatOptions`
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
