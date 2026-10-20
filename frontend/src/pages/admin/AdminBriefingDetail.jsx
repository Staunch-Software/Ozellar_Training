import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, AlertCircle, ShieldCheck } from 'lucide-react'
import {
  getBriefing, saveBriefingSection, approveBriefingSection, directorApproveBriefing,
  downloadBriefingPdf, adminBriefingBriefers, adminReassignBriefer,
} from '../../api.js'
import BriefingForm, { StatusPill } from '../../components/BriefingForm.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import '../../briefing.css'

export default function AdminBriefingDetail() {
  const { id } = useParams()
  const [briefing, setBriefing] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [busyDept, setBusyDept] = useState(null)
  const [busyDir, setBusyDir] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [briefers, setBriefers] = useState(null)
  const { confirm, dialog } = useConfirm()

  // Seed a draft for every section this user can edit (from the saved answers).
  const adopt = (b) => {
    setBriefing(b)
    setDrafts((prev) => {
      const next = { ...prev }
      b.sections.forEach((s) => {
        if (s.canEdit && !next[s.department]) next[s.department] = JSON.parse(JSON.stringify(s.answers || {}))
        if (!s.canEdit) delete next[s.department]
      })
      return next
    })
  }

  useEffect(() => { getBriefing(id).then(adopt).catch((e) => setError(e.message)) }, [id])
  useEffect(() => { adminBriefingBriefers().then(setBriefers).catch(() => {}) }, [])

  const onAnswer = (dept, key, patch) => setDrafts((d) => ({
    ...d, [dept]: { ...d[dept], [key]: { ...(d[dept]?.[key] || {}), ...patch } },
  }))

  const run = async (dept, fn, okMsg) => {
    setError(''); setNotice(''); setBusyDept(dept)
    try { adopt(await fn()); if (okMsg) setNotice(okMsg) } catch (e) { setError(e.message) } finally { setBusyDept(null) }
  }
  const onSave = (dept) => run(dept, () => saveBriefingSection(id, dept, drafts[dept] || {}), 'Draft saved.')
  const onApprove = async (dept) => {
    if (!(await confirm('Your name and the current time will be recorded as the signature for this section. You will not be able to edit it afterwards.',
      { title: 'Approve this section?', confirmLabel: 'Approve' }))) return
    run(dept, () => approveBriefingSection(id, dept, drafts[dept] || {}), 'Section approved.')
  }
  const onDirector = async () => {
    if (!(await confirm('Your name and the current time will be recorded as your signature on this briefing.',
      { title: 'Approve this briefing?', confirmLabel: 'Approve' }))) return
    setError(''); setBusyDir(true)
    try { adopt(await directorApproveBriefing(id)); setNotice('Approved.') } catch (e) { setError(e.message) } finally { setBusyDir(false) }
  }
  const reassign = async (dept, brieferId) => {
    try { adopt(await adminReassignBriefer(id, dept, brieferId)); setNotice('Briefing officer changed.') } catch (e) { setError(e.message) }
  }

  if (!briefing) return error ? <div className="brf-page"><div className="brf-error"><AlertCircle size={15} /> {error}</div></div> : <div className="spinner">Loading…</div>

  return (
    <div className="brf-page">
      {dialog}
      <div className="brf-head">
        <div>
          <Link to="/admin/briefings" className="mut" style={{ fontSize: 13, textDecoration: 'none' }}><ArrowLeft size={13} /> {briefing.restricted ? 'My tasks' : 'All briefings'}</Link>
          <h2 className="brf-title" style={{ marginTop: 6 }}>Pre-joining briefing — {briefing.learnerName}</h2>
          <p className="brf-sub"><StatusPill status={briefing.status} /> &nbsp;{briefing.sectionsDone} of {briefing.sectionsTotal} departments approved</p>
        </div>
        <div className="brf-actions">
          {briefing.canApprove && (
            <button className="btn primary" disabled={busyDir} onClick={onDirector}><ShieldCheck size={15} /> Approve briefing</button>
          )}
          {!briefing.restricted && <button className="btn" onClick={() => downloadBriefingPdf(id, briefing.learnerName).catch((e) => setError(e.message))}>
            <Download size={15} /> Download PDF
          </button>}
        </div>
      </div>
      {error && <div className="brf-error"><AlertCircle size={15} /> {error}</div>}
      {notice && <div className="brf-card" style={{ padding: '10px 16px', color: 'var(--success)', fontSize: 13.5 }}>{notice}</div>}

      {briefers && briefing.canDelete && briefing.status === 'in_progress' && (
        <div className="brf-card">
          <h3>Briefing officers</h3>
          <div className="brf-grid2">
            {briefing.sections.map((s) => {
              const opts = briefers.departments.find((d) => d.department === s.department)?.briefers || []
              return (
                <div className="brf-field" key={s.department}>
                  <label>{s.label}{s.status === 'approved' ? ' — approved' : ''}</label>
                  <select value={s.brieferId} disabled={s.status === 'approved'}
                    onChange={(e) => reassign(s.department, e.target.value)}>
                    {opts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    {!opts.some((u) => u.id === s.brieferId) && <option value={s.brieferId}>{s.brieferName}</option>}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <BriefingForm briefing={briefing} drafts={drafts} onAnswer={onAnswer} onSave={onSave}
        onApprove={onApprove} busyDept={busyDept} />
    </div>
  )
}
