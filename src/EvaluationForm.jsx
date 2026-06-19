
function SearchableDropdown({ options, value, onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef(null)

  const filtered = options.filter(o =>
    o.toLowerCase().includes(search.toLowerCase())
  )

  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="select"
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer', userSelect: 'none'
        }}
        onClick={() => { setOpen(o => !o); setSearch('') }}
      >
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {value || placeholder}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 999, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              className="input"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 13, padding: '6px 10px' }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>
                No options match
              </div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt}
                  onClick={() => { onChange(opt); setOpen(false); setSearch('') }}
                  style={{
                    padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                    color: opt === value ? 'var(--accent)' : 'var(--text-primary)',
                    background: opt === value ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderLeft: opt === value ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => {
                    if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  }}
                  onMouseLeave={e => {
                    if (opt !== value) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {opt}
                </div>
              ))
            )}
          </div>

          {value && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)', fontSize: 12 }}
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
