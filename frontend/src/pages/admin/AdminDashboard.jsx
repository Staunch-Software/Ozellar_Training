import { useEffect, useState } from 'react'
import { Users, GraduationCap, Award, Activity } from 'lucide-react'
import { adminListUsers, adminReport } from '../../api.js'

export default function AdminDashboard() {
  const [users, setUsers] = useState(null)
  const [report, setReport] = useState(null)

  useEffect(() => {
    adminListUsers().then(setUsers)
    adminReport().then(setReport)
  }, [])

  if (!users || !report) return <div className="spinner">Loading dashboard…</div>

  const crew = users.filter((u) => u.role === 'learner')
  const admins = users.filter((u) => u.role === 'admin')
  const activeCrew = crew.filter((u) => u.isActive).length

  let assigned = 0, passed = 0, inProgress = 0
  for (const row of report.rows) {
    for (const cid of Object.keys(row.cells)) {
      assigned++
      const s = row.cells[cid].status
      if (s === 'passed') passed++
      else if (s === 'in-progress') inProgress++
    }
  }
  const passRate = assigned ? Math.round((passed / assigned) * 100) : 0

  const stats = [
    { icon: <Users size={20} />, label: 'Crew', value: crew.length, note: `${activeCrew} active` },
    { icon: <GraduationCap size={20} />, label: 'Course assignments', value: assigned, note: `${inProgress} in progress` },
    { icon: <Award size={20} />, label: 'Passed', value: passed, note: `${passRate}% pass rate` },
    { icon: <Activity size={20} />, label: 'Admins', value: admins.length, note: 'with panel access' },
  ]

  return (
    <>
      <div className="eyebrow">Fleet training · Overview</div>
      <h1 style={{ fontSize: 26, margin: '6px 0 20px' }}>Dashboard</h1>
      <div className="stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-note">{s.note}</div>
          </div>
        ))}
      </div>
    </>
  )
}
