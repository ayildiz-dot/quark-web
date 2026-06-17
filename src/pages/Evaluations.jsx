import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'

export default function Evaluations() {
  const [data,    setData]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)
  const [detail,  setDetail]  = useState(null)
  const [filters, setFilters] = useState({
    search: '', channel: '', passFail: '', dateFrom: '', dateTo: ''
  })
  const LIMIT = 50

  const fetchEvals = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      let q = supabase
        .from('evaluations')
        .select('*, users(name, email)', { count: 'exact' })
        .order('submitted_at', { ascending: false })
        .range((pg - 1) * LIMIT, pg * LIMIT - 1)

      if (filters.channel)  q = q.eq('channel', filters.channel)
      if (filters.passFail) q = q.eq('pass_fail', filters.passFail)
      if (filters.dateFrom) q = q.gte('submitted_at', filters.dateFrom)
      if (filters.dateTo)   q = q.lte('submitted_at', filters.dateTo + 'T23:59:59')
      if (filters.search)   q = q.or(`agent_name.ilike.%${filters.search}%,interaction_id.ilike.%${filters.search}%`)

      const { data: rows, count } = await q
      setData(rows || [])
      setTotal(count || 0)
      setPage(pg)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { fetchEvals(1) }, [])

  const openDetail = async (id) => {
    const { data: ev } = await supabase
      .from('evaluations')
      .select('*, users(name, email)')
      .eq('id', id)
      .single()
    const { data: scores } = await supabase
      .from('evaluation_scores')
      .select('*, criteria(name, max_score)')
      .eq('evaluation_id', id)
    setDetail({ ...ev, scores: scores || [] })
  }

  const exportCSV = async () => {
    const { data: rows } = await supabase
      .from('evaluations')
      .select('*, users(name, email)')
      .order('submitted_at', { ascending: false })
      .limit(10000)
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Date':            new Date(r.submitted_at).toLocaleDateString(),
      'Time':            new Date(r.submitted_at).toLocaleTimeString(),
      'Evaluator':       r.users?.name,
      'Evaluator Email': r.users?.email,
      'Agent':           r.agent_name,
      'Interaction ID':  r.interaction_id,
      'Channel':         r.channel,
      'Language':        r.language || '—',
      'Score':           `${r.total_score}/${r.max_score}`,
      'Percentage':      `${r.percentage}%`,
      'Pass/Fail':       r.pass_fail?.toUpperCase(),
      'Notes':           r.overall_notes || ''
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'csv' })
    saveAs(new Blob([buf], { type: 'text/csv' }), 'quark_evaluations.csv')
  }

  const exportXLSX = async () => {
    const { data: rows } = await supabase
      .from('evaluations')
      .select('*, users(name, email)')
      .order('submitted_at', { ascending: false })
      .limit(10000)
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Date':            new Date(r.submitted_at).toLocaleDateString(),
      'Time':            new Date(r.submitted_at).toLocaleTimeString(),
      'Evaluator':       r.users?.name,
      'Evaluator Email': r.users?.email,
      'Agent':           r.agent_name,
      'Interaction ID':  r.interaction_id,
      'Channel':         r.channel,
      'Language':        r.language || '—',
      'Score':           `${r.total_score}/${r.max_score}`,
      'Percentage':      `${r.percentage}%`,
      'Pass/Fail':       r.pass_fail?.toUpperCase(),
      'Notes':           r.overall_notes || ''
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'quark_evaluations.xlsx')
  }

  const pf = (val) => (
    <span className={`badge badge-${val === 'pass' ? 'pass' : val === 'fail' ? 'fail' : 'neutral'}`}>
      {val?.toUpperCase()}
    </span>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Evaluations</h1>
          <p className="page-sub">{total.toLocaleString()} total records</p>
        </div>
        <div className="btn-group">
          <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
          <button className="btn btn-outline" onClick={exportXLSX}>Export Excel</button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="input" placeholder="Search agent or interaction ID…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ flex: 1, minWidth: 200 }} />
        <select className="select" value={filters.channel}
          onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}>
          <option value="">All channels</option>
          <option value="chat">Chat</option>
          <option value="email">Email</option>
        </select>
        <select className="select" value={filters.passFail}
          onChange={e => setFilters(f => ({ ...f, passFail: e.target.value }))}>
          <option value="">Pass &amp; Fail</option>
          <option value="pass">Pass</option>
          <option value="fail">Fail</option>
        </select>
        <input type="date" className="input" value={filters.dateFrom}
          onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
        <input type="date" className="input" value={filters.dateTo}
          onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
        <button className="btn btn-primary" onClick={() => fetchEvals(1)}>Apply</button>
        <button className="btn btn-ghost" onClick={() => {
          setFilters({ search: '', channel: '', passFail: '', dateFrom: '', dateTo: '' })
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
                <th>Date</th>
                <th>Evaluator</th>
                <th>Agent</th>
                <th>Interaction ID</th>
                <th>Channel</th>
                <th>Language</th>
                <th>Score</th>
                <th>%</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr><td colSpan="10" className="empty-row">No evaluations found.</td></tr>
              )}
              {data.map(ev => (
                <tr key={ev.id}>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {new Date(ev.submitted_at).toLocaleDateString()}
                  </td>
                  <td>{ev.users?.name || '—'}</td>
                  <td>{ev.agent_name}</td>
                  <td><code>{ev.interaction_id}</code></td>
                  <td><span className="badge badge-channel">{ev.channel}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{ev.language || '—'}</td>
                  <td>{ev.total_score}/{ev.max_score}</td>
                  <td>{ev.percentage}%</td>
                  <td>{pf(ev.pass_fail)}</td>
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

      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Evaluation #{detail.id}</h2>
              <button className="btn-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="detail-meta">
                <span><b>Agent:</b> {detail.agent_name}</span>
                <span><b>Evaluator:</b> {detail.users?.name}</span>
                <span><b>Channel:</b> {detail.channel}</span>
                <span><b>Language:</b> {detail.language || '—'}</span>
                <span><b>Interaction ID:</b> {detail.interaction_id}</span>
                <span><b>Date:</b> {new Date(detail.submitted_at).toLocaleString()}</span>
              </div>
              <hr />
              <div className="detail-scores">
                {detail.scores.map((s, i) => (
                  <div key={i} className="score-row-detail">
                    <div className="score-criterion">{s.criteria?.name}</div>
                    <div className="score-val">{s.score ?? 'N/A'} / {s.criteria?.max_score}</div>
                    {s.comment && <div className="score-comment">"{s.comment}"</div>}
                  </div>
                ))}
              </div>
              <div className="detail-total">
                <span>Total: <b>{detail.total_score}/{detail.max_score}</b> ({detail.percentage}%)</span>
                {pf(detail.pass_fail)}
              </div>
              {detail.overall_notes && (
                <div className="detail-notes"><b>Notes:</b> {detail.overall_notes}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}