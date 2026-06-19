
function DropdownOptionsEditor({ options, onChange }) {
  const [inputVal, setInputVal] = useState('')

  const addOption = (raw) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (options.length >= 50) return
    if (options.includes(trimmed)) return
    onChange([...options, trimmed])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addOption(inputVal)
      setInputVal('')
    } else if (e.key === 'Backspace' && inputVal === '' && options.length > 0) {
      onChange(options.slice(0, -1))
    }
  }

  const removeOption = (idx) => {
    onChange(options.filter((_, i) => i !== idx))
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '6px 8px',
        background: 'var(--bg-card)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        minHeight: 42,
        cursor: 'text'
      }}
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      {options.map((opt, idx) => (
        <span key={idx} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'var(--bg-main)', border: '1px solid var(--border)',
          borderRadius: 4, padding: '2px 8px', fontSize: 13,
          color: 'var(--text-primary)', whiteSpace: 'nowrap'
        }}>
          {opt}
          <button
            onClick={() => removeOption(idx)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: 14, padding: 0,
              lineHeight: 1, display: 'flex', alignItems: 'center'
            }}
          >×</button>
        </span>
      ))}
      {options.length < 50 && (
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { addOption(inputVal); setInputVal('') }}
          placeholder={options.length === 0 ? 'Type an option, press Enter or comma…' : '+'}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 13,
            minWidth: options.length === 0 ? 260 : 40, flex: 1
          }}
        />
      )}
      {options.length >= 50 && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
          Max 50 options reached
        </span>
      )}
    </div>
  )
}
