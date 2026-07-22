import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Mail, Lock, Anchor } from 'lucide-react'
import { ThemeToggle } from '../App.jsx'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e) => {
    e.preventDefault()
    navigate('/my-courses')   // auth is wired separately per plan
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
          <div>
            <h2 style={{ fontSize: 21 }}>Welcome aboard</h2>
            <div className="mut" style={{ fontSize: 13, marginTop: 4 }}>Sign in to continue your training.</div>
          </div>
          <div className="field">
            <label htmlFor="email">Email or Crew ID</label>
            <div className="inputwrap">
              <Mail />
              <input id="email" type="text" placeholder="name@ozellarmarine.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <div className="inputwrap">
              <Lock />
              <input id="pw" type="password" placeholder="••••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn primary block">Sign in</button>
          <div className="linkline">Forgot your password?</div>
          <div className="helpline">Trouble signing in? Contact your training officer.</div>
        </form>
      </div>
    </div>
  )
}
