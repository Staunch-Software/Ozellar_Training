import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Check, Award, Clock, Search, X, ChevronDown, Grid3x3, Phone, BookOpen,
  ClipboardList, AlertTriangle, Loader2, CheckSquare, Square, CheckCircle2,
  Circle, Hourglass, Calendar, Target, RotateCcw, MessageSquare, Eye, EyeOff, ExternalLink, Download,
} from 'lucide-react'
import { adminReport, adminSetEnrollments, adminFetchCertificatePdfUrl, adminReassignCourse } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'

const ACCENT = '#7c3aed'
const ACCENT_GRADIENT = 'linear-gradient(135deg, #7c3aed, #a855f7)'
const VISIBLE_CHIPS = 4

const formatMobile = (mobileNo) => {
  if (!mobileNo || mobileNo.length !== 10) return mobileNo || null
  return `${mobileNo.slice(0, 5)} ${mobileNo.slice(5)}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// status -> look. `assigned` = enrolled but nothing started yet.
const STATUS = {
  passed:        { label: 'Completed',   color: '#16a34a', bg: 'rgba(22,163,74,0.12)',  border: 'rgba(22,163,74,0.35)',  Icon: CheckCircle2 },
  'in-progress': { label: 'In progress', color: '#d97706', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.4)',  Icon: Clock },
  assigned:      { label: 'Not started', color: 'var(--text-mut)', bg: 'var(--surface-2)', border: 'var(--border-strong)', Icon: Circle },
}
const statusOf = (cell) => STATUS[cell?.status] || STATUS.assigned
const STATUS_ORDER = { passed: 0, 'in-progress': 1, assigned: 2 }

/* ─────────────────────────── shared modal shell ─────────────────────────── */

function ModalShell({ icon, title, subtitle, width = 560, busy, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        width: `min(${width}px, 100%)`, maxHeight: '88vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 16,
        border: '1.5px solid rgba(124,58,237,0.28)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          background: 'rgba(124,58,237,0.08)', flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: ACCENT_GRADIENT,
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && (
              <div className="mut" style={{ fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
            )}
          </div>
          <button onClick={() => !busy && onClose()} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mut)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  )
}

/* ───────────────────── course progress popup (click a course chip) ───────────────────── */

function Step({ done, current, label, last }) {
  const color = done ? '#16a34a' : current ? '#d97706' : 'var(--border-strong)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: last ? '0 0 auto' : 1, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: done ? color : 'var(--surface)', color: done ? '#fff' : color,
          border: `2px solid ${color}`,
        }}>
          {done ? <Check size={14} strokeWidth={3} /> : current ? <Clock size={13} /> : <Circle size={9} />}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: done || current ? 'var(--text)' : 'var(--text-mut)' }}>{label}</span>
      </div>
      {!last && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', background: done ? color : 'var(--border)' }} />}
    </div>
  )
}

function InfoTile({ icon, label, value }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
      <div className="mut" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>{icon}{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{value}</div>
    </div>
  )
}

function CourseProgressModal({ row, course, cell, onClose, onManage, onReassign }) {
  const st = statusOf(cell)
  const stage = cell.status === 'passed' ? 2 : cell.status === 'in-progress' ? 1 : 0
  const pct = Math.max(0, Math.min(100, cell.completionPct ?? 0))
  const StIcon = st.Icon
  const [certBusy, setCertBusy] = useState(false)
  const [certError, setCertError] = useState('')
  const [certUrl, setCertUrl] = useState('')   // object URL of the PDF once loaded

  // free the PDF blob when it is hidden or the popup closes
  useEffect(() => () => { if (certUrl) URL.revokeObjectURL(certUrl) }, [certUrl])

  const toggleCertificate = async () => {
    setCertError('')
    if (certUrl) { setCertUrl(''); return }
    setCertBusy(true)
    try {
      setCertUrl(await adminFetchCertificatePdfUrl(row.learnerId, course.id))
    } catch (err) {
      setCertError(err.message || 'Could not load the certificate')
    } finally {
      setCertBusy(false)
    }
  }

  return (
    <ModalShell
      icon={<BookOpen size={17} />}
      title={course.title}
      subtitle={`${row.name} · ${row.crewId}${row.rank ? ` · ${row.rank}` : ''}`}
      width={certUrl ? 760 : 500}
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button type="button" className="btn" 
            onClick={() => {
              if (window.confirm('Are you sure you want to reassign this course? All progress and certificates for this course will be wiped.')) {
                onReassign()
              }
            }}
            style={{ color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', marginRight: 'auto' }}>
            <RotateCcw size={14} /> Reassign
          </button>
          <button type="button" className="btn" onClick={onManage}><BookOpen size={14} /> Manage Courses</button>
          <button type="button" className="btn primary" onClick={onClose}
            style={{ background: ACCENT_GRADIENT, borderColor: 'transparent' }}>Close</button>
        </div>
      )}
    >
      <div style={{ padding: 22, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
            background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 12.5, fontWeight: 700,
          }}>
            <StIcon size={14} /> {st.label}
          </span>
          {cell.pendingApproval && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
              background: 'rgba(124,58,237,0.12)', color: ACCENT, border: '1px solid rgba(124,58,237,0.35)',
              fontSize: 12.5, fontWeight: 700,
            }}>
              <Hourglass size={13} /> Awaiting approval
            </span>
          )}
        </div>

        <div style={{ display: 'flex', marginBottom: 22, padding: '0 6px' }}>
          <Step done label="Assigned" />
          <Step done={stage >= 1} label="Started" />
          <Step done={stage >= 2} current={stage === 1} label="Completed" last />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Lesson progress</span>
            <span className="mut">{cell.completedChapters ?? 0} of {cell.totalChapters ?? 0} lessons · <b style={{ color: 'var(--text)' }}>{pct}%</b></span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-3, var(--border))', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: stage === 2 && pct >= 100 ? '#16a34a' : ACCENT_GRADIENT, transition: 'width .3s ease' }} />
          </div>
          {stage === 2 && pct < 100 && cell.score != null && (
            <div className="mut" style={{ fontSize: 11.5, marginTop: 6 }}>
              Completed by passing the assessment — not every lesson was opened.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <InfoTile icon={<Calendar size={12} />} label="Assigned on" value={formatDate(cell.startedOn)} />
          <InfoTile icon={<CheckCircle2 size={12} />} label="Completed on" value={stage === 2 ? formatDate(cell.passedOn) : '—'} />
          <InfoTile icon={<Target size={12} />} label="Assessment score" value={cell.score != null ? `${cell.score}%` : '—'} />
          <InfoTile icon={<RotateCcw size={12} />} label="Attempts" value={cell.attempts || 0} />
        </div>

        {stage === 2 && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
            border: '1px solid rgba(22,163,74,0.35)', background: 'rgba(22,163,74,0.08)',
          }}>
            <Award size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Certificate</div>
              <div className="mut" style={{ fontSize: 11.5 }}>
                {cell.pendingApproval ? 'Available once it has been approved' : 'Issued certificate (PDF)'}
              </div>
            </div>
            {!cell.pendingApproval && (
              <button type="button" className="btn sm" onClick={toggleCertificate} disabled={certBusy}>
                {certBusy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                  : certUrl ? <EyeOff size={13} /> : <Eye size={13} />}
                {certBusy ? 'Loading…' : certUrl ? 'Hide certificate' : 'View certificate'}
              </button>
            )}
          </div>
        )}
        {certError && <div className="form-error" style={{ marginTop: 10 }}><AlertTriangle size={14} /> {certError}</div>}
        {certUrl && (
          <div style={{ marginTop: 10 }}>
            <iframe
              title="Certificate preview" src={`${certUrl}#view=FitH`}
              style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <a className="btn sm" href={certUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open in new tab</a>
              <a className="btn sm" href={certUrl} download={`${row.name} - ${course.title} - certificate.pdf`}><Download size={13} /> Download</a>
            </div>
          </div>
        )}

        {cell.approvalRemark && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-2)', fontSize: 12.5,
          }}>
            <div className="mut" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginBottom: 3 }}>
              <MessageSquare size={12} /> Admin remark
            </div>
            <div style={{ color: 'var(--text)' }}>{cell.approvalRemark}</div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

/* ─────────────────────────── assigned-course chip ─────────────────────────── */

function CourseChip({ course, cell, onClick }) {
  const st = statusOf(cell)
  const Icon = st.Icon
  const pct = cell.completionPct ?? 0
  return (
    <button
      type="button"
      className="asg-chip"
      onClick={onClick}
      title={`${course.title} — ${st.label}${cell.status === 'in-progress' ? ` (${pct}%)` : ''}. Click for details`}
      style={{ color: st.color, background: st.bg, borderColor: st.border }}
    >
      <Icon size={12} style={{ flexShrink: 0 }} />
      <span className="asg-chip-title">{course.title}</span>
      {cell.status === 'in-progress' && <span className="asg-chip-meta">{pct}%</span>}
      {cell.status === 'passed' && cell.score != null && <span className="asg-chip-meta">{cell.score}%</span>}
      {cell.pendingApproval && <Hourglass size={11} style={{ flexShrink: 0, color: ACCENT }} />}
    </button>
  )
}

/* ─────────────────────────── manage-courses modal ─────────────────────────── */

function ManageCoursesModal({ row, courses, onClose, onSaved }) {
  const originalIds = useMemo(() => new Set(Object.keys(row.cells || {})), [row])
  const [selected, setSelected] = useState(new Set(originalIds))
  const [courseSearch, setCourseSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleOne = (id) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filteredCourses = courses.filter((c) =>
    !courseSearch || c.title.toLowerCase().includes(courseSearch.toLowerCase())
  )

  const selectAllFiltered = () => setSelected((s) => {
    const n = new Set(s); filteredCourses.forEach((c) => n.add(c.id)); return n
  })
  const clearAllFiltered = () => setSelected((s) => {
    const n = new Set(s); filteredCourses.forEach((c) => n.delete(c.id)); return n
  })

  // removing a course the learner already has progress on hides it (record is kept) — confirm first
  const riskyRemovals = [...originalIds]
    .filter((id) => !selected.has(id))
    .map((id) => ({ id, cell: row.cells[id], course: courses.find((c) => c.id === id) }))
    .filter((r) => r.cell && (r.cell.status === 'passed' || r.cell.status === 'in-progress'))

  const addedCount = [...selected].filter((id) => !originalIds.has(id)).length
  const removedCount = [...originalIds].filter((id) => !selected.has(id)).length
  const dirty = addedCount > 0 || removedCount > 0

  const save = async () => {
    if (riskyRemovals.length > 0) {
      const names = riskyRemovals.map((r) => r.course?.title || r.id).join(', ')
      const ok = window.confirm(
        `${riskyRemovals.length} course(s) you're removing already have progress or a passed result ` +
        `for ${row.name} (${names}). Unassigning hides the course but keeps their record. Continue?`
      )
      if (!ok) return
    }
    setBusy(true); setError('')
    try {
      await adminSetEnrollments(row.learnerId, [...selected])
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save assignment changes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell
      icon={<BookOpen size={17} />}
      title="Manage Courses"
      subtitle={`${row.name} · ${row.crewId}${row.rank ? ` · ${row.rank}` : ''}`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          {error && <div className="form-error" style={{ marginBottom: 10 }}><AlertTriangle size={14} /> {error}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="mut" style={{ fontSize: 12, flex: 1 }}>
              {selected.size} course{selected.size === 1 ? '' : 's'} selected
              {dirty && (
                <span style={{ marginLeft: 6 }}>
                  ({addedCount > 0 ? `+${addedCount} new` : ''}{addedCount > 0 && removedCount > 0 ? ', ' : ''}{removedCount > 0 ? `−${removedCount} removed` : ''})
                </span>
              )}
            </div>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" onClick={save} disabled={busy || !dirty}
              style={{ background: ACCENT_GRADIENT, borderColor: 'transparent' }}>
              {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={14} />}
              {busy ? 'Saving…' : 'Save Assignment'}
            </button>
          </div>
        </>
      )}
    >
      <div style={{ padding: '14px 22px 10px', flexShrink: 0, display: 'flex', gap: 8 }}>
        <div className="rpt-search-wrap" style={{ flex: 1, margin: 0 }}>
          <Search size={14} className="rpt-field-icon" />
          <input type="text" placeholder="Search courses…" className="rpt-field"
            value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} />
          {courseSearch && (
            <button className="rpt-x-btn" onClick={() => setCourseSearch('')}><X size={12} /></button>
          )}
        </div>
        <button type="button" className="btn sm" onClick={selectAllFiltered} title="Select all courses shown below">
          <CheckSquare size={13} /> All
        </button>
        <button type="button" className="btn sm" onClick={clearAllFiltered} title="Deselect all courses shown below">
          <Square size={13} /> None
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px' }}>
        {filteredCourses.length === 0 && (
          <div className="mut" style={{ padding: '20px 8px', textAlign: 'center', fontSize: 13 }}>No courses match "{courseSearch}"</div>
        )}
        {filteredCourses.map((c) => {
          const cell = row.cells[c.id]
          const isOn = selected.has(c.id)
          const st = cell ? statusOf(cell) : null
          return (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${isOn ? 'rgba(124,58,237,0.35)' : 'var(--border)'}`,
              background: isOn ? 'rgba(124,58,237,0.06)' : 'transparent',
              marginBottom: 6, transition: 'background .12s ease',
            }}>
              <input type="checkbox" checked={isOn} onChange={() => toggleOne(c.id)}
                style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </span>
              {cell && cell.status !== 'assigned' && (
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 999, color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                }}>
                  {cell.status === 'passed' ? <Award size={11} /> : <Clock size={11} />}
                  {cell.status === 'passed' ? (cell.score != null ? `${cell.score}%` : 'Completed') : 'In progress'}
                </span>
              )}
              {cell && cell.pendingApproval && (
                <span className="chip accent" style={{ flexShrink: 0 }}>pending approval</span>
              )}
            </label>
          )
        })}
      </div>
    </ModalShell>
  )
}

/* ─────────────────────────────── main page ─────────────────────────────── */

export default function AdminAssignments() {
  const [data, setData] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [manageRow, setManageRow] = useState(null)
  const [progressView, setProgressView] = useState(null)   // { row, course, cell }
  const [expanded, setExpanded] = useState(() => new Set()) // learnerIds showing all chips
  const dropdownRef = useRef(null)

  const load = () => adminReport().then(setData)
  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [search, rankFilter])

  const handleReassign = async (learnerId, courseId) => {
    try {
      await adminReassignCourse(learnerId, courseId)
      setProgressView(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!data) return <div className="spinner">Loading assignments…</div>

  const toggleExpanded = (id) => setExpanded((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const uniqueRanks = [...new Set(data.rows.map(r => (r.rank || '').trim().toUpperCase()).filter(Boolean))].sort()

  const filteredRows = data.rows.filter(row => {
    let matchSearch = true
    if (search) {
      const term = search.toLowerCase()
      matchSearch = (row.name || '').toLowerCase().includes(term) ||
             (row.crewId || '').toLowerCase().includes(term) ||
             (row.rank || '').toLowerCase().includes(term)
    }
    let matchRank = true
    if (rankFilter) {
      matchRank = (row.rank || '').trim().toUpperCase() === rankFilter
    }
    return matchSearch && matchRank
  })

  const itemsPerPage = 20
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage)
  const currentRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const totalAssignments = data.rows.reduce((sum, row) => sum + Object.keys(row.cells || {}).length, 0)
  const totalCourses = data.courses.length
  const avgPerCrew = data.rows.length ? (totalAssignments / data.rows.length) : 0

  return (
    // Bounded height like the Reporting page: the table card fills the space
    // and scrolls internally. Its minHeight keeps >= 5 rows visible on short
    // screens (the page scrolls instead of squeezing the table).
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '10px 0', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <div style={{ width: '4px', height: '36px', background: 'linear-gradient(180deg, #7c3aed, #a855f7)', borderRadius: '0 4px 4px 0', flexShrink: 0 }}></div>
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(124,58,237,0.1)', color: ACCENT, display: 'grid', placeItems: 'center' }}>
          <Grid3x3 size={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, opacity: 0.8 }}>Fleet Training · Enrollments</span>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: '1px 0 0' }}>Assignments</h1>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <div className="rpt-search-wrap" style={{ minWidth: 280, maxWidth: 400, margin: 0 }}>
            <Search size={14} className="rpt-field-icon" />
            <input type="text" placeholder="Search by name, crew ID, or rank..." className="rpt-field"
              value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button className="rpt-x-btn" onClick={() => setSearch('')}><X size={12} /></button>
            )}
          </div>

          <div style={{ position: 'relative', width: '260px', flex: '0 0 260px' }} ref={dropdownRef}>
            <div className="rpt-field"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: '260px', background: '#fff' }}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }}>
                {rankFilter || 'All Ranks'}
              </span>
              <ChevronDown size={14} className="mut"
                style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
            </div>

            {isDropdownOpen && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50,
                maxHeight: '240px', overflowY: 'auto',
              }}>
                <div className={`premium-select-option ${!rankFilter ? 'selected' : ''}`}
                  onClick={() => { setRankFilter(''); setIsDropdownOpen(false) }}>All Ranks</div>
                {uniqueRanks.map(r => (
                  <div key={r} className={`premium-select-option ${rankFilter === r ? 'selected' : ''}`}
                    onClick={() => { setRankFilter(r); setIsDropdownOpen(false) }}>{r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Crew', value: data.rows.length, Icon: ClipboardList },
          { label: 'Courses', value: totalCourses, Icon: BookOpen },
          { label: 'Total Assignments', value: totalAssignments, Icon: Grid3x3 },
          { label: 'Avg / Crew', value: avgPerCrew.toFixed(1), Icon: Award },
        ].map(({ label, value, Icon }) => (
          <div key={label} className="admin-card" style={{
            padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 160px', minWidth: 150,
          }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(124,58,237,0.1)', color: ACCENT, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={15} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
              <div className="mut" style={{ fontSize: 11 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* minHeight keeps >= 5 rows visible (header + 5 rows + pagination) */}
      <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 470 }}>
        <div className="admin-table-wrap" style={{ flex: 1, minHeight: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th style={{ width: 300 }}>Crew Member</th>
                <th>Assigned Courses</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 && (
                <tr><td colSpan={4} className="mut" style={{ textAlign: 'center', padding: 40 }}>No crew match your search.</td></tr>
              )}
              {currentRows.map((row, index) => {
                // completed first, then in progress, then not started (stable within each group)
                const assigned = Object.entries(row.cells || {})
                  .map(([cid, cell]) => ({ course: data.courses.find(c => c.id === cid), cell }))
                  .filter(a => a.course)
                  .sort((a, b) => (STATUS_ORDER[a.cell.status] ?? 2) - (STATUS_ORDER[b.cell.status] ?? 2))
                const isOpen = expanded.has(row.learnerId)
                const shown = isOpen ? assigned : assigned.slice(0, VISIBLE_CHIPS)
                const extra = assigned.length - VISIBLE_CHIPS

                return (
                  <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                    <td className="mut" style={{ fontSize: 11 }}>{(currentPage - 1) * itemsPerPage + index + 1}.</td>
                    <td>
                      <b>{row.name}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span className="mono mut">{row.crewId}</span>
                        {row.rank && <span className="pill learner sm">{row.rank}</span>}
                        {row.mobileNo && (
                          <a href={`tel:${row.mobileNo.replace(/[^\d+]/g, '')}`} title="Call"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px 2px 6px', borderRadius: 999,
                              background: 'rgba(16,185,129,0.1)', color: '#0d9488',
                              fontSize: 11, fontWeight: 600, textDecoration: 'none',
                              border: '1px solid rgba(16,185,129,0.25)', lineHeight: 1.6,
                            }}>
                            <Phone size={10} strokeWidth={2.5} />
                            {formatMobile(row.mobileNo)}
                          </a>
                        )}
                      </div>
                    </td>
                    <td>
                      {assigned.length === 0 ? (
                        <span className="mut" style={{ fontSize: 12 }}>No courses assigned</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {shown.map(({ course, cell }) => (
                            <CourseChip key={course.id} course={course} cell={cell}
                              onClick={() => setProgressView({ row, course, cell })} />
                          ))}
                          {extra > 0 && (
                            <button type="button" className="asg-more" onClick={() => toggleExpanded(row.learnerId)}>
                              {isOpen ? 'Show less' : `+${extra} more`}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <button type="button" className="asg-manage-btn" onClick={() => setManageRow(row)}>
                        <BookOpen size={13} /> Manage Courses
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages}
          totalItems={filteredRows.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} />
      </div>

      {progressView && (
        <CourseProgressModal
          row={progressView.row} course={progressView.course} cell={progressView.cell}
          onClose={() => setProgressView(null)}
          onManage={() => {
            const r = progressView.row
            setProgressView(null)
            setManageRow(r)
          }}
          onReassign={() => handleReassign(progressView.row.learnerId, progressView.course.id)}
        />
      )}
      {manageRow && (
        <ManageCoursesModal row={manageRow} courses={data.courses}
          onClose={() => setManageRow(null)} onSaved={load} />
      )}
    </div>
  )
}
