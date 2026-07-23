import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

const inp = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 14, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }
const sel = { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }

const STATUS_META = {
  open:           { label: 'Open',           bg: 'var(--warning-light, #fef3c7)', fg: 'var(--warning, #b45309)' },
  in_progress:    { label: 'In progress',    bg: 'var(--accent-light, #dbeafe)',  fg: 'var(--accent, #2563eb)' },
  pending_action: { label: 'Pending action', bg: '#ede9fe',                        fg: '#7c3aed' },
  resolved:       { label: 'Resolved',        bg: 'var(--success-light, #dcfce7)', fg: 'var(--success, #16a34a)' },
}
const STATUS_ORDER = ['open', 'in_progress', 'pending_action', 'resolved']

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.open
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: m.bg, color: m.fg, whiteSpace: 'nowrap' }}>{m.label}</span>
}

function useNarrow(bp = 760) {
  const [n, setN] = useState(typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const h = () => setN(window.innerWidth < bp)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [bp])
  return n
}

// Screenshot via short-lived signed URL.
function Attachment({ path }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    if (!path) return
    supabase.storage.from('issue-attachments').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (!alive) return
      if (error || !data?.signedUrl) setErr(true); else setUrl(data.signedUrl)
    })
    return () => { alive = false }
  }, [path])
  if (!path) return null
  if (err) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Screenshot unavailable.</div>
  if (!url) return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading screenshot…</div>
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Screenshot" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid var(--border)' }} /></a>
}

// -------- Shared conversation thread + composer --------
function Bubble({ side, name, when, children }) {
  const staff = side === 'staff'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: staff ? 'flex-end' : 'flex-start' }}>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 4px 3px' }}>{name} · {new Date(when).toLocaleString()}</div>
      <div style={{ maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        background: staff ? 'var(--accent-light, #dbeafe)' : 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        {children}
      </div>
    </div>
  )
}

// -------- Detail pane (shared by admin & reporter, controls differ) --------
function IssueDetail({ issueId, isAdmin, me, names, onChanged, onBack, showBack }) {
  const [issue, setIssue] = useState(null)
  const [msgs, setMsgs] = useState([])
  const [authorNames, setAuthorNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [statusTarget, setStatusTarget] = useState('')
  const [resNote, setResNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const flash = (text, ok = true) => { setMsg({ text, ok }); if (ok) setTimeout(() => setMsg(null), 4000) }

  const load = async () => {
    setLoading(true)
    const { data: iss } = await supabase.from('issues').select('*').eq('id', issueId).maybeSingle()
    const { data: mm } = await supabase.from('issue_messages').select('*').eq('issue_id', issueId).order('created_at', { ascending: true })
    setIssue(iss); setMsgs(mm || [])
    const ids = [...new Set([iss?.reporter_id, iss?.assignee_id, ...(mm || []).map(m => m.author_id)].filter(Boolean))]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name, email').in('id', ids)
      setAuthorNames(Object.fromEntries((us || []).map(u => [u.id, u.name || u.email])))
    }
    setStatusTarget(iss?.status || ''); setResNote(''); setLoading(false)
  }
  useEffect(() => { if (issueId) load() /* eslint-disable-next-line */ }, [issueId])

  const refresh = async () => { await load(); onChanged && onChanged() }

  const takeOver = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('takeover_issue', { p_issue_id: issueId })
    setBusy(false)
    if (error) { flash(error.message, false); await refresh(); return }
    flash('You have taken over this issue.'); await refresh()
  }
  const sendReply = async () => {
    if (!reply.trim()) return
    setBusy(true)
    const { error } = await supabase.rpc('post_issue_message', { p_issue_id: issueId, p_body: reply.trim() })
    setBusy(false)
    if (error) return flash(error.message, false)
    setReply(''); await refresh()
  }
  const applyStatus = async () => {
    if (!statusTarget || statusTarget === issue.status) return
    setBusy(true)
    const { error } = await supabase.rpc('set_issue_status', { p_issue_id: issueId, p_status: statusTarget, p_note: statusTarget === 'resolved' ? (resNote.trim() || null) : null })
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('Status updated.'); await refresh()
  }
  const reopen = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('reopen_issue', { p_issue_id: issueId })
    setBusy(false)
    if (error) return flash(error.message, false)
    flash('Issue re-opened.'); await refresh()
  }

  if (loading) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
  if (!issue) return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Issue not found.</div>

  const reporterName = names[issue.reporter_id] || authorNames[issue.reporter_id] || 'Reporter'
  const assigneeName = issue.assignee_id ? (names[issue.assignee_id] || authorNames[issue.assignee_id] || 'admin') : null
  const canReopen = issue.status === 'resolved' && issue.resolved_at && (Date.now() < new Date(issue.resolved_at).getTime() + 7 * 864e5)

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        {showBack && <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }} onClick={onBack}>← Back</button>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{issue.title}</div>
          <StatusBadge status={issue.status} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
          Raised by {reporterName}{issue.market ? ` · ${issue.market}` : ''} · {new Date(issue.created_at).toLocaleString()}
          {assigneeName && <> · Handled by {assigneeName}</>}
        </div>
      </div>

      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ margin: '12px 16px 0' }}>{msg.text}</div>}

      {/* Conversation */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 460, overflowY: 'auto' }}>
        <Bubble side="reporter" name={reporterName} when={issue.created_at}>{issue.description}</Bubble>
        {issue.attachment_path && <div style={{ alignSelf: 'flex-start', maxWidth: '85%' }}><Attachment path={issue.attachment_path} /></div>}
        {msgs.map(m => (
          <Bubble key={m.id} side={m.is_staff ? 'staff' : 'reporter'} name={authorNames[m.author_id] || (m.is_staff ? 'Admin' : 'Reporter')} when={m.created_at}>{m.body}</Bubble>
        ))}
        {issue.status === 'resolved' && issue.resolution && (
          <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <strong>Resolution:</strong> {issue.resolution}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isAdmin && issue.status === 'open' && (
          <button className="btn btn-primary" disabled={busy} onClick={takeOver}>Take over</button>
        )}

        {isAdmin && issue.status !== 'open' && (
          <>
            <div>
              <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder="Type a reply to the reporter…" value={reply} onChange={e => setReply(e.target.value)} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim() || issue.status === 'resolved'} onClick={sendReply}>Send reply</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Status:</span>
              <select style={sel} value={statusTarget} onChange={e => setStatusTarget(e.target.value)}>
                <option value="in_progress">In progress</option>
                <option value="pending_action">Pending action</option>
                <option value="resolved">Resolved</option>
              </select>
              {statusTarget === 'resolved' && (
                <input style={{ ...inp, flex: 1, minWidth: 180, width: 'auto' }} placeholder="Resolution note (optional)" value={resNote} onChange={e => setResNote(e.target.value)} />
              )}
              <button className="btn btn-outline btn-sm" disabled={busy || statusTarget === issue.status} onClick={applyStatus}>Apply</button>
            </div>
          </>
        )}

        {!isAdmin && issue.status !== 'resolved' && (
          <div>
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} placeholder="Add a reply…" value={reply} onChange={e => setReply(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={sendReply}>Send reply</button>
            </div>
          </div>
        )}

        {!isAdmin && issue.status === 'resolved' && (
          canReopen
            ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Resolved. You can re-open this for 7 days if it isn't fixed.</span>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={reopen}>Re-open issue</button>
              </div>
            : <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>This issue is resolved. The re-open window has closed.</div>
        )}
      </div>
    </div>
  )
}

// -------- Left list --------
function IssueList({ items, selectedId, onSelect, nameFor }) {
  if (!items.length) return <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 14 }}>No issues here.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(r => {
        const active = r.id === selectedId
        return (
          <button key={r.id} onClick={() => onSelect(r.id)} className="card"
            style={{ textAlign: 'left', cursor: 'pointer', padding: '11px 13px', border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: active ? 'var(--bg-hover)' : 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <StatusBadge status={r.status} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameFor(r.reporter_id)}</span>
              <span>{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// -------- Report form (evaluators / team leaders) --------
function ReportForm({ onSubmitted }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const flash = (text, ok = true) => { setMsg({ text, ok }); if (ok) setTimeout(() => setMsg(null), 4000) }

  const submit = async () => {
    if (!title.trim()) return flash('Please enter a title.', false)
    if (!description.trim()) return flash('Please describe the issue.', false)
    if (file && file.size > 5 * 1024 * 1024) return flash('Screenshot must be under 5 MB.', false)
    setBusy(true)
    let attachmentPath = null
    if (file) {
      const safeName = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `${profile.id}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage.from('issue-attachments').upload(path, file, { upsert: false })
      if (upErr) { setBusy(false); return flash('Screenshot upload failed: ' + upErr.message, false) }
      attachmentPath = path
    }
    const { error } = await supabase.rpc('submit_issue', { p_title: title.trim(), p_description: description.trim(), p_attachment_path: attachmentPath })
    setBusy(false)
    if (error) return flash(error.message, false)
    setTitle(''); setDescription(''); setFile(null)
    flash('Thanks — your issue has been sent to the admins.')
    onSubmitted && onSubmitted()
  }

  return (
    <>
      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ marginBottom: 16 }}>{msg.text}</div>}
      <div className="card" style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={lbl}>Title</label>
          <input style={inp} placeholder="Short summary of the issue" value={title} onChange={e => setTitle(e.target.value)} maxLength={140} />
        </div>
        <div>
          <label style={lbl}>Description</label>
          <textarea style={{ ...inp, minHeight: 160, resize: 'vertical' }} placeholder="What happened? Where in Quark? What did you expect?" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label style={lbl}>Screenshot (optional)</label>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, color: 'var(--text-secondary)' }} />
          {file && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{file.name}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit issue'}</button>
        </div>
      </div>
    </>
  )
}

// -------- Reporter inbox (My Issues, two-pane) --------
function ReporterInbox({ initialOpenId }) {
  const { profile } = useAuth()
  const isNarrow = useNarrow()
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(initialOpenId || null)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('issues').select('*').eq('reporter_id', profile.id).order('last_activity_at', { ascending: false })
    const list = data || []
    setRows(list)
    const ids = [...new Set(list.map(r => r.assignee_id).filter(Boolean))]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name, email').in('id', ids)
      setNames(Object.fromEntries((us || []).map(u => [u.id, u.name || u.email])))
    }
    setLoading(false)
  }
  useEffect(() => { if (profile?.id) load() /* eslint-disable-next-line */ }, [profile?.id])
  useEffect(() => { if (initialOpenId) setSelectedId(initialOpenId) }, [initialOpenId])

  const nameFor = () => 'You'
  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {(!isNarrow || !selectedId) && (
        <div style={{ width: isNarrow ? '100%' : 340, flexShrink: 0 }}>
          <IssueList items={rows} selectedId={selectedId} onSelect={setSelectedId} nameFor={nameFor} />
        </div>
      )}
      {(!isNarrow || selectedId) && (
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedId
            ? <IssueDetail issueId={selectedId} isAdmin={false} me={profile.id} names={names} onChanged={load} showBack={isNarrow} onBack={() => setSelectedId(null)} />
            : <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Select an issue to view the conversation.</div>}
        </div>
      )}
    </div>
  )
}

// -------- Admin management (4 tabs + filters + export, two-pane) --------
const SUBTABS = [
  { key: 'open',     label: 'Open',     match: r => r.status === 'open' },
  { key: 'assigned', label: 'Assigned', match: r => r.status === 'in_progress' },
  { key: 'resolved', label: 'Resolved', match: r => r.status === 'resolved' },
  { key: 'all',      label: 'All',      match: () => true },
]
const emptyFilters = { search: '', status: '', reporter: '', assignee: '', division: '', workspace: '', hub: '', market: '' }

function ManageIssues({ initialOpenId }) {
  const isNarrow = useNarrow()
  const [rows, setRows] = useState([])
  const [names, setNames] = useState({})
  const [wsMap, setWsMap] = useState({})
  const [hubMap, setHubMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [subtab, setSubtab] = useState(initialOpenId ? 'all' : 'open')
  const [filters, setFilters] = useState(emptyFilters)
  const [selectedId, setSelectedId] = useState(initialOpenId || null)

  const load = async () => {
    setLoading(true)
    const [{ data }, { data: ws }, { data: hubs }] = await Promise.all([
      supabase.from('issues').select('*').order('last_activity_at', { ascending: false }),
      supabase.from('workspaces').select('id, name'),
      supabase.from('hubs').select('id, name'),
    ])
    const list = data || []
    setRows(list)
    setWsMap(Object.fromEntries((ws || []).map(w => [w.id, w.name])))
    setHubMap(Object.fromEntries((hubs || []).map(h => [h.id, h.name])))
    const ids = [...new Set([...list.map(r => r.reporter_id), ...list.map(r => r.assignee_id)].filter(Boolean))]
    if (ids.length) {
      const { data: us } = await supabase.from('users').select('id, name, email').in('id', ids)
      setNames(Object.fromEntries((us || []).map(u => [u.id, u.name || u.email])))
    }
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useEffect(() => { if (initialOpenId) { setSubtab('all'); setSelectedId(initialOpenId) } }, [initialOpenId])

  const nameFor = id => names[id] || '—'
  const uniq = (arr) => [...new Set(arr.filter(Boolean))]
  const opt = SUBTABS.find(t => t.key === subtab) || SUBTABS[0]

  const passFilters = r => {
    if (filters.search) { const q = filters.search.toLowerCase(); if (!(`${r.title} ${r.description}`.toLowerCase().includes(q))) return false }
    if (subtab === 'all' && filters.status && r.status !== filters.status) return false
    if (filters.reporter && r.reporter_id !== filters.reporter) return false
    if (filters.assignee && r.assignee_id !== filters.assignee) return false
    if (filters.division && r.division !== filters.division) return false
    if (filters.workspace && r.workspace_id !== filters.workspace) return false
    if (filters.hub && r.hub_id !== filters.hub) return false
    if (filters.market && r.market !== filters.market) return false
    return true
  }
  const shown = rows.filter(opt.match).filter(passFilters)

  const exportXlsx = async () => {
    if (!shown.length) { alert('No issues match the current tab and filters.'); return }
    const ids = shown.map(r => r.id)
    const { data: mm } = await supabase.from('issue_messages').select('issue_id').in('issue_id', ids)
    const counts = (mm || []).reduce((a, m) => { a[m.issue_id] = (a[m.issue_id] || 0) + 1; return a }, {})
    const header = ['Issue ID', 'Title', 'Description', 'Status', 'Reporter', 'Assignee', 'Division', 'Workspace', 'Hub', 'Market',
      'Created', 'Taken over', 'Resolved', 'Resolution', 'Re-opened', 'Last activity', 'Replies']
    const out = shown.map(r => ({
      'Issue ID': r.id,
      'Title': r.title || '',
      'Description': r.description || '',
      'Status': (STATUS_META[r.status] || {}).label || r.status,
      'Reporter': names[r.reporter_id] || '',
      'Assignee': r.assignee_id ? (names[r.assignee_id] || '') : '',
      'Division': r.division || '',
      'Workspace': r.workspace_id ? (wsMap[r.workspace_id] || '') : '',
      'Hub': r.hub_id ? (hubMap[r.hub_id] || '') : '',
      'Market': r.market || '',
      'Created': new Date(r.created_at).toLocaleString(),
      'Taken over': r.taken_over_at ? new Date(r.taken_over_at).toLocaleString() : '',
      'Resolved': r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '',
      'Resolution': r.resolution || '',
      'Re-opened': r.reopened_at ? new Date(r.reopened_at).toLocaleString() : '',
      'Last activity': new Date(r.last_activity_at).toLocaleString(),
      'Replies': counts[r.id] || 0,
    }))
    const wsheet = XLSX.utils.json_to_sheet(out, { header })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, wsheet, 'Issues')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'quark-issues.xlsx')
  }

  const setF = patch => setFilters(f => ({ ...f, ...patch }))
  const anyFilter = Object.entries(filters).some(([k, v]) => v && !(k === 'status' && subtab !== 'all'))

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {SUBTABS.map(t => {
          const count = rows.filter(t.match).length
          return <button key={t.key} className={`tab ${subtab === t.key ? 'active' : ''}`} onClick={() => setSubtab(t.key)}>{t.label} ({count})</button>
        })}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input style={{ ...sel, width: 200 }} placeholder="Search title / description" value={filters.search} onChange={e => setF({ search: e.target.value })} />
        {subtab === 'all' && (
          <select style={sel} value={filters.status} onChange={e => setF({ status: e.target.value })}>
            <option value="">All statuses</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        )}
        <select style={sel} value={filters.reporter} onChange={e => setF({ reporter: e.target.value })}>
          <option value="">All reporters</option>
          {uniq(rows.map(r => r.reporter_id)).map(id => <option key={id} value={id}>{names[id] || id}</option>)}
        </select>
        <select style={sel} value={filters.assignee} onChange={e => setF({ assignee: e.target.value })}>
          <option value="">All assignees</option>
          {uniq(rows.map(r => r.assignee_id)).map(id => <option key={id} value={id}>{names[id] || id}</option>)}
        </select>
        <select style={sel} value={filters.division} onChange={e => setF({ division: e.target.value })}>
          <option value="">All divisions</option>
          {uniq(rows.map(r => r.division)).map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={sel} value={filters.workspace} onChange={e => setF({ workspace: e.target.value })}>
          <option value="">All workspaces</option>
          {uniq(rows.map(r => r.workspace_id)).map(id => <option key={id} value={id}>{wsMap[id] || id}</option>)}
        </select>
        <select style={sel} value={filters.hub} onChange={e => setF({ hub: e.target.value })}>
          <option value="">All hubs</option>
          {uniq(rows.map(r => r.hub_id)).map(id => <option key={id} value={id}>{hubMap[id] || id}</option>)}
        </select>
        <select style={sel} value={filters.market} onChange={e => setF({ market: e.target.value })}>
          <option value="">All markets</option>
          {uniq(rows.map(r => r.market)).map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {anyFilter && <button className="btn btn-ghost btn-sm" onClick={() => setFilters(emptyFilters)}>Clear</button>}
        <button className="btn btn-accent-soft btn-sm" style={{ marginLeft: 'auto' }} onClick={exportXlsx}>Export to Excel</button>
      </div>

      {/* Two-pane */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {(!isNarrow || !selectedId) && (
          <div style={{ width: isNarrow ? '100%' : 340, flexShrink: 0 }}>
            <IssueList items={shown} selectedId={selectedId} onSelect={setSelectedId} nameFor={nameFor} />
          </div>
        )}
        {(!isNarrow || selectedId) && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedId
              ? <IssueDetail issueId={selectedId} isAdmin={true} names={names} onChanged={load} showBack={isNarrow} onBack={() => setSelectedId(null)} />
              : <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Select an issue to handle it.</div>}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function Issues() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const isAdmin = ['admin', 'owner'].includes(profile?.role)
  const openId = searchParams.get('open') || null
  const [tab, setTab] = useState(searchParams.get('tab') === 'mine' || openId ? 'mine' : 'report')

  if (isAdmin) {
    return (
      <div className="page" style={{ maxWidth: 1100 }}>
        <div className="page-header"><div><h1>Issue Management</h1><p className="page-sub">Issues raised by evaluators and team leaders. Take one over, converse with the reporter, then resolve.</p></div></div>
        <ManageIssues initialOpenId={openId} />
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-header"><div><h1>Issue Management</h1><p className="page-sub">Report a Quark issue and track the conversation with the admins.</p></div></div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>Report an Issue</button>
        <button className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My Issues</button>
      </div>
      {tab === 'mine'
        ? <ReporterInbox initialOpenId={openId} />
        : <ReportForm onSubmitted={() => setTab('mine')} />}
    </div>
  )
}
