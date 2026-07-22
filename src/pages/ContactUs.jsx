import { useState } from 'react'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

const CATEGORIES = {
  'Evaluation & Scoring': ['Disagree with a score', 'Scorecard criteria', 'Calibration concern', 'Re-evaluation request'],
  'Coaching & Feedback': ['Session quality', 'Frequency', 'Coach behavior', 'Training request'],
  'Tools & Systems (Quark)': ['Bug/error', 'Feature request', 'Access/permissions', 'Performance'],
  'Processes & Policies': ['Dispute process', 'Quality process clarity', 'Workflow/SLAs', 'Fairness concern'],
  'Workload & Wellbeing': ['Workload/targets', 'Schedule/shifts', 'Recognition', 'Work environment'],
  'Other': ['Suggestion', 'Compliment', 'Complaint', 'Anything else'],
}

export default function ContactUs() {
  const { profile } = useAuth()
  const [l1, setL1] = useState('')
  const [l2, setL2] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const flash = (text, ok = true) => { setMsg({ text, ok }); if (ok) setTimeout(() => setMsg(null), 4000) }

  const submit = async () => {
    if (!l1) return flash('Please choose a category.', false)
    if (!feedback.trim()) return flash('Please write your feedback.', false)
    setBusy(true)
    const { error } = await supabase.rpc('submit_contact_feedback', { p_l1: l1, p_l2: l2 || null, p_feedback: feedback.trim() })
    setBusy(false)
    if (error) return flash(error.message, false)
    setL1(''); setL2(''); setFeedback('')
    flash('Thank you — your feedback has been submitted.')
  }

  const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <div className="page-header"><div><h1>Contact Us</h1><p className="page-sub">Share any feedback with the Quality team — suggestions, concerns, or compliments.</p></div></div>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ marginBottom: 16 }}>{msg.text}</div>}
      <div className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl}>Category</label>
            <select style={inp} value={l1} onChange={e => { setL1(e.target.value); setL2('') }}>
              <option value="">— Select a category —</option>
              {Object.keys(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={lbl}>Sub-category</label>
            <select style={inp} value={l2} disabled={!l1} onChange={e => setL2(e.target.value)}>
              <option value="">{l1 ? '— Select a sub-category —' : 'Select a category first'}</option>
              {(CATEGORIES[l1] || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={lbl}>Your feedback</label>
          <textarea style={{ ...inp, minHeight: 160, resize: 'vertical' }} placeholder="Tell us anything on your mind…" value={feedback} onChange={e => setFeedback(e.target.value)} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>Submit feedback</button>
        </div>
      </div>
    </div>
  )
}
