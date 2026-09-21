import { useEffect, useMemo, useState } from 'react'
import { Download, BarChart3, Ship, Search } from 'lucide-react'
import { adminGetOrientationResults, adminListOrientationPrograms, adminListOrientationVessels, adminDownloadOrientationResultsXlsx } from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'

const STATUS_OPTIONS = [
  { value: 'in_progress', label: 'In progress' },
  { value: 'submitted', label: 'Awaiting review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function ProgressBar({ pct }) {
  const cls = pct >= 100 ? 'orn-progress-fill--full' : pct >= 50 ? 'orn-progress-fill--mid' : 'orn-progress-fill--low'
  return (
    <div className="orn-progress">
      <div className="orn-progress-track">
        <div className={`orn-progress-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="orn-progress-pct">{pct}%</span>
    </div>
  )
}

export default function AdminOrientationResults() {
  const [rows, setRows] = useState(null)
  const [programs, setPrograms] = useState([])
  const [vessels, setVessels] = useState([])
  const [programId, setProgramId] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [vesselFilter, setVesselFilter] = useState('')
  const [q, setQ] = useState('')
  const [dl, setDl] = useState(false)

  useEffect(() => { adminListOrientationPrograms().then(setPrograms).catch(() => {}) }, [])
  useEffect(() => { adminListOrientationVessels().then(setVessels).catch(() => {}) }, [])
  useEffect(() => { adminGetOrientationResults(programId || undefined).then(setRows) }, [programId])

  const download = async () => {
    setDl(true)
    try { await adminDownloadOrientationResultsXlsx(programId || undefined) }
    finally { setDl(false) }
  }

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase()
    return (rows || []).filter((r) =>
      (!statusFilter || r.status === statusFilter) &&
      (!vesselFilter || r.vessel === vesselFilter) &&
      (!query || r.learnerName?.toLowerCase().includes(query)))
  }, [rows, statusFilter, vesselFilter, q])

  const stats = useMemo(() => {
    const s = { total: 0, approved: 0, pending: 0, in_progress: 0 }
    for (const r of rows || []) {
      s.total++
      if (r.status === 'approved') s.approved++
      else if (r.status === 'submitted') s.pending++
      else if (r.status === 'in_progress' || r.status === 'rejected') s.in_progress++
    }
    return s
  }, [rows])

  return (
    <div className="orn-page">
      <div className="orn-prog-header">
        <div className="orn-prog-header-left">
          <div className="orn-prog-header-icon">
            <BarChart3 size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="orn-title">Results</h2>
            <p className="orn-subtitle">Progress and approval status for every enrollment, across all vessels.</p>
          </div>
        </div>
        <div className="orn-prog-header-actions">
          <button className="btn" disabled={dl || !rows?.length} onClick={download}>
            <Download size={14} /> {dl ? 'Downloading…' : 'Download Excel'}
          </button>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div className="orn-prog-stats">
          <div className="orn-prog-stats-group">
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val">{stats.total}</span>
              <span className="orn-prog-stat-lbl">Total</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-approved)' }}>{stats.approved}</span>
              <span className="orn-prog-stat-lbl">Approved</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-submitted)' }}>{stats.pending}</span>
              <span className="orn-prog-stat-lbl">Awaiting review</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-in_progress)' }}>{stats.in_progress}</span>
              <span className="orn-prog-stat-lbl">In progress</span>
            </div>
          </div>

          <div className="orn-results-filters">
            <div className="inputwrap orn-filter-search">
              <Search size={14} />
              <input placeholder="Search by name..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <CardSelect className="orn-filter-select" value={programId} onChange={setProgramId}
              placeholder="All programs"
              options={[{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.title }))]} />
            <CardSelect className="orn-filter-select" value={statusFilter} onChange={setStatusFilter}
              placeholder="All statuses" options={[{ value: '', label: 'All statuses' }, ...STATUS_OPTIONS]} />
            <CardSelect className="orn-filter-select" value={vesselFilter} onChange={setVesselFilter}
              placeholder="All vessels"
              options={[{ value: '', label: 'All vessels' }, ...vessels.map((v) => ({ value: v.vessel, label: v.vessel }))]} />
          </div>
        </div>
      )}

      {!rows ? (
        <div className="spinner">Loading results…</div>
      ) : rows.length === 0 ? (
        <div className="orn-empty">
          <BarChart3 size={28} className="orn-empty-icon" />
          <div>No enrollments yet.</div>
        </div>
      ) : visible.length === 0 ? (
        <div className="orn-empty">
          <Search size={28} className="orn-empty-icon" />
          <div className="orn-empty-title">No matching results</div>
          <div className="orn-empty-desc">Try adjusting your filters or search term.</div>
        </div>
      ) : (
        <div className="orn-table-card">
          <div className="orn-table-scroll">
            <table className="orn-table">
              <thead>
                <tr>
                  <th>Crew</th>
                  <th>Vessel</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Submitted</th>
                  <th>Decided</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.enrollmentId}>
                    <td>
                      <div className="orn-table-name">
                        <div className="orn-avatar orn-avatar-sm">{initials(r.learnerName)}</div>
                        <div>
                          <div className="orn-table-name-text">{r.learnerName}</div>
                          <div className="orn-table-name-sub">{r.rank || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="orn-table-vessel"><Ship size={12} /> {r.vessel || '—'}</div>
                    </td>
                    <td className="orn-table-nowrap">{r.programTitle}</td>
                    <td><span className={`orn-badge orn-badge-status-${r.status}`}>{r.status.replace('_', ' ')}</span></td>
                    <td><ProgressBar pct={r.progressPct} /></td>
                    <td className="orn-table-muted orn-table-nowrap">{fmt(r.submittedAt)}</td>
                    <td className="orn-table-muted orn-table-nowrap">{fmt(r.decidedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
