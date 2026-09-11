import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { Shield, LayoutDashboard, LogOut, BookOpen, ClipboardList, ChevronDown, Users, GraduationCap } from 'lucide-react'
import { ThemeToggle } from '../../App.jsx'
import { useAuth } from '../../auth.jsx'
import AdminNotificationBell from '../../AdminNotificationBell.jsx'

/* ── Profile Card Dropdown ── */
function AdminProfileCard({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const initials = user?.initials || 'A'
  const name = user?.name || ''
  const email = user?.email || ''
  const role = user?.role || 'admin'
  const isSuper = role === 'super_admin'
  const roleLabel = isSuper ? 'Super Admin' : 'Admin'
  const roleColor = isSuper ? '#f59e0b' : '#6366f1'
  const roleBg = isSuper ? 'rgba(245,158,11,0.12)' : 'rgba(99,102,241,0.12)'
  const roleGradient = isSuper ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id="admin-profile-btn"
        aria-label="Open profile menu"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '4px 8px 4px 4px', borderRadius: '20px',
          border: `1.5px solid ${open ? 'var(--border)' : 'transparent'}`,
          background: open ? 'var(--surface-2)' : 'transparent',
          cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}
      >
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: roleGradient, color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: '12.5px', fontWeight: 700, letterSpacing: '0.02em',
          boxShadow: `0 0 0 2px var(--surface), 0 2px 6px ${roleColor}4d`,
          flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.split(' ')[0]}
          </span>
          <span style={{ fontSize: '10px', color: roleColor, fontWeight: 600 }}>{roleLabel}</span>
        </div>
        <ChevronDown
          size={13}
          color="var(--text-mut)"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
        />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '14px', boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
          minWidth: '250px', zIndex: 200,
          overflow: 'hidden',
          animation: 'profileMenuIn 0.14s cubic-bezier(0.16,1,0.3,1)',
          transformOrigin: 'top right',
        }}>
          {/* User Info */}
          <div style={{
            padding: '18px 18px 16px',
            background: `linear-gradient(135deg, ${roleColor}14, transparent 70%)`,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: roleGradient, color: '#fff',
                display: 'grid', placeItems: 'center',
                fontSize: '16px', fontWeight: 700, flexShrink: 0,
                boxShadow: `0 4px 12px ${roleColor}40`,
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </div>
                {email && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }} title={email}>
                    {email}
                  </div>
                )}
              </div>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em',
              padding: '3px 9px', borderRadius: '99px', marginTop: '10px',
              background: roleBg, color: roleColor,
              border: `1px solid ${roleColor}44`,
            }}>
              <Shield size={9} strokeWidth={2.5} />
              {roleLabel}
            </span>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '6px' }}>
            <button
              id="admin-panel-link"
              onClick={() => { setOpen(false); navigate('/admin/user-management') }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500, color: 'var(--text)',
                textAlign: 'left', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Users size={14} />
              </div>
              Admin Panel
            </button>

            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 6px' }} />

            <button
              id="admin-sign-out-btn"
              onClick={() => { setOpen(false); onSignOut() }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                width: '100%', padding: '9px 12px', borderRadius: '8px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500, color: '#ef4444',
                textAlign: 'left', transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <LogOut size={14} />
              </div>
              Sign out
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes profileMenuIn {
          from { opacity: 0; transform: scale(0.96) translateY(-4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const signOut = () => { logout(); navigate('/') }

  const tab = ({ isActive }) => (isActive ? 'admin-tab on' : 'admin-tab')

  // Custom isActive check for Course Management to stay highlighted when child routes are active
  const isCourseManagementActive = () => location.pathname.startsWith('/admin/course-management')
  const isOrientationActive = () => location.pathname.startsWith('/admin/orientation-program') || location.pathname.startsWith('/admin/orientation/')

  const isCourseManagementRoute = location.pathname.startsWith('/admin/course-management')
  const isOrientationRoute = location.pathname.startsWith('/admin/orientation-program') || location.pathname.startsWith('/admin/orientation/')
  const isFlushRoute = isCourseManagementRoute || isOrientationRoute
  const isLockedPage = !isCourseManagementRoute && ['/admin/course-management/users', '/admin/course-management/assignments', '/admin/course-management/report'].includes(location.pathname)

  return (
    <div className="admin">
      <nav className="appnav">
        <Link to="/admin" className="brand">
          <span className="logo"><Shield size={18} /></span> Ozellar Admin
        </Link>
        <div className="navlinks">
          <NavLink to="/admin" end className={tab}><LayoutDashboard size={16} /> Dashboard</NavLink>
          <NavLink to="/admin/course-management/courses" className={isCourseManagementActive() ? 'admin-tab on' : 'admin-tab'}><BookOpen size={16} /> Course management</NavLink>
          <NavLink to="/admin/orientation-program/programs" className={isOrientationActive() ? 'admin-tab on' : 'admin-tab'}><GraduationCap size={16} /> Orientation Program</NavLink>
          <NavLink to="/admin/screening" className={tab}><ClipboardList size={16} /> Assessment</NavLink>
        </div>
        <div className="nav-right">
          <AdminNotificationBell />
          <ThemeToggle />
          <AdminProfileCard user={user} onSignOut={signOut} />
        </div>
      </nav>
      <div className={`page ${isLockedPage ? 'page-locked' : ''} ${isFlushRoute ? 'page-cm' : ''}`}>
        <Outlet />
      </div>
    </div>
  )
}
