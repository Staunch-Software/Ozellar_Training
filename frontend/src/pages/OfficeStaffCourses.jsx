import './MyCourses.css';
import './CourseReader.css';
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  BookOpen, Eye, LogOut, Search, ChevronLeft, ChevronRight,
  Circle, Play, Star, HelpCircle, Info, Image as ImageIcon,
  X, ArrowRight,
} from 'lucide-react'
import { getCourses, getCourse } from '../api.js'
import { useAuth } from '../auth.jsx'
import { ThemeToggle } from '../App.jsx'

// ─── Office Staff Top Nav ─────────────────────────────────────────
function OfficeNav({ searchQuery, onSearch }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const signOut = () => { logout(); navigate('/') }

  return (
    <nav className="appnav">
      <div className="brand" style={{ cursor: 'default' }}>
        <div className="logo-ring">
          <svg width="24" height="24" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="ozellar-grad-os" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f1592a" />
                <stop offset="100%" stopColor="#e04e22" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="36" fill="none" stroke="url(#ozellar-grad-os)" strokeWidth="20" />
          </svg>
        </div>
        <span className="brand-text">Ozellar<span className="brand-light">Marine</span></span>
      </div>
      <div className="navlinks">
        <span style={{
          fontSize: 12, fontWeight: 600, color: 'var(--accent)',
          background: 'rgba(224,120,32,0.1)', padding: '4px 12px',
          borderRadius: 20, border: '1px solid rgba(224,120,32,0.2)',
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <Eye size={12} />
          Office Staff — Browse Mode
        </span>
      </div>
      <div className="nav-right">
        {onSearch && (
          searchOpen || searchQuery ? (
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', padding: '4px 12px', borderRadius: '20px', gap: '8px' }}>
              <Search size={14} color="var(--text-mut)" />
              <input
                autoFocus
                type="text"
                placeholder="Search courses..."
                value={searchQuery || ''}
                onChange={e => onSearch(e.target.value)}
                onBlur={() => !searchQuery && setSearchOpen(false)}
                style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', width: '120px', fontSize: '13.5px' }}
              />
            </div>
          ) : (
            <button className="iconbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search size={18} />
            </button>
          )
        )}
        <ThemeToggle />
        <button className="iconbtn" aria-label="Sign out" title={`Sign out — ${user?.name || ''}`} onClick={signOut}>
          <LogOut size={18} />
        </button>
        <div className="av" title={`${user?.name || ''}${user?.rank ? ' · ' + user.rank : ''}`}>
          {user?.initials || '?'}
        </div>
      </div>
    </nav>
  )
}

// ─── Course Card ──────────────────────────────────────────────────
function CourseCard({ c, onOpen }) {
  const thumbClass = ['cargo-ops', 'hsm', 'cyber'].includes(c.id) ? c.id : 'default'
  return (
    <div className="myc-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className={`myc-thumb ${thumbClass}`}>
        <span className="myc-badge">Preview</span>
        <BookOpen size={46} strokeWidth={1.5} className="myc-thumb-icon" />
      </div>
      <div className="myc-body">
        <h3 className="myc-title">{c.title}</h3>
        <p className="myc-subtitle">{c.subtitle}</p>
        <div className="myc-footer">
          <div className="myc-time">
            <span>{c.total} modules</span>
            <span>·</span>
            <span>{c.durationLabel}</span>
          </div>
          <span className="myc-chip" style={{ background: 'rgba(224,120,32,0.1)', color: 'var(--accent)', border: '1px solid rgba(224,120,32,0.2)' }}>
            <Eye size={14} /> Browse
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Course List Page ─────────────────────────────────────────────
export function OfficeStaffCourseList() {
  const [courses, setCourses] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    getCourses().then(setCourses).catch(() => setCourses([]))
  }, [])

  if (!courses) return (
    <><OfficeNav searchQuery={searchQuery} onSearch={setSearchQuery} /><div className="spinner">Loading courses…</div></>
  )

  const filtered = courses.filter(c => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (c.title || '').toLowerCase().includes(q) || (c.subtitle || '').toLowerCase().includes(q)
  })

  return (
    <>
      <OfficeNav searchQuery={searchQuery} onSearch={setSearchQuery} />
      <div className="page myc-root">
        <div className="hello">
          <div>
            <div className="eyebrow">Welcome</div>
            <h1>{user?.name} · Office Staff</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              fontSize: 13, color: 'var(--text-mut)', padding: '8px 16px',
              background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Eye size={13} />
              Browse mode — all courses available to preview
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="cnd-empty" style={{ margin: '60px auto', textAlign: 'center', color: 'var(--text-mut)' }}>
            <BookOpen size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>No courses found</div>
            {searchQuery && <div style={{ fontSize: 14 }}>Try a different search term.</div>}
          </div>
        ) : (
          <div className="myc-grid">
            {filtered.map(c => (
              <CourseCard key={c.id} c={c} onOpen={() => navigate(`/office-courses/${c.slug}`)} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Course Reader (unrestricted preview mode) ────────────────────
export function OfficeStaffCourseReader() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [idx, setIdx] = useState(0)
  const [fullScreenImage, setFullScreenImage] = useState(null)

  useEffect(() => {
    getCourse(slug).then((c) => {
      setCourse(c)
      setIdx(0)
    }).catch(() => navigate('/office-courses'))
  }, [slug])

  if (!course) return (<><OfficeNav /><div className="spinner">Loading course…</div></>)

  const isFinalAssessment = idx === course.chapters.length
  const ch = isFinalAssessment ? null : course.chapters[idx]

  const goto = (i) => { setIdx(i); window.scrollTo(0, 0) }
  const next = () => { if (idx < course.chapters.length) goto(idx + 1) }
  const prev = () => { if (idx > 0) goto(idx - 1) }

  const atEnd = idx >= course.chapters.length

  return (
    <>
      <OfficeNav />

      {fullScreenImage && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setFullScreenImage(null)}
        >
          <img src={fullScreenImage} style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} alt="Full screen" />
          <div style={{ position: 'absolute', top: 20, right: 20, color: 'white', background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 100 }}>
            <X size={24} />
          </div>
        </div>
      )}

      <div className="reader">
        <aside className="side">
          <div className="eyebrow">Course</div>
          <div className="ct">{course.title}</div>
          <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={11} /> Browse Mode — No Restrictions
          </div>
          <button
            onClick={() => navigate('/office-courses')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-mut)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 14 }}
          >
            <ChevronLeft size={14} /> All courses
          </button>

          <div className="chlabel">Modules</div>
          <div className="chlist">
            {course.chapters.map((c, i) => (
              <button key={c.id} className={`ch ${i === idx ? 'on' : ''}`} onClick={() => goto(i)}>
                {i === idx ? <Play className="ci" /> : c.kind === 'quiz' ? <HelpCircle className="ci" /> : <Circle className="ci" />}
                <span className="chn">{c.n}. {c.title}</span>
              </button>
            ))}
            {course.hasAssessment && (
              <button
                className={`ch ${isFinalAssessment ? 'on' : ''}`}
                onClick={() => goto(course.chapters.length)}
                style={{ color: isFinalAssessment ? 'var(--accent)' : undefined }}
              >
                <Star className="ci" />
                <span className="chn">Final Assessment (Preview)</span>
              </button>
            )}
          </div>
        </aside>

        <section className="content">
          {isFinalAssessment ? (
            /* ── Final Assessment Preview ── */
            <>
              <div className="chead">
                <div>
                  <div className="eyebrow">Final Assessment · Preview</div>
                  <h1>{course.title}</h1>
                </div>
              </div>
              <div className="novis" style={{ marginBottom: 20, background: 'rgba(224,120,32,0.08)', color: 'var(--accent)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(224,120,32,0.2)' }}>
                <Info size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                Office Staff Preview — Questions shown for reference only. No grading.
              </div>
              <div className="lesson-body">
                {course.assessment?.questions?.length > 0 ? (
                  course.assessment.questions.map((q, qi) => (
                    <div key={qi} className="review-q" style={{ marginBottom: 20 }}>
                      <h3 className="qtext" style={{ fontSize: 17, margin: '6px 0 10px' }}>{qi + 1}. {q.q}</h3>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="opt" style={{ pointerEvents: 'none', opacity: 0.82 }}>
                          <span className="box" />{opt}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <div className="novis">No assessment questions in this course.</div>
                )}
              </div>
            </>
          ) : (
            /* ── Chapter Content (unrestricted) ── */
            <>
              {/* Videos — no forward-seek restriction */}
              {ch.videos && ch.videos.map((v, vi) => (
                <div className="media" style={{ marginBottom: 22 }} key={v}>
                  <video
                    controls
                    controlsList="nodownload"
                    poster={vi === 0 ? ch.image : undefined}
                    preload="metadata"
                    style={{ width: '100%', borderRadius: 8, display: 'block', background: '#000' }}
                  >
                    <source src={v} type="video/mp4" />
                  </video>
                </div>
              ))}

              <div className="chead">
                <div>
                  <div className="eyebrow">
                    {ch.kind === 'quiz' ? 'Checkpoint Quiz · Preview' : `Module ${ch.n} of ${course.total}`}
                  </div>
                  <h1>{ch.title}</h1>
                </div>
              </div>

              {ch.intro && <p className="lead-p">{ch.intro}</p>}

              <div className="lesson-body">
                {ch.sections && ch.sections.map((s, si) => (
                  <div className="grp" key={si}>
                    {s.heading && <h4>{s.heading}</h4>}
                    <ul>{s.items.map((it, li) => (
                      <li key={li}><span className="b" />{it}</li>
                    ))}</ul>
                  </div>
                ))}
                {(!ch.sections || ch.sections.length === 0) && (!ch.videos || ch.videos.length === 0) && (
                  <div className="novis">
                    <Info size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                    This module is delivered visually — see the slide below.
                  </div>
                )}
                {ch.figure && <div className="figure-note"><ImageIcon size={15} /> {ch.figure}</div>}

                {/* Quiz questions — shown in preview, not interactive */}
                {ch.kind === 'quiz' && ch.quizQuestions && ch.quizQuestions.length > 0 && (
                  <div style={{ marginTop: 20, padding: '16px 20px', background: 'rgba(224,120,32,0.06)', border: '1px solid rgba(224,120,32,0.16)', borderRadius: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Eye size={13} /> Quiz questions (Office Staff preview — not interactive)
                    </div>
                    {ch.quizQuestions.map((q, qi) => (
                      <div key={qi} style={{ marginBottom: 18 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{qi + 1}. {q.q}</div>
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="opt" style={{ pointerEvents: 'none', opacity: 0.82 }}>
                            <span className="box" />{opt}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Slide image — click to full screen */}
              {ch.image && (!ch.videos || ch.videos.length === 0) && ch.kind !== 'quiz' && (
                <div className="slidefull" onClick={() => setFullScreenImage(ch.image)} style={{ cursor: 'zoom-in' }}>
                  <img src={ch.image} alt={`Slide ${ch.n}`} />
                  <div className="cap"><span>Slide {ch.n}</span></div>
                </div>
              )}
            </>
          )}

          {/* Navigation — prev/next only, no mark-as-done */}
          <div className="lesson-actions">
            <button className="btn" onClick={prev} disabled={idx === 0}>
              <ChevronLeft size={16} /> Previous
            </button>
            <button className="btn primary" onClick={next} disabled={atEnd}>
              Next <ChevronRight size={16} />
            </button>
          </div>

          <div className="pager">
            <button className="pgbtn" disabled={idx === 0} onClick={prev}>
              <span className="l"><ChevronLeft size={11} style={{ verticalAlign: -1 }} /> Previous</span>
              <span className="tt">{idx > 0 ? course.chapters[idx - 1]?.title : '—'}</span>
            </button>
            <button className="pgbtn next" disabled={atEnd} onClick={next}>
              <span className="l">Next <ChevronRight size={11} style={{ verticalAlign: -1 }} /></span>
              <span className="tt">
                {!isFinalAssessment && idx < course.chapters.length - 1
                  ? course.chapters[idx + 1]?.title
                  : course.hasAssessment && !isFinalAssessment
                    ? 'Final Assessment (Preview)'
                    : '—'}
              </span>
            </button>
          </div>
        </section>
      </div>
    </>
  )
}
