import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
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
    search: '', dateFrom: '', dateTo: '', scorecard: ''
  })
  const [scorecards, setScorecards] = useState([])
  const [drafts, setDrafts] = useState([])
  const [showDrafts, setShowDrafts] = useState(false)
  const LIMIT = 50

  useEffect(() => {
    loadScorecards()
    fetchEvals(1)
    loadDrafts()
  }, [])

  const loadDrafts = async () => {
    const { data } = await supabase
      .from('evaluations')
      .select('*, scorecards(name, type)')
      .eq('status', 'draft')
      .eq('evaluator_id', profile.id)
      .order('submitted_at', { ascending: false })
    setDrafts(data || [])
  }

  const deleteDraft = async (id) => {
    await supabase.from('evaluations').delete().eq('id', id)
    setDrafts(d => d.filter(dr => dr.id !== id))
  }

  const loadScorecards = async () => {
    const { data } = await supabase
      .from('scorecards')
      .select('id, name')
      .eq('is_published', true)
      .order('name')
    setScorecards(data || [])
  }

  const fetchEvals = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      let q = supabase
        .from('evaluations')
        .select('*, scorecards(name), users(name, email)', { count: 'exact' })
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false })
        .range((pg - 1) * LIMIT, pg * LIMIT - 1)

      if (filters.scorecard) q = q.eq('scorecard_id', filters.scorecard)
      if (filters.dateFrom)  q = q.gte('submitted_at', filters.dateFrom)
      if (filters.dateTo)    q = q.lte('submitted_at', filters.dateTo + 'T23:59:59')

      const { data: rows, count } = await q
      setData(rows || [])
      setTotal(count || 0)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const openDetail = async (id) => {
    const { data: ev } = await supabase
      .from('evaluations')
      .select('*, scorecards(name), users(name, email)')
      .eq('id', id)
      .single()
    const { data: scores } = await supabase
      .from('evaluation_scores')
      .select('*, scorecard_questions(title, weight, is_weighted, is_form_critical)')
      .eq('evaluation_id', id)
    setDetail({ ...ev, scores: scores || [] })
  }

  // Helper: get a metadata value by label from the metadata_values array
  const getMeta = (row, label) => {
    if (!row?.metadata_values) return '—'
    const found = row.metadata_values.find(
      m => m.label?.toLowerCase() === label.toLowerCase()
    )
    return found?.value || '—'
  }

  const exportCSV = async () => {
    const { data: rows } = await supabase
      .from('evaluations')
      .select('*, scorecards(name), users(name, email)')
      .order('submitted_at', { ascending: false })
      .limit(10000)
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Date':          new Date(r.submitted_at).toLocaleDateString(),
      'Time':          new Date(r.submitted_at).toLocaleTimeString(),
      'Evaluator':     r.users?.name || '—',
      'Scorecard':     r.scorecards?.name || '—',
      'Score':         `${r.score}%`,
      'Failed Critical': r.failed_critical ? 'Yes' : 'No',
      'Status':        r.status || '—',
      ...(r.metadata_values || []).reduce((acc, m) => {
        acc[m.label] = m.value
        return acc
      }, {})
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'csv' })
    saveAs(new Blob([buf], { type: 'text/csv' }), 'quark_evaluations.csv')
  }

  const exportXLSX = async () => {
    const { data: rows } = await supabase
      .from('evaluations')
      .select('*, scorecards(name), users(name, email)')
      .order('submitted_at', { ascending: false })
      .limit(10000)
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Date':          new Date(r.submitted_at).toLocaleDateString(),
      'Time':          new Date(r.submitted_at).toLocaleTimeString(),
      'Evaluator':     r.users?.name || '—',
      'Scorecard':     r.scorecards?.name || '—',
      'Score':         `${r.score}%`,
      'Failed Critical': r.failed_critical ? 'Yes' : 'No',
      'Status':        r.status || '—',
      ...(r.metadata_values || []).reduce((acc, m) => {
        acc[m.label] = m.value
        return acc
      }, {})
    })))
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Evaluations</h1>
          <p className="page-sub">{total.toLocaleString()} total records</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-outline" onClick={exportXLSX}>Export Excel</button>
          <button
              className="btn btn-ghost"
              style={{
                opacity: drafts.length === 0 ? 0.4 : 1,
                cursor: drafts.length === 0 ? 'default' : 'pointer',
                pointerEvents: drafts.length === 0 ? 'none' : 'auto'
              }}
              onClick={() => setShowDrafts(true)}
              disabled={drafts.length === 0}
            >
              {drafts.length > 0 ? `Drafts (${drafts.length})` : 'Drafts'}
            </button>
          {profile?.role !== 'viewer' && (
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
        <input type="date" className="input" value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        <input type="date" className="input" value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        <button className="btn btn-primary" onClick={() => fetchEvals(1)}>Apply</button>
        <button className="btn btn-ghost" onClick={() => {
          setFilters({ search: '', dateFrom: '', dateTo: '', scorecard: '' })
          setTimeout(() => fetchEvals(1), 0)
        }}>Clear</button>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan="6" className="empty-row">No evaluations yet. Start one with + New Evaluation.</td></tr>
              )}
              {data.map(ev => (
                <tr key={ev.id}>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'monospace' }}>
                    #{ev.eval_id || '—'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(ev.submitted_at).toLocaleDateString()}
                  </td>
                  <td>{ev.users?.name || '—'}</td>
                  <td>{ev.scorecards?.name || '—'}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: scoreColor(ev.score, ev.failed_critical) }}>
                      {ev.failed_critical ? '0%' : `${ev.score}%`}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${ev.failed_critical || ev.score < 80 ? 'badge-fail' : 'badge-pass'}`}>
                      {ev.failed_critical || ev.score < 80 ? 'FAIL' : 'PASS'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetail(ev.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
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

              {/* Metadata values */}
              <div className="detail-meta">
                <span><b>ID:</b> #{detail.eval_id || '—'}</span>
                <span><b>Scorecard:</b> {detail.scorecards?.name}</span>
                <span><b>Evaluator:</b> {detail.users?.name}</span>
                <span><b>Date:</b> {new Date(detail.submitted_at).toLocaleString()}</span>
                {(detail.metadata_values || []).map((m, i) => (
                  <span key={i}><b>{m.label}:</b> {m.value || '—'}</span>
                ))}
              </div>

              <hr />

              {/* Question scores */}
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

              {/* Final score */}
              <div className="detail-total">
                <span style={{ fontSize: 16 }}>
                  Final Score:{' '}
                  <b style={{ color: scoreColor(detail.score, detail.failed_critical) }}>
                    {detail.failed_critical ? '0%' : `${detail.score}%`}
                  </b>
                </span>
                <span className={`badge ${detail.failed_critical || detail.score < 80 ? 'badge-fail' : 'badge-pass'}`}>
                  {detail.failed_critical || detail.score < 80 ? 'FAIL' : 'PASS'}
                </span>
              </div>
              {detail.failed_critical && (
                <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>
                  A form-critical question was failed — score overridden to 0%.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
