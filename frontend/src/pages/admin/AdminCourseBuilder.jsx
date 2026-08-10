import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowUp, ArrowDown, Trash2, Upload, Video, Image as ImageIcon,
  HelpCircle, Plus, X, AlertCircle, ChevronDown, ChevronUp, Save, Check, Edit2, GripVertical, Settings, Search
} from 'lucide-react'
import {
  adminGetCourseBuilder, adminUploadPptx, adminUploadVideo, adminCreateQuizChapter,
  adminSaveQuizQuestions, adminReorderChapters, adminDeleteChapter, adminSaveAssessment,
  adminUpdateCourse, adminListUsers
} from '../../api.js'

const EMPTY_Q = () => ({ q: '', options: ['', '', '', ''], answer: 0, explain: '' })

export default function AdminCourseBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [localChapters, setLocalChapters] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [draggableIdx, setDraggableIdx] = useState(null)

  const [pptxProcessing, setPptxProcessing] = useState(
    () => sessionStorage.getItem(`pptx-processing-${id}`) === '1'
  )
  const [openQuiz, setOpenQuiz] = useState(null)   // chapter id whose quiz editor is open
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [showAddOptions, setShowAddOptions] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const pptxInput = useRef(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [previewImage, setPreviewImage] = useState(null)
  const pollRef = useRef(null)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [usersList, setUsersList] = useState([])

  const openSettings = async () => {
    setShowSettingsModal(true)
    if (usersList.length === 0) {
      try {
        const u = await adminListUsers()
        setUsersList(u)
      } catch (err) {}
    }
  }

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

  const load = () => adminGetCourseBuilder(id).then((c) => {
    setCourse(c)
    setLocalChapters(c.chapters)
    return c
  })
  
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

  const chapters = localChapters

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

  const handleDragStart = (e, index) => {
    dragItem.current = index
    e.dataTransfer.effectAllowed = 'move'
    e.target.style.opacity = '0.4'
  }

  const handleDragEnter = (e, index) => {
    e.preventDefault()
    if (dragItem.current !== null && dragItem.current !== index) {
      dragOverItem.current = index
      setDragOverIdx(index)
    }
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDragOverIdx(null)
    setDraggableIdx(null)
    
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const from = dragItem.current
      const to = dragOverItem.current
      
      setLocalChapters(prev => {
        const next = [...prev]
        const dragged = next.splice(from, 1)[0]
        next.splice(to, 0, dragged)
        
        const newOrder = next.map(c => c.id)
        withBusy(async () => {
          await adminReorderChapters(id, newOrder)
          await load()
        })
        return next
      })
    }
    
    dragItem.current = null
    dragOverItem.current = null
  }

  return (
    <>
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => navigate('/admin/courses')}>
        <ArrowLeft size={15} /> All courses
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Fleet training · Course builder</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 4px' }}>{course.title}</h1>
          {course.subtitle && <p className="mut" style={{ margin: 0 }}>{course.subtitle}</p>}
        </div>
        <button className="btn" onClick={openSettings}>
          <Settings size={16} /> Course Settings
        </button>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 14 }}><AlertCircle size={15} /> {error}</div>}
      {successMsg && <div style={{ color: 'var(--success)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 6, fontSize: 14, fontWeight: 500 }}><Check size={16} /> {successMsg}</div>}

      <div className="admin-card" style={{ padding: 0, marginBottom: chapters.length > 0 ? 20 : 0, border: chapters.length === 0 ? 'none' : undefined, background: chapters.length === 0 ? 'transparent' : undefined }}>
        {chapters.map((ch, i) => {
          let dragStyle = { transition: 'all 0.2s' }
          if (dragOverIdx === i) {
            if (dragItem.current > i) dragStyle.borderTop = '3px solid #3b82f6'
            else dragStyle.borderBottom = '3px solid #3b82f6'
            dragStyle.background = '#f8fafc'
          }
          
          return (
            <div 
              key={ch.id}
              draggable={draggableIdx === i}
              onDragStart={(e) => handleDragStart(e, i)}
              onDragEnter={(e) => handleDragEnter(e, i)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              style={dragStyle}
              onDragStartCapture={(e) => e.target.style.cursor = 'grabbing'}
            >
              <ModuleRow chapter={ch} index={i} total={chapters.length}
                busy={busy} onMove={move} onDelete={remove} onInsertQuiz={insertQuiz}
                quizOpen={openQuiz === ch.id} onToggleQuiz={() => setOpenQuiz(openQuiz === ch.id ? null : ch.id)}
                confirmingDelete={confirmDeleteId === ch.id}
                onRequestDelete={() => setConfirmDeleteId(confirmDeleteId === ch.id ? null : ch.id)}
                onSaveQuiz={(questions) => withBusy(async () => {
                  await adminSaveQuizQuestions(id, ch.id, questions)
                  await load()
                })}
                setDraggable={(isHovering) => setDraggableIdx(isHovering ? i : null)}
                onPreviewImage={() => setPreviewImage(ch.image)}
              />
            </div>
          )
        })}
      </div>

      {!showAddOptions && !showVideoForm && chapters.length > 0 && (
        <button type="button" onClick={() => setShowAddOptions(true)} className="add-module-btn" style={{ width: '100%', padding: '14px', background: '#ffffff', border: '2px dashed #94a3b8', borderRadius: 10, color: '#475569', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, transition: 'all 0.2s ease', marginBottom: 30 }}>
          <Plus size={18} /> Add New Module
        </button>
      )}

      {(showAddOptions || chapters.length === 0) && !showVideoForm && (
        <div className="admin-card" style={{ marginBottom: 30, background: '#f8fafc', border: chapters.length === 0 ? '2px dashed #cbd5e1' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 16 }}>
                {chapters.length === 0 ? 'Add Your First Module' : 'Select Module Type'}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Choose what kind of lesson you want to add next.</div>
            </div>
            {chapters.length > 0 && (
              <button className="iconbtn" onClick={() => setShowAddOptions(false)}><X size={18} /></button>
            )}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {/* PPT Card */}
            <button type="button" className="module-type-card" disabled={busy || pptxProcessing} onClick={() => !pptxProcessing && pptxInput.current?.click()}>
              <div className="module-icon-wrapper" style={{ background: '#eff6ff', color: '#3b82f6' }}>
                {pptxProcessing ? <span style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : <Upload size={24} />}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15, marginBottom: 4 }}>
                  {pptxProcessing ? 'Processing slides...' : 'PowerPoint'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Extract slides into individual lessons</div>
              </div>
            </button>
            <input ref={pptxInput} type="file" accept=".pptx,.pptm" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadPptx(f) }} />

            {/* Video Card */}
            <button type="button" className="module-type-card" disabled={busy} onClick={() => setShowVideoForm(true)}>
              <div className="module-icon-wrapper" style={{ background: '#fef2f2', color: '#ef4444' }}>
                <Video size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15, marginBottom: 4 }}>Video Lesson</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Upload an MP4 video file</div>
              </div>
            </button>

            {/* Quiz Card */}
            <button type="button" className="module-type-card" disabled={busy} onClick={() => insertQuiz(null)}>
              <div className="module-icon-wrapper" style={{ background: '#f0fdf4', color: '#22c55e' }}>
                <HelpCircle size={24} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15, marginBottom: 4 }}>Checkpoint Quiz</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Add a short quiz to test knowledge</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {showVideoForm && (
        <VideoUploadForm chapters={chapters.filter((c) => c.kind === 'lesson')}
          onUpload={uploadVideo} onCancel={() => { setShowVideoForm(false); setShowAddOptions(true) }} />
      )}

      <AssessmentEditor course={course} onSave={(body) => withBusy(async () => {
        await adminSaveAssessment(id, body)
        await load()
      })} />

      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 40 }}
        >
          <img src={previewImage} alt="Slide preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', objectFit: 'contain' }} />
        </div>
      )}

      {showSettingsModal && (
        <CourseSettingsModal 
          course={course} 
          users={usersList} 
          onClose={() => setShowSettingsModal(false)} 
          onSave={async (data) => {
            await adminUpdateCourse(id, data)
            await load()
          }} 
        />
      )}
    </>
  )
}

function ModuleRow({ chapter: ch, index, total, busy, onMove, onDelete, onInsertQuiz, quizOpen, onToggleQuiz,
                     confirmingDelete, onRequestDelete, onSaveQuiz, setDraggable, onPreviewImage }) {
  const isQuiz = ch.kind === 'quiz'
  const hasImage = !!ch.image
  const hasVideo = ch.videos && ch.videos.length > 0

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
        <div 
          style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', cursor: 'grab' }}
          onMouseEnter={() => setDraggable(true)}
          onMouseLeave={() => setDraggable(false)}
        >
          <GripVertical size={20} />
        </div>
        
        {hasImage ? (
          <img src={ch.image} alt="" onClick={onPreviewImage} style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0, cursor: 'zoom-in', border: '1px solid var(--border)' }} />
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

function PremiumSelect({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedOpt = options.find(o => o.value === value)

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ 
          border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', 
          background: '#f8fafc', fontSize: 13, cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
        }}>
        <span style={{ color: selectedOpt ? '#1e293b' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOpt ? selectedOpt.label : 'Select an option...'}
        </span>
        <ChevronDown size={14} style={{ color: '#64748b' }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50,
          maxHeight: 220, overflowY: 'auto'
        }}>
          {options.map(opt => (
            <div 
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`premium-select-option ${opt.value === value ? 'selected' : ''}`}
            >
              {opt.label}
            </div>
          ))}
        </div>
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
    <form className="admin-card" onSubmit={submit} style={{ marginBottom: 20, background: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.05)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="iconbtn" onClick={onCancel} style={{ background: '#f1f5f9', width: 28, height: 28, borderRadius: '50%' }}>
          <ArrowLeft size={14} />
        </button>
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 15 }}>Upload Video Lesson</div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className={`premium-chip ${mode === 'new' ? 'selected' : ''}`} onClick={() => setMode('new')} style={{ padding: '4px 10px', fontSize: 12 }}>
          Create new module
        </button>
        <button type="button" className={`premium-chip ${mode === 'attach' ? 'selected' : ''}`} onClick={() => setMode('attach')} disabled={chapters.length === 0} style={{ padding: '4px 10px', fontSize: 12 }}>
          Attach to existing module
        </button>
      </div>

      <div className="form-grid" style={{ gridTemplateColumns: '1fr', gap: 12 }}>
        <div className="admin-field">
          <span style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4, display: 'block', fontSize: 13 }}>Video file <i className="req">*</i></span>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 12px', border: '1px dashed', borderRadius: 8, cursor: 'pointer', background: file ? '#eff6ff' : '#f8fafc', borderColor: file ? '#3b82f6' : '#cbd5e1', transition: 'all 0.2s' }}>
            <Video size={20} style={{ color: file ? '#3b82f6' : '#94a3b8' }} />
            <div>
              <div style={{ fontWeight: 600, color: file ? '#1e293b' : '#475569', fontSize: 13 }}>
                {file ? file.name : 'Click to select video'}
              </div>
            </div>
            <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files[0] || null)} style={{ display: 'none' }} />
          </label>
        </div>

        {mode === 'new' ? (
          <label className="admin-field">
            <span style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4, display: 'block', fontSize: 13 }}>Lesson Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Safety briefing" style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', background: '#f8fafc', fontSize: 13, width: '100%' }} />
          </label>
        ) : (
          <label className="admin-field">
            <span style={{ fontWeight: 600, color: '#1e293b', marginBottom: 4, display: 'block', fontSize: 13 }}>Attach to</span>
            <PremiumSelect 
              value={chapterId} 
              onChange={setChapterId} 
              options={chapters.map(c => ({ value: c.id, label: `${c.n}. ${c.title}` }))}
            />
          </label>
        )}
      </div>

      <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn primary" disabled={!file} style={{ background: '#3b82f6', padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 6 }}>
          Upload Video
        </button>
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
  const [settingsMode, setSettingsMode] = useState('view')
  const [passMark, setPassMark] = useState(course.assessment.passMark ?? 80)
  const [maxAttempts, setMaxAttempts] = useState(course.assessment.maxAttempts === null ? '' : course.assessment.maxAttempts)

  const [qMode, setQMode] = useState(hasQuestions ? 'view' : 'edit')

  const handleSaveSettings = () => {
    onSave({
      passMark: Number(passMark) || 80,
      maxAttempts: maxAttempts === '' ? null : Number(maxAttempts),
      questions: course.assessment.questions
    })
    setSettingsMode('view')
  }

  const handleSaveQuestions = (questions) => {
    onSave({
      passMark: Number(course.assessment.passMark) || 80,
      maxAttempts: course.assessment.maxAttempts,
      questions
    })
    setQMode('view')
  }

  const success = new URLSearchParams(window.location.search).get('saved') === 'assessment'

  return (
    <div style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Final assessment (graded, required for certificate)</span>
        {success && <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, textTransform: 'none', fontWeight: 500 }}><Check size={14} /> Successfully saved!</span>}
      </div>
      
      <div className="admin-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {settingsMode === 'view' ? (
            <>
              <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
                <div><span className="mut">Pass mark:</span> <strong>{passMark}%</strong></div>
                <div><span className="mut">Max attempts:</span> <strong>{maxAttempts === '' || maxAttempts === null ? 'Unlimited' : maxAttempts}</strong></div>
              </div>
              <button className="btn sm" onClick={() => setSettingsMode('edit')}><Edit2 size={14} /> Edit Settings</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16 }}>
                <label className="admin-field" style={{ margin: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Pass mark (%)</span>
                  <input type="number" min={1} max={100} style={{ padding: '6px 10px' }} value={passMark} onChange={e => setPassMark(e.target.value)} />
                </label>
                <label className="admin-field" style={{ margin: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Max attempts</span>
                  <input type="number" min={1} style={{ padding: '6px 10px' }} value={maxAttempts} onChange={e => setMaxAttempts(e.target.value)} placeholder="Unlimited" />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sm" onClick={() => {
                  setPassMark(course.assessment.passMark ?? 80)
                  setMaxAttempts(course.assessment.maxAttempts === null ? '' : course.assessment.maxAttempts)
                  setSettingsMode('view')
                }}>Cancel</button>
                <button className="btn sm primary" onClick={handleSaveSettings}><Save size={14} /> Save</button>
              </div>
            </>
          )}
        </div>
      </div>

      {qMode === 'view' ? (
        <div className="admin-card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Questions ({course.assessment.questions.length})</div>
            <button className="btn sm" onClick={() => setQMode('edit')}><Edit2 size={14} /> Edit Questions</button>
          </div>
          <div>
            {course.assessment.questions.map((q, i) => (
              <QuestionViewRow key={i} q={q} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <QuestionEditor initial={course.assessment.questions} saveLabel="Save questions"
          onSave={handleSaveQuestions} onCancel={hasQuestions ? () => setQMode('view') : null} />
      )}
    </div>
  )
}

function CourseSettingsModal({ course, users, onClose, onSave }) {
  const [form, setForm] = useState({
    title: course.title,
    subtitle: course.subtitle || '',
    durationLabel: course.durationLabel || '',
    passMark: course.passMark ?? 80,
    maxAttempts: course.maxAttempts || null,
  })
  const [targetRanks, setTargetRanks] = useState(course.targetRanks || [])
  const [targetUsers, setTargetUsers] = useState(course.targetUsers || [])
  const [searchRank, setSearchRank] = useState('')
  const [searchCrew, setSearchCrew] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const availableRanks = useMemo(() => {
    const rawRanks = users.map(u => u.rank ? u.rank.toUpperCase() : null).filter(Boolean)
    let ranks = [...new Set(rawRanks)].sort()
    if (searchRank.trim()) ranks = ranks.filter(r => r.toLowerCase().includes(searchRank.toLowerCase()))
    return ranks
  }, [users, searchRank])
  
  const availableUsers = useMemo(() => {
    let au = users.filter(u => {
      if (u.role !== 'learner') return false
      const r = u.rank ? u.rank.toUpperCase() : null
      return !targetRanks.includes(r)
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''))
    if (searchCrew.trim()) {
      const q = searchCrew.toLowerCase()
      au = au.filter(u => (u.name || '').toLowerCase().includes(q) || (u.rank || '').toLowerCase().includes(q))
    }
    return au
  }, [users, targetRanks, searchCrew])

  const availableUsersGrouped = useMemo(() => {
    const groups = {}
    availableUsers.forEach(u => {
      const r = u.rank ? u.rank.toUpperCase() : 'NO RANK'
      if(!groups[r]) groups[r] = []
      groups[r].push(u)
    })
    return groups
  }, [availableUsers])

  const toggleRank = (r) => setTargetRanks(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  const toggleUser = (id) => setTargetUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const allRanksSelected = availableRanks.length > 0 && availableRanks.every(r => targetRanks.includes(r))
  const toggleAllRanks = () => {
    if (allRanksSelected) {
      setTargetRanks(prev => prev.filter(r => !availableRanks.includes(r)))
    } else {
      setTargetRanks(prev => [...new Set([...prev, ...availableRanks])])
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await onSave({ ...form, targetRanks, targetUsers })
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save course settings')
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form className="admin-card" onSubmit={submit} style={{ width: '100%', maxWidth: 800, maxHeight: '90vh', overflowY: 'auto', background: '#fff', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' }}>Course Settings</h2>
            <p className="mut" style={{ margin: '4px 0 0', fontSize: 13 }}>Update course title and manage enrolled crew members.</p>
          </div>
          <button type="button" className="iconbtn" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: 24 }}>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="Title" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Firefighting" />
            </Field>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <Field label="Subtitle">
              <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Short desc" />
            </Field>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <Field label="Duration">
              <input value={form.durationLabel} onChange={(e) => set('durationLabel', e.target.value)} placeholder="2 hours" />
            </Field>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', background: '#f8fafc', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ flex: '1 1 300px' }}>
            <Field label="Target Ranks (Auto-enroll)">
              <div className="target-selection-container" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                <div className="search-bar" style={{ margin: 0, marginBottom: 16 }}>
                  <Search size={14} color="#64748b" />
                  <input type="text" placeholder="Search ranks..." value={searchRank} onChange={e => setSearchRank(e.target.value)} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Available Ranks
                  </span>
                  {availableRanks.length > 0 && (
                    <button type="button" onClick={toggleAllRanks} style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                      {allRanksSelected ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {availableRanks.length === 0 ? <div className="mut" style={{ fontSize: 13 }}>No ranks found</div> : null}
                <div className="chips-grid">
                  {availableRanks.map(r => (
                    <button type="button" key={r} className={`premium-chip ${targetRanks.includes(r) ? 'selected' : ''}`} onClick={() => toggleRank(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
          </div>
          <div style={{ flex: '1 1 300px' }}>
            <Field label="Target Specific Crew (Other crew members)">
              <div className="target-selection-container" style={{ background: '#fff', border: '1px solid #e2e8f0' }}>
                <div className="search-bar">
                  <Search size={14} color="#64748b" />
                  <input type="text" placeholder="Search crew by name or rank..." value={searchCrew} onChange={e => setSearchCrew(e.target.value)} />
                </div>
                {availableUsers.length === 0 ? <div className="mut" style={{ fontSize: 13, marginTop: 10 }}>No other crew available</div> : null}
                {Object.keys(availableUsersGrouped).sort((a, b) => {
                  if (a === 'NO RANK') return -1;
                  if (b === 'NO RANK') return 1;
                  return a.localeCompare(b);
                }).map(rankName => (
                  <div key={rankName} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {rankName}
                    </div>
                    <div className="crew-cards-grid">
                      {availableUsersGrouped[rankName].map(u => (
                        <button type="button" key={u.id} className={`premium-crew-card ${targetUsers.includes(u.id) ? 'selected' : ''}`} onClick={() => toggleUser(u.id)}>
                          <div className="crew-avatar">{u.name.substring(0, 2).toUpperCase()}</div>
                          <div className="crew-info">
                            <div className="crew-name">{u.name}</div>
                            <div className="crew-rank">{u.rank || 'No rank'}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="admin-field">
      <span style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6, display: 'block', fontSize: 13 }}>
        {label}{required && <i className="req" style={{ color: '#ef4444', marginLeft: 4 }}>*</i>}
      </span>
      {children}
    </label>
  )
}
