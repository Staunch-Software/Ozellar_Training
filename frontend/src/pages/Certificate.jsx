import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, getLearner, getResult } from '../api.js'

/* Formal Ozellar Marine certificate — matches the provided PDF layout. */
export default function Certificate() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const learner = getLearner()

  useEffect(() => { getCourse(slug).then(setCourse) }, [slug])
  if (!course) return (<><TopNav /><div className="spinner">Loading…</div></>)

  const result = getResult(course.id)
  const passed = result?.passed ?? course.passed

  if (!passed) {
    return (
      <>
        <TopNav />
        <div className="page"><div className="empty">
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>No certificate yet</h1>
          <p>Pass the final assessment for this course to earn your certificate.</p>
          <button className="btn primary" style={{ marginTop: 16 }}
            onClick={() => navigate(`/course/${slug}/assessment`)}>Go to assessment</button>
        </div></div>
      </>
    )
  }

  const issueDate = '2026-07-22'
  const certNo = `OM-${course.id.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)}-0417`
  const topics = course.cert?.topics || []
  const titleUpper = course.cert?.titleUpper || course.title.toUpperCase()

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="cert-actions">
          <button className="btn" onClick={() => navigate('/my-courses')}><ArrowLeft size={15} /> Back to my courses</button>
          <button className="btn primary" onClick={() => window.print()}><Download size={16} /> Download / print</button>
        </div>

        <div className="cert-sheet">
          <div className="cert-inner">
            <div className="cert-co">OZELLAR MARINE PRIVATE LIMITED</div>
            <div className="cert-addr">Aneja Towers, B Block 4th Floor,<br />Perungudi, Chennai – 600096</div>

            <div className="cert-no">Certificate No: <span className="cert-fill">{certNo}</span></div>

            <div className="cert-line1">This is to certify that <span className="cert-fill">{learner.name}</span></div>
            <div className="cert-line2">PP No <span className="cert-fill">{learner.ppNo}</span> has successfully completed</div>

            <div className="cert-title">{titleUpper}</div>
            <div className="cert-conducted">
              Conducted on <span className="cert-fill">{issueDate}</span> at <span className="cert-fill">Chennai</span>
            </div>

            <div className="cert-covered">This course covered the following topics:</div>
            <ul className="cert-topics">
              {topics.map((t, i) => <li key={i}>{t}</li>)}
            </ul>

            <div className="cert-sign">
              <div className="sl">Course In-Charge Signature</div>
            </div>

            <div className="cert-foot">
              <div>Date of Issue: <span className="cert-fill">{issueDate}</span></div>
              <div className="cert-rev">Rev No 00/2026/11-03-2026</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
