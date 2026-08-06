import { useEffect, useState } from 'react'
import { Check, Award, Clock, ClipboardList, Search, X } from 'lucide-react'
import { adminReport, adminAssign, adminUnassign } from '../../api.js'
import AdminHeader from '../../components/AdminHeader.jsx'
import Pagination from '../../components/Pagination.jsx'

export default function AdminAssignments() {
  const [data, setData] = useState(null)
  const [pending, setPending] = useState({})   // key `${learnerId}:${courseId}` while toggling
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')

  const load = () => adminReport().then(setData)
  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [search])

  const toggle = async (learnerId, courseId, assigned) => {
    const key = `${learnerId}:${courseId}`
    setPending((p) => ({ ...p, [key]: true }))
    try {
      if (assigned) await adminUnassign(learnerId, courseId)
      else await adminAssign(learnerId, courseId)
      await load()
    } finally {
      setPending((p) => { const n = { ...p }; delete n[key]; return n })
    }
  }

  if (!data) return <div className="spinner">Loading assignments…</div>

  const filteredRows = data.rows.filter(row => {
    if (!search) return true
    const term = search.toLowerCase()
    return (row.name || '').toLowerCase().includes(term) ||
           (row.crewId || '').toLowerCase().includes(term)
  })

  const itemsPerPage = 50
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage)
  const currentRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  return (
    <>
      <AdminHeader icon={ClipboardList} title="Course assignments" eyebrow="Fleet training · Enrollments">
        <div className="rpt-search-wrap" style={{ minWidth: 280, maxWidth: 400 }}>
          <Search size={14} className="rpt-field-icon" />
          <input 
            type="text" 
            placeholder="Search by name or crew ID..." 
            className="rpt-field"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="rpt-x-btn" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </AdminHeader>
      <p className="mut" style={{ marginBottom: 8, marginTop: -8 }}>
        Tick a cell to assign a course to a crew member. <Award size={13} style={{ verticalAlign: -2 }} /> passed
        · <Clock size={13} style={{ verticalAlign: -2 }} /> in progress. Unassigning hides the course but keeps their record.
      </p>

      <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 500 }}>
        <div className="admin-table-wrap" style={{ flex: 1 }}>
          <table className="admin-table matrix">
            <thead>
              <tr>
                <th className="sticky-col">Crew</th>
                {data.courses.map((c) => <th key={c.id}>{c.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, index) => (
              <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                <td className="sticky-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="mut" style={{ width: 24, fontSize: 11 }}>{(currentPage - 1) * itemsPerPage + index + 1}.</div>
                    <div>
                      <b>{row.name}</b><div className="mono mut">{row.crewId}</div>
                    </div>
                  </div>
                </td>
                {data.courses.map((c) => {
                  const cell = row.cells[c.id]
                  const assigned = !!cell
                  const key = `${row.learnerId}:${c.id}`
                  return (
                    <td key={c.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <button
                          className={`cellbox${assigned ? ' on' : ''}`}
                          disabled={!!pending[key]}
                          title={assigned ? 'Assigned — click to unassign' : 'Not assigned — click to assign'}
                          onClick={() => toggle(row.learnerId, c.id, assigned)}
                        >
                          {assigned && <Check size={15} />}
                        </button>
                        {cell && cell.status === 'passed' && <div className="cell-tag ok"><Award size={12} /> {cell.score}%</div>}
                        {cell && cell.status === 'in-progress' && <div className="cell-tag"><Clock size={12} /> started</div>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </>
  )
}
