import { useEffect, useState } from 'react'
import { Check, Award, Clock } from 'lucide-react'
import { adminReport, adminAssign, adminUnassign } from '../../api.js'

export default function AdminAssignments() {
  const [data, setData] = useState(null)
  const [pending, setPending] = useState({})   // key `${learnerId}:${courseId}` while toggling

  const load = () => adminReport().then(setData)
  useEffect(() => { load() }, [])

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

  return (
    <>
      <div className="eyebrow">Fleet training · Assignments</div>
      <h1 style={{ fontSize: 26, margin: '6px 0 4px' }}>Course assignments</h1>
      <p className="mut" style={{ marginBottom: 18 }}>
        Tick a cell to assign a course to a crew member. <Award size={13} style={{ verticalAlign: -2 }} /> passed
        · <Clock size={13} style={{ verticalAlign: -2 }} /> in progress. Unassigning hides the course but keeps their record.
      </p>

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table matrix">
          <thead>
            <tr>
              <th className="sticky-col">Crew</th>
              {data.courses.map((c) => <th key={c.id}>{c.title}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                <td className="sticky-col">
                  <b>{row.name}</b><div className="mono mut">{row.crewId}</div>
                </td>
                {data.courses.map((c) => {
                  const cell = row.cells[c.id]
                  const assigned = !!cell
                  const key = `${row.learnerId}:${c.id}`
                  return (
                    <td key={c.id} style={{ textAlign: 'center' }}>
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
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
