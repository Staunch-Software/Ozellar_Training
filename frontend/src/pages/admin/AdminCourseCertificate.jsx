import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Award, Plus, Trash2, Save, AlertCircle, RefreshCw, GripVertical, CheckCircle2, ArrowRight } from 'lucide-react'
import { adminGetCourseBuilder, adminSaveCourseCertificate, adminCourseCertificatePreviewUrl } from '../../api.js'

const UNWANTED = new Set([
  'introduction', 'summary', 'conclusion', 'quiz', 'assessment',
  'final assessment', 'why', 'why?', 'how', 'how?', 'what', 'what?',
  'overview', 'agenda', 'objectives',
])

function suggestedTopics(chapters) {
  return (chapters || [])
    .filter(ch => ch.kind !== 'quiz')
    .map(ch => ch.title)
    .filter(t => {
      const lower = (t || '').toLowerCase().trim()
      return lower && !UNWANTED.has(lower) && !lower.startsWith('slide ')
    })
}

export default function AdminCourseCertificate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [titleUpper, setTitleUpper] = useState('')
  const [topics, setTopics] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(true)

  useEffect(() => {
    adminGetCourseBuilder(id).then(c => {
      setCourse(c)
      const cert = c.cert || {}
      setTitleUpper(cert.titleUpper || c.title.toUpperCase())
      setTopics(cert.topics && cert.topics.length ? cert.topics : suggestedTopics(c.chapters))
    })
  }, [id])

  // Debounced live preview refresh as the admin edits
  useEffect(() => {
    setPreviewLoading(true)
    const t = setTimeout(() => setPreviewNonce(n => n + 1), 500)
    return () => clearTimeout(t)
  }, [titleUpper, topics])

  const previewUrl = useMemo(() => {
    if (!course) return null
    return adminCourseCertificatePreviewUrl(id, { titleUpper, topics: topics.filter(t => t.trim()) })
      + `&_=${previewNonce}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course, id, previewNonce])

  const setTopic = (i, v) => setTopics(ts => ts.map((t, idx) => idx === i ? v : t))
  const removeTopic = (i) => setTopics(ts => ts.filter((_, idx) => idx !== i))
  const addTopic = () => setTopics(ts => [...ts, ''])

  // Drag-to-reorder — only armed while the grip handle is held down, so
  // dragging text inside the input itself still works normally.
  const dragIndex = useRef(null)
  const dragOverIndex = useRef(null)
  const [armedIdx, setArmedIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)

  const handleDragStart = (e, i) => {
    dragIndex.current = i
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragEnter = (e, i) => {
    e.preventDefault()
    if (dragIndex.current !== null && dragIndex.current !== i) {
      dragOverIndex.current = i
      setDragOverIdx(i)
    }
  }
  const handleDragEnd = () => {
    setArmedIdx(null)
    setDragOverIdx(null)
    if (dragIndex.current !== null && dragOverIndex.current !== null && dragIndex.current !== dragOverIndex.current) {
      const from = dragIndex.current
      const to = dragOverIndex.current
      setTopics(prev => {
        const next = [...prev]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return next
      })
    }
    dragIndex.current = null
    dragOverIndex.current = null
  }

  const save = async (andContinue) => {
    setError(''); setBusy(true)
    try {
      await adminSaveCourseCertificate(id, {
        titleUpper: titleUpper.trim(),
        topics: topics.map(t => t.trim()).filter(Boolean),
      })
      if (andContinue) {
        navigate(`/admin/courses/${id}`)
      } else {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 2200)
      }
    } catch (err) {
      setError(err.message || 'Could not save certificate details')
    } finally {
      setBusy(false)
    }
  }

  if (!course) return <div className="spinner">Loading…</div>

  const filledCount = topics.filter(t => t.trim()).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <button className="btn" style={{ marginBottom: 14, alignSelf: 'flex-start' }} onClick={() => navigate(`/admin/courses/${id}`)}>
        <ArrowLeft size={15} /> Back to course
      </button>

      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(239,68,68,0.05) 50%, rgba(245,158,11,0.03) 100%)',
        border: '1px solid rgba(245,158,11,0.18)',
        borderRadius: 16, padding: '20px 24px', marginBottom: 22,
        display: 'flex', alignItems: 'center', gap: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.14), transparent)', pointerEvents: 'none',
        }} />
        <div style={{
          width: 52, height: 52, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
          display: 'grid', placeItems: 'center', color: '#fff',
          boxShadow: '0 6px 20px rgba(245,158,11,0.35)',
        }}>
          <Award size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f59e0b' }}>
            Fleet Training · Certificate
          </span>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {course.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-mut)', marginTop: 3 }}>
            Set what appears on every certificate crew earn for passing this course
          </div>
        </div>
        <div style={{
          padding: '8px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.1)',
          textAlign: 'center', flexShrink: 0,
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{filledCount}</div>
          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginTop: 2, opacity: 0.85 }}>Topic{filledCount === 1 ? '' : 's'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Editor */}
        <div className="admin-card" style={{ flex: '1 1 380px', minWidth: 320 }}>
          <label className="admin-field" style={{ marginBottom: 20 }}>
            <span>Certificate title</span>
            <input
              value={titleUpper}
              onChange={e => setTitleUpper(e.target.value.toUpperCase())}
              placeholder="e.g. CARGO OPERATIONS TRAINING"
              style={{ fontWeight: 700, letterSpacing: '0.01em' }}
            />
          </label>

          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            This course covered the following topics
          </div>
          <div className="mut" style={{ fontSize: 12, marginBottom: 12 }}>
            Pre-filled from the course chapters — edit freely to match what should print.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {topics.map((t, i) => (
              <div
                key={i}
                draggable={armedIdx === i}
                onDragStart={e => handleDragStart(e, i)}
                onDragEnter={e => handleDragEnter(e, i)}
                onDragOver={e => e.preventDefault()}
                onDragEnd={handleDragEnd}
                style={{
                  display: 'flex', gap: 8, alignItems: 'center',
                  background: 'var(--surface-2)',
                  border: `1px solid ${dragOverIdx === i ? '#f59e0b' : 'var(--border)'}`,
                  borderRadius: 10, padding: '4px 6px 4px 10px',
                  opacity: armedIdx === i ? 0.5 : 1,
                  transition: 'border-color 0.12s ease, opacity 0.12s ease',
                }}
              >
                <span
                  onMouseDown={() => setArmedIdx(i)}
                  onMouseUp={() => setArmedIdx(null)}
                  style={{ display: 'flex', cursor: 'grab', flexShrink: 0 }}
                >
                  <GripVertical size={14} style={{ color: 'var(--text-faint)' }} />
                </span>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(245,158,11,0.14)', color: '#f59e0b',
                  fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center',
                }}>
                  {i + 1}
                </span>
                <input
                  value={t}
                  onChange={e => setTopic(i, e.target.value)}
                  placeholder="e.g. Apply safe, compliant cargo operations under SOLAS"
                  style={{
                    flex: 1, border: 'none', background: 'transparent', padding: '8px 4px',
                    fontSize: 13.5, color: 'var(--text)', outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeTopic(i)}
                  title="Remove topic"
                  style={{
                    display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 7,
                    color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer',
                    flexShrink: 0, transition: 'all 0.12s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-faint)' }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {topics.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '28px 12px', borderRadius: 10,
                border: '1.5px dashed var(--border)', color: 'var(--text-mut)', fontSize: 13,
              }}>
                No topics yet — add at least one below.
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={addTopic}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', marginTop: 10, padding: '10px', borderRadius: 10,
              border: '1.5px dashed rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.04)',
              color: '#f59e0b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.09)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.04)' }}
          >
            <Plus size={15} /> Add topic
          </button>

          {error && <div className="form-error" style={{ marginTop: 16 }}><AlertCircle size={15} /> {error}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn primary" disabled={busy} onClick={() => save(true)}
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}
            >
              {busy ? 'Saving…' : <>Save &amp; Continue <ArrowRight size={14} /></>}
            </button>
            <button className="btn" disabled={busy} onClick={() => save(false)}>
              <Save size={14} /> Save
            </button>
            <button
              type="button" disabled={busy} onClick={() => navigate(`/admin/courses/${id}`)}
              style={{ background: 'none', border: 'none', color: 'var(--text-mut)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}
            >
              Skip for now
            </button>
          </div>
          {savedFlash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, color: '#16a34a', fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Saved
            </div>
          )}
          <p className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
            This changes what's shown on every certificate for this course — including ones already
            issued. Anyone who re-downloads or re-views an existing certificate will see the updated
            topics, not what was there when they originally earned it.
          </p>
        </div>

        {/* Live preview */}
        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--text-mut)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: previewLoading ? '#f59e0b' : '#22c55e',
                transition: 'background 0.2s',
              }} />
              Live preview
            </span>
            <button type="button" className="btn sm" onClick={() => setPreviewNonce(n => n + 1)}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          <div style={{
            border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
            background: 'var(--surface-2)', aspectRatio: '210 / 297',
            boxShadow: '0 4px 20px rgba(0,0,0,0.06)', position: 'relative',
          }}>
            {previewUrl && (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title="Certificate preview"
                onLoad={() => setPreviewLoading(false)}
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
