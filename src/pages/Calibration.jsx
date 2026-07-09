import { useState, useEffect } from 'react'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

// ── Shared ───────────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'var(--bg-card, #fff)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 20px',
}

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

    const { data: certsData } = await supabase
      .from('calibration_certifications')
      .select('*')
      .eq('evaluator_id', uid)
    setCerts(certsData || [])

    const { data: parts } = await supabase
      .from('calibration_participants')
      .select('session_id')
      .eq('evaluator_id', uid)

    const sessionIds = (parts || []).map(p => p.session_id)
    let evalSessions = []

    if (sessionIds.length > 0) {
      const { data: sessions } = await supabase
        .from('calibration_sessions')
        .select('id, title, type, session_date, status, gauge_user_id, scorecard_id')
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
        .select('id, title, type, session_date')
        .in('id', rsIds)
      const rsMap = Object.fromEntries((rsSessions || []).map(s => [s.id, s]))
      setPast(results.map(r => ({ ...r, session: rsMap[r.session_id] })))
    }

    setLoading(false)
  }

  function CertCard({ type, label }) {
    const cert = certs.find(c => c.scorecard_type === type)
    return (
      <div style={{ flex: 1, ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        {!cert ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No calibration data yet</div>
        ) : (
          <>
            <div style={{
              display: 'inline-block', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              backgroundColor: cert.is_active ? '#16a34a22' : '#dc262622',
              color: cert.is_active ? '#16a34a' : '#dc2626',
              border: `1px solid ${cert.is_active ? '#16a34a44' : '#dc262644'}`,
              marginBottom: 8,
            }}>
              {cert.is_active ? '✓ Certified' : '✗ Not Certified'}
            </div>
            {cert.last_calibrated_at && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                Last calibrated: {new Date(cert.last_calibrated_at).toLocaleDateString()}
              </div>
            )}
            {!cert.is_active && cert.consecutive_failures >= 3 && (
              <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>
                Recertification required · {cert.consecutive_failures} consecutive failures
              </div>
            )}
          </>
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
        <div style={{ display: 'flex', gap: 16 }}>
          <CertCard type="dsat"    label="DSAT" />
          <CertCard type="quality" label="Quality" />
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
                      {r.delta != null ? `${(r.delta * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td style={tdStyle}><ResultBadge calibrated={r.is_calibrated} /></td>
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

    const { data: cert } = await supabase.from('calibration_certifications')
      .select('*').eq('evaluator_id', evalId).eq('scorecard_type', session.type).maybeSingle()

    if (!cert) {
      await supabase.from('calibration_certifications').insert({
        evaluator_id: evalId,
        scorecard_type: session.type,
        is_active: isCalibrated,
        consecutive_failures: isCalibrated ? 0 : 1,
        last_calibrated_at: isCalibrated ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
    } else {
      const newFails = isCalibrated ? 0 : (cert.consecutive_failures || 0) + 1
      const nowRevoked = newFails >= 3
      await supabase.from('calibration_certifications').update({
        is_active: isCalibrated && !nowRevoked,
        consecutive_failures: newFails,
        last_calibrated_at: isCalibrated ? new Date().toISOString() : cert.last_calibrated_at,
        revoked_at: nowRevoked && !cert.revoked_at ? new Date().toISOString() : cert.revoked_at,
        revocation_reason: nowRevoked && !cert.revoked_at ? '3 consecutive calibration failures' : cert.revocation_reason,
        updated_at: new Date().toISOString(),
      }).eq('id', cert.id)
    }
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

    const { data: allParts } = await supabase.from('calibration_participants')
      .select('evaluator_id').eq('session_id', session.id)
    const { data: evalDone } = await supabase.from('calibration_submissions')
      .select('id').eq('session_id', session.id).eq('is_gauge', false).eq('status', 'evaluated')

    if ((evalDone?.length || 0) >= (allParts?.length || 1) && (allParts?.length || 0) > 0) {
      await supabase.from('calibration_sessions').update({ status: 'completed' }).eq('id', session.id)
    }
  }

  // ── Submit handler ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    const unanswered = questions.filter(q => !answers[q.id])
    if (unanswered.length > 0) {
      setError(`${unanswered.length} question${unanswered.length > 1 ? 's' : ''} still need an answer.`)
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
                    {q.is_weighted && q.weight && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600, backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                        w{q.weight}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Overall Comment</div>
        <textarea
          placeholder="Optional overall comment on this calibration…"
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
    </div>
  )
}

// ── CalibrationAdmin (Step 8 placeholder) ────────────────────────────────────

function CalibrationAdmin() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 14 }}>
      Session management coming soon
    </div>
  )
}

// ── Root shell ────────────────────────────────────────────────────────────────

export default function Calibration() {
  const { profile } = useAuth()
  const isAdmin = ['admin', 'owner'].includes(profile?.role)
  const [tab, setTab]                = useState('sessions')
  const [scoringSession, setScoring] = useState(null)
  const [refreshKey, setRefreshKey]  = useState(0)

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1>Calibration</h1>
          <p className="page-sub">COPC calibration sessions and certifications</p>
        </div>
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
          {[['sessions', 'My Sessions'], ['admin', 'Manage Sessions']].map(([key, label]) => (
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
      {tab === 'admin' && isAdmin && <CalibrationAdmin />}
    </div>
  )
}
