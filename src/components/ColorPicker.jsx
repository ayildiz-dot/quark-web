import { HexColorPicker, HexColorInput } from 'react-colorful'

// hex -> HSL (for deriving hover/light accent shades)
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return { h: 217, s: 91, l: 60 }
  const int = parseInt(m[1], 16)
  let r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// Apply a custom accent by setting the three CSS vars the whole app reads.
export function applyAccent(hex, theme) {
  const { h, s, l } = hexToHsl(hex)
  const root = document.documentElement
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-hover', `hsl(${h}, ${s}%, ${clamp(l - 10, 8, 92)}%)`)
  root.style.setProperty('--accent-light', theme === 'light'
    ? `hsl(${h}, ${clamp(s, 20, 100)}%, 93%)`
    : `hsl(${h}, ${clamp(s - 15, 15, 90)}%, 20%)`)
}
export function clearAccent() {
  const root = document.documentElement
  ;['--accent', '--accent-hover', '--accent-light'].forEach(v => root.style.removeProperty(v))
}

export default function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="quark-colorpicker">
        <HexColorPicker color={value} onChange={onChange} style={{ width: '100%', height: 150 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: value, border: '1px solid var(--border)', flexShrink: 0 }} />
        <HexColorInput color={value} onChange={onChange} prefixed
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)',
                   background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13, textTransform: 'uppercase' }} />
      </div>
    </div>
  )
}
