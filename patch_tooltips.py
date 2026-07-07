import sys

path = 'src/pages/Admin.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

ok = True
def apply(label, old, new):
    global content, ok
    if old in content:
        content = content.replace(old, new, 1)
        print(f'OK: {label} patched')
    else:
        ok = False
        print(f'FAIL: {label} NOT FOUND')

# Add the InfoTooltip component right after EditInputInline
apply('InfoTooltip component definition',
"""function EditInputInline({ value, onChange, onSave, onCancel, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
      <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}""",
"""function EditInputInline({ value, onChange, onSave, onCancel, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus className="input" style={{ maxWidth: 260, height: 34, fontSize: 13 }}
        placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
      <button className="btn btn-primary btn-sm" onClick={onSave}>Save</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function InfoTooltip({ text }) {
  return (
    <span className="info-tip">
      <span className="info-tip-icon">?</span>
      <span className="info-tip-bubble">{text}</span>
    </span>
  )
}""")

apply('Global Min label',
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Global Minimum Cases / Agent</label>""",
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Global Minimum Cases / Agent<InfoTooltip text="Guarantees every agent has at least this many cases across the ENTIRE sample, combining all rules. Tops up from pools they already qualify for if anyone falls short." /></label>""")

apply('Min Total label',
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Total Cases</label>""",
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Min Total Cases<InfoTooltip text="The sample must contain at least this many cases in total. If the rules produce fewer, you'll get a warning — nothing is auto-added to close the gap." /></label>""")

apply('Max Total label',
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Total Cases</label>""",
"""            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Max Total Cases<InfoTooltip text="The sample won't exceed this many cases in total. If the rules would produce more, the excess is trimmed proportionally, never breaking a rule's own Min / Agent floor." /></label>""")

apply('per-rule Min/Agent label',
"""            <label style={smallLabel}>Min / Agent</label>""",
"""            <label style={smallLabel}>Min / Agent<InfoTooltip text="Within this rule's own slice, guarantees every agent who appears in it has at least this many cases (or all of their cases, if they handled fewer)." /></label>""")

apply('fallback button + tooltip',
"""        {!hasFallback && (
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addNode(parentLocalId, true)}>
            {parentLocalId ? '+ Add Fallback Subconfiguration' : '+ Add Fallback Rule'}
          </button>
        )}""",
"""        {!hasFallback && (
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => addNode(parentLocalId, true)}>
              {parentLocalId ? '+ Add Fallback Subconfiguration' : '+ Add Fallback Rule'}
            </button>
            <InfoTooltip text="Catches whatever isn't claimed by the named rules in this group (e.g. any category not explicitly listed). Sized the same way as its siblings — percentage or fixed count." />
          </span>
        )}""")

if ok:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK: file written successfully')
else:
    print('FAIL: one or more anchors failed — file NOT written.')
    sys.exit(1)
