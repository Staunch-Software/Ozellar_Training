import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Link, NavLink } from 'react-router-dom'
import { GraduationCap, Search, Bell, Sun, Moon, Menu } from 'lucide-react'
import Login from './pages/Login.jsx'
import MyCourses from './pages/MyCourses.jsx'
import CourseReader from './pages/CourseReader.jsx'
import Assessment from './pages/Assessment.jsx'
import Certificate from './pages/Certificate.jsx'
import { getLearner } from './api.js'

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
  const learner = getLearner()
  return (
    <nav className="appnav">
      <Link to="/my-courses" className="brand">
        <span className="logo"><GraduationCap size={19} /></span> Ozellar Marine
      </Link>
      <div className="navlinks">
        <NavLink to="/my-courses" className={({ isActive }) => (isActive ? 'on' : '')}>My courses</NavLink>
        <a>Certificates</a>
        <a>Help</a>
      </div>
      <div className="nav-right">
        <button className="iconbtn" aria-label="Search"><Search size={18} /></button>
        <button className="iconbtn" aria-label="Notifications"><Bell size={18} /></button>
        <ThemeToggle />
        <button className="iconbtn menu-toggle" aria-label="Menu"><Menu size={19} /></button>
        <div className="av" title={`${learner.name} · ${learner.rank}`}>{learner.initials}</div>
      </div>
    </nav>
  )
}

export default function App() {
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

  return (
    <ThemeCtx.Provider value={{ theme, isDark, toggle }}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/my-courses" element={<MyCourses />} />
        <Route path="/course/:slug" element={<CourseReader />} />
        <Route path="/course/:slug/assessment" element={<Assessment />} />
        <Route path="/course/:slug/certificate" element={<Certificate />} />
      </Routes>
    </ThemeCtx.Provider>
  )
}
