import './AdminUsers.css'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Users, UserPlus, Check, Ban, AlertCircle, X, Search,
  RefreshCw, ChevronLeft, ChevronRight, Phone, Shield
} from 'lucide-react'
import { adminListUsers, adminCreateUser, adminUpdateUser } from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'

const EMPTY = {
  role: 'learner',
  fullName: '',
  crewId: '',
  dob: '',
  rank: '',
  ppNo: '',
  mobileNo: '',
  email: '',
  password: ''
}

const ROWS_PER_PAGE = 50

const formatMobile = (mobileNo) => {
  if (!mobileNo) return '—'
  const str = String(mobileNo).replace(/\D/g, '')
  if (str.length === 10) return `${str.slice(0, 5)} ${str.slice(5)}`
  return mobileNo
}

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AdminUsers() {
  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  // Modal & Form State
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [togglingId, setTogglingId] = useState(null)

  const tableScrollRef = useRef(null)

  // Load seafarers
  const load = () => {
    setLoading(true)
    adminListUsers()
      .then(setUsers)
      .catch(err => setError(err.message || 'Could not load seafarers'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  // Reset pagination on filter change
  useEffect(() => {
    setPage(1)
  }, [search, rankFilter, statusFilter])

  // Wheel scrolling coordinator between table and outer wrapper
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const onWheel = (e) => {
      const wrapper = el.closest('.cm-wrapper')
      const card = el.closest('.usr-table-card')
      const header = wrapper?.querySelector('.usr-header-container')
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
  }, [loading, users])

  // Rank Filter Options
  const rankOptions = useMemo(() => {
    if (!users) return [{ value: 'all', label: 'All Ranks' }]
    const counts = {}
    users.forEach(u => {
      const r = (u.rank || '').trim().toUpperCase()
      if (r) counts[r] = (counts[r] || 0) + 1
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
  }, [users])

  // Status Filter Options
  const statusOptions = useMemo(() => [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active', description: 'Active seafarers' },
    { value: 'inactive', label: 'Inactive', description: 'Deactivated accounts' },
  ], [])

  // Filtered Seafarers
  const filteredUsers = useMemo(() => {
    if (!users) return []
    let list = [...users]

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(u =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.crewId || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.rank || '').toLowerCase().includes(q) ||
        (u.mobileNo || '').includes(q)
      )
    }

    // Rank filter
    if (rankFilter !== 'all') {
      list = list.filter(u => (u.rank || '').trim().toUpperCase() === rankFilter)
    }

    // Status filter
    if (statusFilter === 'active') {
      list = list.filter(u => Boolean(u.isActive))
    } else if (statusFilter === 'inactive') {
      list = list.filter(u => !u.isActive)
    }

    return list
  }, [users, search, rankFilter, statusFilter])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ROWS_PER_PAGE))
  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE
    return filteredUsers.slice(start, start + ROWS_PER_PAGE)
  }, [filteredUsers, page])

  const getPageNumbers = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', totalPages]
    if (page >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, '...', page - 1, page, page + 1, '...', totalPages]
  }

  // Active Filters Check & Reset
  const hasFilters = search.trim() !== '' || rankFilter !== 'all' || statusFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setRankFilter('all')
    setStatusFilter('all')
  }

  // Form Field Setter
  const setFormField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Create User Handler
  const create = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) {
      setError('Full name is required')
      return
    }
    if (form.role === 'learner') {
      if (!form.crewId.trim()) {
        setError('Seafarer ID is required')
        return
      }
      if (!form.dob || form.dob.replace(/\D/g, '').length !== 8) {
        setError('Date of birth must be 8 digits (DDMMYYYY)')
        return
      }
    } else {
      if (!form.email?.trim()) {
        setError('Email address is required for administrator accounts')
        return
      }
      if (!form.password) {
        setError('Password is required for administrator accounts')
        return
      }
    }

    setBusy(true)
    try {
      await adminCreateUser(form)
      setForm(EMPTY)
      setShowModal(false)
      setToast(`Created user account for "${form.fullName}"`)
      setTimeout(() => setToast(''), 4000)
      load()
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally {
      setBusy(false)
    }
  }

  // Toggle Active/Inactive Status
  const toggleActive = async (u) => {
    setTogglingId(u.id)
    try {
      await adminUpdateUser(u.id, { isActive: !u.isActive })
      setToast(`${u.name} is now ${!u.isActive ? 'active' : 'inactive'}`)
      setTimeout(() => setToast(''), 4000)
      load()
    } catch (err) {
      setToast(`Error: ${err.message || 'Could not update status'}`)
      setTimeout(() => setToast(''), 4000)
    } finally {
      setTogglingId(null)
    }
  }

  if (!users) {
    return <div className="spinner" style={{ margin: '40px auto' }}>Loading seafarers…</div>
  }

  return (
    <div className="usr-root">

      {/* ── Toast Notification ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px',
          borderRadius: 12, background: '#0f172a', color: '#fff', fontSize: 13.5,
          fontWeight: 500, boxShadow: '0 12px 32px rgba(15,23,42,0.35)',
          animation: 'usrFadeUp .2s ease-out'
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

      {/* ═══════════════════════ STICKY HEADER & CONTROLS BAR ═══════════════════════ */}
      <div className="usr-header-container">
        <div className="usr-header">
          {/* Left: Brand Identity */}
          <div className="usr-header-brand">
            <div className="usr-header-accent-bar" />
            <div className="usr-header-icon">
              <Users size={17} />
            </div>
            <div className="usr-header-title-wrap">
              <div className="usr-header-eyebrow">Fleet Training · People</div>
              <div className="usr-header-title-row">
                <h1 className="usr-header-title">Seafarers</h1>
                <div className="usr-header-stat-pill">
                  <span className="usr-header-stat-count">{filteredUsers.length}</span>
                  <span className="usr-header-stat-label">
                    {hasFilters ? 'Filtered' : 'Seafarers'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Search, Rank Filter, Status Filter & Add Seafarer in One Row */}
          <div className="usr-header-controls">
            {/* Search Box */}
            <div className="usr-search-wrap">
              <Search size={13} className="usr-search-icon" />
              <input
                id="usr-search-input"
                type="text"
                className="usr-search-input"
                placeholder="Search seafarers, ID, rank, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="usr-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Rank Filter Dropdown with CardSelect */}
            <div className="usr-select-wrap usr-select-rank">
              <CardSelect
                id="usr-rank-filter"
                value={rankFilter}
                onChange={setRankFilter}
                options={rankOptions}
                placeholder="All Ranks"
                searchable={true}
                placement="bottom"
                className="usr-cardselect usr-cardselect--rank"
              />
            </div>

            {/* Status Filter Dropdown with CardSelect */}
            <div className="usr-select-wrap usr-select-status">
              <CardSelect
                id="usr-status-filter"
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusOptions}
                placeholder="All Statuses"
                placement="bottom"
                className="usr-cardselect usr-cardselect--status"
              />
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              id="usr-refresh-btn"
              className="usr-btn-refresh"
              onClick={load}
              disabled={loading}
              title="Refresh seafarers list"
              aria-label="Refresh list"
            >
              <RefreshCw size={14} className={loading ? 'usr-spin' : ''} />
            </button>

            {/* + Add Seafarer Button */}
            <button
              type="button"
              id="usr-new-btn"
              className="usr-btn-new"
              onClick={() => {
                setForm(EMPTY)
                setError('')
                setShowModal(true)
              }}
            >
              <UserPlus size={15} />
              <span>Add Seafarer</span>
            </button>
          </div>
        </div>

        {/* Active Filter Chips Strip */}
        {hasFilters && (
          <div className="usr-chips-bar">
            <span className="usr-chips-label">Active Filters:</span>

            {search.trim() && (
              <span className="usr-chip">
                Search: <strong>"{search.trim()}"</strong>
                <button
                  type="button"
                  className="usr-chip-remove"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {rankFilter !== 'all' && (
              <span className="usr-chip">
                Rank: <strong>{rankFilter}</strong>
                <button
                  type="button"
                  className="usr-chip-remove"
                  onClick={() => setRankFilter('all')}
                  title="Clear rank filter"
                  aria-label="Clear rank filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {statusFilter !== 'all' && (
              <span className="usr-chip">
                Status: <strong>{statusFilter === 'active' ? 'Active' : 'Inactive'}</strong>
                <button
                  type="button"
                  className="usr-chip-remove"
                  onClick={() => setStatusFilter('all')}
                  title="Clear status filter"
                  aria-label="Clear status filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            <button
              type="button"
              className="usr-chip-clear-all"
              onClick={clearFilters}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {error && !showModal && (
        <div className="form-error" style={{ margin: '16px 24px 0' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ═══════════════════════ SEAFARERS TABLE CARD (No KPI Card as requested) ═══════════════════════ */}
      <div className="usr-table-card">
        {filteredUsers.length === 0 ? (
          <div className="usr-empty">
            <div className="usr-empty-icon">
              <Users size={24} />
            </div>
            <h3 className="usr-empty-title">No seafarers found</h3>
            <p className="usr-empty-sub">
              {hasFilters
                ? 'No crew members match your active filters. Try adjusting your search query or reset the filters.'
                : 'No seafarer accounts found in the database. Use "+ Add Seafarer" to create one.'}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="btn sm primary"
                onClick={clearFilters}
                style={{ marginTop: 6 }}
              >
                Reset all filters
              </button>
            )}
          </div>
        ) : (
          <div className="usr-table-scroll" ref={tableScrollRef}>
            <table className="usr-table">
              <thead>
                <tr>
                  <th className="usr-col-sino">SI No.</th>
                  <th className="usr-col-seafarer">Seafarer</th>
                  <th className="usr-col-role">Role</th>
                  <th className="usr-col-id">Seafarer ID</th>
                  <th className="usr-col-rank">Rank</th>
                  <th className="usr-col-phone">Mobile No</th>
                  <th className="usr-col-courses">Courses</th>
                  <th className="usr-col-status">Status</th>
                  <th className="usr-col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((u, idx) => {
                  const sino = (page - 1) * ROWS_PER_PAGE + idx + 1
                  const isLearner = u.role === 'learner'
                  const passed = u.passedCount || 0
                  const assigned = u.assignedCount || 0
                  const progressPct = assigned > 0 ? Math.round((passed / assigned) * 100) : 0

                  return (
                    <tr
                      key={u.id}
                      className={!u.isActive ? 'usr-row--inactive' : ''}
                    >
                      {/* SI No. */}
                      <td className="usr-col-sino mut" style={{ fontSize: 12 }}>
                        {sino}
                      </td>

                      {/* Seafarer: Avatar + Name + Subtitle */}
                      <td className="usr-col-seafarer">
                        <div className="usr-cell-seafarer">
                          <div className="usr-avatar">
                            {getInitials(u.name)}
                          </div>
                          <div className="usr-details">
                            <span className="usr-name">{u.name}</span>
                            <span className="usr-meta">
                              {isLearner ? (u.crewId ? `ID: ${u.crewId}` : 'No Crew ID') : (u.email || 'Admin User')}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Pill */}
                      <td className="usr-col-role">
                        {u.role === 'super_admin' ? (
                          <span className="usr-role-pill usr-role-pill--super">Super Admin</span>
                        ) : u.role === 'admin' ? (
                          <span className="usr-role-pill usr-role-pill--admin">Admin</span>
                        ) : (
                          <span className="usr-role-pill usr-role-pill--learner">Seafarer</span>
                        )}
                      </td>

                      {/* Seafarer ID */}
                      <td className="usr-col-id">
                        {isLearner ? (
                          <span className="usr-id-tag">{u.crewId || '—'}</span>
                        ) : (
                          <span className="mut" style={{ fontSize: 12 }}>{u.email || '—'}</span>
                        )}
                      </td>

                      {/* Rank */}
                      <td className="usr-col-rank">
                        <span className="usr-rank-tag">
                          {u.rank ? u.rank.toUpperCase() : '—'}
                        </span>
                      </td>

                      {/* Mobile Number */}
                      <td className="usr-col-phone">
                        <span className="usr-phone-tag">
                          <Phone size={12} style={{ opacity: 0.6 }} />
                          <span>{formatMobile(u.mobileNo)}</span>
                        </span>
                      </td>

                      {/* Course Progress */}
                      <td className="usr-col-courses">
                        {isLearner ? (
                          <div className="usr-progress-wrap">
                            <div className="usr-progress-text">
                              <span>{passed} / {assigned} passed</span>
                              <span style={{ fontSize: 10, color: 'var(--text-mut)' }}>{progressPct}%</span>
                            </div>
                            <div className="usr-progress-bar">
                              <div
                                className="usr-progress-fill"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="mut" style={{ fontSize: 11.5 }}>Admin staff</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="usr-col-status">
                        {u.isActive ? (
                          <span className="usr-status-pill usr-status-pill--active">
                            <span className="usr-status-dot" />
                            Active
                          </span>
                        ) : (
                          <span className="usr-status-pill usr-status-pill--inactive">
                            <span className="usr-status-dot" />
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="usr-col-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`usr-btn-toggle ${u.isActive ? 'usr-btn-toggle--active' : 'usr-btn-toggle--inactive'}`}
                          title={u.isActive ? 'Deactivate account' : 'Activate account'}
                          disabled={togglingId === u.id}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? (
                            <>
                              <Ban size={12} />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <Check size={12} />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Attached Compact Pagination */}
        {filteredUsers.length > 0 && (
          <div className="usr-pagination">
            <div className="usr-page-info">
              Showing <strong>{(page - 1) * ROWS_PER_PAGE + 1}</strong> to{' '}
              <strong>{Math.min(page * ROWS_PER_PAGE, filteredUsers.length)}</strong> of{' '}
              <strong>{filteredUsers.length}</strong> entries
            </div>

            <div className="usr-page-controls">
              <button
                type="button"
                className="usr-page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={13} />
              </button>

              <div className="usr-page-nums">
                {getPageNumbers().map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`usr-page-num ${p === page ? 'active' : ''} ${p === '...' ? 'dots' : ''}`}
                    onClick={() => p !== '...' && setPage(p)}
                    disabled={p === '...'}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="usr-page-btn"
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

      {/* ═══════════════════════ ADD SEAFARER MODAL DIALOG ═══════════════════════ */}
      {showModal && (
        <div
          className="usr-modal-backdrop"
          onClick={() => !busy && setShowModal(false)}
        >
          <div
            className="usr-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="usr-modal-header">
              <div className="usr-modal-header-left">
                <div className="usr-modal-icon">
                  <UserPlus size={19} />
                </div>
                <div>
                  <div className="usr-modal-title">Add New Seafarer</div>
                  <div className="usr-modal-sub">Create a new crew member or administrator account</div>
                </div>
              </div>
              <button
                type="button"
                className="usr-modal-close"
                onClick={() => !busy && setShowModal(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="usr-modal-body">
                {error && (
                  <div className="form-error">
                    <AlertCircle size={15} /> {error}
                  </div>
                )}

                {/* Role Switcher */}
                <div style={{ display: 'flex', gap: 10, background: 'var(--surface-2)', padding: 4, borderRadius: 8 }}>
                  <button
                    type="button"
                    className={`btn sm ${form.role === 'learner' ? 'primary' : ''}`}
                    style={{
                      flex: 1,
                      background: form.role === 'learner' ? '#0284c7' : 'transparent',
                      color: form.role === 'learner' ? '#fff' : 'var(--text)',
                      border: 'none',
                      fontWeight: 600
                    }}
                    onClick={() => setFormField('role', 'learner')}
                  >
                    Seafarer (Learner)
                  </button>
                  <button
                    type="button"
                    className={`btn sm ${form.role === 'admin' ? 'primary' : ''}`}
                    style={{
                      flex: 1,
                      background: form.role === 'admin' ? '#0284c7' : 'transparent',
                      color: form.role === 'admin' ? '#fff' : 'var(--text)',
                      border: 'none',
                      fontWeight: 600
                    }}
                    onClick={() => setFormField('role', 'admin')}
                  >
                    Administrator
                  </button>
                </div>

                {/* Common Fields */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  <Field label="Full Name" required>
                    <input
                      id="usr-form-name"
                      value={form.fullName}
                      onChange={(e) => setFormField('fullName', e.target.value)}
                      placeholder="e.g. Aadarsh Bhasurendrababu"
                      required
                      autoFocus
                    />
                  </Field>

                  <Field label="Rank / Title">
                    <input
                      id="usr-form-rank"
                      value={form.rank}
                      onChange={(e) => setFormField('rank', e.target.value)}
                      placeholder="e.g. Fourth Engineer"
                    />
                  </Field>
                </div>

                {form.role === 'learner' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      <Field label="Seafarer ID / Crew ID" required>
                        <input
                          id="usr-form-crewid"
                          value={form.crewId}
                          onChange={(e) => setFormField('crewId', e.target.value)}
                          placeholder="e.g. OZ00876"
                          required
                        />
                      </Field>

                      <Field label="Date of Birth (DDMMYYYY)" required>
                        <input
                          id="usr-form-dob"
                          value={form.dob}
                          inputMode="numeric"
                          maxLength={8}
                          onChange={(e) => setFormField('dob', e.target.value.replace(/\D/g, ''))}
                          placeholder="e.g. 25032004"
                          required
                        />
                      </Field>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                      <Field label="Passport No.">
                        <input
                          id="usr-form-ppno"
                          value={form.ppNo}
                          onChange={(e) => setFormField('ppNo', e.target.value)}
                          placeholder="e.g. PP-6120"
                        />
                      </Field>

                      <Field label="Mobile Number">
                        <input
                          id="usr-form-mobile"
                          value={form.mobileNo}
                          onChange={(e) => setFormField('mobileNo', e.target.value)}
                          placeholder="e.g. 9876543210"
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <Field label="Email Address" required>
                      <input
                        id="usr-form-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setFormField('email', e.target.value)}
                        placeholder="admin@company.com"
                        required
                      />
                    </Field>

                    <Field label="Password" required>
                      <input
                        id="usr-form-password"
                        type="password"
                        value={form.password}
                        onChange={(e) => setFormField('password', e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="usr-modal-footer">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="usr-form-submit"
                  className="btn primary"
                  disabled={busy}
                  style={{ background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' }}
                >
                  {busy ? 'Creating…' : 'Create Seafarer'}
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
