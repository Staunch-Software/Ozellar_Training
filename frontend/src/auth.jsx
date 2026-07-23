import { createContext, useContext, useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
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
  const logout = () => { api.setToken(null); setUser(null) }

  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  return children
}

// admin-only routes; signed-in learners are bounced to their courses
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin') return <Navigate to="/my-courses" replace />
  return children
}

// where a signed-in user belongs by role
export const homeFor = (u) => (u?.role === 'admin' ? '/admin' : '/my-courses')
