import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, AlertCircle, ChevronRight, ArrowRight, GraduationCap,
  Ship, Cog, Search, Download, CheckCircle2, XCircle, Users, X,
} from 'lucide-react'
import {
  adminListOrientationPrograms, adminCreateOrientationProgram,
  adminToggleOrientationProgram, adminDeleteOrientationProgram,
  adminDownloadOrientationProgramsXlsx,
} from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'

const EMPTY = { title: '', subtitle: '', department: 'deck', fromRank: '', toRank: '' }

const DECK_RANKS   = ['Third Officer', 'Second Officer', 'Chief Officer', 'Master']
const ENGINE_RANKS = ['Fourth Engineer', 'Third Engineer', 'Second Engineer', 'Chief Engineer']

export default function AdminOrientationPrograms() {
  const navigate = useNavigate()
  const [programs, setPrograms] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [q, setQ] = useState('')
  const { confirm, dialog } = useConfirm()
  const [deptFilter, setDeptFilter] = useState('')

  const load = () => adminListOrientationPrograms().then(setPrograms).catch(() => setPrograms([]))
  useEffect(() => { load() }, [])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // Auto-fill ranks when dept changes
  const setDept = (dept) => {
    setForm((f) => ({ ...f, department: dept, fromRank: '', toRank: '' }))
  }

  const create = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.title.trim()) { setError('Title is required'); return }
    setBusy(true)
    try {
      const created = await adminCreateOrientationProgram(form)
      setForm(EMPTY)
      setShowForm(false)
      navigate(`/admin/orientation/${created.id}`)
    } catch (err) {
      setError(err.message || 'Could not create program')
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (e, p) => {
    e.stopPropagation()
    await adminToggleOrientationProgram(p.id)
    load()
  }

  const deleteProgram = async (e, p) => {
    e.stopPropagation()
    if (!(await confirm(`"${p.title}" will be removed along with all its tasks and enrollments. This can't be undone.`, {
      title: 'Delete this program?', confirmLabel: 'Delete', danger: true,
    }))) return
    await adminDeleteOrientationProgram(p.id)
    load()
  }

  const download = async () => {
    setDownloading(true)
    try { await adminDownloadOrientationProgramsXlsx() } catch (err) { setError(err.message) }
    setDownloading(false)
  }

  const visible = useMemo(() => {
    let list = programs || []
    if (deptFilter) list = list.filter((p) => p.department === deptFilter)
    if (q.trim()) {
      const lq = q.trim().toLowerCase()
      list = list.filter((p) =>
        p.title.toLowerCase().includes(lq) ||
        (p.fromRank || '').toLowerCase().includes(lq) ||
        (p.toRank || '').toLowerCase().includes(lq)
      )
    }
    return list
  }, [programs, q, deptFilter])

  const stats = useMemo(() => {
    const all = programs || []
    return {
      total: all.length,
      deck: all.filter((p) => p.department === 'deck').length,
      engine: all.filter((p) => p.department === 'engine').length,
      tasks: all.reduce((s, p) => s + p.taskCount, 0),
      enrolled: all.reduce((s, p) => s + p.enrollmentCount, 0),
    }
  }, [programs])

  const rankOptions = form.department === 'engine' ? ENGINE_RANKS : DECK_RANKS

  if (!programs) return <div className="spinner">Loading programs...</div>

  return (
    <div className="orn-page">
      {dialog}

      {/* ---- Header ---- */}
      <div className="orn-prog-header">
        <div className="orn-prog-header-left">
          <div className="orn-prog-header-icon">
            <GraduationCap size={22} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="orn-title">Orientation Programs</h2>
            <p className="orn-subtitle">One program per promotion step — each has its own task checklist.</p>
          </div>
        </div>
        <div className="orn-prog-header-actions">
          <button className="btn" disabled={downloading || programs.length === 0} onClick={download}>
            <Download size={14} /> {downloading ? 'Downloading...' : 'Export Excel'}
          </button>
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            <Plus size={15} /> New Program
          </button>
        </div>
      </div>

      {/* ---- Stats strip + search/filter (right side) ---- */}
      {programs.length > 0 && (
        <div className="orn-prog-stats">
          <div className="orn-prog-stats-group">
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val">{stats.total}</span>
              <span className="orn-prog-stat-lbl">Programs</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-deck)' }}>{stats.deck}</span>
              <span className="orn-prog-stat-lbl">Deck</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val" style={{ color: 'var(--orn-engine)' }}>{stats.engine}</span>
              <span className="orn-prog-stat-lbl">Engine</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val">{stats.tasks}</span>
              <span className="orn-prog-stat-lbl">Total tasks</span>
            </div>
            <div className="orn-prog-stat-sep" />
            <div className="orn-prog-stat">
              <span className="orn-prog-stat-val">{stats.enrolled}</span>
              <span className="orn-prog-stat-lbl">Enrolled officers</span>
            </div>
          </div>

          <div className="orn-prog-stats-filters">
            <div className="inputwrap orn-filter-search">
              <Search size={14} />
              <input placeholder="Search programs..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="orn-dept-pills">
              {[['', 'All', stats.total], ['deck', 'Deck', stats.deck], ['engine', 'Engine', stats.engine]].map(([d, lbl, count]) => (
                <button key={d || 'all'}
                  className={`orn-dept-pill orn-dept-pill--${d || 'all'}${deptFilter === d ? ' orn-dept-pill--active' : ''}`}
                  onClick={() => setDeptFilter(d)}>
                  {d === 'deck' && <Ship size={12} />}
                  {d === 'engine' && <Cog size={12} />}
                  {lbl}
                  <span className="orn-dept-pill-count">{count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- Create form ---- */}
      {showForm && (
        <form onSubmit={create} className="orn-panel">
          <div className="orn-panel-head">
            <div className="orn-panel-head-icon"><GraduationCap size={16} /></div>
            <div>
              <div className="orn-panel-head-title">New orientation program</div>
              <div className="orn-panel-head-sub">One checklist per promotion step</div>
            </div>
          </div>
          <div className="orn-panel-body">
            {error && <div className="form-error"><AlertCircle size={14} /> {error}</div>}
            <div className="orn-form-grid-2">
              <div className="field">
                <label>Program title *</label>
                <div className="inputwrap">
                  <input value={form.title} onChange={(e) => set('title', e.target.value)}
                    placeholder="e.g. 2nd Officer to Chief Officer" autoFocus />
                </div>
              </div>
              <div className="field">
                <label>Subtitle <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
                <div className="inputwrap">
                  <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)}
                    placeholder="e.g. Deck mentoring checklist" />
                </div>
              </div>
            </div>
            <div className="orn-form-grid-3">
              <div className="field">
                <label>Department</label>
                <CardSelect value={form.department} onChange={setDept} options={[
                  { value: 'deck', label: 'Deck', description: 'Master approves', icon: Ship },
                  { value: 'engine', label: 'Engine', description: 'Chief Engineer approves', icon: Cog },
                ]} />
              </div>
              <div className="field">
                <label>Promoting from</label>
                <CardSelect value={form.fromRank} onChange={(v) => set('fromRank', v)} placeholder="Select rank..."
                  options={rankOptions.map((r) => ({ value: r, label: r }))} />
              </div>
              <div className="field">
                <label>Promoting to</label>
                <CardSelect value={form.toRank} onChange={(v) => set('toRank', v)} placeholder="Select rank..."
                  options={rankOptions.map((r) => ({ value: r, label: r }))} />
              </div>
            </div>
          </div>
          <div className="orn-panel-foot">
            <button className="btn primary" disabled={busy} type="submit">
              <Plus size={14} /> {busy ? 'Creating...' : 'Create & build tasks'}
            </button>
            <button className="btn" type="button" onClick={() => { setShowForm(false); setError('') }}><X size={14} /> Cancel</button>
          </div>
        </form>
      )}

      {error && !showForm && <div className="form-error"><AlertCircle size={14} /> {error}</div>}

      {/* ---- List ---- */}
      {programs.length === 0 ? (
        <div className="orn-empty">
          <GraduationCap size={36} className="orn-empty-icon" />
          <div className="orn-empty-title">No orientation programs yet</div>
          <div className="orn-empty-desc">Click <strong>New Program</strong> to create a promotion checklist.</div>
        </div>
      ) : visible.length === 0 ? (
        <div className="orn-empty">
          <Search size={28} className="orn-empty-icon" />
          <div className="orn-empty-title">No programs match</div>
          <div className="orn-empty-desc">Try a different search or filter.</div>
        </div>
      ) : (
        <div className="orn-prog-list">
          {visible.map((p) => (
            <div key={p.id}
              onClick={() => navigate(`/admin/orientation/${p.id}`)}
              className={`orn-prog-card orn-prog-card--${p.department}${!p.isActive ? ' orn-prog-card--inactive' : ''}`}>
              {/* left accent icon */}
              <div className="orn-prog-card-icon">
                {p.department === 'deck' ? <Ship size={22} /> : <Cog size={22} />}
              </div>

              {/* body */}
              <div className="orn-prog-card-body">
                <div className="orn-prog-card-title-row">
                  <span className="orn-prog-card-title">{p.title}</span>
                  {!p.isActive && <span className="chip neutral" style={{ fontSize: 11 }}>Inactive</span>}
                </div>
                {p.subtitle && <div className="orn-prog-card-subtitle">{p.subtitle}</div>}
                {p.fromRank && p.toRank && (
                  <div className="orn-prog-card-ranks">
                    <span>{p.fromRank}</span>
                    <ArrowRight size={13} />
                    <span>{p.toRank}</span>
                  </div>
                )}
              </div>

              {/* meta chips */}
              <div className="orn-prog-card-meta">
                <div className="orn-prog-meta-chip">
                  <span className="orn-prog-meta-num">{p.taskCount}</span>
                  <span className="orn-prog-meta-lbl">tasks</span>
                </div>
                <div className="orn-prog-meta-chip">
                  <Users size={11} />
                  <span className="orn-prog-meta-num">{p.enrollmentCount}</span>
                  <span className="orn-prog-meta-lbl">enrolled</span>
                </div>
              </div>

              {/* action buttons */}
              <div className="orn-prog-card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="btn sm" title={p.isActive ? 'Deactivate' : 'Activate'}
                  onClick={(e) => toggleActive(e, p)}>
                  {p.isActive ? <CheckCircle2 size={13} color="var(--orn-status-approved)" /> : <XCircle size={13} />}
                </button>
              </div>

              <ChevronRight size={16} color="var(--text-faint)" style={{ flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
