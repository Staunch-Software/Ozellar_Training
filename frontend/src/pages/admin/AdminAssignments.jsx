import { useEffect, useState, useRef } from 'react'
import { Check, Award, Clock, Search, X, ChevronDown, Grid3x3, Phone } from 'lucide-react'
import { adminReport, adminAssign, adminUnassign } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'

const formatMobile = (mobileNo) => {
  if (!mobileNo || mobileNo.length !== 10) return mobileNo || null
  return `${mobileNo.slice(0, 5)} ${mobileNo.slice(5)}`
}

export default function AdminAssignments() {
  const [data, setData] = useState(null)
  const [pending, setPending] = useState({})   // key `${learnerId}:${courseId}` while toggling
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  const load = () => adminReport().then(setData)
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

  const toggle = async (learnerId, courseId, assigned) => {
    const key = `${learnerId}:${courseId}`
    setPending((p) => ({ ...p, [key]: true }))
    try {
      if (assigned) await adminUnassign(learnerId, courseId)
      else await adminAssign(learnerId, courseId)
      await load()
    } finally {
      setPending((p) => { const n = { ...p }; delete n[key]; return n })
    }
  }

  if (!data) return <div className="spinner">Loading assignments…</div>

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

  const itemsPerPage = 50
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage)
  const currentRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const totalAssignments = data.rows.reduce((sum, row) => sum + Object.keys(row.cells || {}).length, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 0',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '4px',
          height: '36px',
          background: 'linear-gradient(180deg, #7c3aed, #a855f7)',
          borderRadius: '0 4px 4px 0',
          flexShrink: 0
        }}></div>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: 'rgba(124,58,237,0.1)',
          color: '#7c3aed',
          display: 'grid',
          placeItems: 'center'
        }}>
          <Grid3x3 size={18} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c3aed', opacity: 0.8 }}>Fleet Training · Enrollments</span>
          <h1 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', margin: '1px 0 0' }}>Assignments</h1>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <div className="rpt-search-wrap" style={{ minWidth: 280, maxWidth: 400, margin: 0 }}>
            <Search size={14} className="rpt-field-icon" />
            <input
              type="text"
              placeholder="Search by name, crew ID, or rank..."
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

          <div style={{ position: 'relative', width: '260px', flex: '0 0 260px' }} ref={dropdownRef}>
            <div
              className="rpt-field"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: '260px', background: '#fff' }}
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
        </div>
      </div>


      <p className="mut" style={{ marginBottom: 16, marginTop: 0 }}>
        Tick a cell to assign a course to a crew member. <Award size={13} style={{ verticalAlign: -2 }} /> passed
        · <Clock size={13} style={{ verticalAlign: -2 }} /> in progress. Unassigning hides the course but keeps their record.
      </p>

      <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="admin-table-wrap" style={{ flex: 1 }}>
          <table className="admin-table matrix">
            <thead>
              <tr>
                <th className="sticky-col">Crew</th>
                {data.courses.map((c) => <th key={c.id}>{c.title}</th>)}
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, index) => (
              <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                <td className="sticky-col">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="mut" style={{ width: 24, fontSize: 11 }}>{(currentPage - 1) * itemsPerPage + index + 1}.</div>
                    <div>
                      <b>{row.name}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span className="mono mut">{row.crewId}</span>
                        {row.rank && <span className="pill learner sm">{row.rank}</span>}
                        {row.mobileNo && (
                          <a
                            href={`tel:${row.mobileNo.replace(/[^\d+]/g, '')}`}
                            title="Call"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px 2px 6px', borderRadius: 999,
                              background: 'rgba(16,185,129,0.1)', color: '#0d9488',
                              fontSize: 11, fontWeight: 600, textDecoration: 'none',
                              border: '1px solid rgba(16,185,129,0.25)', lineHeight: 1.6,
                            }}
                          >
                            <Phone size={10} strokeWidth={2.5} />
                            {formatMobile(row.mobileNo)}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                {data.courses.map((c) => {
                  const cell = row.cells[c.id]
                  const assigned = !!cell
                  const key = `${row.learnerId}:${c.id}`
                  return (
                    <td key={c.id}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                        <button
                          className={`cellbox${assigned ? ' on' : ''}`}
                          disabled={!!pending[key]}
                          title={assigned ? 'Assigned — click to unassign' : 'Not assigned — click to assign'}
                          onClick={() => toggle(row.learnerId, c.id, assigned)}
                        >
                          {assigned && <Check size={15} />}
                        </button>
                        {cell && cell.status === 'passed' && <div className="cell-tag ok"><Award size={12} /> {cell.score}%</div>}
                        {cell && cell.status === 'in-progress' && <div className="cell-tag"><Clock size={12} /> started</div>}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <Pagination 
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  )
}
