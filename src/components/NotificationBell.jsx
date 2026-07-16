import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../App'
import { supabase } from '../lib/supabase'

// Notification bell + dropdown panel. Lives in the Navbar next to the account button.
// Reads from the `notifications` table (RLS scopes each user to their own rows).
export default function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen]   = useState(false)
  const [items, setItems] = useState([])
  const ref = useRef(null)

  const isCoach = ['owner', 'admin', 'evaluator', 'team_leader'].includes(profile?.role)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => { if (profile?.id) init() /* eslint-disable-next-line */ }, [profile?.id])
  useEffect(() => {
    if (!profile?.id) return
    const t = setInterval(() => load(), 60000)
    return () => clearInterval(t)
    // eslint-disable-next-line
  }, [profile?.id])

  async function init() {
    await generateDueReminders()
    await load()
  }

  async function load() {
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(50)
    setItems(data || [])
  }

  // Reminder for the session creator: their own Active / Pending-verification observation
  // sessions that have reached their suggested close date. De-duplicated so each session
  // only ever generates one 'coaching_due' notification. Purely a reminder — never forces
  // the session closed.
  async function generateDueReminders() {
    if (!isCoach) return
    const today = new Date().toISOString().split('T')[0]
    const { data: due } = await supabase.from('coaching_sessions')
      .select('id, planned_close_date, status, agent:users!coaching_sessions_agent_id_fkey(name)')
      .eq('coach_id', profile.id)
      .in('status', ['active', 'pending_verification'])
      .not('planned_close_date', 'is', null)
      .lte('planned_close_date', today)
    const sessions = due || []
    if (!sessions.length) return
    const ids = sessions.map(s => String(s.id))
    const { data: existing } = await supabase.from('notifications')
      .select('entity_id').eq('user_id', profile.id).eq('type', 'coaching_due').in('entity_id', ids)
    const have = new Set((existing || []).map(e => e.entity_id))
    const toInsert = sessions.filter(s => !have.has(String(s.id))).map(s => ({
      user_id: profile.id,
      type: 'coaching_due',
      title: 'Observation session due to close',
      body: `Your session for ${s.agent?.name || 'an agent'} has reached its suggested close date.`,
      link: '/coaching',
      entity_type: 'coaching_session',
      entity_id: String(s.id),
    }))
    if (toInsert.length) await supabase.from('notifications').insert(toInsert)
  }

  const unread = items.filter(i => !i.is_read).length

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next && unread > 0) {
      const ids = items.filter(i => !i.is_read).map(i => i.id)
      await supabase.from('notifications').update({ is_read: true }).in('id', ids)
      setItems(items.map(i => ({ ...i, is_read: true })))
    }
  }

  async function markActionDone(item) {
    if (item.type === 'evaluation_read' && item.entity_id) {
      await supabase.rpc('mark_evaluation_read', { p_eval_id: Number(item.entity_id) })
    }
    if (item.type === 'eval_coaching' && item.entity_id) {
      await supabase.from('eval_coachings').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', item.entity_id)
    }
    // Once actioned, remove the notification entirely so it disappears from the bell.
    await supabase.from('notifications').delete().eq('id', item.id)
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  function clickItem(item) {
    if (item.link) { setOpen(false); navigate(item.link) }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={toggleOpen} title="Notifications" style={{
        width: 38, height: 38, borderRadius: '50%', border: '1px solid var(--border)',
        background: open ? 'var(--bg-hover)' : 'transparent', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0,
        color: 'var(--text-secondary)',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 4px',
            borderRadius: 9, background: 'var(--danger, #ef4444)', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 320, maxHeight: 420, overflowY: 'auto',
          zIndex: 300, background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700,
            color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Notifications
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>You're all caught up.</div>
          ) : items.map(it => (
            <div key={it.id} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)',
              background: it.is_read ? 'transparent' : 'var(--bg-secondary)' }}>
              <div onClick={() => clickItem(it)} style={{ cursor: it.link ? 'pointer' : 'default' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{it.title}</div>
                {it.body && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{it.body}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{new Date(it.created_at).toLocaleString()}</div>
              </div>
              {it.requires_action && !it.action_done && (
                <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }}
                  onClick={() => markActionDone(it)}>
                  {it.type === 'evaluation_read' ? 'Done' : 'Acknowledge'}
                </button>
              )}
              {it.requires_action && it.action_done && (
                <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 6 }}>✓ Done</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
