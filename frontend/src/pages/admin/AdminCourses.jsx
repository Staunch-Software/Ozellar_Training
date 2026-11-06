import './AdminCourses.css'
import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookOpen, Plus, AlertCircle, X, ChevronRight, ChevronLeft, Search,
  GraduationCap, Copy, Check, Layers, Award, Users, RefreshCw, Clock
} from 'lucide-react'
import { adminListCourses, adminCreateCourse, adminListUsers, adminDuplicateCourse } from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'

const EMPTY = { title: '', subtitle: '', durationLabel: '', passMark: 80, maxAttempts: '' }
const ROWS_PER_PAGE = 50

export default function AdminCourses() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [selectedCourses, setSelectedCourses] = useState([]) // Multi-select array of course IDs
  const [assessmentFilter, setAssessmentFilter] = useState('all') // 'all', 'has-assessment', 'no-assessment'
  const [page, setPage] = useState(1)

  // New Course Modal
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [targetRanks, setTargetRanks] = useState([])
  const [targetUsers, setTargetUsers] = useState([])
  const [searchRank, setSearchRank] = useState('')
  const [searchCrew, setSearchCrew] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Copy Dialog & Toast
  const [copyDialog, setCopyDialog] = useState(null) // { course, error }
  const [copyingId, setCopyingId] = useState(null)
  const [toast, setToast] = useState('')

  const tableScrollRef = useRef(null)

  const load = () => {
    setLoading(true)
    adminListCourses()
      .then(setCourses)
      .catch(err => setError(err.message || 'Could not load courses'))
      .finally(() => setLoading(false))

    adminListUsers()
      .then(setUsers)
      .catch(() => {})
  }

  useEffect(() => {
    load()
  }, [])

  // Reset pagination on filter/search change
  useEffect(() => {
    setPage(1)
  }, [search, selectedCourses, assessmentFilter])

  // Seamless wheel scrolling coordinator
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const onWheel = (e) => {
      const wrapper = el.closest('.cm-wrapper')
      const card = el.closest('.crs-table-card')
      const header = wrapper?.querySelector('.crs-header-container')
      if (!wrapper || !card || !header) return

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
  }, [loading, courses])

  // Duplicate handler
  const duplicate = async () => {
    if (!copyDialog?.course) return
    const c = copyDialog.course
    setCopyDialog({ course: c, error: '' })
    setCopyingId(c.id)
    try {
      const created = await adminDuplicateCourse(c.id)
      setCopyDialog(null)
      setToast(`Created "${created.title}"`)
      setTimeout(() => setToast(''), 5000)
      load()
    } catch (err) {
      setCopyDialog({ course: c, error: err.message || 'Could not copy course' })
    } finally {
      setCopyingId(null)
    }
  }

  const setFormField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Create course handler
  const create = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const created = await adminCreateCourse({
        title: form.title,
        subtitle: form.subtitle || null,
        durationLabel: form.durationLabel || null,
        passMark: Number(form.passMark) || 80,
        maxAttempts: form.maxAttempts === '' ? null : Number(form.maxAttempts),
        targetRanks,
        targetUsers,
      })
      setForm(EMPTY)
      setTargetRanks([])
      setTargetUsers([])
      setShowForm(false)
      navigate(`/admin/courses/${created.id}/certificate`)
    } catch (err) {
      setError(err.message || 'Could not create course')
    } finally {
      setBusy(false)
    }
  }

  // Course Options for CardSelect
  const courseOptions = useMemo(() => {
    if (!courses) return []
    return courses.map(c => ({
      value: c.id,
      label: c.title,
      description: `${c.chapterCount} modules${c.questionCount > 0 ? ` · Exam (${c.passMark}%)` : ''}`,
      icon: BookOpen,
    }))
  }, [courses])

  // Assessment Options for CardSelect
  const assessmentOptions = useMemo(() => [
    { value: 'all', label: 'All Assessments' },
    { value: 'has-assessment', label: 'With Assessment', description: 'Courses with exams' },
    { value: 'no-assessment', label: 'No Assessment', description: 'Reading only' },
  ], [])

  // Filtered Courses
  const filteredCourses = useMemo(() => {
    if (!courses) return []
    let list = [...courses]

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.subtitle || '').toLowerCase().includes(q) ||
        (c.durationLabel || '').toLowerCase().includes(q) ||
        (c.targetRanks || []).some(r => r.toLowerCase().includes(q))
      )
    }

    // Course Multi-Select Filter
    if (selectedCourses.length > 0) {
      list = list.filter(c => selectedCourses.includes(c.id))
    }

    // Assessment Filter
    if (assessmentFilter === 'has-assessment') {
      list = list.filter(c => (c.questionCount || 0) > 0)
    } else if (assessmentFilter === 'no-assessment') {
      list = list.filter(c => (c.questionCount || 0) === 0)
    }

    return list
  }, [courses, search, selectedCourses, assessmentFilter])

  // KPIs
  const kpis = useMemo(() => {
    if (!courses) return { totalCourses: 0, totalModules: 0, assessments: 0, avgPass: 80, targetedRanks: 0 }
    const totalCourses = courses.length
    const totalModules = courses.reduce((acc, c) => acc + (c.chapterCount || 0), 0)
    const assessments = courses.filter(c => (c.questionCount || 0) > 0).length
    const avgPass = totalCourses > 0
      ? Math.round(courses.reduce((acc, c) => acc + (c.passMark || 80), 0) / totalCourses)
      : 80

    const ranksSet = new Set()
    courses.forEach(c => {
      (c.targetRanks || []).forEach(r => ranksSet.add(r.toUpperCase()))
    })
    const targetedRanks = ranksSet.size

    return { totalCourses, totalModules, assessments, avgPass, targetedRanks }
  }, [courses])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCourses.length / ROWS_PER_PAGE))
  const paginatedCourses = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredCourses.slice(start, start + ROWS_PER_PAGE)
  }, [filteredCourses, page])

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', totalPages]
    if (page >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', page - 1, page, page + 1, '...', totalPages]
  }

  // Target ranks & users helpers for creation form
  const availableRanks = useMemo(() => {
    const rawRanks = users.map(u => u.rank ? u.rank.toUpperCase() : null).filter(Boolean)
    let ranks = [...new Set(rawRanks)].sort()
    if (searchRank.trim()) ranks = ranks.filter(r => r.toLowerCase().includes(searchRank.toLowerCase()))
    return ranks
  }, [users, searchRank])

  const availableUsers = useMemo(() => {
    let au = users.filter(u => {
      if (u.role !== 'learner') return false
      const r = u.rank ? u.rank.toUpperCase() : null
      return !targetRanks.includes(r)
    }).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (searchCrew.trim()) {
      const q = searchCrew.toLowerCase()
      au = au.filter(u => (u.name || '').toLowerCase().includes(q) || (u.rank || '').toLowerCase().includes(q))
    }
    return au
  }, [users, targetRanks, searchCrew])

  const availableUsersGrouped = useMemo(() => {
    const groups = {}
    availableUsers.forEach(u => {
      const r = u.rank ? u.rank.toUpperCase() : 'NO RANK'
      if (!groups[r]) groups[r] = []
      groups[r].push(u)
    })
    return groups
  }, [availableUsers])

  const toggleRank = (r) => setTargetRanks(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  const toggleUser = (id) => setTargetUsers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const allRanksSelected = availableRanks.length > 0 && availableRanks.every(r => targetRanks.includes(r))
  const toggleAllRanks = () => {
    if (allRanksSelected) {
      setTargetRanks(prev => prev.filter(r => !availableRanks.includes(r)))
    } else {
      setTargetRanks(prev => [...new Set([...prev, ...availableRanks])])
    }
  }

  const hasFilters = search.trim() !== '' || selectedCourses.length > 0 || assessmentFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setSelectedCourses([])
    setAssessmentFilter('all')
  }

  if (!courses) {
    return <div className="spinner" style={{ margin: '40px auto' }}>Loading courses…</div>
  }

  return (
    <div className="crs-root">

      {/* ── Toast Notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
          borderRadius: 12, background: '#0f172a', color: '#fff', fontSize: 13.5,
          fontWeight: 500, boxShadow: '0 12px 32px rgba(15,23,42,0.35)',
          animation: 'crsFadeUp .2s ease-out'
        }}>
          <Check size={16} color="#4ade80" /> {toast}
          <button
            onClick={() => setToast('')}
            aria-label="Dismiss"
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', padding: 0, marginLeft: 6 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Copy Course Dialog ── */}
      {copyDialog && (
        <div
          className="crs-modal-backdrop"
          onClick={() => !copyingId && setCopyDialog(null)}
        >
          <div
            style={{
              width: 'min(440px, 94vw)',
              background: 'var(--surface, #fff)',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(15,23,42,0.3)',
              overflow: 'hidden',
              border: '1px solid var(--border)',
              animation: 'crsModalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '24px 24px 8px', display: 'flex', gap: 14 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12,
                background: 'rgba(79,70,229,0.1)', color: '#4f46e5',
                display: 'grid', placeItems: 'center', flex: 'none',
                border: '1px solid rgba(79,70,229,0.2)'
              }}>
                <Copy size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Copy this course?</div>
                <div style={{
                  fontWeight: 600, fontSize: 13.5, marginTop: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: '#4f46e5'
                }}>
                  {copyDialog.course.title}
                </div>
                <div className="mut" style={{ fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>
                  A new course will be created with all modules, quizzes, media and the final assessment.
                  Assignments and seafarer progress are not copied.
                </div>
              </div>
            </div>
            {copyDialog.error && (
              <div className="form-error" style={{ margin: '12px 24px 0' }}>
                <AlertCircle size={15} /> {copyDialog.error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '20px 24px' }}>
              <button className="btn" disabled={!!copyingId} onClick={() => setCopyDialog(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={!!copyingId} onClick={duplicate}>
                {copyingId ? 'Copying…' : copyDialog.error ? 'Try again' : 'Copy course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ STICKY HEADER & CONTROLS BAR ═══════════════════════ */}
      <div className="crs-header-container">
        <div className="crs-header">
          {/* Left: Brand Identity */}
          <div className="crs-header-brand">
            <div className="crs-header-accent-bar" />
            <div className="crs-header-icon">
              <BookOpen size={17} />
            </div>
            <div className="crs-header-title-wrap">
              <div className="crs-header-eyebrow">Fleet Training · Curriculum</div>
              <div className="crs-header-title-row">
                <h1 className="crs-header-title">Courses</h1>
                <div className="crs-header-stat-pill">
                  <span className="crs-header-stat-count">{filteredCourses.length}</span>
                  <span className="crs-header-stat-label">
                    {hasFilters ? 'Filtered' : 'Courses'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Search, Course Multi-Select, Assessment Filter & New Course in Single Row */}
          <div className="crs-header-controls">
            {/* Search Box */}
            <div className="crs-search-wrap">
              <Search size={13} className="crs-search-icon" />
              <input
                id="crs-search-input"
                type="text"
                className="crs-search-input"
                placeholder="Search courses, topics, ranks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="crs-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Course Filter Dropdown with CardSelect (Multi-select enabled!) */}
            <div className="crs-select-wrap crs-select-course">
              <CardSelect
                id="crs-course-filter"
                value={selectedCourses}
                onChange={setSelectedCourses}
                options={courseOptions}
                placeholder="All Courses"
                searchable={true}
                multi={true}
                placement="bottom"
                className="crs-cardselect crs-cardselect--course"
              />
            </div>

            {/* Assessment Filter Dropdown with CardSelect */}
            <div className="crs-select-wrap crs-select-assessment">
              <CardSelect
                id="crs-assessment-filter"
                value={assessmentFilter}
                onChange={setAssessmentFilter}
                options={assessmentOptions}
                placeholder="All Assessments"
                placement="bottom"
                className="crs-cardselect crs-cardselect--assessment"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              id="crs-refresh-btn"
              className={`crs-btn-refresh${loading ? ' crs-btn-refresh--spinning' : ''}`}
              onClick={load}
              title="Refresh courses list"
              aria-label="Refresh courses list"
            >
              <RefreshCw size={13} />
            </button>

            {/* + New Course Action Button */}
            <button
              type="button"
              id="crs-new-course-btn"
              className="crs-btn-new-course"
              onClick={() => { setShowForm(true); setError('') }}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>New course</span>
            </button>
          </div>
        </div>

        {/* Active Filter Chips Strip */}
        {hasFilters && (
          <div className="crs-active-chips-strip">
            <span className="crs-active-chips-lead">Active filters:</span>
            {search && (
              <span className="crs-chip">
                <Search size={11} className="crs-chip-icon" />
                <span>Search: "{search}"</span>
                <button type="button" className="crs-chip-remove" onClick={() => setSearch('')}>
                  <X size={11} />
                </button>
              </span>
            )}
            {selectedCourses.length > 0 && (
              <span className="crs-chip">
                <BookOpen size={11} className="crs-chip-icon" />
                <span>
                  {selectedCourses.length === 1
                    ? `Course: ${courses.find(c => c.id === selectedCourses[0])?.title || selectedCourses[0]}`
                    : `Courses: ${selectedCourses.length} selected`}
                </span>
                <button type="button" className="crs-chip-remove" onClick={() => setSelectedCourses([])}>
                  <X size={11} />
                </button>
              </span>
            )}
            {assessmentFilter !== 'all' && (
              <span className="crs-chip">
                <GraduationCap size={11} className="crs-chip-icon" />
                <span>Assessment: {assessmentFilter === 'has-assessment' ? 'With Assessment' : 'No Assessment'}</span>
                <button type="button" className="crs-chip-remove" onClick={() => setAssessmentFilter('all')}>
                  <X size={11} />
                </button>
              </span>
            )}
            <button type="button" className="crs-chip-clear-all" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && !showForm && (
        <div className="form-error" style={{ margin: '16px 24px 0' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ═══════════════════════ UNIQUE LIGHT-THEMED KPI METRIC STRIP ═══════════════════════ */}
      <div className="crs-kpi-strip">
        {/* Card 1: Total Courses */}
        <div className="crs-kpi-card crs-kpi-card--indigo">
          <div className="crs-kpi-icon-wrap">
            <BookOpen size={17} strokeWidth={2.3} />
          </div>
          <div className="crs-kpi-body">
            <span className="crs-kpi-val">{kpis.totalCourses}</span>
            <span className="crs-kpi-lbl">Total Courses</span>
          </div>
          <span className="crs-kpi-badge">Curriculum</span>
        </div>

        {/* Card 2: Total Modules */}
        <div className="crs-kpi-card crs-kpi-card--emerald">
          <div className="crs-kpi-icon-wrap">
            <Layers size={17} strokeWidth={2.3} />
          </div>
          <div className="crs-kpi-body">
            <span className="crs-kpi-val">{kpis.totalModules}</span>
            <span className="crs-kpi-lbl">Total Modules</span>
          </div>
          <span className="crs-kpi-badge">Modules</span>
        </div>

        {/* Card 3: With Assessment */}
        <div className="crs-kpi-card crs-kpi-card--purple">
          <div className="crs-kpi-icon-wrap">
            <GraduationCap size={17} strokeWidth={2.3} />
          </div>
          <div className="crs-kpi-body">
            <span className="crs-kpi-val">{kpis.assessments}</span>
            <span className="crs-kpi-lbl">With Assessment</span>
          </div>
          <span className="crs-kpi-badge">Assessment</span>
        </div>

        {/* Card 4: Avg Pass Criteria */}
        <div className="crs-kpi-card crs-kpi-card--amber">
          <div className="crs-kpi-icon-wrap">
            <Award size={17} strokeWidth={2.3} />
          </div>
          <div className="crs-kpi-body">
            <span className="crs-kpi-val">{kpis.avgPass}%</span>
            <span className="crs-kpi-lbl">Avg Pass Criteria</span>
          </div>
          <span className="crs-kpi-badge">Benchmark</span>
        </div>

        {/* Card 5: Covered Ranks */}
        <div className="crs-kpi-card crs-kpi-card--sky">
          <div className="crs-kpi-icon-wrap">
            <Users size={17} strokeWidth={2.3} />
          </div>
          <div className="crs-kpi-body">
            <span className="crs-kpi-val">{kpis.targetedRanks}</span>
            <span className="crs-kpi-lbl">Covered Ranks</span>
          </div>
          <span className="crs-kpi-badge">Fleet Reach</span>
        </div>
      </div>

      {/* ═══════════════════════ COURSES TABLE CARD ═══════════════════════ */}
      <div className="crs-table-card">
        {filteredCourses.length === 0 ? (
          <div className="crs-empty">
            <Search size={40} className="crs-empty-icon" />
            <div className="crs-empty-title">No courses found</div>
            <div className="crs-empty-sub">Try adjusting your search query or filters above</div>
            {hasFilters && (
              <button
                type="button"
                className="btn sm"
                style={{ marginTop: 14 }}
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="crs-table-scroll" ref={tableScrollRef}>
            <table className="crs-table">
              <thead>
                <tr>
                  <th className="crs-col-sino">SI No.</th>
                  <th className="crs-col-course">Course</th>
                  <th className="crs-col-modules">Modules</th>
                  <th className="crs-col-assessment">Final Assessment</th>
                  <th className="crs-col-ranks">Target Ranks</th>
                  <th className="crs-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCourses.map((c, idx) => {
                  const sino = ((page - 1) * ROWS_PER_PAGE) + idx + 1
                  const ranks = c.targetRanks || []
                  const hasAssessment = (c.questionCount || 0) > 0

                  return (
                    <tr
                      key={c.id}
                      className="crs-row"
                      onClick={() => navigate(`/admin/courses/${c.id}`)}
                    >
                      {/* SI No */}
                      <td className="crs-col-sino">
                        <span className="crs-sino-badge">{sino}</span>
                      </td>

                      {/* Course info */}
                      <td className="crs-col-course">
                        <div className="crs-identity">
                          <div className="crs-avatar">
                            <BookOpen size={18} strokeWidth={2.3} />
                          </div>
                          <div className="crs-meta">
                            <div className="crs-title">{c.title}</div>
                            <div className="crs-desc-row">
                              {c.subtitle ? (
                                <span className="crs-desc" title={c.subtitle}>
                                  {c.subtitle}
                                </span>
                              ) : (
                                <span className="crs-desc mut">No description provided</span>
                              )}
                              {c.durationLabel && (
                                <span className="crs-duration-pill">
                                  <Clock size={10} />
                                  {c.durationLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Modules */}
                      <td className="crs-col-modules">
                        <span className="crs-modules-badge">
                          <Layers size={12} />
                          {c.chapterCount} {c.chapterCount === 1 ? 'Module' : 'Modules'}
                        </span>
                      </td>

                      {/* Final Assessment */}
                      <td className="crs-col-assessment">
                        {hasAssessment ? (
                          <div className="crs-assessment-block">
                            <div className="crs-assessment-active">
                              <span className="crs-assessment-qs">
                                {c.questionCount} {c.questionCount === 1 ? 'Question' : 'Questions'}
                              </span>
                              <span className="crs-assessment-pill">
                                Pass {c.passMark}%
                              </span>
                            </div>
                            {c.maxAttempts && (
                              <div>
                                <span className="crs-attempts-pill">
                                  {c.maxAttempts} {c.maxAttempts === 1 ? 'attempt' : 'attempts'} limit
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="crs-no-assessment">
                            No assessment
                          </span>
                        )}
                      </td>

                      {/* Target Ranks */}
                      <td className="crs-col-ranks">
                        <div className="crs-ranks-wrap">
                          {ranks.length === 0 ? (
                            <span className="crs-rank-tag crs-rank-tag--all">ALL SEAFARERS</span>
                          ) : (
                            <>
                              {ranks.slice(0, 2).map((r) => (
                                <span key={r} className="crs-rank-tag" title={r}>
                                  {r}
                                </span>
                              ))}
                              {ranks.length > 2 && (
                                <span
                                  className="crs-rank-tag crs-rank-tag--more"
                                  title={ranks.slice(2).join(', ')}
                                >
                                  +{ranks.length - 2} more
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="crs-col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="crs-action-btns">
                          <button
                            type="button"
                            className="crs-copy-btn"
                            title="Copy course as a new course"
                            aria-label="Copy course"
                            disabled={copyingId === c.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setCopyDialog({ course: c, error: '' })
                            }}
                          >
                            <Copy size={13} />
                          </button>
                          <ChevronRight
                            size={16}
                            className="crs-arrow-btn"
                            onClick={() => navigate(`/admin/courses/${c.id}`)}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Attached Compact Pagination */}
        {filteredCourses.length > 0 && (
          <div className="crs-pagination">
            <div className="crs-page-info">
              Showing <strong>{(page - 1) * ROWS_PER_PAGE + 1}</strong> to{' '}
              <strong>{Math.min(page * ROWS_PER_PAGE, filteredCourses.length)}</strong> of{' '}
              <strong>{filteredCourses.length}</strong> entries
            </div>

            <div className="crs-page-controls">
              <button
                type="button"
                className="crs-page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
              </button>

              <div className="crs-page-nums">
                {getPageNumbers().map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`crs-page-num ${p === page ? 'active' : ''} ${p === '...' ? 'dots' : ''}`}
                    onClick={() => p !== '...' && setPage(p)}
                    disabled={p === '...'}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="crs-page-btn"
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════ NEW COURSE MODAL ═══════════════════════ */}
      {showForm && (
        <div
          className="crs-modal-backdrop"
          onClick={() => !busy && setShowForm(false)}
        >
          <div
            className="crs-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="crs-modal-header">
              <div className="crs-modal-header-left">
                <div className="crs-modal-icon">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <div className="crs-modal-title">Create New Course</div>
                  <div className="crs-modal-sub">Define course details, passing criteria, and auto-enrollment rules.</div>
                </div>
              </div>
              <button
                type="button"
                className="crs-modal-close"
                onClick={() => !busy && setShowForm(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="crs-modal-body">
                {error && (
                  <div className="form-error">
                    <AlertCircle size={15} /> {error}
                  </div>
                )}

                {/* Course Metadata Fields */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 220px' }}>
                    <Field label="Title" required>
                      <input
                        value={form.title}
                        onChange={(e) => setFormField('title', e.target.value)}
                        placeholder="e.g. Firefighting"
                        required
                        autoFocus
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 200px' }}>
                    <Field label="Subtitle">
                      <input
                        value={form.subtitle}
                        onChange={(e) => setFormField('subtitle', e.target.value)}
                        placeholder="Short desc"
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <Field label="Duration">
                      <input
                        value={form.durationLabel}
                        onChange={(e) => setFormField('durationLabel', e.target.value)}
                        placeholder="2 hours"
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '0 1 100px' }}>
                    <Field label="Pass (%)" required>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.passMark}
                        onChange={(e) => setFormField('passMark', e.target.value)}
                      />
                    </Field>
                  </div>
                  <div style={{ flex: '0 1 100px' }}>
                    <Field label="Attempts">
                      <input
                        type="number"
                        min={1}
                        value={form.maxAttempts}
                        onChange={(e) => setFormField('maxAttempts', e.target.value)}
                        placeholder="Unlim."
                      />
                    </Field>
                  </div>
                </div>

                {/* Target Ranks & Seafarers */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '18px', marginTop: '4px' }}>
                  {/* Target Ranks */}
                  <div style={{ flex: '1 1 300px' }}>
                    <Field label="Target Ranks (Auto-enroll)">
                      <div className="target-selection-container">
                        <div className="search-bar" style={{ margin: 0, marginBottom: 12 }}>
                          <Search size={14} color="#64748b" />
                          <input
                            type="text"
                            placeholder="Search ranks..."
                            value={searchRank}
                            onChange={e => setSearchRank(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Available Ranks ({availableRanks.length})
                          </span>
                          {availableRanks.length > 0 && (
                            <button
                              type="button"
                              onClick={toggleAllRanks}
                              style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}
                            >
                              {allRanksSelected ? 'Deselect All' : 'Select All'}
                            </button>
                          )}
                        </div>

                        {availableRanks.length === 0 ? (
                          <div className="mut" style={{ fontSize: 12.5 }}>No ranks found</div>
                        ) : null}

                        <div className="chips-grid" style={{ maxHeight: 180, overflowY: 'auto' }}>
                          {availableRanks.map(r => (
                            <button
                              type="button"
                              key={r}
                              className={`premium-chip ${targetRanks.includes(r) ? 'selected' : ''}`}
                              onClick={() => toggleRank(r)}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>
                    </Field>
                  </div>

                  {/* Target Specific Seafarers */}
                  <div style={{ flex: '1 1 300px' }}>
                    <Field label="Target Specific Seafarers (Other seafarers)">
                      <div className="target-selection-container">
                        <div className="search-bar" style={{ margin: 0, marginBottom: 12 }}>
                          <Search size={14} color="#64748b" />
                          <input
                            type="text"
                            placeholder="Search seafarers by name or rank..."
                            value={searchCrew}
                            onChange={e => setSearchCrew(e.target.value)}
                          />
                        </div>

                        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                          {availableUsers.length === 0 ? (
                            <div className="mut" style={{ fontSize: 12.5, marginTop: 8 }}>No other seafarers available</div>
                          ) : null}

                          {Object.keys(availableUsersGrouped).sort((a, b) => {
                            if (a === 'NO RANK') return -1
                            if (b === 'NO RANK') return 1
                            return a.localeCompare(b)
                          }).map(rankName => (
                            <div key={rankName} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-mut)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {rankName}
                              </div>
                              <div className="crew-cards-grid">
                                {availableUsersGrouped[rankName].map(u => (
                                  <button
                                    type="button"
                                    key={u.id}
                                    className={`premium-crew-card ${targetUsers.includes(u.id) ? 'selected' : ''}`}
                                    onClick={() => toggleUser(u.id)}
                                  >
                                    <div className="crew-avatar">{(u.name || 'CR').substring(0, 2).toUpperCase()}</div>
                                    <div className="crew-info">
                                      <div className="crew-name">{u.name}</div>
                                      <div className="crew-rank">{u.rank || 'No rank'}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Field>
                  </div>
                </div>

                <p className="mut" style={{ margin: 0, fontSize: 12 }}>
                  Next you'll set the certificate topics, then upload slides/videos and add quizzes.
                </p>
              </div>

              {/* Modal Footer */}
              <div className="crs-modal-footer">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busy}
                  style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' }}
                >
                  {busy ? 'Creating…' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="admin-field" style={{ margin: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
        {label}{required && <i className="req" style={{ color: '#ef4444', marginLeft: 3 }}>*</i>}
      </span>
      {children}
    </label>
  )
}
