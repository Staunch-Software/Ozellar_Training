import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShieldCheck, ShieldX, Anchor } from 'lucide-react'
import { ThemeToggle } from '../App.jsx'
import { verifyCertificate } from '../api.js'

/* Public certificate verification — no sign-in required. */
export default function Verify() {
  const { id } = useParams()
  const [result, setResult] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    verifyCertificate(id).then(setResult).catch(() => setError(true))
  }, [id])

  return (
    <div className="verify-wrap">
      <div className="login-top"><ThemeToggle /></div>
      <div className="verify-card">
        <div className="brand-lg" style={{ justifyContent: 'center' }}>
          <span className="logo"><Anchor size={19} /></span> Ozellar Marine
        </div>
        <div className="eyebrow" style={{ textAlign: 'center', marginTop: 4 }}>Certificate verification</div>

        {!result && !error && <div className="spinner" style={{ marginTop: 24 }}>Checking…</div>}

        {(error || (result && !result.valid)) && (
          <div className="verify-body">
            <div className="verify-seal bad"><ShieldX size={34} /></div>
            <h1>Not verified</h1>
            <p className="mut">No certificate was found for <span className="mono">{id}</span>. Please check the certificate number.</p>
          </div>
        )}

        {result && result.valid && (
          <div className="verify-body">
            <div className="verify-seal good"><ShieldCheck size={34} /></div>
            <h1>Certificate verified</h1>
            <p className="mut">This is a genuine Ozellar Marine certificate.</p>
            <dl className="verify-details">
              <div><dt>Certificate No</dt><dd className="mono">{result.id}</dd></div>
              <div><dt>Holder</dt><dd>{result.holder || '—'}</dd></div>
              <div><dt>Course</dt><dd>{result.course || '—'}</dd></div>
              <div><dt>Score</dt><dd>{result.score}%</dd></div>
              <div><dt>Date of issue</dt><dd>{result.issued || '—'}</dd></div>
            </dl>
            <a className="btn" href={`/api/verify/${result.id}/pdf`} target="_blank" rel="noopener noreferrer">
              View / download certificate PDF
            </a>
          </div>
        )}

        <div className="helpline" style={{ textAlign: 'center' }}>
          <Link to="/">Return to sign in</Link>
        </div>
      </div>
    </div>
  )
}
