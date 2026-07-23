import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { Shield, LayoutDashboard, Users, Grid3x3, BarChart3, LogOut } from 'lucide-react'
import { ThemeToggle } from '../../App.jsx'
import { useAuth } from '../../auth.jsx'

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const signOut = () => { logout(); navigate('/') }

  const tab = ({ isActive }) => (isActive ? 'admin-tab on' : 'admin-tab')

  return (
    <div className="admin">
      <nav className="appnav">
        <Link to="/admin" className="brand">
          <span className="logo"><Shield size={18} /></span> Ozellar Admin
        </Link>
        <div className="navlinks">
          <NavLink to="/admin" end className={tab}><LayoutDashboard size={16} /> Dashboard</NavLink>
          <NavLink to="/admin/users" className={tab}><Users size={16} /> Users</NavLink>
          <NavLink to="/admin/assignments" className={tab}><Grid3x3 size={16} /> Assignments</NavLink>
          <NavLink to="/admin/report" className={tab}><BarChart3 size={16} /> Reporting</NavLink>
        </div>
        <div className="nav-right">
          <ThemeToggle />
          <button className="iconbtn" aria-label="Sign out" title={`Sign out — ${user?.name || ''}`} onClick={signOut}>
            <LogOut size={18} />
          </button>
          <div className="av" title={`${user?.name || ''} · Admin`}>{user?.initials || 'A'}</div>
        </div>
      </nav>
      <div className="page">
        <Outlet />
      </div>
    </div>
  )
}
