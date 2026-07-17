import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function EvaluationForm() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState('select')
  const [scorecards, setScorecards] = useState([])
  const [selectedScorecard, setSelectedScorecard] = useState(null)
  const [metadata, setMetadata] = useState([])
  const [groups, setGroups] = useState([])
  const [questions, setQuestions] = useState([])
  const [metaValues, setMetaValues] = useState({})
  const [answers, setAnswers] = useState({})
  const [msg, setMsg] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [overallComment, setOverallComment] = useState('')
  const [showLgtmConfirm, setShowLgtmConfirm] = useState(false)
  // Phase 1 (foundation) for AI-assisted scoring: ephemeral only, intentionally never
  // persisted to drafts or the evaluations table — full case transcripts should not sit in
  // Quark's database. Evaluator re-pastes it if they leave and come back. Populated on the
  // Metadata step; Phase 3 will read this once the evaluator reaches Questions and call the
  // ai-score-suggestion edge function for any question flagged is_ai_attribute.
  const [caseTranscript, setCaseTranscript] = useState('')
  // Phase 3: aiSuggestions is the permanent record of what the AI said per question
  // (score + reasoning) — kept even if the evaluator overrides the score, since it's
  // what gets persisted as ai_suggested_score/ai_reasoning for accuracy tracking later.
  // aiSuggestedIds is just the "not yet reviewed" set that drives the reminder badge —
  // it clears the moment the evaluator touches that question, aiSuggestions does not.
  const [aiSuggestions, setAiSuggestions] = useState({})
  const [aiSuggestedIds, setAiSuggestedIds] = useState(() => new Set())
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [barFloating, setBarFloating] = useState(false)
  // Phase 4: BPO DSAT (Vendor, non-spot-check) AI Controllability prediction.
  // aiDsatChain mirrors vendorChain's shape ({sectionTitle, questionTitle, answerValue}),
  // plus a `reasoning` field on each step — only aiDsatChain[0] (Controllability) is used
  // for accuracy tracking, the rest is just for the informational chain display.
  const [aiDsatChain, setAiDsatChain] = useState([])
  const [aiDsatLoading, setAiDsatLoading] = useState(false)
  const [aiDsatError, setAiDsatError] = useState(null)
  const [aiDsatAgreed, setAiDsatAgreed] = useState(false)
  const [dsatSections,         setDsatSections]         = useState([])
  const [dsatQuestions,        setDsatQuestions]        = useState([])
  const [dsatOptions,          setDsatOptions]          = useState([])
  const [dsatAnswers,          setDsatAnswers]          = useState({})
  const [dsatCurrentSectionId, setDsatCurrentSectionId] = useState(null)
  const [dsatSectionHistory,   setDsatSectionHistory]   = useState([])
  const [draftId,              setDraftId]              = useState(null)
  const [draftSaving,          setDraftSaving]          = useState(false)
  const [lastSaved,            setLastSaved]            = useState(null)
  const [showDraftLimit,       setShowDraftLimit]       = useState(false)
  // Queue-anchored governance: the queues this user may evaluate under.
  // Evaluators are limited to user_queues; admins/owners see all mapped queues.
  const [allowedQueues, setAllowedQueues] = useState([]) // [{id, scorecard_id, hub_id, hub_name, workspace_id, market_value}]
  const [agentsByQueue, setAgentsByQueue] = useState({}) // { queue_id: [{name, email}] }
  const [teamChoice, setTeamChoice] = useState('') // used when a hub+market maps to >1 team (admins/owners)
  // Edit mode: when set, we are editing an already-submitted evaluation (not creating one).
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
  const aiAutoRunRef = useRef(false)
  const aiDsatAutoRunRef = useRef(false)
  const barSentinelRef = useRef(null)

  // Always-current ref for auto-save interval
  const stateRef = useRef({})
  const draftIdRef = useRef(null)
  const overallCommentRef = useRef(null)
  const leavingRef = useRef(false)
  const debounceRef = useRef(null)

  const location = useLocation()

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = {
      step, selectedScorecard, metadata, groups, questions,
      metaValues, answers, overallComment,
      dsatSections, dsatQuestions, dsatOptions, dsatAnswers,
      dsatCurrentSectionId, dsatSectionHistory,
      profileId: profile?.id,
      editingEvalId
    }
  })
  useEffect(() => { draftIdRef.current = draftId }, [draftId])

  // Show the floating progress island once the inline bar scrolls above the top.
  // Uses capture-phase scroll so it works whether the window or an inner
  // container is the actual scroller.
  useEffect(() => {
    const onScroll = () => {
      const el = barSentinelRef.current
      if (!el) { setBarFloating(false); return }
      setBarFloating(el.getBoundingClientRect().top < 8)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [step])

  useEffect(() => {
    loadScorecards()
    loadAllowedQueues()
    if (location.state?.draft) resumeDraft(location.state.draft)
    if (location.state?.editEval) loadForEdit(location.state.editEval)
  }, [])

  // Reset leavingRef on mount, set on unmount
  useEffect(() => {
    leavingRef.current = false
    return () => {
      leavingRef.current = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // Phase 3: fire the AI attribute suggestions once, the moment the evaluator reaches
  // Questions on a Quality scorecard that has at least one AI Attribute and a pasted
  // transcript. Never runs in edit mode (no fresh transcript available for an old case).
  useEffect(() => {
    if (
      step === 'questions' && selectedScorecard?.type === 'quality' &&
      !editingEvalId && !aiAutoRunRef.current
    ) {
      const hasAiQuestions = questions.some(q => q.is_ai_attribute)
      if (hasAiQuestions && caseTranscript.trim()) {
        aiAutoRunRef.current = true
        runAiAttributes()
      }
    }
  }, [step])

  // Phase 4: same auto-trigger idea as the Quality AI Attributes effect above, but for the
  // BPO DSAT (Vendor / non-spot-check) scorecard's Controllability prediction. Never runs
  // for the KG spot-check scorecard, which stays fully manual, or in edit mode.
  useEffect(() => {
    if (
      step === 'questions' && selectedScorecard?.type === 'dsat' &&
      !selectedScorecard?.is_spot_check && !editingEvalId && !aiDsatAutoRunRef.current
    ) {
      if (caseTranscript.trim() && dsatSections.length > 0) {
        aiDsatAutoRunRef.current = true
        runAiDsatPrediction()
      }
    }
  }, [step])

  // Trigger auto-save 2 seconds after any answer/metadata change
  const triggerAutoSave = () => {
    if (editingEvalId) return // never autosave-as-draft while editing an existing evaluation
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (leavingRef.current) return
      const s = stateRef.current
      if (s.step && s.step !== 'select' && s.step !== 'done' && s.selectedScorecard) {
        saveDraft(s, draftIdRef.current, false)
      }
    }, 2000)
  }

  const saveDraft = async (s, existingDraftId, showMsg = true) => {
    if (!s) s = stateRef.current
    if (!existingDraftId) existingDraftId = draftIdRef.current
    if (!s.selectedScorecard || s.step === 'select' || s.step === 'done') return
    if (s.editingEvalId) return // edit mode is not a draft — never persist a draft row

    setDraftSaving(true)
    const state = {
      step: s.step,
      selectedScorecard: s.selectedScorecard,
      metadata: s.metadata,
      groups: s.groups,
      questions: s.questions,
      metaValues: s.metaValues,
      answers: s.answers,
      overallComment: s.overallComment,
      dsatSections: s.dsatSections,
      dsatQuestions: s.dsatQuestions,
      dsatOptions: s.dsatOptions,
      dsatAnswers: s.dsatAnswers,
      dsatCurrentSectionId: s.dsatCurrentSectionId,
      dsatSectionHistory: s.dsatSectionHistory,
    }

    try {
      if (existingDraftId) {
        await supabase.from('evaluations')
          .update({ draft_state: state, submitted_at: new Date().toISOString() })
          .eq('id', existingDraftId)
      } else {
        // First save for this evaluation — always insert a new row
        const profileId = s.profileId
        if (!profileId) { if (showMsg) flash('Not logged in — cannot save draft', false); setDraftSaving(false); return }
        const { data } = await supabase.from('evaluations').insert({
          scorecard_id: s.selectedScorecard.id,
          evaluator_id: profileId,
          score: 0,
          failed_critical: false,
          metadata_values: [],
          status: 'draft',
          draft_state: state,
          submitted_at: new Date().toISOString()
        }).select().single()
        if (data) {
          setDraftId(data.id)
          draftIdRef.current = data.id
        }
      }
      setLastSaved(new Date())
      if (showMsg) flash('Draft saved ✓')
    } catch (e) {
      if (showMsg) flash('Failed to save draft', false)
    } finally {
      setDraftSaving(false)
    }
  }

  const resumeDraft = (draft) => {
    const s = draft.draft_state
    if (!s) return
    setDraftId(draft.id)
    draftIdRef.current = draft.id
    setSelectedScorecard(s.selectedScorecard)
    setMetadata(s.metadata || [])
    setGroups(s.groups || [])
    setQuestions(s.questions || [])
    setMetaValues(s.metaValues || {})
    setAnswers(s.answers || {})
    setOverallComment(s.overallComment || '')
    setDsatSections(s.dsatSections || [])
    setDsatQuestions(s.dsatQuestions || [])
    setDsatOptions(s.dsatOptions || [])
    setDsatAnswers(s.dsatAnswers || {})
    setDsatSectionHistory(s.dsatSectionHistory || [])
    setDsatCurrentSectionId(s.dsatCurrentSectionId || null)
    setLastSaved(new Date(draft.submitted_at))
    // Set step last so all DSAT state is ready before the questions step renders
    setTimeout(() => setStep(s.step || 'metadata'), 0)
  }

  // Reconstruct the full form from an already-submitted evaluation so it can be edited.
  // Quality: rebuild answers from evaluation_scores (keyed by question_id).
  // DSAT: pre-fill dsatAnswers by mapping stored metadata_values (keyed by title) back to question ids;
  //       the editor re-walks sections from the first one (routing may change; only the final path is saved).
  const loadForEdit = async (evalId) => {
    const { data: ev } = await supabase
      .from('evaluations')
      .select('*, scorecards!evaluations_scorecard_id_fkey(*)')
      .eq('id', evalId)
      .single()
    if (!ev) { flash('Could not load this evaluation for editing.', false); return }
    const sc = ev.scorecards
    setSelectedScorecard(sc)
    setEditingEvalId(ev.id)

    // Load this scorecard's metadata field definitions.
    const { data: metaDefs } = await supabase
      .from('scorecard_metadata_fields')
      .select('*').eq('scorecard_id', sc.id).order('position')
    setMetadata(metaDefs || [])

    // Rebuild metaValues: match stored metadata_values (by label) to field ids.
    const storedMeta = ev.metadata_values || []
    const mv = {}
    ;(metaDefs || []).forEach(f => {
      const found = storedMeta.find(m => m.label === f.label)
      if (found) mv[f.id] = found.value
    })
    setMetaValues(mv)
    setOverallComment(ev.overall_comment || '')

    if (sc.type === 'dsat') {
      const [secs, dqs, opts] = await Promise.all([
        supabase.from('dsat_sections').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_questions').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_options').select('*').order('position'),
      ])
      const secsData = secs.data || []
      const dqsData = dqs.data || []
      setDsatSections(secsData)
      setDsatQuestions(dqsData)
      setDsatOptions(opts.data || [])
      // Pre-fill answers: map stored answer titles back to question ids (titles are unique per scorecard).
      const initDsat = {}
      for (const q of dqsData) {
        const found = storedMeta.find(m => m.label === q.title)
        initDsat[q.id] = { value: found?.value || '' }
      }
      setDsatAnswers(initDsat)
      const firstSection = [...secsData].sort((a, b) => a.position - b.position)[0]
      setDsatCurrentSectionId(firstSection?.id || null)
      setDsatSectionHistory([])
      setGroups([]); setQuestions([]); setAnswers({})
    } else {
      const [grp, qs, scoreRows] = await Promise.all([
        supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('scorecard_questions').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('evaluation_scores').select('question_id, score, comment').eq('evaluation_id', ev.id),
      ])
      setGroups(grp.data || [])
      setQuestions(qs.data || [])
      // Rebuild answers from stored per-question scores, keyed by question_id.
      const byQ = {}
      ;(scoreRows.data || []).forEach(r => { byQ[r.question_id] = { score: r.score, comment: r.comment || '' } })
      const init = {}
      for (const q of (qs.data || [])) init[q.id] = byQ[q.id] || { score: null, comment: '' }
      setAnswers(init)
      setDsatSections([]); setDsatQuestions([]); setDsatOptions([]); setDsatAnswers({})
    }
    setDraftId(null)
    draftIdRef.current = null
    setLastSaved(null)
    setTimeout(() => setStep('metadata'), 0)
  }

  const loadScorecards = async () => {
    const { data } = await supabase
      .from('scorecards')
      .select('*')
      .eq('is_published', true)
      .eq('is_calibration', false)
      .is('deleted_at', null)
      .order('name')
    setScorecards(data || [])
  }

  const runAiAttributes = async () => {
    const aiQs = questions.filter(q => q.is_ai_attribute)
    if (aiQs.length === 0 || !caseTranscript.trim()) return
    setAiLoading(true)
    setAiError(null)
    try {
      const { data, error } = await supabase.functions.invoke('ai-score-suggestion', {
        body: {
          transcript: caseTranscript,
          attributes: aiQs.map(q => ({
            id: q.id, title: q.title, ai_prompt: q.ai_prompt,
            is_form_critical: q.is_form_critical, allow_na: q.allow_na,
          })),
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      const newSuggestions = {}
      const newSuggestedIds = new Set()
      for (const s of (data?.suggestions || [])) {
        if (!aiQs.some(q => q.id === s.questionId)) continue
        newSuggestions[s.questionId] = { score: s.score, reasoning: s.comment }
        newSuggestedIds.add(s.questionId)
      }
      setAnswers(prev => {
        const next = { ...prev }
        for (const [qId, sug] of Object.entries(newSuggestions)) {
          next[qId] = { score: sug.score, comment: sug.reasoning }
        }
        return next
      })
      setAiSuggestions(newSuggestions)
      setAiSuggestedIds(newSuggestedIds)
      triggerAutoSave()
    } catch (e) {
      setAiError(e.message || 'Could not get AI suggestions right now — please score these manually.')
    } finally {
      setAiLoading(false)
    }
  }

  const runAiDsatPrediction = async () => {
    if (!caseTranscript.trim() || dsatSections.length === 0) return
    setAiDsatLoading(true)
    setAiDsatError(null)
    try {
      const sorted = [...dsatSections].sort((a, b) => a.position - b.position)
      let section = sorted[0]
      const chain = []
      let guard = 0
      while (section && chain.length < 3 && guard < 5) {
        guard++
        const sectionQs = dsatQuestions.filter(q => q.section_id === section.id).sort((a, b) => a.position - b.position)
        const routingQ = sectionQs.find(q => q.question_type === 'options')
        if (!routingQ) break
        const opts = dsatOptions.filter(o => o.question_id === routingQ.id).sort((a, b) => a.position - b.position)
        if (opts.length === 0) break
        const { data, error } = await supabase.functions.invoke('ai-dsat-suggestion', {
          body: {
            transcript: caseTranscript,
            sectionTitle: section.title,
            questionTitle: routingQ.title,
            options: opts.map(o => o.label),
          },
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        chain.push({ sectionTitle: section.title, questionTitle: routingQ.title, answerValue: data.answer, reasoning: data.reasoning })
        const chosenOpt = opts.find(o => o.label === data.answer)
        section = chosenOpt?.jump_to_section_id ? dsatSections.find(s => s.id === chosenOpt.jump_to_section_id) : null
      }
      setAiDsatChain(chain)
    } catch (e) {
      setAiDsatError(e.message || 'Could not get an AI prediction right now — please complete this evaluation manually.')
    } finally {
      setAiDsatLoading(false)
    }
  }

  // Copies the AI's predicted chain onto this evaluator's own dsatAnswers (same technique
  // as submitFullyAligned below), but does NOT auto-submit — the AI only predicts up to
  // 3 levels (Controllability -> Level 1 -> Level 2), so the evaluator still needs to walk
  // any remaining sections themselves before submitting.
  const applyAiDsatChain = () => {
    if (!aiDsatChain.length) return
    const newDsatAnswers = { ...dsatAnswers }
    const visitedSectionIds = []
    let section = [...dsatSections].sort((a, b) => a.position - b.position)[0]
    for (const step of aiDsatChain) {
      if (!section) break
      visitedSectionIds.push(section.id)
      const q = dsatQuestions.find(q => q.section_id === section.id && q.title === step.questionTitle)
      if (!q) break
      newDsatAnswers[q.id] = { value: step.answerValue }
      const opt = dsatOptions.find(o => o.question_id === q.id && o.label === step.answerValue)
      section = opt?.jump_to_section_id ? dsatSections.find(s => s.id === opt.jump_to_section_id) : null
    }
    setDsatAnswers(newDsatAnswers)
    setDsatSectionHistory(visitedSectionIds.slice(0, -1))
    setDsatCurrentSectionId(visitedSectionIds[visitedSectionIds.length - 1] || dsatCurrentSectionId)
    triggerAutoSave()
  }

  const loadAllowedQueues = async () => {
    const isPrivileged = ['admin', 'owner'].includes(profile?.role)
    // Pull mapped queues (those with a scorecard + market set) joined to their hub.
    const { data: queues } = await supabase
      .from('queues')
      .select('id, scorecard_id, hub_id, workspace_id, market_value, team, is_active, hubs(name)')
      .not('scorecard_id', 'is', null)
      .not('market_value', 'is', null)
      .is('deleted_at', null)
    let list = (queues || []).map(q => ({
      id: q.id,
      scorecard_id: q.scorecard_id,
      hub_id: q.hub_id,
      hub_name: q.hubs?.name || '',
      workspace_id: q.workspace_id,
      market_value: q.market_value,
      team: q.team,
      is_active: q.is_active,
    }))
    if (!isPrivileged && profile?.id) {
      // Evaluators: restrict to queues they're assigned to.
      const { data: uq } = await supabase
        .from('user_queues')
        .select('queue_id')
        .eq('user_id', profile.id)
      const allowed = new Set((uq || []).map(r => r.queue_id))
      list = list.filter(q => allowed.has(q.id))
    }
    setAllowedQueues(list)

    // Agents assigned to each of the caller's queues (secure RPC — bypasses RLS on others' assignments).
    const { data: agentRows } = await supabase.rpc('agents_for_my_queues')
    const abq = {}
    ;(agentRows || []).forEach(r => { (abq[r.queue_id] = abq[r.queue_id] || []).push({ name: r.agent_name, email: r.agent_email }) })
    setAgentsByQueue(abq)
  }

  // Valid queues for the currently-selected scorecard.
  const validQueuesForScorecard = () =>
    selectedScorecard
      ? allowedQueues.filter(q => q.scorecard_id === selectedScorecard.id)
      : []

  // Connection 1: BPO-Hub + Market options derived from the user's valid queues.
  const bpoHubOptionsFromQueues = () =>
    [...new Set(validQueuesForScorecard().map(q => q.hub_name).filter(Boolean))].sort()
  const marketOptionsFromQueues = () =>
    [...new Set(validQueuesForScorecard().map(q => q.market_value).filter(Boolean))].sort()

  // Agents on the queue resolved by the currently-selected BPO-Hub + Market.
  const teamsForSelection = () => {
    const bpoHub = metadata.find(f => f.label === 'BPO - Hub')
    const market = metadata.find(f => f.label === 'Market')
    const bpoHubVal = bpoHub ? (metaValues[bpoHub.id] || '') : ''
    const marketVal = market ? (metaValues[market.id] || '') : ''
    if (!bpoHubVal || !marketVal) return []
    return [...new Set(validQueuesForScorecard()
      .filter(q => q.hub_name === bpoHubVal && q.market_value === marketVal)
      .map(q => q.team).filter(Boolean))]
  }
  const resolvedQueueForSelection = () => {
    const bpoHub = metadata.find(f => f.label === 'BPO - Hub')
    const market = metadata.find(f => f.label === 'Market')
    const bpoHubVal = bpoHub ? (metaValues[bpoHub.id] || '') : ''
    const marketVal = market ? (metaValues[market.id] || '') : ''
    if (!bpoHubVal || !marketVal) return null
    const ms = validQueuesForScorecard().filter(q => q.hub_name === bpoHubVal && q.market_value === marketVal)
    if (ms.length > 1) return teamChoice ? (ms.find(q => q.team === teamChoice) || null) : null
    return ms[0] || null
  }
  const agentEmailOptions = () => {
    const q = resolvedQueueForSelection()
    const list = q ? (agentsByQueue[q.id] || []) : []
    const emails = [...new Set(list.map(a => a.email).filter(Boolean))].sort()
    const agentField = metadata.find(f => f.label === "Agent's Email")
    const cur = agentField ? (metaValues[agentField.id] || '') : ''
    return cur && !emails.includes(cur) ? [cur, ...emails] : emails
  }

  const selectScorecard = async (sc) => {
    // Check draft limit for this specific scorecard
    if (profile?.id) {
      const { count } = await supabase
        .from('evaluations')
        .select('id', { count: 'exact', head: true })
        .eq('evaluator_id', profile.id)
        .eq('scorecard_id', sc.id)
        .eq('status', 'draft')
      if (count >= 5) {
        setShowDraftLimit(true)
        return
      }
    }
    setSelectedScorecard(sc)
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

    if (sc.type === 'dsat') {
      const [secs, dqs, opts] = await Promise.all([
        supabase.from('dsat_sections').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_questions').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('dsat_options').select('*').order('position'),
      ])
      const secsData = secs.data || []
      setDsatSections(secsData)
      setDsatQuestions(dqs.data || [])
      setDsatOptions(opts.data || [])
      const initDsatAnswers = {}
      for (const q of (dqs.data || [])) initDsatAnswers[q.id] = { value: '' }
      setDsatAnswers(initDsatAnswers)
      const firstSection = secsData.sort((a, b) => a.position - b.position)[0]
      setDsatCurrentSectionId(firstSection?.id || null)
      setDsatSectionHistory([])
      setGroups([])
      setQuestions([])
      setAnswers({})
    } else {
      const [grp, qs] = await Promise.all([
        supabase.from('scorecard_question_groups').select('*').eq('scorecard_id', sc.id).order('position'),
        supabase.from('scorecard_questions').select('*').eq('scorecard_id', sc.id).eq('is_archived', false).order('position'),
      ])
      setGroups(grp.data || [])
      setQuestions(qs.data || [])
      const initAnswers = {}
      for (const q of (qs.data || [])) initAnswers[q.id] = { score: null, comment: '' }
      setAnswers(initAnswers)
      setDsatSections([])
      setDsatQuestions([])
      setDsatOptions([])
      setDsatAnswers({})
    }
    setDraftId(null)
    draftIdRef.current = null
    setLastSaved(null)
    setStep('metadata')
  }

  // "Looks Good to Me" — bulk-marks every quality question as Pass, then jumps
  // straight to the Overall Comment field. Quality + Calibration scorecards only
  // (never DSAT, which has no per-question Pass/Fail scoring in this form).
  const applyLgtm = () => {
    setAnswers(prev => {
      const next = {}
      for (const q of questions) {
        next[q.id] = { ...prev[q.id], score: 'pass' }
      }
      return next
    })
    setShowLgtmConfirm(false)
    triggerAutoSave()
    setTimeout(() => {
      overallCommentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      overallCommentRef.current?.focus()
    }, 50)
  }

  const flash = (text, ok = true) => {
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

  const metaValid = () => {
    for (const f of metadata) {
      if (f.is_required && !metaValues[f.id]) return false
    }
    return true
  }

  const questionsValid = () => {
    if (selectedScorecard?.type === 'dsat') {
      const visitedSectionIds = new Set([...dsatSectionHistory, dsatCurrentSectionId])
      const visitedQuestions = dsatQuestions.filter(q => visitedSectionIds.has(q.section_id))
      for (const q of visitedQuestions) {
        if (q.is_required && !dsatAnswers[q.id]?.value) return false
      }
      return true
    }
    for (const q of questions) {
      if (answers[q.id]?.score === null || answers[q.id]?.score === undefined) return false
    }
    return true
  }

  const calculateScore = () => {
    // Form-critical failure zeros the entire evaluation.
    for (const q of questions) {
      if (q.is_form_critical && answers[q.id]?.score === 'fail') {
        return { score: 0, failed_critical: true }
      }
    }

    // Determine which groups are "failed" — a group with any failed group-critical
    // question loses ALL of its earned weight (but its weight still counts in the denominator).
    const failedGroupIds = new Set()
    for (const q of questions) {
      if (q.group_id && q.is_group_critical && answers[q.id]?.score === 'fail') {
        failedGroupIds.add(q.group_id)
      }
    }

    let totalWeight = 0
    let earnedWeight = 0
    for (const q of questions) {
      const ans = answers[q.id]?.score
      if (ans === 'na') continue        // N/A excluded from weight everywhere, even in failed groups
      if (!q.is_weighted) continue
      const weight = q.weight || 1
      totalWeight += weight
      // Earn weight only if passed AND its group is not a failed group.
      if (ans === 'pass' && !(q.group_id && failedGroupIds.has(q.group_id))) {
        earnedWeight += weight
      }
    }
    if (totalWeight === 0) return { score: 100, failed_critical: false }
    return { score: Math.round((earnedWeight / totalWeight) * 100), failed_critical: false }
  }

  // Reads the value of the first-position section's first-position question
  // (i.e. "Controllability") out of a stored metadata_values array. Used by
  // both the fully-align path and the reconciliation resolver below, since
  // both need "what did this evaluation answer for Controllability". Assumes
  // the Vendor and KG DSAT scorecards share the same first-question title by
  // convention (confirmed and expected to remain true for both scorecards).
  const getFirstAnswerFromMetaValues = (metaValues, sections, dqs) => {
    const sortedSections = [...sections].sort((a, b) => a.position - b.position)
    const firstSection = sortedSections[0]
    if (!firstSection) return null
    const sectionQs = dqs.filter(q => q.section_id === firstSection.id).sort((a, b) => a.position - b.position)
    const routingQ = sectionQs.find(q => q.question_type === 'options') || sectionQs[0]
    if (!routingQ) return null
    const found = (metaValues || []).find(m => m.label === routingQ.title)
    return found?.value || null
  }

  // Copies the Vendor's walked answer chain onto this (KG) scorecard's own
  // dsatAnswers, matching by question title / option label (IDs differ between
  // scorecards but titles and labels are shared by convention). Then submits
  // immediately, mirroring the Vendor's full path.
  const submitFullyAligned = async () => {
    if (!vendorChain.length) return
    const newDsatAnswers = { ...dsatAnswers }
    const visitedSectionIds = []
    let currentSection = [...dsatSections].sort((a, b) => a.position - b.position)[0]
    for (const step of vendorChain) {
      if (!currentSection) break
      visitedSectionIds.push(currentSection.id)
      const q = dsatQuestions.find(q => q.section_id === currentSection.id && q.title === step.questionTitle)
      if (!q) break
      newDsatAnswers[q.id] = { value: step.answerValue }
      const opt = dsatOptions.find(o => o.question_id === q.id && o.label === step.answerValue)
      currentSection = opt?.jump_to_section_id ? dsatSections.find(s => s.id === opt.jump_to_section_id) : null
    }
    setDsatAnswers(newDsatAnswers)
    setDsatSectionHistory(visitedSectionIds.slice(0, -1))
    setDsatCurrentSectionId(visitedSectionIds[visitedSectionIds.length - 1] || dsatCurrentSectionId)
    submitEvaluation({ dsatAnswersOverride: newDsatAnswers, visitedSectionIdsOverride: visitedSectionIds })
  }

  const submitEvaluation = async (opts = {}) => {
    const effectiveDsatAnswers = opts.dsatAnswersOverride || dsatAnswers
    const effectiveVisitedIds = opts.visitedSectionIdsOverride || null

    if (!metaValid()) return flash('Please fill in all required metadata fields.', false)
    if (selectedScorecard?.is_spot_check) {
      if (vendorLookupState === 'not_found') return flash('No Vendor DSAT evaluation was found for this Ticket ID. A spot-check cannot be submitted until the Vendor has evaluated this ticket.', false)
      if (vendorLookupState === 'conflict') return flash('This Ticket ID matches more than one Vendor DSAT evaluation, which should not happen. Please contact an admin to resolve this before submitting.', false)
      if (vendorLookupState !== 'found') return flash('Please enter a valid Ticket ID and wait for the Vendor evaluation lookup to complete.', false)
    }
    if (!opts.dsatAnswersOverride && !questionsValid()) return flash('Please answer all required questions before submitting.', false)
    if (selectedScorecard.type !== 'dsat' && !overallComment.trim()) return flash('Please add an overall comment before submitting.', false)
    leavingRef.current = true
    setSubmitting(true)
    try {
      const metaPayload = metadata.map(f => ({
        field_id: f.id, label: f.label, value: metaValues[f.id] || ''
      }))

      // ── Governance resolver (blocking) ───────────────────────────────────
      // Resolve the (scorecard + BPO-Hub + Market) triple to exactly one queue the
      // user may evaluate under, then stamp queue_id + hub_id + workspace_id.
      // Runs once, here at submit. Reads the queues table (not hub_governance_map).
      const bpoHubValue = metaPayload.find(f => f.label === 'BPO - Hub')?.value || ''
      const marketValue = metaPayload.find(f => f.label === 'Market')?.value || ''
      if (!bpoHubValue || !marketValue) {
        setSubmitting(false)
        leavingRef.current = false
        return flash('Please select both BPO - Hub and Market before submitting.', false)
      }
      const matches = validQueuesForScorecard().filter(
        q => q.hub_name === bpoHubValue && q.market_value === marketValue
      )
      if (matches.length === 0) {
        setSubmitting(false)
        leavingRef.current = false
        return flash(`This BPO - Hub + Market combination (${bpoHubValue} + ${marketValue}) isn't mapped to a queue you can evaluate under. Ask an admin to map it in Control Room → Governance, or check your queue assignments. You can Save Draft in the meantime.`, false)
      }
      // A hub+market can now host one queue per team (Kaizen / BPO). Evaluators & TLs
      // only ever see their own queue (<=1 match); admins/owners may see both, so pick.
      let resolvedQueue = matches[0]
      if (matches.length > 1) {
        if (!teamChoice) {
          setSubmitting(false)
          leavingRef.current = false
          return flash('This BPO - Hub + Market has both a Kaizen and a BPO queue. Select the Team before submitting.', false)
        }
        resolvedQueue = matches.find(q => q.team === teamChoice)
        if (!resolvedQueue) {
          setSubmitting(false)
          leavingRef.current = false
          return flash('The selected Team has no queue for this BPO - Hub + Market.', false)
        }
      }
      const resolvedQueueId = resolvedQueue.id
      const resolvedHubId = resolvedQueue.hub_id
      const resolvedWorkspaceId = resolvedQueue.workspace_id

      if (selectedScorecard.type === 'dsat') {
        const visitedSectionIds = new Set(effectiveVisitedIds || [...dsatSectionHistory, dsatCurrentSectionId])
        const visitedQuestions = dsatQuestions.filter(q => visitedSectionIds.has(q.section_id))
        const dsatPayload = visitedQuestions.map(q => ({
          field_id: q.id, label: q.title, value: effectiveDsatAnswers[q.id]?.value || ''
        }))
        const aiControllabilityFields = (!selectedScorecard.is_spot_check && aiDsatChain[0])
          ? {
              ai_suggested_controllability: aiDsatChain[0].answerValue,
              ai_controllability_reasoning: aiDsatChain[0].reasoning || null,
              is_ai_deviated: getFirstAnswerFromMetaValues(dsatPayload, dsatSections, dsatQuestions) !== aiDsatChain[0].answerValue,
            }
          : {}
        if (editingEvalId) {
          // EDIT: update the existing row. Freeze evaluator_id + submitted_at; stamp last_edit_date.
          const { error: upErr } = await supabase.from('evaluations').update({
            metadata_values: [...metaPayload, ...dsatPayload],
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            last_edit_date: new Date().toISOString(),
          }).eq('id', editingEvalId)
          if (upErr) throw upErr
        } else {
          const { data: insertedDsatEval, error: evalError } = await supabase.from('evaluations').insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score: 100, failed_critical: false,
            metadata_values: [...metaPayload, ...dsatPayload],
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            overall_comment: null, status: 'submitted',
            evaluation_type: selectedScorecard.type,
            scorecard_version: selectedScorecard.version || 1,
            submitted_at: new Date().toISOString(),
            ...aiControllabilityFields,
          }).select().single()
          if (evalError) {
            if (evalError.code === '23505' && evalError.message?.includes('evaluations_dsat_ticket_unique')) {
              throw new Error('This ticket has already been evaluated on this scorecard. This can only be corrected by an admin or owner — please contact one to make the change.')
            }
            throw evalError
          }

          // ── Reconciliation resolver (spot-check only) ────────────────────
          // Runs once, right here at submit, for KG - DSAT Evaluation submissions
          // only. Stamps deviated_controllability / is_deviated / deviation_source_evaluation_id
          // onto the Vendor's evaluation row. Never re-runs later — a Vendor edit to
          // Controllability after this point makes the stamp stale, which is a known
          // gap flagged for the future notifications system, not silently re-resolved here.
          if (selectedScorecard.is_spot_check && vendorEval && insertedDsatEval) {
            const kgAnswer = getFirstAnswerFromMetaValues(dsatPayload, dsatSections, dsatQuestions)
            const vendorAnswer = getFirstAnswerFromMetaValues(vendorEval.metadata_values, dsatSections, dsatQuestions)
            if (kgAnswer) {
              await supabase.from('evaluations').update({
                deviated_controllability: kgAnswer,
                is_deviated: vendorAnswer !== null && kgAnswer !== vendorAnswer,
                deviation_source_evaluation_id: insertedDsatEval.id,
              }).eq('id', vendorEval.id)
            }
          }
        }
      } else {
        const { score, failed_critical } = calculateScore()
        if (editingEvalId) {
          // EDIT: update row (recompute score), freeze evaluator_id + submitted_at, stamp last_edit_date,
          // then replace the per-question score rows wholesale.
          const { error: upErr } = await supabase.from('evaluations').update({
            score, failed_critical,
            metadata_values: metaPayload,
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            overall_comment: overallComment.trim(),
            last_edit_date: new Date().toISOString(),
          }).eq('id', editingEvalId)
          if (upErr) throw upErr
          await supabase.from('evaluation_scores').delete().eq('evaluation_id', editingEvalId)
          const newScoreRows = questions.map(q => ({
            evaluation_id: editingEvalId,
            question_id: q.id,
            score: answers[q.id]?.score,
            comment: answers[q.id]?.comment || null,
            ai_suggested_score: aiSuggestions[q.id]?.score || null,
            ai_reasoning: aiSuggestions[q.id]?.reasoning || null,
          }))
          const { error: scErr } = await supabase.from('evaluation_scores').insert(newScoreRows)
          if (scErr) throw scErr
        } else {
          const { data: evaluation, error: evalError } = await supabase.from('evaluations').insert({
            scorecard_id: selectedScorecard.id,
            evaluator_id: profile.id,
            score, failed_critical,
            metadata_values: metaPayload,
            queue_id: resolvedQueueId, hub_id: resolvedHubId, workspace_id: resolvedWorkspaceId,
            overall_comment: overallComment.trim(),
            status: 'submitted',
            evaluation_type: selectedScorecard.type,
            scorecard_version: selectedScorecard.version || 1,
            submitted_at: new Date().toISOString()
          }).select().single()
          if (evalError) throw evalError
          const scoreRows = questions.map(q => ({
            evaluation_id: evaluation.id,
            question_id: q.id,
            score: answers[q.id]?.score,
            comment: answers[q.id]?.comment || null,
            ai_suggested_score: aiSuggestions[q.id]?.score || null,
            ai_reasoning: aiSuggestions[q.id]?.reasoning || null,
          }))
          const { error: scoresError } = await supabase.from('evaluation_scores').insert(scoreRows)
          if (scoresError) throw scoresError

          // Phase 3b: if this queue opted in, notify the evaluated agent to review their Quality evaluation.
          // Runs server-side via SECURITY DEFINER RPC: a client insert for another user's
          // notification is blocked by RLS (the agent's users row isn't readable), so it
          // silently failed before. The RPC checks the queue opt-in and resolves the agent.
          try {
            const { error: notifyErr } = await supabase.rpc('create_eval_read_notification', { p_eval_id: evaluation.id })
            if (notifyErr) console.error('agent notify failed:', notifyErr.message)
          } catch (e) { console.error('agent notify failed:', e) }
        }
      }

      // Delete draft if exists (never applies in edit mode)
      if (draftId && !editingEvalId) {
        await supabase.from('evaluations').delete().eq('id', draftId)
        setDraftId(null)
        draftIdRef.current = null
      }

      setStep('done')
    } catch (err) {
      flash('Failed to submit: ' + err.message, false)
    } finally {
      setSubmitting(false)
    }
  }

  // Draft save button shown in header during evaluation
  const DraftSaveButton = () => (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => saveDraft(stateRef.current, draftIdRef.current, true)}
      disabled={draftSaving}
      style={{ fontSize: 12, color: 'var(--text-secondary)' }}
    >
      {draftSaving ? 'Saving…' : lastSaved ? `Draft saved ${lastSaved.toLocaleTimeString()}` : 'Save Draft'}
    </button>
  )

  if (step === 'select') return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>New Evaluation</h1>
          <p className="page-sub">Select a scorecard to begin</p>
        </div>
      </div>
      <AnimatePresence>{msg && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, overflow: 'hidden' }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></motion.div>}</AnimatePresence>
      {showDraftLimit && (
        <div className="modal-backdrop">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div className="modal-body" style={{ padding: '32px 28px' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
              <h2 style={{ marginBottom: 12, fontSize: 17 }}>Draft Limit Reached</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                You must complete or delete at least 1 draft evaluation to be able to start a new evaluation for this scorecard.
              </p>
              <button className="btn btn-primary" onClick={() => setShowDraftLimit(false)}>
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
      {scorecards.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 40 }}>
          No published scorecards available. Ask an admin to publish a scorecard first.
        </div>
      )}
      <div style={{ display: 'grid', gap: 12, maxWidth: 680 }}>
        {scorecards.map(sc => (
          <div key={sc.id} className="card" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
            onClick={() => selectScorecard(sc)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{sc.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: sc.type === 'dsat' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)',
                    color: sc.type === 'dsat' ? 'var(--danger)' : 'var(--accent)',
                    border: sc.type === 'dsat' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(99,102,241,0.3)',
                    textTransform: 'uppercase', letterSpacing: '0.05em'
                  }}>
                    {sc.type === 'dsat' ? 'DSAT' : 'Quality'}
                  </span>
                </div>
                {sc.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sc.description}</div>
                )}
              </div>
              <span style={{ fontSize: 20, color: 'var(--text-secondary)' }}>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (step === 'metadata') return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
            onClick={() => setStep('select')}>← Back</button>
          <h1>{editingEvalId ? 'Edit — ' : ''}{selectedScorecard.name}</h1>
          <p className="page-sub">Step 1 of 2 — Interaction details</p>
        </div>
        {!editingEvalId && <DraftSaveButton />}
      </div>
      <AnimatePresence>{msg && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, overflow: 'hidden' }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></motion.div>}</AnimatePresence>
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
          <div className="card-title" style={{ marginBottom: 20 }}>Interaction Details</div>
          {metadata.map(field => (
            <div key={field.id} className="form-field" style={{ marginBottom: 16 }}>
              <label>
                {field.label}
                {field.is_required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </label>
              {(field.field_type === 'dropdown' || field.label === "Agent's Email") ? (
                <SearchableDropdown
                  options={
                    field.label === 'BPO - Hub' ? bpoHubOptionsFromQueues()
                    : field.label === 'Market'  ? marketOptionsFromQueues()
                    : field.label === "Agent's Email" ? agentEmailOptions()
                    : (field.options || [])
                  }
                  value={metaValues[field.id] || ''}
                  onChange={val => { setMetaValues(v => ({ ...v, [field.id]: val })); triggerAutoSave() }}
                  placeholder={field.label === "Agent's Email" ? 'Select BPO - Hub & Market first…' : 'Select...'}
                />
              ) : field.field_type === 'date' ? (
                <input type="date" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => { setMetaValues(v => ({ ...v, [field.id]: e.target.value })); triggerAutoSave() }} />
              ) : field.field_type === 'number' ? (
                <input type="number" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => {
                    setMetaValues(v => ({ ...v, [field.id]: e.target.value }))
                    triggerAutoSave()
                    if (field.label === 'Ticket ID' && selectedScorecard.is_spot_check && !editingEvalId) {
                      maybeTriggerVendorLookup(field.id, e.target.value)
                    }
                  }} />
              ) : (
                <input type="text" className="input"
                  value={metaValues[field.id] || ''}
                  onChange={e => { setMetaValues(v => ({ ...v, [field.id]: e.target.value })); triggerAutoSave() }} />
              )}
            </div>
          ))}
          {teamsForSelection().length > 1 && (
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Team <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span></label>
              <SearchableDropdown
                options={teamsForSelection()}
                value={teamChoice}
                onChange={val => { setTeamChoice(val); triggerAutoSave() }}
                placeholder="This hub + market has a Kaizen and a BPO queue — pick one…"
              />
            </div>
          )}
        </div>
      )}
      {((selectedScorecard?.type === 'quality' && questions.some(q => q.is_ai_attribute)) ||
        (selectedScorecard?.type === 'dsat' && !selectedScorecard?.is_spot_check)) && !editingEvalId && (
        <div className="card" style={{ maxWidth: 600, marginTop: 16, background: 'var(--bg-secondary)' }}>
          <div className="card-title" style={{ marginBottom: 6 }}>Case Transcript</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
            {selectedScorecard?.type === 'dsat'
              ? "This is the BPO DSAT Scorecard, which gets an AI-predicted Controllability chain. Paste the case transcript so the AI can predict it — nothing here is saved once you submit or leave, so paste it fresh each time."
              : "This scorecard has AI-assisted attributes. Paste the case transcript so the AI can suggest a score for those — nothing here is saved once you submit or leave, so paste it fresh each time."}
          </div>
          <textarea className="input" rows={6} placeholder="Paste the case transcript here…"
            value={caseTranscript}
            onChange={e => setCaseTranscript(e.target.value)}
            style={{ resize: 'vertical', fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
        </div>
      )}
      <div style={{ marginTop: 24, maxWidth: 600 }}>
        <button className="btn btn-primary"
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
        </button>
      </div>
    </div>
  )

  if (step === 'questions') {
    const isDsat = selectedScorecard?.type === 'dsat'
    const ungrouped = questions.filter(q => !q.group_id)
    const questionNumbers = new Map()
    let _qNumCounter = 0
    for (const q of ungrouped) questionNumbers.set(q.id, ++_qNumCounter)
    for (const group of groups) {
      for (const q of questions.filter(gq => gq.group_id === group.id)) questionNumbers.set(q.id, ++_qNumCounter)
    }
    const answered = isDsat
      ? Object.values(dsatAnswers).filter(a => a.value).length
      : Object.values(answers).filter(a => a.score !== null).length
    const total = isDsat ? dsatQuestions.length : questions.length
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
              onClick={() => setStep('metadata')}>← Back</button>
            <h1>{selectedScorecard.name}</h1>
            <p className="page-sub">Step 2 of 2 — {isDsat ? 'Complete the DSAT form' : 'Score each question'}</p>
            {!isDsat && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                <button className="btn btn-accent-soft" onClick={() => setShowLgtmConfirm(true)}>
                  LGTM
                </button>
                <span
                  title='Clicking this button will mark all the attributes as "Pass" and will take you directly to the comments section.'
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 16, height: 16, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                    border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'help'
                  }}>
                  ?
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!editingEvalId && <DraftSaveButton />}
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {answered}/{total} answered
            </span>
            <motion.button whileTap={{ scale: 0.96 }} className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}>
              {submitting ? (editingEvalId ? 'Saving…' : 'Submitting…') : (editingEvalId ? 'Save Edit' : 'Submit Evaluation')}
            </motion.button>
          </div>
        </div>
        <div ref={barSentinelRef} style={{ height: 1 }} />
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{answered}/{total} answered</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{pct}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 4 }}>
            <div style={{
              height: 4, borderRadius: 4, background: 'var(--accent)',
              width: `${pct}%`, transition: 'width 0.3s'
            }} />
          </div>
        </div>
        <AnimatePresence>
          {barFloating && (
            <motion.div
              initial={{ opacity: 0, y: -24, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -24, x: '-50%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              style={{
                position: 'fixed', top: 14, left: 'calc(50% + 110px)', zIndex: 40,
                display: 'flex', alignItems: 'center', gap: 14, minWidth: 300,
                padding: '9px 20px', borderRadius: 999,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.28)'
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{answered}/{total}</span>
              <div style={{ flex: 1, minWidth: 150, height: 5, background: 'var(--border)', borderRadius: 999 }}>
                <div style={{ height: 5, borderRadius: 999, background: 'var(--accent)', width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{pct}%</span>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>{msg && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={`flash ${msg.ok ? 'flash-ok' : 'flash-err'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, overflow: 'hidden' }}><span>{msg.text}</span><button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit', flexShrink: 0 }} onClick={() => setMsg(null)}>OK</button></motion.div>}</AnimatePresence>
        {showLgtmConfirm && (
          <div className="modal-backdrop" onClick={() => setShowLgtmConfirm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
              <div className="modal-body" style={{ padding: '32px 28px' }}>
                <h2 style={{ marginBottom: 12, fontSize: 17 }}>Mark all as Pass?</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                  This will mark every attribute on this scorecard as "Pass" and take you to the comments section. Any existing answers will be overwritten.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => setShowLgtmConfirm(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={applyLgtm}>Yes, mark all Pass</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {isDsat ? (
          (() => {
            const sortedSections = [...dsatSections].sort((a, b) => a.position - b.position)
            const currentSection = dsatSections.find(s => s.id === dsatCurrentSectionId)
            if (!currentSection) return null
            const sectionQs = dsatQuestions
              .filter(q => q.section_id === currentSection.id)
              .sort((a, b) => a.position - b.position)
            const isLastSection = currentSection.position === Math.max(...dsatSections.map(s => s.position))
            const currentSectionComplete = sectionQs.every(q =>
              !q.is_required || dsatAnswers[q.id]?.value
            )
            const goToNextSection = () => {
              const routingQ = sectionQs.find(q => q.question_type === 'options')
              let nextSectionId = null
              if (routingQ) {
                const chosenLabel = dsatAnswers[routingQ.id]?.value
                const chosenOpt = dsatOptions.find(
                  o => o.question_id === routingQ.id && o.label === chosenLabel
                )
                if (chosenOpt?.jump_to_section_id) nextSectionId = chosenOpt.jump_to_section_id
              }
              if (!nextSectionId) {
                const currentIdx = sortedSections.findIndex(s => s.id === currentSection.id)
                nextSectionId = sortedSections[currentIdx + 1]?.id || null
              }
              if (nextSectionId) {
                setDsatSectionHistory(h => [...h, currentSection.id])
                setDsatCurrentSectionId(nextSectionId)
              }
            }
            const goToPrevSection = () => {
              const prev = dsatSectionHistory[dsatSectionHistory.length - 1]
              if (prev) {
                setDsatSectionHistory(h => h.slice(0, -1))
                setDsatCurrentSectionId(prev)
              }
            }
            const isFirstSection = currentSection.position === Math.min(...dsatSections.map(s => s.position))
            const showVendorBanner = selectedScorecard.is_spot_check && !editingEvalId && isFirstSection && vendorLookupState === 'found'
            const showAiDsatBanner = !selectedScorecard.is_spot_check && !editingEvalId && isFirstSection &&
              (aiDsatLoading || aiDsatError || aiDsatChain.length > 0)
            return (
              <div>
                {showVendorBanner && (
                  <div style={{
                    marginBottom: 20, padding: '14px 16px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      Vendor's Evaluation
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                      {vendorChain.map((step, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>→</span>}
                          <span style={{
                            fontSize: 12, fontWeight: 500, padding: '3px 9px', borderRadius: 6,
                            background: 'var(--accent-light)', color: 'var(--accent)'
                          }}>
                            {step.answerValue}
                          </span>
                        </React.Fragment>
                      ))}
                      {vendorChain.length === 0 && (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          No answers recorded on the Vendor's evaluation.
                        </span>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={fullyAligned}
                        onChange={e => {
                          setFullyAligned(e.target.checked)
                          if (e.target.checked) submitFullyAligned()
                        }} />
                      I fully align with the BPO's evaluation
                    </label>
                  </div>
                )}
                {showAiDsatBanner && (
                  <div style={{
                    marginBottom: 20, padding: '14px 16px', borderRadius: 8,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)'
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                      ✨ AI Prediction
                    </div>
                    {aiDsatLoading && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={12} />Quark is thinking…</div>
                    )}
                    {aiDsatError && (
                      <div style={{ fontSize: 12, color: 'var(--danger)' }}>{aiDsatError}</div>
                    )}
                    {!aiDsatLoading && aiDsatChain.length > 0 && (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                          {aiDsatChain.map((step, i) => (
                            <React.Fragment key={i}>
                              {i > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>→</span>}
                              <span style={{
                                fontSize: 12, fontWeight: 500, padding: '3px 9px', borderRadius: 6,
                                background: 'var(--accent-light)', color: 'var(--accent)'
                              }}>
                                {step.answerValue}
                              </span>
                            </React.Fragment>
                          ))}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontStyle: 'italic' }}>
                          {aiDsatChain[0].reasoning}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                          <input type="checkbox" checked={aiDsatAgreed}
                            onChange={e => {
                              setAiDsatAgreed(e.target.checked)
                              if (e.target.checked) applyAiDsatChain()
                            }} />
                          I agree with the AI's prediction
                        </label>
                      </>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Section: <strong style={{ color: 'var(--text-primary)' }}>{currentSection.title}</strong>
                </div>
                {sectionQs.map(q => {
                  const qOpts = dsatOptions
                    .filter(o => o.question_id === q.id)
                    .sort((a, b) => a.position - b.position)
                  return (
                    <div key={q.id} className="card" style={{ marginBottom: 12,
                      borderLeft: dsatAnswers[q.id]?.value ? '3px solid var(--accent)' : '3px solid var(--border)'
                    }}>
                      <div style={{ fontWeight: 500, marginBottom: 12 }}>
                        {q.title}
                        {q.is_required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
                      </div>
                      {q.question_type === 'free_text' ? (
                        <textarea className="input" rows={3} placeholder="Type your answer…"
                          value={dsatAnswers[q.id]?.value || ''}
                          onChange={e => { setDsatAnswers(a => ({ ...a, [q.id]: { value: e.target.value } })); triggerAutoSave() }}
                          style={{ resize: 'both', fontSize: 13, maxWidth: '100%', boxSizing: 'border-box' }} />
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {qOpts.map(opt => {
                            const selected = dsatAnswers[q.id]?.value === opt.label
                            return (
                              <button key={opt.id}
                                onClick={() => { setDsatAnswers(a => ({ ...a, [q.id]: { value: opt.label } })); triggerAutoSave() }}
                                style={{
                                  padding: '7px 16px', borderRadius: 6,
                                  fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                  border: '1.5px solid',
                                  borderColor: selected ? 'var(--accent)' : 'var(--border)',
                                  background: selected ? 'rgba(99,102,241,0.12)' : 'transparent',
                                  color: selected ? 'var(--accent)' : 'var(--text-secondary)',
                                  transition: 'all 0.15s'
                                }}>
                                {opt.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}>
                  {dsatSectionHistory.length > 0 && (
                    <button className="btn btn-ghost" onClick={goToPrevSection}>← Back</button>
                  )}
                  {!isLastSection && (
                    <button className="btn btn-primary" onClick={goToNextSection} disabled={!currentSectionComplete}>
                      Next →
                    </button>
                  )}
                </div>
                {isLastSection && (
                  <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                    <motion.button whileTap={{ scale: 0.96 }} className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}
                      style={{ marginRight: 12 }}>
                      {submitting ? (editingEvalId ? 'Saving…' : 'Submitting…') : (editingEvalId ? 'Save Edit' : 'Submit Evaluation')}
                    </motion.button>
                    <button className="btn btn-ghost" onClick={goToPrevSection}>← Back</button>
                  </div>
                )}
              </div>
            )
          })()
        ) : (
          <>
            {questions.some(q => q.is_ai_attribute) && (
              <div className="card" style={{ marginBottom: 20, background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {aiLoading && <Spinner />}
                    {aiLoading
                      ? '✨ Quark is thinking…'
                      : Object.keys(aiSuggestions).length > 0
                        ? '✨ AI suggestions applied below — review each before submitting.'
                        : '✨ This scorecard has AI-assisted attributes.'}
                  </div>
                  <button className="btn btn-ghost btn-sm" disabled={aiLoading || !caseTranscript.trim()}
                    onClick={runAiAttributes}>
                    {aiLoading ? 'Thinking…' : (Object.keys(aiSuggestions).length > 0 ? '↻ Re-run AI Suggestions' : 'Get AI Suggestions')}
                  </button>
                </div>
                {aiError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{aiError}</div>}
                {!caseTranscript.trim() && !aiLoading && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                    No case transcript was entered on the Details step, so AI Attributes below need to be scored manually.
                  </div>
                )}
              </div>
            )}
            {ungrouped.map(q => (
              <QuestionCard key={q.id} question={q}
                answer={answers[q.id]}
                number={questionNumbers.get(q.id)}
                aiSuggested={aiSuggestedIds.has(q.id)}
                aiReasoning={aiSuggestions[q.id]?.reasoning}
                onChange={(updates) => {
                  setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                  setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                }} />
            ))}
            {groups.map(group => {
              const groupQs = questions.filter(q => q.group_id === group.id)
              if (groupQs.length === 0) return null
              return (
                <div key={group.id} style={{ marginBottom: 24 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    marginBottom: 10, paddingLeft: 2
                  }}>
                    {group.name}
                  </div>
                  {groupQs.map(q => (
                    <QuestionCard key={q.id} question={q}
                      answer={answers[q.id]}
                      number={questionNumbers.get(q.id)}
                      aiSuggested={aiSuggestedIds.has(q.id)}
                      aiReasoning={aiSuggestions[q.id]?.reasoning}
                      onChange={(updates) => {
                        setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], ...updates } }))
                        setAiSuggestedIds(prev => { if (!prev.has(q.id)) return prev; const next = new Set(prev); next.delete(q.id); return next })
                      }} />
                  ))}
                </div>
              )
            })}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
              <div className="form-field" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600, fontSize: 14 }}>
                  Overall Comment <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <textarea className="input" rows={4}
                  ref={overallCommentRef}
                  placeholder="Add an overall comment for this evaluation…"
                  value={overallComment}
                  onChange={e => setOverallComment(e.target.value)}
                  style={{ resize: 'vertical', fontSize: 13 }} />
              </div>
              <motion.button whileTap={{ scale: 0.96 }} className="btn btn-primary" onClick={() => submitEvaluation()} disabled={submitting}
                style={{ marginRight: 12 }}>
                {submitting ? (editingEvalId ? 'Saving…' : 'Submitting…') : (editingEvalId ? 'Save Edit' : 'Submit Evaluation')}
              </motion.button>
              <button className="btn btn-ghost" onClick={() => setStep('metadata')}>
                ← Back to Details
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  if (step === 'done') {
    const isDsat = selectedScorecard?.type === 'dsat'
    const { score, failed_critical } = isDsat ? { score: null, failed_critical: false } : calculateScore()
    const passThreshold = selectedScorecard?.pass_threshold ?? 90
    const passed = !failed_critical && score >= passThreshold
    return (
      <div className="page">
        <div style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>
            {isDsat ? '✅' : (failed_critical || !passed) ? '❌' : '✅'}
          </div>
          <h1 style={{ marginBottom: 8 }}>{editingEvalId ? 'Evaluation Updated' : 'Evaluation Submitted'}</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{selectedScorecard.name}</p>
          {!isDsat && (
            <motion.div
              className="card"
              style={{ marginBottom: 32 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            >
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>Final Score</div>
              <div style={{
                fontSize: 48, fontWeight: 700,
                color: failed_critical ? 'var(--danger)' : passed ? 'var(--success)' : 'var(--danger)'
              }}>
                {failed_critical ? '0%' : <CountUp target={score} />}
              </div>
              <div style={{ marginTop: 12 }}>
                <motion.span
                  className={`badge ${passed ? 'badge-pass' : 'badge-fail'}`}
                  style={{ fontSize: 14, padding: '4px 14px', display: 'inline-block' }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.5 }}
                >
                  {passed ? 'PASS' : 'FAIL'}
                </motion.span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                Passing score: {passThreshold}%
              </div>
              {failed_critical && (
                <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>
                  A form-critical question was failed
                </div>
              )}
            </motion.div>
          )}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => {
              setStep('select')
              setSelectedScorecard(null)
              setAnswers({})
              setMetaValues({})
              setOverallComment('')
              setDraftId(null)
              draftIdRef.current = null
              setLastSaved(null)
            }}>
              Start New Evaluation
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/evaluations')}>
              View All Evaluations
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function CountUp({ target, duration = 700 }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf
    const start = performance.now()
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return <>{value}%</>
}

function Spinner({ size = 13 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, flexShrink: 0,
      border: '2px solid var(--border)', borderTopColor: 'var(--accent)',
      borderRadius: '50%', animation: 'spin .7s linear infinite'
    }} />
  )
}

function QuestionCard({ question, answer, onChange, aiSuggested, aiReasoning, number }) {
  const score = answer?.score
  const comment = answer?.comment || ''
  const [showDesc, setShowDesc] = useState(false)
  const btnStyle = (val) => ({
    flex: 1, padding: '8px 0', borderRadius: 6, fontWeight: 500, fontSize: 13,
    cursor: 'pointer', border: '1.5px solid',
    borderColor: score === val
      ? val === 'pass' ? 'var(--success)' : val === 'fail' ? 'var(--danger)' : 'var(--text-secondary)'
      : 'var(--border)',
    background: score === val
      ? val === 'pass' ? 'rgba(34,197,94,0.12)' : val === 'fail' ? 'rgba(239,68,68,0.12)' : 'rgba(156,163,175,0.12)'
      : 'transparent',
    color: score === val
      ? val === 'pass' ? 'var(--success)' : val === 'fail' ? 'var(--danger)' : 'var(--text-secondary)'
      : 'var(--text-secondary)',
    transition: 'all 0.15s'
  })
  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: score === null || score === undefined ? '3px solid var(--border)' : score === 'pass' ? '3px solid var(--success)' : score === 'fail' ? '3px solid var(--danger)' : '3px solid var(--text-secondary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {number != null ? `${number}. ` : ''}{question.title}
            {question.is_ai_attribute && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>✨ AI Attribute</span>
            )}
            {aiSuggested && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', background: 'var(--accent-light)', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>✨ AI suggested — review</span>
            )}
            {question.is_form_critical && (
              <span className="badge badge-fail" style={{ marginLeft: 8, fontSize: 11 }}>Form Critical</span>
            )}
            {question.is_weighted && (
              <span style={{
                marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '2px 7px', fontWeight: 500
              }}>
                Weight: {question.weight}
              </span>
            )}
          </div>
          {question.description && (
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                onClick={() => setShowDesc(s => !s)}
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 6px', fontSize: 11, color: 'var(--text-secondary)', marginBottom: showDesc ? 6 : 0 }}
              >
                {showDesc ? '▲ Hide description' : '▼ Show description'}
              </button>
              {showDesc && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {question.description}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, minWidth: 220 }}>
          <button style={btnStyle('pass')} onClick={() => onChange({ score: 'pass' })}>✓ Pass</button>
          <button style={btnStyle('fail')} onClick={() => onChange({ score: 'fail' })}>✕ Fail</button>
          {question.allow_na !== false && (
            <button style={btnStyle('na')} onClick={() => onChange({ score: 'na' })}>N/A</button>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <input className="input" placeholder="Add a comment (optional)…"
          value={comment}
          onChange={e => onChange({ comment: e.target.value })}
          style={{ fontSize: 13 }} />
      </div>
      {aiReasoning && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6, background: 'var(--accent-light)', fontSize: 12, color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--accent)' }}>✨ AI reasoning:</strong> {aiReasoning}
        </div>
      )}
    </div>
  )
}

function SearchableDropdown({ options, value, onChange, placeholder = 'Select...' }) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const ref = React.useRef(null)
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  React.useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="select"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => { setOpen(o => !o); setSearch('') }}>
        <span style={{ color: value ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{value || placeholder}</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.8)', overflow: 'hidden'
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <input autoFocus className="input" placeholder="Search…" value={search}
              onChange={e => setSearch(e.target.value)} onClick={e => e.stopPropagation()}
              style={{ fontSize: 13, padding: '6px 10px' }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: 13 }}>No options match</div>
            ) : (
              filtered.map(opt => (
                <div key={opt} onClick={() => { onChange(opt); setOpen(false); setSearch('') }}
                  style={{
                    padding: '10px 14px', fontSize: 14, cursor: 'pointer',
                    color: opt === value ? 'var(--accent)' : 'var(--text-primary)',
                    background: opt === value ? 'rgba(99,102,241,0.08)' : 'transparent',
                    borderLeft: opt === value ? '3px solid var(--accent)' : '3px solid transparent',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => { if (opt !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { if (opt !== value) e.currentTarget.style.background = 'transparent' }}>
                  {opt}
                </div>
              ))
            )}
          </div>
          {value && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px' }}>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', fontSize: 12 }}
                onClick={() => { onChange(''); setOpen(false); setSearch('') }}>
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
