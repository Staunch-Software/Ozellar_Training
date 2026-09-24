import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  Award, Clock, Circle, FileSpreadsheet, FileText,
  Users, CheckCircle, AlertCircle, Search, X, SlidersHorizontal,
  TrendingUp, Download, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Eye, BarChart3,
  MessageSquare, Lock
} from 'lucide-react'
import { adminReport, adminDownloadReportCsv, adminDownloadReportXlsx, adminApproveCertificate } from '../../api.js'
import { getToken } from '../../api.js'
import { useAuth } from '../../auth.jsx'

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

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function AdminReport() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'super_admin'

  // Extract individual values — these are stable string primitives React can diff correctly
  const paramCrew   = searchParams.get('crew')   || ''
  const paramCourse = searchParams.get('course') || 'all'
  const paramStatus = searchParams.get('status') || 'all'

  const [data,           setData]          = useState(null)
  const [crewSearch,     setCrewSearch]    = useState(paramCrew)
  const [selectedCourse, setSelectedCourse]= useState(paramCourse)
  const [selectedStatus, setSelectedStatus]= useState(paramStatus)
  const [dlXlsx,         setDlXlsx]        = useState(false)
  const [dlCsv,          setDlCsv]         = useState(false)
  const [error,          setError]         = useState(null)
  const [loading,        setLoading]       = useState(true)
  const [page,           setPage]          = useState(1)
  const [approvingCell,  setApprovingCell] = useState(null) // 'learnerId-courseId'
  const [approveTarget,  setApproveTarget] = useState(null) // { learnerId, courseId, learnerName, courseName }
  const [hoverRemark,    setHoverRemark]   = useState(null) // { x, y, learnerName, courseName, remark }
  const ROWS_PER_PAGE = 50

  /* Sync filters whenever URL params change — depends on primitive strings, not the object */
  useEffect(() => {
    setCrewSearch(paramCrew)
    setSelectedCourse(paramCourse)
    setSelectedStatus(paramStatus)
    setPage(1)
  }, [paramCrew, paramCourse, paramStatus])

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
        r.name.toLowerCase().includes(q) ||
        (r.crewId  || '').toLowerCase().includes(q) ||
        (r.rank    || '').toLowerCase().includes(q)
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
    return rows
  }, [data, crewSearch, selectedCourse, selectedStatus])

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
    filteredRows.forEach(r => {
      const subset = selectedCourse === 'all'
        ? Object.values(r.cells)
        : [r.cells[selectedCourse]].filter(Boolean)
      subset.forEach(c => {
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
  }, [filteredRows, selectedCourse])

  const hasFilters = crewSearch || selectedCourse !== 'all' || selectedStatus !== 'all'
  const clearAll   = () => {
    setCrewSearch('')
    setSelectedCourse('all')
    setSelectedStatus('all')
    setPage(1)
    if (searchParams.toString()) {
      navigate('/admin/course-management/report', { replace: true })
    }
  }

  /* Reset page to 1 on filter change */
  useEffect(() => { setPage(1) }, [crewSearch, selectedCourse, selectedStatus])

  /* Pagination logic */
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredRows.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRows, page])

  // Keep at least 5 rows visible: measure the real height of the first 5 rows
  // (they get taller when a cell has a progress bar) + header + pagination and
  // use it as the card's minimum height. The page scrolls on short screens
  // instead of squeezing the table.
  const tableCardRef = useRef(null)
  const [minCardH, setMinCardH] = useState(0)
  useLayoutEffect(() => {
    const card = tableCardRef.current
    const table = card?.querySelector('.rpt-table')
    if (!table) { setMinCardH(0); return }
    const head = table.querySelector('thead')?.getBoundingClientRect().height || 0
    const rowsH = [...table.querySelectorAll('tbody tr')].slice(0, 5)
      .reduce((sum, r) => sum + r.getBoundingClientRect().height, 0)
    const pager = card.querySelector('.rpt-pagination')?.getBoundingClientRect().height || 0
    setMinCardH(Math.ceil(head + rowsH + pager) + 4)   // +4: card borders / sub-pixel rounding
  }, [paginatedRows, visibleCourses])

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
        crewSearch:  crewSearch.trim()     || undefined,
        courseId:    selectedCourse !== 'all' ? selectedCourse  : undefined,
        status:      selectedStatus !== 'all' ? selectedStatus  : undefined,
      })
    } catch (e) { setError(e.message) }
    finally { setDlXlsx(false) }
  }

  const downloadCsv = async () => {
    setDlCsv(true); setError(null)
    try { await adminDownloadReportCsv() }
    catch (e) { setError(e.message) }
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
    <div className="rpt-root" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ═══════════════════════ PAGE HEADER (Premium Inline) ═══════════════════════ */}
            <div className="rpt-header">
        <div className="rpt-header-brand">
          {/* Accent Bar */}
          <div style={{
            width: 4,
            height: 36,
            background: 'linear-gradient(180deg, #059669, #10b981)',
            borderRadius: '0 4px 4px 0',
            flexShrink: 0
          }} />
          
          {/* Icon Box */}
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(5,150,105,0.1)',
            color: '#059669',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0
          }}>
            <BarChart3 size={18} />
          </div>

          {/* Title only */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#059669', opacity: 0.8 }}>Fleet Training · Compliance</span>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: '1px' }}>Completion Report</div>
          </div>
        </div>

        {/* Right side controls */}
                {/* Right side controls */}
        <div className="rpt-header-actions">
          <div className="rpt-filter-row" style={{ gap: 8 }}>
            {/* crew search */}
            <div className="rpt-search-wrap" style={{ minWidth: 200 }}>
              <Search size={14} className="rpt-field-icon" />
              <input
                className="rpt-field"
                placeholder="Search crew..."
                value={crewSearch}
                onChange={e => setCrewSearch(e.target.value)}
                style={{ padding: '6px 8px 6px 32px' }}
              />
              {crewSearch && (
                <button className="rpt-x-btn" onClick={() => setCrewSearch('')}>
                  <X size={12} />
                </button>
              )}
            </div>

            {/* course filter */}
            <div className="rpt-select-wrap">
              <SlidersHorizontal size={13} className="rpt-field-icon" />
              <select className="rpt-field rpt-select" value={selectedCourse}
                onChange={e => setSelectedCourse(e.target.value)}
                style={{ padding: '6px 24px 6px 30px' }}>
                <option value="all">All Courses</option>
                {data.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <ChevronDown size={13} className="rpt-select-caret" />
            </div>

            {/* status filter */}
            <div className="rpt-select-wrap">
              <Award size={13} className="rpt-field-icon" />
              <select className="rpt-field rpt-select" value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                style={{ padding: '6px 24px 6px 30px' }}>
                <option value="all">All Statuses</option>
                <option value="passed">✓ Completed</option>
                <option value="pending">⏳ Pending Approval</option>
                <option value="in-progress">↻ In Progress</option>
                <option value="assigned">○ Not Started</option>
              </select>
              <ChevronDown size={13} className="rpt-select-caret" />
            </div>

            {hasFilters && (
              <button className="btn sm rpt-clear-all" onClick={clearAll} style={{ padding: '6px 10px' }}>
                <X size={12} /> Clear
              </button>
            )}
          </div>

                    <div className="rpt-download-group">
            <button className="btn primary sm" onClick={downloadXlsx} disabled={dlXlsx}>
              <FileSpreadsheet size={14} />
              {dlXlsx ? 'Preparing…' : hasFilters ? 'Excel (Filtered)' : 'Excel'}
            </button>
            <button className="btn sm" onClick={load} title="Refresh report" style={{ padding: '6px 10px' }}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="report-error"><AlertCircle size={14} /> {error}</div>
      )}

      {/* ═══════════════════════ KPI STRIP ════════════════════════════ */}
      <div className="rpt-kpi-strip">
        <KpiCard icon={<Users size={16} />} value={kpis.crew}       label="Crew Shown"  color="accent" />
        <KpiCard icon={<CheckCircle size={16} />} value={kpis.passed}    label="Completed"      color="success" />
        <KpiCard icon={<Clock size={16} />}  value={kpis.wip}        label="In Progress" color="warn" />
        <KpiCard icon={<Circle size={16} />} value={kpis.notStarted} label="Not Started" color="faint" />
        <KpiCard icon={<TrendingUp size={16} />} value={`${kpis.passRate}%`} label="Pass Rate" color="accent" highlight />
      </div>

      {/* ═══════════════════════ TABLE ════════════════════════════════ */}
      <div className="rpt-table-card" ref={tableCardRef}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: minCardH }}>
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
          <div className="rpt-table-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            <table className="rpt-table">
              <thead>
                <tr>
                  <th className="rpt-col-sino">SI No.</th>
                  <th className="rpt-col-crew">Crew Member</th>
                  <th className="rpt-col-id">Crew ID</th>
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

                    {/* crew name + avatar */}
                    <td className="rpt-col-crew">
                      <div className="rpt-crew">
                        <div className="rpt-av">{initials(row.name)}</div>
                        <div>
                          <div className="rpt-crew-name">{row.name}</div>
                          {!row.isActive && <div className="rpt-crew-tag">Inactive</div>}
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
                <ChevronLeft size={16} />
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
                <ChevronRight size={16} />
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
    accent:  ['var(--accent-weak)',  'var(--accent)'],
    success: ['var(--success-weak)', 'var(--success)'],
    warn:    ['var(--warn-weak)',     'var(--warn)'],
    faint:   ['var(--surface-3)',    'var(--text-faint)'],
  }[color] || ['var(--surface-3)', 'var(--text-mut)']

  const borderColors = {
    accent: '#6366f1',
    success: '#10b981',
    warn: '#f59e0b',
    faint: '#9ca3af'
  }
  const borderColor = borderColors[color] || '#9ca3af'

  return (
    <div className={`rpt-kpi${highlight ? ' rpt-kpi--highlight' : ''}`} style={{ borderLeft: `4px solid ${borderColor}`, overflow: 'hidden' }}>
      <div className="rpt-kpi-icon" style={{ background: bg[0], color: bg[1] }}>
        {icon}
      </div>
      <div>
        <div className="rpt-kpi-value" style={{ fontSize: '24px', fontWeight: 700, ...(highlight ? { color: 'var(--accent)' } : {}) }}>
          {value}
        </div>
        <div className="rpt-kpi-label">{label}</div>
      </div>
    </div>
  )
}
