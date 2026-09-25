import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Routes, Route, Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { GraduationCap, Search, Sun, Moon, LogOut, Menu, X } from 'lucide-react'
import NotificationBell from './NotificationBell.jsx'
import Login from './pages/Login.jsx'
import MyCourses from './pages/MyCourses.jsx'
import CrewDashboardRouter from './pages/CrewDashboardRouter.jsx'
import CourseReader from './pages/CourseReader.jsx'
import Assessment from './pages/Assessment.jsx'
import Certificate from './pages/Certificate.jsx'
import Certificates from './pages/Certificates.jsx'
import Help from './pages/Help.jsx'
import Verify from './pages/Verify.jsx'
import UploadPhoto from './pages/UploadPhoto.jsx'
import Profile from './pages/Profile.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'
import AdminAssignments from './pages/admin/AdminAssignments.jsx'
import AdminReport from './pages/admin/AdminReport.jsx'
import AdminCourses from './pages/admin/AdminCourses.jsx'
import AdminCourseBuilder from './pages/admin/AdminCourseBuilder.jsx'
import AdminCourseCertificate from './pages/admin/AdminCourseCertificate.jsx'
import AdminCourseManagement from './pages/admin/AdminCourseManagement.jsx'
import AdminOrientationManagement from './pages/admin/AdminOrientationManagement.jsx'
import AdminOrientationPrograms from './pages/admin/AdminOrientationPrograms.jsx'
import AdminOrientationBuilder from './pages/admin/AdminOrientationBuilder.jsx'
import AdminOrientationPreview from './pages/admin/AdminOrientationPreview.jsx'
import AdminOrientationCandidates from './pages/admin/AdminOrientationCandidates.jsx'
import AdminOrientationEnrollments from './pages/admin/AdminOrientationEnrollments.jsx'
import AdminOrientationResults from './pages/admin/AdminOrientationResults.jsx'
import Orientation from './pages/Orientation.jsx'
import ApproverDashboard from './pages/ApproverDashboard.jsx'
import AdminScreening from './pages/admin/AdminScreening.jsx'
import AdminCoursePreview from './pages/admin/AdminCoursePreview.jsx'
import AdminUserManagement from './pages/admin/AdminUserManagement.jsx'
import TestWelcome from './pages/test/TestWelcome.jsx'
import TestExam from './pages/test/TestExam.jsx'
import TestResult from './pages/test/TestResult.jsx'
import { AuthProvider, useAuth, ProtectedRoute, AdminRoute, TestRoute, ApproverRoute } from './auth.jsx'

/* ---- theme ---- */
const ThemeCtx = createContext()
export const useTheme = () => useContext(ThemeCtx)

export function ThemeToggle({ className = 'iconbtn' }) {
  const { isDark, toggle } = useTheme()
  return (
    <button className={className} onClick={toggle} aria-label="Toggle color theme">
      {isDark ? <Sun className="icon" size={18} /> : <Moon className="icon" size={18} />}
    </button>
  )
}

/* ---- top nav for signed-in pages ---- */
export function TopNav({ searchQuery, onSearch }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mobileNavRef = useRef(null)
  const signOut = () => { logout(); navigate('/') }

  useEffect(() => {
    const onDoc = (e) => { if (mobileNavRef.current && !mobileNavRef.current.contains(e.target)) setMobileNavOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => { setMobileNavOpen(false) }, [location.pathname])

  return (
    <nav className="appnav">
      <Link to="/my-courses" className="brand">
        <span className="logo"><GraduationCap size={19} /></span> Ozellar Marine
      </Link>
      <div className="navlinks">
        <NavLink to="/my-courses" className={({ isActive }) => (isActive ? 'on' : '')}>My courses</NavLink>
        {user?.role === 'learner' && !user?.isVesselApprover && (
          <NavLink to="/orientation" className={({ isActive }) => (isActive ? 'on' : '')}>Orientation</NavLink>
        )}
        {user?.isVesselApprover && (
          <NavLink to="/approvals" className={({ isActive }) => (isActive ? 'on' : '')}>Approvals</NavLink>
        )}
        <NavLink to="/certificates" className={({ isActive }) => (isActive ? 'on' : '')}>Certificates</NavLink>
        <NavLink to="/help" className={({ isActive }) => (isActive ? 'on' : '')}>Help</NavLink>
      </div>
      <div className="nav-right">
        {onSearch ? (
          searchOpen || searchQuery ? (
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', padding: '4px 12px', borderRadius: '20px', gap: '8px' }}>
               <Search size={14} color="var(--text-mut)" />
               <input
                 autoFocus
                 type="text"
                 placeholder="Search..."
                 value={searchQuery || ''}
                 onChange={e => onSearch(e.target.value)}
                 onBlur={() => !searchQuery && setSearchOpen(false)}
                 style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text)', width: '120px', fontSize: '13.5px' }}
               />
            </div>
          ) : (
            <button className="iconbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search size={18} />
            </button>
          )
        ) : null}
        <NotificationBell />
        <ThemeToggle />
        <button className="iconbtn" aria-label="Sign out" title={`Sign out — ${user?.name || ''}`} onClick={signOut}>
          <LogOut size={18} />
        </button>
        <Link to="/profile" className="av" title={`Profile — ${user?.name || ''}${user?.rank ? ' · ' + user.rank : ''}`} style={{ textDecoration: 'none' }}>
          {user?.initials || '?'}
        </Link>

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
              <NavLink to="/my-courses" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                My courses
              </NavLink>
              {user?.role === 'learner' && !user?.isVesselApprover && (
                <NavLink to="/orientation" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  Orientation
                </NavLink>
              )}
              {user?.isVesselApprover && (
                <NavLink to="/approvals" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                  Approvals
                </NavLink>
              )}
              <NavLink to="/certificates" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                Certificates
              </NavLink>
              <NavLink to="/help" className={({ isActive }) => isActive ? 'mobile-nav-link on' : 'mobile-nav-link'}>
                Help
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ozellar.theme') || '')
  const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = theme === 'dark' || (theme === '' && prefersDark())
  useEffect(() => {
    if (theme) document.documentElement.setAttribute('data-theme', theme)
    else document.documentElement.removeAttribute('data-theme')
  }, [theme])
  const toggle = () => {
    const next = isDark ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('ozellar.theme', next)
  }
  return <ThemeCtx.Provider value={{ theme, isDark, toggle }}>{children}</ThemeCtx.Provider>
}

export default function App() {
  const P = (el) => <ProtectedRoute>{el}</ProtectedRoute>
  const T = (el) => <TestRoute>{el}</TestRoute>
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/verify/:id" element={<Verify />} />
        <Route path="/profile" element={P(<Profile />)} />
        <Route path="/upload-photo" element={P(<UploadPhoto />)} />
        <Route path="/dashboard" element={P(<CrewDashboardRouter />)} />
            <Route path="/my-courses" element={P(<MyCourses />)} />
        <Route path="/orientation" element={P(<Orientation />)} />
        <Route path="/certificates" element={P(<Certificates />)} />
        <Route path="/help" element={P(<Help />)} />
        <Route path="/course/:slug" element={P(<CourseReader />)} />
        <Route path="/course/:slug/assessment" element={P(<Assessment />)} />
        <Route path="/course/:slug/certificate" element={P(<Certificate />)} />

        {/* Screening test taker routes */}
        <Route path="/test/welcome" element={T(<TestWelcome />)} />
        <Route path="/test/exam" element={T(<TestExam />)} />
        <Route path="/test/result" element={T(<TestResult />)} />

        {/* Orientation Program approver (vessel Master / Chief Engineer) */}
        <Route path="/approvals" element={<ApproverRoute><ApproverDashboard /></ApproverRoute>} />

        <Route path="/admin/courses/:id/preview" element={<AdminRoute><AdminCoursePreview /></AdminRoute>} />
        <Route path="/admin/orientation/:id/preview" element={<AdminRoute><AdminOrientationPreview /></AdminRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />

          <Route path="course-management" element={<AdminCourseManagement />}>
            <Route path="courses" element={<AdminCourses />} />
            <Route path="assignments" element={<AdminAssignments />} />
            <Route path="report" element={<AdminReport />} />
            <Route path="users" element={<AdminUsers />} />
          </Route>

          {/* Keep builder at /admin/courses/:id so navigation from inside courses works properly */}
          <Route path="courses/:id" element={<AdminCourseBuilder />} />
          <Route path="courses/:id/certificate" element={<AdminCourseCertificate />} />

          <Route path="orientation-program" element={<AdminOrientationManagement />}>
            <Route path="programs" element={<AdminOrientationPrograms />} />
            <Route path="enrollments" element={<AdminOrientationEnrollments />} />
            <Route path="results" element={<AdminOrientationResults />} />
            <Route path="candidates" element={<AdminOrientationCandidates />} />
          </Route>
          {/* Keep builder at /admin/orientation/:id, same reasoning as the course builder */}
          <Route path="orientation/:id" element={<AdminOrientationBuilder />} />

          <Route path="screening" element={<AdminScreening />} />
          <Route path="user-management" element={<AdminUserManagement />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
