import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, Play, Lock, Star, Check, Download, Info, Dot,
  ChevronLeft, ChevronRight, Image as ImageIcon, HelpCircle, AlertCircle, ArrowLeft,
  Menu, X, Maximize
} from 'lucide-react'
import { adminGetCourseBuilder } from '../../api.js'

function ChapterQuizPreview({ questions }) {
  if (!questions || questions.length === 0) {
    return (
      <div style={{ padding: 24, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b', textAlign: 'center' }}>
        <Check size={24} style={{ marginBottom: 12, opacity: 0.5 }} />
        <div>This checkpoint has no questions.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8, color: '#0369a1', fontSize: 14, background: '#e0f2fe', padding: '12px 16px', borderRadius: 8 }}>
        <Info size={16} /> Admin Preview: Quiz verification mode. Correct answers are highlighted.
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, color: '#0f172a', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, lineHeight: 1.4 }}>
              <span style={{ color: '#64748b', marginRight: 8 }}>{qi + 1}.</span>{q.q}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.answer
                return (
                  <div key={oi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: isCorrect ? '#16a34a' : '#475569' }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {isCorrect ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </div>
                    <span style={{ fontWeight: isCorrect ? 600 : 400, lineHeight: 1.4 }}>{opt}</span>
                  </div>
                )
              })}
            </div>
            {q.explain && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                <span style={{ color: '#0284c7', fontWeight: 600, marginRight: 6 }}>Explanation:</span> {q.explain}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function FinalAssessmentPreview({ assessment }) {
  if (!assessment || !assessment.questions || assessment.questions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16 }}>
        <CheckCircle2 size={48} style={{ color: '#16a34a', margin: '0 auto 16px' }} />
        <h2 style={{ color: '#0f172a', margin: '0 0 8px', fontSize: 24 }}>Course Preview Complete</h2>
        <p style={{ color: '#64748b', margin: 0 }}>This course has no final assessment.</p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24, padding: '16px 20px', background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 12, color: '#166534', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Star size={20} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Final Assessment Preview</div>
          <div style={{ fontSize: 13, color: '#15803d' }}>Showing all {assessment.questions.length} questions. Correct answers are highlighted.</div>
        </div>
      </div>
      
      <div style={{ marginBottom: 32, padding: '16px 20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, display: 'flex', gap: 32, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Pass mark</div>
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700 }}>{assessment.passMark}%</div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>Max attempts</div>
          <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 700 }}>{assessment.maxAttempts ? assessment.maxAttempts : 'Unlimited'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {assessment.questions.map((q, qi) => (
          <div key={qi} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, color: '#0f172a', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
            <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15, lineHeight: 1.4 }}>
              <span style={{ color: '#64748b', marginRight: 8 }}>{qi + 1}.</span>{q.q}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {q.options.map((opt, oi) => {
                const isCorrect = oi === q.answer
                return (
                  <div key={oi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: isCorrect ? '#16a34a' : '#475569' }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      {isCorrect ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                    </div>
                    <span style={{ fontWeight: isCorrect ? 600 : 400, lineHeight: 1.4 }}>{opt}</span>
                  </div>
                )
              })}
            </div>
            {q.explain && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                <span style={{ color: '#0284c7', fontWeight: 600, marginRight: 6 }}>Explanation:</span> {q.explain}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminCoursePreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [idx, setIdx] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [fullScreenImage, setFullScreenImage] = useState(null)

  useEffect(() => {
    adminGetCourseBuilder(id).then((c) => {
      setCourse(c)
      setIdx(0)
    })
  }, [id])

  if (!course) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#64748b' }}>
      Loading preview…
    </div>
  )

  const isFinalAssessment = idx === course.chapters.length
  const ch = isFinalAssessment ? null : course.chapters[idx]

  const goto = (i) => { setIdx(i); document.getElementById('preview-scroll-area').scrollTo(0, 0) }

  const complete = () => {
    if (idx < course.chapters.length) goto(idx + 1)
  }

  const navBtnStyle = {
    background: 'transparent', border: 'none', color: '#0f172a', cursor: 'pointer', 
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: '6px 12px', borderRadius: 100, transition: '0.2s'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      {/* Fullscreen Image Modal */}
      {fullScreenImage && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setFullScreenImage(null)}
        >
          <img src={fullScreenImage} style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
          <div style={{ position: 'absolute', top: 20, right: 20, color: 'white', background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 100, cursor: 'pointer' }} onClick={() => setFullScreenImage(null)}>
             <X size={24} />
          </div>
        </div>
      )}

      {/* Top Header */}
      <div style={{ flexShrink: 0, height: 58, background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 100 }}>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 8, borderRadius: 6, marginRight: 12, display: 'flex', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <button onClick={() => navigate(`/admin/courses/${id}`)} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6, color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '6px 12px' }} onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}>
          <ArrowLeft size={14} /> Exit Preview
        </button>
        
        <div style={{ height: 24, width: 1, background: '#e2e8f0', margin: '0 20px' }} />
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{course.title}</div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertCircle size={10} style={{ color: '#d97706' }} /> Restrictions disabled
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <div style={{ 
          width: sidebarOpen ? 320 : 0, 
          flexShrink: 0, 
          background: '#ffffff', 
          borderRight: '1px solid #e2e8f0',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflowX: 'hidden',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ width: 320, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 12 }}>
              Course Content
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {course.chapters.map((c, i) => (
                <button key={c.id} onClick={() => goto(i)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', width: '100%',
                  background: i === idx ? '#e0f2fe' : 'transparent',
                  border: '1px solid', borderColor: i === idx ? '#bae6fd' : 'transparent',
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: '0.2s',
                  color: i === idx ? '#0369a1' : '#475569'
                }} onMouseEnter={e => { if(i !== idx) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if(i !== idx) e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ marginTop: 2 }}>
                    {i === idx ? <Play size={16} /> : c.kind === 'quiz' ? <HelpCircle size={16} /> : <Circle size={16} />}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: i === idx ? 600 : 500, lineHeight: 1.4 }}>
                    {c.n}. {c.title}
                  </div>
                </button>
              ))}
              <button onClick={() => goto(course.chapters.length)} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px', width: '100%', marginTop: 8,
                background: isFinalAssessment ? '#dcfce7' : 'transparent',
                border: '1px solid', borderColor: isFinalAssessment ? '#bbf7d0' : 'transparent',
                borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: '0.2s',
                color: isFinalAssessment ? '#166534' : '#475569'
              }} onMouseEnter={e => { if(!isFinalAssessment) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if(!isFinalAssessment) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ marginTop: 2 }}>
                  {isFinalAssessment ? <Star size={16} /> : <Lock size={16} />}
                </div>
                <div style={{ fontSize: 13, fontWeight: isFinalAssessment ? 600 : 500, lineHeight: 1.4 }}>
                  Final Assessment
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Main Canvas */}
        <div id="preview-scroll-area" style={{ flex: 1, background: '#f8fafc', overflowY: 'auto', position: 'relative' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 32px 90px' }}>
            
            {isFinalAssessment ? (
              <FinalAssessmentPreview assessment={course.assessment} />
            ) : (
              <>
                <div style={{ marginBottom: 32 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {ch.kind === 'quiz' ? 'Checkpoint quiz' : `Lesson ${ch.n}`}
                  </div>
                  <h1 style={{ color: '#0f172a', margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.3 }}>{ch.title}</h1>
                </div>

                {ch.kind === 'quiz' ? (
                  <ChapterQuizPreview questions={ch.quizQuestions || []} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Media / Slides */}
                    {ch.videos && ch.videos.length > 0 ? (
                      ch.videos.map((v, vi) => (
                        <div key={v} style={{ background: '#ffffff', padding: 8, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}>
                          <video controls controlsList="nodownload" poster={vi === 0 ? ch.image : undefined} preload="metadata" style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', objectFit: 'contain', display: 'block', borderRadius: 8, background: '#000' }}>
                            <source src={v} type="video/mp4" />
                          </video>
                        </div>
                      ))
                    ) : ch.image ? (
                      <div 
                        style={{ background: '#ffffff', padding: 12, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', position: 'relative', cursor: 'zoom-in', transition: '0.2s' }} 
                        onClick={() => setFullScreenImage(ch.image)}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                      >
                        <img src={ch.image} alt={`Slide ${ch.n}`} style={{ width: '100%', maxHeight: 'calc(100vh - 240px)', objectFit: 'contain', display: 'block', borderRadius: 8, background: '#f8fafc' }} />
                        <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.95)', padding: '6px 12px', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
                          <Maximize size={16} /> Full Screen
                        </div>
                      </div>
                    ) : null}

                    {/* Text content */}
                    {ch.intro && <div style={{ fontSize: 16, color: '#334155', lineHeight: 1.6 }}>{ch.intro}</div>}
                    
                    {ch.sections && ch.sections.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {ch.sections.map((s, si) => (
                          <div key={si} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                            {s.heading && <h4 style={{ color: '#0f172a', margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{s.heading}</h4>}
                            <ul style={{ margin: 0, paddingLeft: 20, color: '#475569', display: 'flex', flexDirection: 'column', gap: 12 }}>
                              {s.items.map((it, li) => (
                                <li key={li} style={{ lineHeight: 1.5, paddingLeft: 4 }}>{it}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Floating Control Bar */}
      <div style={{ 
        position: 'fixed', bottom: 32, left: sidebarOpen ? 320 : 0, right: 0, 
        display: 'flex', justifyContent: 'center', pointerEvents: 'none', transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
      }}>
        <div style={{ 
          pointerEvents: 'auto', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(0,0,0,0.1)', padding: '6px', borderRadius: 100, display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}>
          <button onClick={() => goto(idx - 1)} disabled={idx === 0} style={{ ...navBtnStyle, opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? 'not-allowed' : 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <ChevronLeft size={18} /> Prev
          </button>
          
          <div style={{ color: '#64748b', fontSize: 13, fontWeight: 600, padding: '0 12px', minWidth: 60, textAlign: 'center' }}>
            <span style={{ color: '#0f172a' }}>{idx + 1}</span> / {course.chapters.length + 1}
          </div>

          <button onClick={complete} disabled={idx === course.chapters.length} style={{ ...navBtnStyle, background: idx === course.chapters.length ? 'transparent' : '#0284c7', color: idx === course.chapters.length ? '#0f172a' : 'white', opacity: idx === course.chapters.length ? 0.3 : 1, cursor: idx === course.chapters.length ? 'not-allowed' : 'pointer' }} onMouseEnter={e => {if(idx !== course.chapters.length) e.currentTarget.style.background = '#0369a1'}} onMouseLeave={e => {if(idx !== course.chapters.length) e.currentTarget.style.background = '#0284c7'}}>
            Next <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
