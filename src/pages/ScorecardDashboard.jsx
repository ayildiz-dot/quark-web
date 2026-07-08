import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'
import DuckLoader from '../components/DuckLoader'
import { getEvaluatorScope } from '../lib/evaluatorScope'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart
} from 'recharts'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, horizontalListSortingStrategy,
  verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/* ===================== date helpers ===================== */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  return 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000))
}
function weekStartOf(dateStr) {
  const d = new Date(dateStr); if (isNaN(d)) return null
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d
}

/* ===================== measure engine ===================== */
function isControllable(ev) {
  const mv = ev.metadata_values
  return Array.isArray(mv) && mv.some(e => e?.value === 'Controllable')
}
function getMetaValue(ev, label) {
  const mv = ev.metadata_values
  if (!Array.isArray(mv)) return null
  return mv.find(e => e?.label === label)?.value ?? null
}
function evalDate(ev, scorecard) {
  if (scorecard.type === 'dsat') return getMetaValue(ev, 'Communication Date')
  return ev.submitted_at
}
function computeMeasure(measureKey, evals, scorecard) {
  const n = evals.length
  switch (measureKey) {
    case 'eval_count': return { display: String(n) }
    case 'avg_quality_score': {
      if (!n) return { display: '—' }
      const sum = evals.reduce((a, e) => a + (e.score ?? 0), 0)
      return { display: Math.round(sum / n) + '%' }
    }
    case 'controllability_rate': {
      if (!n) return { display: '—' }
      const c = evals.filter(isControllable).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    // Spot-check measures — operate on Vendor-shaped evaluation rows only
    // (deviated_controllability / is_deviated / deviation_source_evaluation_id).
    // Alignment Rate's denominator is spot-checked rows only; a Vendor row
    // nobody ever reviewed has no alignment to speak of.
    case 'alignment_rate': {
      const checked = evals.filter(e => e.deviation_source_evaluation_id != null)
      if (!checked.length) return { display: '—' }
      const aligned = checked.filter(e => !e.is_deviated).length
      return { display: Math.round((aligned / checked.length) * 100) + '%', detail: aligned + ' of ' + checked.length + ' spot-checked' }
    }
    case 'deviated_controllability_rate': {
      if (!n) return { display: '—' }
      const c = evals.filter(e => {
        const effective = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return effective === 'Controllable'
      }).length
      return { display: Math.round((c / n) * 100) + '%', detail: c + ' of ' + n + ' controllable' }
    }
    default: return { display: '?' }
  }
}
function buildWeeklySeries(evals, scorecard) {
  const isDsat = scorecard.type === 'dsat'
  const buckets = new Map()
  for (const ev of evals) {
    const raw = evalDate(ev, scorecard); if (!raw) continue
    const ws = weekStartOf(raw); if (!ws) continue
    const key = ws.toISOString().slice(0,10)
    if (!buckets.has(key)) buckets.set(key, { weekStart: ws, evals: [] })
    buckets.get(key).evals.push(ev)
  }
  return [...buckets.values()].sort((a,b)=>a.weekStart-b.weekStart).map(b => {
    const count = b.evals.length
    let rate
    if (isDsat) { const c = b.evals.filter(isControllable).length; rate = count ? Math.round(c/count*100) : 0 }
    else { const s = b.evals.reduce((a,e)=>a+(e.score??0),0); rate = count ? Math.round(s/count) : 0 }
    return { weekLabel: b.weekStart.toLocaleDateString(undefined,{month:'short',day:'numeric'}), rate, count }
  })
}
// Buckets Vendor-shaped rows by Communication Date (shared between paired
// Vendor and KG evaluations by design — see spot-check metadata auto-fill).
// measureKey is 'alignment_rate' or 'deviated_controllability_rate'.
function buildSpotCheckWeeklySeries(vendorEvals, measureKey) {
  const buckets = new Map()
  for (const ev of vendorEvals) {
    const raw = getMetaValue(ev, 'Communication Date'); if (!raw) continue
    const ws = weekStartOf(raw); if (!ws) continue
    const key = ws.toISOString().slice(0,10)
    if (!buckets.has(key)) buckets.set(key, { weekStart: ws, evals: [] })
    buckets.get(key).evals.push(ev)
  }
  return [...buckets.values()].sort((a,b)=>a.weekStart-b.weekStart).map(b => {
    let count, rate
    if (measureKey === 'alignment_rate') {
      const checked = b.evals.filter(e => e.deviation_source_evaluation_id != null)
      count = checked.length
      const aligned = checked.filter(e => !e.is_deviated).length
      rate = count ? Math.round(aligned / count * 100) : 0
    } else {
      count = b.evals.length
      const c = b.evals.filter(e => {
        const effective = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return effective === 'Controllable'
      }).length
      rate = count ? Math.round(c / count * 100) : 0
    }
    return { weekLabel: b.weekStart.toLocaleDateString(undefined,{month:'short',day:'numeric'}), rate, count }
  })
}

function buildAgentSeries(evals, scorecard) {
  const isDsat = scorecard.type === 'dsat'
  const buckets = new Map()
  for (const ev of evals) {
    const agent = getMetaValue(ev, "Agent's Email")
    if (!agent) continue
    if (!buckets.has(agent)) buckets.set(agent, [])
    buckets.get(agent).push(ev)
  }
  return [...buckets.entries()].map(([agent, agentEvals]) => {
    const count = agentEvals.length
    let value
    if (isDsat) {
      const c = agentEvals.filter(isControllable).length
      value = count ? Math.round((c / count) * 100) : 0
    } else {
      const s = agentEvals.reduce((a, e) => a + (e.score ?? 0), 0)
      value = count ? Math.round(s / count) : 0
    }
    return { agent, value, count }
  }).sort((a, b) => b.value - a.value)
}

/* ===================== widget catalog ===================== */
const WIDGET_CATALOG = {
  quality: [
    { widget_type: 'stat_card',  title: 'Overall Quality Score',     config: { measure: 'avg_quality_score' } },
    { widget_type: 'stat_card',  title: 'Total Evaluations',         config: { measure: 'eval_count' } },
    { widget_type: 'line_chart', title: 'Quality \u2014 Week over Week', config: {} },
    { widget_type: 'bar_chart',  title: 'Quality Score by Agent',    config: { measure: 'avg_quality_score' } },
  ],
  dsat: [
    { widget_type: 'stat_card',  title: 'Controllability Rate',          config: { measure: 'controllability_rate' } },
    { widget_type: 'stat_card',  title: 'Total DSATs Evaluated',         config: { measure: 'eval_count' } },
    { widget_type: 'line_chart', title: 'Controllability \u2014 Week over Week', config: {} },
    { widget_type: 'bar_chart',  title: 'Controllability by Agent',      config: { measure: 'controllability_rate' } },
    { widget_type: 'stat_card',  title: 'Alignment Rate',                config: { measure: 'alignment_rate' } },
    { widget_type: 'stat_card',  title: 'Deviated Controllability Rate', config: { measure: 'deviated_controllability_rate' } },
    { widget_type: 'line_chart', title: 'Alignment Rate \u2014 Week over Week', config: { measure: 'alignment_rate' } },
    { widget_type: 'line_chart', title: 'Deviated Controllability \u2014 Week over Week', config: { measure: 'deviated_controllability_rate' } },
  ],
}

/* ===================== filter definitions ===================== */
function buildFilterDefs(metadataFields, evals, scorecard, govQueues = []) {
  const defs = []
  const versions = [...new Set(evals.map(e => e.scorecard_version).filter(v => v != null))].sort((a,b)=>a-b)
  if (versions.length) {
    defs.push({ key: '__version__', label: 'Version', kind: 'multiselect',
      options: versions.map(v => ({ value: String(v), label: 'v' + v })) })
  }
  const years = new Set(), months = new Set(), weeks = new Set()
  for (const ev of evals) {
    const raw = evalDate(ev, scorecard); if (!raw) continue
    const d = new Date(raw); if (isNaN(d)) continue
    years.add(d.getFullYear()); months.add(d.getMonth()); weeks.add(isoWeek(d))
  }
  if (years.size) defs.push({ key: '__year__', label: 'Year', kind: 'multiselect',
    options: [...years].sort().map(y => ({ value: String(y), label: String(y) })) })
  if (months.size) defs.push({ key: '__month__', label: 'Month', kind: 'multiselect',
    options: [...months].sort((a,b)=>a-b).map(m => ({ value: String(m), label: MONTHS[m] })) })
  if (weeks.size) defs.push({ key: '__week__', label: 'Week', kind: 'multiselect', search: true,
    options: [...weeks].sort((a,b)=>a-b).map(w => ({ value: String(w), label: 'Week ' + w })) })
  defs.push({ key: '__daterange__', label: 'Date range', kind: 'daterange' })

  // Governance-sourced BPO-Hub filter: options come from the scorecard's mapped
  // queues (hub names), and matching is by the evaluation's stamped hub_id — not
  // by the scraped metadata string. Stale values (e.g. old "CNX RO") never appear.
  const hubMap = new Map() // hub_id -> hub_name
  const marketSet = new Set()
  for (const q of govQueues) {
    if (q.hub_id && q.hub_name) hubMap.set(q.hub_id, q.hub_name)
    if (q.market_value) marketSet.add(q.market_value)
  }
  if (hubMap.size) {
    defs.push({ key: '__hub__', label: 'BPO - Hub', kind: 'multiselect', search: true,
      options: [...hubMap.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id, name]) => ({ value: id, label: name })) })
  }
  if (marketSet.size) {
    defs.push({ key: '__market__', label: 'Market', kind: 'multiselect', search: true,
      options: [...marketSet].sort().map(m => ({ value: m, label: m })) })
  }

  for (const f of metadataFields) {
    // BPO-Hub and Market are governed above (by hub_id / queue market) — skip scraping them.
    if (f.label === 'BPO - Hub' || f.label === 'Market') continue
    if (f.field_type === 'date') {
      const isPrimary = (scorecard.type === 'dsat' && f.label === 'Communication Date')
      if (!isPrimary) defs.push({ key: 'meta:' + f.label, label: f.label, kind: 'daterange', metaLabel: f.label })
      continue
    }
    const present = [...new Set(evals.map(e => getMetaValue(e, f.label)).filter(v => v != null && v !== ''))].sort()
    if (present.length) {
      defs.push({ key: 'meta:' + f.label, label: f.label, kind: 'multiselect', search: true, metaLabel: f.label,
        options: present.map(v => ({ value: v, label: v })) })
    }
  }
  return defs
}

/* ===================== filter application ===================== */
function applyFilters(evals, defs, state, scorecard, queueMarketById = {}) {
  return evals.filter(ev => {
    for (const def of defs) {
      const sel = state[def.key]
      if (def.kind === 'multiselect') {
        if (!sel || !sel.length) continue
        let val
        if (def.key === '__version__') val = String(ev.scorecard_version)
        else if (def.key === '__hub__') val = ev.hub_id
        else if (def.key === '__market__') val = ev.queue_id ? (queueMarketById[ev.queue_id] || null) : null
        else if (def.key === '__year__' || def.key === '__month__' || def.key === '__week__') {
          const raw = evalDate(ev, scorecard); if (!raw) return false
          const d = new Date(raw); if (isNaN(d)) return false
          if (def.key === '__year__') val = String(d.getFullYear())
          if (def.key === '__month__') val = String(d.getMonth())
          if (def.key === '__week__') val = String(isoWeek(d))
        } else if (def.metaLabel) val = getMetaValue(ev, def.metaLabel)
        if (!sel.includes(val)) return false
      } else if (def.kind === 'daterange') {
        if (!sel || (!sel.from && !sel.to)) continue
        const raw = def.metaLabel ? getMetaValue(ev, def.metaLabel) : evalDate(ev, scorecard)
        if (!raw) return false
        const d = new Date(raw); if (isNaN(d)) return false
        if (sel.from && d < new Date(sel.from)) return false
        if (sel.to && d > new Date(sel.to + 'T23:59:59')) return false
      }
    }
    return true
  })
}

/* ===================== filter UI components ===================== */
function MultiSelectFilter({ def, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = selected || []
  const opts = def.search && search
    ? def.options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : def.options
  const toggle = v => onChange(sel.includes(v) ? sel.filter(x => x !== v) : [...sel, v])
  const summary = sel.length === 0 ? 'All' : sel.length === 1
    ? (def.options.find(o => o.value === sel[0])?.label || sel[0])
    : sel.length + ' selected'
  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 150 }}>
      <div className="form-field" style={{ gap: 4 }}>
        <label>{def.label}</label>
        <div className="select" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', userSelect:'none' }}
          onClick={() => setOpen(o => !o)}>
          <span style={{ color: sel.length ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize:13, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{summary}</span>
          <span style={{ fontSize:10, color:'var(--text-secondary)', marginLeft:6 }}>{open?'▲':'▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, minWidth:'100%', zIndex:9999,
          background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:8, boxShadow:'var(--shadow)', overflow:'hidden' }}>
          {def.search && (
            <div style={{ padding:'8px 10px', borderBottom:'1px solid var(--border)' }}>
              <input autoFocus className="input" placeholder="Search…" value={search}
                onChange={e=>setSearch(e.target.value)} onClick={e=>e.stopPropagation()} style={{ fontSize:13, padding:'6px 10px', width:'100%' }} />
            </div>
          )}
          <div style={{ maxHeight:240, overflowY:'auto' }}>
            {sel.length > 0 && (
              <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)' }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:12, color:'var(--danger)' }}
                  onClick={() => onChange([])}>Clear selection</button>
              </div>
            )}
            {opts.length === 0 ? (
              <div style={{ padding:'12px 14px', color:'var(--text-secondary)', fontSize:13 }}>No matches</div>
            ) : opts.map(o => (
              <label key={o.value} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', fontSize:13, cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <input type="checkbox" checked={sel.includes(o.value)} onChange={()=>toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DateRangeFilter({ def, selected, onChange }) {
  const sel = selected || { from:'', to:'' }
  return (
    <div className="form-field" style={{ gap:4 }}>
      <label>{def.label}</label>
      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
        <input type="date" className="input" value={sel.from || ''} style={{ fontSize:13 }}
          onChange={e => onChange({ ...sel, from: e.target.value })} />
        <span style={{ color:'var(--text-secondary)', fontSize:12 }}>to</span>
        <input type="date" className="input" value={sel.to || ''} style={{ fontSize:13 }}
          onChange={e => onChange({ ...sel, to: e.target.value })} />
        {(sel.from || sel.to) && (
          <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)', fontSize:12 }}
            onClick={() => onChange({ from:'', to:'' })}>X</button>
        )}
      </div>
    </div>
  )
}

/* ===================== charts ===================== */
function cssVar(name, fb) {
  if (typeof window === 'undefined') return fb
  const v = getComputedStyle(document.documentElement).getPropertyValue(name)
  return v?.trim() || fb
}

function WowComboChart({ data, scorecard, rateLabelOverride }) {
  const isDsat = scorecard.type === 'dsat'
  const rateName = rateLabelOverride || (isDsat ? 'Controllability %' : 'Quality Score %')
  const accent = cssVar('--accent','#3b82f6'), barColor = cssVar('--border-light','#2d3f5e')
  const grid = cssVar('--border','#1e293b'), textSec = cssVar('--text-secondary','#94a3b8'), surface = cssVar('--bg-surface','#1a2235')
  if (!data.length) return (
    <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)', fontSize:13 }}>
      No evaluations match the current filters.
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top:10, right:10, bottom:0, left:-10 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="weekLabel" stroke={textSec} fontSize={12} tickLine={false} />
        <YAxis yAxisId="left" stroke={textSec} fontSize={12} domain={[0,100]} tickLine={false} axisLine={false} unit="%" width={44} />
        <YAxis yAxisId="right" orientation="right" stroke={textSec} fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <Tooltip contentStyle={{ background:surface, border:'1px solid '+grid, borderRadius:8, fontSize:12 }}
          labelStyle={{ color:'var(--text-primary)' }} labelFormatter={l=>'Week of '+l}
          formatter={(v,n)=> n===rateName ? [v+'%',n] : [v,n]} />
        <Legend wrapperStyle={{ fontSize:12 }} />
        <Bar yAxisId="right" dataKey="count" name="Evaluations" fill={barColor} radius={[3,3,0,0]} barSize={28} />
        <Line yAxisId="left" type="monotone" dataKey="rate" name={rateName} stroke={accent} strokeWidth={2.5} dot={{ r:3, fill:accent }} activeDot={{ r:5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function AgentBarChart({ data, scorecard }) {
  const isDsat = scorecard.type === 'dsat'
  const metricName = isDsat ? 'Controllability %' : 'Quality Score %'
  const accent = cssVar('--accent','#3b82f6')
  const grid = cssVar('--border','#1e293b')
  const textSec = cssVar('--text-secondary','#94a3b8')
  const surface = cssVar('--bg-surface','#1a2235')
  if (!data.length) return (
    <div style={{ height:220, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-tertiary)', fontSize:13 }}>
      No agent data matches the current filters.
    </div>
  )
  const chartHeight = Math.max(260, data.length * 40)
  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} margin={{ top:10, right:16, bottom: data.length > 6 ? 80 : 48, left:-10 }}>
        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="agent" stroke={textSec} fontSize={11} tickLine={false} angle={-45} textAnchor="end" interval={0} />
        <YAxis stroke={textSec} fontSize={12} domain={[0,100]} tickLine={false} axisLine={false} unit="%" width={44} />
        <Tooltip
          contentStyle={{ background:surface, border:'1px solid '+grid, borderRadius:8, fontSize:12 }}
          labelStyle={{ color:'var(--text-primary)' }}
          formatter={(v) => [v + '%', metricName]}
          labelFormatter={l => l}
        />
        <Bar dataKey="value" name={metricName} fill={accent} radius={[3,3,0,0]} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ===================== add widget panel ===================== */
function AddWidgetPanel({ scorecard, existingWidgets, onAdd, onClose }) {
  const catalog = WIDGET_CATALOG[scorecard.type] || []
  const isAdded = (item) => existingWidgets.some(w => w.widget_type === item.widget_type && w.title === item.title)
  return (
    <div className="card" style={{ marginBottom:20, border:'1px solid var(--accent)', padding:'16px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>Add widget</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}
          style={{ color:'var(--text-secondary)', fontSize:18, lineHeight:1, padding:'0 6px' }}>X</button>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
        {catalog.map((item, i) => {
          const added = isAdded(item)
          return (
            <button key={i}
              disabled={added}
              onClick={() => !added && onAdd(item)}
              style={{
                fontSize:13, display:'flex', alignItems:'center', gap:8,
                padding:'8px 14px', borderRadius:8, border:'1px solid',
                cursor: added ? 'not-allowed' : 'pointer',
                borderColor: added ? 'var(--border)' : 'var(--accent)',
                background: added ? 'var(--bg-hover)' : 'transparent',
                color: added ? 'var(--text-tertiary)' : 'var(--accent)',
                opacity: added ? 0.5 : 1,
                transition: 'opacity .15s',
              }}>
              <span style={{ fontSize:15 }}>
                {item.widget_type === 'stat_card' ? '\u{1F522}' : item.widget_type === 'bar_chart' ? '\u{1F4CA}' : '\u{1F4C8}'}
              </span>
              {item.title}
              {added && <span style={{ fontSize:11, marginLeft:2 }}>✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ===================== sortable widget wrapper ===================== */
function SortableWidget({ id, editMode, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    position: 'relative',
  }
  return (
    <div ref={setNodeRef} style={style}>
      {editMode && (
        <div
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            cursor: isDragging ? 'grabbing' : 'grab',
            color: 'var(--text-tertiary)',
            fontSize: 22,
            lineHeight: 1,
            padding: '6px 10px',
            borderRadius: 6,
            userSelect: 'none',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'color .15s, border-color .15s',
            letterSpacing: 3,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--text-tertiary)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >{'⠿⠿'}</div>
      )}
      {children}
    </div>
  )
}

/* ===================== zone boundary toast ===================== */
function ZoneWarningToast({ visible }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'fixed',
      top: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99999,
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(220,38,38,0.96)',
        color: '#fff',
        borderRadius: 10,
        padding: '10px 22px',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        whiteSpace: 'nowrap',
      }}>
        <span style={{ fontSize: 16 }}>🚫</span>
        Widgets can only be reordered within their own section
      </div>
    </div>
  )
}

/* ===================== summary bubble ===================== */
const STOP_WORDS_SC = new Set([
  'the','a','an','is','was','are','were','be','been','has','had','have','do','did',
  'does','to','of','in','on','at','for','with','this','that','and','or','but','not',
  'no','so','if','it','its','he','she','they','we','you','my','your','their','our',
  'very','too','also','just','from','by','as','up','out','which','when','who','how',
  'what','all','more','could','would','should','will','can','need','there','here',
  'than','then','about','into','after','before','during','while','however','overall',
  'agent','evaluation','evaluated','evaluator','good','great','well','nice','fine',
  'okay','poor','quite','really','some','being','them','these','those','each',
  'customer','service','ticket','case','contact','handling',
])
function extractThemesSC(comments) {
  const freq = {}
  for (const c of comments) {
    if (!c) continue
    for (const word of c.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)) {
      if (word.length < 4 || STOP_WORDS_SC.has(word)) continue
      freq[word] = (freq[word] || 0) + 1
    }
  }
  return Object.entries(freq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([w]) => w)
}
function SummaryBubble({ scorecard, filteredEvals, alignmentVendorEvals, anyActive, evals, agentData, weeklyData }) {
  if (!anyActive) {
    return (
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 12,
        color: 'var(--text-secondary)', fontSize: 14,
      }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>📋</span>
        <span>You need to choose a filter first to generate a Summary.</span>
      </div>
    )
  }
  const isDsat = scorecard.type === 'dsat'
  const n = filteredEvals.length
  if (n === 0) return null

  const threshold = scorecard.pass_threshold ?? 90
  const computeRate = (evArr) => {
    const len = evArr.length
    if (!len) return 0
    if (isDsat) return Math.round(evArr.filter(isControllable).length / len * 100)
    return Math.round(evArr.filter(e => (e.score ?? 0) >= threshold).length / len * 100)
  }

  const lines = []

  // ── 1. Core metrics + baseline comparison ──
  if (isDsat) {
    const ctrl = filteredEvals.filter(isControllable).length
    const ctrlRate = Math.round((ctrl / n) * 100)
    let baseStr = ''
    if (evals && evals.length > 0 && evals.length !== n) {
      const baseCtrl = evals.filter(isControllable).length
      const baseRate = Math.round((baseCtrl / evals.length) * 100)
      const delta = ctrlRate - baseRate
      baseStr = ' (' + (delta >= 0 ? '+' : '') + delta + 'pp vs overall average of ' + baseRate + '%)'
    }
    const perfNote = ctrlRate >= 80 ? 'Controllability is healthy.'
      : ctrlRate >= 60 ? 'Controllability is moderate — review uncontrollable cases.'
      : 'Controllability is critically low — immediate review recommended.'
    let coreText = n + ' DSAT evaluation' + (n !== 1 ? 's' : '') + ' in the filtered view. Controllability: ' + ctrlRate + '% (' + ctrl + ' of ' + n + ')' + baseStr + '. ' + perfNote
    const checked = alignmentVendorEvals.filter(e => e.deviation_source_evaluation_id != null)
    if (checked.length) {
      const aligned = checked.filter(e => !e.is_deviated).length
      const alignRate = Math.round((aligned / checked.length) * 100)
      const devCtrl = alignmentVendorEvals.filter(e => {
        const eff = e.deviated_controllability ?? (isControllable(e) ? 'Controllable' : 'Non-Controllable')
        return eff === 'Controllable'
      }).length
      const devRate = alignmentVendorEvals.length ? Math.round((devCtrl / alignmentVendorEvals.length) * 100) : null
      coreText += ' Spot-check alignment: ' + alignRate + '%' + (devRate != null ? ', deviated controllability: ' + devRate + '%.' : '.')
    }
    lines.push({ text: coreText, type: 'primary' })
  } else {
    let passed = 0, scoreSum = 0
    for (const ev of filteredEvals) {
      const s = ev.score ?? 0; scoreSum += s
      if (s >= threshold) passed++
    }
    const avgScore = Math.round(scoreSum / n)
    const passRate = Math.round((passed / n) * 100)
    const failed = n - passed
    let baseStr = ''
    if (evals && evals.length > 0 && evals.length !== n) {
      let baseSum = 0
      for (const ev of evals) baseSum += (ev.score ?? 0)
      const baseAvg = Math.round(baseSum / evals.length)
      const delta = avgScore - baseAvg
      baseStr = ' (' + (delta >= 0 ? '+' : '') + delta + 'pp vs overall average of ' + baseAvg + '%)'
    }
    const perfNote = passRate >= 90 ? 'Performance is strong.'
      : passRate >= 75 ? 'Performance is on track but has room for improvement.'
      : 'Pass rate is below target — coaching opportunities likely.'
    lines.push({ text: n + ' quality evaluation' + (n !== 1 ? 's' : '') + ' in the filtered view. Average score: ' + avgScore + '%' + baseStr + ', pass rate: ' + passRate + '% (' + passed + ' passed, ' + failed + ' failed). ' + perfNote, type: 'primary' })
  }

  // ── 2. Weekly trend ──
  if (weeklyData && weeklyData.length >= 2) {
    const best = weeklyData.reduce((a, b) => a.rate >= b.rate ? a : b)
    const latest = weeklyData[weeklyData.length - 1]
    const prev = weeklyData[weeklyData.length - 2]
    const wowDelta = latest.rate - prev.rate
    let trendText = 'Weekly trend: '
    if (best.weekLabel !== latest.weekLabel) {
      trendText += 'Peak was ' + best.weekLabel + ' (' + best.rate + '%, ' + best.count + ' eval' + (best.count !== 1 ? 's' : '') + '). '
    }
    trendText += 'Most recent week (' + latest.weekLabel + '): ' + latest.rate + '% (' + latest.count + ' eval' + (latest.count !== 1 ? 's' : '') + ') — ' + (wowDelta >= 0 ? '+' : '') + wowDelta + 'pp vs prior week (' + prev.weekLabel + ', ' + prev.rate + '%).'
    lines.push({ text: trendText, type: 'primary' })
  }

  // ── 3. Agent outliers ──
  if (agentData && agentData.length >= 2) {
    const top = agentData[0]
    const bottom = agentData[agentData.length - 1]
    const fmt = a => a && a.includes('@') ? a.split('@')[0] : (a || 'Unknown').slice(0, 20)
    const metric = isDsat ? 'controllability' : 'avg score'
    let agentText = 'Agent performance: ' + fmt(top.agent) + ' leads at ' + top.value + '% ' + metric + ' (' + top.count + ' case' + (top.count !== 1 ? 's' : '') + ').'
    if (bottom.agent !== top.agent && bottom.value !== top.value) {
      agentText += ' Watch list: ' + fmt(bottom.agent) + ' at ' + bottom.value + '% (' + bottom.count + ' case' + (bottom.count !== 1 ? 's' : '') + ').'
    }
    lines.push({ text: agentText, type: 'primary' })
  }

  // ── 4. Comment themes ──
  const themes = extractThemesSC(filteredEvals.map(e => e.overall_comment).filter(Boolean))
  if (themes.length) {
    lines.push({ text: 'Recurring topics in evaluator comments: ' + themes.join(', ') + '.', type: 'primary' })
  }

  // ── 5. Category / Subcategory (auto-populates once Echo is live) ──
  const hasCategory = filteredEvals.some(e => getMetaValue(e, 'Category'))
  if (hasCategory) {
    const catMap = new Map()
    for (const ev of filteredEvals) {
      const cat = getMetaValue(ev, 'Category'); if (!cat) continue
      if (!catMap.has(cat)) catMap.set(cat, [])
      catMap.get(cat).push(ev)
    }
    const metric = isDsat ? 'controllability' : 'pass rate'
    const catRates = [...catMap.entries()]
      .map(([cat, evs]) => ({ cat, rate: computeRate(evs), n: evs.length, evs }))
      .sort((a, b) => b.n - a.n).slice(0, 3)
    let catText = 'Top categories (' + metric + '): ' + catRates.map(c => c.cat + ' — ' + c.rate + '% (' + c.n + ' eval' + (c.n !== 1 ? 's' : '') + ')').join('; ') + '.'
    const topCat = catRates[0]
    if (topCat) {
      const subMap = new Map()
      for (const ev of topCat.evs) {
        const sub = getMetaValue(ev, 'Subcategory'); if (!sub) continue
        if (!subMap.has(sub)) subMap.set(sub, [])
        subMap.get(sub).push(ev)
      }
      const subRates = [...subMap.entries()]
        .map(([sub, evs]) => ({ sub, rate: computeRate(evs), n: evs.length }))
        .sort((a, b) => b.n - a.n).slice(0, 3)
      if (subRates.length) {
        catText += ' Under ' + topCat.cat + ': ' + subRates.map(s => s.sub + ' (' + s.rate + '%)').join(', ') + '.'
      }
    }
    lines.push({ text: catText, type: 'primary' })
  } else {
    lines.push({ text: 'Category & subcategory breakdown not yet available — will auto-populate once Echo integration is active.', type: 'muted' })
  }

  // ── 6. Sample size warning ──
  if (n < 20) {
    lines.push({ text: 'Note: based on only ' + n + ' evaluation' + (n !== 1 ? 's' : '') + ' — treat these figures as directional, not statistically definitive.', type: 'warning' })
  }

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius-lg)',
      padding: '16px 20px', marginBottom: 20,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--accent)',
        textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10,
      }}>Summary</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {lines.map((line, i) => (
          <p key={i} style={{
            fontSize: 13.5, lineHeight: 1.65, margin: 0,
            color: line.type === 'muted' ? 'var(--text-secondary)'
                 : line.type === 'warning' ? '#f59e0b'
                 : 'var(--text-primary)',
          }}>{line.text}</p>
        ))}
      </div>
    </div>
  )
}

/* ===================== main ===================== */
export default function ScorecardDashboard() {
  const { division, scorecardId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = ['admin', 'owner'].includes(profile?.role)

  const [scorecard, setScorecard] = useState(null)
  const [metadataFields, setMetadataFields] = useState([])
  const [widgets, setWidgets] = useState([])
  const [evals, setEvals] = useState([])
  const [govQueues, setGovQueues] = useState([]) // [{id, hub_id, hub_name, market_value}] mapped to this scorecard
  // Vendor-shaped rows for the two spot-check measures (Alignment Rate, Deviated
  // Controllability). On the Vendor (non-spot-check) scorecard's own dashboard,
  // these ARE filteredEvals already. On the KG spot-check scorecard's dashboard,
  // this is a separate fetch of the Vendor rows that the filtered KG rows point
  // back to (via deviation_source_evaluation_id), refetched whenever the KG-side
  // filtered set changes.
  const [isSpotCheckScorecard, setIsSpotCheckScorecard] = useState(false)
  const [alignmentVendorEvals, setAlignmentVendorEvals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterState, setFilterState] = useState({})
  const [editMode, setEditMode] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showZoneWarning, setShowZoneWarning] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => { load() }, [scorecardId])

  const load = async () => {
    setLoading(true); setError(null); setFilterState({}); setEditMode(false); setShowAddPanel(false)
    try {
      const { data: sc, error: scErr } = await supabase
        .from('scorecards').select('id, name, type, pass_threshold, is_spot_check').eq('id', scorecardId).single()
      if (scErr) throw scErr
      setIsSpotCheckScorecard(!!sc.is_spot_check)

      const role = profile?.role
      const isAgent = role === 'viewer'
      const isEvaluator = role === 'evaluator'

      // Evaluator visibility gates:
      //  Gate 1 (scorecard access): the scorecard must be tagged to a hub in one of
      //    their workspaces, else they see nothing (evaluatorBlocked).
      //  Gate 2 (row-level): they only see evaluation rows whose stamped workspace_id
      //    is one of their assigned workspaces — even if the scorecard is shared with
      //    other workspaces. Enforced via .in('workspace_id', evaluatorWorkspaceIds).
      let evaluatorBlocked = false
      let evaluatorHubIds = []
      if (isEvaluator) {
        // Hub-level scope: an evaluator sees only scorecards on their assigned hubs,
        // and only evaluation rows stamped with one of those hubs.
        const { hubScorecardIds, hubIds } = await getEvaluatorScope(profile.id)
        evaluatorHubIds = hubIds || []
        if (!hubScorecardIds.includes(scorecardId)) evaluatorBlocked = true
      }

      const [{ data: mf }, { data: w }, { data: ev }] = await Promise.all([
        supabase.from('scorecard_metadata_fields').select('*').eq('scorecard_id', scorecardId).order('position'),
        supabase.from('dashboard_widgets').select('*').eq('scorecard_id', scorecardId).order('position'),
        (async () => {
          if (evaluatorBlocked) return { data: [] }
          let evQ = supabase.from('evaluations')
            .select('id, score, metadata_values, submitted_at, evaluation_type, status, scorecard_version, hub_id, workspace_id, queue_id, deviated_controllability, is_deviated, deviation_source_evaluation_id, overall_comment')
            .eq('scorecard_id', scorecardId).eq('status', 'submitted').eq('evaluation_type', sc.type)
          if (isAgent) {
            // Agents: scoped to their own results by email. No workspace filter.
            evQ = evQ.filter('metadata_values', 'cs', JSON.stringify([{ label: "Agent's Email", value: profile.email }]))
          } else if (isEvaluator) {
            // Evaluators: row-level HUB isolation. No assigned hubs → sees nothing.
            if (!evaluatorHubIds.length) return { data: [] }
            evQ = evQ.in('hub_id', evaluatorHubIds)
          }
          // Admins / owners: no additional filter — full visibility.
          return await evQ
        })(),
      ])
      // Governance-sourced filter options: queues mapped to this scorecard, with hub names.
      const { data: gq } = await supabase
        .from('queues')
        .select('id, hub_id, market_value, hubs(name)')
        .eq('scorecard_id', scorecardId)
        .not('market_value', 'is', null)
      const govList = (gq || []).map(q => ({
        id: q.id, hub_id: q.hub_id, hub_name: q.hubs?.name || '', market_value: q.market_value,
      }))

      setScorecard(sc); setMetadataFields(mf || []); setWidgets(w || []); setEvals(ev || [])
      setGovQueues(govList)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  const filterDefs = useMemo(
    () => scorecard ? buildFilterDefs(metadataFields, evals, scorecard, govQueues) : [],
    [metadataFields, evals, scorecard, govQueues]
  )
  // queue_id -> market_value, so the Market filter can match an eval by its stamped queue.
  const queueMarketById = useMemo(() => {
    const m = {}
    for (const q of govQueues) m[q.id] = q.market_value
    return m
  }, [govQueues])
  const filteredEvals = useMemo(
    () => scorecard ? applyFilters(evals, filterDefs, filterState, scorecard, queueMarketById) : [],
    [evals, filterDefs, filterState, scorecard, queueMarketById]
  )
  const weeklyData = useMemo(() => scorecard ? buildWeeklySeries(filteredEvals, scorecard) : [], [filteredEvals, scorecard])
  const agentData  = useMemo(() => scorecard ? buildAgentSeries(filteredEvals, scorecard) : [],  [filteredEvals, scorecard])

  // Populate alignmentVendorEvals: direct pass-through on the Vendor scorecard's
  // own dashboard, or a lookup-by-back-reference fetch on the KG scorecard's
  // dashboard. Refetches whenever the filtered KG row set changes.
  useEffect(() => {
    if (!scorecard) { setAlignmentVendorEvals([]); return }
    if (!isSpotCheckScorecard) { setAlignmentVendorEvals(filteredEvals); return }
    const kgIds = filteredEvals.map(e => e.id)
    if (!kgIds.length) { setAlignmentVendorEvals([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('id, metadata_values, deviated_controllability, is_deviated, deviation_source_evaluation_id')
        .in('deviation_source_evaluation_id', kgIds)
      if (!cancelled) setAlignmentVendorEvals(data || [])
    })()
    return () => { cancelled = true }
  }, [scorecard, isSpotCheckScorecard, filteredEvals])

  const alignmentWeeklyData = useMemo(() => buildSpotCheckWeeklySeries(alignmentVendorEvals, 'alignment_rate'), [alignmentVendorEvals])
  const deviatedWeeklyData  = useMemo(() => buildSpotCheckWeeklySeries(alignmentVendorEvals, 'deviated_controllability_rate'), [alignmentVendorEvals])

  const handleAddWidget = async (catalogItem) => {
    setSaving(true)
    try {
      const nextPos = widgets.length ? Math.max(...widgets.map(w => w.position)) + 1 : 0
      const { data, error: insErr } = await supabase.from('dashboard_widgets').insert({
        scorecard_id: scorecardId,
        widget_type: catalogItem.widget_type,
        title: catalogItem.title,
        config: catalogItem.config,
        position: nextPos,
      }).select().single()
      if (insErr) throw insErr
      setWidgets(ws => [...ws, data])
    } catch (e) { alert('Failed to add widget: ' + e.message) } finally { setSaving(false) }
  }

  const handleRemoveWidget = async (widgetId) => {
    if (!confirm('Remove this widget from the dashboard?')) return
    setSaving(true)
    try {
      const { error: delErr } = await supabase.from('dashboard_widgets').delete().eq('id', widgetId)
      if (delErr) throw delErr
      setWidgets(ws => ws.filter(w => w.id !== widgetId))
    } catch (e) { alert('Failed to remove widget: ' + e.message) } finally { setSaving(false) }
  }

  const handleDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeIsCard = widgets.find(w => w.id === active.id)?.widget_type === 'stat_card'
    const overIsCard   = widgets.find(w => w.id === over.id)?.widget_type === 'stat_card'
    // Cross-zone drop — warn and bail
    if (activeIsCard !== overIsCard) {
      setShowZoneWarning(true)
      setTimeout(() => setShowZoneWarning(false), 2000)
      return
    }
    const zoneWidgets = activeIsCard
      ? widgets.filter(w => w.widget_type === 'stat_card')
      : widgets.filter(w => w.widget_type !== 'stat_card')
    const oldIndex = zoneWidgets.findIndex(w => w.id === active.id)
    const newIndex = zoneWidgets.findIndex(w => w.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(zoneWidgets, oldIndex, newIndex)
    const otherWidgets = activeIsCard
      ? widgets.filter(w => w.widget_type !== 'stat_card')
      : widgets.filter(w => w.widget_type === 'stat_card')
    const allWidgets = activeIsCard
      ? [...reordered, ...otherWidgets]
      : [...otherWidgets, ...reordered]
    const withPositions = allWidgets.map((w, i) => ({ ...w, position: i }))
    setWidgets(withPositions)
    setSaving(true)
    try {
      await Promise.all(withPositions.map(w =>
        supabase.from('dashboard_widgets').update({ position: w.position }).eq('id', w.id)
      ))
    } catch (e) { alert('Failed to save widget order: ' + e.message) } finally { setSaving(false) }
  }

  const renderWidget = (w) => {
    const isEditing = editMode && canEdit
    const removeBtn = isEditing ? (
      <button
        onClick={(e) => { e.stopPropagation(); handleRemoveWidget(w.id) }}
        disabled={saving}
        style={{
          position:'absolute', top:10, right:10,
          background:'var(--danger)', color:'#fff',
          border:'none', borderRadius:6,
          width:26, height:26, display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', fontSize:14, lineHeight:1, zIndex:30,
          opacity: saving ? 0.5 : 1,
        }}
        title="Remove widget">X</button>
    ) : null

    if (w.widget_type === 'stat_card') {
      const spotCheckMeasure = w.config?.measure === 'alignment_rate' || w.config?.measure === 'deviated_controllability_rate'
      const r = computeMeasure(w.config?.measure, spotCheckMeasure ? alignmentVendorEvals : filteredEvals, scorecard)
      return (
        <div key={w.id} className="stat-card" style={{ position:'relative' }}>
          {removeBtn}
          <div className="stat-label">{w.title}</div>
          <div className="stat-value">{r.display}</div>
          {r.detail && <div className="stat-sub">{r.detail}</div>}
        </div>
      )
    }
    if (w.widget_type === 'line_chart') {
      const measure = w.config?.measure
      const chartData = measure === 'alignment_rate' ? alignmentWeeklyData
        : measure === 'deviated_controllability_rate' ? deviatedWeeklyData
        : weeklyData
      const rateLabel = measure === 'alignment_rate' ? 'Alignment Rate %'
        : measure === 'deviated_controllability_rate' ? 'Deviated Controllability %'
        : null
      return (
        <div key={w.id} className="card" style={{ marginBottom:16, position:'relative' }}>
          {removeBtn}
          <div className="card-title" style={{ marginBottom:16 }}>{w.title}</div>
          <WowComboChart data={chartData} scorecard={scorecard} rateLabelOverride={rateLabel} />
        </div>
      )
    }
    if (w.widget_type === 'bar_chart') {
      return (
        <div key={w.id} className="card" style={{ marginBottom:16, position:'relative' }}>
          {removeBtn}
          <div className="card-title" style={{ marginBottom:16 }}>{w.title}</div>
          <AgentBarChart data={agentData} scorecard={scorecard} />
        </div>
      )
    }
    return null
  }

  if (loading) return <div className="page"><DuckLoader /></div>
  if (error) return <div className="page"><div className="card" style={{ color:'var(--danger)' }}>Failed to load: {error}</div></div>

  const statCards = widgets.filter(w => w.widget_type === 'stat_card')
  const charts    = widgets.filter(w => w.widget_type !== 'stat_card')
  const statIds   = statCards.map(w => w.id)
  const chartIds  = charts.map(w => w.id)
  const anyActive = Object.values(filterState).some(v =>
    Array.isArray(v) ? v.length : (v && (v.from || v.to)))
  const setFilter = (key, val) => setFilterState(s => ({ ...s, [key]: val }))

  return (
    <div className="page">
      <ZoneWarningToast visible={showZoneWarning} />

      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom:8 }}
            onClick={() => navigate('/dashboard/' + division)}>← Scorecards</button>
          <h1>{scorecard.name}</h1>
          <p className="page-sub">
            {scorecard.type === 'dsat' ? 'DSAT' : 'Quality'} dashboard · {filteredEvals.length}
            {anyActive ? ' of ' + evals.length : ''} evaluation{filteredEvals.length === 1 ? '' : 's'}
          </p>
        </div>
        {canEdit && (
          <button
            className={editMode ? 'btn btn-primary' : 'btn btn-secondary'}
            disabled={saving}
            onClick={() => { setEditMode(v => !v); setShowAddPanel(v => !v) }}>
            {editMode ? 'Done editing' : 'Edit dashboard'}
          </button>
        )}
      </div>

      {/* Add widget panel */}
      {editMode && showAddPanel && (
        <AddWidgetPanel
          scorecard={scorecard}
          existingWidgets={widgets}
          onAdd={handleAddWidget}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      {/* Edit mode banner */}
      {editMode && (
        <div style={{ marginBottom:16, padding:'10px 16px', background:'var(--accent-muted, rgba(59,130,246,0.1))',
          border:'1px solid var(--accent)', borderRadius:8, fontSize:13, color:'var(--accent)' }}>
          Edit mode — use the <strong>grip handle</strong> on any widget to reorder, click <strong>X</strong> to remove, or add new widgets above.
        </div>
      )}

      {/* Filter bar */}
      {filterDefs.length > 0 && (
        <div className="card" style={{ marginBottom:20, padding:'16px 18px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <span style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)', textTransform:'uppercase', letterSpacing:'.5px' }}>Filters</span>
            {anyActive && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize:12, color:'var(--danger)' }}
                onClick={() => setFilterState({})}>Clear all filters</button>
            )}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
            {filterDefs.map(def =>
              def.kind === 'daterange'
                ? <DateRangeFilter key={def.key} def={def} selected={filterState[def.key]} onChange={v => setFilter(def.key, v)} />
                : <MultiSelectFilter key={def.key} def={def} selected={filterState[def.key]} onChange={v => setFilter(def.key, v)} />
            )}
          </div>
        </div>
      )}

      {/* Summary bubble */}
      <SummaryBubble
        scorecard={scorecard}
        filteredEvals={filteredEvals}
        alignmentVendorEvals={alignmentVendorEvals}
        anyActive={anyActive}
        evals={evals}
        agentData={agentData}
        weeklyData={weeklyData}
      />

      {filteredEvals.length === 0 && (
        <div className="card" style={{ marginBottom:20, color:'var(--text-secondary)', textAlign:'center', padding:32 }}>
          {evals.length === 0
            ? 'No submitted evaluations for this scorecard yet.'
            : 'No evaluations match the current filters. Adjust or clear the filters above.'}
        </div>
      )}

      {/* Single DndContext wrapping both zones so cross-zone drops are detectable */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {/* Stat cards zone */}
        {statCards.length > 0 && (
          <SortableContext items={statIds} strategy={horizontalListSortingStrategy}>
            <div className="stats-grid">
              {statCards.map(w => (
                <SortableWidget key={w.id} id={w.id} editMode={editMode && canEdit}>
                  {renderWidget(w)}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        )}

        {/* Chart widgets zone */}
        {charts.length > 0 && (
          <SortableContext items={chartIds} strategy={verticalListSortingStrategy}>
            {charts.map(w => (
              <SortableWidget key={w.id} id={w.id} editMode={editMode && canEdit}>
                {renderWidget(w)}
              </SortableWidget>
            ))}
          </SortableContext>
        )}
      </DndContext>
    </div>
  )
}
