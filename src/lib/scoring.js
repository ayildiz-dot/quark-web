// Quality scorecard scoring — the single source of truth.
//
// This exists because the rule was previously implemented twice: once in
// EvaluationForm.jsx (calculateScore + the live QC readout) and once in
// Calibration.jsx (calcScore). The two drifted apart in four separate ways, so the same
// answers on the same scorecard produced different percentages depending on which page
// you were on:
//
//   1. N/A            — evaluations earned its weight; calibration removed it entirely
//   2. Group-critical — evaluations applied it; calibration had no concept of it at all
//   3. Unweighted     — evaluations skipped those questions; calibration counted them as 1 pt
//   4. Empty scorecard— evaluations returned 100%; calibration returned 0%
//
// Both pages now call this. Change the rule here and it changes everywhere, which is the
// whole point — a scorecard is a measurement instrument, and two instruments disagreeing
// about the same answers is worse than either rule on its own.

/**
 * True when an answer earns its attribute's weight.
 *
 * N/A scores exactly as a Pass — only the label the evaluator sees differs. This is a
 * deliberate product decision: an attribute that could not apply to the interaction
 * should not drag the agent's score down.
 */
export function answerEarnsWeight(answer) {
  return answer === 'pass' || answer === 'na'
}

/**
 * Scores a Quality scorecard.
 *
 * @param {Array}    questions  scorecard_questions rows. Uses id, weight, is_weighted,
 *                              is_form_critical, is_group_critical, group_id.
 * @param {Function} getAnswer  (question) => 'pass' | 'fail' | 'na' | null | undefined.
 *                              An accessor rather than a map, because the two callers
 *                              store answers in different shapes.
 * @param {Object}   [options]
 * @param {boolean}  [options.answeredOnly=false]
 *        false — every weighted question counts towards the denominator, so an
 *                unanswered question behaves like a Fail. Correct at submit time.
 *        true  — only answered questions count, so the figure reads as the score "so
 *                far" and converges on the final score as the evaluator works. Used for
 *                the live readout.
 *
 * @returns {{score: number, failedCritical: boolean, answeredAny: boolean}}
 */
export function calculateQualityScore(questions, getAnswer, options = {}) {
  const { answeredOnly = false } = options
  const qs = questions || []

  // A form-critical failure zeros the whole evaluation, whatever the arithmetic says.
  for (const q of qs) {
    if (q.is_form_critical && getAnswer(q) === 'fail') {
      return { score: 0, failedCritical: true, answeredAny: true }
    }
  }

  // A group containing a failed group-critical question loses ALL of its earned weight.
  // The weight still counts towards the denominator — the group is failed, not excluded.
  const failedGroupIds = new Set()
  for (const q of qs) {
    if (q.group_id && q.is_group_critical && getAnswer(q) === 'fail') {
      failedGroupIds.add(q.group_id)
    }
  }

  let totalWeight = 0
  let earnedWeight = 0
  let answeredAny = false

  for (const q of qs) {
    const answer = getAnswer(q)
    if (answer != null) answeredAny = true

    // Unweighted questions are informational and never affect the score.
    if (q.is_weighted === false) continue
    if (answeredOnly && answer == null) continue

    const weight = q.weight || 1
    totalWeight += weight

    const inFailedGroup = q.group_id && failedGroupIds.has(q.group_id)
    if (answerEarnsWeight(answer) && !inFailedGroup) earnedWeight += weight
  }

  // Nothing weighted to score against — treat as a clean pass rather than a zero, so a
  // scorecard of purely informational questions does not read as a total failure.
  if (totalWeight === 0) return { score: 100, failedCritical: false, answeredAny }

  return {
    score: Math.round((earnedWeight / totalWeight) * 100),
    failedCritical: false,
    answeredAny,
  }
}