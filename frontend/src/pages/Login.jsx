import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, User, Calendar, Mail, Lock, Anchor, AlertCircle } from 'lucide-react'
import { ThemeToggle } from '../App.jsx'
import { useAuth, homeFor } from '../auth.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [mode, setMode] = useState('crew')
  const [name, setName] = useState('')
  const [crewId, setCrewId] = useState('')
  const [needCrewId, setNeedCrewId] = useState(false)  // revealed only on a name+DOB collision
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (user) navigate(homeFor(user), { replace: true }) }, [user])

  const switchMode = (m) => {
    setMode(m); setError(''); setNeedCrewId(false); setCrewId('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = mode === 'crew'
        ? { mode: 'crew', name: name.trim(), dob: dob.trim(),
            ...(needCrewId ? { crewId: crewId.trim() } : {}) }
        : { mode: 'admin', email: email.trim(), password }
      const u = await login(body)
      navigate(homeFor(u), { replace: true })
    } catch (err) {
      // 409 = two crew share this name + DOB; ask for Crew ID to disambiguate
      if (err.status === 409) setNeedCrewId(true)
      setError(err.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-top"><ThemeToggle /></div>
      <div className="login">
        <div className="art">
          <div className="waves" />
          <div className="badge"><Anchor size={14} /> Ozellar Marine · Fleet Training</div>
          <div>
            <h3>Safe seas start with a trained crew.</h3>
            <p>Complete your assigned courses and assessments before joining your vessel.</p>
          </div>
          <div className="badge">SOLAS · IMSBC · ISM compliant</div>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="brand-lg">
            <span className="logo"><GraduationCap size={21} /></span> Ozellar Marine
          </div>

          {/* crew / admin toggle */}
          <div className="segmented" role="tablist">
            <button type="button" role="tab" className={mode === 'crew' ? 'on' : ''}
              onClick={() => switchMode('crew')}>Crew</button>
            <button type="button" role="tab" className={mode === 'admin' ? 'on' : ''}
              onClick={() => switchMode('admin')}>Admin</button>
          </div>

          {mode === 'crew' ? (
            <>
              <div className="field">
                <label htmlFor="name">Full name</label>
                <div className="inputwrap">
                  <User />
                  <input id="name" type="text" placeholder="e.g. Rajan Kumar" autoComplete="name"
                    value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="dob">Date of birth</label>
                <div className="inputwrap">
                  <Calendar />
                  <input id="dob" type="text" inputMode="numeric" maxLength={8} placeholder="DDMMYYYY"
                    autoComplete="off"
                    value={dob} onChange={(e) => setDob(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="hint">8 digits — day, month, year. Example: 25 Mar 2004 → 25032004</div>
              </div>
              {needCrewId && (
                <div className="field">
                  <label htmlFor="crewId">Crew ID</label>
                  <div className="inputwrap">
                    <Anchor />
                    <input id="crewId" type="text" placeholder="e.g. OZ1024" autoComplete="off" autoFocus
                      value={crewId} onChange={(e) => setCrewId(e.target.value)} />
                  </div>
                  <div className="hint">Another crew member shares your name and date of birth — your Crew ID confirms which record is yours.</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="email">Email</label>
                <div className="inputwrap">
                  <Mail />
                  <input id="email" type="email" placeholder="name@ozellarmarine.com" autoComplete="username"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="pw">Password</label>
                <div className="inputwrap">
                  <Lock />
                  <input id="pw" type="password" placeholder="••••••••••" autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
            </>
          )}

          {error && <div className="form-error"><AlertCircle size={15} /> {error}</div>}

          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="helpline">Trouble signing in? Contact your training officer.</div>
        </form>
      </div>
    </div>
  )
}
