import { useEffect, useState } from 'react'
import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { GraduationCap, Users, BarChart3, ChevronRight, ClipboardList } from 'lucide-react'
import { adminListOrientationPrograms, adminListOrientationEnrollments } from '../../api.js'

const NAV_ITEMS = [
  {
    to: '/admin/orientation-program/programs',
    label: 'Programs',
    sub: 'Build & manage checklists',
    icon: GraduationCap,
    color: '#7c3aed',
    colorWeak: 'rgba(124,58,237,0.1)',
    colorBorder: 'rgba(124,58,237,0.35)',
  },
  {
    to: '/admin/orientation-program/enrollments',
    label: 'Enrollments',
    sub: 'Track enrolled officers',
    icon: ClipboardList,
    color: '#d97706',
    colorWeak: 'rgba(217,119,6,0.1)',
    colorBorder: 'rgba(217,119,6,0.35)',
  },
  {
    to: '/admin/orientation-program/results',
    label: 'Results',
    sub: 'Progress & approvals',
    icon: BarChart3,
    color: '#059669',
    colorWeak: 'rgba(5,150,105,0.1)',
    colorBorder: 'rgba(5,150,105,0.35)',
  },
  {
    to: '/admin/orientation-program/candidates',
    label: 'Crew',
    sub: 'Enroll for promotion',
    icon: Users,
    color: '#0284c7',
    colorWeak: 'rgba(2,132,199,0.1)',
    colorBorder: 'rgba(2,132,199,0.35)',
  },
]

export default function AdminOrientationManagement() {
  const location = useLocation()
  const [stats, setStats] = useState({ programs: '-', enrollments: '-' })

  useEffect(() => {
    Promise.all([adminListOrientationPrograms(), adminListOrientationEnrollments()])
      .then(([programs, enrollments]) => {
        setStats({ programs: programs.length, enrollments: enrollments.length })
      }).catch(() => {})
  }, [])

  if (location.pathname === '/admin/orientation-program') {
    return <Navigate to="/admin/orientation-program/programs" replace />
  }

  const isActive = (path) => location.pathname.startsWith(path)

  return (
    <div className="cm-wrapper">
      <div className="cm-header">
        <div className="cm-header-inner">
          <div className="cm-header-brand">
            <div className="cm-header-icon">
              <GraduationCap size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div className="cm-header-eyebrow">Fleet Training</div>
              <div className="cm-header-title">Orientation Program</div>
            </div>
          </div>
          <div className="cm-header-stats">
            <div className="cm-header-stat">
              <span className="cm-header-stat-val">{stats.programs}</span>
              <span className="cm-header-stat-lbl">Programs</span>
            </div>
            <div className="cm-header-sep" />
            <div className="cm-header-stat">
              <span className="cm-header-stat-val">{stats.enrollments}</span>
              <span className="cm-header-stat-lbl">Enrolled</span>
            </div>
          </div>
        </div>
      </div>

      <div className="cm-cards">
        {NAV_ITEMS.map(({ to, label, sub, icon: Icon, color, colorWeak, colorBorder }) => {
          const active = isActive(to)
          return (
            <NavLink
              key={to}
              to={to}
              className={`cm-card${active ? ' cm-card-active' : ''}`}
              style={active ? { '--card-color': color, '--card-weak': colorWeak, '--card-border': colorBorder } : { '--card-color': color, '--card-weak': colorWeak }}
            >
              <div className="cm-card-icon" style={{ background: active ? colorWeak : 'var(--surface-2)', color }}>
                <Icon size={20} strokeWidth={2} />
              </div>
              <div className="cm-card-body">
                <div className="cm-card-label" style={active ? { color } : {}}>{label}</div>
                <div className="cm-card-sub">{sub}</div>
              </div>
              <ChevronRight size={15} className="cm-card-arrow" style={active ? { color } : {}} />
            </NavLink>
          )
        })}
      </div>

      <div className="cm-content">
        <Outlet />
      </div>
    </div>
  )
}
