import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth.jsx'
import * as api from '../../api.js'
import {
  Clock, ChevronRight, ChevronLeft, ChevronDown, AlertTriangle, CheckCircle2,
  Anchor, BookOpen, Flag, RotateCcw, Send, User, X, Lock,
} from 'lucide-react'

/* ------------------------------------------------------------------
   Candidate exam runner.

   Deliberately modelled on the invigilated-exam interfaces candidates
   already know (TCS iON / NTA / Mettl): fixed chrome, a five-state
   question palette with a legend, and an explicit Mark-for-Review /
   Clear Response / Save & Next action bar. The palette state vocabulary
   is the part candidates read fastest, so it matches those products
   exactly rather than inventing our own.

   The page pins itself to a light theme regardless of the app theme —
   an exam surface should look identical for every candidate.
   ------------------------------------------------------------------ */

const PAD = n => String(n).padStart(2, '0')

// Lowercase letters label each image on a question: a, b, c, ... z, aa, ab, ...
const imageLabel = (i) => (i < 26 ? String.fromCharCode(97 + i) : imageLabel(Math.floor(i / 26) - 1) + imageLabel(i % 26))

/* ------------------------------------------------------------------
   Visual identity: the same deep-navy / brass language as the login
   and welcome screens (Anchor mark, navy gradient chrome) rather than
   the generic light-blue palette every off-the-shelf exam tool ships
   with. Brass marks the primary action and the currently-open item;
   teal/brick carry the answered/unanswered semantics; steel-indigo is
   reserved for "marked for review" so it never collides with either.
   ------------------------------------------------------------------ */
const C = {
  bg: '#eef1ee',
  panel: '#ffffff',
  panelAlt: '#f6f8f6',
  line: '#dde3de',
  lineSoft: '#eaeeea',
  ink: '#101f2b',
  inkMut: '#54697a',
  inkFaint: '#8aa0a8',
  brand: '#0d3355',
  brandDeep: '#082138',
  brandMid: '#b8842c',
  brandSoft: '#f7ecd9',
  ok: '#0f7d68',
  okSoft: '#e1f2ec',
  warn: '#9c5b12',
  warnSoft: '#fbeedb',
  danger: '#b23b2e',
  dangerSoft: '#fbe9e6',
  review: '#4a5a8f',
  reviewSoft: '#e9ebf5',
}

/* Palette vocabulary — the five states every invigilated-exam UI uses,
   carried by our own colour system rather than the industry-standard
   green/red/purple. */
const PSTATE = {
  answered:       { bg: C.ok,     fg: '#fff',    bd: C.ok,      label: 'Answered' },
  notAnswered:    { bg: C.danger, fg: '#fff',    bd: C.danger,  label: 'Not Answered' },
  notVisited:     { bg: '#fff',   fg: C.inkMut,  bd: '#c3cec8', label: 'Not Visited' },
  marked:         { bg: C.review, fg: '#fff',    bd: C.review,  label: 'Marked for Review' },
  answeredMarked: { bg: C.review, fg: '#fff',    bd: C.review,  label: 'Answered & Marked', dot: true },
}
const LEGEND_ORDER = ['answered', 'notAnswered', 'marked', 'answeredMarked', 'notVisited']

const PERSONAL_FIELDS = [
  { key: 'fullName',          label: 'Full Name',                            type: 'text',   readOnly: true },
  { key: 'mobileNumber',      label: 'Mobile Number',                        type: 'tel',    numeric: true },
  { key: 'instituteName',     label: 'Pre-Sea Training Institute',           type: 'text' },
  { key: 'yearOfPassing',     label: 'Year of Passing',                      type: 'number' },
  // % or CGPA vary by institute (e.g. "78%", "8.2 CGPA"), so this is free text, not a number field.
  { key: 'presseaPercentage', label: 'Pre-Sea Training % / CGPA',            type: 'text' },
  { key: 'class12Pcm',        label: 'Class 12 PCM %',                       type: 'number' },
  { key: 'class12English',    label: 'Class 12 English %',                   type: 'number' },
  {
    key: 'preferredShipType', label: 'Preferred Ship Type',                  type: 'select',
    options: ['Any Type', 'Bulk Carrier', 'Container Ship', 'Tanker (Oil)', 'Tanker (Chemical)', 'LNG/LPG Carrier', 'Offshore Vessel', 'General Cargo', 'Other'],
  },
  { key: 'familyInfo',        label: 'Tell Us About Your Family',            type: 'textarea', span: 3 },
  { key: 'fiveYearGoal',      label: 'Where do you see yourself in 5 years?', type: 'textarea', span: 3 },
]

function fmtTime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${PAD(h)}:${PAD(m)}:${PAD(s)}`
}

const LTRS = ['A', 'B', 'C', 'D', 'E', 'F']

/* ── Ring timer — a ship's-clock dial standing in for the usual digital pill ── */
function TimerRing({ seconds, fraction, color }) {
  const size = 46, stroke = 4, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <Clock size={16} color="#fff" style={{ position: 'absolute', inset: 0, margin: 'auto' }} />
    </div>
  )
}

/* ── Select ── */
function CardSelect({ label, value, onChange, options = [], required }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const missing = required && !value
  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.inkMut }}>
        {label} {required && <span style={{ color: C.danger }}>*</span>}
      </label>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${missing ? C.danger : C.line}`, background: '#fff', color: value ? C.ink : C.inkFaint, fontSize: 14, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', outline: 'none', boxShadow: open ? `0 0 0 3px ${C.brandSoft}` : 'none' }}>
        <span>{value || `Select ${label}`}</span>
        <ChevronDown size={15} style={{ color: C.inkFaint, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .15s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, marginTop: 4, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: '0 10px 32px rgba(16,24,40,.14)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {options.map(opt => (
            <div key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              style={{ padding: '10px 13px', fontSize: 13.5, cursor: 'pointer', background: value === opt ? C.brandSoft : '#fff', color: value === opt ? C.brand : C.ink, fontWeight: value === opt ? 700 : 400, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.lineSoft}` }}
              onMouseEnter={e => { if (value !== opt) e.currentTarget.style.background = C.panelAlt }}
              onMouseLeave={e => { if (value !== opt) e.currentTarget.style.background = '#fff' }}>
              {opt}
              {value === opt && <CheckCircle2 size={14} color={C.brand} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Text / number / textarea ── */
function Field({ label, value, onChange, readOnly, type = 'text', numeric = false }) {
  const missing = !readOnly && (!value || String(value).trim() === '')
  const base = {
    width: '100%', padding: '9px 12px', borderRadius: 6,
    border: `1px solid ${readOnly ? C.lineSoft : missing ? C.danger : C.line}`,
    background: readOnly ? C.panelAlt : '#fff',
    color: readOnly ? C.inkMut : C.ink,
    fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }
  // Digits only — strip anything else as it's typed/pasted rather than
  // validating after the fact, so a mobile number field can't end up with
  // letters or symbols in it.
  const handleChange = e => onChange?.(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.inkMut }}>
        {label} {!readOnly && <span style={{ color: C.danger }}>*</span>}
      </label>
      {type === 'textarea' ? (
        <textarea value={value || ''} onChange={handleChange} rows={3}
          style={{ ...base, resize: 'vertical' }}
          onFocus={e => { e.target.style.borderColor = C.brandMid; e.target.style.boxShadow = `0 0 0 3px ${C.brandSoft}` }}
          onBlur={e => { e.target.style.borderColor = missing ? C.danger : C.line; e.target.style.boxShadow = 'none' }} />
      ) : (
        <input type={type} value={value || ''} onChange={handleChange} readOnly={readOnly} style={base}
          inputMode={numeric ? 'numeric' : undefined}
          pattern={numeric ? '[0-9]*' : undefined}
          maxLength={numeric ? 15 : undefined}
          onFocus={e => { if (!readOnly) { e.target.style.borderColor = C.brandMid; e.target.style.boxShadow = `0 0 0 3px ${C.brandSoft}` } }}
          onBlur={e => { if (!readOnly) { e.target.style.borderColor = missing ? C.danger : C.line; e.target.style.boxShadow = 'none' } }} />
      )}
    </div>
  )
}

/* ── Action-bar button ── */
function Btn({ children, onClick, disabled, variant = 'default', style = {} }) {
  const V = {
    default: { bg: '#fff', fg: C.inkMut, bd: C.line },
    primary: { bg: C.brandMid, fg: '#fff', bd: C.brandMid },
    review:  { bg: C.reviewSoft, fg: C.review, bd: '#c7cce3' },
    submit:  { bg: C.ok, fg: '#fff', bd: C.ok },
  }[variant]
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '10px 18px', borderRadius: 6, fontFamily: 'inherit',
        fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap',
        border: `1px solid ${V.bd}`, background: V.bg, color: V.fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, transition: 'filter .12s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(.96)' }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
      {children}
    </button>
  )
}

export default function TestExam() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [testData,   setTestData]   = useState(null)
  const [secIdx,     setSecIdx]     = useState(() => { const v = parseInt(sessionStorage.getItem('ss_exam_section'), 10); return isNaN(v) ? 0 : v })
  const [qIdx,       setQIdx]       = useState(() => { const v = parseInt(sessionStorage.getItem('ss_exam_qidx'), 10); return isNaN(v) ? 0 : v })
  // Sections the candidate has opened at least once — navigation among the
  // question sections is completely free (any order, any time before
  // submit); this only drives the "done" tick in the stepper. Personal
  // Details is the one exception: it must be completed before you can
  // leave it, and once left it locks — see personalLocked below.
  const [secVisited, setSecVisited] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ss_exam_sec_visited') || '{}') } catch { return {} }
  })
  const [personalLocked, setPersonalLocked] = useState(() => sessionStorage.getItem('ss_exam_personal_locked') === '1')
  const [personalData, setPersonalData] = useState(() => { try { return JSON.parse(sessionStorage.getItem('ss_exam_personal') || '{}') } catch { return {} } })
  const [answers,    setAnswers]    = useState(() => { try { return JSON.parse(sessionStorage.getItem('ss_exam_answers') || '{}') } catch { return {} } })
  const [visited,    setVisited]    = useState(() => { try { return JSON.parse(sessionStorage.getItem('ss_exam_visited') || '{}') } catch { return {} } })
  const [marked,     setMarked]     = useState(() => { try { return JSON.parse(sessionStorage.getItem('ss_exam_marked') || '{}') } catch { return {} } })
  const [deadline,   setDeadline]   = useState(null)
  const [timeLeft,   setTimeLeft]   = useState(null)
  const [confirming, setConfirming] = useState(false)  // submit-confirmation dialog
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [notice,     setNotice]     = useState('')     // blocked-navigation message
  const [photoUrl,   setPhotoUrl]   = useState(null)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  const [tabWarning, setTabWarning] = useState('')      // separate from `notice` so it survives section changes
  const [saveState,  setSaveState]  = useState('idle')  // 'idle' | 'saving' | 'saved' | 'error'

  const submitRef = useRef(null)

  /* ── Load test ── */
  useEffect(() => {
    api.screeningGetTest().then(data => {
      if (data.attempt?.status === 'submitted') { navigate('/test/result', { replace: true }); return }
      setTestData(data)
      // Prefer the server's own remaining-time figure: it is computed against
      // the DB clock, so a candidate's device timezone or a skewed local clock
      // cannot lengthen or shorten the exam. Fall back to the full duration
      // only when the attempt has not been started yet.
      const total = (data.timerMinutes || 80) * 60
      const left = Number.isFinite(data.remainingSeconds) && data.remainingSeconds !== null
        ? data.remainingSeconds
        : total
      setDeadline(Date.now() + left * 1000)
      setTimeLeft(left)

      // Resume from the server's last autosave when local browser storage has
      // nothing for this attempt — covers a power-off/crash that wiped session
      // storage, or the candidate logging back in on a different device.
      const serverAnswers = data.attempt?.sectionAnswers
      if (serverAnswers && Object.keys(serverAnswers).length > 0) {
        setAnswers(prev => (Object.keys(prev).length > 0 ? prev : serverAnswers))
      }
      const serverPersonal = data.attempt?.personalData
      setPersonalData(p => {
        const base = Object.keys(p).length > 0 ? p : (serverPersonal || {})
        return { ...base, fullName: user?.name || base.fullName || '' }
      })

      setTabSwitchCount(data.attempt?.tabSwitchCount || 0)
    }).catch(err => setError('Could not load the assessment: ' + err.message))
  }, [])

  /* ── Identity photo (bearer-auth'd, so fetched as an object URL) ── */
  useEffect(() => {
    let url = null
    api.screeningPhotoObjectUrl().then(u => { url = u; if (u) setPhotoUrl(u) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [])

  /* ── Countdown, driven off a fixed deadline so it cannot drift ── */
  useEffect(() => {
    if (!deadline) return
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      setTimeLeft(left)
      if (left <= 0) submitRef.current?.(true)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [deadline])

  /* ── Persist ── */
  useEffect(() => { sessionStorage.setItem('ss_exam_section', secIdx) }, [secIdx])
  useEffect(() => { setSecVisited(v => (v[secIdx] ? v : { ...v, [secIdx]: true })) }, [secIdx])
  useEffect(() => { sessionStorage.setItem('ss_exam_sec_visited', JSON.stringify(secVisited)) }, [secVisited])
  useEffect(() => { sessionStorage.setItem('ss_exam_qidx', qIdx) }, [qIdx])
  useEffect(() => { sessionStorage.setItem('ss_exam_personal', JSON.stringify(personalData)) }, [personalData])
  useEffect(() => { sessionStorage.setItem('ss_exam_answers', JSON.stringify(answers)) }, [answers])
  useEffect(() => { sessionStorage.setItem('ss_exam_visited', JSON.stringify(visited)) }, [visited])
  useEffect(() => { sessionStorage.setItem('ss_exam_marked', JSON.stringify(marked)) }, [marked])
  useEffect(() => { sessionStorage.setItem('ss_exam_personal_locked', personalLocked ? '1' : '0') }, [personalLocked])

  /* ── Autosave to the server. sessionStorage above only survives a page
     refresh in the same browser — it's gone if the device loses power or
     crashes. This periodically writes the candidate's in-progress answers
     to ScreeningAttempt.section_answers so that's recoverable; it never
     grades or finalises anything (only /submit does that). ── */
  const answersRef = useRef(answers)
  useEffect(() => { answersRef.current = answers }, [answers])
  const personalDataRef = useRef(personalData)
  useEffect(() => { personalDataRef.current = personalData }, [personalData])
  const savingRef = useRef(false)

  const doAutosave = useCallback(async () => {
    if (!testData || submitting || savingRef.current) return
    savingRef.current = true
    setSaveState('saving')
    try {
      const payload = {}
      for (const sec of (testData.sections || [])) {
        if (sec.type === 'personal_data') continue
        payload[sec.id] = (sec.questions || []).map((_, i) => answersRef.current[sec.id]?.[i] ?? null)
      }
      await api.screeningAutosave({ personal_data: personalDataRef.current, section_answers: payload })
      setSaveState('saved')
    } catch {
      setSaveState('error')
    } finally {
      savingRef.current = false
    }
  }, [testData, submitting])

  // Debounced: fires shortly after the candidate stops changing anything.
  useEffect(() => {
    if (!testData || submitting) return
    const t = setTimeout(doAutosave, 2500)
    return () => clearTimeout(t)
  }, [answers, personalData, testData, submitting, doAutosave])

  // Safety-net interval, independent of the debounce above, plus a
  // best-effort save the moment the tab is hidden/backgrounded (device
  // sleep, browser/tab switch) so a save is never more than ~20s stale.
  useEffect(() => {
    if (!testData || submitting) return
    const id = setInterval(doAutosave, 20000)
    const onHide = () => { if (document.visibilityState === 'hidden') doAutosave() }
    document.addEventListener('visibilitychange', onHide)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide) }
  }, [testData, submitting, doAutosave])

  const sections   = testData?.sections || []
  const section    = sections[secIdx]
  const secId      = section?.id
  const isPersonal = section?.type === 'personal_data'
  const isCompre   = !isPersonal && !!section?.passage
  const questions  = section?.questions || []
  const totalQ     = questions.length
  const isLastSection = secIdx === sections.length - 1
  const personalIdx = sections.findIndex(s => s.type === 'personal_data')

  /* ── Tab/window-switch detection. The browser can't block a candidate from
     leaving the tab or asking someone/something else off-screen, but it can
     notice and record it — the count is persisted server-side (survives a
     refresh) and shown to admins for manual review.

     Only counts once Personal Details is done: that section is just a form,
     not a question section, so leaving the tab there isn't cheating — this
     starts tracking only once the candidate is into the actual test. ── */
  const isPersonalRef = useRef(isPersonal)
  useEffect(() => { isPersonalRef.current = isPersonal })

  useEffect(() => {
    if (!testData) return
    const onVisibility = () => {
      if (isPersonalRef.current) return
      if (document.visibilityState !== 'visible') {
        api.screeningTabSwitch()
          .then(r => setTabSwitchCount(r.tabSwitchCount))
          .catch(() => {})
        setTabWarning('You switched away from the assessment tab. This has been recorded and is visible to the administrator.')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [testData])

  // Required-field markers show on each input regardless; this also gates
  // leaving Personal Details and gates Submit everywhere else.
  const personalMissing = PERSONAL_FIELDS.filter(f => {
    if (f.readOnly) return false
    const v = personalData[f.key]
    return !v || String(v).trim() === ''
  })

  const secAnswers = (secId && answers[secId]) || []

  /* Mark questions visited as the candidate reaches them. A comprehension
     section shows every question at once, so entering it visits them all. */
  useEffect(() => {
    if (!secId || isPersonal || totalQ === 0) return
    setVisited(prev => {
      const cur = prev[secId] || {}
      if (isCompre) {
        if (questions.every((_, i) => cur[i])) return prev
        const all = {}
        questions.forEach((_, i) => { all[i] = true })
        return { ...prev, [secId]: { ...cur, ...all } }
      }
      if (cur[qIdx]) return prev
      return { ...prev, [secId]: { ...cur, [qIdx]: true } }
    })
  }, [secId, qIdx, isPersonal, isCompre, totalQ])

  useEffect(() => { setNotice('') }, [secIdx])

  const stateOf = useCallback((qi) => {
    const a = secAnswers[qi]
    const isA = a !== null && a !== undefined
    const isM = !!marked[secId]?.[qi]
    if (isA && isM) return 'answeredMarked'
    if (isM) return 'marked'
    if (isA) return 'answered'
    if (visited[secId]?.[qi]) return 'notAnswered'
    return 'notVisited'
  }, [secAnswers, marked, visited, secId])

  const counts = useMemo(() => {
    const c = { answered: 0, notAnswered: 0, notVisited: 0, marked: 0, answeredMarked: 0 }
    for (let i = 0; i < totalQ; i++) c[stateOf(i)]++
    return c
  }, [totalQ, stateOf])

  const answeredCount = counts.answered + counts.answeredMarked
  const pct = totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0

  // Test-wide tally for the submit-confirmation dialog — the candidate can
  // jump between sections freely, so "answered" has to mean across the
  // whole test by the time they hit Submit, not just the section they
  // happen to be sitting in.
  const overall = useMemo(() => {
    let total = 0, answered = 0, marked_ = 0
    for (const sec of sections) {
      if (sec.type === 'personal_data') continue
      const secQs = sec.questions || []
      total += secQs.length
      const secAns = answers[sec.id] || []
      secQs.forEach((_, i) => {
        if (secAns[i] !== null && secAns[i] !== undefined) answered++
        if (marked[sec.id]?.[i]) marked_++
      })
    }
    return { total, answered, unanswered: total - answered, marked: marked_ }
  }, [sections, answers, marked])

  const setAnswer = (qi, ai) => setAnswers(prev => ({
    ...prev,
    [secId]: questions.map((_, j) => (j === qi ? ai : (prev[secId]?.[j] ?? null))),
  }))

  const clearAnswer = (qi) => setAnswers(prev => ({
    ...prev,
    [secId]: questions.map((_, j) => (j === qi ? null : (prev[secId]?.[j] ?? null))),
  }))

  const toggleMark = (qi) => setMarked(prev => {
    const cur = { ...(prev[secId] || {}) }
    if (cur[qi]) delete cur[qi]; else cur[qi] = true
    return { ...prev, [secId]: cur }
  })

  // Plain Save & Next commits the answer and drops any review flag — Mark
  // for Review & Next is the only action that leaves a question marked.
  const unmark = (qi) => setMarked(prev => {
    const cur = { ...(prev[secId] || {}) }
    delete cur[qi]
    return { ...prev, [secId]: cur }
  })

  const gotoQ = (qi) => {
    setQIdx(qi)
    if (isCompre) {
      requestAnimationFrame(() =>
        document.getElementById(`q-${qi}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }

  // Navigation among the question sections is free — any order, any number
  // of times, right up until submit. Personal Details is the one gated,
  // one-way exception: you cannot leave it incomplete, and once you leave
  // it (with it complete) it locks — you cannot come back in.
  const goToSection = (i) => {
    if (i < 0 || i >= sections.length || i === secIdx) return
    if (i === personalIdx && personalLocked) {
      setNotice('Personal Details is locked once you move on from it.')
      return
    }
    if (secIdx === personalIdx && personalMissing.length > 0) {
      setNotice(`Complete all required personal details first — ${personalMissing.length} still empty.`)
      return
    }
    if (secIdx === personalIdx) setPersonalLocked(true)
    setSecIdx(i)
    setQIdx(0)
  }
  const handlePrevSection = () => goToSection(secIdx - 1)
  const handleNextSection = () => {
    if (isLastSection) { setConfirming(true); return }
    goToSection(secIdx + 1)
  }

  /* ── Submit ── */
  const handleSubmit = useCallback(async (auto = false) => {
    if (submitting) return
    setSubmitting(true); setConfirming(false)
    try {
      // The server grades by looking each section up by id
      // (`section_answers[section.id]`), so send a map, not a list. Every MCQ
      // section is included even when untouched, so an unvisited section is
      // graded as unanswered rather than silently skipped.
      const payload = {}
      for (const sec of (testData?.sections || [])) {
        if (sec.type === 'personal_data') continue
        payload[sec.id] = (sec.questions || []).map((_, i) => answers[sec.id]?.[i] ?? null)
      }
      await api.screeningSubmit({ personal_data: personalData, section_answers: payload })
      ;['ss_exam_section', 'ss_exam_sec_visited', 'ss_exam_personal_locked', 'ss_exam_qidx', 'ss_exam_personal', 'ss_exam_answers', 'ss_exam_visited', 'ss_exam_marked']
        .forEach(k => sessionStorage.removeItem(k))
      navigate('/test/result')
    } catch (err) { setError(err.message); setSubmitting(false) }
  }, [submitting, testData, personalData, answers, navigate])

  // keep the auto-submit timer pointed at the latest state
  useEffect(() => { submitRef.current = handleSubmit }, [handleSubmit])

  /* ── Error / loading ── */
  if (error) return (
    <Shell>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: 36, maxWidth: 420, textAlign: 'center', boxShadow: '0 4px 20px rgba(16,24,40,.08)' }}>
        <AlertTriangle size={38} color={C.danger} style={{ marginBottom: 14 }} />
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: C.ink }}>Unable to load the assessment</div>
        <div style={{ color: C.inkMut, fontSize: 14, marginBottom: 22, lineHeight: 1.6 }}>{error}</div>
        <Btn variant="primary" onClick={() => window.location.reload()} style={{ margin: '0 auto' }}>Retry</Btn>
      </div>
    </Shell>
  )

  if (!testData || timeLeft === null) return (
    <Shell>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: C.inkFaint }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.line}`, borderTopColor: C.brandMid, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Loading assessment…</span>
      </div>
    </Shell>
  )

  const low = timeLeft <= 300
  const mid = timeLeft <= 600
  const timerFg = low ? '#f0a99f' : mid ? '#f3cf8c' : '#7fd4bd'
  const totalSeconds = (testData.timerMinutes || 80) * 60
  const timerFraction = totalSeconds > 0 ? Math.max(0, Math.min(1, timeLeft / totalSeconds)) : 0

  const shownQs = isCompre
    ? questions.map((q, i) => ({ q, qi: i }))
    : (questions[qIdx] ? [{ q: questions[qIdx], qi: qIdx }] : [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.ink, overflow: 'hidden', fontFamily: '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; }
        .opt { transition: border-color .12s, background .12s; }
        .opt:hover { border-color: ${C.brandMid}; background: ${C.brandSoft}; }
        .pal { transition: transform .1s; }
        .pal:hover { transform: translateY(-1px); }
        .scroll::-webkit-scrollbar { width: 10px; }
        .scroll::-webkit-scrollbar-thumb { background: #cbd3dc; border-radius: 6px; border: 3px solid ${C.bg}; }
        .scroll::-webkit-scrollbar-track { background: transparent; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* ══ Header — same navy chrome as the login / welcome screens ══ */}
      <header style={{ flexShrink: 0, background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDeep} 100%)`, height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 18, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0)', backgroundSize: '24px 24px', pointerEvents: 'none' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 11, position: 'relative' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: C.brandMid, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Anchor size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Ozellar Marine</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: -1, color: '#fff' }}>Assessment Portal</div>
          </div>
        </div>

        <div style={{ height: 32, width: 1, background: 'rgba(255,255,255,.15)', position: 'relative' }} />

        <div style={{ minWidth: 0, flex: 1, position: 'relative' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.5)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Assessment</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{testData.title}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', animation: low ? 'blink 1.4s infinite' : 'none' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.09em' }}>Time Remaining</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#fff', lineHeight: 1.1 }}>{fmtTime(timeLeft)}</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, marginTop: 2, color: saveState === 'error' ? '#f0a99f' : 'rgba(255,255,255,.6)' }}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Progress saved' : saveState === 'error' ? 'Save failed — retrying' : ' '}
            </div>
          </div>
          <TimerRing seconds={timeLeft} fraction={timerFraction} color={timerFg} />
        </div>
      </header>

      {/* ══ Section bar — a voyage route of waypoints rather than a plain tab strip ══ */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: `1px solid ${C.line}`, height: 46, display: 'flex', alignItems: 'center' }}>
        <div className="scroll" style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', padding: '0 24px', height: '100%' }}>
          {sections.map((sec, i) => {
            const active = i === secIdx
            const done = !!secVisited[i] && !active
            const isLast = i === sections.length - 1
            const lockedOut = i === personalIdx && personalLocked && !active
            return (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button type="button" onClick={() => goToSection(i)}
                  title={lockedOut ? 'Personal Details is locked once you move on' : `Go to "${sec.title}"`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                    background: 'none', border: 'none', padding: 0, font: 'inherit',
                    cursor: lockedOut ? 'not-allowed' : 'pointer',
                  }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 10, fontWeight: 800, flexShrink: 0,
                    background: active ? C.brandMid : done ? C.ok : '#fff',
                    color: active || done ? '#fff' : C.inkFaint,
                    border: `1.5px solid ${active ? C.brandMid : done ? C.ok : '#c3cec8'}`,
                  }}>
                    {lockedOut ? <Lock size={10} /> : done ? <CheckCircle2 size={11} /> : i + 1}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : 600,
                    color: active ? C.ink : lockedOut ? C.inkFaint : done ? C.ok : C.inkFaint,
                    whiteSpace: 'nowrap',
                    textDecoration: lockedOut ? 'none' : `underline solid ${C.lineSoft}`, textUnderlineOffset: 3,
                  }}>
                    {sec.title}
                  </span>
                </button>
                {!isLast && <div style={{ width: 32, height: 2, background: done ? C.ok : C.lineSoft, margin: '0 14px', flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', height: '100%', padding: '0 24px', borderLeft: `1px solid ${C.lineSoft}`, fontSize: 12, color: C.inkFaint, fontWeight: 600, whiteSpace: 'nowrap' }}>
          Marking&nbsp;<strong style={{ color: C.ok }}>+{testData.correctScore}</strong>&nbsp;/&nbsp;<strong style={{ color: C.danger }}>−{testData.wrongPenalty}</strong>
        </div>
      </div>

      {/* ══ Body — the right rail runs the full height down to the bottom of
          the window, so the action bar below only spans the question column
          and Submit sits alone at the foot of the rail, well clear of the
          Next / Save & Next buttons. ══ */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Question column + its action bar ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px', minWidth: 0 }}>
          <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {tabWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.dangerSoft, border: '1px solid #edc4bb', borderRadius: 8, padding: '11px 15px', color: C.danger, fontSize: 13.5, fontWeight: 600 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                {tabWarning}
                <button onClick={() => setTabWarning('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'grid', placeItems: 'center' }}><X size={14} /></button>
              </div>
            )}

            {notice && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.warnSoft, border: `1px solid #f0dcae`, borderRadius: 8, padding: '11px 15px', color: C.warn, fontSize: 13.5, fontWeight: 600 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                {notice}
                <button onClick={() => setNotice('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'grid', placeItems: 'center' }}><X size={14} /></button>
              </div>
            )}

            {/* Personal details */}
            {isPersonal && (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10 }}>
                <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.lineSoft}`, background: C.panelAlt, borderRadius: '10px 10px 0 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{section.title}</div>
                  <div style={{ fontSize: 12.5, color: C.inkMut, marginTop: 3 }}>
                    All fields marked <span style={{ color: C.danger, fontWeight: 700 }}>*</span> are required. These details form part of your application record.
                  </div>
                </div>
                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {PERSONAL_FIELDS.map(f => (
                    <div key={f.key} style={{ gridColumn: f.span ? `span ${f.span}` : 'span 1' }}>
                      {f.type === 'select' ? (
                        <CardSelect label={f.label} value={personalData[f.key]} options={f.options} required
                          onChange={v => setPersonalData(p => ({ ...p, [f.key]: v }))} />
                      ) : (
                        <Field label={f.label} type={f.type} value={personalData[f.key]} readOnly={f.readOnly} numeric={f.numeric}
                          onChange={v => setPersonalData(p => ({ ...p, [f.key]: v }))} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Passage */}
            {isCompre && (
              <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 18px', background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}`, fontSize: 10.5, fontWeight: 700, color: C.inkMut, textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <BookOpen size={13} /> Reading Passage
                </div>
                <p style={{ margin: 0, padding: '18px 22px', fontSize: 14.5, lineHeight: 1.85, color: C.ink, whiteSpace: 'pre-wrap' }}>{section.passage}</p>
              </div>
            )}

            {/* Questions */}
            {shownQs.map(({ q, qi }) => {
              const sel = secAnswers[qi]
              const isM = !!marked[secId]?.[qi]
              return (
                <div key={qi} id={`q-${qi}`} style={{ background: '#fff', border: `1px solid ${isM ? '#d7c2f7' : C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '13px 20px', background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.brand, letterSpacing: '.02em' }}>
                      Question {qi + 1}
                      <span style={{ color: C.inkFaint, fontWeight: 600 }}> of {totalQ}</span>
                    </span>
                    {isM && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: C.review, background: C.reviewSoft, border: '1px solid #d7c2f7', padding: '2px 9px', borderRadius: 20 }}>
                        <Flag size={10} /> {sel !== null && sel !== undefined ? 'Answered & marked for review' : 'Marked for review'}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: C.inkFaint }}>
                      <span style={{ color: C.ok }}>+{testData.correctScore}</span> / <span style={{ color: C.danger }}>−{testData.wrongPenalty}</span>
                    </span>
                  </div>

                  <div style={{ padding: '20px 22px' }}>
                    <p style={{ margin: '0 0 18px', fontSize: 15.5, fontWeight: 600, lineHeight: 1.65, color: C.ink, whiteSpace: 'pre-wrap' }}>{q.prompt}</p>
                    {(q.imageUrls || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
                        {q.imageUrls.map((url, imgIdx) => (
                          <div key={imgIdx} style={{ position: 'relative' }}>
                            <img src={url} alt={`Figure ${imageLabel(imgIdx)}`} style={{ display: 'block', maxWidth: 320, maxHeight: 320, borderRadius: 8, border: `1px solid ${C.line}` }} />
                            <span style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(16,31,43,.78)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                              {imageLabel(imgIdx)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      {(q.options || []).map((opt, oi) => {
                        const on = sel === oi
                        return (
                          <label key={oi} className={on ? '' : 'opt'}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderRadius: 8, cursor: 'pointer',
                              border: `1.5px solid ${on ? C.brandMid : C.line}`,
                              background: on ? C.brandSoft : '#fff',
                            }}>
                            <input type="radio" name={`q-${secId}-${qi}`} checked={on} onChange={() => setAnswer(qi, oi)}
                              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                            <span style={{
                              width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                              fontWeight: 800, fontSize: 12, flexShrink: 0,
                              background: on ? C.brandMid : '#fff', color: on ? '#fff' : C.inkMut,
                              border: `1.5px solid ${on ? C.brandMid : '#c3cad3'}`,
                            }}>{LTRS[oi]}</span>
                            <span style={{ fontSize: 14.5, lineHeight: 1.55, color: on ? C.brand : C.ink, fontWeight: on ? 600 : 400 }}>{opt}</span>
                          </label>
                        )
                      })}
                    </div>

                    {/* Mark/Clear live under the question itself rather than in the
                        footer — they act on this specific question, so they read
                        more clearly here, and it keeps the footer to just the
                        section/question navigation buttons. */}
                    <div style={{ display: 'flex', gap: 9, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.lineSoft}` }}>
                      <Btn variant={isM ? 'review' : 'default'} onClick={() => toggleMark(qi)}>
                        <Flag size={13} /> {isM ? 'Unmark' : 'Mark for Review'}
                      </Btn>
                      <Btn onClick={() => clearAnswer(qi)} disabled={sel === null || sel === undefined}>
                        <RotateCcw size={13} /> Clear Response
                      </Btn>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ══ Action bar — spans only the question column now that the rail
            runs full height, so it never sits alongside Submit. Section
            navigation is completely free: any section, any order, any time
            before submit. Previous/Next Section sit on the left since they're
            the primary way to move around the test; the intra-section
            Previous/Save & Next pair (MCQ sections only) pages through that
            section's own questions and stays on the right. Wraps to a second
            row rather than overflowing when the column gets narrow. ══ */}
        <footer style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${C.line}`, padding: '12px 24px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          {isPersonal ? (
            <>
              <div style={{ fontSize: 12.5, color: C.inkMut }}>
                {personalMissing.length === 0
                  ? 'All required details captured.'
                  : `${personalMissing.length} required field${personalMissing.length !== 1 ? 's' : ''} still empty.`}
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <Btn variant="primary" onClick={handleNextSection} disabled={isLastSection}>
                  Next Section <ChevronRight size={15} />
                </Btn>
              </div>
            </>
          ) : isCompre ? (
            /* Comprehension sections show every question on one page — there's
               no per-question "next" to page through, so unlike the MCQ branch
               below, this is a single, unambiguous forward action (mirrors the
               Personal Details footer): Next Section. Submitting itself only
               ever happens from the button at the foot of the rail. */
            <>
              <Btn onClick={handlePrevSection} disabled={secIdx === 0 || (secIdx - 1 === personalIdx && personalLocked)}>
                <ChevronLeft size={15} /> Previous Section
              </Btn>
              <div style={{ marginLeft: 'auto' }}>
                <Btn variant="primary" onClick={handleNextSection} disabled={isLastSection}>
                  Next Section <ChevronRight size={15} />
                </Btn>
              </div>
            </>
          ) : (
            <>
              <Btn onClick={handlePrevSection} disabled={secIdx === 0 || (secIdx - 1 === personalIdx && personalLocked)}>
                <ChevronLeft size={15} /> Previous Section
              </Btn>
              {/* Secondary styling — Save & Next is the primary way through a
                  section; jumping sections outright is a less common action and
                  shouldn't compete with it. Disabled outright once there's no next
                  section to jump to — submitting happens from the rail. */}
              <Btn onClick={handleNextSection} disabled={isLastSection}>
                Next Section <ChevronRight size={15} />
              </Btn>

              {/* Previous/Save & Next: pages through this section's own questions.
                  Mark for Review and Clear Response live under the question
                  itself now (see the question card above), so this bar is just
                  navigation. On the last question this becomes "Save & Next
                  Section" (jumps straight there); on the last question of the
                  last section there's nowhere left to advance to, so it's just
                  disabled — submitting only ever happens from the rail. */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Btn onClick={() => gotoQ(Math.max(0, qIdx - 1))} disabled={qIdx === 0}>
                  <ChevronLeft size={15} /> Previous
                </Btn>
                {qIdx < totalQ - 1 ? (
                  <Btn variant="primary" onClick={() => { unmark(qIdx); gotoQ(qIdx + 1) }}>
                    Save &amp; Next <ChevronRight size={15} />
                  </Btn>
                ) : isLastSection ? (
                  <Btn variant="primary" onClick={() => setConfirming(true)} disabled={personalMissing.length > 0}>
                    Done — Review &amp; Submit <ChevronRight size={15} />
                  </Btn>
                ) : (
                  <Btn variant="primary" onClick={() => { unmark(qIdx); handleNextSection() }}>
                    Save &amp; Next Section <ChevronRight size={15} />
                  </Btn>
                )}
              </div>
            </>
          )}
        </footer>
        </div>

        {/* ── Right rail — full window height, so Submit sits below the
            action bar rather than beside it ── */}
        <aside style={{ width: 296, flexShrink: 0, background: '#fff', borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

          {/* Candidate */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            {photoUrl ? (
              <img src={photoUrl} alt="" style={{ width: 46, height: 46, borderRadius: 6, objectFit: 'cover', border: `1px solid ${C.line}`, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 6, background: C.brandSoft, border: `1px solid ${C.line}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <User size={20} color={C.brand} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'Candidate'}</div>
              <div style={{ fontSize: 11.5, color: C.inkFaint, marginTop: 1 }}>Section {secIdx + 1} of {sections.length}</div>
            </div>
          </div>

          {/* Tab-switch counter — turns red at 3+ so the candidate feels the
              same pressure an admin reviewing it later will see. */}
          {tabSwitchCount > 0 && (
            <div style={{
              margin: '10px 18px 0', padding: '8px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
              background: tabSwitchCount >= 3 ? C.dangerSoft : C.warnSoft,
              border: `1px solid ${tabSwitchCount >= 3 ? '#edc4bb' : '#f0dcae'}`,
            }}>
              <AlertTriangle size={13} color={tabSwitchCount >= 3 ? C.danger : C.warn} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: tabSwitchCount >= 3 ? C.danger : C.warn }}>
                Tab switches: {tabSwitchCount}
              </span>
            </div>
          )}

          {isPersonal ? (
            <div style={{ padding: 18, fontSize: 13, color: C.inkMut, lineHeight: 1.7 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Before you begin</div>
              Complete every required field here before moving on — once you leave this section you cannot come back to it.
              {personalMissing.length > 0 && (
                <div style={{ marginTop: 14, background: C.warnSoft, border: '1px solid #f0dcae', borderRadius: 8, padding: '10px 13px', color: C.warn, fontSize: 12.5, fontWeight: 600 }}>
                  {personalMissing.length} field{personalMissing.length !== 1 ? 's' : ''} still required
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Legend */}
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 11 }}>Legend</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
                  {LEGEND_ORDER.map(k => {
                    const s = PSTATE[k]
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.inkMut, fontWeight: 500 }}>
                        <span style={{ position: 'relative', width: 18, height: 18, borderRadius: '50%', background: s.bg, border: `1px solid ${s.bd}`, color: s.fg, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                          {counts[k]}
                          {s.dot && <span style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: C.ok, border: '2px solid #fff', boxShadow: '0 0 0 1px ' + C.ok }} />}
                        </span>
                        <span style={{ lineHeight: 1.25 }}>{s.label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Progress */}
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkMut }}>Progress</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: pct === 100 ? C.ok : C.brandMid }}>{answeredCount}/{totalQ}</span>
                </div>
                <div style={{ height: 6, background: C.lineSoft, borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.ok : C.brandMid, borderRadius: 99, transition: 'width .25s' }} />
                </div>
              </div>

              {/* Palette */}
              <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', minHeight: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 11 }}>Question Palette</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {questions.map((_, qi) => {
                    const s = PSTATE[stateOf(qi)]
                    const cur = !isCompre && qi === qIdx
                    return (
                      <button key={qi} className="pal" onClick={() => gotoQ(qi)}
                        style={{
                          position: 'relative', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer',
                          background: s.bg, color: s.fg, border: `1px solid ${s.bd}`,
                          fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', padding: 0,
                          outline: cur ? `2.5px solid ${C.brandMid}` : 'none', outlineOffset: 2,
                        }}>
                        {qi + 1}
                        {s.dot && <span style={{ position: 'absolute', top: -3, right: -2, width: 11, height: 11, borderRadius: '50%', background: C.ok, border: '2px solid #fff', boxShadow: '0 0 0 1px ' + C.ok }} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Submit — the one and only submit control, pinned to the foot of
              the rail. The rail runs the full window height, so this sits
              below the action bar rather than beside it and can't be hit by
              someone reaching for Next / Save & Next. */}
          <div style={{ marginTop: 'auto', padding: 16, borderTop: `1px solid ${C.lineSoft}`, background: C.panelAlt }}>
            <Btn variant="submit" disabled={submitting || personalMissing.length > 0}
              onClick={() => setConfirming(true)}
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              <Send size={14} /> Submit Assessment
            </Btn>
            {personalMissing.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: C.inkFaint, textAlign: 'center' }}>
                Complete Personal Details to enable submission
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ══ Submit confirmation ══ */}
      {confirming && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(16,24,40,.5)', display: 'grid', placeItems: 'center', zIndex: 999, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 24px 64px rgba(16,24,40,.24)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: C.okSoft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Send size={17} color={C.ok} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Submit assessment?</div>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 16px', color: C.inkMut, fontSize: 13.5, lineHeight: 1.7 }}>
                Your answers will be graded and finalised. You will not be able to return to the assessment.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 4 }}>
                {[
                  { label: 'Answered',   value: overall.answered,   color: C.ok,     bg: C.okSoft },
                  { label: 'Unanswered', value: overall.unanswered, color: C.danger, bg: C.dangerSoft },
                  { label: 'Marked',     value: overall.marked,     color: C.review, bg: C.reviewSoft },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: s.color, opacity: .85, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {personalMissing.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: C.warnSoft, border: '1px solid #f0dcae', borderRadius: 8, padding: '9px 12px', color: C.warn, fontSize: 12.5, fontWeight: 600 }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {personalMissing.length} personal detail field{personalMissing.length !== 1 ? 's' : ''} still empty
                </div>
              )}
            </div>

            <div style={{ padding: '14px 24px', background: C.panelAlt, borderTop: `1px solid ${C.lineSoft}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Btn onClick={() => setConfirming(false)} disabled={submitting}>Cancel</Btn>
              <Btn variant="submit" disabled={submitting} onClick={() => handleSubmit(false)}>
                {submitting ? 'Submitting…' : 'Yes, submit'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* Centred full-screen wrapper for the loading / error states. */
function Shell({ children }) {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: C.bg, fontFamily: '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif' }}>
      {children}
    </div>
  )
}
