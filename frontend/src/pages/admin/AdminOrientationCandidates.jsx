import { useEffect, useMemo, useState } from 'react'
import { Search, Users, Ship, Cog, Globe, Anchor, ShieldCheck } from 'lucide-react'
import { adminListOrientationCandidates, adminListOrientationVessels } from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'

const DEPT_LABEL = {
  deck: { label: 'Deck', icon: Ship },
  engine: { label: 'Engine', icon: Cog },
}

const RANK_OPTIONS = [
  { value: 'MASTER', label: 'Master', icon: Ship },
  { value: 'CHIEF OFFICER', label: 'Chief Officer', icon: Ship },
  { value: 'SECOND OFFICER', label: 'Second Officer', icon: Ship },
  { value: 'THIRD OFFICER', label: 'Third Officer', icon: Ship },
  { value: 'CHIEF ENGINEER', label: 'Chief Engineer', icon: Cog },
  { value: 'SECOND ENGINEER', label: 'Second Engineer', icon: Cog },
  { value: 'THIRD ENGINEER', label: 'Third Engineer', icon: Cog },
  { value: 'FOURTH ENGINEER', label: 'Fourth Engineer', icon: Cog },
]

// Same top-rank rule the backend uses to decide who can act as a vessel
// approver (see orientation_ranks.vessel_approver_info) — used here purely
// to flag it visually, not to gate anything.
const isApproverRank = (rank) => {
  const r = (rank || '').trim().toUpperCase()
  return r === 'MASTER' || r === 'CHIEF ENGINEER'
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

function Avatar({ name, dept }) {
  return (
    <div className={`orn-avatar${dept ? ` orn-avatar-dept-${dept}` : ''}`}>
      {initials(name)}
    </div>
  )
}

export default function AdminOrientationCandidates() {
  const [q, setQ] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [vesselFilter, setVesselFilter] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [vessels, setVessels] = useState([])
  const [error, setError] = useState('')

  useEffect(() => { adminListOrientationVessels().then(setVessels).catch(() => {}) }, [])

  // Only crew who are currently onboard and sailing are relevant to an
  // onboard promotion checklist — everyone else (LEAVE / INACTIVE / desk
  // "Active") is excluded server-side (?on_sail=true) so the 50-row cap
  // is applied to the already-filtered set, not before it.
  const load = (query, rank, vessel) => {
    adminListOrientationCandidates(query, undefined, rank, vessel, true)
      .then(setCandidates)
      .catch((e) => setError(e.message))
  }

  useEffect(() => { load(q, rankFilter, vesselFilter) }, [q, rankFilter, vesselFilter])

  const onSail = candidates || []

  const visible = useMemo(() =>
    onSail.filter((c) => !deptFilter || c.department === deptFilter),
    [onSail, deptFilter])

  const counts = useMemo(() => {
    const c = { deck: 0, engine: 0, approvers: 0, enrolled: 0 }
    for (const row of onSail) {
      if (row.department) c[row.department]++
      if (isApproverRank(row.rank)) c.approvers++
      if (row.enrollment) c.enrolled++
    }
    return c
  }, [onSail])

  return (
    <div className="orn-page">
      <div className="orn-prog-header">
        <div className="orn-prog-header-left">
          <div className="orn-prog-header-icon">
            <Users size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="orn-title">Crew</h2>
            <p className="orn-subtitle">Onboard, on-sail deck &amp; engine officers — office staff and shore roles excluded. Go to <strong>Enrollments</strong> to enroll crew.</p>
          </div>
        </div>
      </div>

      {/* Stats + search/filters */}
      <div className="orn-prog-stats">
        <div className="orn-prog-stats-group">
          <div className="orn-prog-stat">
            <span className="orn-prog-stat-val">{onSail.length}</span>
            <span className="orn-prog-stat-lbl">On sail</span>
          </div>
          <div className="orn-prog-stat-sep" />
          <div className="orn-prog-stat">
            <span className="orn-prog-stat-val" style={{ color: 'var(--orn-deck)' }}>{counts.deck}</span>
            <span className="orn-prog-stat-lbl">Deck</span>
          </div>
          <div className="orn-prog-stat-sep" />
          <div className="orn-prog-stat">
            <span className="orn-prog-stat-val" style={{ color: 'var(--orn-engine)' }}>{counts.engine}</span>
            <span className="orn-prog-stat-lbl">Engine</span>
          </div>
          <div className="orn-prog-stat-sep" />
          <div className="orn-prog-stat">
            <span className="orn-prog-stat-val" style={{ color: 'var(--orn-accent)' }}>{counts.approvers}</span>
            <span className="orn-prog-stat-lbl">Master / CE</span>
          </div>
          <div className="orn-prog-stat-sep" />
          <div className="orn-prog-stat">
            <span className="orn-prog-stat-val">{counts.enrolled}</span>
            <span className="orn-prog-stat-lbl">Enrolled</span>
          </div>
        </div>

        <div className="orn-prog-stats-filters">
          <div className="inputwrap orn-filter-search">
            <Search size={14} />
            <input placeholder="Search by name..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <CardSelect className="orn-filter-select" value={rankFilter} onChange={setRankFilter}
            placeholder="All ranks" options={[{ value: '', label: 'All ranks' }, ...RANK_OPTIONS]} />
          <CardSelect className="orn-filter-select" value={vesselFilter} onChange={setVesselFilter}
            placeholder="All vessels"
            options={[{ value: '', label: 'All vessels' }, ...vessels.map((v) => ({ value: v.vessel, label: v.vessel }))]} />
          <div className="orn-dept-pills">
            {['', 'deck', 'engine'].map((d) => {
              const active = deptFilter === d
              const dl = d ? DEPT_LABEL[d] : null
              return (
                <button key={d || 'all'}
                  className={`orn-dept-pill${active ? ' orn-dept-pill--active' : ''} orn-dept-pill--${d || 'all'}`}
                  onClick={() => setDeptFilter(d)}>
                  {dl && <dl.icon size={12} />}
                  {d ? dl.label : 'All'}
                  {d ? <span className="orn-dept-pill-count">{counts[d]}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {!candidates ? (
        <div className="spinner">Loading crew...</div>
      ) : visible.length === 0 ? (
        <div className="orn-empty">
          <Users size={28} className="orn-empty-icon" />
          <div className="orn-empty-title">No eligible crew found</div>
          <div className="orn-empty-desc">Try adjusting your filters or search term. Crew on leave or not currently onboard are hidden here.</div>
        </div>
      ) : (
        <>
          <div className="orn-crew-grid">
            {visible.map((c) => {
              const dept = c.department ? DEPT_LABEL[c.department] : null
              const vesselData = vessels.find((v) => v.vessel === c.vessel)
              const approverList = (c.department === 'deck' ? vesselData?.masters : vesselData?.chiefEngineers) || []
              const approverName = approverList.length === 1 ? approverList[0].name
                : approverList.length > 1 ? `${approverList.length} candidates — resolve when enrolling`
                : null
              const enrolled = !!c.enrollment
              const isApprover = isApproverRank(c.rank)
              return (
                <div key={c.id}
                  className={`orn-crew-card${enrolled ? ' orn-crew-card--enrolled' : ''}${isApprover ? ' orn-crew-card--approver' : ''}`}>
                  {isApprover && (
                    <div className="orn-crew-approver-flag">
                      <ShieldCheck size={11} /> Vessel Approver
                    </div>
                  )}
                  <div className="orn-crew-card-top">
                    <Avatar name={c.name} dept={c.department} />
                    <div className="orn-crew-card-info">
                      <div className="orn-crew-name">{c.name}</div>
                      <div className="orn-crew-rank">{c.rank || 'No rank'}</div>
                    </div>
                    {dept && (
                      <span className={`orn-badge orn-badge-sm orn-badge-dept-${c.department}`}>
                        <dept.icon size={9} /> {dept.label}
                      </span>
                    )}
                  </div>

                  <div className="orn-crew-card-details">
                    {c.vessel && (
                      <div className="orn-crew-detail-row">
                        <Ship size={11} />
                        <span>{c.vessel}</span>
                        <span className="chip success" style={{ fontSize: 10, marginLeft: 2 }}>{c.empStatus}</span>
                      </div>
                    )}
                    {approverName && (
                      <div className="orn-crew-detail-row orn-crew-detail-row--faint">
                        <Anchor size={11} />
                        <span>{c.department === 'deck' ? 'Master' : 'CE'}: {approverName}</span>
                      </div>
                    )}
                    {c.nationality && (
                      <div className="orn-crew-detail-row orn-crew-detail-row--faint">
                        <Globe size={11} />
                        <span>{c.nationality}</span>
                      </div>
                    )}
                  </div>

                  {enrolled && (
                    <div className="orn-crew-card-footer">
                      <span className="orn-crew-enrolled-label">{c.enrollment.programTitle}</span>
                      <span className={`orn-badge orn-badge-sm orn-badge-status-${c.enrollment.status}`}>
                        {c.enrollment.status.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
