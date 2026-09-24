import { useEffect, useState, useRef } from 'react'
import { UserPlus, Check, Ban, AlertCircle, X, Search, Users, ChevronDown } from 'lucide-react'
import { adminListUsers, adminCreateUser, adminUpdateUser } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'

const EMPTY = { role: 'learner', fullName: '', crewId: '', dob: '', rank: '', ppNo: '' }

const formatMobile = (mobileNo) => {
  if (!mobileNo || mobileNo.length !== 10) return mobileNo || null
  return `${mobileNo.slice(0, 5)} ${mobileNo.slice(5)}`
}

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function AdminUsers() {
  const [users, setUsers] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const [currentPage, setCurrentPage] = useState(1)

  const load = () => adminListUsers().then(setUsers)
  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [search, rankFilter])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const create = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await adminCreateUser(form)
      setForm(EMPTY)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (u) => {
    await adminUpdateUser(u.id, { isActive: !u.isActive })
    load()
  }

  if (!users) return <div className="spinner">Loading users…</div>

  const uniqueRanks = [...new Set(users.map(u => (u.rank || '').trim().toUpperCase()).filter(Boolean))].sort()

  const filteredUsers = users.filter(u => {
    let matchSearch = true
    if (search) {
      const term = search.toLowerCase()
      matchSearch = (u.name || '').toLowerCase().includes(term) || 
             (u.crewId || '').toLowerCase().includes(term) || 
             (u.email || '').toLowerCase().includes(term)
    }

    let matchRank = true
    if (rankFilter) {
      matchRank = (u.rank || '').trim().toUpperCase() === rankFilter
    }

    return matchSearch && matchRank
  })

  const itemsPerPage = 50
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage)
  const currentUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="users-head">
        <div style={{
          width: '4px',
          height: '36px',
          background: 'linear-gradient(180deg, #0284c7, #38bdf8)',
          borderRadius: '0 4px 4px 0',
          flexShrink: 0
        }} />
        
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'rgba(2,132,199,0.1)',
          color: '#0284c7',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0
        }}>
          <Users size={18} />
        </div>

        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0284c7', opacity: 0.8 }}>Fleet Training · People</span>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: '1px' }}>Crew Users</div>
        </div>

                <div className="users-head-actions">
          {!showForm && (
            <>
              <div className="rpt-search-wrap users-search" style={{ margin: 0 }}>
                <Search size={14} className="rpt-field-icon" />
                <input 
                  type="text" 
                  placeholder="Search by name, crew ID, or email..." 
                  className="rpt-field"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button className="rpt-x-btn" onClick={() => setSearch('')}>
                    <X size={12} />
                  </button>
                )}
              </div>
              
                            <div className="users-rank-wrap" ref={dropdownRef}>
                <div 
                  className="rpt-field users-rank-field" 
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                >
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }}>
                    {rankFilter || 'All Ranks'}
                  </span>
                  <ChevronDown 
                    size={14} 
                    className="mut" 
                    style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} 
                  />
                </div>
                
                {isDropdownOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 50,
                    maxHeight: '240px', overflowY: 'auto'
                  }}>
                    <div 
                      className={`premium-select-option ${!rankFilter ? 'selected' : ''}`}
                      onClick={() => { setRankFilter(''); setIsDropdownOpen(false) }}
                    >
                      All Ranks
                    </div>
                    {uniqueRanks.map(r => (
                      <div 
                        key={r}
                        className={`premium-select-option ${rankFilter === r ? 'selected' : ''}`}
                        onClick={() => { setRankFilter(r); setIsDropdownOpen(false) }}
                      >
                        {r}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
          <button className="btn primary" onClick={() => { setShowForm((s) => !s); setError('') }}>
            {showForm ? <><X size={16} /> Close</> : <><UserPlus size={16} /> Add user</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form className="admin-card" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <Field label="Full name" required>
              <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="e.g. Priya Menon" />
            </Field>
            <Field label="Rank / title">
              <input value={form.rank} onChange={(e) => set('rank', e.target.value)} placeholder="e.g. Third Officer" />
            </Field>
            <Field label="Crew ID" required>
              <input value={form.crewId} onChange={(e) => set('crewId', e.target.value)} placeholder="e.g. OZ1101" />
            </Field>
            <Field label="Date of birth (DDMMYYYY)" required>
              <input value={form.dob} inputMode="numeric" maxLength={8}
                onChange={(e) => set('dob', e.target.value.replace(/\D/g, ''))} placeholder="25032004" />
            </Field>
            <Field label="Passport no.">
              <input value={form.ppNo} onChange={(e) => set('ppNo', e.target.value)} placeholder="e.g. PP-6120" />
            </Field>
          </div>

          {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      )}

      <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="admin-table-wrap users-table-wrap" style={{ flex: 1 }}>
  <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>SI No.</th><th>Name</th><th>Role</th><th>Login ID</th><th>Rank</th>
                <th>Mobile No</th><th>Courses</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {currentUsers.map((u, index) => (
                <tr key={u.id} className={`${u.isActive ? '' : 'row-inactive'} premium-table-row`}>
                  <td className="mut" style={{ fontSize: 12 }}>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td>
                    <div className="users-name-cell">
  <div style={{
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(2,132,199,0.1)',
    color: '#0284c7',
    display: 'grid',
    placeItems: 'center',
    fontSize: '12px',
    fontWeight: 700,
    flexShrink: 0
  }}>
    {getInitials(u.name)}
  </div>
  <b className="users-name-text">{u.name}</b>
</div>
                  </td>
                <td><span className={`pill ${u.role}`}>{u.role === 'super_admin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Crew'}</span></td>
                <td className="mono">{u.role === 'admin' || u.role === 'super_admin' ? u.email : u.crewId}</td>
                <td>{u.rank ? u.rank.toUpperCase() : '—'}</td>
                <td className="mono">{formatMobile(u.mobileNo) || '—'}</td>
                <td>{u.role === 'learner' ? `${u.passedCount}/${u.assignedCount} passed` : '—'}</td>
                <td>
                  <span 
                    className={`pill ${u.isActive ? 'ok' : 'off'}`}
                    style={{ 
                      background: u.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', 
                      color: u.isActive ? '#166534' : '#991b1b',
                      border: 'none'
                    }}
                  >
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn sm" onClick={() => toggleActive(u)}>
                    {u.isActive ? <><Ban size={14} /> Deactivate</> : <><Check size={14} /> Activate</>}
                  </button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredUsers.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="admin-field">
      <span>{label}{required && <i className="req">*</i>}</span>
      {children}
    </label>
  )
}
