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

const C = {
  brand: '#0d3355',
  brandDeep: '#082138',
  brandMid: '#b8842c',
  ink: '#101f2b',
  inkMut: '#54697a',
  ok: '#0f7d68',
  okSoft: '#e1f2ec',
  line: '#dde3de',
}

export default function TestResult() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const backToLogin = () => { logout(); navigate('/', { replace: true }) }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#eef1ee', fontFamily: '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif', color: C.ink, overflow: 'hidden' }}>
      <style>{`@keyframes fadein { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Header — same navy chrome as the rest of the candidate flow */}
      <header style={{ flexShrink: 0, background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDeep} 100%)`, height: 64, display: 'flex', alignItems: 'center', padding: '0 24px', gap: 11 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: C.brandMid, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Anchor size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Ozellar Marine</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: -1, color: '#fff' }}>Assessment Portal</div>
        </div>
      </header>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '44px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 8px 32px rgba(16,24,40,.08)', animation: 'fadein .4s ease-out' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: C.okSoft, display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}>
            <CheckCircle2 size={30} color={C.ok} />
          </div>
          <h1 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800 }}>Assessment Submitted</h1>
          <p style={{ margin: '0 0 28px', color: C.inkMut, fontSize: 14, lineHeight: 1.7 }}>
            Your responses have been recorded. The Ozellar Marine team will review your assessment
            and get in touch with you regarding the next steps.
          </p>
          <button onClick={backToLogin}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '12px 28px', borderRadius: 8, border: 'none',
              background: C.brandMid, color: '#fff', fontWeight: 700, fontSize: 14,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            <LogOut size={15} /> Back to Login
          </button>
        </div>
      </div>
    </div>
  )
}
