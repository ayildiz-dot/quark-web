import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

const TYPE_LABELS = {
  save:      { label: 'Saved',       color: 'var(--accent)' },
  publish:   { label: 'Published',   color: 'var(--success)' },
  unpublish: { label: 'Unpublished', color: 'var(--danger)' },
  restore:   { label: 'Restored',    color: '#a855f7' },
}

export default function ScorecardHistory() {
  const { id } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [history, setHistory]     = useState([])
  const [scorecard, setScorecard] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [restoring, setRestoring] = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [msg, setMsg]             = useState(null)

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    setLoading(true)
    const [{ data: sc }, { data: hist }] = await Promise.all([
      supabase.from('scorecards').select('*').eq('id', id).single(),
      supabase.from('scorecard_history')
        .select('*, users(name, email)')
        .eq('scorecard_id', id)
        .order('changed_at', { ascending: false })
    ])
    setScorecard(sc)
    setHistory(hist || [])
    setLoading(false)
  }

  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    if (ok) setTimeout(() => setMsg(null), 4000)
  }

  const loadVersion = async (entry) => {
    if (!confirm(`Load the version from ${new Date(entry.changed_at).toLocaleString()}? This will overwrite the current scorecard settings and questions.`)) return
    setRestoring(entry.id)
    try {
      const snap = entry.snapshot
      await supabase.from('scorecards').update({
        name: snap.scorecard.name,
        description: snap.scorecard.description,
        updated_at: new Date().toISOString()
      }).eq('id', id)

      const { data: existingQs } = await supabase
        .from('scorecard_questions')
        .select('id')
        .eq('scorecard_id', id)

      await Promise.all((snap.questions || []).map((q, i) => {
        const existing = existingQs?.[i]
        if (existing) {
          return supabase.from('scorecard_questions').update({
            title: q.title, weight: q.weight, description: q.description,
            is_form_critical: q.is_form_critical, allow_na: q.allow_na,
            position: i + 1
          }).eq('id', existing.id)
        }
        return supabase.from('scorecard_questions').insert({
          scorecard_id: id, title: q.title, weight: q.weight,
          description: q.description, is_form_critical: q.is_form_critical,
          allow_na: q.allow_na, position: i + 1
        })
      }))

      await supabase.from('scorecard_history').insert({
        scorecard_id: id,
        changed_by: profile.id,
        change_type: 'restore',
        changed_at: new Date().toISOString(),
        snapshot: snap
      })

      flash('Version restored successfully ✓')
      await loadData()
    } catch (e) {
      flash('Restore failed: ' + e.message, false)
    }
    setRestoring(null)
  }

  if (loading) return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40 }}>
        <div className="spinner" />
        <span>Loading history…</span>
      </div>
    </div>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => navigate(`/scorecards/${id}/edit`)}>
            ← Back to Scorecard
          </button>
          <h1>Change History</h1>
          <p className="page-sub">{scorecard?.name}</p>
        </div>
      </div>

      {msg && <div className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}

      {history.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>
          No history recorded yet. Changes will appear here after the next save or publish.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Version</th>
                <th>Reason</th>
                <th>Scorecard Name</th>
                <th>Questions</th>
                <th>Snapshot</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => {
                const typeInfo = TYPE_LABELS[entry.change_type] || { label: entry.change_type, color: 'var(--text-secondary)' }
                const snap = entry.snapshot
                const isExpanded = expanded === entry.id
                return (
                  <>
                    <tr key={entry.id} style={{ opacity: restoring === entry.id ? 0.5 : 1 }}>
                      <td style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <div>{new Date(entry.changed_at).toLocaleDateString()}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {new Date(entry.changed_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td>{entry.users?.name || entry.users?.email || '—'}</td>
                      <td>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '3px 10px',
                          borderRadius: 20, border: `1px solid ${typeInfo.color}`,
                          color: typeInfo.color
                        }}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                        {entry.version_number
                          ? <span style={{ fontWeight: 600, color: 'var(--accent)' }}>v{entry.version_number}</span>
                          : <span style={{ fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {entry.version_reason
                          ? <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{entry.version_reason}</span>
                          : <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td>{snap?.scorecard?.name || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {snap?.questions?.length ?? 0} question{snap?.questions?.length !== 1 ? 's' : ''}
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => setExpanded(isExpanded ? null : entry.id)}>
                          {isExpanded ? 'Hide ▲' : 'View ▼'}
                        </button>
                      </td>
                      <td>
                        {i !== 0 ? (
                          <button className="btn btn-primary btn-sm"
                            disabled={restoring === entry.id}
                            onClick={() => loadVersion(entry)}>
                            {restoring === entry.id ? 'Restoring…' : 'Load version'}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Current</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={entry.id + '-exp'}>
                        <td colSpan="9" style={{ background: 'var(--bg-secondary)', padding: '12px 20px' }}>
                          <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600 }}>Questions in this version:</div>
                          {(snap?.questions || []).length === 0
                            ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No questions recorded.</div>
                            : snap.questions.map((q, qi) => (
                                <div key={qi} style={{
                                  display: 'flex', gap: 12, alignItems: 'baseline',
                                  padding: '6px 0', borderBottom: '1px solid var(--border)',
                                  fontSize: 13
                                }}>
                                  <span style={{ color: 'var(--text-secondary)', minWidth: 20 }}>{qi + 1}.</span>
                                  <span style={{ flex: 1 }}>{q.title}</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>Weight: {q.weight}</span>
                                  {q.is_form_critical && <span style={{ color: 'var(--danger)', fontSize: 11 }}>Critical</span>}
                                </div>
                              ))
                          }
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
