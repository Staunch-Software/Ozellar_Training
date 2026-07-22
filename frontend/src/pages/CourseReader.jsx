import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, Play, Lock, Star, Check, Download, Info,
  ChevronLeft, ChevronRight, Image as ImageIcon, ClipboardCheck, ArrowDown,
} from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, markChapterComplete } from '../api.js'

export default function CourseReader() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [idx, setIdx] = useState(0)
  const [reached, setReached] = useState(false)   // scrolled to end of this lesson
  const [showSlide, setShowSlide] = useState(false)

  useEffect(() => {
    getCourse(slug).then((c) => {
      setCourse(c)
      const first = c.chapters.findIndex((ch) => !ch.done)
      setIdx(first === -1 ? 0 : first)
    })
  }, [slug])

  const ch = course?.chapters[idx]

  // scroll-to-unlock: enable actions once the reader reaches the end of the
  // lesson (or immediately if the lesson is too short to scroll)
  useEffect(() => {
    if (!ch) return
    setShowSlide(false)
    if (ch.done) { setReached(true); return }
    setReached(false)
    const check = () => {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight
      // auto-unlock lessons too short to scroll; otherwise require near-bottom
      if (scrollable <= 120 || window.scrollY + window.innerHeight >= doc.scrollHeight - 80) {
        setReached(true)
      }
    }
    const t = setTimeout(check, 350)
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => { clearTimeout(t); window.removeEventListener('scroll', check); window.removeEventListener('resize', check) }
  }, [idx, ch])

  if (!course) return (<><TopNav /><div className="spinner">Loading course…</div></>)

  const allDone = course.chapters.every((c) => c.done)
  const goto = (i) => { setIdx(i); window.scrollTo(0, 0) }

  const complete = () => {
    markChapterComplete(course.id, ch.id)
    getCourse(slug).then((c) => {
      setCourse(c)
      if (idx < c.chapters.length - 1) goto(idx + 1)
      else navigate(`/course/${slug}/assessment`)
    })
  }

  return (
    <>
      <TopNav />
      <div className="reader">
        <aside className="side">
          <div className="eyebrow">Course</div>
          <div className="ct">{course.title}</div>
          <div className="cprog-l"><span>{course.progressPct}% complete</span>
            <span>{course.completedCount}/{course.total}</span></div>
          <div className="prog"><i style={{ width: `${course.progressPct}%` }} /></div>

          <div className="chlabel">Lessons</div>
          <div className="chlist">
            {course.chapters.map((c, i) => (
              <button key={c.id} className={`ch ${i === idx ? 'on' : ''} ${c.done ? 'done' : ''}`}
                onClick={() => goto(i)}>
                {c.done ? <CheckCircle2 className="ci" /> : i === idx ? <Play className="ci" /> : <Circle className="ci" />}
                <span className="chn">{c.n}. {c.title}</span>
              </button>
            ))}
            <button className="ch" style={{ opacity: allDone ? 1 : 0.5, color: allDone ? 'var(--accent)' : undefined }}
              onClick={() => allDone && navigate(`/course/${slug}/assessment`)}>
              {allDone ? <Star className="ci" /> : <Lock className="ci" />}
              <span className="chn">Final assessment</span>
            </button>
          </div>
        </aside>

        <section className="content">
          {/* video, if the lesson has one */}
          {ch.videos && ch.videos.length > 0 && (
            <div className="media" style={{ marginBottom: 22 }}>
              <video controls poster={ch.image} preload="metadata">
                <source src={ch.videos[0]} type="video/mp4" />
              </video>
            </div>
          )}

          <div className="chead">
            <div>
              <div className="eyebrow">Lesson {ch.n} of {course.total}</div>
              <h1>{ch.title}</h1>
            </div>
          </div>

          {ch.intro && <p className="lead-p">{ch.intro}</p>}

          {/* structured content */}
          <div className="lesson-body">
            {ch.sections && ch.sections.map((s, si) => (
              <div className="grp" key={si}>
                {s.heading && <h4>{s.heading}</h4>}
                <ul>{s.items.map((it, li) => (
                  <li key={li}><span className="b" />{it}</li>
                ))}</ul>
              </div>
            ))}
            {(!ch.sections || ch.sections.length === 0) && !ch.videos.length && (
              <div className="novis"><Info size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                This lesson is delivered visually — open the original slide below.</div>
            )}
            {ch.figure && (
              <div className="figure-note"><ImageIcon size={15} /> {ch.figure}</div>
            )}
          </div>

          {/* original slide reference */}
          <button className="reveal" onClick={() => setShowSlide(!showSlide)}>
            <ImageIcon size={15} /> {showSlide ? 'Hide' : 'View'} original slide
            <ChevronRight size={14} style={{ transform: showSlide ? 'rotate(90deg)' : 'none', transition: '.15s' }} />
          </button>
          {showSlide && (
            <div className="slidefull">
              <img src={ch.image} alt={`Slide ${ch.n}`} />
              <div className="cap"><span>Original slide {ch.n}</span>
                <a href={ch.image} download className="dl"><Download size={13} /> Download</a></div>
            </div>
          )}

          {/* scroll gate hint */}
          {!reached && !ch.done && (
            <div className="gate-hint"><ArrowDown size={15} /> Scroll to the end of this lesson to continue</div>
          )}

          {/* actions */}
          <div className="lesson-actions">
            <button className="btn primary" disabled={!reached && !ch.done} onClick={complete}>
              <Check size={16} /> {ch.done ? 'Completed — continue' : 'Mark complete & continue'}
            </button>
          </div>

          <div className="pager">
            <button className="pgbtn" disabled={idx === 0} onClick={() => goto(idx - 1)}>
              <span className="l"><ChevronLeft size={11} style={{ verticalAlign: -1 }} /> Previous</span>
              <span className="tt">{idx > 0 ? course.chapters[idx - 1].title : '—'}</span>
            </button>
            {idx < course.chapters.length - 1 ? (
              <button className="pgbtn next" disabled={!reached && !ch.done} onClick={() => goto(idx + 1)}>
                <span className="l">Next <ChevronRight size={11} style={{ verticalAlign: -1 }} /></span>
                <span className="tt">{course.chapters[idx + 1].title}</span>
              </button>
            ) : (
              <button className="pgbtn next" disabled={!reached && !ch.done} onClick={() => navigate(`/course/${slug}/assessment`)}>
                <span className="l">Finish</span><span className="tt">Final assessment</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
