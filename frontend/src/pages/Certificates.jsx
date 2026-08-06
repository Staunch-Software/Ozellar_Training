import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, Download, Eye, Search, X } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getCertificates, downloadCertificatePdf } from '../api.js'

export default function Certificates() {
  const navigate = useNavigate()
  const [certs, setCerts] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { getCertificates().then(setCerts) }, [])

  if (!certs) return (<><TopNav /><div className="spinner">Loading certificates…</div></>)

  const filteredCerts = certs.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return c.course.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  })

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="eyebrow">Your achievements</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 26, margin: 0 }}>Certificates</h1>
          {certs.length > 0 && (
            <div className="search-wrap" style={{ position: 'relative', width: 280 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-mut)' }} />
              <input 
                type="text" 
                placeholder="Search certificates..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ 
                  width: '100%', padding: '8px 32px', borderRadius: '20px', 
                  border: '1px solid var(--border)', background: 'var(--surface-2)',
                  fontSize: 14, color: 'var(--text)'
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: 10, background: 'none', border: 'none', color: 'var(--text-mut)', cursor: 'pointer', padding: 0 }}>
                  <X size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        {certs.length === 0 ? (
          <div className="empty">
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>No certificates yet</h1>
            <p>Pass a course's final assessment to earn your first certificate.</p>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => navigate('/my-courses')}>
              Go to my courses
            </button>
          </div>
        ) : filteredCerts.length === 0 ? (
          <div className="empty">
            <Search size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>No matches found</h1>
            <p>No certificates match your search query "{search}".</p>
            <button className="btn sm" style={{ marginTop: 16 }} onClick={() => setSearch('')}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="cert-list">
            {filteredCerts.map((c) => (
              <div key={c.id} className="cert-item">
                <div className="cert-seal"><Award size={22} /></div>
                <div className="cert-item-body">
                  <h3>{c.course}</h3>
                  <div className="cert-item-meta">
                    <span className="mono">{c.id}</span>
                    {c.issued !== 'Pending' && <span>Issued {c.issued}</span>}
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
