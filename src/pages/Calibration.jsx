import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

// ── Shared ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  const isDsat = type === 'dsat'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      backgroundColor: isDsat ? '#dc262622' : '#2563eb22',
      color: isDsat ? '#dc2626' : '#2563eb',
    }}>{(type || '').toUpperCase()}</span>
  )
}

function ResultBadge({ calibrated }) {
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      backgroundColor: calibrated ? '#16a34a22' : '#dc262622',
      color: calibrated ? '#16a34a' : '#dc2626',
      border: `1px solid ${calibrated ? '#16a34a44' : '#dc262644'}`,
    }}>{calibrated ? 'Calibrated' : 'Not Calibrated'}</span>
  )
}

// ── CalibrationHome ──────────────────────────────────────────────────────────

function CalibrationHome({ onScore }) {
  const { profile } = useAuth()
  const uid = profile?.id
  const [certs, setCerts]           = useState([])
  const [activeSessions, setActive] = useState([])
  const [pastResults, setPast]      = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => { if (uid) load() }, [uid])

  async function load() {
    setLoading(true)

    // Append-only history, one row per (evaluator, scorecard, session). Status per
    // scorecard is derived below from the ordered history — never a single mutable
    // row, so different scorecards of the same type (e.g. per-division Quality
    // scorecards) never overwrite or mix into each other. Only RELEASED sessions count
    // toward the displayed status — otherwise a freshly-scored result would show up here
    // before the evaluator is meant to see it, ahead of "Release Results" in Manage Sessions.
    const { data: certHistory } = await supabase
      .from('calibration_certification_history')
      .select('scorecard_id, session_id, is_calibrated, delta, recorded_at')
      .eq('evaluator_id', uid)
      .order('recorded_at', { ascending: false })

    const historySessionIds = [...new Set((certHistory || []).map(h => h.session_id))]
    let releasedSessionIds = new Set()
    if (historySessionIds.length > 0) {
      const { data: histSessions } = await supabase
        .from('calibration_sessions')
        .select('id, results_released')
        .in('id', historySessionIds)
      releasedSessionIds = new Set((histSessions || []).filter(s => s.results_released).map(s => s.id))
    }
    const releasedHistory = (certHistory || []).filter(h => releasedSessionIds.has(h.session_id))

    const scorecardIds = [...new Set(releasedHistory.map(h => h.scorecard_id))]
    let scorecardMap = {}
    if (scorecardIds.length > 0) {
      const { data: scs } = await supabase.from('scorecards').select('id, name, type').in('id', scorecardIds)
      scorecardMap = Object.fromEntries((scs || []).map(s => [s.id, s]))
    }

    const derivedCerts = scorecardIds.map(scId => {
      const rows = releasedHistory.filter(h => h.scorecard_id === scId) // already sorted newest first
      const latest = rows[0]
      let consecutiveFailures = 0
      for (const r of rows) {
        if (r.is_calibrated) break
        consecutiveFailures++
      }
      const lastPass = rows.find(r => r.is_calibrated)
      return {
        scorecard: scorecardMap[scId],
        isActive: !!latest?.is_calibrated,
        consecutiveFailures,
        lastCalibratedAt: lastPass?.recorded_at || null,
      }
    })
    setCerts(derivedCerts)

    const { data: parts } = await supabase
      .from('calibration_participants')
      .select('session_id')
      .eq('evaluator_id', uid)

    const sessionIds = (parts || []).map(p => p.session_id)
    let evalSessions = []

    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from('calibration_sessions')
        .select('id, title, type, session_date, status, gauge_user_id, scorecard_id, scoring_deadline, results_released')
        .in('id', sessionIds)
        .in('status', ['open', 'scoring'])
        .order('session_date', { ascending: false })

      const { data: mySubs } = await supabase
        .from('calibration_submissions')
        .select('session_id, id, status, is_calibrated, delta')
        .eq('evaluator_id', uid)
        .in('session_id', sessionIds)

      const subMap = Object.fromEntries((mySubs || []).map(s => [s.session_id, s]))
      evalSessions = (sessions || []).map(s => ({
        ...s,
        submission: subMap[s.id] || null,
        isGaugeRole: s.gauge_user_id === uid,
      }))
    }

    const { data: gaugeSessions } = await supabase
      .from('calibration_sessions')
      .select('id, title, type, session_date, status, gauge_user_id, scorecard_id')
      .eq('gauge_user_id', uid)
      .in('status', ['open', 'scoring'])
      .order('session_date', { ascending: false })

    if ((gaugeSessions || []).length > 0) {
      const gaugeIds = gaugeSessions.map(s => s.id)
      const { data: gaugeSubs } = await supabase
        .from('calibration_submissions')
        .select('session_id, id, status')
        .eq('evaluator_id', uid)
        .in('session_id', gaugeIds)
      const gsMap = Object.fromEntries((gaugeSubs || []).map(s => [s.session_id, s]))
      const existingIds = new Set(evalSessions.map(s => s.id))
      const newGauge = (gaugeSessions || [])
        .filter(s => !existingIds.has(s.id))
        .map(s => ({ ...s, submission: gsMap[s.id] || null, isGaugeRole: true }))
      evalSessions = [...evalSessions, ...newGauge]
    }

    setActive(evalSessions)

    const { data: results } = await supabase
      .from('calibration_submissions')
      .select('id, status, is_calibrated, delta, submitted_at, session_id')
      .eq('evaluator_id', uid)
      .eq('status', 'evaluated')
      .order('submitted_at', { ascending: false })
      .limit(20)

    if ((results || []).length > 0) {
      const rsIds = results.map(r => r.session_id)
      const { data: rsSessions } = await supabase
        .from('calibration_sessions')
        .select('id, title, type, session_date, results_released')
        .in('id', rsIds)
      const rsMap = Object.fromEntries((rsSessions || []).map(s => [s.id, s]))
      setPast(results.map(r => ({ ...r, session: rsMap[r.session_id] })))
    }

    setLoading(false)
  }

  function CertCard({ cert }) {
    const label = cert.scorecard?.name || 'Unknown scorecard'
    return (
      <div className="card" style={{ flex: 1, minWidth: 220, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
          backgroundColor: cert.isActive ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.14)',
          color: cert.isActive ? '#16a34a' : '#dc2626',
          border: `1px solid ${cert.isActive ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)'}`,
          marginBottom: 10,
        }}>
          {cert.isActive ? '✓ Certified' : '✗ Not Certified'}
        </div>
        {cert.lastCalibratedAt && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Last calibrated: {new Date(cert.lastCalibratedAt).toLocaleDateString()}
          </div>
        )}
        {!cert.isActive && cert.consecutiveFailures >= 3 && (
          <div style={{
            fontSize: 11, color: '#dc2626', marginTop: 10, padding: '6px 10px',
            background: 'rgba(220,38,38,0.1)', borderRadius: 6, fontWeight: 500,
          }}>
            Recertification required · {cert.consecutiveFailures} consecutive failures
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>
  )

  const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tdStyle = { padding: '10px 16px' }

  return (
    <div>
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Certification Status
        </h2>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {certs.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14, width: '100%' }}>
              No calibration data yet
            </div>
          ) : (
            certs.map(cert => <CertCard key={cert.scorecard?.id || Math.random()} cert={cert} />)
          )}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Active Sessions
        </h2>
        {activeSessions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>
            No active sessions assigned to you
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Title</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: 'right' }} />
                </tr>
              </thead>
              <tbody>
                {activeSessions.map(session => {
                  const sub = session.submission
                  const scored = sub?.status === 'submitted' || sub?.status === 'evaluated'
                  const canScore = session.status === 'scoring' && !scored
                  return (
                    <tr key={session.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{session.title}</td>
                      <td style={tdStyle}><TypeBadge type={session.type} /></td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {session.session_date ? new Date(session.session_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, fontWeight: session.isGaugeRole ? 600 : 400, color: session.isGaugeRole ? '#7c3aed' : 'var(--text-secondary)' }}>
                          {session.isGaugeRole ? 'Gauge' : 'Evaluator'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {scored
                          ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>✓ Submitted</span>
                          : session.status === 'open'
                            ? <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Waiting to open</span>
                            : <span style={{ fontSize: 12, color: '#d97706', fontWeight: 500 }}>● Pending</span>
                        }
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {canScore && (
                          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }}
                            onClick={() => onScore(session)}>
                            Score
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pastResults.length > 0 && (
        <section>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Past Results
          </h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={thStyle}>Session</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Delta</th>
                  <th style={thStyle}>Result</th>
                </tr>
              </thead>
              <tbody>
                {pastResults.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{r.session?.title || '—'}</td>
                    <td style={tdStyle}>{r.session?.type ? <TypeBadge type={r.session.type} /> : '—'}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {r.session?.session_date ? new Date(r.session.session_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {r.delta != null ? `${(r.results_released ?? r.session?.results_released) ? `${(r.delta * 100).toFixed(1)}%` : '—'}` : '—'}
                    </td>
                    <td style={tdStyle}>{(r.results_released ?? r.session?.results_released) ? <ResultBadge calibrated={r.is_calibrated} /> : <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Pending release</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

// ── CalibrationSubmit (Steps 5 + 6) ──────────────────────────────────────────

function CalibrationSubmit({ session, onBack, onSubmitted }) {
  const { profile } = useAuth()
  const uid = profile?.id
  const isGauge = session?.gauge_user_id === uid

  const [questions, setQuestions]     = useState([])
  const [answers, setAnswers]         = useState({})
  const [overallComment, setComment]  = useState('')
  const [loading, setLoading]         = useState(true)
  const [submitting, setSubmitting]   = useState(false)
  const [existingSub, setExistingSub] = useState(null)
  const [error, setError]             = useState('')
  const [showLgtmConfirm, setShowLgtmConfirm] = useState(false)
  const commentRef = useRef(null)

  useEffect(() => { if (uid && session?.id) load() }, [uid, session?.id])

  async function load() {
    setLoading(true)
    const { data: qs } = await supabase
      .from('scorecard_questions')
      .select('id, title, weight, is_weighted, is_form_critical, position')
      .eq('scorecard_id', session.scorecard_id)
      .order('position')
    setQuestions(qs || [])

    const { data: sub } = await supabase
      .from('calibration_submissions')
      .select('id, status, overall_score, comment')
      .eq('session_id', session.id)
      .eq('evaluator_id', uid)
      .maybeSingle()

    if (sub) {
      setExistingSub(sub)
      setComment(sub.comment || '')
      const { data: prevAnswers } = await supabase
        .from('calibration_answers')
        .select('question_id, answer_value')
        .eq('submission_id', sub.id)
      const ansMap = {}
      for (const a of (prevAnswers || [])) ansMap[a.question_id] = a.answer_value
      setAnswers(ansMap)
    }

    setLoading(false)
  }

  function calcScore(qs, ans) {
    let totalW = 0, passedW = 0, failedCritical = false
    for (const q of qs) {
      const val = ans[q.id]
      if (!val || val === 'na') continue
      const w = q.is_weighted ? (q.weight || 1) : 1
      totalW += w
      if (val === 'pass') passedW += w
      if (val === 'fail' && q.is_form_critical) failedCritical = true
    }
    const pct = totalW > 0 ? Math.round((passedW / totalW) * 100) : 0
    return { score: failedCritical ? 0 : pct, failedCritical }
  }

  // ── Delta + certification logic (Step 6) ──────────────────────────────────

  async function runDeltaForOne(evalSubId, evalScore, evalId, gaugeSubId, gaugeScore) {
    const [{ data: evalAns }, { data: gaugeAns }] = await Promise.all([
      supabase.from('calibration_answers').select('question_id, answer_value, is_critical').eq('submission_id', evalSubId),
      supabase.from('calibration_answers').select('question_id, answer_value').eq('submission_id', gaugeSubId),
    ])

    const gaugeMap = Object.fromEntries((gaugeAns || []).map(a => [a.question_id, a.answer_value]))

    let criticalFail = false
    for (const ea of (evalAns || [])) {
      if (!ea.is_critical) continue
      const ga = gaugeMap[ea.question_id]
      if (ga && ea.answer_value !== 'na' && ga !== 'na' && ea.answer_value !== ga) {
        criticalFail = true
        break
      }
    }

    const delta = Math.abs((evalScore || 0) - (gaugeScore || 0)) / 100
    const isCalibrated = !criticalFail && delta <= 0.10

    await supabase.from('calibration_submissions')
      .update({ delta, is_calibrated: isCalibrated, status: 'evaluated' })
      .eq('id', evalSubId)

    // Append-only: every result is recorded and tagged to this specific scorecard_id,
    // never overwritten. Current certification status is derived from this history
    // in CalibrationHome, not stored/cached here — see calibration_certification_history.
    await supabase.from('calibration_certification_history').insert({
      evaluator_id: evalId,
      scorecard_id: session.scorecard_id,
      session_id: session.id,
      is_calibrated: isCalibrated,
      delta,
    })
  }

  async function runDeltaForAll(gaugeSubId, gaugeScore) {
    const { data: evalSubs } = await supabase.from('calibration_submissions')
      .select('id, evaluator_id, overall_score')
      .eq('session_id', session.id)
      .eq('is_gauge', false)
      .eq('status', 'submitted')

    for (const es of (evalSubs || [])) {
      await runDeltaForOne(es.id, es.overall_score, es.evaluator_id, gaugeSubId, gaugeScore)
    }

    await checkSessionCompletion()
  }

  // Marks the session 'completed' once the Gauge has submitted AND every participant's
  // submission has reached 'evaluated'. Called from both the Gauge's own submit path
  // (runDeltaForAll, above) and the regular-evaluator submit path below — previously this
  // only ran inside runDeltaForAll, so a session where the Gauge submitted before all
  // participants finished would silently stay stuck on "Scoring" forever.
  async function checkSessionCompletion() {
    const { data: gaugeSub } = await supabase.from('calibration_submissions')
      .select('id').eq('session_id', session.id).eq('is_gauge', true).eq('status', 'submitted').maybeSingle()
    if (!gaugeSub) return

    const { data: allParts } = await supabase.from('calibration_participants')
      .select('evaluator_id').eq('session_id', session.id)
    const { data: evalDone } = await supabase.from('calibration_submissions')
      .select('id').eq('session_id', session.id).eq('is_gauge', false).eq('status', 'evaluated')

    if ((evalDone?.length || 0) >= (allParts?.length || 1) && (allParts?.length || 0) > 0) {
      await supabase.from('calibration_sessions').update({ status: 'completed' }).eq('id', session.id)
    }
  }

  // "Looks Good to Me" — bulk-marks every attribute as Pass, then jumps
  // straight to the Overall Comment field. Hidden for DSAT-type sessions.
  function applyLgtm() {
    setAnswers(prev => {
      const next = { ...prev }
      for (const q of questions) next[q.id] = 'pass'
      return next
    })
    setShowLgtmConfirm(false)
    setTimeout(() => {
      commentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      commentRef.current?.focus()
    }, 50)
  }

  // ── Submit handler ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    const unanswered = questions.filter(q => !answers[q.id])
    if (unanswered.length > 0) {
      setError(`${unanswered.length} question${unanswered.length > 1 ? 's' : ''} still need an answer.`)
      return
    }
    if (!overallComment.trim()) {
      setError('Please add an overall comment before submitting.')
      return
    }
    setError('')
    setSubmitting(true)

    try {
      const { score } = calcScore(questions, answers)
      let subId = existingSub?.id

      if (!subId) {
        const { data: newSub, error: subErr } = await supabase.from('calibration_submissions')
          .insert({
            session_id: session.id,
            evaluator_id: uid,
            is_gauge: isGauge,
            status: 'submitted',
            overall_score: score,
            comment: overallComment || null,
            submitted_at: new Date().toISOString(),
          })
          .select('id').single()
        if (subErr) { setError('Error: ' + subErr.message); return }
        subId = newSub.id
      } else {
        await supabase.from('calibration_submissions').update({
          status: 'submitted',
          overall_score: score,
          comment: overallComment || null,
          submitted_at: new Date().toISOString(),
        }).eq('id', subId)
        await supabase.from('calibration_answers').delete().eq('submission_id', subId)
      }

      const ansRows = questions.map(q => {
        const val = answers[q.id] || 'na'
        const w = q.is_weighted ? (q.weight || 1) : 1
        return {
          submission_id: subId,
          question_id: String(q.id),
          question_label: q.title,
          answer_value: val,
          score: val === 'na' ? null : val === 'pass' ? w : 0,
          weight: w,
          is_critical: q.is_form_critical || false,
        }
      })
      await supabase.from('calibration_answers').insert(ansRows)

      if (isGauge) {
        await runDeltaForAll(subId, score)
      } else {
        const { data: gaugeSub } = await supabase.from('calibration_submissions')
          .select('id, overall_score')
          .eq('session_id', session.id)
          .eq('is_gauge', true)
          .eq('status', 'submitted')
          .maybeSingle()
        if (gaugeSub) {
          await runDeltaForOne(subId, score, uid, gaugeSub.id, gaugeSub.overall_score)
          await checkSessionCompletion()
        }
      }

      onSubmitted?.()
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
      Loading questions…
    </div>
  )

  const answeredCount = questions.filter(q => !!answers[q.id]).length
  const allAnswered = answeredCount === questions.length && questions.length > 0
  const { score: previewScore } = calcScore(questions, answers)

  return (
    <div>
      <button onClick={onBack}
        style={{ marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13 }}>
        ← Back to sessions
      </button>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, marginBottom: 6 }}>{session.title}</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <TypeBadge type={session.type} />
              {isGauge && (
                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>You are the Gauge</span>
              )}
              {session.session_date && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {new Date(session.session_date).toLocaleDateString()}
                </span>
              )}
            </div>
            {session.type !== 'dsat' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowLgtmConfirm(true)}
                  style={{ fontWeight: 600 }}>
                  LGTM
                </button>
                <span
                  title='Clicking this button will mark all the attributes as "Pass" and will take you directly to the comments section.'
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'help'
                  }}>
                  ?
                </span>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 2 }}>
              {answeredCount} / {questions.length} answered
            </div>
            {answeredCount > 0 && (
              <div style={{ fontSize: 22, fontWeight: 700, color: previewScore >= 90 ? '#16a34a' : previewScore >= 60 ? '#d97706' : '#dc2626' }}>
                {previewScore}%
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {questions.map((q, idx) => {
          const sel = answers[q.id]
          return (
            <div key={q.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{idx + 1}.</span>
                    {q.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {q.is_form_critical && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, backgroundColor: '#dc262622', color: '#dc2626', border: '1px solid #dc262644' }}>
                        Critical
                      </span>
                    )}
                    
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {q.is_weighted && <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, marginRight: 8, whiteSpace: 'nowrap' }}>{q.weight} pts</span>}
            {['pass', 'fail', 'na'].map(opt => (
                    <button key={opt}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1.5px solid',
                        borderColor: sel === opt ? (opt === 'pass' ? '#16a34a' : opt === 'fail' ? '#dc2626' : '#6b7280') : 'var(--border)',
                        backgroundColor: sel === opt ? (opt === 'pass' ? '#16a34a22' : opt === 'fail' ? '#dc262622' : 'var(--bg-secondary)') : 'transparent',
                        color: sel === opt ? (opt === 'pass' ? '#16a34a' : opt === 'fail' ? '#dc2626' : '#6b7280') : 'var(--text-secondary)',
                      }}>
                      {opt === 'na' ? 'N/A' : opt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          Overall Comment <span style={{ color: '#dc2626' }}>*</span>
        </div>
        <textarea
          ref={commentRef}
          placeholder="Add an overall comment for this calibration…"
          value={overallComment}
          onChange={e => setComment(e.target.value)}
          style={{
            width: '100%', fontSize: 13, padding: '10px 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--bg-secondary)',
            color: 'var(--text-primary)', resize: 'vertical', minHeight: 72, boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-ghost" onClick={onBack}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting || !allAnswered}>
          {submitting ? 'Submitting…' : isGauge ? 'Submit as Gauge' : 'Submit Scoring'}
        </button>
      </div>

      {showLgtmConfirm && (
        <div className="modal-backdrop" onClick={() => setShowLgtmConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '32px 28px' }}>
              <h2 style={{ marginBottom: 12, fontSize: 17 }}>Mark all as Pass?</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                This will mark every attribute on this scorecard as "Pass" and take you to the comments section. Any existing answers will be overwritten.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-ghost" onClick={() => setShowLgtmConfirm(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={applyLgtm}>Yes, mark all Pass</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CalibrationAdmin (Step 8) ────────────────────────────────────────────────

function CalibrationAdmin() {
  const { profile } = useAuth()
  const [sessions, setSessions]     = useState([])
  const [scorecards, setScorecards] = useState([])
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected]     = useState(null)
  const [detail, setDetail]         = useState(null)
  const [creating, setCreating]     = useState(false)
  const [allResults, setAllResults]  = useState([])
  const [loadingResults, setLR]     = useState(false)
  const [bpoOptions, setBpoOptions]       = useState([])
  const [hubOptions, setHubOptions]       = useState([])
  const [marketOptions, setMarketOptions] = useState([])
  const [metadataLoadError, setMetadataLoadError] = useState(null)

  useEffect(() => { if (profile) loadResults() }, [profile])

  async function loadResults() {
    setLR(true)
    // Admins/owners see every evaluator's results. Everyone else (any @kaizengaming.com
    // user, now that Manage Sessions is open to all of them) only sees results for
    // sessions where THEY are the Gauge — never other people's calibrations.
    const isPrivileged = ['admin', 'owner'].includes(profile?.role)
    let gaugeSessionIds = null
    if (!isPrivileged) {
      const { data: myGaugeSessions } = await supabase
        .from('calibration_sessions')
        .select('id')
        .eq('gauge_user_id', profile?.id)
      gaugeSessionIds = (myGaugeSessions || []).map(s => s.id)
      if (gaugeSessionIds.length === 0) { setAllResults([]); setLR(false); return }
    }

    let resultsQuery = supabase
      .from('calibration_submissions')
      .select('evaluator_id, session_id, status, overall_score, is_calibrated, delta, submitted_at')
      .eq('status', 'evaluated')
      .eq('is_gauge', false)
    if (gaugeSessionIds) resultsQuery = resultsQuery.in('session_id', gaugeSessionIds)
    const { data: subs } = await resultsQuery
      .order('submitted_at', { ascending: false })
      .limit(200)

    if ((subs || []).length > 0) {
      const evalIds = [...new Set(subs.map(s => s.evaluator_id))]
      const sessIds = [...new Set(subs.map(s => s.session_id))]
      const [{ data: evalUsers }, { data: sessList }] = await Promise.all([
        supabase.from('users').select('id, name, email').in('id', evalIds),
        supabase.from('calibration_sessions').select('id, title, type, session_date').in('id', sessIds),
      ])
      const userMap = Object.fromEntries((evalUsers || []).map(u => [u.id, u]))
      const sessMap = Object.fromEntries((sessList || []).map(s => [s.id, s]))
      setAllResults(subs.map(s => ({ ...s, user: userMap[s.evaluator_id], session: sessMap[s.session_id] })))
    }
    setLR(false)
  }
  const [form, setForm] = useState({
    title: '', type: 'quality', scoring_deadline: '', scorecard_id: '', gauge_user_id: '',
    case_reference: '', session_date: new Date().toISOString().split('T')[0],
    bpo: '', hub: '', market: '',
    participants: [],
  })

  useEffect(() => { if (profile) loadAll() }, [profile])

  async function loadAll() {
    setLoading(true)
    // Same rule as loadResults: admins/owners see every session; everyone else only
    // sees sessions where they are the Gauge.
    const isPrivileged = ['admin', 'owner'].includes(profile?.role)
    let sessionsQuery = supabase.from('calibration_sessions').select('*').order('created_at', { ascending: false })
    if (!isPrivileged) sessionsQuery = sessionsQuery.eq('gauge_user_id', profile?.id)
    const [{ data: sess }, { data: scs }, { data: us }] = await Promise.all([
      sessionsQuery,
      supabase.from('scorecards').select('id, name, type').eq('is_calibration', true).eq('is_published', true).order('name'),
      supabase.from('users').select('id, name, email').ilike('email', '%@kaizengaming.com').order('email'),
    ])
    setSessions(sess || [])
    setScorecards(scs || [])
    setUsers(us || [])
    setLoading(false)
  }

  useEffect(() => { if (profile) loadMetadataOptions() }, [profile])

  async function loadMetadataOptions() {
    const { data, error } = await supabase.from('calibration_metadata_options').select('category, name').order('name')
    if (error) {
      console.error('Failed to load BPO/HUB/Market options:', error)
      setMetadataLoadError(error.message)
      return
    }
    setMetadataLoadError(null)
    const byCategory = cat => (data || []).filter(o => o.category === cat).map(o => o.name)
    setBpoOptions(byCategory('bpo'))
    setHubOptions(byCategory('hub'))
    setMarketOptions(byCategory('market'))
  }

  async function addMetadataOption(category) {
    const label = category.toUpperCase()
    const name = window.prompt(`Enter a new ${label}:`)
    if (!name || !name.trim()) return
    const trimmed = name.trim()
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('calibration_metadata_options').insert({ category, name: trimmed, created_by: user?.id })
    if (error) { alert(`Error adding ${label}: ` + error.message); return }
    await loadMetadataOptions()
    setForm(f => ({ ...f, [category]: trimmed }))
  }

  async function openDetail(session) {
    setSelected(session)
    setDetail(null)
    const [{ data: parts }, { data: subs }] = await Promise.all([
      supabase.from('calibration_participants').select('evaluator_id').eq('session_id', session.id),
      supabase.from('calibration_submissions')
        .select('evaluator_id, status, overall_score, is_calibrated, delta, is_gauge')
        .eq('session_id', session.id),
    ])
    const subMap = Object.fromEntries((subs || []).map(s => [s.evaluator_id, s]))
    const partIds = (parts || []).map(p => p.evaluator_id)
    const partUsers = (users || []).filter(u => partIds.includes(u.id))
    const gaugeUser = (users || []).find(u => u.id === session.gauge_user_id)

    // Session-wide delta/calibration-rate summary, computed from every participant
    // who has actually been scored ('evaluated') — pending submissions don't count yet.
    const evaluatedSubs = (subs || []).filter(s => !s.is_gauge && s.status === 'evaluated')
    const avgDelta = evaluatedSubs.length > 0
      ? evaluatedSubs.reduce((sum, s) => sum + (s.delta || 0), 0) / evaluatedSubs.length
      : null
    const calibratedCount = evaluatedSubs.filter(s => s.is_calibrated).length

    setDetail({
      participants: partUsers.map(u => ({ ...u, sub: subMap[u.id] || null })),
      gaugeUser,
      gaugeSub: subMap[session.gauge_user_id] || null,
      avgDelta,
      calibratedCount,
      evaluatedCount: evaluatedSubs.length,
    })
  }

  async function updateStatus(newStatus) {
    await supabase.from('calibration_sessions').update({ status: newStatus }).eq('id', selected.id)
    setSessions(prev => prev.map(s => s.id === selected.id ? { ...s, status: newStatus } : s))
    setSelected(s => ({ ...s, status: newStatus }))
  }

  async function handleCreate() {
    if (!form.title || !form.scorecard_id || !form.gauge_user_id) {
      alert('Title, scorecard, and gauge are required.')
      return
    }
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: sess, error } = await supabase.from('calibration_sessions').insert({
      title: form.title,
      type: form.type,
      scorecard_id: form.scorecard_id,
      gauge_user_id: form.gauge_user_id,
      case_reference: form.case_reference || null,
      session_date: form.session_date || null,
      scoring_deadline: form.scoring_deadline || null,
      bpo: form.bpo || null,
      hub: form.hub || null,
      market: form.market || null,
      status: 'open',
      created_by: user?.id,
    }).select('id').single()

    if (error) { alert('Error: ' + error.message); setCreating(false); return }

    if (form.participants.length > 0) {
      await supabase.from('calibration_participants').insert(
        form.participants.map(uid => ({ session_id: sess.id, evaluator_id: uid }))
      )
    }

    await loadAll()
    setShowCreate(false)
    setForm({ title: '', type: 'quality', scorecard_id: '', gauge_user_id: '', case_reference: '', session_date: new Date().toISOString().split('T')[0], bpo: '', hub: '', market: '', participants: [] })
    setCreating(false)
  }

  function toggleParticipant(uid) {
    setForm(f => ({
      ...f,
      participants: f.participants.includes(uid)
        ? f.participants.filter(id => id !== uid)
        : [...f.participants, uid],
    }))
  }

  const statusColor = { open: '#d97706', scoring: '#2563eb', completed: '#16a34a' }
  const statusLabel = { open: 'Open', scoring: 'Scoring', completed: 'Completed' }
  const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tdStyle = { padding: '10px 16px' }
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Loading…</div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Calibration Sessions</h2>
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowCreate(true)}>
          + New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>
          No sessions yet. Create one to get started.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Gauge</th>
                <th style={thStyle}>Status</th>
                <th style={{ ...thStyle, textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => {
                const gaugeUser = users.find(u => u.id === s.gauge_user_id)
                return (
                  <tr key={s.id} style={{
                    borderBottom: '1px solid var(--border)',
                    background: selected?.id === s.id ? 'rgba(37,99,235,0.08)' : 'transparent',
                    borderLeft: selected?.id === s.id ? '3px solid #2563eb' : '3px solid transparent',
                  }}>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{s.title}</td>
                    <td style={tdStyle}><TypeBadge type={s.type} /></td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                      {s.session_date ? new Date(s.session_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {gaugeUser?.name || gaugeUser?.email || '—'}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                        backgroundColor: (statusColor[s.status] || '#6b7280') + '22',
                        color: statusColor[s.status] || '#6b7280',
                        border: '1px solid ' + (statusColor[s.status] || '#6b7280') + '44',
                      }}>
                        {statusLabel[s.status] || s.status}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(s)}>Manage</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Session detail panel */}
      {selected && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, marginBottom: 6, fontSize: 15 }}>{selected.title}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <TypeBadge type={selected.type} />
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                  backgroundColor: (statusColor[selected.status] || '#6b7280') + '22',
                  color: statusColor[selected.status] || '#6b7280',
                }}>
                  {statusLabel[selected.status] || selected.status}
                </span>
                {selected.case_reference && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ref: {selected.case_reference}</span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {selected.status === 'open' && (
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => updateStatus('scoring')}>
                  Open for Scoring
                </button>
              )}
              {selected.status === 'scoring' && (
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => updateStatus('completed')}>
                  Mark Completed
                </button>
              )}
              <button className="btn btn-secondary btn-sm" style={{ marginRight: 8 }}
              onClick={async () => {
                await supabase.from('calibration_sessions').update({ results_released: true }).eq('id', selected.id)
                setSelected(s => ({ ...s, results_released: true }))
              }}>
              {selected.results_released ? '✓ Released' : 'Release Results'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null) }}>✕</button>
            </div>
          </div>

          {!detail ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {detail.evaluatedCount > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <div className="card" style={{ flex: 1, textAlign: 'center', padding: '14px 16px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: detail.avgDelta <= 0.10 ? '#16a34a' : '#dc2626' }}>
                      {(detail.avgDelta * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                      Overall Delta
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1, textAlign: 'center', padding: '14px 16px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>
                      {detail.calibratedCount}/{detail.evaluatedCount}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                      Calibrated
                    </div>
                  </div>
                  <div className="card" style={{ flex: 1, textAlign: 'center', padding: '14px 16px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: detail.calibratedCount === detail.evaluatedCount ? '#16a34a' : '#dc2626' }}>
                      {Math.round((detail.calibratedCount / detail.evaluatedCount) * 100)}%
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>
                      Calibration Rate
                    </div>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Gauge
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{detail.gaugeUser?.name || detail.gaugeUser?.email || 'Unknown'}</span>
                    {detail.gaugeUser?.name && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{detail.gaugeUser.email}</span>}
                  </div>
                  {detail.gaugeSub
                    ? <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>✓ Submitted ({detail.gaugeSub.overall_score}%)</span>
                    : <span style={{ fontSize: 12, color: '#d97706' }}>Pending</span>
                  }
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Participants ({detail.participants.length})
                </div>
                {detail.participants.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No participants assigned to this session.</div>
                ) : (
                  detail.participants.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <span style={{ fontWeight: 500, fontSize: 13 }}>{p.name || p.email}</span>
                        {p.name && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{p.email}</span>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {!p.sub && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pending</span>}
                        {p.sub?.status === 'submitted' && (
                          <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 500 }}>Submitted ({p.sub.overall_score}%)</span>
                        )}
                        {p.sub?.status === 'evaluated' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ResultBadge calibrated={p.sub.is_calibrated} />
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              Δ {p.sub.delta != null ? (p.sub.delta * 100).toFixed(1) + '%' : '—'}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* All Results */}
      {(loadingResults || allResults.length > 0) && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            All Calibration Results
          </h2>
          {loadingResults ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>Loading results…</div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Evaluator</th>
                    <th style={thStyle}>Session</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Score</th>
                    <th style={thStyle}>Delta</th>
                    <th style={thStyle}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {allResults.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{r.user?.name || r.user?.email || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{r.session?.title || '—'}</td>
                      <td style={tdStyle}>{r.session?.type ? <TypeBadge type={r.session.type} /> : '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {r.session?.session_date ? new Date(r.session.session_date).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {r.overall_score != null ? r.overall_score + '%' : '—'}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        {r.delta != null ? (r.delta * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td style={tdStyle}><ResultBadge calibrated={r.is_calibrated} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create session modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2>New Calibration Session</h2>
              <button className="btn-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Title *</label>
                <input style={inputStyle} value={form.title} placeholder="e.g. Q3 DSAT Calibration" onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Type *</label>
                  <select style={inputStyle} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="quality">Quality</option>
                    <option value="dsat">DSAT</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Session Date</label>
                  <input type="date" style={inputStyle} value={form.session_date} onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))} />
            </div>
            <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Scoring Deadline</label>
            <input type="date" style={inputStyle} value={form.scoring_deadline}
              onChange={e => setForm(f => ({ ...f, scoring_deadline: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Calibration Scorecard *</label>
                <select style={inputStyle} value={form.scorecard_id} onChange={e => setForm(f => ({ ...f, scorecard_id: e.target.value }))}>
                  <option value="">— Select scorecard —</option>
                  {scorecards.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                </select>
                {scorecards.length === 0 && (
                  <div style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                    No calibration scorecards found. Create one in Scorecards and enable the Calibration flag.
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Gauge (Reference Evaluator) *</label>
                <select style={inputStyle} value={form.gauge_user_id} onChange={e => setForm(f => ({ ...f, gauge_user_id: e.target.value }))}>
                  <option value="">— Select gauge —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Case Reference (optional)</label>
                <input style={inputStyle} value={form.case_reference} placeholder="e.g. CASE-12345" onChange={e => setForm(f => ({ ...f, case_reference: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>BPO</label>
                  <select style={inputStyle} value={form.bpo} onChange={e => {
                    if (e.target.value === '__add_new__') { addMetadataOption('bpo'); return }
                    setForm(f => ({ ...f, bpo: e.target.value }))
                  }}>
                    <option value="">— Select a BPO —</option>
                    {bpoOptions.map(name => <option key={name} value={name}>{name}</option>)}
                    <option value="__add_new__">+ Add a new BPO</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>HUB</label>
                  <select style={inputStyle} value={form.hub} onChange={e => {
                    if (e.target.value === '__add_new__') { addMetadataOption('hub'); return }
                    setForm(f => ({ ...f, hub: e.target.value }))
                  }}>
                    <option value="">— Select a HUB —</option>
                    {hubOptions.map(name => <option key={name} value={name}>{name}</option>)}
                    <option value="__add_new__">+ Add a new HUB</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: 'var(--text-secondary)' }}>Market</label>
                  <select style={inputStyle} value={form.market} onChange={e => {
                    if (e.target.value === '__add_new__') { addMetadataOption('market'); return }
                    setForm(f => ({ ...f, market: e.target.value }))
                  }}>
                    <option value="">— Select a Market —</option>
                    {marketOptions.map(name => <option key={name} value={name}>{name}</option>)}
                    <option value="__add_new__">+ Add a new Market</option>
                  </select>
                </div>
              </div>
              {metadataLoadError && (
                <div style={{ fontSize: 11, color: '#dc2626' }}>
                  Couldn't load the saved BPO/HUB/Market lists ({metadataLoadError}). Values you type here will still save on this session — reload the page and try again to get the full dropdown lists back.
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                  Participants
                </label>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.participants.includes(u.id)} onChange={() => toggleParticipant(u.id)} />
                      <span>{u.name || u.email}</span>
                      {u.name && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{u.email}</span>}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{form.participants.length} selected</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── WeeklyDeltaChart (dependency-free inline SVG line chart) ─────────────────

function WeeklyDeltaChart({ data }) {
  const width = 680
  const height = 200
  const marginLeft = 44
  const marginRight = 16
  const marginTop = 16
  const marginBottom = 28
  const innerWidth = width - marginLeft - marginRight
  const innerHeight = height - marginTop - marginBottom

  const maxDelta = Math.max(0.15, ...data.map(d => d.avgDelta)) * 1.15
  const xFor = i => data.length === 1 ? marginLeft + innerWidth / 2 : marginLeft + (i / (data.length - 1)) * innerWidth
  const yFor = delta => marginTop + innerHeight - (delta / maxDelta) * innerHeight

  const points = data.map((d, i) => `${xFor(i)},${yFor(d.avgDelta)}`).join(' ')
  const thresholdY = yFor(0.10)
  const labelStep = Math.max(1, Math.ceil(data.length / 8))
  const gridValues = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30].filter(v => v <= maxDelta)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {gridValues.map(v => (
        <g key={v}>
          <line x1={marginLeft} x2={width - marginRight} y1={yFor(v)} y2={yFor(v)} stroke="var(--border)" strokeWidth="1" />
          <text x={marginLeft - 8} y={yFor(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-secondary)">{Math.round(v * 100)}%</text>
        </g>
      ))}
      <line x1={marginLeft} x2={width - marginRight} y1={thresholdY} y2={thresholdY} stroke="#dc2626" strokeWidth="1" strokeDasharray="4 3" />
      <text x={width - marginRight} y={thresholdY - 4} textAnchor="end" fontSize="10" fill="#dc2626">10% threshold</text>
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={d.week} cx={xFor(i)} cy={yFor(d.avgDelta)} r="4" fill={d.avgDelta <= 0.10 ? '#16a34a' : '#dc2626'}>
          <title>{`Week of ${new Date(d.week).toLocaleDateString()}: ${(d.avgDelta * 100).toFixed(1)}%`}</title>
        </circle>
      ))}
      {data.map((d, i) => (i % labelStep === 0) && (
        <text key={d.week} x={xFor(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
          {new Date(d.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      ))}
    </svg>
  )
}

// ── CalibrationInsights (BI overview) ────────────────────────────────────────

function CalibrationInsights() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [filterBpo, setFilterBpo] = useState('')
  const [filterHub, setFilterHub] = useState('')
  const [filterMarket, setFilterMarket] = useState('')
  const [filterScorecard, setFilterScorecard] = useState('')
  const [filterGauge, setFilterGauge] = useState('')
  const [filterEvaluator, setFilterEvaluator] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [metaOptions, setMetaOptions] = useState({ bpo: [], hub: [], market: [] })

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)

    // BPO/HUB/Market filter choices come from the shared metadata list (the same one
    // used on the New Session form), not just from sessions that already have results —
    // so a newly added BPO/HUB/Market shows up as a filter option right away, even
    // before any session using it has been evaluated.
    const { data: metaRows } = await supabase.from('calibration_metadata_options').select('category, name')
    const metaByCategory = cat => [...new Set((metaRows || []).filter(o => o.category === cat).map(o => o.name))].sort()
    setMetaOptions({ bpo: metaByCategory('bpo'), hub: metaByCategory('hub'), market: metaByCategory('market') })
    // Same visibility rule as Manage Sessions: admins/owners see every session;
    // everyone else only sees sessions where they were the Gauge.
    const isPrivileged = ['admin', 'owner'].includes(profile?.role)
    let sessionIdsFilter = null
    if (!isPrivileged) {
      const { data: myGaugeSessions } = await supabase
        .from('calibration_sessions')
        .select('id')
        .eq('gauge_user_id', profile?.id)
      sessionIdsFilter = (myGaugeSessions || []).map(s => s.id)
      if (sessionIdsFilter.length === 0) { setRows([]); setLoading(false); return }
    }

    let subsQuery = supabase
      .from('calibration_submissions')
      .select('evaluator_id, session_id, is_calibrated, delta, status')
      .eq('status', 'evaluated')
      .eq('is_gauge', false)
    if (sessionIdsFilter) subsQuery = subsQuery.in('session_id', sessionIdsFilter)
    const { data: subs } = await subsQuery

    if (!subs || subs.length === 0) { setRows([]); setLoading(false); return }

    const sessionIds = [...new Set(subs.map(s => s.session_id))]
    const evaluatorIds = [...new Set(subs.map(s => s.evaluator_id))]

    const [{ data: sessionsData }, { data: usersData }] = await Promise.all([
      supabase.from('calibration_sessions').select('id, title, type, session_date, scorecard_id, gauge_user_id, bpo, hub, market').in('id', sessionIds),
      supabase.from('users').select('id, name, email').in('id', evaluatorIds),
    ])
    const scorecardIds = [...new Set((sessionsData || []).map(s => s.scorecard_id).filter(Boolean))]
    const { data: scorecardsData } = scorecardIds.length > 0
      ? await supabase.from('scorecards').select('id, name').in('id', scorecardIds)
      : { data: [] }
    const scorecardMap = Object.fromEntries((scorecardsData || []).map(s => [s.id, s]))
    const sessionMap = Object.fromEntries((sessionsData || []).map(s => [s.id, s]))
    const userMap = Object.fromEntries((usersData || []).map(u => [u.id, u]))

    // Flatten into one row per evaluated submission, carrying each session's BPO/HUB/
    // Market along with it so the tables below can be filtered by any of the three.
    const joined = subs.map(sub => {
      const s = sessionMap[sub.session_id]
      return {
        ...sub,
        sessionTitle: s?.title || 'Unknown session',
        scorecardName: scorecardMap[s?.scorecard_id]?.name || (s?.type || '').toUpperCase(),
        sessionDate: s?.session_date,
        gaugeName: userMap[s?.gauge_user_id]?.name || userMap[s?.gauge_user_id]?.email || '—',
        evaluatorName: userMap[sub.evaluator_id]?.name || userMap[sub.evaluator_id]?.email || 'Unknown',
        bpo: s?.bpo || null,
        hub: s?.hub || null,
        market: s?.market || null,
      }
    })

    setRows(joined)
    setLoading(false)
  }

  if (loading) return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Loading insights…</div>
  )

  if (rows.length === 0) return (
    <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>
      No completed calibration results yet.
    </div>
  )

  const thStyle = { padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const tdStyle = { padding: '10px 16px' }
  const filterSelectStyle = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }

  // BPO/HUB/Market options come from the shared metadata list loaded above, so they
  // show up as filters as soon as they exist — even before any session using them has
  // been evaluated. Scorecard/Gauge/Evaluator options are derived from the data itself,
  // since those only make sense once there's actually something to filter.
  const bpoOptions = metaOptions.bpo
  const hubOptions = metaOptions.hub
  const marketOptions = metaOptions.market
  const scorecardOptions = [...new Set(rows.map(r => r.scorecardName).filter(Boolean))].sort()
  const gaugeOptions = [...new Set(rows.map(r => r.gaugeName).filter(Boolean))].sort()
  const evaluatorOptions = [...new Set(rows.map(r => r.evaluatorName).filter(Boolean))].sort()

  const filteredRows = rows.filter(r =>
    (!filterBpo || r.bpo === filterBpo) &&
    (!filterHub || r.hub === filterHub) &&
    (!filterMarket || r.market === filterMarket) &&
    (!filterScorecard || r.scorecardName === filterScorecard) &&
    (!filterGauge || r.gaugeName === filterGauge) &&
    (!filterEvaluator || r.evaluatorName === filterEvaluator) &&
    (!filterDateFrom || (r.sessionDate && r.sessionDate >= filterDateFrom)) &&
    (!filterDateTo || (r.sessionDate && r.sessionDate <= filterDateTo))
  )

  // Per-session aggregation, computed from the filtered rows.
  const bySession = {}
  for (const r of filteredRows) {
    (bySession[r.session_id] ||= []).push(r)
  }
  const sessionStats = Object.entries(bySession).map(([sessionId, sRows]) => {
    const avgDelta = sRows.reduce((sum, r) => sum + (r.delta || 0), 0) / sRows.length
    const calibratedCount = sRows.filter(r => r.is_calibrated).length
    const first = sRows[0]
    return {
      id: sessionId,
      title: first.sessionTitle,
      scorecardName: first.scorecardName,
      date: first.sessionDate,
      gaugeName: first.gaugeName,
      bpo: first.bpo, hub: first.hub, market: first.market,
      avgDelta,
      calibratedCount,
      total: sRows.length,
    }
  }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

  // Per-evaluator aggregation, also computed from the filtered rows — so "needs
  // attention" reflects only the sessions currently in view.
  const byEvaluator = {}
  for (const r of filteredRows) {
    (byEvaluator[r.evaluator_id] ||= []).push(r)
  }
  const evaluatorStats = Object.entries(byEvaluator).map(([evalId, eRows]) => {
    const avgDelta = eRows.reduce((sum, r) => sum + (r.delta || 0), 0) / eRows.length
    const calibratedCount = eRows.filter(r => r.is_calibrated).length
    const withDates = [...eRows].sort((a, b) => new Date(b.sessionDate || 0) - new Date(a.sessionDate || 0))
    let consecutiveFailures = 0
    for (const r of withDates) {
      if (r.is_calibrated) break
      consecutiveFailures++
    }
    return {
      id: evalId,
      name: eRows[0].evaluatorName,
      sessions: eRows.length,
      calibratedCount,
      avgDelta,
      consecutiveFailures,
    }
  }).sort((a, b) => b.avgDelta - a.avgDelta)

  const totalSessions = sessionStats.length
  const totalEvaluations = filteredRows.length
  const totalCalibrated = filteredRows.filter(r => r.is_calibrated).length
  const overallRate = totalEvaluations > 0 ? Math.round((totalCalibrated / totalEvaluations) * 100) : 0
  const overallAvgDelta = totalEvaluations > 0
    ? filteredRows.reduce((sum, r) => sum + (r.delta || 0), 0) / totalEvaluations
    : 0

  // Week-over-week delta trend, computed from the same filtered rows as everything
  // else on this tab — lets you see if calibration accuracy is improving over time.
  function weekStart(dateStr) {
    const d = new Date(dateStr)
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    d.setDate(d.getDate() + diff)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().split('T')[0]
  }
  const byWeek = {}
  for (const r of filteredRows) {
    if (!r.sessionDate) continue
    ;(byWeek[weekStart(r.sessionDate)] ||= []).push(r)
  }
  const weeklyTrend = Object.entries(byWeek)
    .map(([week, wRows]) => ({
      week,
      avgDelta: wRows.reduce((sum, r) => sum + (r.delta || 0), 0) / wRows.length,
    }))
    .sort((a, b) => new Date(a.week) - new Date(b.week))

  // Exports exactly what's currently visible on this tab (respecting every active
  // filter, and — for non-admins — the gauge-only visibility rule from load() above),
  // so a Gauge can hand over their own slice of the data without needing DB access.
  function exportToCsv() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = []
    lines.push('Calibration Insights Export')
    lines.push(`Generated,${esc(new Date().toLocaleString())}`)
    lines.push('')
    lines.push('Summary')
    lines.push('Sessions,Evaluations Scored,Calibration Rate,Avg Delta')
    lines.push([totalSessions, totalEvaluations, overallRate + '%', (overallAvgDelta * 100).toFixed(1) + '%'].join(','))
    lines.push('')
    lines.push('Sessions Overview')
    lines.push(['Session', 'Scorecard', 'Date', 'BPO', 'HUB', 'Market', 'Gauge', 'Overall Delta', 'Calibrated', 'Total', 'Calibration Rate'].map(esc).join(','))
    sessionStats.forEach(s => {
      lines.push([
        esc(s.title), esc(s.scorecardName), esc(s.date ? new Date(s.date).toLocaleDateString() : ''),
        esc(s.bpo || ''), esc(s.hub || ''), esc(s.market || ''), esc(s.gaugeName),
        (s.avgDelta * 100).toFixed(1) + '%', s.calibratedCount, s.total,
        Math.round((s.calibratedCount / s.total) * 100) + '%',
      ].join(','))
    })
    lines.push('')
    lines.push('Evaluator Performance')
    lines.push(['Evaluator', 'Sessions', 'Calibrated', 'Calibration Rate', 'Avg Delta', 'Status'].map(esc).join(','))
    evaluatorStats.forEach(e => {
      lines.push([
        esc(e.name), e.sessions, e.calibratedCount,
        Math.round((e.calibratedCount / e.sessions) * 100) + '%',
        (e.avgDelta * 100).toFixed(1) + '%',
        esc(e.consecutiveFailures >= 3 ? 'Needs attention' : 'On track'),
      ].join(','))
    })
    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `calibration-insights-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-secondary btn-sm" onClick={exportToCsv}>⬇ Export to Excel</button>
      </div>

      {(bpoOptions.length > 0 || hubOptions.length > 0 || marketOptions.length > 0 || scorecardOptions.length > 0 || gaugeOptions.length > 0 || evaluatorOptions.length > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Filter:</span>
          {scorecardOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterScorecard} onChange={e => setFilterScorecard(e.target.value)}>
              <option value="">All Scorecards</option>
              {scorecardOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {gaugeOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterGauge} onChange={e => setFilterGauge(e.target.value)}>
              <option value="">All Gauges</option>
              {gaugeOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {evaluatorOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterEvaluator} onChange={e => setFilterEvaluator(e.target.value)}>
              <option value="">All Evaluators</option>
              {evaluatorOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {bpoOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterBpo} onChange={e => setFilterBpo(e.target.value)}>
              <option value="">All BPOs</option>
              {bpoOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {hubOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterHub} onChange={e => setFilterHub(e.target.value)}>
              <option value="">All HUBs</option>
              {hubOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {marketOptions.length > 0 && (
            <select style={filterSelectStyle} value={filterMarket} onChange={e => setFilterMarket(e.target.value)}>
              <option value="">All Markets</option>
              {marketOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>from</span>
          <input type="date" style={filterSelectStyle} value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>to</span>
          <input type="date" style={filterSelectStyle} value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          {(filterBpo || filterHub || filterMarket || filterScorecard || filterGauge || filterEvaluator || filterDateFrom || filterDateTo) && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setFilterBpo(''); setFilterHub(''); setFilterMarket('')
              setFilterScorecard(''); setFilterGauge(''); setFilterEvaluator('')
              setFilterDateFrom(''); setFilterDateTo('')
            }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>
          No results match the selected filters.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center', padding: '18px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{totalSessions}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Sessions</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center', padding: '18px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{totalEvaluations}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Evaluations Scored</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center', padding: '18px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: overallRate >= 70 ? '#16a34a' : '#dc2626' }}>{overallRate}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Calibration Rate</div>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 160, textAlign: 'center', padding: '18px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: overallAvgDelta <= 0.10 ? '#16a34a' : '#dc2626' }}>{(overallAvgDelta * 100).toFixed(1)}%</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Avg Delta</div>
            </div>
          </div>

          {weeklyTrend.length >= 2 ? (
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Delta Trend (Week over Week)
              </h2>
              <div className="card" style={{ padding: 16 }}>
                <WeeklyDeltaChart data={weeklyTrend} />
              </div>
            </section>
          ) : weeklyTrend.length === 1 ? (
            <div className="card" style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)', fontSize: 13, marginBottom: 28 }}>
              Not enough weeks of data yet for a trend line — check back once results span more than one week.
            </div>
          ) : null}

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Sessions Overview
            </h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Session</th>
                    <th style={thStyle}>Scorecard</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>BPO</th>
                    <th style={thStyle}>HUB</th>
                    <th style={thStyle}>Market</th>
                    <th style={thStyle}>Gauge</th>
                    <th style={thStyle}>Overall Delta</th>
                    <th style={thStyle}>Calibration Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionStats.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{s.title}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.scorecardName}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.date ? new Date(s.date).toLocaleDateString() : '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.bpo || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.hub || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.market || '—'}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{s.gaugeName}</td>
                      <td style={{ ...tdStyle, color: s.avgDelta <= 0.10 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{(s.avgDelta * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{s.calibratedCount}/{s.total} ({Math.round((s.calibratedCount / s.total) * 100)}%)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Evaluator Performance
            </h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={thStyle}>Evaluator</th>
                    <th style={thStyle}>Sessions</th>
                    <th style={thStyle}>Calibration Rate</th>
                    <th style={thStyle}>Avg Delta</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluatorStats.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{e.name}</td>
                      <td style={tdStyle}>{e.sessions}</td>
                      <td style={tdStyle}>{e.calibratedCount}/{e.sessions} ({Math.round((e.calibratedCount / e.sessions) * 100)}%)</td>
                      <td style={{ ...tdStyle, color: e.avgDelta <= 0.10 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{(e.avgDelta * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>
                        {e.consecutiveFailures >= 3 ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(220,38,38,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                            Needs attention
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', background: 'rgba(22,163,74,0.1)', padding: '2px 8px', borderRadius: 10 }}>
                            On track
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// ── Root shell ────────────────────────────────────────────────────────────────

export default function Calibration() {
  const { profile } = useAuth()
  const isAdmin = ['admin', 'owner'].includes(profile?.role)
  const isKgUser = profile?.email?.endsWith('@kaizengaming.com')
  const canManage = isAdmin || isKgUser
  const [tab, setTab]                = useState('sessions')
  const [scoringSession, setScoring] = useState(null)
  const [refreshKey, setRefreshKey]  = useState(0)

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1>Calibration</h1>
        </div>
      </div>

      {canManage && (
        <div style={{ display: 'flex', marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
          {[['sessions', 'My Sessions'], ['admin', 'Manage Sessions'], ['insights', 'Insights']].map(([key, label]) => (
            <button key={key}
              onClick={() => { setTab(key); setScoring(null) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 18px', fontSize: 13,
                fontWeight: tab === key ? 600 : 400,
                color: tab === key ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: `2px solid ${tab === key ? 'var(--accent, #2563eb)' : 'transparent'}`,
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'sessions' && (
        scoringSession
          ? <CalibrationSubmit
              session={scoringSession}
              onBack={() => setScoring(null)}
              onSubmitted={() => { setScoring(null); setRefreshKey(k => k + 1) }}
            />
          : <CalibrationHome key={refreshKey} onScore={s => setScoring(s)} />
      )}
      {tab === 'admin' && canManage && <CalibrationAdmin />}
      {tab === 'insights' && canManage && <CalibrationInsights />}
    </div>
  )
}
