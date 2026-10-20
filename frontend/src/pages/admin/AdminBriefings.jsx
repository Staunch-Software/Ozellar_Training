import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, UserPlus, Download, Trash2, X, AlertCircle, Search, ArrowRight } from 'lucide-react'
import {
  adminListBriefings, adminCreateBriefing, adminDeleteBriefing, adminBriefingCandidates,
  adminBriefingBriefers, getMyBriefingTasks, downloadBriefingPdf,
} from '../../api.js'
import { hasModule, useAuth } from '../../auth.jsx'
import { StatusPill, fmtDate } from '../../components/BriefingForm.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import '../../briefing.css'

const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

function AssignModal({ onClose, onDone }) {
  const [q, setQ] = useState('')
  const [allRanks, setAllRanks] = useState(false)
  const [crew, setCrew] = useState(null)
  const [picked, setPicked] = useState(null)
  const [info, setInfo] = useState(null)
  const [vessel, setVessel] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [briefers, setBriefers] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { adminBriefingBriefers().then(setInfo).catch((e) => setError(e.message)) }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      adminBriefingCandidates(q, allRanks).then((r) => setCrew(r.items)).catch((e) => setError(e.message))
    }, 250)
    return () => clearTimeout(t)
  }, [q, allRanks])

  const pick = (c) => { setPicked(c); setVessel(c.currentVessel || '') }
  const missingDirectors = info && (!info.technicalDirector || !info.managingDirector)
  const ready = picked && info && !missingDirectors &&
    info.departments.every((d) => briefers[d.department])

  const submit = async () => {
    setError(''); setBusy(true)
    try {
      await adminCreateBriefing({ learnerId: picked.id, joiningVessel: vessel, briefingDate: date, briefers })
      onDone()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="brf-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="brf-modal">
        <div className="brf-modal-head">
          <h3>Assign pre-joining briefing</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="brf-modal-body">
          <div className="brf-field">
            <label>Senior officer</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or crew ID…" />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', margin: 0, fontWeight: 600 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={allRanks} onChange={(e) => setAllRanks(e.target.checked)} />
                All ranks
              </label>
            </div>
            <div className="brf-crew-list" style={{ marginTop: 8 }}>
              {crew === null && <div className="brf-empty" style={{ padding: 12 }}>Loading…</div>}
              {crew?.length === 0 && <div className="brf-empty" style={{ padding: 12 }}>No matching crew{allRanks ? '' : ' (senior ranks only — tick “All ranks” to widen)'}.</div>}
              {crew?.map((c) => (
                <button key={c.id} type="button" className={`brf-crew-row ${picked?.id === c.id ? 'sel' : ''}`}
                  disabled={!!c.activeBriefingId} onClick={() => pick(c)}>
                  <span><b>{c.name}</b> <small>· {c.rank || 'No rank'} · {c.crewId || '—'}</small></span>
                  <small>{c.activeBriefingId ? 'Briefing in progress' : (c.currentVessel || '')}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="brf-grid2">
            <div className="brf-field">
              <label>Joining vessel</label>
              <input value={vessel} onChange={(e) => setVessel(e.target.value)} placeholder="e.g. AMNSI MAXIMUS" />
            </div>
            <div className="brf-field">
              <label>Briefing date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {missingDirectors && (
            <div className="brf-warn">
              Technical Director and Managing Director must be set up first (User management → admin → “Briefing approver role”).
            </div>
          )}

          <div className="brf-grid2">
            {info?.departments.map((d) => (
              <div className="brf-field" key={d.department}>
                <label>{d.label} — briefing officer</label>
                <select value={briefers[d.department] || ''}
                  onChange={(e) => setBriefers((b) => ({ ...b, [d.department]: e.target.value }))}>
                  <option value="">{d.briefers.length ? 'Select…' : 'No admin set to this department'}</option>
                  {d.briefers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          {info && !missingDirectors && (
            <div className="brf-stamp">
              Directors: {info.technicalDirector.name} (Technical) · {info.managingDirector.name} (Managing)
            </div>
          )}
          {error && <div className="brf-error"><AlertCircle size={15} /> {error}</div>}
        </div>
        <div className="brf-modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!ready || busy} onClick={submit}>
            <UserPlus size={14} /> {busy ? 'Assigning…' : 'Assign briefing'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AdminBriefings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [tasks, setTasks] = useState(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [showAssign, setShowAssign] = useState(false)
  // department briefers only see their own tasks (mirrors backend _restricted)
  const restricted = user?.role === 'admin' && !!user?.department && !user?.designation
  const { confirm, dialog } = useConfirm()

  const load = () => {
    if (restricted) setRows([])
    else adminListBriefings().then(setRows).catch((e) => setError(e.message))
    getMyBriefingTasks().then(setTasks).catch(() => setTasks(null))
  }
  useEffect(() => { load() }, [])

  const visible = useMemo(() => {
    const lq = q.trim().toLowerCase()
    return (rows || []).filter((r) => !lq ||
      (r.learnerName || '').toLowerCase().includes(lq) || (r.joiningVessel || '').toLowerCase().includes(lq))
  }, [rows, q])

  const remove = async (r) => {
    if (!(await confirm(`This deletes the briefing for ${r.learnerName}, including all sign-offs. This can't be undone.`,
      { title: 'Delete this briefing?', confirmLabel: 'Delete', danger: true }))) return
    try { await adminDeleteBriefing(r.id); load() } catch (e) { setError(e.message) }
  }

  const myOpen = (tasks?.sections || []).filter((t) => t.sectionStatus === 'pending' && t.status === 'in_progress')
  const myDirector = tasks?.directorApprovals || []

  return (
    <div className="brf-page">
      {dialog}
      {showAssign && <AssignModal onClose={() => setShowAssign(false)} onDone={() => { setShowAssign(false); load() }} />}

      <div className="brf-head">
        <div>
          <h2 className="brf-title"><ClipboardCheck size={22} style={{ verticalAlign: '-4px', marginRight: 8 }} />Pre-joining briefing</h2>
          <p className="brf-sub">Briefing for senior officers before joining (form OF-MA-010).</p>
        </div>
        {!restricted && (
          <div className="brf-actions">
            <button className="btn primary" onClick={() => setShowAssign(true)}><UserPlus size={15} /> Assign briefing</button>
          </div>
        )}
      </div>
      {error && <div className="brf-error"><AlertCircle size={15} /> {error}</div>}

      {(myOpen.length > 0 || myDirector.length > 0) && (
        <div className="brf-card brf-waiting">
          <div className="brf-waiting-head">
            <h3>Waiting for you</h3>
            <span className="brf-count">{myOpen.length + myDirector.length}</span>
          </div>
          <div className="brf-tasks">
            {[...myOpen.map((t) => ({ ...t, kind: 'section' })), ...myDirector.map((t) => ({ ...t, kind: 'director' }))].map((t) => (
              <Link key={`${t.kind}-${t.id}-${t.department || ''}`} to={`/admin/briefings/${t.id}`} className="brf-task">
                <span className="brf-avatar">{initials(t.learnerName)}</span>
                <span className="brf-task-main">
                  <span className="brf-task-name">{t.learnerName}</span>
                  <span className="brf-task-meta">
                    {[t.rank, t.joiningVessel && `Joining ${t.joiningVessel}`, t.briefingDate && fmtDate(t.briefingDate)].filter(Boolean).join('  ·  ')}
                  </span>
                </span>
                <span className={`brf-task-tag ${t.kind}`}>{t.kind === 'director' ? 'Director approval' : `${t.label} briefing`}</span>
                <span className="brf-task-cta">{t.kind === 'director' ? 'Review' : 'Start'} <ArrowRight size={15} /></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {restricted && myOpen.length === 0 && myDirector.length === 0 && tasks && (
        <div className="brf-card"><div className="brf-empty">You have no briefings waiting for you.</div></div>
      )}

      {!restricted && <div className="brf-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>All briefings</h3>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-mut)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search officer or vessel…"
              style={{ padding: '7px 10px 7px 30px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', minWidth: 240 }} />
          </div>
        </div>
        {rows === null ? <div className="brf-empty">Loading…</div> : visible.length === 0 ? (
          <div className="brf-empty">No briefings yet. Use “Assign briefing” to start one.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="brf-table">
              <thead>
                <tr><th>Officer</th><th>Vessel</th><th>Date</th><th>Departments</th><th>TD / MD</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="brf-row" tabIndex={0} onClick={() => navigate(`/admin/briefings/${r.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/briefings/${r.id}`)}>
                    <td><Link className="brf-link" to={`/admin/briefings/${r.id}`}>{r.learnerName}</Link><div className="mut" style={{ fontSize: 12 }}>{r.rank}</div></td>
                    <td>{r.joiningVessel || '—'}</td>
                    <td>{fmtDate(r.briefingDate)}</td>
                    <td>{r.sectionsDone} / {r.sectionsTotal}</td>
                    <td>{r.tdDone ? '✔' : '–'} / {r.mdDone ? '✔' : '–'}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn sm" onClick={() => downloadBriefingPdf(r.id, r.learnerName).catch((e) => setError(e.message))}>
                        <Download size={13} /> PDF
                      </button>{' '}
                      {hasModule(user, 'briefing') && (
                        <button className="btn sm" onClick={() => remove(r)} aria-label="Delete briefing"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </div>
  )
}
