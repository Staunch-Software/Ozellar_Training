import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, Play, Lock, Star, Check, Download, Info, X, Dot,
  ChevronLeft, ChevronRight, Image as ImageIcon, ArrowDown, HelpCircle,
} from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, markChapterComplete } from '../api.js'

// Blocking checkpoint quiz — crew must answer every question correctly to proceed.
// Wrong answers are eliminated (option hidden / struck); when only the correct
// option is left it is revealed automatically and the question is marked solved.
function ChapterQuiz({ questions, onPassed }) {
  // perQ: { tried: Set<number>, solved: bool, showAnswer: bool, feedback: string }
  const [perQ, setPerQ] = useState(() =>
    questions.map(() => ({ tried: new Set(), solved: false, showAnswer: false, feedback: '' }))
  )
  const [selections, setSelections] = useState(() => questions.map(() => null))

  useEffect(() => {
    if (!questions || questions.length === 0) {
      onPassed()
    }
  }, [questions, onPassed])

  if (!questions || questions.length === 0) {
    return (
      <div className="lesson-body">
        <div className="novis" style={{ marginBottom: 18 }}>
          <Check size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
          This checkpoint has no questions. You may proceed.
        </div>
      </div>
    )
  }

  const choose = (qi, oi) => {
    if (perQ[qi].solved) return
    setSelections((s) => s.map((v, i) => (i === qi ? oi : v)))
  }

  const submit = (qi) => {
    const q = questions[qi]
    const sel = selections[qi]
    if (sel === null || perQ[qi].solved) return

    if (sel === q.answer) {
      // Correct answer
      setPerQ((prev) => {
        const next = prev.map((p, i) => i === qi
          ? { ...p, solved: true, feedback: 'correct', showAnswer: false }
          : p)
        // Check if all questions are now solved
        if (next.every((p) => p.solved)) onPassed()
        return next
      })
    } else {
      // Wrong answer — eliminate this option
      setPerQ((prev) => {
        const p = prev[qi]
        const newTried = new Set(p.tried).add(sel)
        // If all remaining options except the correct one have been tried → auto-reveal
        const remaining = q.options.filter((_, oi) => oi !== q.answer && !newTried.has(oi))
        if (remaining.length === 0) {
          const next = prev.map((pp, i) => i === qi
            ? { ...pp, tried: newTried, solved: true, showAnswer: true, feedback: 'revealed' }
            : pp)
          if (next.every((pp) => pp.solved)) onPassed()
          return next
        }
        return prev.map((pp, i) => i === qi
          ? { ...pp, tried: newTried, feedback: 'wrong' }
          : pp)
      })
      // Clear selection so crew picks again
      setSelections((s) => s.map((v, i) => (i === qi ? null : v)))
    }
  }

  return (
    <div className="lesson-body">
      <div className="novis" style={{ marginBottom: 18 }}>
        <HelpCircle size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
        Answer every question correctly to continue to the next lesson.
      </div>
      {questions.map((q, qi) => {
        const state = perQ[qi]
        const sel = selections[qi]
        return (
          <div key={qi} className="review-q" style={{ marginBottom: 24 }}>
            <h3 className="qtext" style={{ fontSize: 17, margin: '6px 0 10px' }}>
              {qi + 1}. {q.q}
              {state.solved && <Check size={15} style={{ color: 'var(--success, #22c55e)', marginLeft: 8, verticalAlign: -2 }} />}
            </h3>

            {q.options.map((opt, oi) => {
              const eliminated = state.tried.has(oi)
              const isCorrect = oi === q.answer
              let cls = 'opt'
              if (state.showAnswer && isCorrect) cls += ' correct'
              else if (state.solved && isCorrect && !state.showAnswer) cls += ' correct'
              else if (eliminated) cls += ' wrong'
              else if (sel === oi) cls += ' sel'
              if (eliminated) return (
                <div key={oi} className={cls} style={{ opacity: 0.4, pointerEvents: 'none', textDecoration: 'line-through' }}>
                  <span className="box"><X size={14} /></span>{opt}
                </div>
              )
              return (
                <div key={oi} className={cls}
                  onClick={() => !state.solved && choose(qi, oi)}
                  style={{ cursor: state.solved ? 'default' : 'pointer' }}>
                  <span className="box">
                    {state.solved && isCorrect ? <Check size={14} /> : sel === oi ? <Dot size={16} /> : null}
                  </span>{opt}
                </div>
              )
            })}

            {/* Feedback row */}
            {state.feedback === 'correct' && (
              <div className="explain" style={{ background: 'var(--success-weak, #dcfce7)', color: 'var(--success, #16a34a)' }}>
                ✓ Correct!{q.explain && ` — ${q.explain}`}
              </div>
            )}
            {state.feedback === 'wrong' && (
              <div className="explain" style={{ background: 'var(--danger-weak)', color: 'var(--danger)' }}>
                ✗ Incorrect — try another option.
              </div>
            )}
            {state.feedback === 'revealed' && (
              <div className="explain" style={{ background: 'var(--warning-weak, #fef9c3)', color: 'var(--warning, #a16207)' }}>
                The correct answer has been revealed above.{q.explain && ` ${q.explain}`}
              </div>
            )}

            {!state.solved && (
              <button className="btn sm" style={{ marginTop: 8 }} disabled={sel === null}
                onClick={() => submit(qi)}>
                Check answer
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CourseReader() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [idx, setIdx] = useState(0)
  const [reached, setReached] = useState(false)   // scrolled to end of this lesson
  const [quizPassed, setQuizPassed] = useState(false) // true once all quiz questions answered correctly

  useEffect(() => {
    getCourse(slug).then((c) => {
      setCourse(c)
      const first = c.chapters.findIndex((ch) => !ch.done)
      setIdx(first === -1 ? 0 : first)
    })
  }, [slug])

  const ch = course?.chapters[idx]

  // Reset quiz gate whenever the active chapter changes
  useEffect(() => { setQuizPassed(false) }, [idx])

  // scroll-to-unlock: enable actions once the reader reaches the end of the
  // lesson (or immediately if the lesson is too short to scroll)
  useEffect(() => {
    if (!ch) return
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

  const complete = async () => {
    await markChapterComplete(course.id, ch.id)
    const c = await getCourse(slug)
    setCourse(c)
    if (idx < c.chapters.length - 1) goto(idx + 1)
    else navigate(`/course/${slug}/assessment`)
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
                {c.done ? <CheckCircle2 className="ci" /> : i === idx ? <Play className="ci" /> :
                 c.kind === 'quiz' ? <HelpCircle className="ci" /> : <Circle className="ci" />}
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
          {/* video(s), if the lesson has any */}
          {ch.videos && ch.videos.map((v, vi) => (
            <div className="media" style={{ marginBottom: 22 }} key={v}>
              <video controls poster={vi === 0 ? ch.image : undefined} preload="metadata">
                <source src={v} type="video/mp4" />
              </video>
            </div>
          ))}

          <div className="chead">
            <div>
              <div className="eyebrow">
                {ch.kind === 'quiz' ? 'Checkpoint quiz' : `Lesson ${ch.n} of ${course.total}`}
              </div>
              <h1>{ch.title}</h1>
            </div>
          </div>

          {ch.kind === 'quiz' ? (
            <ChapterQuiz key={ch.id} questions={ch.quizQuestions || []} onPassed={() => setQuizPassed(true)} />
          ) : (
            <>
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
                {(!ch.sections || ch.sections.length === 0) && (!ch.videos || ch.videos.length === 0) && (
                  <div className="novis"><Info size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                    This lesson is delivered visually — see the original slide below.</div>
                )}
                {ch.figure && (
                  <div className="figure-note"><ImageIcon size={15} /> {ch.figure}</div>
                )}
              </div>
            </>
          )}

          {/* original slide — always visible if it has no video and is not an interactive quiz */}
          {ch.image && (!ch.videos || ch.videos.length === 0) && ch.kind !== 'quiz' && (
            <div className="slidefull">
              <img src={ch.image} alt={`Slide ${ch.n}`} />
              <div className="cap"><span>Slide {ch.n}</span>
                <a href={ch.image} download className="dl"><Download size={13} /> Download</a></div>
            </div>
          )}

          {/* scroll gate hint (lesson) or quiz gate hint */}
          {ch.kind === 'quiz' ? (
            !quizPassed && !ch.done && (
              <div className="gate-hint"><HelpCircle size={15} /> Answer all questions correctly to continue</div>
            )
          ) : (
            !reached && !ch.done && (
              <div className="gate-hint"><ArrowDown size={15} /> Scroll to the end of this lesson to continue</div>
            )
          )}

          {/* actions */}
          <div className="lesson-actions">
            <button className="btn primary"
              disabled={ch.kind === 'quiz' ? (!quizPassed && !ch.done) : (!reached && !ch.done)}
              onClick={complete}>
              <Check size={16} /> {ch.done ? 'Completed — continue' : 'Mark complete & continue'}
            </button>
          </div>

          <div className="pager">
            <button className="pgbtn" disabled={idx === 0} onClick={() => goto(idx - 1)}>
              <span className="l"><ChevronLeft size={11} style={{ verticalAlign: -1 }} /> Previous</span>
              <span className="tt">{idx > 0 ? course.chapters[idx - 1].title : '—'}</span>
            </button>
            {idx < course.chapters.length - 1 ? (
              <button className="pgbtn next"
                disabled={ch.kind === 'quiz' ? (!quizPassed && !ch.done) : (!reached && !ch.done)}
                onClick={complete}>
                <span className="l">Next <ChevronRight size={11} style={{ verticalAlign: -1 }} /></span>
                <span className="tt">{course.chapters[idx + 1].title}</span>
              </button>
            ) : (
              <button className="pgbtn next"
                disabled={ch.kind === 'quiz' ? (!quizPassed && !ch.done) : (!reached && !ch.done)}
                onClick={() => {
                  if (!ch.done) {
                    markChapterComplete(slug, ch.id).then(() => navigate(`/course/${slug}/assessment`))
                  } else {
                    navigate(`/course/${slug}/assessment`)
                  }
                }}>
                <span className="l">Finish</span><span className="tt">Final assessment</span>
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
