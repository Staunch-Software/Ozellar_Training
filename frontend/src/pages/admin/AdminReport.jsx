import { useEffect, useState } from 'react'
import { Download, Award, Clock, Circle } from 'lucide-react'
import { adminReport, adminDownloadReportCsv } from '../../api.js'

const STATUS = {
  passed: { cls: 'ok', icon: <Award size={13} />, label: 'Passed' },
  'in-progress': { cls: 'wip', icon: <Clock size={13} />, label: 'In progress' },
  assigned: { cls: 'muted', icon: <Circle size={13} />, label: 'Not started' },
}

export default function AdminReport() {
  const [data, setData] = useState(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { adminReport().then(setData) }, [])

  const download = async () => {
    setDownloading(true)
    try { await adminDownloadReportCsv() } finally { setDownloading(false) }
  }

  if (!data) return <div className="spinner">Loading report…</div>

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">Fleet training · Compliance</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 0' }}>Completion report</h1>
        </div>
        <button className="btn primary" onClick={download} disabled={downloading}>
          <Download size={16} /> {downloading ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto', marginTop: 16 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Crew</th><th>Crew ID</th><th>Rank</th>
              {data.courses.map((c) => <th key={c.id}>{c.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                <td><b>{row.name}</b></td>
                <td className="mono">{row.crewId}</td>
                <td>{row.rank || '—'}</td>
                {data.courses.map((c) => {
                  const cell = row.cells[c.id]
                  if (!cell) return <td key={c.id} className="mut">—</td>
                  const s = STATUS[cell.status] || STATUS.assigned
                  return (
                    <td key={c.id}>
                      <span className={`status ${s.cls}`}>{s.icon} {s.label}</span>
                      {cell.status === 'passed' && (
                        <div className="mut" style={{ fontSize: 12, marginTop: 3 }}>
                          {cell.score}% · {cell.passedOn}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={3 + data.courses.length} className="mut" style={{ textAlign: 'center', padding: 30 }}>No crew yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
