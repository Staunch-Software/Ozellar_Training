import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth.jsx'
import { CheckCircle2, Anchor, LogOut } from 'lucide-react'

/* ------------------------------------------------------------------
   Post-submission screen for a screening-test candidate.

   Deliberately shows no score, no correct/wrong breakdown, and no
   pass/fail signal — this is an entrance screening test, not a course
   assessment, and the grading is for Ozellar Marine's admins to review
   (Admin → Assessment → Results), not for the candidate to see. The
   candidate just needs confirmation that their submission went through
   and a way back to the login screen.
   ------------------------------------------------------------------ */

export default function TestResult() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const backToLogin = () => { logout(); navigate('/', { replace: true }) }

  return (
    <div className="ex-result-root">
      <style>{`
        :root {
          --brand: #0d3355;
          --brand-deep: #082138;
          --brand-mid: #b8842c;
          --ink: #101f2b;
          --ink-mut: #54697a;
          --ok: #0f7d68;
          --ok-soft: #e1f2ec;
          --line: #dde3de;
        }

        @keyframes fadein {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .ex-result-root {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: #eef1ee;
          font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
          color: var(--ink);
          overflow: hidden;
        }

        .ex-result-header {
          flex-shrink: 0;
          background: linear-gradient(135deg, var(--brand) 0%, var(--brand-deep) 100%);
          height: 64px;
          display: flex;
          align-items: center;
          padding: 0 24px;
          gap: 11px;
        }

        .ex-result-logo {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          background: var(--brand-mid);
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }

        .ex-result-brand-sub {
          font-size: 9.5px;
          font-weight: 700;
          color: rgba(255,255,255,.55);
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .ex-result-brand-title {
          font-size: 13.5px;
          font-weight: 700;
          margin-top: -1px;
          color: #fff;
        }

        .ex-result-body {
          flex: 1;
          display: grid;
          place-items: center;
          padding: 24px;
        }

        .ex-result-card {
          background: #fff;
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: clamp(44px, 3vw, 72px) clamp(40px, 2.8vw, 64px);
          max-width: clamp(440px, 34vw, 860px);
          width: 100%;
          text-align: center;
          box-shadow: 0 8px 32px rgba(16,24,40,.08);
          animation: fadein .4s ease-out;
        }

        .ex-result-icon {
          width: clamp(60px, 5.5vw, 96px);
          height: clamp(60px, 5.5vw, 96px);
          border-radius: 50%;
          background: var(--ok-soft);
          display: grid;
          place-items: center;
          margin: 0 auto 20px;
        }

        .ex-result-icon svg {
          width: clamp(28px, 2.8vw, 46px);
          height: clamp(28px, 2.8vw, 46px);
        }

        .ex-result-title {
          margin: 0 0 10px;
          font-size: clamp(20px, 1.6vw, 30px);
          font-weight: 800;
        }

        .ex-result-text {
          margin: 0 0 28px;
          color: var(--ink-mut);
          font-size: clamp(14px, 1vw, 19px);
          line-height: 1.7;
        }

        .ex-result-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: clamp(12px, 0.9vw, 18px) clamp(28px, 2vw, 44px);
          border-radius: 8px;
          border: none;
          background: var(--brand-mid);
          color: #fff;
          font-weight: 700;
          font-size: clamp(14px, 1vw, 19px);
          font-family: inherit;
          cursor: pointer;
        }

        .ex-result-btn:hover { filter: brightness(.96); }

        /* ── Small screens: tighten the outer body padding ── */
        @media (max-width: 480px) {
          .ex-result-body { padding: 16px; }
          .ex-result-card { border-radius: 12px; }
        }

        /* ── Large screens: precise fixed sizing at 2560px ── */
        @media (min-width: 2560px) {
          .ex-result-card { max-width: 900px; padding: 72px 64px; }
          .ex-result-icon { width: 96px; height: 96px; }
          .ex-result-icon svg { width: 46px; height: 46px; }
          .ex-result-title { font-size: 30px; }
          .ex-result-text { font-size: 19px; }
          .ex-result-btn { padding: 18px 44px; font-size: 19px; }
        }
      `}</style>

      {/* Header — same navy chrome as the rest of the candidate flow */}
      <header className="ex-result-header">
        <div className="ex-result-logo">
          <Anchor size={18} color="#fff" />
        </div>
        <div>
          <div className="ex-result-brand-sub">Ozellar Marine</div>
          <div className="ex-result-brand-title">Assessment Portal</div>
        </div>
      </header>

      {/* Body */}
      <div className="ex-result-body">
        <div className="ex-result-card">
          <div className="ex-result-icon">
            <CheckCircle2 color="var(--ok)" />
          </div>
          <h1 className="ex-result-title">Assessment Submitted</h1>
          <p className="ex-result-text">
            Your responses have been recorded. The Ozellar Marine team will review your assessment
            and get in touch with you regarding the next steps.
          </p>
          <button className="ex-result-btn" onClick={backToLogin}>
            <LogOut size={15} /> Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}