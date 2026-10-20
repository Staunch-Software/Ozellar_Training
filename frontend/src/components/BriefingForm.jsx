import { CheckCircle2, Save } from 'lucide-react'
import '../briefing.css'

export const STATUS_LABEL = {
  in_progress: 'Departments briefing',
  awaiting_directors: 'Awaiting directors',
  awaiting_crew: 'Awaiting officer',
  completed: 'Completed',
}

export const fmtStamp = (iso) => {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

export const fmtDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function StatusPill({ status }) {
  return <span className={`brf-pill ${status}`}>{STATUS_LABEL[status] || status}</span>
}

const RESPONSES = [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']]

function SectionBlock({ section, draft, onAnswer, onSave, onApprove, busy }) {
  const editable = section.canEdit
  const answers = editable ? draft : section.answers
  const answered = section.items.filter((it) => answers?.[it.key]?.response).length
  const total = section.items.length
  return (
    <div className="brf-section">
      <div className="brf-section-head">
        <h3>{section.label}</h3>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <small>Briefing officer: {section.brieferName || '—'}</small>
          <span className={`brf-pill ${section.status}`}>{section.status === 'approved' ? 'Approved' : 'Pending'}</span>
        </span>
      </div>
      <table className="brf-items">
        <thead>
          <tr><th>Description of items</th><th>Yes / No / N/A</th><th>Remarks</th></tr>
        </thead>
        <tbody>
          {section.items.map((it) => {
            const a = answers?.[it.key] || {}
            return (
              <tr key={it.key}>
                <td className="brf-desc">{it.text}</td>
                <td className="brf-resp">
                  {RESPONSES.map(([val, label]) => (
                    <label key={val} className={editable ? '' : 'ro'}>
                      {editable ? (
                        <input type="radio" name={`${section.department}-${it.key}`} value={val}
                          checked={a.response === val}
                          onChange={() => onAnswer(section.department, it.key, { response: val })} />
                      ) : (
                        <span className={`brf-box${a.response === val ? ' on' : ''}`} aria-checked={a.response === val} role="checkbox">
                          {a.response === val ? '✓' : ''}
                        </span>
                      )}
                      {label}
                    </label>
                  ))}
                </td>
                <td>
                  {editable ? (
                    <textarea className="brf-remarks" rows={1} value={a.remarks || ''} placeholder="Remarks"
                      onChange={(e) => onAnswer(section.department, it.key, { remarks: e.target.value })} />
                  ) : (
                    <div className="brf-ro-text">{a.remarks || ''}</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="brf-section-foot">
        {section.status === 'approved' ? (
          <div>
            <div className="brf-sign">{section.approvedByName}</div>
            <div className="brf-stamp">Approved electronically · {fmtStamp(section.approvedAt)}</div>
          </div>
        ) : editable ? (
          <>
            <span className="brf-stamp">{answered} of {total} items answered</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={busy} onClick={() => onSave(section.department)}>
                <Save size={14} /> Save draft
              </button>
              <button className="btn primary" disabled={busy || answered < total}
                title={answered < total ? 'Answer every item to approve' : ''}
                onClick={() => onApprove(section.department)}>
                <CheckCircle2 size={14} /> Approve section
              </button>
            </span>
          </>
        ) : (
          <span className="brf-stamp">Waiting for {section.brieferName || 'the briefing officer'}</span>
        )}
      </div>
    </div>
  )
}

function SignBox({ label, name, at }) {
  return (
    <div className={`brf-sigbox ${name ? 'done' : ''}`}>
      <div className="brf-signlabel">{label}</div>
      {name ? (
        <div>
          <div className="brf-sign">{name}</div>
          <div className="brf-stamp">{fmtStamp(at)}</div>
        </div>
      ) : (
        <div className="brf-stamp">Not signed yet</div>
      )}
    </div>
  )
}

export function BriefingSignatures({ briefing }) {
  return (
    <div className="brf-card">
      <h3>Sign-off</h3>
      <div className="brf-sigs">
        <SignBox label={`Technical Director${briefing.td?.assignedName && !briefing.td.name ? ` · ${briefing.td.assignedName}` : ''}`}
          name={briefing.td?.name} at={briefing.td?.at} />
        <SignBox label={`Managing Director${briefing.md?.assignedName && !briefing.md.name ? ` · ${briefing.md.assignedName}` : ''}`}
          name={briefing.md?.name} at={briefing.md?.at} />
        <SignBox label="Senior officer" name={briefing.crewAckAt ? briefing.learnerName : null} at={briefing.crewAckAt} />
      </div>
      {briefing.crewComments && (
        <div style={{ marginTop: 14 }}>
          <div className="brf-signlabel">Comments / Discussion points</div>
          <div className="brf-ro-text" style={{ marginTop: 4 }}>{briefing.crewComments}</div>
        </div>
      )}
    </div>
  )
}

/* The whole form. Editable sections are driven by `drafts` (parent state) so a
   half-filled section survives re-renders until it's saved. */
export default function BriefingForm({ briefing, drafts = {}, onAnswer, onSave, onApprove, busyDept }) {
  return (
    <div>
      <div className="brf-card">
        <div className="brf-form-head">
          <div><b>NAME</b>{briefing.learnerName}</div>
          <div><b>RANK</b>{briefing.rank || '—'}</div>
          <div><b>JOINING VESSEL</b>{briefing.joiningVessel || '—'}</div>
          <div><b>DATE</b>{fmtDate(briefing.briefingDate)}</div>
        </div>
        <p className="brf-intro" style={{ marginBottom: 0 }}>{briefing.form?.intro}</p>
      </div>
      {briefing.sections.map((s) => (
        <SectionBlock key={s.department} section={s} draft={drafts[s.department] || {}}
          onAnswer={onAnswer} onSave={onSave} onApprove={onApprove} busy={busyDept === s.department} />
      ))}
      <BriefingSignatures briefing={briefing} />
    </div>
  )
}
