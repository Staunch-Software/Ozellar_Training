import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check, X, Dot, ArrowRight, ArrowLeft, Award, RotateCcw } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, recordAssessment } from '../api.js'

export default function Assessment() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [qi, setQi] = useState(0)
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)
  const [finished, setFinished] = useState(false)

  useEffect(() => { getCourse(slug).then(setCourse) }, [slug])
  if (!course) return (<><TopNav /><div className="spinner">Loading assessment…</div></>)

  const questions = course.assessment.questions
  const q = questions[qi]
  const passMark = course.assessment.passMark
  const selected = answers[qi]

  const choose = (i) => { if (!checked) setAnswers({ ...answers, [qi]: i }) }
  const next = () => {
    setChecked(false)
    if (qi < questions.length - 1) setQi(qi + 1)
    else finish()
  }
  const finish = () => {
    const correct = questions.reduce((n, qq, i) => n + (answers[i] === qq.answer ? 1 : 0), 0)
    const score = Math.round((correct / questions.length) * 100)
    const passed = score >= passMark
    recordAssessment(course.id, score, passed)
    setFinished({ score, passed, correct })
  }

  if (finished) return (
    <Result course={course} finished={finished} passMark={passMark}
      onCert={() => navigate(`/course/${slug}/certificate`)}
      onRetry={() => { setAnswers({}); setQi(0); setChecked(false); setFinished(false) }} />
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
          <div className="prog" style={{ margin: '8px 0 4px' }}>
            <i style={{ width: `${((qi + (checked ? 1 : 0)) / questions.length) * 100}%` }} />
          </div>
          <h1 className="qtext">{q.q}</h1>

          {q.options.map((opt, i) => {
            let cls = 'opt'
            if (checked) {
              if (i === q.answer) cls += ' correct'
              else if (i === selected) cls += ' wrong'
            } else if (i === selected) cls += ' sel'
            return (
              <div key={i} className={cls} onClick={() => choose(i)}>
                <span className="box">
                  {checked && i === q.answer ? <Check size={14} /> :
                   checked && i === selected ? <X size={14} /> :
                   selected === i ? <Dot size={16} /> : null}
                </span>{opt}
              </div>
            )
          })}

          {checked && (
            <div className="explain" style={selected === q.answer ? {} : { background: 'var(--danger-weak)', color: 'var(--danger)' }}>
              {selected === q.answer ? 'Correct — ' : 'Not quite. '}{q.explain}
            </div>
          )}

          <div className="pager">
            <button className="btn" onClick={() => navigate(`/course/${slug}`)}>
              <ArrowLeft size={15} /> Back to course
            </button>
            {!checked ? (
              <button className="btn primary" disabled={selected == null} onClick={() => setChecked(true)}>Check answer</button>
            ) : (
              <button className="btn primary" onClick={next}>
                {qi < questions.length - 1 ? <>Next question <ArrowRight size={15} /></> : <>See result <ArrowRight size={15} /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function Result({ course, finished, passMark, onCert, onRetry }) {
  const { score, passed, correct } = finished
  return (
    <>
      <TopNav />
      <div className="page">
        <div className="assess" style={{ textAlign: 'center' }}>
          <div className="result-seal" style={{ width: 78, height: 78, background: passed ? 'var(--success)' : 'var(--danger)' }}>
            {passed ? <Award size={36} /> : <RotateCcw size={34} />}
          </div>
          <h1 style={{ fontSize: 28 }}>{passed ? 'Assessment passed' : 'Not passed yet'}</h1>
          <p className="mut" style={{ fontSize: 16, marginTop: 8 }}>
            You scored <b style={{ color: 'var(--text)' }}>{score}%</b> ({correct} of {course.assessment.questions.length} correct). Pass mark is {passMark}%.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 22 }}>
            {passed
              ? <button className="btn primary" onClick={onCert}><Award size={16} /> View your certificate</button>
              : <button className="btn primary" onClick={onRetry}><RotateCcw size={16} /> Retry assessment</button>}
          </div>
        </div>
      </div>
    </>
  )
}
