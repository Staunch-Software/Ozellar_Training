import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../../api.js'
import {
  Clock, ChevronRight, ChevronLeft, ChevronDown, CheckCircle2, Check,
  Anchor, BookOpen, User, ArrowLeft, Eye, Shield, Layers, AlertCircle,
  HelpCircle, CheckSquare, List, Grid, Maximize, X
} from 'lucide-react'

/* ------------------------------------------------------------------
   Admin Assessment Test Preview runner.
   Mirrors the candidate test user view (TestExam.jsx) exactly, but in
   an administrative verification mode:
   - Correct answers are prominently highlighted.
   - All section and question gating/locking is disabled.
   - Fixed light palette and layout identical to the candidate screen.
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
  brand: '#0f766e',
  brandDeep: '#123c3a',
  brandMid: '#b8842c',
  brandSoft: 'rgba(224,120,32,0.1)',
  ok: '#0f7d68',
  okSoft: '#e1f2ec',
  warn: '#9c5b12',
  warnSoft: '#fbeedb',
  danger: '#b23b2e',
  dangerSoft: '#fbe9e6',
  review: '#4a5a8f',
  reviewSoft: '#e9ebf5',
}

const LTRS = ['A', 'B', 'C', 'D', 'E', 'F']

// Lowercase letters label each image on a question: a, b, c, ... z
const imageLabel = (i) => (i < 26 ? String.fromCharCode(97 + i) : imageLabel(Math.floor(i / 26) - 1) + imageLabel(i % 26))

const PERSONAL_FIELDS = [
  { key: 'fullName',          label: 'Full Name',                            type: 'text',   readOnly: true, sample: 'Rahul Sharma (Candidate)' },
  { key: 'mobileNumber',      label: 'Mobile Number',                        type: 'tel',    numeric: true,  sample: '9876543210' },
  { key: 'instituteName',     label: 'Pre-Sea Training Institute',           type: 'text',   sample: 'Tolani Maritime Institute' },
  { key: 'yearOfPassing',     label: 'Year of Passing',                      type: 'number', sample: '2025' },
  { key: 'presseaPercentage', label: 'Pre-Sea Training % / CGPA',            type: 'text',   sample: '84%' },
  { key: 'class12Pcm',        label: 'Class 12 PCM %',                       type: 'number', sample: '78%' },
  { key: 'class12English',    label: 'Class 12 English %',                   type: 'number', sample: '86%' },
  {
    key: 'preferredShipType', label: 'Preferred Ship Type',                  type: 'select', sample: 'Container Ship',
    options: ['Any Type', 'Bulk Carrier', 'Container Ship', 'Tanker (Oil)', 'Tanker (Chemical)', 'LNG/LPG Carrier', 'Offshore Vessel', 'General Cargo', 'Other'],
  },
  { key: 'familyInfo',        label: 'Tell Us About Your Family',            type: 'textarea', span: 3, sample: 'Sample family background info provided by candidate during test start.' },
  { key: 'fiveYearGoal',      label: 'Where do you see yourself in 5 years?', type: 'textarea', span: 3, sample: 'Aiming to sail as 3rd Engineer / 2nd Mate with Ozellar Marine.' },
]

function Btn({ children, onClick, disabled, variant = 'default', style = {} }) {
  const V = {
    default: { bg: '#fff', fg: C.inkMut, bd: C.line },
    primary: { bg: C.brandMid, fg: '#fff', bd: C.brandMid },
    teal:    { bg: C.brand, fg: '#fff', bd: C.brand },
    review:  { bg: C.reviewSoft, fg: C.review, bd: '#c7cce3' },
  }[variant] || { bg: '#fff', fg: C.inkMut, bd: C.line }

  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '9px 16px', borderRadius: 6, fontFamily: 'inherit',
        fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
        border: `1px solid ${V.bd}`, background: V.bg, color: V.fg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1, transition: 'filter .12s, opacity .12s',
        ...style,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(.96)' }}
      onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
      {children}
    </button>
  )
}

export default function AdminScreeningPreview() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [testData, setTestData] = useState(null)
  const [secIdx, setSecIdx] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [viewMode, setViewMode] = useState('single') // 'single' | 'all'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fullScreenImage, setFullScreenImage] = useState(null)

  useEffect(() => {
    setLoading(true)
    api.adminGetScreeningTest(id)
      .then(data => {
        setTestData(data)
        // If first section is personal_data and test has MCQ sections, default to the first MCQ section or 0
        setSecIdx(0)
        setQIdx(0)
      })
      .catch(err => setError(err.message || 'Failed to load assessment test.'))
      .finally(() => setLoading(false))
  }, [id])

  // Reset question index on section switch
  const handleSelectSection = (i) => {
    setSecIdx(i)
    setQIdx(0)
    const el = document.getElementById('preview-scroll-body')
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sections = testData?.sections || []
  const section = sections[secIdx]
  const secId = section?.id
  const isPersonal = section?.type === 'personal_data'
  const isCompre = !isPersonal && !!section?.passage
  const questions = section?.questions || []
  const totalQ = questions.length
  const isLastSection = secIdx === sections.length - 1

  const totalQuestionsInTest = useMemo(() => {
    if (!testData?.sections) return 0
    return testData.sections.reduce((acc, s) => acc + (s.type === 'mcq' ? (s.questions?.length || 0) : 0), 0)
  }, [testData])

  const gotoQ = (qi) => {
    setQIdx(qi)
    if (viewMode === 'all' || isCompre) {
      requestAnimationFrame(() => {
        document.getElementById(`q-${qi}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }

  const handlePrevSection = () => {
    if (secIdx > 0) handleSelectSection(secIdx - 1)
  }

  const handleNextSection = () => {
    if (secIdx < sections.length - 1) handleSelectSection(secIdx + 1)
  }

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.inkMut, gap: 14 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.line}`, borderTopColor: C.brandMid, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Loading Assessment Preview…</div>
      </div>
    )
  }

  if (error || !testData) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.ink, gap: 16, padding: 24 }}>
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12, padding: 32, maxWidth: 440, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,.06)' }}>
          <AlertCircle size={40} color={C.danger} style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Assessment Not Found</h2>
          <p style={{ fontSize: 13.5, color: C.inkMut, margin: '0 0 20px', lineHeight: 1.6 }}>{error || 'The requested assessment test could not be loaded.'}</p>
          <Btn variant="teal" onClick={() => navigate('/admin/screening')}>
            <ArrowLeft size={14} /> Back to Assessments
          </Btn>
        </div>
      </div>
    )
  }

  const shownQs = (viewMode === 'all' || isCompre)
    ? questions.map((q, i) => ({ q, qi: i }))
    : (questions[qIdx] ? [{ q: questions[qIdx], qi: qIdx }] : [])

  return (
    <div className="ex-root" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.bg, color: C.ink, overflow: 'hidden', fontFamily: '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; }
        .pal { transition: transform .1s; }
        .pal:hover { transform: translateY(-1px); }
        .scroll::-webkit-scrollbar { width: 10px; }
        .scroll::-webkit-scrollbar-thumb { background: #cbd3dc; border-radius: 6px; border: 3px solid ${C.bg}; }
        .scroll::-webkit-scrollbar-track { background: transparent; }

        @media (max-width: 900px) {
          .ex-root { height: auto !important; min-height: 100vh !important; overflow: visible !important; }
          .ex-body { flex-direction: column !important; height: auto !important; overflow: visible !important; }
          .ex-qcol { flex: none !important; }
          .ex-q-scroll { flex: none !important; overflow: visible !important; }
          .ex-aside {
            flex: none !important; width: 100% !important;
            border-left: none !important; border-top: 1px solid ${C.line} !important;
          }
          .ex-pal-scroll { flex: none !important; overflow: visible !important; min-height: 0 !important; }
        }
        @media (max-width: 760px) {
          .ex-personal-grid { grid-template-columns: minmax(0, 1fr) !important; gap: 12px !important; }
          .ex-personal-grid > div { width: 100% !important; min-width: 0 !important; }
        }
        @media (max-width: 640px) {
          .ex-h-sep, .ex-h-title { display: none !important; }
          .ex-header { gap: 10px !important; padding: 0 14px !important; }
        }
        @media (max-width: 480px) {
          .ex-footer { flex-direction: column; align-items: stretch !important; }
          .ex-footer > div { margin-left: 0 !important; width: 100%; justify-content: space-between; }
          .ex-footer button { flex: 1 1 auto; justify-content: center; }
        }
      `}</style>

      {/* Fullscreen Image Modal */}
      {fullScreenImage && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setFullScreenImage(null)}
        >
          <img src={fullScreenImage} alt="" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
          <button style={{ position: 'absolute', top: 20, right: 20, color: 'white', background: 'rgba(255,255,255,0.15)', border: 'none', padding: 8, borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center' }} onClick={() => setFullScreenImage(null)}>
            <X size={20} />
          </button>
        </div>
      )}

      {/* ══ Header — exact navy/teal gradient chrome from TestExam.jsx ══ */}
      <header className="ex-header" style={{ flexShrink: 0, background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDeep} 100%)`, height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.05) 1px, transparent 0)', backgroundSize: '24px 24px', pointerEvents: 'none' }} />

        {/* Exit Preview button */}
        <button
          onClick={() => navigate('/admin/screening')}
          style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', transition: 'all .15s', flexShrink: 0
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
        >
          <ArrowLeft size={14} /> Exit Preview
        </button>

        <div className="ex-h-brand" style={{ display: 'flex', alignItems: 'center', gap: 11, position: 'relative', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.brandMid, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Anchor size={17} color="#fff" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.6)', letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Ozellar Marine</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Assessment Portal</div>
          </div>
        </div>

        <div className="ex-h-sep" style={{ height: 28, width: 1, background: 'rgba(255,255,255,.18)', position: 'relative' }} />

        <div className="ex-h-title" style={{ minWidth: 0, flex: 1, position: 'relative' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.6)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Assessment Preview</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>{testData.title}</div>
        </div>

        {/* Admin Preview badge + Time limit display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', flexShrink: 0 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)',
            padding: '5px 12px', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 700
          }}>
            <Eye size={13} /> Admin Preview Mode
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', letterSpacing: '.09em' }}>Time Limit</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{testData.timerMinutes} mins</div>
          </div>
        </div>
      </header>

      {/* ══ Preview notice banner ══ */}
      <div style={{ flexShrink: 0, background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '9px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#166534', fontSize: 12.5, fontWeight: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={15} color="#16a34a" style={{ flexShrink: 0 }} />
          <span>Candidate View with Answer Keys: Correct answers are highlighted in green. Navigation restrictions are disabled.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>Marking: <strong style={{ color: '#166534' }}>+{testData.correctScore}</strong> for correct, <strong style={{ color: '#b91c1c' }}>−{testData.wrongPenalty}</strong> for error</span>
          <span style={{ color: '#86efac' }}>|</span>
          <span>{totalQuestionsInTest} total questions</span>
        </div>
      </div>

      {/* ══ Section Bar — voyage waypoints route matching TestExam ══ */}
      <div style={{ flexShrink: 0, background: '#fff', borderBottom: `1px solid ${C.line}`, height: 46, display: 'flex', alignItems: 'center' }}>
        <div className="scroll" style={{ flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', display: 'flex', alignItems: 'center', padding: '0 24px', height: '100%' }}>
          {sections.map((sec, i) => {
            const active = i === secIdx
            const isLast = i === sections.length - 1
            const isSecPersonal = sec.type === 'personal_data'
            const qCount = sec.questions?.length || 0

            return (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => handleSelectSection(i)}
                  title={`Go to "${sec.title}"`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                    background: 'none', border: 'none', padding: 0, font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                    background: active ? C.brandMid : '#fff',
                    color: active ? '#fff' : C.inkMut,
                    border: `1.5px solid ${active ? C.brandMid : '#c3cec8'}`,
                  }}>
                    {i + 1}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : 600,
                    color: active ? C.ink : C.inkMut,
                    whiteSpace: 'nowrap',
                  }}>
                    {sec.title}
                    {!isSecPersonal && (
                      <span style={{ fontSize: 11.5, fontWeight: 500, color: C.inkFaint, marginLeft: 5 }}>
                        ({qCount})
                      </span>
                    )}
                  </span>
                </button>
                {!isLast && <div style={{ width: 32, height: 2, background: C.lineSoft, margin: '0 14px', flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>

        {/* View toggle (Single question vs All questions) */}
        {!isPersonal && totalQ > 1 && !isCompre && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, height: '100%', padding: '0 18px', borderLeft: `1px solid ${C.lineSoft}` }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.inkFaint, marginRight: 4 }}>Mode:</span>
            <button
              onClick={() => setViewMode('single')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
                border: `1px solid ${viewMode === 'single' ? C.brandMid : C.line}`,
                background: viewMode === 'single' ? C.brandSoft : '#fff',
                color: viewMode === 'single' ? C.ink : C.inkMut,
                fontSize: 12, fontWeight: viewMode === 'single' ? 700 : 500, cursor: 'pointer'
              }}
              title="View one question at a time (like candidate)"
            >
              <Grid size={12} /> Candidate View
            </button>
            <button
              onClick={() => setViewMode('all')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
                border: `1px solid ${viewMode === 'all' ? C.brandMid : C.line}`,
                background: viewMode === 'all' ? C.brandSoft : '#fff',
                color: viewMode === 'all' ? C.ink : C.inkMut,
                fontSize: 12, fontWeight: viewMode === 'all' ? 700 : 500, cursor: 'pointer'
              }}
              title="Show all questions in this section at once"
            >
              <List size={12} /> All Questions
            </button>
          </div>
        )}
      </div>

      {/* ══ Body ══ */}
      <div className="ex-body" style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* ── Question column ── */}
        <div className="ex-qcol" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div id="preview-scroll-body" className="scroll ex-q-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px', minWidth: 0 }}>
            <div className="ex-content-col" style={{ maxWidth: 'max(1560px, 90vw)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Personal Details Preview Section */}
              {isPersonal && (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10 }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.lineSoft}`, background: C.panelAlt, borderRadius: '10px 10px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{section.title} (Personal Details Form)</div>
                      <div style={{ fontSize: 12.5, color: C.inkMut, marginTop: 3 }}>
                        All fields marked <span style={{ color: C.danger, fontWeight: 700 }}>*</span> are mandatory for candidates before proceeding to exam questions.
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(15,118,110,0.1)', color: '#0f766e', border: '1px solid rgba(15,118,110,0.25)', whiteSpace: 'nowrap' }}>
                      Auto-generated Form
                    </span>
                  </div>

                  <div className="ex-personal-grid" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(16px, 1.2vw, 28px)' }}>
                    {PERSONAL_FIELDS.map(f => (
                      <div key={f.key} style={{ gridColumn: f.span ? '1 / -1' : 'span 1', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: C.inkMut }}>
                          {f.label} {!f.readOnly && <span style={{ color: C.danger }}>*</span>}
                        </label>
                        {f.type === 'textarea' ? (
                          <div style={{
                            padding: '10px 14px', borderRadius: 6, border: `1px solid ${C.line}`,
                            background: C.panelAlt, color: C.inkMut, fontSize: 13.5, fontStyle: 'italic',
                            minHeight: 70, lineHeight: 1.5
                          }}>
                            {f.sample}
                          </div>
                        ) : f.type === 'select' ? (
                          <div style={{
                            padding: '10px 14px', borderRadius: 6, border: `1px solid ${C.line}`,
                            background: C.panelAlt, color: C.inkMut, fontSize: 13.5, fontStyle: 'italic',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                          }}>
                            <span>{f.sample} (Dropdown option)</span>
                            <ChevronDown size={14} color={C.inkFaint} />
                          </div>
                        ) : (
                          <div style={{
                            padding: '10px 14px', borderRadius: 6, border: `1px solid ${C.line}`,
                            background: C.panelAlt, color: C.inkMut, fontSize: 13.5, fontStyle: 'italic'
                          }}>
                            {f.sample}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reading Passage if comprehension */}
              {isCompre && (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '11px 18px', background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}`, fontSize: 11, fontWeight: 700, color: C.inkMut, textTransform: 'uppercase', letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <BookOpen size={13} color={C.brand} /> Reading Passage
                  </div>
                  <p style={{ margin: 0, padding: '18px 22px', fontSize: 14.5, lineHeight: 1.85, color: C.ink, whiteSpace: 'pre-wrap' }}>
                    {section.passage}
                  </p>
                </div>
              )}

              {/* Empty section state */}
              {!isPersonal && totalQ === 0 && (
                <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, padding: '50px 20px', textAlign: 'center', color: C.inkMut }}>
                  <HelpCircle size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
                  <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>No questions in this section yet</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>Add questions in the assessment builder to preview them here.</div>
                </div>
              )}

              {/* Questions */}
              {shownQs.map(({ q, qi }) => {
                const hasAnswer = q.answer !== null && q.answer !== undefined

                return (
                  <div key={qi} id={`q-${qi}`} style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                    {/* Question Card Header */}
                    <div style={{ padding: '13px 20px', background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.brand, letterSpacing: '.02em' }}>
                        Question {qi + 1}
                        <span style={{ color: C.inkFaint, fontWeight: 600 }}> of {totalQ}</span>
                      </span>

                      {/* Correct answer indicator */}
                      {hasAnswer ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5,
                          fontWeight: 700, color: '#0f766e', background: 'rgba(15,118,110,0.1)',
                          border: '1px solid rgba(15,118,110,0.25)', padding: '2px 10px', borderRadius: 20
                        }}>
                          <CheckCircle2 size={12} /> Correct Answer: Option {LTRS[q.answer]}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                          fontWeight: 700, color: C.danger, background: C.dangerSoft,
                          border: '1px solid #fecaca', padding: '2px 9px', borderRadius: 20
                        }}>
                          <AlertCircle size={11} /> No Answer Key Set
                        </span>
                      )}

                      <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: C.inkFaint }}>
                        <span style={{ color: C.ok }}>+{testData.correctScore}</span> / <span style={{ color: C.danger }}>−{testData.wrongPenalty}</span> marks
                      </span>
                    </div>

                    {/* Question Prompt + Images + Options */}
                    <div style={{ padding: '20px 22px' }}>
                      <p style={{ margin: '0 0 18px', fontSize: 15.5, fontWeight: 600, lineHeight: 1.65, color: C.ink, whiteSpace: 'pre-wrap' }}>
                        {q.prompt}
                      </p>

                      {/* Question figures / diagram images */}
                      {(q.imageUrls || []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
                          {q.imageUrls.map((url, imgIdx) => (
                            <div
                              key={imgIdx}
                              style={{ position: 'relative', cursor: 'zoom-in' }}
                              onClick={() => setFullScreenImage(url)}
                              title="Click to view full screen"
                            >
                              <img src={url} alt={`Figure ${imageLabel(imgIdx)}`} style={{ display: 'block', maxWidth: 320, maxHeight: 320, borderRadius: 8, border: `1px solid ${C.line}` }} />
                              <span style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(16,31,43,.78)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                                {imageLabel(imgIdx)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Options */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {(q.options || []).map((opt, oi) => {
                          const isCorrect = oi === q.answer

                          return (
                            <div
                              key={oi}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px', borderRadius: 8,
                                border: `1.5px solid ${isCorrect ? '#0f766e' : C.line}`,
                                background: isCorrect ? 'rgba(15,118,110,0.08)' : '#fff',
                                boxShadow: isCorrect ? '0 1px 4px rgba(15,118,110,0.1)' : 'none',
                                transition: 'all .12s',
                              }}
                            >
                              <span style={{
                                width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
                                fontWeight: 800, fontSize: 12, flexShrink: 0,
                                background: isCorrect ? '#0f766e' : '#fff',
                                color: isCorrect ? '#fff' : C.inkMut,
                                border: `1.5px solid ${isCorrect ? '#0f766e' : '#c3cad3'}`,
                              }}>
                                {isCorrect ? <Check size={14} strokeWidth={3} /> : LTRS[oi]}
                              </span>

                              <span style={{
                                fontSize: 14.5, lineHeight: 1.55,
                                color: isCorrect ? '#0f766e' : C.ink,
                                fontWeight: isCorrect ? 700 : 400,
                                flex: 1,
                              }}>
                                {opt}
                              </span>

                              {isCorrect && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '4px 10px', borderRadius: 20,
                                  background: '#0f766e', color: '#fff',
                                  fontSize: 11.5, fontWeight: 700, letterSpacing: '.02em',
                                  boxShadow: '0 2px 4px rgba(15,118,110,0.2)',
                                  flexShrink: 0,
                                }}>
                                  <CheckCircle2 size={13} /> Correct Answer
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ══ Action bar / footer — exactly matching TestExam navigation ══ */}
          <footer className="ex-footer" style={{ flexShrink: 0, background: '#fff', borderTop: `1px solid ${C.line}`, padding: '12px 24px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            {isPersonal ? (
              <>
                <div style={{ fontSize: 12.5, color: C.inkMut }}>
                  Candidate personal details form preview
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <Btn variant="primary" onClick={handleNextSection} disabled={isLastSection}>
                    Next Section <ChevronRight size={15} />
                  </Btn>
                </div>
              </>
            ) : isCompre || viewMode === 'all' ? (
              <>
                <Btn onClick={handlePrevSection} disabled={secIdx === 0}>
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
                <Btn onClick={handlePrevSection} disabled={secIdx === 0}>
                  <ChevronLeft size={15} /> Previous Section
                </Btn>
                <Btn onClick={handleNextSection} disabled={isLastSection}>
                  Next Section <ChevronRight size={15} />
                </Btn>

                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <Btn onClick={() => gotoQ(Math.max(0, qIdx - 1))} disabled={qIdx === 0}>
                    <ChevronLeft size={15} /> Previous
                  </Btn>
                  {qIdx < totalQ - 1 ? (
                    <Btn variant="primary" onClick={() => gotoQ(qIdx + 1)}>
                      Next Question <ChevronRight size={15} />
                    </Btn>
                  ) : (
                    <Btn variant="primary" onClick={handleNextSection} disabled={isLastSection}>
                      Next Section <ChevronRight size={15} />
                    </Btn>
                  )}
                </div>
              </>
            )}
          </footer>
        </div>

        {/* ── Right Rail ── */}
        <aside className="ex-aside" style={{ width: 340, flexShrink: 0, background: '#fff', borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Admin Preview Identity Card */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(15,118,110,0.1)', border: '1px solid rgba(15,118,110,0.2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Shield size={20} color="#0f766e" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Admin Preview Mode</div>
              <div style={{ fontSize: 11.5, color: '#0f766e', fontWeight: 600, marginTop: 1 }}>Answer Key Verified</div>
            </div>
          </div>

          {/* Test Specs Card */}
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.lineSoft}`, background: C.panelAlt }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Test Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}` }}>
                <div style={{ color: C.inkFaint, fontSize: 11 }}>Time Limit</div>
                <div style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>{testData.timerMinutes} min</div>
              </div>
              <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}` }}>
                <div style={{ color: C.inkFaint, fontSize: 11 }}>Scoring</div>
                <div style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>+{testData.correctScore} / −{testData.wrongPenalty}</div>
              </div>
              <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}` }}>
                <div style={{ color: C.inkFaint, fontSize: 11 }}>Section</div>
                <div style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>{secIdx + 1} of {sections.length}</div>
              </div>
              <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.line}` }}>
                <div style={{ color: C.inkFaint, fontSize: 11 }}>Total Questions</div>
                <div style={{ fontWeight: 800, color: C.ink, fontSize: 14 }}>{totalQuestionsInTest}</div>
              </div>
            </div>
          </div>

          {/* Legend */}
          {!isPersonal && (
            <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.lineSoft}` }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Legend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#0f766e', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800 }}>✓</span>
                  <span>Correct Answer Set</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', border: `2.5px solid ${C.brandMid}`, display: 'grid', placeItems: 'center' }} />
                  <span>Current Selected Question</span>
                </div>
              </div>
            </div>
          )}

          {/* Question Palette */}
          {!isPersonal && (
            <div className="scroll ex-pal-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkFaint, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  Question Palette ({totalQ})
                </div>
                <span style={{ fontSize: 11, color: C.inkMut }}>{section.title}</span>
              </div>

              {totalQ === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: C.inkFaint, fontSize: 12 }}>
                  No questions in this section
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
                  {questions.map((q, qi) => {
                    const cur = qi === qIdx
                    const hasAnswer = q.answer !== null && q.answer !== undefined

                    return (
                      <button
                        key={qi}
                        className="pal"
                        onClick={() => gotoQ(qi)}
                        title={`Question ${qi + 1}: Correct option is ${hasAnswer ? LTRS[q.answer] : 'None'}`}
                        style={{
                          position: 'relative', aspectRatio: '1', borderRadius: '50%', cursor: 'pointer',
                          background: hasAnswer ? 'rgba(15,118,110,0.1)' : '#fff',
                          color: hasAnswer ? '#0f766e' : C.inkMut,
                          border: `1.5px solid ${hasAnswer ? '#0f766e' : '#c3cec8'}`,
                          fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit', padding: 0,
                          outline: cur ? `2.5px solid ${C.brandMid}` : 'none', outlineOffset: 2,
                        }}
                      >
                        {qi + 1}
                        {hasAnswer && (
                          <span style={{ position: 'absolute', top: -3, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#0f766e', border: '1.5px solid #fff' }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Bottom Action — Exit Preview */}
          <div style={{ marginTop: 'auto', padding: 16, borderTop: `1px solid ${C.lineSoft}`, background: C.panelAlt }}>
            <button
              onClick={() => navigate('/admin/screening')}
              style={{
                width: '100%', padding: '11px', borderRadius: 8,
                background: C.brand, color: '#fff', border: 'none',
                fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 2px 8px rgba(15,118,110,.25)', transition: 'background .15s'
              }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(.95)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >
              <ArrowLeft size={15} /> Exit Preview
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
