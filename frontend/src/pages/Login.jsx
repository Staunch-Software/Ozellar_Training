import './Login.css';
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, User, Calendar, Mail, Lock, Anchor, AlertCircle, ClipboardList, KeyRound, ShieldCheck, Compass, Briefcase } from 'lucide-react'
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
  // office staff mode (shares name + dob fields with crew)
  const [osName, setOsName] = useState('')
  const [osDob, setOsDob] = useState('')
  const [osNeedCrewId, setOsNeedCrewId] = useState(false)
  const [osCrewId, setOsCrewId] = useState('')

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const nameWrapRef = useRef(null)
  const osNameWrapRef = useRef(null)
  const searchTimer = useRef(null)
  const skipNextSearch = useRef(false)

  const [osSuggestions, setOsSuggestions] = useState([])
  const [osShowSuggestions, setOsShowSuggestions] = useState(false)
  const [osActiveIndex, setOsActiveIndex] = useState(-1)
  const osSearchTimer = useRef(null)
  const osSkipNextSearch = useRef(false)

  useEffect(() => {
    if (user) navigate(homeFor(user), { replace: true })
  }, [user])

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

  // debounced name search for office_staff mode
  useEffect(() => {
    clearTimeout(osSearchTimer.current)
    if (osSkipNextSearch.current) { osSkipNextSearch.current = false; return }
    const q = osName.trim()
    if (mode !== 'office_staff' || q.length < 1) { setOsSuggestions([]); return }
    osSearchTimer.current = setTimeout(() => {
      searchCrewNames(q, 'office_staff').then((results) => {
        setOsSuggestions(results)
        setOsShowSuggestions(true)
        setOsActiveIndex(-1)
      }).catch(() => setOsSuggestions([]))
    }, 250)
    return () => clearTimeout(osSearchTimer.current)
  }, [osName, mode])

  useEffect(() => {
    const onDoc = (e) => {
      if (nameWrapRef.current && !nameWrapRef.current.contains(e.target)) setShowSuggestions(false)
      if (osNameWrapRef.current && !osNameWrapRef.current.contains(e.target)) setOsShowSuggestions(false)
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

  const osPickSuggestion = (s) => {
    osSkipNextSearch.current = true
    setOsName(s.name)
    setOsSuggestions([])
    setOsShowSuggestions(false)
  }

  const onNameKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); pickSuggestion(suggestions[activeIndex]) }
    else if (e.key === 'Escape') { setShowSuggestions(false) }
  }

  const osOnNameKeyDown = (e) => {
    if (!osShowSuggestions || osSuggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOsActiveIndex((i) => (i + 1) % osSuggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setOsActiveIndex((i) => (i <= 0 ? osSuggestions.length - 1 : i - 1)) }
    else if (e.key === 'Enter' && osActiveIndex >= 0) { e.preventDefault(); osPickSuggestion(osSuggestions[osActiveIndex]) }
    else if (e.key === 'Escape') { setOsShowSuggestions(false) }
  }

  const switchMode = (m) => {
    setMode(m); setError('')
    setNeedCrewId(false); setCrewId('')
    setOsNeedCrewId(false); setOsCrewId('')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'test') {
        const u = await screeningLogin({ name: testName.trim(), password: testPassword })
        navigate(homeFor(u), { replace: true })
      } else if (mode === 'office_staff') {
        const body = { mode: 'office_staff', name: osName.trim(), dob: osDob.trim(),
          ...(osNeedCrewId ? { crewId: osCrewId.trim() } : {}) }
        const u = await login(body)
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
      if (err.status === 409) {
        if (mode === 'office_staff') setOsNeedCrewId(true)
        else setNeedCrewId(true)
      }
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
          <div className="badge"><GraduationCap size={16} /> FLEET TRAINING</div>
          <div className="art-content">
            <div className="art-accent-line" />
            <h3>Safe seas start with a <span className="highlight">trained seafarer.</span></h3>
            <p>Complete your assigned courses and assessments before joining your vessel.</p>
          </div>
          <div className="art-compliance">
            <div className="art-compliance-item"><ShieldCheck size={12} /> SOLAS COMPLIANT</div>
            <div className="art-compliance-item"><Anchor size={12} /> IMSBC COMPLIANT</div>
            <div className="art-compliance-item"><Compass size={12} /> ISM COMPLIANT</div>
          </div>
        </div>

        <form className="form" onSubmit={submit}>
          <div className="brand-lg" style={{ paddingBottom: '10px' }}>
            <span className="logo"><GraduationCap size={21} /></span>
            <img 
              src="/ozellar-marine-global-logo.gif" 
              alt="Ozellar Marine" 
              style={{ 
                height: '42px', 
                objectFit: 'contain',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.05))'
              }} 
            />
          </div>

          {/* crew / admin / test / office staff toggle */}
          <div className="segmented" role="tablist">
            <button type="button" role="tab" className={mode === 'crew' ? 'on' : ''}
              onClick={() => switchMode('crew')}>
              <Anchor size={14} />
              <span>Seafarer</span>
            </button>
            <button type="button" role="tab" className={mode === 'admin' ? 'on' : ''}
              onClick={() => switchMode('admin')}>
              <ShieldCheck size={14} />
              <span>Admin</span>
            </button>
            <button type="button" role="tab" className={mode === 'test' ? 'on' : ''}
              onClick={() => switchMode('test')}>
              <ClipboardList size={14} />
              <span>Test</span>
            </button>
            <button type="button" role="tab" className={mode === 'office_staff' ? 'on' : ''}
              onClick={() => switchMode('office_staff')}>
              <Briefcase size={14} />
              <span>Office Staff</span>
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
                    <div id="crew-name-listbox" className="ac-pop" role="listbox" aria-label="Seafarer name suggestions">
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
                  <label htmlFor="crewId">Seafarer ID</label>
                  <div className="inputwrap">
                    <Anchor />
                    <input id="crewId" type="text" placeholder="e.g. OZ1024" autoComplete="off" autoFocus
                      value={crewId} onChange={(e) => setCrewId(e.target.value)} />
                  </div>
                  <div className="hint">Another seafarer shares your name and date of birth — your Seafarer ID confirms which record is yours.</div>
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
          ) : mode === 'office_staff' ? (
            /* Office Staff mode — same name search + DOB as Seafarer */
            <>
              <div className="field">
                <label htmlFor="os-name">Full name</label>
                <div className="inputwrap" ref={osNameWrapRef}>
                  <User />
                  <input id="os-name" type="text" placeholder="e.g. Rajan Kumar" autoComplete="off"
                    value={osName}
                    onChange={(e) => setOsName(e.target.value)}
                    onFocus={() => osSuggestions.length > 0 && setOsShowSuggestions(true)}
                    onKeyDown={osOnNameKeyDown}
                    role="combobox" aria-expanded={osShowSuggestions} aria-autocomplete="list"
                    aria-controls="os-name-listbox" aria-haspopup="listbox" />
                  {osShowSuggestions && osSuggestions.length > 0 && (
                    <div id="os-name-listbox" className="ac-pop" role="listbox" aria-label="Office staff name suggestions">
                      {osSuggestions.map((s, i) => (
                        <button type="button" key={s.name} role="option"
                          className={`ac-item${i === osActiveIndex ? ' active' : ''}`}
                          onMouseDown={(e) => { e.preventDefault(); osPickSuggestion(s) }}>
                          <span className="ac-name">{s.name}</span>
                          {s.rank && <span className="ac-rank">{s.rank}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="field">
                <label htmlFor="os-dob">Date of birth</label>
                <div className="inputwrap">
                  <Calendar />
                  <input id="os-dob" type="text" inputMode="numeric" maxLength={8} placeholder="DDMMYYYY"
                    autoComplete="off"
                    value={osDob} onChange={(e) => setOsDob(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="hint">8 digits — day, month, year. Example: 25 Mar 2004 → 25032004</div>
              </div>
              {osNeedCrewId && (
                <div className="field">
                  <label htmlFor="os-crew-id">Crew ID <span style={{ color: 'var(--accent)' }}>*</span></label>
                  <div className="inputwrap">
                    <Briefcase />
                    <input id="os-crew-id" type="text" placeholder="Multiple matches — enter your Crew ID"
                      autoFocus autoComplete="off"
                      value={osCrewId} onChange={(e) => setOsCrewId(e.target.value)} />
                  </div>
                </div>
              )}
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
