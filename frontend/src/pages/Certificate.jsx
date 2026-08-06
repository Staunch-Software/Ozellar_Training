import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, ArrowLeft } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCourse, fetchCertificatePdfUrl } from '../api.js'

/* The on-screen preview embeds the very same PDF that downloads, so there is
   no drift between what the learner sees and what they get. */
export default function Certificate() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState(null)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let url
    getCourse(slug).then((c) => {
      setCourse(c)
      if (c.passed) {
        fetchCertificatePdfUrl(c.id)
          .then((u) => { url = u; setPdfUrl(u) })
          .catch(() => {})
          .finally(() => setReady(true))
      } else {
        setReady(true)
      }
    })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [slug])

  if (!course || !ready) return (<><TopNav /><div className="spinner">Loading…</div></>)

  if (!course.passed) {
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

  if (!pdfUrl) {
    return (
      <>
        <TopNav />
        <div className="page"><div className="empty">
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Pending Approval</h1>
          <p>You have passed the assessment! Your certificate will be available here once an administrator approves it.</p>
        </div></div>
      </>
    )
  }

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="cert-actions">
          <button className="btn" onClick={() => navigate('/my-courses')}><ArrowLeft size={15} /> Back to my courses</button>
          <a className="btn primary" href={pdfUrl} download="ozellar-certificate.pdf">
            <Download size={16} /> Download PDF
          </a>
        </div>
        <iframe className="cert-frame" src={pdfUrl} title="Certificate" />
      </div>
    </>
  )
}
