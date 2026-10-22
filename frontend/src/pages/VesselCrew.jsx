import { useEffect, useMemo, useState } from 'react'
import {
  Award, CheckCircle2, ChevronDown, Clock, Eye, Search, Ship, Users, X, CircleDashed, BookOpen, Anchor,
} from 'lucide-react'
import { TopNav } from '../App.jsx'
import { getVesselCrew, fetchVesselCrewCertificatePdfUrl } from '../api.js'
import './VesselCrew.css'

const STATUS = {
  completed: { label: 'Completed', icon: CheckCircle2 },
  in_progress: { label: 'In progress', icon: Clock },
  not_started: { label: 'Not started', icon: CircleDashed },
}

const FILTERS = [
  ['all', 'All'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['not_started', 'Not started'],
]

function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function initials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

function Ring({ pct, status }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <div className="vc-ring" title={`${pct}% of assigned courses ${STATUS[status].label.toLowerCase()}`}>
      <svg width="52" height="52" viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} className="vc-ring-track" />
        <circle cx="26" cy="26" r={r} className={`vc-ring-fill ${status}`}
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} transform="rotate(-90 26 26)" />
      </svg>
      <span>{pct}%</span>
    </div>
  )
}

function Segments({ member, filter }) {
  const total = member.assigned || 1
  const seg = (n, cls) => n > 0 && <i className={cls} style={{ width: `${(n / total) * 100}%` }} />
  const show = (s) => filter === 'all' || filter === s
  return (
    <div className="vc-seg" aria-hidden="true">
      {show('completed') && seg(member.completed, 'completed')}
      {show('in_progress') && seg(member.inProgress, 'in_progress')}
      {show('not_started') && seg(member.notStarted, 'not_started')}
    </div>
  )
}

function CertViewer({ crew, course, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let objectUrl
    fetchVesselCrewCertificatePdfUrl(crew.id, course.courseId)
      .then((u) => { objectUrl = u; setUrl(u) })
      .catch((e) => setError(e.message))
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [crew.id, course.courseId, onClose])

  return (
    <div className="vc-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vc-viewer" role="dialog" aria-label="Certificate">
        <div className="vc-viewer-bar">
          <div className="vc-viewer-seal"><Award size={18} /></div>
          <div className="vc-viewer-title">
            <strong>{course.title}</strong>
            <span>{crew.name} · <span className="vc-mono">{course.certificateId}</span></span>
          </div>
          <button className="vc-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="vc-viewer-body">
          {error ? <p className="vc-error">{error}</p>
            : !url ? <div className="vc-loading">Loading certificate…</div>
            : <iframe src={url} title="Certificate" />}
        </div>
      </div>
    </div>
  )
}

function CrewCard({ member, filter, open, onToggle, onViewCert }) {
  const shown = filter === 'all' ? member.courses : member.courses.filter((c) => c.status === filter)
  const ringStatus = filter === 'all' ? 'completed' : filter
  const ringCount = { completed: member.completed, in_progress: member.inProgress, not_started: member.notStarted }[ringStatus]
  const pct = member.assigned ? Math.round((ringCount / member.assigned) * 100) : 0
  const showCount = (s) => filter === 'all' || filter === s
  return (
    <div className={`vc-card${open ? ' open' : ''}`}>
      <button className="vc-card-head" onClick={onToggle} aria-expanded={open}>
        <div className="vc-avatar">{initials(member.name)}</div>
        <div className="vc-who">
          <div className="vc-name">{member.name}</div>
          <div className="vc-sub">
            <span className="vc-rank">{member.rank || '—'}</span>
            {member.crewId && <span className="vc-mono">{member.crewId}</span>}
          </div>
        </div>
        <div className="vc-prog">
          <div className="vc-counts">
            {showCount('completed') && <span className="completed"><b>{member.completed}</b> Completed</span>}
            {showCount('in_progress') && <span className="in_progress"><b>{member.inProgress}</b> In progress</span>}
            {showCount('not_started') && <span className="not_started"><b>{member.notStarted}</b> Not started</span>}
          </div>
          <Segments member={member} filter={filter} />
        </div>
        <Ring pct={pct} status={ringStatus} />
        <ChevronDown size={18} className="vc-caret" />
      </button>

      {open && (
        <div className="vc-courses">
          {shown.length === 0 && <div className="vc-empty-row">No courses assigned.</div>}
          {shown.map((c) => {
            const S = STATUS[c.status]
            return (
              <div key={c.courseId} className={`vc-course ${c.status}`}>
                <div className={`vc-badge ${c.status}`}><S.icon size={16} /></div>
                <div className="vc-course-main">
                  <div className="vc-course-title">{c.title}</div>
                  <div className="vc-course-meta">
                    {c.status === 'completed'
                      ? `Passed${c.score != null ? ` with ${c.score}%` : ''}${c.issuedAt ? ` · certified ${fmtDate(c.issuedAt)}` : ''}`
                      : `${c.chaptersDone} of ${c.chaptersTotal} chapters`}
                  </div>
                  {c.status !== 'completed' && (
                    <div className="vc-mini"><i style={{ width: `${c.progressPct}%` }} /></div>
                  )}
                </div>
                <span className={`vc-pill ${c.status}`}>{S.label}</span>
                {c.certificateId
                  ? <button className="vc-cert-btn" onClick={() => onViewCert(member, c)}><Eye size={14} /> View certificate</button>
                  : <span className="vc-cert-spacer" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function VesselCrew() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [viewing, setViewing] = useState(null)

  useEffect(() => { getVesselCrew().then(setData).catch((e) => setError(e.message)) }, [])

  const crew = data?.crew || []
  const totals = useMemo(() => ({
    crew: crew.length,
    completed: crew.reduce((n, m) => n + m.completed, 0),
    inProgress: crew.reduce((n, m) => n + m.inProgress, 0),
    certs: crew.reduce((n, m) => n + m.courses.filter((c) => c.certificateId).length, 0),
  }), [crew])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return crew.filter((m) => {
      if (q && !`${m.name} ${m.rank} ${m.crewId}`.toLowerCase().includes(q)) return false
      if (filter === 'all') return true
      return m.courses.some((c) => c.status === filter)
    })
  }, [crew, search, filter])

  if (error) return (<><TopNav /><div className="page"><p className="vc-error">{error}</p></div></>)
  if (!data) return (<><TopNav /><div className="spinner">Loading vessel crew…</div></>)

  return (
    <>
      <TopNav />
      <div className="page vc-page">
        <header className="vc-hero">
          <div className="vc-hero-top">
            <div className="vc-hero-icon"><Ship size={26} /></div>
            <div>
              <div className="vc-eyebrow">Onboard training overview</div>
              <h1>{data.vessel}</h1>
            </div>
          </div>
          <div className="vc-stats">
            <div className="vc-stat"><Users size={18} /><div><b>{totals.crew}</b><span>Crew onboard</span></div></div>
            <div className="vc-stat"><CheckCircle2 size={18} /><div><b>{totals.completed}</b><span>Courses completed</span></div></div>
            <div className="vc-stat"><BookOpen size={18} /><div><b>{totals.inProgress}</b><span>In progress</span></div></div>
            <div className="vc-stat"><Award size={18} /><div><b>{totals.certs}</b><span>Certificates issued</span></div></div>
          </div>
        </header>

        <div className="vc-toolbar">
          <div className="vc-search">
            <Search size={16} />
            <input placeholder="Search by name, rank or crew ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
          </div>
          <div className="vc-filters" role="tablist">
            {FILTERS.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={filter === key}
                className={`vc-filter${filter === key ? ' on' : ''}`} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        {crew.length === 0 ? (
          <div className="vc-empty"><Anchor size={34} /><h3>No crew found</h3><p>No other crew are currently assigned to {data.vessel}.</p></div>
        ) : visible.length === 0 ? (
          <div className="vc-empty"><Search size={30} /><h3>No matches</h3><p>Try a different search or filter.</p></div>
        ) : (
          <div className="vc-list">
            <div className="vc-count">{visible.length} crew member{visible.length === 1 ? '' : 's'}</div>
            {visible.map((m) => (
              <CrewCard key={m.id} member={m} filter={filter} open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                onViewCert={(member, course) => setViewing({ member, course })} />
            ))}
          </div>
        )}
      </div>
      {viewing && <CertViewer crew={viewing.member} course={viewing.course} onClose={() => setViewing(null)} />}
    </>
  )
}
