import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, User, Calendar, Mail, Lock, Anchor, AlertCircle, ClipboardList, KeyRound } from 'lucide-react'
import { ThemeToggle } from '../App.jsx'
import { useAuth, homeFor } from '../auth.jsx'
import { searchCrewNames } from '../api.js'

export default function Login() {
  const navigate = useNavigate()
  const { user, login, screeningLogin } = useAuth()
  const [mode, setMode] = useState('crew')
  const [name, setName] = useState('')
  const [crewId, setCrewId] = useState('')
  const [needCrewId, setNeedCrewId] = useState(false)
  const [dob, setDob] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // test mode
  const [testName, setTestName] = useState('')
  const [testPassword, setTestPassword] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const nameWrapRef = useRef(null)
  const searchTimer = useRef(null)
  const skipNextSearch = useRef(false)

  useEffect(() => { if (user) navigate(homeFor(user), { replace: true }) }, [user])

  // debounced name search for crew mode
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (skipNextSearch.current) { skipNextSearch.current = false; return }
    const q = name.trim()
    if (mode !== 'crew' || q.length < 1) { setSuggestions([]); return }
    searchTimer.current = setTimeout(() => {
      searchCrewNames(q).then((results) => {
        setSuggestions(results)
        setShowSuggestions(true)
        setActiveIndex(-1)
      }).catch(() => setSuggestions([]))
    }, 250)
    return () => clearTimeout(searchTimer.current)
  }, [name, mode])

  useEffect(() => {
    const onDoc = (e) => {
      if (nameWrapRef.current && !nameWrapRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pickSuggestion = (s) => {
    skipNextSearch.current = true
    setName(s.name)
    setSuggestions([])
    setShowSuggestions(false)
  }

  const onNameKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIndex]) }
    else if (e.key === 'Escape') { setShowSuggestions(false) }
  }

  const switchMode = (m) => { setMode(m); setError(''); setNeedCrewId(false); setCrewId('') }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'test') {
        const u = await screeningLogin({ name: testName.trim(), password: testPassword })
        navigate(homeFor(u), { replace: true })
      } else {
        const body = mode === 'crew'
          ? { mode: 'crew', name: name.trim(), dob: dob.trim(),
              ...(needCrewId ? { crewId: crewId.trim() } : {}) }
          : { mode: 'admin', email: email.trim(), password }
        const u = await login(body)
        navigate(homeFor(u), { replace: true })
      }
    } catch (err) {
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

          {/* crew / admin / test toggle */}
          <div className="segmented" role="tablist">
            <button type="button" role="tab" className={mode === 'crew' ? 'on' : ''}
              onClick={() => switchMode('crew')}>Crew</button>
            <button type="button" role="tab" className={mode === 'admin' ? 'on' : ''}
              onClick={() => switchMode('admin')}>Admin</button>
            <button type="button" role="tab" className={mode === 'test' ? 'on' : ''}
              onClick={() => switchMode('test')}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ClipboardList size={13} />Test
            </button>
          </div>

          {mode === 'crew' ? (
            <>
              <div className="field">
                <label htmlFor="name">Full name</label>
                <div className="inputwrap" ref={nameWrapRef}>
                  <User />
                  <input id="name" type="text" placeholder="e.g. Rajan Kumar" autoComplete="off"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onKeyDown={onNameKeyDown}
                    role="combobox" aria-expanded={showSuggestions} aria-autocomplete="list"
                    aria-controls="crew-name-listbox" aria-haspopup="listbox" />
                  {showSuggestions && suggestions.length > 0 && (
                    <div id="crew-name-listbox" className="ac-pop" role="listbox" aria-label="Crew name suggestions">
                      {suggestions.map((s, i) => (
                        <button type="button" key={s.name} role="option"
                          className={`ac-item${i === activeIndex ? ' active' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s) }}
                          onMouseEnter={() => setActiveIndex(i)}>
                          <span className="ac-name">{s.name}</span>
                          {s.rank && <span className="ac-rank">{s.rank}</span>}
                        </button>
                      ))}
                    </div>
                  )}
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
          ) : mode === 'admin' ? (
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
          ) : (
            /* Test mode */
            <>
              <div className="field">
                <label htmlFor="test-name">Full name</label>
                <div className="inputwrap">
                  <User />
                  <input id="test-name" type="text" placeholder="As given by your administrator"
                    autoComplete="off"
                    value={testName} onChange={(e) => setTestName(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="test-pw">Test password</label>
                <div className="inputwrap">
                  <KeyRound />
                  <input id="test-pw" type="password" placeholder="••••••••••"
                    autoComplete="off"
                    value={testPassword} onChange={(e) => setTestPassword(e.target.value)} />
                </div>
              </div>
              <div className="hint" style={{ marginTop: '-4px', marginBottom: '8px' }}>
                Your login credentials are provided by the test administrator.
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
