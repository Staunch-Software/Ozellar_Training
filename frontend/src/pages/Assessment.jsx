import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check, X, Dot, ArrowRight, ArrowLeft, Award, RotateCcw, AlertCircle } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, submitAssessment } from '../api.js'

export default function Assessment() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState({})
  const [finished, setFinished] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { 
    getCourse(slug).then(c => {
      setCourse(c)
      if (c.latestAttempt) setFinished(c.latestAttempt)
    })
  }, [slug])
  if (!course) return (<><TopNav /><div className="spinner">Loading assessment…</div></>)

  const questions = course.assessment.questions
  const q = questions[qi]
  const passMark = course.assessment.passMark
  const maxAttempts = course.assessment.maxAttempts
  const attemptsUsed = course.assessment.attemptsUsed
  const isLastAttempt = maxAttempts && attemptsUsed === maxAttempts - 1
  const selected = answers[qi]
  const answeredCount = questions.filter((_, i) => answers[i] != null).length
  const allAnswered = answeredCount === questions.length
  const isLast = qi === questions.length - 1

  const choose = (i) => setAnswers({ ...answers, [qi]: i })

  const submit = async () => {
    setError('')
    setSubmitting(true)
    try {
      // send answers in question order; the server grades authoritatively and
      // returns the correct answers + explanations only now (never up front)
      const ordered = questions.map((_, i) => answers[i])
      const result = await submitAssessment(course.id, ordered)
      setFinished(result)
      window.scrollTo(0, 0)
    } catch (e) {
      setError(e.message || 'Could not submit your assessment.')
    } finally {
      setSubmitting(false)
    }
  }

  const retry = () => { setAnswers({}); setQi(0); setFinished(null); setError('') }

  if (finished) return (
    <Result course={course} result={finished} passMark={passMark}
      onCert={() => navigate(`/course/${slug}/certificate`)} onRetry={retry} />
  )

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="assess">
          <div className="eyebrow">Final assessment · {course.title}</div>
          <div className="qhead" style={{ marginTop: 10 }}>
            <span>Question {qi + 1} of {questions.length}</span>
            <span>Pass mark {passMark}%</span>
          </div>
          {isLastAttempt && (
            <div style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500, marginTop: 4 }}>
              ⚠️ This is your last attempt!
            </div>
          )}
          <div className="prog" style={{ margin: '8px 0 4px' }}>
            <i style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
          </div>
          <div className="hint" style={{ marginBottom: 6 }}>{answeredCount} of {questions.length} answered</div>
          <h1 className="qtext">{q.q}</h1>

          {q.options.map((opt, i) => {
            // no correct/incorrect styling here — grading happens on submit
            const cls = 'opt' + (selected === i ? ' sel' : '')
            return (
              <div key={i} className={cls} onClick={() => choose(i)}>
                <span className="box">{selected === i ? <Dot size={16} /> : null}</span>{opt}
              </div>
            )
          })}

          {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}

          <div className="pager">
            {qi === 0 ? (
              <button className="btn" onClick={() => navigate(`/course/${slug}`)}>
                <ArrowLeft size={15} /> Back to course
              </button>
            ) : (
              <button className="btn" onClick={() => setQi(qi - 1)}>
                <ArrowLeft size={15} /> Previous
              </button>
            )}
            {!isLast ? (
              <button className="btn primary" disabled={selected == null} onClick={() => setQi(qi + 1)}>
                Next question <ArrowRight size={15} />
              </button>
            ) : (
              <button className="btn primary" disabled={!allAnswered || submitting} onClick={submit}
                title={allAnswered ? '' : 'Answer every question before submitting'}>
                {submitting ? 'Submitting…' : <>Submit assessment <ArrowRight size={15} /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Result({ course, result, passMark, onCert, onRetry }) {
  const { score, passed, correct, total, review = [], attemptsUsed, maxAttempts } = result
  
  const isLastAttempt = maxAttempts && attemptsUsed === maxAttempts - 1
  const exhausted = maxAttempts && attemptsUsed >= maxAttempts

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="assess">
          <div style={{ textAlign: 'center' }}>
            <div className="result-seal" style={{ width: 78, height: 78, margin: '0 auto', background: passed ? 'var(--success)' : 'var(--danger)' }}>
              {passed ? <Award size={36} /> : <RotateCcw size={34} />}
            </div>
            <h1 style={{ fontSize: 28, marginTop: 14 }}>{passed ? 'Assessment passed' : 'Not passed yet'}</h1>
            <p className="mut" style={{ fontSize: 16, marginTop: 8 }}>
              You scored <b style={{ color: 'var(--text)' }}>{score}%</b> ({correct} of {total} correct). Pass mark is {passMark}%.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22 }}>
              {passed ? (
                result.certPending ? (
                  <div style={{ color: 'var(--warning-strong)', fontWeight: 500, padding: '10px 16px', background: 'var(--warning-weak)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} /> Certificate pending admin approval
                  </div>
                ) : (
                  <button className="btn primary" onClick={onCert}><Award size={16} /> View your certificate</button>
                )
              ) : exhausted ? (
                <div style={{ color: 'var(--danger)', fontWeight: 500, padding: '10px 16px', background: 'var(--danger-weak)', borderRadius: 6 }}>
                  No assessment attempts remaining. Contact your training officer.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <button className="btn primary" onClick={onRetry}>
                    <RotateCcw size={16} /> Retry assessment {maxAttempts ? `(Attempt ${attemptsUsed + 1} of ${maxAttempts})` : ''}
                  </button>
                  {isLastAttempt && <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 500 }}>⚠️ This is your last attempt!</span>}
                </div>
              )}
            </div>
          </div>

          {/* per-question review — from the server response, shown only after grading */}
          <div className="review" style={{ marginTop: 32 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Review your answers</div>
            {review.map((r, ri) => (
              <div key={ri} className="review-q" style={{ marginBottom: 20 }}>
                <div className="qhead">
                  <span style={{ fontWeight: 600 }}>Question {ri + 1}</span>
                  <span style={{ color: r.isCorrect ? 'var(--success)' : 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {r.isCorrect ? <><Check size={14} /> Correct</> : <><X size={14} /> Incorrect</>}
                  </span>
                </div>
                <h3 className="qtext" style={{ fontSize: 17, margin: '6px 0 10px' }}>{r.q}</h3>
                {r.options.map((opt, i) => {
                  let cls = 'opt'
                  if (r.correct !== null && i === r.correct) cls += ' correct'
                  else if (i === r.chosen) cls += ' wrong'
                  return (
                    <div key={i} className={cls} style={{ cursor: 'default' }}>
                      <span className="box">
                        {i === r.correct ? <Check size={14} /> :
                         i === r.chosen ? <X size={14} /> : null}
                      </span>{opt}
                    </div>
                  )
                })}
                {r.explain && (
                  <div className="explain" style={r.isCorrect ? {} : { background: 'var(--danger-weak)', color: 'var(--danger)' }}>
                    {r.explain}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
