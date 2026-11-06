import './AdminAssignments.css'
import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Check, Award, Clock, Search, X, ChevronDown, Grid3x3, Phone, BookOpen,
  ClipboardList, AlertTriangle, Loader2, CheckSquare, Square, CheckCircle2,
  Circle, Hourglass, Calendar, Target, RotateCcw, MessageSquare, Eye, EyeOff,
  ExternalLink, Download, Users, RefreshCw
} from 'lucide-react'
import { adminReport, adminSetEnrollments, adminFetchCertificatePdfUrl, adminReassignCourse } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'
import CardSelect from '../../components/CardSelect.jsx'

const ACCENT = '#E07820'
const ACCENT_GRADIENT = 'linear-gradient(135deg, #E07820, #F58220)'
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
        border: '1.5px solid rgba(224,120,32,0.28)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          background: 'rgba(224,120,32,0.08)', flexShrink: 0,
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
              background: 'rgba(224,120,32,0.12)', color: ACCENT, border: '1px solid rgba(224,120,32,0.35)',
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

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => c.title.toLowerCase().includes(q))
  }, [courses, courseSearch])

  const selectAllFiltered = () => {
    setSelected((s) => {
      const n = new Set(s)
      filteredCourses.forEach((c) => n.add(c.id))
      return n
    })
  }
  const clearAllFiltered = () => {
    setSelected((s) => {
      const n = new Set(s)
      filteredCourses.forEach((c) => n.delete(c.id))
      return n
    })
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminSetEnrollments(row.learnerId, Array.from(selected))
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save assignments')
      setBusy(false)
    }
  }

  const addedCount = Array.from(selected).filter((id) => !originalIds.has(id)).length
  const removedCount = Array.from(originalIds).filter((id) => !selected.has(id)).length
  const isDirty = addedCount > 0 || removedCount > 0

  return (
    <ModalShell
      icon={<BookOpen size={18} />}
      title="Manage Course Assignments"
      subtitle={`${row.name} · ${row.crewId}${row.rank ? ` · ${row.rank}` : ''}`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          {error && <div className="form-error" style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {error}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span className="mut" style={{ fontSize: 12 }}>
              {isDirty ? (
                <span>
                  {addedCount > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>+{addedCount} to enroll </span>}
                  {removedCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>-{removedCount} to remove</span>}
                </span>
              ) : (
                `${selected.size} of ${courses.length} courses enrolled`
              )}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="btn primary"
                onClick={save}
                disabled={busy || !isDirty}
                style={{ background: ACCENT_GRADIENT, borderColor: 'transparent' }}
              >
                {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={14} />}
                {busy ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </>
      )}
    >
      <div style={{ padding: '14px 22px 10px', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="rpt-search-wrap" style={{ flex: '1 1 180px', margin: 0, minWidth: 0 }}>
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
              border: `1.5px solid ${isOn ? 'rgba(224,120,32,0.35)' : 'var(--border)'}`,
              background: isOn ? 'rgba(224,120,32,0.06)' : 'transparent',
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
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('all')
  const [manageRow, setManageRow] = useState(null)
  const [progressView, setProgressView] = useState(null)   // { row, course, cell }
  const [expanded, setExpanded] = useState(() => new Set()) // learnerIds showing all chips

  const load = () => {
    setLoading(true)
    adminReport()
      .then(setData)
      .finally(() => setLoading(false))
  }

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

  // Rank Filter Options for CardSelect
  const rankOptions = useMemo(() => {
    if (!data?.rows) return [{ value: 'all', label: 'All Ranks' }]
    const counts = {}
    data.rows.forEach(r => {
      const rank = (r.rank || '').trim().toUpperCase()
      if (rank) counts[rank] = (counts[rank] || 0) + 1
    })
    const sorted = Object.keys(counts).sort()
    return [
      { value: 'all', label: 'All Ranks' },
      ...sorted.map(r => ({
        value: r,
        label: r,
        description: `${counts[r]} seafarer${counts[r] === 1 ? '' : 's'}`
      }))
    ]
  }, [data])

  if (!data) return <div className="spinner">Loading assignments…</div>

  const toggleExpanded = (id) => setExpanded((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  // Filtered rows
  const filteredRows = data.rows.filter(row => {
    let matchSearch = true
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      matchSearch = (row.name || '').toLowerCase().includes(term) ||
             (row.crewId || '').toLowerCase().includes(term) ||
             (row.rank || '').toLowerCase().includes(term)
    }
    let matchRank = true
    if (rankFilter && rankFilter !== 'all') {
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
  const completedAssignments = data.rows.reduce((sum, row) => {
    return sum + Object.values(row.cells || {}).filter(c => c && c.status === 'passed').length
  }, 0)

  const hasFilters = search.trim() !== '' || (rankFilter !== 'all' && rankFilter !== '')
  const clearFilters = () => {
    setSearch('')
    setRankFilter('all')
  }

  return (
    <div className="asg-root">

      {/* ═══════════════════════ STICKY HEADER & CONTROLS BAR ═══════════════════════ */}
      <div className="asg-header-container">
        <div className="asg-header">
          {/* Left: Brand Identity */}
          <div className="asg-header-brand">
            <div className="asg-header-accent-bar" />
            <div className="asg-header-icon">
              <Grid3x3 size={17} />
            </div>
            <div className="asg-header-title-wrap">
              <div className="asg-header-eyebrow">Fleet Training · Enrollments</div>
              <div className="asg-header-title-row">
                <h1 className="asg-header-title">Assignments</h1>
                <div className="asg-header-stat-pill">
                  <span className="asg-header-stat-count">{filteredRows.length}</span>
                  <span className="asg-header-stat-label">
                    {hasFilters ? 'Filtered' : 'Seafarers'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Search, CardSelect Rank Dropdown, and Refresh */}
          <div className="asg-header-controls">
            {/* Search Input */}
            <div className="asg-search-wrap">
              <Search size={13} className="asg-search-icon" />
              <input
                id="asg-search-input"
                type="text"
                className="asg-search-input"
                placeholder="Search seafarers, ID, rank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="asg-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* CardSelect Rank Filter */}
            <div className="asg-select-wrap">
              <CardSelect
                id="asg-rank-filter"
                value={rankFilter}
                onChange={setRankFilter}
                options={rankOptions}
                placeholder="All Ranks"
                searchable={true}
                placement="bottom"
                className="asg-cardselect"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              id="asg-refresh-btn"
              className="asg-btn-refresh"
              onClick={load}
              disabled={loading}
              title="Refresh assignments"
              aria-label="Refresh list"
            >
              <RefreshCw size={14} className={loading ? 'asg-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Active Filter Chips Strip */}
        {hasFilters && (
          <div className="asg-chips-bar">
            <span className="asg-chips-label">Active Filters:</span>

            {search.trim() && (
              <span className="asg-chip">
                Search: <strong>"{search.trim()}"</strong>
                <button
                  type="button"
                  className="asg-chip-remove"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {rankFilter !== 'all' && rankFilter !== '' && (
              <span className="asg-chip">
                Rank: <strong>{rankFilter}</strong>
                <button
                  type="button"
                  className="asg-chip-remove"
                  onClick={() => setRankFilter('all')}
                  title="Clear rank filter"
                  aria-label="Clear rank filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            <button
              type="button"
              className="asg-chip-clear-all"
              onClick={clearFilters}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════ UNIQUE LIGHT-THEMED COMPACT KPI CARDS (~58px) ═══════════════════════ */}
      <div className="asg-kpi-strip">
        {/* Card 1: Total Seafarers (Warm Amber Accent) */}
        <div className="asg-kpi-card asg-kpi-card--amber">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Total Seafarers</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Users size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{data.rows.length}</span>
            <span className="asg-kpi-badge">Crew</span>
          </div>
        </div>

        {/* Card 2: Active Courses (Royal Indigo Accent) */}
        <div className="asg-kpi-card asg-kpi-card--indigo">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Active Courses</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <BookOpen size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{totalCourses}</span>
            <span className="asg-kpi-badge">Curriculum</span>
          </div>
        </div>

        {/* Card 3: Assigned Slots (Emerald Accent) */}
        <div className="asg-kpi-card asg-kpi-card--emerald">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Assigned Slots</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Grid3x3 size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{totalAssignments.toLocaleString()}</span>
            <span className="asg-kpi-badge">Enrollments</span>
          </div>
        </div>

        {/* Card 4: Avg per Seafarer (Violet Purple Accent) */}
        <div className="asg-kpi-card asg-kpi-card--purple">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Avg / Seafarer</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Award size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{avgPerCrew.toFixed(1)}</span>
            <span className="asg-kpi-badge">Ratio</span>
          </div>
        </div>

        {/* Card 5: Completed Courses (Ocean Sky Accent) */}
        <div className="asg-kpi-card asg-kpi-card--sky">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Completed Courses</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <CheckCircle2 size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{completedAssignments.toLocaleString()}</span>
            <span className="asg-kpi-badge">Completed</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ TABLE CARD ═══════════════════════ */}
      <div className="asg-table-card admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 470 }}>
        <div className="admin-table-wrap" style={{ flex: 1, minHeight: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th style={{ width: 300 }}>Seafarer</th>
                <th>Assigned Courses</th>
                <th style={{ width: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 && (
                <tr><td colSpan={4} className="mut" style={{ textAlign: 'center', padding: 40 }}>No seafarers match your search.</td></tr>
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
