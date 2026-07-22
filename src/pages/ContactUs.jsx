import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

const CATEGORIES = {
  'Coaching & Feedback': ['Session quality', 'Frequency', 'Coach behavior', 'Training request'],
  'Tools & Systems (Quark)': ['Bug/error', 'Feature request', 'Access/permissions', 'Performance'],
  'Processes & Policies': ['Dispute process', 'Quality process clarity', 'Workflow/SLAs', 'Fairness concern'],
  'Workload & Wellbeing': ['Workload/targets', 'Schedule/shifts', 'Recognition', 'Work environment'],
  'Other': ['Suggestion', 'Compliment', 'Complaint', 'Anything else'],
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }

function ContactForm() {
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
  return (
    <>
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
    </>
  )
}

function ContactInsights() {
  const [summaries, setSummaries] = useState([])
  const [wsMap, setWsMap] = useState({})
  const [hubMap, setHubMap] = useState({})
  const [fMonth, setFMonth] = useState('')
  const [fYear, setFYear] = useState('')
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: sums }, { data: ws }, { data: hubs }] = await Promise.all([
        supabase.from('contact_feedback_summaries').select('*').order('year', { ascending: false }).order('month', { ascending: false }),
        supabase.from('workspaces').select('id, name'),
        supabase.from('hubs').select('id, name'),
      ])
      setSummaries(sums || [])
      setWsMap(Object.fromEntries((ws || []).map(w => [w.id, w.name])))
      setHubMap(Object.fromEntries((hubs || []).map(h => [h.id, h.name])))
      setLoading(false)
    })()
  }, [])

  const years = [...new Set(summaries.map(s => s.year))].sort((a, b) => b - a)
  const shown = summaries.filter(s => (!fYear || s.year === Number(fYear)) && (!fMonth || s.month === Number(fMonth)))

  const exportXlsx = async () => {
    const { data } = await supabase.from('contact_feedback').select('*, users(name, email)').order('created_at', { ascending: false })
    let rows = data || []
    if (fYear) rows = rows.filter(r => new Date(r.created_at).getFullYear() === Number(fYear))
    if (fMonth) rows = rows.filter(r => (new Date(r.created_at).getMonth() + 1) === Number(fMonth))
    if (!rows.length) { alert('No feedback matches the selected filters.'); return }
    const header = ['User', 'Division', 'Workspace', 'Hub', 'Market', 'Submission date', 'Category L1', 'Category L2', 'Feedback']
    const out = rows.map(r => ({
      'User': r.users?.name || r.users?.email || '',
      'Division': r.division || '',
      'Workspace': r.workspace_id ? (wsMap[r.workspace_id] || '') : '',
      'Hub': r.hub_id ? (hubMap[r.hub_id] || '') : '',
      'Market': r.market || '',
      'Submission date': new Date(r.created_at).toLocaleString(),
      'Category L1': r.category_l1 || '',
      'Category L2': r.category_l2 || '',
      'Feedback': r.feedback || '',
    }))
    const wsheet = XLSX.utils.json_to_sheet(out, { header })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, wsheet, 'Feedback')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'contact-us-feedback.xlsx')
  }

  const sel = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }
  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select style={sel} value={fYear} onChange={e => setFYear(e.target.value)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={fMonth} onChange={e => setFMonth(e.target.value)}>
          <option value="">All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button className="btn btn-accent-soft" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Export to Excel</button>
      </div>
      {shown.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: 'var(--text-secondary)', fontSize: 14 }}>No monthly summaries yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(s => {
            const open = !!expanded[s.id]
            return (
              <div key={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button onClick={() => setExpanded(m => ({ ...m, [s.id]: !m[s.id] }))}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{open ? '▾' : '▸'}</span>
                  <span style={{ fontWeight: 600 }}>{MONTHS[s.month - 1]} {s.year}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{s.total_count} submission{s.total_count === 1 ? '' : 's'}</span>
                </button>
                {open && (
                  <div style={{ padding: '0 16px 16px 40px', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{s.summary_text}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ContactUs() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const isPriv = ['admin', 'owner'].includes(profile?.role)
  const [tab, setTab] = useState(isPriv && searchParams.get('tab') === 'insights' ? 'insights' : 'submit')
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-header"><div><h1>Contact Us</h1><p className="page-sub">Share any feedback with the Quality team — suggestions, concerns, or compliments.</p></div></div>
      {isPriv && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button className={`tab ${tab === 'submit' ? 'active' : ''}`} onClick={() => setTab('submit')}>Contact Us</button>
          <button className={`tab ${tab === 'insights' ? 'active' : ''}`} onClick={() => setTab('insights')}>Contact Us Insights</button>
        </div>
      )}
      {tab === 'insights' && isPriv ? <ContactInsights /> : <ContactForm />}
    </div>
  )
}
