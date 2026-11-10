import { useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Award, Clock, Circle, FileSpreadsheet, FileText,
  Users, CheckCircle, AlertCircle, Search, X, SlidersHorizontal,
  TrendingUp, Download, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Eye, BarChart3,
  MessageSquare, Lock, Phone, BookOpen, RotateCcw, Layers, Calendar, Ship, Check
} from 'lucide-react'
import CardSelect from '../../components/CardSelect.jsx'
import { adminReport, adminDownloadReportCsv, adminDownloadReportXlsx, adminApproveCertificate } from '../../api.js'
import { getToken } from '../../api.js'
import { useAuth } from '../../auth.jsx'
import './AdminReports.css'

/* ------------------------------------------------------------------ */
/*  Approve-with-remark modal                                          */
/* ------------------------------------------------------------------ */
function ApproveModal({ learnerName, courseName, onCancel, onConfirm, busy }) {
  const [remark, setRemark] = useState('')
  const [touched, setTouched] = useState(false)
  const canSubmit = remark.trim().length > 0

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(2px)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        width: 'min(440px, 100%)', background: 'var(--surface)', borderRadius: 16,
        border: '1.5px solid rgba(16,185,129,0.3)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px',
          borderBottom: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.08)',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#059669,#10b981)',
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
          }}>
            <CheckCircle size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Approve Certificate</div>
            <div style={{ fontSize: 12, color: 'var(--text-mut)' }}>{learnerName} · {courseName}</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mut)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 22 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mut)', display: 'block', marginBottom: 6 }}>
            Approval remark <i className="req">*</i>
          </label>
          <textarea
            autoFocus
            value={remark}
            onChange={e => setRemark(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Verified against onboard assessment records"
            rows={3}
            style={{
              width: '100%', resize: 'vertical', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 13, fontFamily: 'inherit',
            }}
          />
          {touched && !canSubmit && (
            <div className="form-error" style={{ marginTop: 8 }}><AlertCircle size={13} /> A remark is required to approve.</div>
          )}
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              className="btn primary"
              disabled={!canSubmit || busy}
              style={{ background: 'linear-gradient(135deg,#059669,#10b981)' }}
              onClick={() => onConfirm(remark.trim())}
            >
              <CheckCircle size={14} /> {busy ? 'Approving…' : 'Approve'}
            </button>
            <button className="btn" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Approval-remark hover tooltip                                       */
/* ------------------------------------------------------------------ */
function RemarkTooltip({ learnerName, courseName, remark, anchor }) {
  const WIDTH = 260
  const GAP = 10
  let left = anchor.x - WIDTH / 2
  left = Math.max(12, Math.min(left, window.innerWidth - WIDTH - 12))
  const showAbove = anchor.y > 160
  const top = showAbove ? anchor.y - GAP : anchor.y + GAP
  const arrowLeft = Math.max(14, Math.min(anchor.x - left, WIDTH - 14))

  return (
    <div
      style={{
        position: 'fixed', left, width: WIDTH, zIndex: 400, pointerEvents: 'none',
        top: showAbove ? undefined : top,
        bottom: showAbove ? window.innerHeight - top : undefined,
        animation: 'rptTipIn .12s ease-out',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        padding: '10px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <MessageSquare size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text)' }}>Remark</span>
          <span style={{ fontSize: 10.5, color: 'var(--text-mut)' }}>· {learnerName} · {courseName}</span>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
          {remark}
        </div>
      </div>
      <div style={{
        position: 'absolute', left: arrowLeft, width: 9, height: 9,
        background: 'var(--surface)', border: '1px solid var(--border)',
        transform: `translateX(-50%) rotate(45deg)`,
        ...(showAbove
          ? { bottom: -5, borderTop: 'none', borderLeft: 'none' }
          : { top: -5, borderBottom: 'none', borderRight: 'none' }),
      }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Status config                                                       */
/* ------------------------------------------------------------------ */
const S = {
  passed:        { cls: 'ok',    icon: <CheckCircle size={12} />, label: 'Completed',   dot: '#15a34a' },
  'in-progress': { cls: 'wip',   icon: <Clock        size={12} />, label: 'In Progress', dot: '#b7791f' },
  assigned:      { cls: 'muted', icon: <Circle       size={12} />, label: 'Not Started', dot: '#8a909b' },
}

/* ------------------------------------------------------------------ */
/*  Initials avatar helper                                              */
/* ------------------------------------------------------------------ */
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
}

function formatMobile(mobileNo) {
  if (!mobileNo) return null
  const clean = String(mobileNo).trim()
  if (clean.length === 10) return `${clean.slice(0, 5)} ${clean.slice(5)}`
  return clean
}

/* ------------------------------------------------------------------ */
/*  Date helpers & Popover                                              */
/* ------------------------------------------------------------------ */
function getPresetDates(preset) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: toIso(start), to: toIso(end) }
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: toIso(start), to: toIso(end) }
  }
  if (preset === 'last_30_days') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return { from: toIso(start), to: toIso(now) }
  }
  if (preset === 'this_year') {
    const start = new Date(now.getFullYear(), 0, 1)
    const end = new Date(now.getFullYear(), 11, 31)
    return { from: toIso(start), to: toIso(end) }
  }
  return { from: '', to: '' }
}

function DateFilterPopover({
  open,
  onClose,
  fromDate,
  toDate,
  dateType,
  onApply,
  onClear,
}) {
  const [localFrom, setLocalFrom] = useState(fromDate || '')
  const [localTo, setLocalTo] = useState(toDate || '')
  const [localType, setLocalType] = useState(dateType || 'completed')
  const popoverRef = useRef(null)

  useEffect(() => {
    setLocalFrom(fromDate || '')
    setLocalTo(toDate || '')
    setLocalType(dateType || 'completed')
  }, [fromDate, toDate, dateType, open])

  // Prevent background scroll when popover opens as a mobile bottom sheet
  useEffect(() => {
    if (!open) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640
    if (isMobile) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        const triggerBtn = document.getElementById('rpt-date-filter-btn')
        if (triggerBtn && triggerBtn.contains(e.target)) return
        onClose()
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  const activePresetKey = useMemo(() => {
    if (!localFrom || !localTo) return null
    for (const key of ['this_month', 'last_month', 'last_30_days', 'this_year']) {
      const p = getPresetDates(key)
      if (p.from === localFrom && p.to === localTo) return key
    }
    return null
  }, [localFrom, localTo])

  const rangeSummary = useMemo(() => {
    if (!localFrom && !localTo) return null
    const formatD = (str) => {
      if (!str) return '…'
      const parts = str.split('-')
      if (parts.length !== 3) return str
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      if (isNaN(d.getTime())) return str
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    if (localFrom && localTo) {
      if (localFrom > localTo) {
        return { text: 'Start date must be before or equal to end date', isError: true }
      }
      const d1 = new Date(localFrom)
      const d2 = new Date(localTo)
      const diffDays = Math.round(Math.abs((d2 - d1) / (24 * 60 * 60 * 1000))) + 1
      return {
        text: `${formatD(localFrom)} – ${formatD(localTo)} (${diffDays} day${diffDays === 1 ? '' : 's'})`,
        isError: false,
      }
    }
    if (localFrom) return { text: `From ${formatD(localFrom)} onwards`, isError: false }
    return { text: `Up to ${formatD(localTo)}`, isError: false }
  }, [localFrom, localTo])

  if (!open) return null

  const applyPreset = (presetKey) => {
    const { from, to } = getPresetDates(presetKey)
    setLocalFrom(from)
    setLocalTo(to)
  }

  const handleApply = () => {
    if (rangeSummary?.isError) return
    onApply({ fromDate: localFrom, toDate: localTo, dateType: localType })
    onClose()
  }

  const handleClear = () => {
    setLocalFrom('')
    setLocalTo('')
    setLocalType('completed')
    onClear()
    onClose()
  }

  const PRESETS = [
    { key: 'this_month',   label: 'This Month' },
    { key: 'last_month',   label: 'Last Month' },
    { key: 'last_30_days', label: 'Last 30 Days' },
    { key: 'this_year',    label: 'This Year' },
  ]

  const DATE_TYPES = [
    { value: 'completed', label: 'Completion Date', icon: CheckCircle },
    { value: 'started',   label: 'Enrollment Date', icon: Clock },
    { value: 'onboard',   label: 'Onboard Date',    icon: Ship },
  ]

  return (
    <>
      <div
        className="rpt-date-popover-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="rpt-date-popover"
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter by Date"
      >
        <div className="rpt-date-popover-drag-handle" />

        <div className="rpt-date-popover-header">
          <div className="rpt-date-popover-title">
            <span className="rpt-date-title-icon-badge">
              <Calendar size={14} />
            </span>
            <div className="rpt-date-title-col">
              <div className="rpt-date-title-text">Date Filter</div>
              <div className="rpt-date-subtitle-text">Filter reports by activity period</div>
            </div>
          </div>
          <button
            type="button"
            className="rpt-date-popover-close"
            onClick={onClose}
            aria-label="Close date filter"
          >
            <X size={15} />
          </button>
        </div>

        <div className="rpt-date-popover-body">
          {/* Quick presets */}
          <div className="rpt-date-section-label">Quick Presets</div>
          <div className="rpt-date-presets">
            {PRESETS.map((p) => {
              const isSelected = activePresetKey === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`rpt-preset-btn${isSelected ? ' active' : ''}`}
                  onClick={() => applyPreset(p.key)}
                >
                  {isSelected && <span className="rpt-preset-check-dot" />}
                  <span>{p.label}</span>
                </button>
              )
            })}
          </div>

          {/* Date Field Target */}
          <div className="rpt-date-section-label" style={{ marginTop: 14 }}>
            Filter By Date Type
          </div>
          <div className="rpt-date-type-group" role="radiogroup" aria-label="Filter by date type">
            {DATE_TYPES.map((dt) => {
              const isSelected = localType === dt.value
              const Icon = dt.icon
              return (
                <label
                  key={dt.value}
                  className={`rpt-date-type-pill${isSelected ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="rpt-date-type"
                    value={dt.value}
                    checked={isSelected}
                    onChange={() => setLocalType(dt.value)}
                  />
                  <Icon size={13} className="rpt-date-type-icon" />
                  <span className="rpt-date-type-label">{dt.label}</span>
                </label>
              )
            })}
          </div>

          {/* Date Range Inputs */}
          <div className="rpt-date-section-label" style={{ marginTop: 14 }}>
            Custom Range
          </div>
          <div className="rpt-date-inputs">
            <div className="rpt-date-field">
              <label htmlFor="rpt-date-from" className="rpt-date-sublabel">From</label>
              <input
                type="date"
                id="rpt-date-from"
                className="rpt-date-input"
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value)}
              />
            </div>
            <div className="rpt-date-field">
              <label htmlFor="rpt-date-to" className="rpt-date-sublabel">To</label>
              <input
                type="date"
                id="rpt-date-to"
                className="rpt-date-input"
                value={localTo}
                onChange={(e) => setLocalTo(e.target.value)}
              />
            </div>
          </div>

          {/* Range summary preview badge */}
          {rangeSummary && (
            <div className={`rpt-date-summary-badge${rangeSummary.isError ? ' is-error' : ''}`}>
              {rangeSummary.isError ? <AlertCircle size={12} /> : <Clock size={12} />}
              <span>{rangeSummary.text}</span>
            </div>
          )}
        </div>

        <div className="rpt-date-popover-footer">
          <button type="button" className="rpt-date-clear-btn" onClick={handleClear}>
            <RotateCcw size={11} />
            <span>Clear</span>
          </button>
          <button
            type="button"
            className="btn primary sm rpt-date-apply-btn"
            onClick={handleApply}
            disabled={rangeSummary?.isError}
          >
            <Check size={13} />
            <span>Apply Filter</span>
          </button>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function AdminReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  // Extract individual values — these are stable string primitives React can diff correctly
  const paramCrew     = searchParams.get('crew')      || ''
  const paramCourse   = searchParams.get('course')    || 'all'
  const paramStatus   = searchParams.get('status')    || 'all'
  const paramFromDate = searchParams.get('from_date') || ''
  const paramToDate   = searchParams.get('to_date')   || ''
  const paramDateType = searchParams.get('date_type') || 'completed'

  const [data,             setData]            = useState(null)
  const [crewSearch,       setCrewSearch]      = useState(paramCrew)
  const [selectedCourse,   setSelectedCourse]  = useState(paramCourse)
  const [selectedStatus,   setSelectedStatus]  = useState(paramStatus)
  const [fromDate,         setFromDate]        = useState(paramFromDate)
  const [toDate,           setToDate]          = useState(paramToDate)
  const [dateType,         setDateType]        = useState(paramDateType)
  const [datePopoverOpen,  setDatePopoverOpen] = useState(false)
  const [dlXlsx,           setDlXlsx]          = useState(false)
  const [dlCsv,            setDlCsv]           = useState(false)
  const [error,            setError]           = useState(null)
  const [loading,          setLoading]         = useState(true)
  const [page,             setPage]            = useState(1)
  const [approvingCell,    setApprovingCell]   = useState(null) // 'learnerId-courseId'
  const [approveTarget,    setApproveTarget]   = useState(null) // { learnerId, courseId, learnerName, courseName }
  const [hoverRemark,      setHoverRemark]     = useState(null) // { x, y, learnerName, courseName, remark }
  const ROWS_PER_PAGE = 50

  const tableScrollRef = useRef(null)

  /* Seamless wheel scrolling: coordinator smoothly collapses top nav cards and KPI strip
     until the filter header and table card align, then passes scroll down to table rows.
     Scrolling up at row 1 seamlessly restores KPI and nav cards. */
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const onWheel = (e) => {
      const wrapper = el.closest('.cm-wrapper')
      const card = el.closest('.rpt-table-card')
      const header = wrapper?.querySelector('.rpt-header-container')
      if (!wrapper || !card || !header) return

      // Pinned bottom of the filter header inside the viewport:
      const wrapperTop = wrapper.getBoundingClientRect().top
      const targetCardTop = wrapperTop + 56 + header.offsetHeight + 10
      const distanceRemaining = card.getBoundingClientRect().top - targetCardTop

      if (e.deltaY > 0) {
        if (distanceRemaining > 0.5) {
          const step = Math.min(distanceRemaining, e.deltaY)
          wrapper.scrollTop += step
          const remainingDelta = e.deltaY - step
          if (remainingDelta > 0) {
            el.scrollTop += remainingDelta
          }
        } else {
          el.scrollTop += e.deltaY
        }
        e.preventDefault()
      } else if (e.deltaY < 0) {
        if (el.scrollTop > 0) {
          const step = Math.min(el.scrollTop, -e.deltaY)
          el.scrollTop -= step
          const remainingDelta = -e.deltaY - step
          if (remainingDelta > 0 && wrapper.scrollTop > 0) {
            wrapper.scrollTop = Math.max(0, wrapper.scrollTop - remainingDelta)
          }
        } else if (wrapper.scrollTop > 0) {
          wrapper.scrollTop = Math.max(0, wrapper.scrollTop + e.deltaY)
        }
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [loading, data])


  /* Sync filters whenever URL params change — depends on primitive strings, not the object */
  useEffect(() => {
    setCrewSearch(paramCrew)
    setSelectedCourse(paramCourse)
    setSelectedStatus(paramStatus)
    setFromDate(paramFromDate)
    setToDate(paramToDate)
    setDateType(paramDateType)
    setPage(1)
  }, [paramCrew, paramCourse, paramStatus, paramFromDate, paramToDate, paramDateType])

  /* load */
  const load = () => {
    setLoading(true); setError(null)
    adminReport()
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('Failed to load report'); setLoading(false) })
  }
  useEffect(load, [])


  /* ---------- filtering ---------- */
  const filteredRows = useMemo(() => {
    if (!data) return []
    let rows = data.rows

    if (crewSearch.trim()) {
      const q = crewSearch.trim().toLowerCase()
      rows = rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.crewId  || '').toLowerCase().includes(q) ||
        (r.rank    || '').toLowerCase().includes(q) ||
        (r.currentVessel || r.vessel || '').toLowerCase().includes(q) ||
        (r.mobileNo || r.mobileNumber || '').toLowerCase().includes(q)
      )
    }
    if (selectedCourse !== 'all') {
      rows = rows.filter(r => r.cells[selectedCourse])
    }
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'pending') {
        // special filter: pending approval
        if (selectedCourse !== 'all') {
          rows = rows.filter(r => r.cells[selectedCourse]?.pendingApproval)
        } else {
          rows = rows.filter(r => Object.values(r.cells).some(c => c.pendingApproval))
        }
      } else if (selectedCourse !== 'all') {
        rows = rows.filter(r => r.cells[selectedCourse]?.status === selectedStatus)
      } else {
        rows = rows.filter(r => Object.values(r.cells).some(c => c.status === selectedStatus))
      }
    }

    if (fromDate || toDate) {
      const matchDate = (d) => {
        if (!d) return false
        const s = String(d).slice(0, 10)
        if (fromDate && s < fromDate) return false
        if (toDate && s > toDate) return false
        return true
      }

      if (dateType === 'onboard') {
        rows = rows.filter(r => matchDate(r.signOnDate))
      } else {
        rows = rows.filter(r => {
          const targetCells = selectedCourse === 'all'
            ? Object.values(r.cells)
            : [r.cells[selectedCourse]].filter(Boolean)
          return targetCells.some(c => {
            const d = dateType === 'completed' ? c.passedOn : c.startedOn
            return matchDate(d)
          })
        })
      }
    }

    return rows
  }, [data, crewSearch, selectedCourse, selectedStatus, fromDate, toDate, dateType])

  /* visible course columns */
  const visibleCourses = useMemo(() => {
    if (!data) return []
    return selectedCourse === 'all'
      ? data.courses
      : data.courses.filter(c => c.id === selectedCourse)
  }, [data, selectedCourse])

  /* dynamic KPIs */
  const kpis = useMemo(() => {
    let cells = 0, passed = 0, wip = 0, notStarted = 0
    const matchDate = (d) => {
      if (!d) return false
      const s = String(d).slice(0, 10)
      if (fromDate && s < fromDate) return false
      if (toDate && s > toDate) return false
      return true
    }

    filteredRows.forEach(r => {
      const subset = selectedCourse === 'all'
        ? Object.values(r.cells)
        : [r.cells[selectedCourse]].filter(Boolean)
      subset.forEach(c => {
        if (fromDate || toDate) {
          if (dateType === 'completed' && !matchDate(c.passedOn)) return
          if (dateType === 'started' && !matchDate(c.startedOn)) return
        }
        cells++
        if      (c.status === 'passed')      passed++
        else if (c.status === 'in-progress') wip++
        else                                 notStarted++
      })
    })
    return {
      crew:       filteredRows.length,
      passed,
      wip,
      notStarted,
      passRate:   cells > 0 ? Math.round(passed / cells * 100) : 0,
    }
  }, [filteredRows, selectedCourse, fromDate, toDate, dateType])

  const courseOptions = useMemo(() => {
    const opts = [
      {
        value: 'all',
        label: 'All Courses',
        description: data?.courses?.length ? `${data.courses.length} courses in syllabus` : 'All training courses in fleet syllabus',
        icon: Layers,
      }
    ]
    if (data?.courses) {
      data.courses.forEach(c => {
        opts.push({
          value: c.id,
          label: c.title,
          description: c.subtitle || (c.code ? `Course Code: ${c.code}` : 'Training Module'),
          icon: BookOpen,
        })
      })
    }
    return opts
  }, [data?.courses])

  const statusOptions = useMemo(() => [
    {
      value: 'all',
      label: 'All Statuses',
      description: 'Show all completion states across fleet',
      icon: Layers,
    },
    {
      value: 'passed',
      label: 'Completed',
      description: 'Assessment passed & certificate ready',
      icon: CheckCircle,
    },
    {
      value: 'pending',
      label: 'Pending Approval',
      description: 'Awaiting administrator certificate approval',
      icon: Clock,
    },
    {
      value: 'in-progress',
      label: 'In Progress',
      description: 'Learner is currently taking the course',
      icon: RefreshCw,
    },
    {
      value: 'assigned',
      label: 'Not Started',
      description: 'Enrolled in syllabus but not yet started',
      icon: Circle,
    },
  ], [])

  const hasDateFilter = Boolean(fromDate || toDate)
  const hasFilters = Boolean(
    crewSearch ||
    selectedCourse !== 'all' ||
    selectedStatus !== 'all' ||
    hasDateFilter
  )

  const dateButtonLabel = useMemo(() => {
    if (!fromDate && !toDate) return 'Date Filter'
    const typeShort = dateType === 'completed' ? 'Done' : (dateType === 'started' ? 'Start' : 'Joined')
    if (fromDate && toDate) {
      if (fromDate.slice(0, 7) === toDate.slice(0, 7) && fromDate.endsWith('-01') && (toDate.endsWith('-30') || toDate.endsWith('-31') || toDate.endsWith('-28') || toDate.endsWith('-29'))) {
        const d = new Date(fromDate)
        return `${typeShort}: ${d.toLocaleString('default', { month: 'short', year: 'numeric' })}`
      }
      return `${typeShort}: ${fromDate} → ${toDate}`
    }
    if (fromDate) return `${typeShort} ≥ ${fromDate}`
    return `${typeShort} ≤ ${toDate}`
  }, [fromDate, toDate, dateType])

  const clearAll = () => {
    setCrewSearch('')
    setSelectedCourse('all')
    setSelectedStatus('all')
    setFromDate('')
    setToDate('')
    setDateType('completed')
    setPage(1)
    if (searchParams.toString()) {
      navigate('/admin/course-management/report', { replace: true })
    }
  }

  /* Reset page to 1 on filter change */
  useEffect(() => { setPage(1) }, [crewSearch, selectedCourse, selectedStatus, fromDate, toDate, dateType])

  /* Pagination logic */
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredRows.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRows, page])

  const getPageNumbers = () => {
    const maxVisible = 5;
    const pages = [];
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  /* ---------- downloads ---------- */
  const downloadXlsx = async () => {
    setDlXlsx(true); setError(null)
    try {
      await adminDownloadReportXlsx({
        crewSearch:  crewSearch.trim()         || undefined,
        courseId:    selectedCourse !== 'all' ? selectedCourse : undefined,
        status:      selectedStatus !== 'all' ? selectedStatus : undefined,
        fromDate:    fromDate                 || undefined,
        toDate:      toDate                   || undefined,
        dateType:    dateType                 || undefined,
      })
    } catch (e) { setError(e.message) }
    finally { setDlXlsx(false) }
  }

  const downloadCsv = async () => {
    setDlCsv(true); setError(null)
    try {
      await adminDownloadReportCsv({
        crewSearch:  crewSearch.trim()         || undefined,
        courseId:    selectedCourse !== 'all' ? selectedCourse : undefined,
        status:      selectedStatus !== 'all' ? selectedStatus : undefined,
        fromDate:    fromDate                 || undefined,
        toDate:      toDate                   || undefined,
        dateType:    dateType                 || undefined,
      })
    } catch (e) { setError(e.message) }
    finally { setDlCsv(false) }
  }

  /* ---------- loading / error state ---------- */
  if (loading) return <div className="spinner">Loading report…</div>

  if (!data) {
    return (
      <div className="rpt-error-state">
        <AlertCircle size={36} />
        <p>{error || 'Could not load report'}</p>
        <button className="btn primary" onClick={load}><RefreshCw size={14} /> Retry</button>
      </div>
    )
  }

  return (
    <div className="rpt-root">


      {/* ═══════════════════════ PAGE HEADER & FILTERS (Single Unified Row down to 1200px) ═══════════════════════ */}
      <div className={`rpt-header-container${datePopoverOpen ? ' rpt-header--popover-open' : ''}`}>
        <div className="rpt-header">
          {/* Left: Brand Identity */}
          <div className="rpt-header-brand">
            <div className="rpt-header-accent-bar" />
            <div className="rpt-header-icon">
              <BarChart3 size={17} />
            </div>
            <div className="rpt-header-title-wrap">
              <div className="rpt-header-eyebrow">Fleet Training · Compliance</div>
              <div className="rpt-header-title-row">
                <h1 className="rpt-header-title">Completion Report</h1>
                <div className="rpt-header-stat-pill">
                  <span className="rpt-header-stat-count">{filteredRows.length}</span>
                  <span className="rpt-header-stat-label">
                    {hasFilters ? 'Filtered' : 'Seafarers'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: All Filters & Actions in One Single Row */}
          <div className="rpt-header-controls">
            {/* Seafarer Search Input */}
            <div className="rpt-search-wrap">
              <Search size={13} className="rpt-search-icon" />
              <input
                id="rpt-search-input"
                type="text"
                className="rpt-search-input"
                placeholder="Search seafarers..."
                value={crewSearch}
                onChange={e => setCrewSearch(e.target.value)}
              />
              {crewSearch && (
                <button
                  type="button"
                  className="rpt-search-clear"
                  onClick={() => setCrewSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Course Filter Dropdown with CardSelect */}
            <div className="rpt-select-wrap rpt-select-course">
              <CardSelect
                id="rpt-course-filter"
                value={selectedCourse}
                onChange={setSelectedCourse}
                options={courseOptions}
                placeholder="All Courses"
                searchable={true}
                placement="bottom"
                className="rpt-cardselect rpt-cardselect--course"
              />
            </div>

            {/* Status Filter Dropdown with CardSelect */}
            <div className="rpt-select-wrap rpt-select-status">
              <CardSelect
                id="rpt-status-filter"
                value={selectedStatus}
                onChange={setSelectedStatus}
                options={statusOptions}
                placeholder="All Statuses"
                placement="bottom"
                className="rpt-cardselect rpt-cardselect--status"
              />
            </div>

            {/* Date Filter Trigger Button with Popover */}
            <div className="rpt-date-filter-wrap">
              <button
                type="button"
                id="rpt-date-filter-btn"
                className={`rpt-date-filter-btn${hasDateFilter ? ' active' : ''}`}
                onClick={() => setDatePopoverOpen(o => !o)}
                title="Filter by completion or onboard date"
              >
                <Calendar size={13} className="rpt-date-icon" />
                <span className="rpt-date-label">{dateButtonLabel}</span>
                {hasDateFilter ? (
                  <span
                    className="rpt-date-clear-pill"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFromDate('')
                      setToDate('')
                    }}
                    title="Clear date filter"
                  >
                    <X size={11} />
                  </span>
                ) : (
                  <ChevronDown size={12} className="rpt-date-arrow" />
                )}
              </button>

              <DateFilterPopover
                open={datePopoverOpen}
                onClose={() => setDatePopoverOpen(false)}
                fromDate={fromDate}
                toDate={toDate}
                dateType={dateType}
                onApply={({ fromDate: f, toDate: t, dateType: dt }) => {
                  setFromDate(f)
                  setToDate(t)
                  setDateType(dt)
                }}
                onClear={() => {
                  setFromDate('')
                  setToDate('')
                  setDateType('completed')
                }}
              />
            </div>

            {/* Reset Filters Pill (when active) */}
            {hasFilters && (
              <button
                type="button"
                className="rpt-reset-pill-btn"
                onClick={clearAll}
                title="Reset all filters"
                id="rpt-reset-filters-btn"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}

            {/* Export & Refresh Action Group */}
            <div className="rpt-download-group">
              <button
                type="button"
                className="btn primary sm rpt-btn-export rpt-btn-export--xlsx"
                onClick={downloadXlsx}
                disabled={dlXlsx}
                id="rpt-download-xlsx-btn"
                title="Export report to Microsoft Excel (.xlsx)"
              >
                <FileSpreadsheet size={13} />
                <span>{dlXlsx ? 'Preparing…' : hasFilters ? 'Excel (Filtered)' : 'Excel'}</span>
              </button>

              <button
                type="button"
                className="btn sm rpt-btn-export rpt-btn-export--csv"
                onClick={downloadCsv}
                disabled={dlCsv}
                id="rpt-download-csv-btn"
                title="Export complete report to CSV"
              >
                <FileText size={13} />
                <span>{dlCsv ? '…' : 'CSV'}</span>
              </button>

              <button
                type="button"
                className={`btn sm rpt-btn-refresh${loading ? ' rpt-btn-refresh--spinning' : ''}`}
                onClick={load}
                id="rpt-refresh-btn"
                title="Refresh report data"
                aria-label="Refresh report data"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Chips Strip (slim bar below header, only when filters active) */}
        {hasFilters && (
          <div className="rpt-active-chips-strip">
            <span className="rpt-active-chips-lead">Active filters:</span>
            {crewSearch && (
              <span className="rpt-chip" id="chip-crew-search">
                <Search size={11} className="rpt-chip-icon" />
                <span className="rpt-chip-text">"{crewSearch}"</span>
                <button
                  type="button"
                  className="rpt-chip-remove"
                  onClick={() => setCrewSearch('')}
                  title="Remove search query"
                  aria-label="Remove search query"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedCourse !== 'all' && (
              <span className="rpt-chip" id="chip-course">
                <BookOpen size={11} className="rpt-chip-icon" />
                <span className="rpt-chip-text">
                  Course: {data?.courses?.find(c => c.id === selectedCourse)?.title || selectedCourse}
                </span>
                <button
                  type="button"
                  className="rpt-chip-remove"
                  onClick={() => setSelectedCourse('all')}
                  title="Remove course filter"
                  aria-label="Remove course filter"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedStatus !== 'all' && (
              <span className="rpt-chip" id="chip-status">
                <Award size={11} className="rpt-chip-icon" />
                <span className="rpt-chip-text">
                  Status: {statusOptions.find(s => s.value === selectedStatus)?.label || selectedStatus}
                </span>
                <button
                  type="button"
                  className="rpt-chip-remove"
                  onClick={() => setSelectedStatus('all')}
                  title="Remove status filter"
                  aria-label="Remove status filter"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            {hasDateFilter && (
              <span className="rpt-chip" id="chip-date">
                <Calendar size={11} className="rpt-chip-icon" />
                <span className="rpt-chip-text">
                  {dateButtonLabel}
                </span>
                <button
                  type="button"
                  className="rpt-chip-remove"
                  onClick={() => { setFromDate(''); setToDate('') }}
                  title="Remove date filter"
                  aria-label="Remove date filter"
                >
                  <X size={11} />
                </button>
              </span>
            )}
            <button
              type="button"
              className="rpt-chip-clear-all"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="report-error"><AlertCircle size={14} /> {error}</div>
      )}

      {/* ═══════════════════════ KPI STRIP ════════════════════════════ */}
      <div className="rpt-kpi-strip">
        <KpiCard icon={<Users size={16} />} value={kpis.crew}       label="Seafarers Shown"  color="accent" />
        <KpiCard icon={<CheckCircle size={16} />} value={kpis.passed}    label="Completed"      color="success" />
        <KpiCard icon={<Clock size={16} />}  value={kpis.wip}        label="In Progress" color="warn" />
        <KpiCard icon={<Circle size={16} />} value={kpis.notStarted} label="Not Started" color="faint" />
        <KpiCard icon={<TrendingUp size={16} />} value={`${kpis.passRate}%`} label="Pass Rate" color="accent" highlight />
      </div>

      {/* ═══════════════════════ TABLE ════════════════════════════════ */}
      <div className="rpt-table-card">
        {filteredRows.length === 0 ? (
          <div className="rpt-empty">
            <Search size={40} className="rpt-empty-icon" />
            <div className="rpt-empty-title">No results found</div>
            <div className="rpt-empty-sub">Try adjusting the filters above</div>
            {hasFilters && (
              <button className="btn sm" style={{ marginTop: 14 }} onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="rpt-table-scroll" ref={tableScrollRef}>
            <table className="rpt-table">
              <thead>
                <tr>
                  <th className="rpt-col-sino">SI No.</th>
                  <th className="rpt-col-crew">Seafarer</th>
                  <th className="rpt-col-id">Seafarer ID</th>
                  <th className="rpt-col-rank">Rank</th>
                  {visibleCourses.map(c => (
                    <th key={c.id} className="rpt-col-course">{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row, idx) => (
                  <tr key={row.learnerId} className={`rpt-row${row.isActive ? '' : ' rpt-row--inactive'}`}>
                    <td className="rpt-col-sino" style={{ textAlign: 'center', color: 'var(--text-mut)', fontWeight: 500 }}>
                      {((page - 1) * ROWS_PER_PAGE) + idx + 1}
                    </td>

                    {/* crew name + avatar + mobile phone badge */}
                    <td className="rpt-col-crew">
                      <div className="rpt-crew">
                        <div className="rpt-av">{initials(row.name)}</div>
                        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <div className="rpt-crew-name">{row.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                            {!row.isActive && <div className="rpt-crew-tag">Inactive</div>}
                            {(row.mobileNo || row.mobileNumber) && (
                              <a
                                href={`tel:${String(row.mobileNo || row.mobileNumber).replace(/[^\d+]/g, '')}`}
                                title={`Call ${formatMobile(row.mobileNo || row.mobileNumber)}`}
                                onClick={e => e.stopPropagation()}
                                className="rpt-phone-badge"
                              >
                                <Phone size={10} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                                <span>{formatMobile(row.mobileNo || row.mobileNumber)}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="mono rpt-mono-cell rpt-col-id">{row.crewId || '—'}</td>
                    <td className="rpt-rank-cell rpt-col-rank">{row.rank || <span className="mut">—</span>}</td>

                    {/* per-course status cells */}
                    {visibleCourses.map(c => {
                      const cell = row.cells[c.id]
                      if (!cell) return <td key={c.id} className="rpt-cell-na rpt-col-course">—</td>
                      const cfg = S[cell.status] || S.assigned
                      const pct  = cell.completionPct      ?? 0
                      const done = cell.completedChapters  ?? 0
                      const tot  = cell.totalChapters       ?? 0
                      return (
                        <td key={c.id} className="rpt-cell rpt-col-course">
                          <div className="rpt-cell-inner">
                            <span className={`rpt-badge rpt-badge--${cell.status}`}>
                              <span className="rpt-badge-dot" style={{ background: cfg.dot }} />
                              {cfg.label}
                            </span>
                            {cell.status === 'passed' && cell.pendingApproval && (
                              <div className="rpt-pending-block">
                                <span className="rpt-pending-date">
                                  Completed {cell.passedOn}
                                </span>
                                {isSuperAdmin ? (
                                  <button
                                    className="rpt-approve-btn"
                                    disabled={approvingCell === `${row.learnerId}-${c.id}`}
                                    onClick={e => {
                                      e.stopPropagation()
                                      setApproveTarget({
                                        learnerId: row.learnerId, courseId: c.id,
                                        learnerName: row.name, courseName: c.title,
                                      })
                                    }}
                                  >
                                    ✓ Approve
                                  </button>
                                ) : (
                                  <span className="rpt-pending-date" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Lock size={10} /> Awaiting Super Admin
                                  </span>
                                )}
                              </div>
                            )}
                            {cell.status === 'passed' && !cell.pendingApproval && cell.passedOn && (
                              <>
                                <div className="rpt-cert-row">
                                  <span className="rpt-cert-date">
                                    {cell.score != null ? <>{cell.score}% · </> : null}{cell.passedOn}
                                  </span>
                                  <a
                                    href={`/api/admin/users/${row.learnerId}/courses/${c.id}/certificate.pdf?token=${getToken()}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="View certificate"
                                    onClick={e => e.stopPropagation()}
                                    className="rpt-cert-btn"
                                  >
                                    <Eye size={11} />
                                  </a>
                                </div>
                                {cell.approvalRemark && (
                                  <span
                                    onMouseEnter={e => {
                                      const r = e.currentTarget.getBoundingClientRect()
                                      setHoverRemark({
                                        x: r.left + r.width / 2, y: r.top,
                                        learnerName: row.name, courseName: c.title,
                                        remark: cell.approvalRemark,
                                      })
                                    }}
                                    onMouseLeave={() => setHoverRemark(null)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      marginTop: 4, fontSize: 11, color: 'var(--accent)',
                                      cursor: 'default', fontWeight: 600,
                                    }}
                                  >
                                    <MessageSquare size={11} />
                                    View remark
                                  </span>
                                )}
                              </>
                            )}
                            {/* Chapter completion mini-bar — shown only for in-progress */}
                            {cell.status === 'in-progress' && (
                              <div className="rpt-ch-bar-wrap">
                                <div className="rpt-ch-bar-track">
                                  <div
                                    className={`rpt-ch-bar-fill rpt-ch-bar-fill--${cell.status}`}
                                    style={{ width: `${Math.min(100, pct)}%` }}
                                  />
                                </div>
                              <span className="rpt-ch-bar-label">
                                {done}/{tot} chapters · {pct}%
                              </span>
                            </div>
                          )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination UI */}
        {filteredRows.length > 0 && (
          <div className="rpt-pagination">
            <div className="rpt-page-info">
              Showing <strong>{(page - 1) * ROWS_PER_PAGE + 1}</strong> to <strong>{Math.min(page * ROWS_PER_PAGE, filteredRows.length)}</strong> of <strong>{filteredRows.length}</strong> entries
            </div>
            <div className="rpt-page-controls">
              <button className="rpt-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </button>
              <div className="rpt-page-nums">
                {getPageNumbers().map((p, idx) => (
                  <button 
                    key={idx} 
                    className={`rpt-page-num ${p === page ? 'active' : ''} ${p === '...' ? 'dots' : ''}`} 
                    onClick={() => p !== '...' && setPage(p)}
                    disabled={p === '...'}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button className="rpt-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {approveTarget && (
        <ApproveModal
          learnerName={approveTarget.learnerName}
          courseName={approveTarget.courseName}
          busy={approvingCell === `${approveTarget.learnerId}-${approveTarget.courseId}`}
          onCancel={() => setApproveTarget(null)}
          onConfirm={async (remark) => {
            const key = `${approveTarget.learnerId}-${approveTarget.courseId}`
            setApprovingCell(key)
            try {
              await adminApproveCertificate(approveTarget.learnerId, approveTarget.courseId, remark)
              setApproveTarget(null)
              load()
            } catch (err) {
              alert(err.message)
            } finally {
              setApprovingCell(null)
            }
          }}
        />
      )}

      {hoverRemark && (
        <RemarkTooltip
          anchor={{ x: hoverRemark.x, y: hoverRemark.y }}
          learnerName={hoverRemark.learnerName}
          courseName={hoverRemark.courseName}
          remark={hoverRemark.remark}
        />
      )}

    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  KPI card sub-component                                              */
/* ------------------------------------------------------------------ */
function KpiCard({ icon, value, label, color, highlight }) {
  const bg = {
    accent:  ['rgba(18,60,58,0.08)',  '#123C3A'],
    success: ['rgba(15,118,110,0.08)', '#0F766E'],
    warn:    ['rgba(249,115,22,0.1)',   '#F97316'],
    faint:   ['rgba(71,85,105,0.08)',   '#475569'],
  }[color] || ['rgba(71,85,105,0.08)', '#475569']

  const borderColors = {
    accent: '#123C3A',
    success: '#0F766E',
    warn: '#F97316',
    faint: '#475569'
  }
  const borderColor = borderColors[color] || '#9ca3af'

  return (
    <div className={`rpt-kpi${highlight ? ' rpt-kpi--highlight' : ''}`} style={{ borderLeft: `4px solid ${borderColor}`, overflow: 'hidden' }}>
      <div className="rpt-kpi-icon" style={{ background: bg[0], color: bg[1] }}>
        {icon}
      </div>
      <div>
        <div className="rpt-kpi-value" style={{ fontSize: '24px', fontWeight: 700, ...(highlight ? { color: '#123C3A' } : {}) }}>
          {value}
        </div>
        <div className="rpt-kpi-label">{label}</div>
      </div>
    </div>
  )
}
