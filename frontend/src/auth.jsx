import { createContext, useContext, useState, useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import * as api from './api.js'

const AuthCtx = createContext()
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [serverError, setServerError] = useState(false)

  // Restore the session on load if a token is present. Only a real auth
  // failure (401, handled inside api.req which clears the token) signs the user
  // out. A slow/unreachable server must NOT wipe the token — retry a few times,
  // then offer a Retry button instead of bouncing the user to the login page.
  const restoreSession = async () => {
    setServerError(false)
    setLoading(true)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        setUser(await api.getMe())
        setLoading(false)
        return
      } catch (err) {
        if (!api.getToken()) break               // 401 → req() already cleared the session
        if (err.status && err.status < 500) { api.setToken(null); break }
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
    if (api.getToken()) setServerError(true)
    setLoading(false)
  }

  useEffect(() => {
    if (api.getToken()) restoreSession()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (serverError) {
    return (
      <div className="spinner" style={{ flexDirection: 'column', gap: 12, textAlign: 'center' }}>
        <div>Can't reach the server right now. You're still signed in.</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn primary" onClick={restoreSession}>Retry</button>
          <button className="btn" onClick={() => { logout(); setServerError(false) }}>Sign out</button>
        </div>
      </div>
    )
  }

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
  if (user.role === 'learner' && !user.hasPhoto && location.pathname !== '/upload-photo' && location.pathname !== '/profile') {
    return <Navigate to="/upload-photo" replace />
  }
  return children
}

// admin-only routes; signed-in learners/test-takers are bounced away
export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== 'admin' && user.role !== 'super_admin') return <Navigate to={homeFor(user)} replace />
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

// Orientation Program approver-only routes (vessel Master / Chief Engineer).
// No separate account — any crew (learner) row currently qualifies if the
// backend says so (rank + on-sail + assigned vessel, recomputed fresh on
// every /api/auth/me, so this is never stale even on a direct/refresh visit).
export function ApproverRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spinner">Loading…</div>
  if (!user) return <Navigate to="/" replace />
  if (!user.isVesselApprover) return <Navigate to={homeFor(user)} replace />
  return children
}


// where a signed-in user belongs by role
export const homeFor = (u) => {
  if (u?.role === 'admin' || u?.role === 'super_admin') return '/admin'
  if (u?.role === 'test_taker') return '/test/welcome'
  if (u?.isVesselApprover) return '/approvals'
  return '/dashboard'
}
