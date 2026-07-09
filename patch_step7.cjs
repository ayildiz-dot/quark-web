const fs = require('fs')
const path = '/workspaces/quark-web/src/pages/Calibration.jsx'
let src = fs.readFileSync(path, 'utf8')

// Patch 1 — add allResults state + loader after the creating state declaration
const find1 = `  const [creating, setCreating]     = useState(false)`

const replace1 = `  const [creating, setCreating]     = useState(false)
  const [allResults, setAllResults]  = useState([])
  const [loadingResults, setLR]     = useState(false)

  useEffect(() => { loadResults() }, [])

  async function loadResults() {
    setLR(true)
    const { data: subs } = await supabase
      .from('calibration_submissions')
      .select('evaluator_id, session_id, status, overall_score, is_calibrated, delta, submitted_at')
      .eq('status', 'evaluated')
      .eq('is_gauge', false)
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
  }`

if (!src.includes(find1)) { console.log('❌ Anchor 1 not found'); process.exit(1) }
src = src.replace(find1, () => replace1)
console.log('✅ Patch 1 — allResults state + loader')

// Patch 2 — render All Results table before the create modal
const find2 = `      {/* Create session modal */}`

const replace2 = `      {/* All Results */}
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

      {/* Create session modal */}`

if (!src.includes(find2)) { console.log('❌ Anchor 2 not found'); process.exit(1) }
src = src.replace(find2, () => replace2)
console.log('✅ Patch 2 — All Results table')

fs.writeFileSync(path, src)
