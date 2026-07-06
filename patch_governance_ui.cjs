const fs = require('fs');
const path = 'src/pages/Admin.jsx';
let content = fs.readFileSync(path, 'utf8');
let ok = true;

function patch(label, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    console.log(`❌ ${label}: anchor not found`);
    ok = false;
    return;
  }
  content = content.replace(oldStr, newStr);
  console.log(`✅ ${label}`);
}

// 0. Add useRef to imports (needed by the new kebab menu)
patch('Add useRef import',
`import { useState, useEffect, useMemo } from 'react'`,
`import { useState, useEffect, useMemo, useRef } from 'react'`
);

// 1. Insert RowMenu component (kebab menu for hub/workspace rows)
patch('Insert RowMenu component',
`}

// ─── User Management Tab ───────────────────────────────────────────────────────
function UsersTab({ profile, flash }) {`,
`}

// ─── Row Menu (kebab menu for rare/destructive actions) ────────────────────────
function RowMenu({ isActive, onToggleActive, onDelete, activeLabel = 'Deactivate', inactiveLabel = 'Activate' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const itemStyle = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
    fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn btn-ghost btn-sm"
        style={{ padding: '4px 9px', fontSize: 15, lineHeight: 1, color: 'var(--text-secondary)' }}
        title="More actions">
        ⋮
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 60, minWidth: 150,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden',
        }}>
          <button
            style={{ ...itemStyle, color: isActive ? 'var(--danger)' : 'var(--success)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
            onClick={() => { setOpen(false); onToggleActive() }}>
            {isActive ? activeLabel : inactiveLabel}
          </button>
          {!isActive && onDelete && (
            <button
              style={{ ...itemStyle, color: 'var(--danger)', borderTop: '1px solid var(--border)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              onClick={() => { setOpen(false); onDelete() }}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── User Management Tab ───────────────────────────────────────────────────────
function UsersTab({ profile, flash }) {`
);

// 2. QueueMappingPanel: accept toggle/delete handlers
patch('QueueMappingPanel signature',
`function QueueMappingPanel({ queue, hub, ws, scorecards, scMarkets, profile, flash, onMappingSaved }) {`,
`function QueueMappingPanel({ queue, hub, ws, scorecards, scMarkets, profile, flash, onMappingSaved, onToggleActive, onDelete }) {`
);

// 3. Add Danger Zone section at the bottom of Queue Settings panel
patch('Add Danger Zone to Queue Settings',
`      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={saveQueueSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save Queue Settings'}
        </button>
      </div>
    </div>
  )
}

// ─── Workspace card (top-level component — preserves its own state across re-renders) ───`,
`      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <button className="btn btn-primary btn-sm" onClick={saveQueueSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save Queue Settings'}
        </button>
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Danger Zone
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className={\`btn btn-sm \${queue.is_active ? 'btn-danger' : 'btn-success'}\`} onClick={onToggleActive}>
            {queue.is_active ? 'Deactivate Queue' : 'Activate Queue'}
          </button>
          {!queue.is_active && (
            <button className="btn btn-sm btn-danger" onClick={onDelete}>Delete Queue</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Workspace card (top-level component — preserves its own state across re-renders) ───`
);

// 4. Queue row: drop Deactivate/Delete buttons, keep Queue Settings + Rename only
patch('Simplify queue row buttons',
`                            {!isEditing(q.id) && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: mapOpen ? 'var(--accent)' : undefined, border: mapOpen ? '1px solid var(--accent)44' : undefined }}
                                  onClick={() => setExpandedS(e => ({ ...e, [q.id]: !mapOpen }))}>⚙ Queue Settings</button>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(q.id, 'queue', q.name)}>Rename</button>
                                <button className={\`btn btn-sm \${q.is_active ? 'btn-danger' : 'btn-success'}\`} style={{ fontSize: 12 }} onClick={() => toggleQueue(q)}>{q.is_active ? 'Deactivate' : 'Activate'}</button>
                                {!q.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteQueue(q)}>Delete</button>}
                              </div>
                            )}`,
`                            {!isEditing(q.id) && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12, color: mapOpen ? 'var(--accent)' : undefined, border: mapOpen ? '1px solid var(--accent)44' : undefined }}
                                  onClick={() => setExpandedS(e => ({ ...e, [q.id]: !mapOpen }))}>⚙ Queue Settings</button>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(q.id, 'queue', q.name)}>Rename</button>
                              </div>
                            )}`
);

// 5. Pass toggle/delete handlers into QueueMappingPanel
patch('Wire toggle/delete into QueueMappingPanel call',
`                          {mapOpen && (
                            <QueueMappingPanel queue={q} hub={hub} ws={ws} scorecards={scorecards} scMarkets={scMarkets}
                              profile={profile} flash={flash} onMappingSaved={reloadAll} />
                          )}`,
`                          {mapOpen && (
                            <QueueMappingPanel queue={q} hub={hub} ws={ws} scorecards={scorecards} scMarkets={scMarkets}
                              profile={profile} flash={flash} onMappingSaved={reloadAll}
                              onToggleActive={() => toggleQueue(q)} onDelete={() => deleteQueue(q)} />
                          )}`
);

// 6. Workspace row: replace Deactivate/Delete buttons with kebab menu
patch('Workspace row -> RowMenu',
`            <button className="btn btn-ghost btn-sm" onClick={() => startAdd('hub', ws.id)}>+ Hub</button>
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ws.id, 'workspace', ws.name)}>Rename</button>
            <button className={\`btn btn-sm \${ws.is_active ? 'btn-danger' : 'btn-success'}\`} style={{ fontSize: 12 }} onClick={() => toggleWs(ws)}>{ws.is_active ? 'Deactivate' : 'Activate'}</button>
            {!ws.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteWs(ws)}>Delete</button>}`,
`            <button className="btn btn-ghost btn-sm" onClick={() => startAdd('hub', ws.id)}>+ Hub</button>
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(ws.id, 'workspace', ws.name)}>Rename</button>
            <RowMenu isActive={ws.is_active} onToggleActive={() => toggleWs(ws)} onDelete={() => deleteWs(ws)} />`
);

// 7. Hub row: same treatment
patch('Hub row -> RowMenu',
`                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd('queue', hub.id)}>+ Queue</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(hub.id, 'hub', hub.name)}>Rename</button>
                      <button className={\`btn btn-sm \${hub.is_active ? 'btn-danger' : 'btn-success'}\`} style={{ fontSize: 12 }} onClick={() => toggleHub(hub)}>{hub.is_active ? 'Deactivate' : 'Activate'}</button>
                      {!hub.is_active && <button className="btn btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteHub(hub)}>Delete</button>}`,
`                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startAdd('queue', hub.id)}>+ Queue</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => startEdit(hub.id, 'hub', hub.name)}>Rename</button>
                      <RowMenu isActive={hub.is_active} onToggleActive={() => toggleHub(hub)} onDelete={() => deleteHub(hub)} />`
);

if (ok) {
  fs.writeFileSync(path, content);
  console.log('\n✅ All patches applied — file written.');
} else {
  console.log('\n❌ One or more anchors failed — file NOT written. Nothing was changed.');
  process.exit(1);
}
