import { useEffect, useState, useMemo } from 'react'
import {
  Award, Clock, Circle, FileSpreadsheet, FileText,
  Users, CheckCircle, AlertCircle, Search, X, SlidersHorizontal,
  TrendingUp, Download, RefreshCw, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react'
import { adminReport, adminDownloadReportCsv, adminDownloadReportXlsx } from '../../api.js'

/* ------------------------------------------------------------------ */
/*  Status config                                                       */
/* ------------------------------------------------------------------ */
const S = {
  passed:        { cls: 'ok',    icon: <CheckCircle size={12} />, label: 'Passed',      dot: '#15a34a' },
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
  const [data,           setData]          = useState(null)
  const [crewSearch,     setCrewSearch]    = useState('')
  const [selectedCourse, setSelectedCourse]= useState('all')
  const [selectedStatus, setSelectedStatus]= useState('all')
  const [dlXlsx,         setDlXlsx]        = useState(false)
  const [error,          setError]         = useState(null)
  const [loading,        setLoading]       = useState(true)
  const [page,           setPage]          = useState(1)
  const ROWS_PER_PAGE = 10

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
      if (selectedCourse !== 'all') {
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
  const clearAll   = () => { setCrewSearch(''); setSelectedCourse('all'); setSelectedStatus('all'); setPage(1) }

  /* Reset page to 1 on filter change */
  useEffect(() => { setPage(1) }, [crewSearch, selectedCourse, selectedStatus])

  /* Pagination logic */
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE)
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredRows.slice(start, start + ROWS_PER_PAGE)
  }, [filteredRows, page])

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

      {/* ═══════════════════════ PAGE HEADER (standard admin style) ═══════════════════════ */}
      <div className="admin-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow">Fleet Training · Compliance</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 0' }}>Completion Report</h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            {data.rows.length} crew members · {data.courses.length} courses
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn primary" onClick={downloadXlsx} disabled={dlXlsx}>
            <FileSpreadsheet size={14} />
            {dlXlsx ? 'Preparing…' : hasFilters ? 'Download Filtered Excel' : 'Download Excel'}
          </button>
          <button className="btn" onClick={load} title="Refresh report" style={{ padding: '9px 11px' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="report-error"><AlertCircle size={14} /> {error}</div>
      )}

      {/* ═══════════════════════ FILTER BAR ═══════════════════════════ */}
      <div className="rpt-filter-card">
        <div className="rpt-filter-row">

          {/* crew search */}
          <div className="rpt-search-wrap">
            <Search size={14} className="rpt-field-icon" />
            <input
              className="rpt-field"
              placeholder="Search crew name, ID or rank…"
              value={crewSearch}
              onChange={e => setCrewSearch(e.target.value)}
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
              onChange={e => setSelectedCourse(e.target.value)}>
              <option value="all">All Courses</option>
              {data.courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <ChevronDown size={13} className="rpt-select-caret" />
          </div>

          {/* status filter */}
          <div className="rpt-select-wrap">
            <Award size={13} className="rpt-field-icon" />
            <select className="rpt-field rpt-select" value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="passed">✓ Passed</option>
              <option value="in-progress">↻ In Progress</option>
              <option value="assigned">○ Not Started</option>
            </select>
            <ChevronDown size={13} className="rpt-select-caret" />
          </div>

          {hasFilters && (
            <button className="btn sm rpt-clear-all" onClick={clearAll}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* active filter chips */}
        {hasFilters && (
          <div className="rpt-chips">
            {crewSearch && (
              <span className="rpt-chip">
                "{crewSearch}"
                <button onClick={() => setCrewSearch('')}><X size={10} /></button>
              </span>
            )}
            {selectedCourse !== 'all' && (
              <span className="rpt-chip">
                {data.courses.find(c => c.id === selectedCourse)?.title}
                <button onClick={() => setSelectedCourse('all')}><X size={10} /></button>
              </span>
            )}
            {selectedStatus !== 'all' && (
              <span className="rpt-chip">
                {S[selectedStatus]?.label}
                <button onClick={() => setSelectedStatus('all')}><X size={10} /></button>
              </span>
            )}
            <span className="rpt-result-count">
              {filteredRows.length} of {data.rows.length} crew
            </span>
          </div>
        )}
      </div>

      {/* ═══════════════════════ KPI STRIP ════════════════════════════ */}
      <div className="rpt-kpi-strip">
        <KpiCard icon={<Users size={16} />} value={kpis.crew}       label="Crew Shown"  color="accent" />
        <KpiCard icon={<CheckCircle size={16} />} value={kpis.passed}    label="Passed"      color="success" />
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
          <div className="rpt-table-scroll">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th className="rpt-col-crew">Crew Member</th>
                  <th className="rpt-col-id">Crew ID</th>
                  <th className="rpt-col-rank">Rank</th>
                  {visibleCourses.map(c => (
                    <th key={c.id} className="rpt-col-course">{c.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map(row => (
                  <tr key={row.learnerId} className={`rpt-row${row.isActive ? '' : ' rpt-row--inactive'}`}>

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
                      return (
                        <td key={c.id} className="rpt-cell rpt-col-course">
                          <span className={`rpt-badge rpt-badge--${cell.status}`}>
                            <span className="rpt-badge-dot" style={{ background: cfg.dot }} />
                            {cfg.label}
                          </span>
                          {cell.status === 'passed' && (
                            <div className="rpt-cell-meta">
                              {cell.score}% &middot; {cell.passedOn}
                            </div>
                          )}
                          {cell.status === 'in-progress' && (
                            <div className="rpt-cell-meta">In progress</div>
                          )}
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} className={`rpt-page-num ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>
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

      {/* ═══════════════════════ FOOTER ═══════════════════════════════ */}
      <div className="rpt-footer">
        <span>
          <FileSpreadsheet size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Excel export always exports all rows matching current filters
        </span>
      </div>

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

  return (
    <div className={`rpt-kpi${highlight ? ' rpt-kpi--highlight' : ''}`}>
      <div className="rpt-kpi-icon" style={{ background: bg[0], color: bg[1] }}>
        {icon}
      </div>
      <div>
        <div className="rpt-kpi-value" style={highlight ? { color: 'var(--accent)' } : {}}>
          {value}
        </div>
        <div className="rpt-kpi-label">{label}</div>
      </div>
    </div>
  )
}
