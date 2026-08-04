import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Download, Eye } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCertificates, downloadCertificatePdf } from '../api.js'

export default function Certificates() {
  const navigate = useNavigate()
  const [certs, setCerts] = useState(null)

  useEffect(() => { getCertificates().then(setCerts) }, [])

  if (!certs) return (<><TopNav /><div className="spinner">Loading certificates…</div></>)

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="eyebrow">Your achievements</div>
        <h1 style={{ fontSize: 26, margin: '6px 0 20px' }}>Certificates</h1>

        {certs.length === 0 ? (
          <div className="empty">
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>No certificates yet</h1>
            <p>Pass a course's final assessment to earn your first certificate.</p>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => navigate('/my-courses')}>
              Go to my courses
            </button>
          </div>
        ) : (
          <div className="cert-list">
            {certs.map((c) => (
              <div key={c.id} className="cert-item">
                <div className="cert-seal"><Award size={22} /></div>
                <div className="cert-item-body">
                  <h3>{c.course}</h3>
                  <div className="cert-item-meta">
                    <span className="mono">{c.id}</span>
                    <span>Issued {c.issued}</span>
                    <span>Score {c.score}%</span>
                  </div>
                </div>
                <div className="cert-item-actions">
                  {c.pending ? (
                    <div style={{ color: 'var(--warning-strong)', fontWeight: 500, fontSize: 13, background: 'var(--warning-weak)', padding: '6px 12px', borderRadius: 6 }}>
                      Pending Approval
                    </div>
                  ) : (
                    <>
                      <button className="btn sm" onClick={() => navigate(`/course/${c.slug}/certificate`)}>
                        <Eye size={14} /> View
                      </button>
                      <button className="btn primary sm" onClick={() => downloadCertificatePdf(c.courseId, c.id)}>
                        <Download size={14} /> PDF
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
