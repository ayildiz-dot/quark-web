const fs = require('fs');

const FILE = 'src/pages/EvaluationForm.jsx';
let content = fs.readFileSync(FILE, 'utf8');

const results = [];

function apply(name, oldStr, newStr, count = 1) {
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences !== count) {
    results.push([name, false, `expected ${count} occurrence(s), found ${occurrences}`]);
    return;
  }
  content = content.replace(oldStr, newStr);
  results.push([name, true, null]);
}

apply(
  "add spot-check state block",
  `  // Edit mode: when set, we are editing an already-submitted evaluation (not creating one).
  const [editingEvalId, setEditingEvalId] = useState(null)

  // Always-current ref for auto-save interval`,
  `  // Edit mode: when set, we are editing an already-submitted evaluation (not creating one).
  const [editingEvalId, setEditingEvalId] = useState(null)

  // ── Spot-check (KG DSAT) state ──────────────────────────────────────────
  // When selectedScorecard.is_spot_check is true, entering a Ticket ID on the
  // metadata step triggers a lookup against Vendor (non-spot-check) DSAT
  // scorecards. vendorEval holds the matched evaluation row; vendorChain holds
  // the walked answer chain (Controllability -> ... -> last answered section).
  const [vendorEval,        setVendorEval]        = useState(null)
  const [vendorChain,       setVendorChain]       = useState([])
  const [vendorLookupState, setVendorLookupState] = useState('idle') // idle | loading | found | not_found | conflict
  const [fullyAligned,      setFullyAligned]      = useState(false)
  const lastLookedUpTicket = useRef(null)

  // Always-current ref for auto-save interval`
);

apply(
  "reset spot-check state in selectScorecard",
  `    setSelectedScorecard(sc)
    const { data: metaData } = await supabase
      .from('scorecard_metadata_fields')
      .select('*').eq('scorecard_id', sc.id).order('position')
    setMetadata(metaData || [])
    setMetaValues({})

    if (sc.type === 'dsat') {`,
  `    setSelectedScorecard(sc)
    const { data: metaData } = await supabase
      .from('scorecard_metadata_fields')
      .select('*').eq('scorecard_id', sc.id).order('position')
    setMetadata(metaData || [])
    setMetaValues({})
    setVendorEval(null)
    setVendorChain([])
    setVendorLookupState('idle')
    setFullyAligned(false)
    lastLookedUpTicket.current = null

    if (sc.type === 'dsat') {`
);

apply(
  "add walkAnswerChain and lookupVendorEvaluation helpers before metaValid",
  `  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    // Success toasts auto-dismiss; error toasts persist until the user clicks OK.
    if (ok) setTimeout(() => setMsg(null), 4000)
  }

  const metaValid = () => {`,
  `  const flash = (text, ok = true) => {
    setMsg({ text, ok })
    // Success toasts auto-dismiss; error toasts persist until the user clicks OK.
    if (ok) setTimeout(() => setMsg(null), 4000)
  }

  // ── Spot-check: Vendor lookup + answer-chain walk ───────────────────────
  // Walks a Vendor DSAT evaluation's metadata_values starting at the scorecard's
  // first-position section, following each answer's jump_to_section_id, until
  // no further answered section is found. Returns an ordered chain for display.
  const walkAnswerChain = (vendorMetaValues, sections, dqs, dopts) => {
    const chain = []
    const sortedSections = [...sections].sort((a, b) => a.position - b.position)
    let currentSection = sortedSections.find(s => s.position === Math.min(...sortedSections.map(x => x.position)))
    const visited = new Set()
    let guard = 0
    while (currentSection && guard < 50) {
      guard++
      if (visited.has(currentSection.id)) break
      visited.add(currentSection.id)
      const sectionQs = dqs.filter(q => q.section_id === currentSection.id).sort((a, b) => a.position - b.position)
      const routingQ = sectionQs.find(q => q.question_type === 'options') || sectionQs[0]
      if (!routingQ) break
      const found = vendorMetaValues.find(m => m.label === routingQ.title)
      if (!found || !found.value) break
      chain.push({ sectionTitle: currentSection.title, questionTitle: routingQ.title, answerValue: found.value })
      const chosenOpt = dopts.find(o => o.question_id === routingQ.id && o.label === found.value)
      const nextSectionId = chosenOpt?.jump_to_section_id || null
      currentSection = nextSectionId ? sections.find(s => s.id === nextSectionId) : null
    }
    return chain
  }

  // Looks up the Vendor DSAT evaluation for a given Ticket ID across all published,
  // non-spot-check DSAT scorecards. Sets vendorLookupState to found/not_found/conflict.
  const lookupVendorEvaluation = async (ticketId) => {
    if (!ticketId) {
      setVendorEval(null); setVendorChain([]); setVendorLookupState('idle'); setFullyAligned(false)
      return
    }
    setVendorLookupState('loading')
    const vendorScorecardIds = scorecards
      .filter(sc => sc.type === 'dsat' && !sc.is_spot_check)
      .map(sc => sc.id)
    if (vendorScorecardIds.length === 0) {
      setVendorEval(null); setVendorChain([]); setVendorLookupState('not_found'); setFullyAligned(false)
      return
    }
    const { data: matches } = await supabase
      .from('evaluations')
      .select('*, scorecards!evaluations_scorecard_id_fkey(id, name)')
      .in('scorecard_id', vendorScorecardIds)
      .eq('evaluation_type', 'dsat')
      .eq('status', 'submitted')
      .eq('ticket_id_extracted', String(ticketId))
    if (!matches || matches.length === 0) {
      setVendorEval(null); setVendorChain([]); setVendorLookupState('not_found'); setFullyAligned(false)
      return
    }
    if (matches.length > 1) {
      setVendorEval(null); setVendorChain([]); setVendorLookupState('conflict'); setFullyAligned(false)
      return
    }
    const vendorEv = matches[0]
    const [secs, dqs, opts] = await Promise.all([
      supabase.from('dsat_sections').select('*').eq('scorecard_id', vendorEv.scorecard_id).order('position'),
      supabase.from('dsat_questions').select('*').eq('scorecard_id', vendorEv.scorecard_id).order('position'),
      supabase.from('dsat_options').select('*').order('position'),
    ])
    const chain = walkAnswerChain(vendorEv.metadata_values || [], secs.data || [], dqs.data || [], opts.data || [])
    setVendorEval(vendorEv)
    setVendorChain(chain)
    setVendorLookupState('found')
    setFullyAligned(false)

    // Auto-populate shared metadata fields (label match), still editable afterward.
    const vendorMeta = vendorEv.metadata_values || []
    setMetaValues(prev => {
      const next = { ...prev }
      for (const f of metadata) {
        if (f.label === 'Ticket ID') continue
        const found = vendorMeta.find(m => m.label === f.label)
        if (found && found.value) next[f.id] = found.value
      }
      return next
    })
  }

  // Debounced trigger: only look up once the Ticket ID value settles, and only
  // re-fetch when it actually changes (avoids refiring on every keystroke commit).
  const maybeTriggerVendorLookup = (ticketFieldId, value) => {
    if (!selectedScorecard?.is_spot_check) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (leavingRef.current) return
      if (value === lastLookedUpTicket.current) return
      lastLookedUpTicket.current = value
      lookupVendorEvaluation(value)
    }, 600)
  }

  const metaValid = () => {`
);

apply(
  "add spot-check banners to metadata step",
  `      {msg && <div className={\`flash \${msg.ok ? 'flash-ok' : 'flash-err'}\`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}
      {metadata.length === 0 ? (
        <div className="card" style={{ maxWidth: 600, color: 'var(--text-secondary)', padding: 24 }}>
          No metadata fields configured for this scorecard.
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title" style={{ marginBottom: 20 }}>Interaction Details</div>`,
  `      {msg && <div className={\`flash \${msg.ok ? 'flash-ok' : 'flash-err'}\`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></div>}
      {selectedScorecard.is_spot_check && !editingEvalId && vendorLookupState === 'loading' && (
        <div style={{ maxWidth: 600, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          Looking up the Vendor evaluation for this ticket…
        </div>
      )}
      {selectedScorecard.is_spot_check && !editingEvalId && vendorLookupState === 'not_found' && (
        <div style={{
          maxWidth: 600, marginBottom: 16, fontSize: 13, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)'
        }}>
          No Vendor DSAT evaluation was found for this Ticket ID. A spot-check can't be started until the Vendor has evaluated this ticket.
        </div>
      )}
      {selectedScorecard.is_spot_check && !editingEvalId && vendorLookupState === 'conflict' && (
        <div style={{
          maxWidth: 600, marginBottom: 16, fontSize: 13, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)'
        }}>
          This Ticket ID matches more than one Vendor DSAT evaluation, which shouldn't happen. Please contact an admin before proceeding.
        </div>
      )}
      {selectedScorecard.is_spot_check && !editingEvalId && vendorLookupState === 'found' && (
        <div style={{
          maxWidth: 600, marginBottom: 16, fontSize: 13, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--success)'
        }}>
          Vendor evaluation found. Metadata below has been pre-filled — please review it before continuing.
        </div>
      )}
      {metadata.length === 0 ? (
        <div className="card" style={{ maxWidth: 600, color: 'var(--text-secondary)', padding: 24 }}>
          No metadata fields configured for this scorecard.
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title" style={{ marginBottom: 20 }}>Interaction Details</div>`
);

apply(
  "wire up Ticket ID onChange to trigger vendor lookup",
  `              ) : field.field_type === 'number' ? (
                <input type="number" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => { setMetaValues(v => ({ ...v, [field.id]: e.target.value })); triggerAutoSave() }} />
              ) : (`,
  `              ) : field.field_type === 'number' ? (
                <input type="number" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => {
                    setMetaValues(v => ({ ...v, [field.id]: e.target.value }))
                    triggerAutoSave()
                    if (field.label === 'Ticket ID' && selectedScorecard.is_spot_check && !editingEvalId) {
                      maybeTriggerVendorLookup(field.id, e.target.value)
                    }
                  }} />
              ) : (`
);

apply(
  "block Continue to Questions when vendor lookup isn't resolved",
  `        <button className="btn btn-primary"
          onClick={() => {
            if (!metaValid()) return flash('Please fill in all required fields.', false)
            setStep('questions')
          }}>
          Continue to Questions →
        </button>`,
  `        <button className="btn btn-primary"
          onClick={() => {
            if (!metaValid()) return flash('Please fill in all required fields.', false)
            if (selectedScorecard.is_spot_check && !editingEvalId) {
              if (vendorLookupState === 'not_found') return flash('No Vendor DSAT evaluation was found for this Ticket ID. A spot-check cannot proceed until the Vendor has evaluated this ticket.', false)
              if (vendorLookupState === 'conflict') return flash('This Ticket ID matches more than one Vendor DSAT evaluation. Please contact an admin before proceeding.', false)
              if (vendorLookupState !== 'found') return flash('Please enter a valid Ticket ID and wait for the Vendor evaluation lookup to complete.', false)
            }
            setStep('questions')
          }}>
          Continue to Questions →
        </button>`
);

console.log('\nPatch results:');
let allOk = true;
for (const [name, ok, err] of results) {
  console.log(`  ${ok ? '✅' : '❌'} ${name}${err ? `  (${err})` : ''}`);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.log('\n❌ One or more anchors failed. NOTHING WAS WRITTEN. Fix anchors and re-run.');
  process.exit(1);
}

fs.writeFileSync(FILE, content);
console.log(`\n✅ All anchors applied successfully. ${FILE} updated.`);
