import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowUp, ArrowDown, Trash2, Upload, Video, Image as ImageIcon,
  HelpCircle, Plus, X, AlertCircle, ChevronDown, ChevronUp, Save, Check, Edit2,
} from 'lucide-react'
import {
  adminGetCourseBuilder, adminUploadPptx, adminUploadVideo, adminCreateQuizChapter,
  adminSaveQuizQuestions, adminReorderChapters, adminDeleteChapter, adminSaveAssessment,
} from '../../api.js'

const EMPTY_Q = () => ({ q: '', options: ['', '', '', ''], answer: 0, explain: '' })

export default function AdminCourseBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pptxProcessing, setPptxProcessing] = useState(
    () => sessionStorage.getItem(`pptx-processing-${id}`) === '1'
  )
  const [openQuiz, setOpenQuiz] = useState(null)   // chapter id whose quiz editor is open
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const pptxInput = useRef(null)
  const [successMsg, setSuccessMsg] = useState('')
  const pollRef = useRef(null)

  const startPolling = (prevChapterCount) => {
    sessionStorage.setItem(`pptx-processing-${id}`, String(prevChapterCount))
    setPptxProcessing(true)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const updated = await adminGetCourseBuilder(id)
        const storedCount = Number(sessionStorage.getItem(`pptx-processing-${id}`))
        if (updated.chapters.length > storedCount) {
          clearInterval(pollRef.current)
          sessionStorage.removeItem(`pptx-processing-${id}`)
          setPptxProcessing(false)
          setCourse(updated)
          setSuccessMsg('PPT processed successfully! Your new slides are ready.')
          setTimeout(() => setSuccessMsg(''), 8000)
        }
      } catch (_) {}
    }, 3000)
  }

  const load = () => adminGetCourseBuilder(id).then(setCourse)
  useEffect(() => {
    const storedCount = sessionStorage.getItem(`pptx-processing-${id}`)
    load()
    // If we came back to this page and processing was already in flight, resume polling
    if (storedCount !== null) {
      startPolling(Number(storedCount))
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  const withBusy = async (fn) => {
    setError('')
    setBusy(true)
    try { await fn() } catch (e) { setError(e.message || 'Something went wrong') }
    finally { setBusy(false) }
  }

  if (!course) return <div className="spinner">Loading course…</div>

  const chapters = course.chapters

  const uploadPptx = (file) => withBusy(async () => {
    const currentCount = course.chapters.length
    await adminUploadPptx(id, file)
    startPolling(currentCount)
  })

  const uploadVideo = (file, opts) => withBusy(async () => {
    await adminUploadVideo(id, file, opts)
    await load()
    setShowVideoForm(false)
  })

  const move = (index, dir) => withBusy(async () => {
    const next = [...chapters]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    await adminReorderChapters(id, next.map((c) => c.id))
    await load()
  })

  const remove = (chapterId) => withBusy(async () => {
    await adminDeleteChapter(id, chapterId)
    setConfirmDeleteId(null)
    await load()
  })

  const insertQuiz = (afterChapterId) => withBusy(async () => {
    const after = chapters.find((c) => c.id === afterChapterId)
    const title = after ? `Quiz — after "${after.title}"` : 'Quick check'
    const created = await adminCreateQuizChapter(id, { title, afterChapterId })
    await load()
    setOpenQuiz(created.id)
  })

  return (
    <>
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => navigate('/admin/courses')}>
        <ArrowLeft size={15} /> All courses
      </button>

      <div className="eyebrow">Fleet training · Course builder</div>
      <h1 style={{ fontSize: 26, margin: '6px 0 4px' }}>{course.title}</h1>
      {course.subtitle && <p className="mut" style={{ marginBottom: 18 }}>{course.subtitle}</p>}

      {error && <div className="form-error" style={{ marginBottom: 14 }}><AlertCircle size={15} /> {error}</div>}
      {successMsg && <div style={{ color: 'var(--success)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 6, fontSize: 14, fontWeight: 500 }}><Check size={16} /> {successMsg}</div>}

      <div className="admin-card" style={{ marginBottom: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={busy || pptxProcessing} onClick={() => !pptxProcessing && pptxInput.current?.click()}>
          {pptxProcessing
            ? <><span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', verticalAlign: 'middle', marginRight: 6 }} />Processing slides…</>
            : <><Upload size={15} /> Upload PPT</>}
        </button>
        <input ref={pptxInput} type="file" accept=".pptx" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadPptx(f) }} />
        <button className="btn" disabled={busy} onClick={() => setShowVideoForm((s) => !s)}>
          <Video size={15} /> Upload video
        </button>
        <button className="btn" disabled={busy} onClick={() => insertQuiz(null)}>
          <HelpCircle size={15} /> Add quiz at end
        </button>
      </div>

      {showVideoForm && (
        <VideoUploadForm chapters={chapters.filter((c) => c.kind === 'lesson')}
          onUpload={uploadVideo} onCancel={() => setShowVideoForm(false)} />
      )}

      <div className="admin-card" style={{ padding: 0 }}>
        {chapters.length === 0 && (
          <div className="mut" style={{ padding: 18 }}>No modules yet — upload a PPT or a video to get started.</div>
        )}
        {chapters.map((ch, i) => (
          <ModuleRow key={ch.id} chapter={ch} index={i} total={chapters.length}
            busy={busy} onMove={move} onDelete={remove} onInsertQuiz={insertQuiz}
            quizOpen={openQuiz === ch.id} onToggleQuiz={() => setOpenQuiz(openQuiz === ch.id ? null : ch.id)}
            confirmingDelete={confirmDeleteId === ch.id}
            onRequestDelete={() => setConfirmDeleteId(confirmDeleteId === ch.id ? null : ch.id)}
            onSaveQuiz={(questions) => withBusy(async () => {
              await adminSaveQuizQuestions(id, ch.id, questions)
              await load()
            })} />
        ))}
      </div>

      <AssessmentEditor course={course} onSave={(body) => withBusy(async () => {
        await adminSaveAssessment(id, body)
        await load()
      })} />
    </>
  )
}

function ModuleRow({ chapter: ch, index, total, busy, onMove, onDelete, onInsertQuiz, quizOpen, onToggleQuiz,
                     confirmingDelete, onRequestDelete, onSaveQuiz }) {
  const isQuiz = ch.kind === 'quiz'
  const hasImage = !!ch.image
  const hasVideo = ch.videos && ch.videos.length > 0

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        {hasImage ? (
          <img src={ch.image} alt="" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 56, height: 36, borderRadius: 6, flexShrink: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)',
          }}>
            {isQuiz ? <HelpCircle size={16} /> : <Video size={16} />}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{ch.n}. {ch.title}</b>
          <div className="mut" style={{ fontSize: 12 }}>
            {isQuiz ? `Checkpoint quiz · ${ch.quizQuestions.length} question${ch.quizQuestions.length === 1 ? '' : 's'}`
              : [hasImage && 'Slide', hasVideo && `${ch.videos.length} video${ch.videos.length > 1 ? 's' : ''}`]
                  .filter(Boolean).join(' · ') || 'Module'}
          </div>
        </div>

        {isQuiz && (
          <button className="btn sm" onClick={onToggleQuiz}>
            Manage quiz {quizOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
        <button className="btn sm" disabled={busy} title="Insert quiz after this module"
          onClick={() => onInsertQuiz(ch.id)}><HelpCircle size={14} /></button>
        <button className="btn sm" disabled={busy || index === 0} title="Move up"
          onClick={() => onMove(index, -1)}><ArrowUp size={14} /></button>
        <button className="btn sm" disabled={busy || index === total - 1} title="Move down"
          onClick={() => onMove(index, 1)}><ArrowDown size={14} /></button>
        {confirmingDelete ? (
          <>
            <button className="btn sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              disabled={busy} onClick={() => onDelete(ch.id)}>Confirm delete</button>
            <button className="btn sm" disabled={busy} onClick={onRequestDelete}><X size={14} /></button>
          </>
        ) : (
          <button className="btn sm" disabled={busy} title="Delete module"
            onClick={onRequestDelete}><Trash2 size={14} /></button>
        )}
      </div>

      {isQuiz && quizOpen && (
        <div style={{ padding: '0 16px 16px' }}>
          <ModuleQuizEditor initial={ch.quizQuestions} onSave={onSaveQuiz} onCancelQuiz={onToggleQuiz} />
        </div>
      )}
    </div>
  )
}

function ModuleQuizEditor({ initial, onSave, onCancelQuiz }) {
  const hasQuestions = initial && initial.length > 0
  const [mode, setMode] = useState(hasQuestions ? 'view' : 'edit')
  const [success, setSuccess] = useState(false)

  const handleSave = async (questions) => {
    await onSave(questions)
    setSuccess(true)
    setMode('view')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="eyebrow" style={{ margin: 0 }}>Checkpoint Quiz Questions</div>
          {success && <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 500 }}><Check size={14} /> Successfully saved!</span>}
        </div>
        {mode === 'view' && (
          <button className="btn sm" onClick={() => setMode('edit')}><Edit2 size={14} /> Edit Quiz</button>
        )}
      </div>

      {mode === 'view' ? (
        <div>
          {initial.map((q, i) => (
            <QuestionViewRow key={i} q={q} index={i} />
          ))}
        </div>
      ) : (
        <QuestionEditor initial={initial} saveLabel="Save quiz"
          onSave={handleSave} onCancel={hasQuestions ? () => setMode('view') : onCancelQuiz} />
      )}
    </div>
  )
}

function VideoUploadForm({ chapters, onUpload, onCancel }) {
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('new')          // 'new' | 'attach'
  const [chapterId, setChapterId] = useState(chapters[0]?.id || '')
  const [title, setTitle] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!file) return
    onUpload(file, mode === 'attach' ? { chapterId } : { title })
  }

  return (
    <form className="admin-card" onSubmit={submit} style={{ marginBottom: 20 }}>
      <div className="segmented" role="tablist" style={{ maxWidth: 320, marginBottom: 14 }}>
        <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>New module</button>
        <button type="button" className={mode === 'attach' ? 'on' : ''} onClick={() => setMode('attach')}
          disabled={chapters.length === 0}>Attach to module</button>
      </div>
      <div className="form-grid">
        <label className="admin-field">
          <span>Video file<i className="req">*</i></span>
          <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0] || null)} />
        </label>
        {mode === 'new' ? (
          <label className="admin-field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Safety briefing" />
          </label>
        ) : (
          <label className="admin-field">
            <span>Attach to</span>
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.n}. {c.title}</option>)}
            </select>
          </label>
        )}
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <button className="btn primary" disabled={!file}>Upload</button>
        <button type="button" className="btn" onClick={onCancel}><X size={14} /> Cancel</button>
      </div>
    </form>
  )
}

function QuestionEditor({ initial, onSave, saveLabel, onCancel }) {
  const [questions, setQuestions] = useState(initial && initial.length ? initial.map((q) => ({ ...q, options: [...q.options] })) : [EMPTY_Q()])

  const setQ = (i, patch) => setQuestions((qs) => qs.map((q, qi) => (qi === i ? { ...q, ...patch } : q)))
  const setOpt = (i, oi, val) => setQuestions((qs) => qs.map((q, qi) => {
    if (qi !== i) return q
    const options = [...q.options]; options[oi] = val
    return { ...q, options }
  }))
  const addOption = (i) => setQ(i, { options: [...questions[i].options, ''] })
  const removeOption = (i, oi) => setQ(i, {
    options: questions[i].options.filter((_, x) => x !== oi),
    answer: questions[i].answer === oi ? 0 : questions[i].answer > oi ? questions[i].answer - 1 : questions[i].answer,
  })
  const addQuestion = () => setQuestions((qs) => [...qs, EMPTY_Q()])
  const removeQuestion = (i) => setQuestions((qs) => qs.filter((_, qi) => qi !== i))

  const valid = questions.length > 0 && questions.every((q) =>
    q.q.trim() && q.options.filter((o) => o.trim()).length >= 2)

  const handleSave = () => {
    const cleaned = questions.map(q => {
      const options = []
      let newAnswer = 0
      for (let i = 0; i < q.options.length; i++) {
        if (q.options[i].trim()) {
          if (i === q.answer) newAnswer = options.length
          options.push(q.options[i].trim())
        }
      }
      return { ...q, q: q.q.trim(), options, answer: newAnswer, explain: q.explain?.trim() || '' }
    })
    onSave(cleaned)
  }

  return (
    <div>
      {questions.map((q, i) => (
        <div key={i} className="q-edit-card">
          <div className="q-edit-header">
            <span className="badge">Question {i + 1}</span>
            <button type="button" className="btn sm" onClick={() => removeQuestion(i)} title="Delete Question"><Trash2 size={14} /></button>
          </div>
          
          <input className="q-edit-title-input" value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} placeholder="Type your question here..." />
          
          <div className="q-edit-options">
            {q.options.map((opt, oi) => (
              <div key={oi} className="q-edit-opt-row">
                <button type="button" className={`q-edit-radio ${q.answer === oi ? 'on' : ''}`}
                  onClick={() => setQ(i, { answer: oi })} title="Mark as correct answer">
                  <Check size={14} />
                </button>
                <input className="q-edit-opt-input" value={opt} onChange={(e) => setOpt(i, oi, e.target.value)}
                  placeholder={`Option ${oi + 1}`} />
                {q.options.length > 2 && (
                  <button type="button" className="iconbtn q-edit-remove" onClick={() => removeOption(i, oi)} title="Remove option">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="q-edit-add-btn" onClick={() => addOption(i)}>
              <Plus size={14} /> Add another option
            </button>
          </div>

          <div className="q-edit-explain">
            <label>Explanation (Optional — shown to user after answering)</label>
            <textarea value={q.explain || ''} onChange={(e) => setQ(i, { explain: e.target.value })} placeholder="Explain why the answer is correct..." />
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <div>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn" onClick={addQuestion}><Plus size={14} /> Add question</button>
          <button type="button" className="btn primary" disabled={!valid} onClick={handleSave}>
            <Save size={14} /> {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionViewRow({ q, index }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="admin-card" style={{ padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setOpen(!open)}>
        <div style={{ fontWeight: 500 }}>{index + 1}. {q.q}</div>
        <button className="iconbtn" title="Toggle options">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
      </div>
      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {q.options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: i === q.answer ? 'var(--success)' : 'inherit' }}>
              {i === q.answer ? <Check size={16} /> : <div style={{ width: 16 }} />}
              <span style={{ fontWeight: i === q.answer ? 500 : 400 }}>{opt}</span>
            </div>
          ))}
          {q.explain && (
            <div className="mut" style={{ marginTop: 8, fontSize: 13, background: 'var(--bg-card)', padding: '8px 12px', borderRadius: 4 }}>
              <strong>Explanation:</strong> {q.explain}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AssessmentEditor({ course, onSave }) {
  const hasQuestions = course.assessment.questions && course.assessment.questions.length > 0
  const [mode, setMode] = useState(hasQuestions ? 'view' : 'edit')
  const [success, setSuccess] = useState(false)
  
  const [passMark, setPassMark] = useState(course.assessment.passMark ?? 80)
  const [maxAttempts, setMaxAttempts] = useState(course.assessment.maxAttempts ?? '')

  const handleSave = async (questions) => {
    await onSave({
      passMark: Number(passMark) || 80,
      maxAttempts: maxAttempts === '' ? null : Number(maxAttempts),
      questions,
    })
    setSuccess(true)
    setMode('view')
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Final assessment (graded, required for certificate)</span>
        {success && <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', fontWeight: 500 }}><Check size={14} /> Successfully saved!</span>}
      </div>
      
      {mode === 'view' ? (
        <div className="admin-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
              <div><span className="mut">Pass mark:</span> <strong>{passMark}%</strong></div>
              <div><span className="mut">Max attempts:</span> <strong>{maxAttempts === '' || maxAttempts === null ? 'Unlimited' : maxAttempts}</strong></div>
            </div>
            <button className="btn sm" onClick={() => setMode('edit')}><Edit2 size={14} /> Edit Assessment</button>
          </div>
          
          <div>
            {course.assessment.questions.map((q, i) => (
              <QuestionViewRow key={i} q={q} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="admin-card" style={{ marginBottom: 14 }}>
            <div className="form-grid">
              <label className="admin-field">
                <span>Pass mark (%)</span>
                <input type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} />
              </label>
              <label className="admin-field">
                <span>Max attempts (blank = unlimited)</span>
                <input type="number" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} placeholder="Unlimited" />
              </label>
            </div>
          </div>
          <QuestionEditor initial={course.assessment.questions} saveLabel="Save final assessment"
            onSave={handleSave} onCancel={hasQuestions ? () => setMode('view') : null} />
        </>
      )}
    </div>
  )
}
