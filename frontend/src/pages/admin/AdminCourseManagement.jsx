import { useEffect, useState } from 'react'
import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom'
import { BookOpen, Users, Grid3x3, BarChart3, ChevronRight } from 'lucide-react'
import { adminListCourses, adminListUsers } from '../../api.js'

const NAV_ITEMS = [
  {
    to: '/admin/course-management/courses',
    label: 'Courses',
    sub: 'Build & manage content',
    icon: BookOpen,
    color: '#4f46e5',
    colorWeak: 'rgba(79,70,229,0.1)',
    colorBorder: 'rgba(79,70,229,0.35)',
  },
  {
    to: '/admin/course-management/assignments',
    label: 'Assignments',
    sub: 'Enroll & track crew',
    icon: Grid3x3,
    color: '#7c3aed',
    colorWeak: 'rgba(124,58,237,0.1)',
    colorBorder: 'rgba(124,58,237,0.35)',
  },
  {
    to: '/admin/course-management/report',
    label: 'Reporting',
    sub: 'Progress & completion',
    icon: BarChart3,
    color: '#059669',
    colorWeak: 'rgba(5,150,105,0.1)',
    colorBorder: 'rgba(5,150,105,0.35)',
  },
  {
    to: '/admin/course-management/users',
    label: 'Crew Users',
    sub: 'Manage user accounts',
    icon: Users,
    color: '#0284c7',
    colorWeak: 'rgba(2,132,199,0.1)',
    colorBorder: 'rgba(2,132,199,0.35)',
  },
]

export default function AdminCourseManagement() {
  const location = useLocation()
  const [stats, setStats] = useState({ courses: '—', users: '—' })

  useEffect(() => {
    Promise.all([adminListCourses(), adminListUsers()]).then(([courses, users]) => {
      const learners = users.filter(u => u.role === 'learner')
      setStats({ courses: courses.length, users: learners.length })
    }).catch(() => {})
  }, [])

  if (location.pathname === '/admin/course-management') {
    return <Navigate to="/admin/course-management/courses" replace />
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="cm-wrapper">

      {/* ── Compact Header Bar ── */}
      <div className="cm-header">
        <div className="cm-header-inner">
          {/* Left: icon + title */}
          <div className="cm-header-brand">
            <div className="cm-header-icon">
              <BookOpen size={16} strokeWidth={2.5} />
            </div>
            <div>
              <div className="cm-header-eyebrow">Fleet Training</div>
              <div className="cm-header-title">Course Management</div>
            </div>
          </div>

          {/* Right: stats */}
          <div className="cm-header-stats">
            <div className="cm-header-stat">
              <span className="cm-header-stat-val">{stats.courses}</span>
              <span className="cm-header-stat-lbl">Courses</span>
            </div>
            <div className="cm-header-sep" />
            <div className="cm-header-stat">
              <span className="cm-header-stat-val">{stats.users}</span>
              <span className="cm-header-stat-lbl">Crew</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav Cards ── */}
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

      {/* ── Content ── */}
      <div className="cm-content">
        <Outlet />
      </div>
    </div>
  )
}
