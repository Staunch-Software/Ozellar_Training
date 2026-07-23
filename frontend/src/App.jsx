import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom'
import { GraduationCap, Search, Sun, Moon, LogOut } from 'lucide-react'
import NotificationBell from './NotificationBell.jsx'
import Login from './pages/Login.jsx'
import MyCourses from './pages/MyCourses.jsx'
import CourseReader from './pages/CourseReader.jsx'
import Assessment from './pages/Assessment.jsx'
import Certificate from './pages/Certificate.jsx'
import Certificates from './pages/Certificates.jsx'
import Help from './pages/Help.jsx'
import Verify from './pages/Verify.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'
import AdminAssignments from './pages/admin/AdminAssignments.jsx'
import AdminReport from './pages/admin/AdminReport.jsx'
import { AuthProvider, useAuth, ProtectedRoute, AdminRoute } from './auth.jsx'

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
export function TopNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const signOut = () => { logout(); navigate('/') }
  return (
    <nav className="appnav">
      <Link to="/my-courses" className="brand">
        <span className="logo"><GraduationCap size={19} /></span> Ozellar Marine
      </Link>
      <div className="navlinks">
        <NavLink to="/my-courses" className={({ isActive }) => (isActive ? 'on' : '')}>My courses</NavLink>
        <NavLink to="/certificates" className={({ isActive }) => (isActive ? 'on' : '')}>Certificates</NavLink>
        <NavLink to="/help" className={({ isActive }) => (isActive ? 'on' : '')}>Help</NavLink>
      </div>
      <div className="nav-right">
        <button className="iconbtn" aria-label="Search"><Search size={18} /></button>
        <NotificationBell />
        <ThemeToggle />
        <button className="iconbtn" aria-label="Sign out" title={`Sign out — ${user?.name || ''}`} onClick={signOut}>
          <LogOut size={18} />
        </button>
        <div className="av" title={`${user?.name || ''}${user?.rank ? ' · ' + user.rank : ''}`}>{user?.initials || '?'}</div>
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
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/verify/:id" element={<Verify />} />
        <Route path="/my-courses" element={P(<MyCourses />)} />
        <Route path="/certificates" element={P(<Certificates />)} />
        <Route path="/help" element={P(<Help />)} />
        <Route path="/course/:slug" element={P(<CourseReader />)} />
        <Route path="/course/:slug/assessment" element={P(<Assessment />)} />
        <Route path="/course/:slug/certificate" element={P(<Certificate />)} />

        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="assignments" element={<AdminAssignments />} />
          <Route path="report" element={<AdminReport />} />
        </Route>
      </Routes>
    </ThemeProvider>
  )
}
