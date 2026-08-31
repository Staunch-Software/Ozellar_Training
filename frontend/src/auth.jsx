import { createContext, useContext, useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import * as api from './api.js'

const AuthCtx = createContext()
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // restore session on load if a token is present
  useEffect(() => {
    if (api.getToken()) {
      api.getMe().then(setUser).catch(() => api.setToken(null)).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (body) => {
    const { token, user } = await api.login(body)
    api.setToken(token)
    setUser(user)
    return user
  }

  const screeningLogin = async (body) => {
    const { token, candidate } = await api.screeningLogin(body)
    api.setToken(token)
    setUser(candidate)
    return candidate
  }

  const logout = () => { api.setToken(null); setUser(null) }

  return (
    <AuthCtx.Provider value={{ user, loading, login, screeningLogin, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  // Test takers must use TestRoute, not ProtectedRoute — bounce them home
  if (user.role === 'test_taker') return <Navigate to={homeFor(user)} replace />
  if (user.role === 'learner' && !user.hasPhoto && location.pathname !== '/upload-photo') {
    return <Navigate to="/upload-photo" replace />
  }
  return children
}

// admin-only routes; signed-in learners/test-takers are bounced away
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin') return <Navigate to={homeFor(user)} replace />
  return children
}

// test-taker-only routes
export function TestRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'test_taker') return <Navigate to={homeFor(user)} replace />
  return children
}

// where a signed-in user belongs by role
export const homeFor = (u) => {
  if (u?.role === 'admin') return '/admin'
  if (u?.role === 'test_taker') return '/test/welcome'
  return '/my-courses'
}
