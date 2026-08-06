import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, AlertCircle, X, ChevronRight, Search, GraduationCap } from 'lucide-react'
import { adminListCourses, adminCreateCourse, adminListUsers } from '../../api.js'
import AdminHeader from '../../components/AdminHeader.jsx'

const EMPTY = { title: '', subtitle: '', durationLabel: '', passMark: 80, maxAttempts: '' }

export default function AdminCourses() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState(null)
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [targetRanks, setTargetRanks] = useState([])
  const [targetUsers, setTargetUsers] = useState([])
  const [searchRank, setSearchRank] = useState('')
  const [searchCrew, setSearchCrew] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    adminListCourses().then(setCourses)
    adminListUsers().then(setUsers)
  }
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

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
      navigate(`/admin/courses/${created.id}`)
    } catch (err) {
      setError(err.message || 'Could not create course')
    } finally {
      setBusy(false)
    }
  }

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
    }).sort((a,b) => (a.name || '').localeCompare(b.name || ''))
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
      if(!groups[r]) groups[r] = []
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

  if (!courses) return <div className="spinner">Loading courses…</div>

  return (
    <>
      <AdminHeader icon={GraduationCap} title="Courses" eyebrow="Fleet training · Content">
        <button className={showForm ? "btn" : "btn primary"} onClick={() => { setShowForm((s) => !s); setError('') }}>
          {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> New course</>}
        </button>
      </AdminHeader>

      {showForm && (
        <form className="admin-card" onSubmit={create} style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Title" required>
                <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Firefighting" />
              </Field>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Subtitle">
                <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Short desc" />
              </Field>
            </div>
            <div style={{ flex: '1 1 120px' }}>
              <Field label="Duration">
                <input value={form.durationLabel} onChange={(e) => set('durationLabel', e.target.value)} placeholder="2 hours" />
              </Field>
            </div>
            <div style={{ flex: '0 1 100px' }}>
              <Field label="Pass (%)" required>
                <input type="number" min={1} max={100} value={form.passMark}
                  onChange={(e) => set('passMark', e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: '0 1 100px' }}>
              <Field label="Attempts">
                <input type="number" min={1} value={form.maxAttempts}
                  onChange={(e) => set('maxAttempts', e.target.value)} placeholder="Unlim." />
              </Field>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '20px' }}>
            <div style={{ flex: '1 1 300px' }}>
              <Field label="Target Ranks (Auto-enroll)">
                <div className="target-selection-container">
                  <div className="search-bar" style={{ margin: 0, marginBottom: 16 }}>
                    <Search size={14} color="#64748b" />
                    <input type="text" placeholder="Search ranks..." value={searchRank} onChange={e => setSearchRank(e.target.value)} />
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Available Ranks
                    </span>
                    {availableRanks.length > 0 && (
                      <button type="button" onClick={toggleAllRanks} style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>
                        {allRanksSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>

                  {availableRanks.length === 0 ? <div className="mut" style={{ fontSize: 13 }}>No ranks found</div> : null}
                  <div className="chips-grid">
                    {availableRanks.map(r => (
                      <button type="button" key={r} className={`premium-chip ${targetRanks.includes(r) ? 'selected' : ''}`} onClick={() => toggleRank(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
            </div>
            <div style={{ flex: '1 1 300px' }}>
              <Field label="Target Specific Crew (Other crew members)">
                <div className="target-selection-container">
                  <div className="search-bar">
                    <Search size={14} color="#64748b" />
                    <input type="text" placeholder="Search crew by name or rank..." value={searchCrew} onChange={e => setSearchCrew(e.target.value)} />
                  </div>
                  {availableUsers.length === 0 ? <div className="mut" style={{ fontSize: 13, marginTop: 10 }}>No other crew available</div> : null}
                  {Object.keys(availableUsersGrouped).sort((a, b) => {
                    if (a === 'NO RANK') return -1;
                    if (b === 'NO RANK') return 1;
                    return a.localeCompare(b);
                  }).map(rankName => (
                    <div key={rankName} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {rankName}
                      </div>
                      <div className="crew-cards-grid">
                        {availableUsersGrouped[rankName].map(u => (
                          <button type="button" key={u.id} className={`premium-crew-card ${targetUsers.includes(u.id) ? 'selected' : ''}`} onClick={() => toggleUser(u.id)}>
                            <div className="crew-avatar">{u.name.substring(0, 2).toUpperCase()}</div>
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
              </Field>
            </div>
          </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create Course'}</button>
            </div>

          {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}
          <p className="mut" style={{ marginTop: 16, fontSize: 13 }}>
            You'll upload slides/videos and add quizzes on the next screen.
          </p>
        </form>
      )}

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Course</th><th>Modules</th><th>Final assessment</th><th></th></tr>
          </thead>
          <tbody>
            {courses.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/courses/${c.id}`)}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface-2)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid var(--border)' }}>
                      <BookOpen size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.title}</div>
                      {c.subtitle ? <div className="mut" style={{ fontSize: 12.5, marginTop: 4 }}>{c.subtitle}</div> : <div className="mut" style={{ fontSize: 12.5, marginTop: 4 }}>No description provided</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <span className="pill" style={{ background: 'var(--surface-2)' }}>{c.chapterCount} Module{c.chapterCount === 1 ? '' : 's'}</span>
                </td>
                <td>
                  <div style={{ fontSize: 12.5, color: 'var(--text-mut)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{c.questionCount}</span> Qs
                    <span style={{ margin: '0 6px' }}>&middot;</span>
                    Pass <b>{c.passMark}%</b>
                    {c.maxAttempts ? (
                      <>
                        <span style={{ margin: '0 6px' }}>&middot;</span>
                        <b>{c.maxAttempts}</b> attempt{c.maxAttempts === 1 ? '' : 's'}
                      </>
                    ) : null}
                  </div>
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-faint)' }}>
                  <ChevronRight size={18} />
                </td>
              </tr>
            ))}
            {courses.length === 0 && (
              <tr><td colSpan={4} className="mut" style={{ padding: 18 }}>No courses yet — create one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
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
