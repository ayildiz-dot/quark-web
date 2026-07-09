const fs = require('fs')
const path = '/workspaces/quark-web/src/pages/Calibration.jsx'
let src = fs.readFileSync(path, 'utf8')

const find = `// ── CalibrationAdmin (Step 8 placeholder) ────────────────────────────────────

function CalibrationAdmin() {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 14 }}>
      Session management coming soon
    </div>
  )
}`

if (!src.includes(find)) { console.log('❌ Anchor not found'); process.exit(1) }

const replace = `// ── CalibrationAdmin (Step 8) ────────────────────────────────────────────────

function CalibrationAdmin() {
  const [sessions, setSessions]     = useState([])
  const [scorecards, setScorecards] = useState([])
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected]     = useState(null)
  const [detail, setDetail]         = useState(null)
  const [creating, setCreating]     = useState(false)
  const [form, setForm] = useState({
    title: '', type: 'quality', scorecard_id: '', gauge_user_id: '',
    case_reference: '', session_date: new Date().toISOString().split('T')[0],
    participants: [],
  })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: sess }, { data: scs }, { data: us }] = await Promise.all([
      supabase.from('calibration_sessions').select('*').order('created_at', { ascending: false }),
      supabase.from('scorecards').select('id, name, type').eq('is_calibration', true).eq('is_published', true).order('name'),
      supabase.from('users').select('id, name, email').order('email'),
    ])
    setSessions(sess || [])
    setScorecards(scs || [])
    setUsers(us || [])
    setLoading(false)
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
    setDetail({
      participants: partUsers.map(u => ({ ...u, sub: subMap[u.id] || null })),
      gaugeUser,
      gaugeSub: subMap[session.gauge_user_id] || null,
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
    setForm({ title: '', type: 'quality', scorecard_id: '', gauge_user_id: '', case_reference: '', session_date: new Date().toISOString().split('T')[0], participants: [] })
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
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--border)', background: selected?.id === s.id ? 'var(--bg-secondary)' : 'transparent' }}>
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
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(null); setDetail(null) }}>✕</button>
            </div>
          </div>

          {!detail ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
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
}`

fs.writeFileSync(path, src.replace(find, () => replace))
console.log('✅ CalibrationAdmin replaced')
