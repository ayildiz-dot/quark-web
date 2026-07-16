import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import { getEvaluatorScope } from '../lib/evaluatorScope'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

export default function Evaluations() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data,    setData]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail,  setDetail]  = useState(null)
  const [filters, setFilters] = useState({
    search: '', dateFrom: '', dateTo: '', scorecard: '', evalId: '', status: ''
  })
  const [scorecards, setScorecards] = useState([])
  const [drafts, setDrafts] = useState([])
  const [showDrafts, setShowDrafts] = useState(false)

  // Type toggles — both on by default. Both off = show everything.
  const [showQuality, setShowQuality] = useState(true)
  const [showDsat,    setShowDsat]    = useState(true)

  // Admin/Owner only: filter by which evaluator submitted.
  const [evaluatorFilter, setEvaluatorFilter] = useState('') // '' = all
  const [evaluatorList,   setEvaluatorList]   = useState([])  // [{id, name, email}]
  const isPrivileged = ['admin', 'owner'].includes(profile?.role)

  const LIMIT = 50
  const isAgent = profile?.role === 'viewer'

  // Exact assigned-queue ids for the current user (evaluators & team leaders).
  const getMyQueueIds = async () => {
    const { data } = await supabase.from('user_queues').select('queue_id').eq('user_id', profile.id)
    return [...new Set((data || []).map(r => r.queue_id).filter(Boolean))]
  }

  useEffect(() => {
    loadScorecards()
    if (profile?.role && profile.role !== 'viewer') loadEvaluatorList()
  }, [profile])

  // Build the evaluator dropdown from people who have actually submitted evaluations.
  const loadEvaluatorList = async () => {
    let elq = supabase
      .from('evaluations')
      .select('evaluator_id, users(name, email)')
      .eq('status', 'submitted')
    if (!isPrivileged) {
      const { hubIds } = await getEvaluatorScope(profile.id)
      if (!hubIds.length) { setEvaluatorList([]); return }
      elq = elq.in('hub_id', hubIds)
    }
    const { data: evs } = await elq
    const byId = {}
    ;(evs || []).forEach(r => {
      if (r.evaluator_id && r.users) byId[r.evaluator_id] = { id: r.evaluator_id, name: r.users.name, email: r.users.email }
    })
    setEvaluatorList(Object.values(byId).sort((a, b) => (a.email || '').localeCompare(b.email || '')))
  }

  // Refetch whenever the type toggles change (and on first mount once profile is ready)
  useEffect(() => {
    if (profile?.id) fetchEvals(1)
  }, [profile, showQuality, showDsat, evaluatorFilter])

  useEffect(() => {
    if (profile?.id) loadDrafts()
  }, [profile])

  // Evaluation ID + Status filter immediately as you type / choose.
  useEffect(() => {
    if (!profile?.id) return
    const t = setTimeout(() => fetchEvals(1), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line
  }, [filters.evalId, filters.status])

  // Returns the evaluation_type values to include, or null to include all.
  const activeTypes = () => {
    if (showQuality && showDsat) return null      // both on → all
    if (!showQuality && !showDsat) return null     // both off → all
    if (showQuality) return ['quality']
    if (showDsat) return ['dsat']
    return null
  }

  const loadDrafts = async () => {
    if (!profile?.id) return
    const { data, error } = await supabase
      .from('evaluations')
      .select('*, scorecards!evaluations_scorecard_id_fkey(name, type)')
      .eq('status', 'draft')
      .eq('evaluator_id', profile.id)
      .order('submitted_at', { ascending: false })
    console.log('loadDrafts result:', { data, error, profileId: profile?.id })
    setDrafts(data || [])
  }

  const deleteDraft = async (id) => {
    console.log('deleteDraft called with id:', id)
    const { error, data } = await supabase.from('evaluations').delete().eq('id', id).select()
    console.log('delete result:', { error, data })
    if (!error) {
      setDrafts(d => d.filter(dr => dr.id !== id))
    } else {
      console.error('Delete failed:', error)
    }
  }

  const loadScorecards = async () => {
    const { data } = await supabase
      .from('scorecards')
      .select('id, name, type')
      .eq('is_published', true)
      .eq('is_calibration', false)
      .order('name')
    setScorecards(data || [])
  }

  const fetchEvals = useCallback(async (pg = 1) => {
    if (!profile?.id) return
    setLoading(true)
    try {
      const isAgent = profile?.role === 'viewer'

      let q = supabase
        .from('evaluations')
        .select('*, scorecards!evaluations_scorecard_id_fkey(name, type, pass_threshold), users(name, email)', { count: 'exact' })
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })

      if (isAgent) {
        q = q.filter('metadata_values', 'cs', JSON.stringify([{ label: "Agent's Email", value: profile.email }]))
      } else if (isPrivileged) {
        // Admins & owners see ALL submitted evaluations; optionally narrowed to one evaluator.
        if (evaluatorFilter) q = q.eq('evaluator_id', evaluatorFilter)
      } else {
        // Evaluators & Team Leaders: hub-level view (matches dashboards & coaching queue).
        const { hubIds } = await getEvaluatorScope(profile.id)
        if (!hubIds.length) { setData([]); setTotal(0); setPage(pg); return }
        q = q.in('hub_id', hubIds)
      }

      const types = activeTypes()
      if (types) q = q.in('evaluation_type', types)

      if (filters.scorecard) q = q.eq('scorecard_id', filters.scorecard)
      if (filters.dateFrom)  q = q.gte('submitted_at', filters.dateFrom)
      if (filters.dateTo)    q = q.lte('submitted_at', filters.dateTo + 'T23:59:59')
      if (filters.status === 'done') q = q.not('agent_read_at', 'is', null)
      if (filters.status === 'pending') q = q.eq('agent_read_required', true).is('agent_read_at', null)

      const evalId = (filters.evalId || '').trim()
      if (evalId) {
        const { data: rows } = await q.limit(2000)
        const filtered = (rows || []).filter(r => String(r.eval_id ?? '').includes(evalId))
        setData(filtered); setTotal(filtered.length); setPage(1)
      } else {
        const { data: rows, count } = await q.range((pg - 1) * LIMIT, pg * LIMIT - 1)
        setData(rows || []); setTotal(count || 0); setPage(pg)
      }
    } finally {
      setLoading(false)
    }
  }, [filters, profile, showQuality, showDsat, evaluatorFilter])

  const openDetail = async (id) => {
    const { data: ev } = await supabase
      .from('evaluations')
      .select('*, scorecards!evaluations_scorecard_id_fkey(name, type, pass_threshold), users(name, email)')
      .eq('id', id)
      .single()
    // Quality evaluations store per-question scores in evaluation_scores.
    // DSAT evaluations store their answers inside metadata_values, so no extra query needed.
    let scores = []
    if (ev?.evaluation_type !== 'dsat') {
      const { data: scoreRows } = await supabase
        .from('evaluation_scores')
        .select('*, scorecard_questions(title, weight, is_weighted, is_form_critical)')
        .eq('evaluation_id', id)
      scores = scoreRows || []
    }
    setDetail({ ...ev, scores })
  }

  const markEvalRead = async () => {
    if (!detail) return
    const now = new Date().toISOString()
    await supabase.rpc('mark_evaluation_read', { p_eval_id: detail.id })
    await supabase.from('notifications').update({ action_done: true, action_done_at: now }).eq('user_id', profile.id).eq('type', 'evaluation_read').eq('entity_id', String(detail.id))
    setDetail(d => ({ ...d, agent_read_at: now }))
  }

  // Helper: get a metadata value by label from the metadata_values array
  const getMeta = (row, label) => {
    if (!row?.metadata_values) return '—'
    const found = row.metadata_values.find(
      m => m.label?.toLowerCase() === label.toLowerCase()
    )
    return found?.value || '—'
  }

  // Shared: fetch evaluations + their per-question scores, then build pivoted rows.
  // Column order: metadata | all question results | all question comments | overall comment
  const buildExportData = async () => {
    const isAgent = profile?.role === 'viewer'
    let q = supabase
      .from('evaluations')
      .select('*, scorecards(name, type), users(name, email)')
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(10000)
    if (isAgent) {
      q = q.filter('metadata_values', 'cs', JSON.stringify([{ label: "Agent's Email", value: profile.email }]))
    } else if (isPrivileged) {
      if (evaluatorFilter) q = q.eq('evaluator_id', evaluatorFilter)
    } else {
      const { hubIds } = await getEvaluatorScope(profile.id)
      if (hubIds.length) q = q.in('hub_id', hubIds); else q = q.eq('id', -1)
    }
    const types = activeTypes()
    if (types) q = q.in('evaluation_type', types)
    const { data: rows } = await q
    const evals = rows || []

    // Fetch all question scores for these evaluations in one query.
    const evalIds = evals.map(e => e.id)
    let scoresByEval = {}
    if (evalIds.length > 0) {
      const { data: scoreRows } = await supabase
        .from('evaluation_scores')
        .select('evaluation_id, score, comment, scorecard_questions(title, position)')
        .in('evaluation_id', evalIds)
      for (const s of (scoreRows || [])) {
        if (!scoresByEval[s.evaluation_id]) scoresByEval[s.evaluation_id] = []
        scoresByEval[s.evaluation_id].push(s)
      }
    }

    // Collect every unique question title, ordered by lowest position then alphabetically.
    const titleOrder = {}
    for (const evId of Object.keys(scoresByEval)) {
      for (const s of scoresByEval[evId]) {
        const title = s.scorecard_questions?.title
        if (!title) continue
        const pos = s.scorecard_questions?.position ?? 999
        if (!(title in titleOrder) || pos < titleOrder[title]) titleOrder[title] = pos
      }
    }
    const questionTitles = Object.keys(titleOrder).sort((a, b) => {
      if (titleOrder[a] !== titleOrder[b]) return titleOrder[a] - titleOrder[b]
      return a.localeCompare(b)
    })

    // pass -> 100%, fail -> 0%, na/other -> blank
    const scoreToPct = (val) => {
      if (val === 'pass') return '100%'
      if (val === 'fail') return '0%'
      return ''
    }

    const exportRows = evals.map(r => {
      const isDsat = r.evaluation_type === 'dsat'
      const myScores = scoresByEval[r.id] || []
      const byTitle = {}
      for (const s of myScores) {
        const t = s.scorecard_questions?.title
        if (t) byTitle[t] = { score: s.score, comment: s.comment }
      }

      const base = {
        'Date':            new Date(r.submitted_at).toLocaleDateString(),
        'Time':            new Date(r.submitted_at).toLocaleTimeString(),
        'Evaluator':       r.users?.name || '\u2014',
        'Scorecard':       r.scorecards?.name || '\u2014',
        'Type':            isDsat ? 'DSAT' : 'Quality',
        'Score':           isDsat ? '\u2014' : `${r.score}%`,
        'Failed Critical': isDsat ? '\u2014' : (r.failed_critical ? 'Yes' : 'No'),
        'Status':          r.status || '\u2014',
        'Agent Read':      isDsat ? '\u2014' : (r.agent_read_required ? (r.agent_read_at ? 'Done' : 'Pending') : '\u2014'),
        ...(r.metadata_values || []).reduce((acc, m) => {
          acc[m.label] = m.value
          return acc
        }, {})
      }

      const resultCols = {}
      for (const title of questionTitles) {
        resultCols[title] = isDsat ? '' : (byTitle[title] ? scoreToPct(byTitle[title].score) : '')
      }

      const commentCols = {}
      for (const title of questionTitles) {
        commentCols[`${title} \u2014 Comment`] = isDsat ? '' : (byTitle[title]?.comment || '')
      }

      return {
        ...base,
        ...resultCols,
        ...commentCols,
        'Overall Comment': isDsat ? '' : (r.overall_comment || '')
      }
    })

    // Build full header set so every column appears even if row 1 lacks some questions.
    const headerSet = []
    const seen = new Set()
    for (const row of exportRows) {
      for (const k of Object.keys(row)) {
        if (!seen.has(k)) { seen.add(k); headerSet.push(k) }
      }
    }
    return { exportRows, headerSet }
  }

  const exportCSV = async () => {
    const { exportRows, headerSet } = await buildExportData()
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: headerSet })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'csv' })
    saveAs(new Blob([buf], { type: 'text/csv' }), 'quark_evaluations.csv')
  }

  const exportXLSX = async () => {
    const { exportRows, headerSet } = await buildExportData()
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: headerSet })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'quark_evaluations.xlsx')
  }

  const scoreColor = (score, failed) => {
    if (failed) return 'var(--danger)'
    if (score >= 80) return 'var(--success)'
    if (score >= 60) return '#f59e0b'
    return 'var(--danger)'
  }

  // Edit windows differ by scorecard type:
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
  }

  // Toggle pill button — ticked + grayed when active
  const TypeToggle = ({ label, active, onClick }) => (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        cursor: 'pointer', border: '1.5px solid',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--bg-secondary)' : 'transparent',
        color: active ? 'var(--text-secondary)' : 'var(--text-primary)',
        transition: 'all 0.15s'
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4,
        border: '1.5px solid',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#fff', lineHeight: 1
      }}>
        {active ? '✓' : ''}
      </span>
      {label}
    </button>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Evaluations</h1>
          <p className="page-sub">{total.toLocaleString()} {profile?.role === 'viewer' ? 'evaluations on your interactions' : isPrivileged ? 'evaluations (all evaluators)' : profile?.role === 'team_leader' ? 'evaluations in your scope' : 'of your evaluations'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isAgent && <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>}
          {!isAgent && <button className="btn btn-outline" onClick={exportXLSX}>Export Excel</button>}
          {!['viewer', 'team_leader'].includes(profile?.role) && (
            <button
              className="btn btn-ghost"
              style={{
                opacity: drafts.length === 0 ? 0.4 : 1,
                cursor: drafts.length === 0 ? 'default' : 'pointer',
                pointerEvents: drafts.length === 0 ? 'none' : 'auto'
              }}
              onClick={() => { loadDrafts(); setShowDrafts(true) }}
              disabled={drafts.length === 0}
            >
              {drafts.length > 0 ? `Drafts (${drafts.length})` : 'Drafts'}
            </button>
          )}
          {!['viewer', 'team_leader'].includes(profile?.role) && (
              <button className="btn btn-primary" onClick={() => navigate('/evaluations/new')}>
                + New Evaluation
              </button>
            )}
        </div>
      </div>

      <div className="filter-bar">
        <select className="select" value={filters.scorecard}
          onChange={e => setFilters(f => ({ ...f, scorecard: e.target.value }))}>
          <option value="">All scorecards</option>
          {scorecards.map(sc => (
            <option key={sc.id} value={sc.id}>{sc.name}</option>
          ))}
        </select>
        <input type="text" className="input" placeholder="Search Evaluation ID..." value={filters.evalId || ''}
          onChange={e => setFilters(f => ({ ...f, evalId: e.target.value }))} style={{ maxWidth: 180 }} />
        <select className="select" value={filters.status || ''}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="done">Done</option>
        </select>
        {!isAgent && (
          <select className="select" value={evaluatorFilter}
            onChange={e => setEvaluatorFilter(e.target.value)}>
            <option value="">All evaluators</option>
            {evaluatorList.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.email || ev.name || 'Unknown'}</option>
            ))}
          </select>
        )}
        <input type="date" className="input" value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        <input type="date" className="input" value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        <button className="btn btn-primary" onClick={() => fetchEvals(1)}>Apply</button>
        <button className="btn btn-ghost" onClick={() => {
          // Clearing evaluatorFilter triggers the fetchEvals effect (it's a dependency),
          // so we don't manually refetch here — doing so would read a stale filter value.
          setFilters({ search: '', dateFrom: '', dateTo: '', scorecard: '', evalId: '', status: '' })
          setEvaluatorFilter('')
        }}>Clear</button>

        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <TypeToggle label="Quality" active={showQuality} onClick={() => setShowQuality(v => !v)} />
          <TypeToggle label="DSAT"    active={showDsat}    onClick={() => setShowDsat(v => !v)} />
        </div>
      </div>

      {loading ? (
        <div className="loader-row"><div className="spinner" /></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Evaluator</th>
                <th>Scorecard</th>
                <th>Score</th>
                <th>Result</th>
                <th>Read</th>
                {!isAgent && <th>Last Edited</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan={isAgent ? 8 : 9} className="empty-row">No evaluations yet. Start one with + New Evaluation.</td></tr>
              )}
              {data.map(ev => {
                const isDsat = ev.evaluation_type === 'dsat'
                const passThreshold = ev.scorecards?.pass_threshold ?? 90
                const passed = ev.score >= passThreshold
                return (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'monospace' }}>
                      #{ev.eval_id || '—'}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {new Date(ev.submitted_at).toLocaleDateString()}
                    </td>
                    <td>{ev.users?.name || '—'}</td>
                    <td>
                      <span>{ev.scorecards?.name || '—'}</span>
                      {isDsat && (
                        <span style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 600,
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(239,68,68,0.12)',
                          color: 'var(--danger)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          textTransform: 'uppercase'
                        }}>DSAT</span>
                      )}
                      {ev.scorecard_version && (
                        <span style={{
                          marginLeft: 6, fontSize: 11, fontWeight: 600,
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(99,102,241,0.12)',
                          color: 'var(--accent)',
                          border: '1px solid rgba(99,102,241,0.3)'
                        }}>v{ev.scorecard_version}</span>
                      )}
                    </td>
                    <td>
                      {isDsat ? (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      ) : (
                        <span style={{ fontWeight: 600, color: (passed ? 'var(--success)' : 'var(--danger)') }}>
                          {`${ev.score}%`}
                        </span>
                      )}
                    </td>
                    <td>
                      {isDsat ? (
                        <span style={{ color: 'var(--text-secondary)' }}>—</span>
                      ) : (
                        <span className={`badge ${passed ? 'badge-pass' : 'badge-fail'}`}>
                          {passed ? 'PASS' : 'FAIL'}
                        </span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const rs = isDsat || !ev.agent_read_required ? null : (ev.agent_read_at ? 'Done' : 'Pending')
                        if (!rs) return <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        const done = rs === 'Done'
                        return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: done ? '#22c55e22' : '#f59e0b22', color: done ? '#16a34a' : '#f59e0b' }}>{rs}</span>
                      })()}
                    </td>
                    {!isAgent && (
                      <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                        {ev.last_edit_date ? new Date(ev.last_edit_date).toLocaleDateString() : '—'}
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ev.id)}>
                          View
                        </button>
                        {canEdit(ev) && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}
                            onClick={() => navigate('/evaluations/new', { state: { editEval: ev.id } })}>
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <button className="btn btn-ghost btn-sm"
          disabled={page === 1} onClick={() => fetchEvals(page - 1)}>← Prev</button>
        <span>Page {page} of {Math.max(1, Math.ceil(total / LIMIT))}</span>
        <button className="btn btn-ghost btn-sm"
          disabled={page * LIMIT >= total} onClick={() => fetchEvals(page + 1)}>Next →</button>
      </div>

      {/* DRAFTS MODAL */}
      {showDrafts && (
        <div className="modal-backdrop" onClick={() => setShowDrafts(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Draft Evaluations</h2>
              <button className="btn-close" onClick={() => setShowDrafts(false)}>✕</button>
            </div>
            <div className="modal-body">
              {drafts.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
                  No draft evaluations.
                </p>
              ) : (
                drafts.map(draft => {
                  const state = draft.draft_state
                  const stepLabel = state?.step === 'metadata' ? 'Stopped at: Interaction Details'
                    : state?.step === 'questions' ? 'Stopped at: Questions'
                    : 'In progress'
                  return (
                    <div key={draft.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 0', borderBottom: '1px solid var(--border)'
                    }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {draft.eval_id && (
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', marginRight: 6 }}>
                              #{draft.eval_id}
                            </span>
                          )}
                          {draft.scorecards?.name || 'Unknown Scorecard'}
                          <span style={{
                            marginLeft: 8, fontSize: 11, fontWeight: 600,
                            padding: '2px 6px', borderRadius: 4,
                            background: draft.scorecards?.type === 'dsat' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
                            color: draft.scorecards?.type === 'dsat' ? 'var(--danger)' : 'var(--accent)',
                            textTransform: 'uppercase'
                          }}>
                            {draft.scorecards?.type === 'dsat' ? 'DSAT' : 'Quality'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {stepLabel} · Saved {new Date(draft.submitted_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setShowDrafts(false)
                            navigate('/evaluations/new', { state: { draft } })
                          }}
                        >
                          Resume
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => deleteDraft(draft.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Evaluation Detail</h2>
              <button className="btn-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">

              {profile?.role === 'viewer' && detail.agent_read_required && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: detail.agent_read_at ? 'rgba(22,163,74,0.1)' : 'rgba(245,158,11,0.12)',
                  border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <span style={{ fontSize: 13 }}>
                    {detail.agent_read_at ? '✓ You confirmed you have read this evaluation.' : 'Please confirm you have read this evaluation.'}
                  </span>
                  {!detail.agent_read_at && <button className="btn btn-primary btn-sm" onClick={markEvalRead}>Done</button>}
                </div>
              )}

              {/* Metadata values */}
              <div className="detail-meta">
                <span><b>ID:</b> #{detail.eval_id || '—'}</span>
                <span>
                  <b>Scorecard:</b> {detail.scorecards?.name}
                  {detail.evaluation_type === 'dsat' && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, fontWeight: 600,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(239,68,68,0.12)',
                      color: 'var(--danger)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      textTransform: 'uppercase'
                    }}>DSAT</span>
                  )}
                  {detail.scorecard_version && (
                    <span style={{
                      marginLeft: 6, fontSize: 11, fontWeight: 600,
                      padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(99,102,241,0.12)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(99,102,241,0.3)'
                    }}>v{detail.scorecard_version}</span>
                  )}
                </span>
                <span><b>Evaluator:</b> {detail.users?.name}</span>
                <span><b>Date:</b> {new Date(detail.submitted_at).toLocaleString()}</span>
              </div>

              <hr />

              {detail.evaluation_type === 'dsat' ? (
                /* DSAT detail — answers live in metadata_values */
                <div className="detail-scores">
                  {(detail.metadata_values || []).length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      No recorded answers for this DSAT evaluation.
                    </p>
                  ) : (
                    (detail.metadata_values || []).map((m, i) => (
                      <div key={i} className="score-row-detail" style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          {m.label}
                        </div>
                        <div style={{
                          fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)',
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          borderRadius: 8, padding: '8px 12px', whiteSpace: 'pre-wrap'
                        }}>
                          {m.value || '—'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* Quality detail — per-question scores + overall comment + final score */
                <>
                  {/* Metadata values (quality) */}
                  <div className="detail-meta" style={{ marginBottom: 16 }}>
                    {(detail.metadata_values || []).map((m, i) => (
                      <span key={i}><b>{m.label}:</b> {m.value || '—'}</span>
                    ))}
                  </div>

                  <div className="detail-scores">
                    {detail.scores.map((s, i) => (
                      <div key={i} className="score-row-detail">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="score-criterion">
                            {s.scorecard_questions?.title || '—'}
                            {s.scorecard_questions?.is_form_critical && (
                              <span className="badge badge-fail" style={{ marginLeft: 8, fontSize: 11 }}>
                                Form Critical
                              </span>
                            )}
                          </div>
                          <span className={`badge ${
                            s.score === 'pass' ? 'badge-pass' :
                            s.score === 'fail' ? 'badge-fail' : 'badge-channel'
                          }`}>
                            {s.score?.toUpperCase() || 'N/A'}
                          </span>
                        </div>
                        {s.comment && (
                          <div className="score-comment" style={{ marginTop: 4 }}>"{s.comment}"</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <hr />

                  {/* Overall comment */}
                  {detail.overall_comment && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                        Overall Comment
                      </div>
                      <div style={{
                        fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)',
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '10px 12px', whiteSpace: 'pre-wrap'
                      }}>
                        {detail.overall_comment}
                      </div>
                    </div>
                  )}

                  {/* Final score */}
                  <div className="detail-total">
                    <span style={{ fontSize: 16 }}>
                      Final Score:{' '}
                      <b style={{ color: scoreColor(detail.score, detail.failed_critical) }}>
                        {detail.failed_critical ? '0%' : `${detail.score}%`}
                      </b>
                    </span>
                    <span className={`badge ${detail.score >= (detail.scorecards?.pass_threshold ?? 90) ? 'badge-pass' : 'badge-fail'}`}>
                      {detail.score >= (detail.scorecards?.pass_threshold ?? 90) ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                  {detail.failed_critical && (
                    <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>
                      A form-critical question was failed — score overridden to 0%.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
