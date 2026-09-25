import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Ship, Cog, Trash2, AlertCircle, Search, UserPlus, X, Anchor, ShieldCheck, ShieldAlert, Users, Check } from 'lucide-react'
import {
  adminListOrientationEnrollments, adminListOrientationPrograms,
  adminDeleteOrientationEnrollment, adminListOrientationCandidates,
  adminCreateOrientationEnrollment, adminListOrientationVessels,
} from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'

const DEPT_LABEL = {
  deck: { label: 'Deck', icon: Ship },
  engine: { label: 'Engine', icon: Cog },
}

const STATUS_LABEL = {
  in_progress: { label: 'In Progress', cls: 'orn-badge-status-in_progress' },
  submitted:   { label: 'Submitted',   cls: 'orn-badge-status-submitted' },
  approved:    { label: 'Approved',    cls: 'orn-badge-status-approved' },
  rejected:    { label: 'Rejected',    cls: 'orn-badge-status-rejected' },
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

// Same top-rank rule used on the Crew page to flag Master/Chief Engineer.
const isApproverRank = (rank) => {
  const r = (rank || '').trim().toUpperCase()
  return r === 'MASTER' || r === 'CHIEF ENGINEER'
}

function ProgressBar({ pct }) {
  const cls = pct >= 100 ? 'orn-progress-fill--full' : pct >= 50 ? 'orn-progress-fill--mid' : 'orn-progress-fill--low'
  return (
    <div className="orn-progress">
      <div className="orn-progress-track">
        <div className={`orn-progress-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="orn-progress-pct">{pct}%</span>
    </div>
  )
}

// ---- Enroll Modal ----
function EnrollModal({ programs, vessels, onClose, onDone }) {
  const [crewQ, setCrewQ] = useState('')
  const [crewDept, setCrewDept] = useState('')
  const [crewRank, setCrewRank] = useState('')
  const [crewVessel, setCrewVessel] = useState('')
  const [crew, setCrew] = useState(null)
  const [selectedCrew, setSelectedCrew] = useState(null)
  const [programId, setProgramId] = useState('')
  const [approverChoice, setApproverChoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      // on_sail=true — only crew currently onboard can be handed a
      // vessel-based checklist, same rule as the Crew page.
      adminListOrientationCandidates(crewQ, undefined, '', '', true).then(setCrew).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [crewQ])

  const eligiblePrograms = programs.filter((p) =>
    !selectedCrew || (p.department === selectedCrew.department &&
      (!p.fromRank || p.fromRank.toUpperCase() === (selectedCrew.rank || '').toUpperCase())))

  // Only ranks an active program actually promotes FROM are worth showing
  // in the crew list at all — a "2nd Officer to Chief Officer" program
  // means only Second Officers belong here; every other rank is a dead
  // end (no program to pick on the right). Respects the Deck/Engine pill.
  const eligibleRanks = useMemo(() => {
    const seen = new Map()
    for (const p of programs) {
      if (crewDept && p.department !== crewDept) continue
      if (p.fromRank) seen.set(p.fromRank.toUpperCase(), p.fromRank)
    }
    return Array.from(seen, ([value, label]) => ({ value, label }))
  }, [programs, crewDept])

  // Reset a rank filter that's no longer valid after the dept pill changes.
  useEffect(() => {
    if (crewRank && !eligibleRanks.some((r) => r.value === crewRank)) setCrewRank('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleRanks])

  // Vessel + current Master/Chief Engineer for the selected crew member —
  // shown to the admin as a check before they submit, and used as the
  // enrollment's snapshot values. Crew data is refreshed by a periodic
  // sync job, so a vessel can briefly show more than one person at the
  // top rank (e.g. an outgoing/incoming Master overlap during a
  // handover) — in that case there's no single right answer, so the
  // admin picks which one via approverChoice instead of one being
  // silently assumed.
  const vesselData = selectedCrew ? vessels.find((v) => v.vessel === selectedCrew.vessel) : null
  const approverList = selectedCrew
    ? (selectedCrew.department === 'deck' ? vesselData?.masters : vesselData?.chiefEngineers) || []
    : []
  const approverAmbiguous = approverList.length > 1
  const approverName = approverAmbiguous ? approverChoice : (approverList[0]?.name || '')
  // Real SmartPAL relief dates (see admin_list_orientation_vessels) — when
  // one candidate's relief is sooner than the other's, that's almost
  // certainly why the vessel is showing two of the same rank right now
  // (a live handover). Pre-select whoever is staying, but leave both
  // choosable in case the admin knows better.
  const signingOffSoon = approverList.find((a) => a.signingOffSoon)
  const defaultPick = approverList.find((a) => a.defaultPick)

  useEffect(() => {
    setApproverChoice(defaultPick?.name || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrew?.id])

  const handleEnroll = async () => {
    if (!selectedCrew) { setError('Select a crew member'); return }
    if (!programId) { setError('Select a program'); return }
    if (approverAmbiguous && !approverChoice) { setError('Select which one is the current approver'); return }
    setBusy(true); setError('')
    try {
      await adminCreateOrientationEnrollment(selectedCrew.id, programId, selectedCrew.vessel || '', approverName || '')
      onDone()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Filter to only unenrolled crew, narrowed to one department/vessel/rank
  // when picked — and, absent an explicit rank filter, to only ranks an
  // active program can actually promote (see eligibleRanks above) so the
  // list doesn't show crew who'd hit "no programs available" on the right.
  const eligibleRankSet = useMemo(() => new Set(eligibleRanks.map((r) => r.value)), [eligibleRanks])
  const available = useMemo(() =>
    (crew || []).filter((c) => {
      if (c.enrollment) return false
      if (crewDept && c.department !== crewDept) return false
      if (crewVessel && c.vessel !== crewVessel) return false
      const rankUpper = (c.rank || '').toUpperCase()
      return crewRank ? rankUpper === crewRank : eligibleRankSet.has(rankUpper)
    }),
    [crew, crewDept, crewRank, crewVessel, eligibleRankSet])

  return (
    <div className="orn-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="orn-modal orn-modal--split">
        <div className="orn-modal-header">
          <div className="orn-modal-header-info">
            <div className="orn-modal-header-icon"><UserPlus size={18} /></div>
            <div>
              <div className="orn-modal-title">Enroll Officer</div>
              <div className="orn-modal-subtitle">Assign a promotion checklist to an onboard crew member</div>
            </div>
          </div>
          <button className="iconbtn" onClick={onClose}><X size={18} /></button>
        </div>

        {error && <div className="form-error" style={{ margin: '14px 20px 0' }}><AlertCircle size={14} /> {error}</div>}

        <div className="orn-enroll-layout">
          {/* ---- Left: crew browser ---- */}
          <div className="orn-enroll-col orn-enroll-col--crew">
            <div className="orn-enroll-col-head">
              <Search size={14} />
              <input
                placeholder="Search crew by name..."
                value={crewQ}
                onChange={(e) => setCrewQ(e.target.value)}
                autoFocus
              />
            </div>
                        <div className="orn-dept-pills orn-enroll-col-pills">
              {['', 'deck', 'engine'].map((d) => {
                const dl = d ? DEPT_LABEL[d] : null
                return (
                  <button key={d || 'all'} type="button"
                    className={`orn-dept-pill${crewDept === d ? ' orn-dept-pill--active' : ''} orn-dept-pill--${d || 'all'}`}
                    onClick={() => setCrewDept(d)}>
                    {dl && <dl.icon size={12} />}
                    {d ? dl.label : 'All'}
                  </button>
                )
              })}
            </div>

            <div className="orn-enroll-col-filters">
              <CardSelect className="orn-filter-select" value={crewRank} onChange={setCrewRank}
                placeholder="Eligible ranks"
                options={[{ value: '', label: 'Eligible ranks' }, ...eligibleRanks]} />
              <CardSelect className="orn-filter-select" value={crewVessel} onChange={setCrewVessel}
                placeholder="All vessels"
                options={[{ value: '', label: 'All vessels' }, ...vessels.map((v) => ({ value: v.vessel, label: v.vessel }))]} />
            </div>

            <div className="orn-enroll-crew-list">
              {crew === null && <div className="orn-enroll-hint">Loading onboard crew...</div>}
              {crew !== null && available.length === 0 && (
                <div className="orn-enroll-hint">
                  {eligibleRanks.length === 0
                    ? 'No active program promotes from any rank yet — build one under Programs first.'
                    : 'No matching onboard crew found for the selected rank/vessel.'}
                </div>
              )}
              {available.map((c) => {
                const dept = c.department ? DEPT_LABEL[c.department] : null
                const approver = isApproverRank(c.rank)
                const active = selectedCrew?.id === c.id
                return (
                  <button key={c.id}
                    className={`orn-enroll-crew-item${active ? ' orn-enroll-crew-item--active' : ''}`}
                    onClick={() => setSelectedCrew(c)}>
                    <div className={`orn-avatar orn-avatar-sm${dept ? ` orn-avatar-dept-${c.department}` : ''}`}>
                      {initials(c.name)}
                    </div>
                    <div className="orn-crew-dropdown-info">
                      <div className="orn-crew-dropdown-name-row">
                        <span className="orn-crew-dropdown-name">{c.name}</span>
                        {approver && <span className="orn-crew-dropdown-approver">Approver</span>}
                      </div>
                      <div className="orn-crew-dropdown-sub">
                        {c.rank} {c.vessel ? `· ${c.vessel}` : ''}
                        {c.empStatus && <span className="chip success">{c.empStatus}</span>}
                      </div>
                    </div>
                    {active ? <Check size={15} className="orn-enroll-crew-check" /> : (
                      dept && <span className={`orn-badge orn-badge-sm orn-badge-dept-${c.department}`}><dept.icon size={9} /> {dept.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ---- Right: selection + program ---- */}
          <div className="orn-enroll-col orn-enroll-col--detail">
            {!selectedCrew ? (
              <div className="orn-enroll-empty">
                <Users size={26} className="orn-enroll-empty-icon" />
                <div className="orn-enroll-empty-title">No officer selected</div>
                <div className="orn-enroll-empty-desc">Pick a crew member on the left to see their vessel and choose a program.</div>
              </div>
            ) : (
              <>
                <div className="orn-selected-crew-top">
                  <div className={`orn-avatar orn-avatar-dept-${selectedCrew.department || ''}`}>
                    {initials(selectedCrew.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="orn-selected-crew-name">{selectedCrew.name}</div>
                    <div className="orn-selected-crew-rank">{selectedCrew.rank}</div>
                  </div>
                  <button className="btn sm" onClick={() => { setSelectedCrew(null); setProgramId('') }}><X size={13} /></button>
                </div>

                {/* Vessel + top approver — the admin's check before enrolling */}
                <div className="orn-selected-crew-check">
                  <div className="orn-selected-crew-check-row">
                    <Ship size={13} />
                    <span className="orn-selected-crew-check-label">Vessel</span>
                    <span className="orn-selected-crew-check-value">{selectedCrew.vessel || '—'}</span>
                  </div>
                  <div className="orn-selected-crew-check-row">
                    {approverName ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                    <span className="orn-selected-crew-check-label">
                      {selectedCrew.department === 'engine' ? 'Chief Engineer' : 'Master'}
                    </span>
                    {!approverAmbiguous && (approverName ? (
                      <span className="orn-selected-crew-check-value">{approverName}</span>
                    ) : (
                      <span className="orn-selected-crew-check-value orn-selected-crew-check-value--warn">
                        None on sail for this vessel
                      </span>
                    ))}
                  </div>
                  {approverAmbiguous && (
                    <div className="orn-approver-ambiguous">
                      <div className="orn-approver-ambiguous-note">
                        <ShieldAlert size={12} />
                        {signingOffSoon ? (
                          <span>
                            <strong>{signingOffSoon.name}</strong> will sign off soon
                            {fmtDate(signingOffSoon.reliefDate) && <> (relief due {fmtDate(signingOffSoon.reliefDate)})</>} —
                            defaulted to {defaultPick?.name || 'the other officer'} below, but you can pick either.
                          </span>
                        ) : (
                          <span>
                            {approverList.length} people show as{' '}
                            {selectedCrew.department === 'engine' ? 'Chief Engineer' : 'Master'} on this vessel — crew
                            data may be mid-handover. Pick the current one:
                          </span>
                        )}
                      </div>
                      <CardSelect value={approverChoice} onChange={setApproverChoice}
                        placeholder="Select the current approver..."
                        options={approverList.map((a) => ({
                          value: a.name, label: a.name,
                          description: a.signingOffSoon
                            ? `Relief due ${fmtDate(a.reliefDate) || 'soon'} — likely signing off`
                            : (a.reliefDate ? `Relief due ${fmtDate(a.reliefDate)}` : undefined),
                        }))} />
                    </div>
                  )}
                </div>

                <div className="field" style={{ marginTop: 20 }}>
                  <label>Program</label>
                  <CardSelect value={programId} onChange={setProgramId}
                    placeholder="Select program..."
                    options={eligiblePrograms.map((p) => ({ value: p.id, label: p.title }))} />
                  {eligiblePrograms.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--orn-status-rejected)', marginTop: 4 }}>No programs available for this department yet.</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="orn-modal-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary"
            disabled={busy || !selectedCrew || !programId || (approverAmbiguous && !approverChoice)}
            onClick={handleEnroll}>
            <UserPlus size={14} /> {busy ? 'Enrolling...' : 'Enroll'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function AdminOrientationEnrollments() {
  const [enrollments, setEnrollments] = useState(null)
  const [programs, setPrograms] = useState([])
  const [vessels, setVessels] = useState([])
  const [programFilter, setProgramFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [showEnroll, setShowEnroll] = useState(false)
  const { confirm, dialog } = useConfirm()

  const load = () => {
    adminListOrientationEnrollments(programFilter || undefined, statusFilter || undefined)
      .then(setEnrollments)
      .catch((e) => setError(e.message))
  }

  useEffect(() => { adminListOrientationPrograms().then(setPrograms).catch(() => {}) }, [])
  useEffect(() => { adminListOrientationVessels().then(setVessels).catch(() => {}) }, [])
  useEffect(() => { load() }, [programFilter, statusFilter])

  const remove = async (id, name) => {
    if (!(await confirm(`This removes ${name} from the program and deletes their progress. This can't be undone.`, {
      title: 'Remove this enrollment?', confirmLabel: 'Remove', danger: true,
    }))) return
    setBusyId(id)
    try {
      await adminDeleteOrientationEnrollment(id)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const visible = useMemo(() => {
    if (!enrollments) return []
    if (!q.trim()) return enrollments
    const lq = q.trim().toLowerCase()
    return enrollments.filter((e) =>
      (e.learnerName || '').toLowerCase().includes(lq) ||
      (e.programTitle || '').toLowerCase().includes(lq) ||
      (e.vessel || '').toLowerCase().includes(lq)
    )
  }, [enrollments, q])

  const stats = useMemo(() => {
    const all = enrollments || []
    return {
      total: all.length,
      in_progress: all.filter((e) => e.status === 'in_progress').length,
      submitted: all.filter((e) => e.status === 'submitted').length,
      approved: all.filter((e) => e.status === 'approved').length,
    }
  }, [enrollments])

  return (
    <div className="orn-page">
      {dialog}
      {showEnroll && (
        <EnrollModal
          programs={programs}
          vessels={vessels}
          onClose={() => setShowEnroll(false)}
          onDone={() => { setShowEnroll(false); load() }}
        />
      )}

      <div className="orn-prog-header">
        <div className="orn-prog-header-left">
          <div className="orn-prog-header-icon">
            <ClipboardList size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="orn-title">Enrollments</h2>
            <p className="orn-subtitle">Officers enrolled in a promotion checklist program.</p>
          </div>
        </div>
        <div className="orn-prog-header-actions">
          <button className="btn primary" onClick={() => setShowEnroll(true)}>
            <UserPlus size={15} /> Enroll Officer
          </button>
        </div>
      </div>

      {/* Stats + search/filters */}
      {enrollments && enrollments.length > 0 && (
        <div className="orn-prog-stats">
          <div className="orn-prog-stats-group">
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val">{stats.total}</span>
              <span className="orn-prog-stat-lbl">Total enrolled</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-in_progress)' }}>{stats.in_progress}</span>
              <span className="orn-prog-stat-lbl">In progress</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-submitted)' }}>{stats.submitted}</span>
              <span className="orn-prog-stat-lbl">Awaiting review</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-status-approved)' }}>{stats.approved}</span>
              <span className="orn-prog-stat-lbl">Approved</span>
            </div>
          </div>

          <div className="orn-prog-stats-filters">
            <div className="inputwrap orn-filter-search">
              <Search size={14} />
              <input placeholder="Search by name, program or vessel..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <CardSelect className="orn-filter-select" value={programFilter} onChange={setProgramFilter}
              placeholder="All programs"
              options={[{ value: '', label: 'All programs' }, ...programs.map((p) => ({ value: p.id, label: p.title }))]} />
            <CardSelect className="orn-filter-select" value={statusFilter} onChange={setStatusFilter}
              placeholder="All statuses"
              options={[
                { value: '', label: 'All statuses' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'submitted', label: 'Submitted' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
              ]} />
          </div>
        </div>
      )}

      {error && <div className="form-error"><AlertCircle size={15} /> {error}</div>}

      {!enrollments ? (
        <div className="spinner">Loading enrollments...</div>
      ) : visible.length === 0 ? (
        <div className="orn-empty">
          <ClipboardList size={28} className="orn-empty-icon" />
          <div className="orn-empty-title">No enrollments found</div>
          <div className="orn-empty-desc">Click "Enroll Officer" to add someone to a promotion program.</div>
        </div>
      ) : (
        <div className="orn-table-card">
          <div className="orn-table-scroll">
            <table className="orn-table">
              <thead>
                <tr>
                  <th>Officer</th>
                  <th>Vessel</th>
                  <th>Master / CE</th>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Enrolled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const dept = e.department ? DEPT_LABEL[e.department] : null
                  const DeptIcon = dept?.icon
                  const sl = STATUS_LABEL[e.status] || { label: e.status, cls: '' }
                  return (
                    <tr key={e.id}>
                      <td>
                        <div className="orn-table-name">
                          <div className={`orn-avatar orn-avatar-sm${dept ? ` orn-avatar-dept-${e.department}` : ''}`}>
                            {initials(e.learnerName)}
                          </div>
                          <div>
                            <div className="orn-table-name-text">{e.learnerName}</div>
                            <div className="orn-table-name-sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              {e.rank || '-'}
                              {dept && DeptIcon && (
                                <span className={`orn-badge orn-badge-sm orn-badge-dept-${e.department}`} style={{ marginLeft: 4 }}>
                                  <DeptIcon size={9} /> {dept.label}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="orn-table-vessel"><Ship size={12} /> {e.vessel || '-'}</div>
                        {e.empStatus && <div style={{ fontSize: 11, opacity: 0.55, marginTop: 2 }}>{e.empStatus}</div>}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--text-mut)' }}>{e.masterName || '-'}</td>
                      <td className="orn-table-nowrap" style={{ fontSize: 13 }}>{e.programTitle}</td>
                      <td><span className={`orn-badge ${sl.cls}`}>{sl.label}</span></td>
                      <td><ProgressBar pct={e.progressPct} /></td>
                      <td className="orn-table-muted orn-table-nowrap" style={{ fontSize: 12 }}>
                        {e.createdAt ? new Date(e.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td>
                        <button className="btn sm" title="Remove enrollment" disabled={busyId === e.id} onClick={() => remove(e.id, e.learnerName)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
