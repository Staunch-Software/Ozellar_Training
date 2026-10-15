import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Download } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getMyBriefing, acknowledgeBriefing, downloadBriefingPdf } from '../api.js'
import BriefingForm, { StatusPill } from '../components/BriefingForm.jsx'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import '../briefing.css'

export default function Briefing() {
  const [briefing, setBriefing] = useState(undefined)   // undefined = loading, null = none
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { confirm, dialog } = useConfirm()

  useEffect(() => { getMyBriefing().then(setBriefing).catch((e) => { setError(e.message); setBriefing(null) }) }, [])

  const confirmBriefing = async () => {
    if (!(await confirm('Your name and the current time will be recorded as your signature. This cannot be undone.',
      { title: 'Confirm you have been briefed?', confirmLabel: 'I confirm' }))) return
    setError(''); setBusy(true)
    try { setBriefing(await acknowledgeBriefing(briefing.id, comments)) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <TopNav />
      {dialog}
      <div className="page">
        <div className="brf-page">
          {briefing === undefined && <div className="spinner">Loading…</div>}
          {briefing === null && (
            <div className="brf-card"><div className="brf-empty">You have no pre-joining briefing assigned.</div>
              {error && <div className="brf-error"><AlertCircle size={15} /> {error}</div>}</div>
          )}
          {briefing && (
            <>
              <div className="brf-head">
                <div>
                  <h2 className="brf-title">Pre-joining briefing</h2>
                  <p className="brf-sub"><StatusPill status={briefing.status} />
                    &nbsp;{briefing.status === 'completed' ? 'You have confirmed this briefing.'
                      : briefing.status === 'awaiting_crew' ? 'Please review the briefing below and confirm.'
                      : 'Your briefing is still being completed by the office.'}</p>
                </div>
                <div className="brf-actions">
                  <button className="btn" onClick={() => downloadBriefingPdf(briefing.id, briefing.learnerName).catch((e) => setError(e.message))}>
                    <Download size={15} /> Download PDF
                  </button>
                </div>
              </div>
              {error && <div className="brf-error"><AlertCircle size={15} /> {error}</div>}
              <BriefingForm briefing={briefing} />
              {briefing.canAcknowledge && (
                <div className="brf-card">
                  <h3>Your confirmation</h3>
                  <p className="brf-intro">{briefing.form?.confirmation}</p>
                  <div className="brf-field">
                    <label>Comments / discussion points (optional)</label>
                    <textarea className="brf-remarks" rows={4} value={comments} onChange={(e) => setComments(e.target.value)} />
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button className="btn primary" disabled={busy} onClick={confirmBriefing}>
                      <CheckCircle2 size={15} /> {busy ? 'Confirming…' : 'I confirm I have been briefed'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
