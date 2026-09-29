import '../../components/Navbar.css';
import './AdminShared.css';
import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { Shield, LayoutDashboard, LogOut, BookOpen, ClipboardList, ChevronDown, Users, GraduationCap, Menu, X, Lock } from 'lucide-react'
import { ThemeToggle } from '../../App.jsx'
import { useAuth } from '../../auth.jsx'
import AdminNotificationBell from '../../AdminNotificationBell.jsx'
import { adminPanelUpdateAdmin } from '../../api.js'

/* ── Profile Card Dropdown ── */
function AdminProfileCard({ user, onSignOut, onChangePassword }) {
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
  const roleColor = isSuper ? '#F97316' : '#123C3A'
  const roleBg = isSuper ? 'rgba(249,115,22,0.12)' : 'var(--surface-2)'
  const roleGradient = isSuper ? 'var(--accent-gradient)' : 'linear-gradient(135deg, #123C3A, #064E3B)'

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
          width: 'clamp(32px, 2.5vw, 48px)', height: 'clamp(32px, 2.5vw, 48px)', borderRadius: '50%',
          background: roleGradient, color: '#fff',
          display: 'grid', placeItems: 'center',
          fontSize: 'clamp(12.5px, 1vw, 20px)', fontWeight: 700, letterSpacing: '0.02em',
          boxShadow: `0 0 0 2px var(--surface), 0 2px 6px ${roleColor}4d`,
          flexShrink: 0,
        }}>
          {initials}
        </div>
                <div className="admin-profile-meta" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
          <span style={{ fontSize: 'clamp(12px, 0.9vw, 18px)', fontWeight: 600, color: 'var(--text)', maxWidth: 'clamp(90px, 8vw, 160px)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name.split(' ')[0]}
          </span>
          <span style={{ fontSize: 'clamp(10px, 0.75vw, 15px)', color: roleColor, fontWeight: 600 }}>{roleLabel}</span>
        </div>
        <ChevronDown
          className="admin-profile-chevron"
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
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(224,120,32,0.1)', color: '#E07820', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Users size={14} />
              </div>
              Admin Panel
            </button>

            <div style={{ height: '1px', background: 'var(--border)', margin: '4px 6px' }} />

            <button
              onClick={() => { setOpen(false); onChangePassword() }}
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
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'rgba(15,118,110,0.1)', color: '#0F766E', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Lock size={14} />
              </div>
              Change Password
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

/* ── Change Password Modal ── */
function ChangePasswordModal({ user, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!currentPassword) { setError('Please enter your current password'); return }
    if (!newPassword) { setError('Please enter a new password'); return }
    if (newPassword.length < 6) { setError('New password must be at least 6 characters'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }
    
    try {
      setSaving(true)
      setError('')
      await adminPanelUpdateAdmin(user.id, { password: newPassword, currentPassword })
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err.message || 'Failed to update password')
      setSaving(false)
    }
  }

  const inputStyle = { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', transition: 'border-color 0.15s', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-mut)', marginBottom: 6 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.2)', animation: 'profileMenuIn 0.2s cubic-bezier(0.16,1,0.3,1)', overflow: 'hidden' }}>
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15,118,110,0.1)', color: '#0F766E', display: 'grid', placeItems: 'center' }}>
              <Lock size={16} />
            </div>
            Change Password
          </h2>
        </div>
        <form onSubmit={submit} style={{ padding: '28px' }}>
          {error && <div style={{ background: '#fef2f2', color: '#991b1b', padding: '12px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 500, marginBottom: 24, border: '1px solid #f87171', display: 'flex', alignItems: 'center', gap: 8 }}><Shield size={16} /> {error}</div>}
          
          {success ? (
            <div style={{ textAlign: 'center', color: '#16a34a', padding: '30px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
                <Shield size={32} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', marginBottom: 4 }}>Password Updated</div>
              <div style={{ fontSize: 14, color: '#15803d', fontWeight: 500 }}>Your password has been changed successfully.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelStyle}>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <div>
                <label style={labelStyle}>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min. 6 chars)"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
              <div>
                <label style={labelStyle}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={onClose} style={{ padding: '11px 20px', borderRadius: 12, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-mut)', transition: 'all 0.15s' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '11px 24px', borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', cursor: saving ? 'wait' : 'pointer', fontSize: 14, fontWeight: 700, transition: 'all 0.15s', boxShadow: '0 4px 12px rgba(224,120,32,0.25)' }}>
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const signOut = () => { logout(); navigate('/') }

  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const mobileNavRef = useRef(null)

  // Close the mobile nav when tapping anywhere outside it
  useEffect(() => {
    const onDoc = (e) => { if (mobileNavRef.current && !mobileNavRef.current.contains(e.target)) setMobileNavOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Close it automatically whenever the route changes (link tapped, back/forward)
  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  const tab = ({ isActive }) => (isActive ? 'admin-tab on' : 'admin-tab')

  // Custom isActive check for Course Management to stay highlighted when child routes are active
  const isCourseManagementActive = () => location.pathname.startsWith('/admin/course-management')
  const isOrientationActive = () => location.pathname.startsWith('/admin/orientation-program') || location.pathname.startsWith('/admin/orientation/')

  const isCourseManagementRoute = location.pathname.startsWith('/admin/course-management')
  const isOrientationRoute = location.pathname.startsWith('/admin/orientation-program') || location.pathname.startsWith('/admin/orientation/')
  const isScreeningRoute = location.pathname.startsWith('/admin/screening'); const isFlushRoute = isCourseManagementRoute || isOrientationRoute
  const isLockedPage = !isCourseManagementRoute && ['/admin/course-management/users', '/admin/course-management/assignments', '/admin/course-management/report'].includes(location.pathname)

  return (
    <div className="admin">
            <nav className="appnav">
        <Link to="/admin" className="brand">
          <span className="logo"><Shield size={18} /></span>
          <span className="brand-text">Ozellar<span className="brand-light">Admin</span></span>
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
          <AdminProfileCard user={user} onSignOut={signOut} onChangePassword={() => setShowChangePassword(true)} />

          <div className="mobile-nav-wrap" ref={mobileNavRef}>
            <button
              className="menu-toggle"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(v => !v)}
            >
              {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
            </button>

            {mobileNavOpen && (
              <div className="mobile-nav-panel">
                <NavLink to="/admin" end className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  <LayoutDashboard size={16} /> Dashboard
                </NavLink>
                <NavLink to="/admin/course-management/courses" className={isCourseManagementActive() ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  <BookOpen size={16} /> Course management
                </NavLink>
                <NavLink to="/admin/orientation-program/programs" className={isOrientationActive() ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  <GraduationCap size={16} /> Orientation Program
                </NavLink>
                <NavLink to="/admin/screening" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  <ClipboardList size={16} /> Assessment
                </NavLink>
              </div>
            )}
          </div>
        </div>
      </nav>
      <div className={`page ${isLockedPage ? 'page-locked' : ''} ${isFlushRoute ? 'page-cm' : ''}`}>
        <Outlet />
      </div>

      {showChangePassword && <ChangePasswordModal user={user} onClose={() => setShowChangePassword(false)} />}
    </div>
  )
}
