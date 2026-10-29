import './AdminUserManagement.css'
import { useEffect, useState } from 'react'
import { Shield, Crown, UserPlus, Pencil, Save, X, Mail, Lock, User,
         Briefcase, Eye, EyeOff, Check, Ban, AlertCircle, Search, Users,
         Building2, Anchor, Wrench, ShieldCheck, Award, BookOpen,
         GraduationCap, ClipboardList, ClipboardCheck } from 'lucide-react'
import { adminPanelListAdmins, adminPanelCreateAdmin, adminPanelUpdateAdmin, adminListOfficeStaff } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'
import CardSelect from '../../components/CardSelect.jsx'
import { useAuth } from '../../auth.jsx'

const EMPTY_CREATE = {
  role: 'admin',
  fullName: '',
  email: '',
  password: '',
  rank: '',
  modules: [],
  department: '',
  designation: '',
}

const ROLE_OPTIONS = [
  {
    value: 'admin',
    label: 'Standard Admin',
    description: 'Customizable module permissions and optional briefing department sign-offs',
    icon: Shield,
  },
  {
    value: 'super_admin',
    label: 'Super Admin',
    description: 'Full unrestricted system access across all modules and user administration',
    icon: Crown,
  },
]

const MODULE_OPTIONS = [
  {
    key: 'courses',
    label: 'Course Management',
    desc: 'Catalog, modules, lesson builder & seafarer certificates',
    icon: BookOpen,
  },
  {
    key: 'orientation',
    label: 'Orientation Program',
    desc: 'Promotion programs, checklists & onboard vessel sign-offs',
    icon: GraduationCap,
  },
  {
    key: 'assessment',
    label: 'Assessment (Screening)',
    desc: 'Screening exams, question banks & candidate score evaluation',
    icon: ClipboardList,
  },
  {
    key: 'briefing',
    label: 'Pre-joining Briefing',
    desc: 'Department briefing packets, declarations & sign-offs',
    icon: ClipboardCheck,
  },
  {
    key: 'user_management',
    label: 'User Management',
    desc: 'Provisioning admin accounts, permissions & office staff',
    icon: Users,
  },
]

const DEPARTMENT_OPTIONS = [
  { value: '', label: '— None (No department) —', description: 'Not assigned to any briefing department', icon: Ban },
  { value: 'qhse', label: 'QHSE Department', description: 'Quality, Health, Safety & Environment briefing sign-offs', icon: ShieldCheck },
  { value: 'marine', label: 'Marine Department', description: 'Nautical & deck operations briefing sign-offs', icon: Anchor },
  { value: 'technical', label: 'Technical Department', description: 'Engine machinery & technical briefing sign-offs', icon: Wrench },
  { value: 'manning_it_accounts', label: 'Manning / IT / Accounts', description: 'Crew logistics, IT systems & payroll briefing sign-offs', icon: Building2 },
]

const DESIGNATION_OPTIONS = [
  { value: '', label: '— None (Standard Admin) —', description: 'Standard administrator without executive sign-off authority', icon: Shield },
  { value: 'technical_director', label: 'Technical Director', description: 'Final sign-off authority for technical & engineering sections', icon: Award },
  { value: 'managing_director', label: 'Managing Director', description: 'Executive approval authority across all briefing sections', icon: Crown },
]

/* Module access + briefing department/designation, shown to anyone who can open
   User management. A super_admin target always has every module, so no fields. */
function AccessFields({ form, set }) {
  if (form.role !== 'admin') {
    return (
      <div className="admin-super-banner">
        <div className="admin-super-banner-icon">
          <Crown size={16} />
        </div>
        <div>
          <div className="admin-super-banner-title">Super Admin Privileges Active</div>
          <div className="admin-super-banner-text">
            Super Admins bypass module restrictions and have unrestricted system access across Course Management, Orientation, Screening, Pre-joining Briefing, and User Management.
          </div>
        </div>
      </div>
    )
  }

  const toggleModule = (key) => {
    const next = form.modules.includes(key)
      ? form.modules.filter(m => m !== key)
      : [...form.modules, key]
    set('modules', next)
  }

  const selectAllModules = () => set('modules', MODULE_OPTIONS.map(m => m.key))
  const clearAllModules = () => set('modules', [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Module Access Selection */}
      <div className="admin-form-section">
        <div className="admin-form-section-header">
          <div className="admin-form-section-title">
            <Shield size={13} />
            <span>Module Access Control</span>
          </div>
          <div className="admin-quick-actions">
            <button type="button" className="admin-quick-btn" onClick={selectAllModules}>
              Select All
            </button>
            <span style={{ color: 'var(--border)' }}>•</span>
            <button type="button" className="admin-quick-btn" onClick={clearAllModules}>
              Clear
            </button>
            <span className="admin-form-section-badge">
              {form.modules.length} of {MODULE_OPTIONS.length} active
            </span>
          </div>
        </div>

        <div className="admin-module-grid">
          {MODULE_OPTIONS.map((m) => {
            const active = form.modules.includes(m.key)
            const Icon = m.icon
            return (
              <div
                key={m.key}
                role="checkbox"
                aria-checked={active}
                tabIndex={0}
                className={`admin-module-card${active ? ' admin-module-card--active' : ''}`}
                onClick={() => toggleModule(m.key)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault()
                    toggleModule(m.key)
                  }
                }}
              >
                <div className="admin-module-card-icon">
                  <Icon size={16} />
                </div>
                <div className="admin-module-card-info">
                  <div className="admin-module-card-title">{m.label}</div>
                  <div className="admin-module-card-desc">{m.desc}</div>
                </div>
                <div className="admin-module-checkbox">
                  <Check size={12} strokeWidth={3} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Briefing & Approver Authority with Modern Card Dropdowns */}
      <div className="admin-form-section">
        <div className="admin-form-section-header">
          <div className="admin-form-section-title">
            <Award size={13} />
            <span>Briefing & Approver Authority</span>
          </div>
          <span className="admin-form-section-badge">Optional Sign-Off</span>
        </div>

        <div className="admin-modal-form-grid">
          <Field label="Briefing Department" icon={<Building2 size={13} />}>
            <CardSelect
              value={form.department || ''}
              onChange={val => set('department', val)}
              options={DEPARTMENT_OPTIONS}
              placeholder="Select department..."
              placement="top"
            />
          </Field>
          <Field label="Briefing Approver Role" icon={<Award size={13} />}>
            <CardSelect
              value={form.designation || ''}
              onChange={val => set('designation', val)}
              options={DESIGNATION_OPTIONS}
              placeholder="Select approver role..."
              placement="top"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const ROLE_CONFIG = {
  admin: {
    label: 'Admin',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.13)',
    border: 'rgba(99,102,241,0.28)',
    gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    Icon: Shield,
  },
  super_admin: {
    label: 'Super Admin',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.13)',
    border: 'rgba(245,158,11,0.28)',
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
    Icon: Crown,
  },
}

function RolePill({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.admin
  const Icon = cfg.Icon
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em',
      padding: '3px 11px', borderRadius: '99px',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      <Icon size={11} strokeWidth={2.5} />
      {cfg.label}
    </span>
  )
}

function formatDate(iso) {
  if (!iso) return '—'
  const withOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}+05:30`
  return new Date(withOffset).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/* ─── Modal Shell ─── */
function Modal({ title, subtitle, icon, accent, onClose, maxWidth, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="admin-user-modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="admin-user-modal" style={maxWidth ? { width: maxWidth } : undefined}>
        <div className="admin-user-modal-header">
          <div className="admin-user-modal-icon-badge" style={{ background: accent.gradient }}>
            {icon}
          </div>
          <div className="admin-user-modal-title-wrap">
            <h3 className="admin-user-modal-title">{title}</h3>
            {subtitle && <div className="admin-user-modal-subtitle">{subtitle}</div>}
          </div>
          <button
            type="button"
            className="admin-user-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── Create Admin Modal ─── */
function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_CREATE)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const cfg = ROLE_CONFIG[form.role]

  const create = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    if (!form.email.trim()) { setError('Email is required'); return }
    if (!form.password || form.password.length < 8) {
      setError('Password must be at least 8 characters'); return
    }
    setError(''); setBusy(true)
    try {
      const body = { ...form, fullName: form.fullName.trim(), email: form.email.trim() }
      if (form.role !== 'admin') {
        delete body.modules; delete body.department; delete body.designation
      } else {
        body.department = form.department || null
        body.designation = form.designation || null
      }
      await adminPanelCreateAdmin(body)
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title="Create New Admin User"
      subtitle="Provision a new administrative account with role-based module access and sign-off privileges"
      icon={<UserPlus size={18} />}
      accent={cfg}
      onClose={onClose}
    >
      <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="admin-user-modal-body">
          {/* Section 1: Role Selection via Modern Card Dropdown & Quick Select */}
          <div className="admin-form-section">
            <div className="admin-form-section-header">
              <div className="admin-form-section-title">
                <Crown size={13} />
                <span>Account Role & Privilege Level</span>
              </div>
              <span className="admin-form-section-badge">Required</span>
            </div>

            <Field label="Administrator Role" icon={<Shield size={13} />} required>
              <CardSelect
                value={form.role}
                onChange={v => set('role', v)}
                options={ROLE_OPTIONS}
                placeholder="Select role..."
              />
            </Field>
          </div>

          {/* Section 2: Personal Credentials */}
          <div className="admin-form-section">
            <div className="admin-form-section-header">
              <div className="admin-form-section-title">
                <User size={13} />
                <span>Administrator Credentials</span>
              </div>
              <span className="admin-form-section-badge">Required</span>
            </div>

            <div className="admin-modal-form-grid">
              <Field label="Full Name" icon={<User size={13} />} required>
                <div className="admin-input-wrap">
                  <input
                    value={form.fullName}
                    onChange={e => set('fullName', e.target.value)}
                    placeholder="e.g. Capt. Rajan Kumar"
                    required
                  />
                </div>
              </Field>

              <Field label="Title / Designation" icon={<Briefcase size={13} />}>
                <div className="admin-input-wrap">
                  <input
                    value={form.rank}
                    onChange={e => set('rank', e.target.value)}
                    placeholder="e.g. Fleet Training Manager"
                  />
                </div>
              </Field>

              <Field label="Email Address" icon={<Mail size={13} />} required>
                <div className="admin-input-wrap">
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="name@ozellarmarine.com"
                    required
                  />
                </div>
              </Field>

              <Field label="Password (min 8 chars)" icon={<Lock size={13} />} required>
                <div className="admin-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="••••••••"
                    required
                    style={{ paddingRight: 65 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="admin-password-toggle-btn"
                  >
                    {showPassword ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show</>}
                  </button>
                </div>
                {form.password && (
                  <div style={{
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 3,
                    color: form.password.length >= 8 ? '#16a34a' : 'var(--text-mut)',
                    fontWeight: 500,
                  }}>
                    {form.password.length >= 8 ? (
                      <><Check size={11} strokeWidth={2.5} /> Password requirement met ({form.password.length} chars)</>
                    ) : (
                      <>Requires at least {8 - form.password.length} more character{8 - form.password.length === 1 ? '' : 's'}</>
                    )}
                  </div>
                )}
              </Field>
            </div>
          </div>

          {/* Section 3: Module Permissions and Briefing Authority */}
          <AccessFields form={form} set={set} />

          {error && (
            <div className="form-error" style={{ margin: 0 }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}
        </div>

        <div className="admin-user-modal-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn primary"
            disabled={busy}
            style={{ background: cfg.gradient }}
          >
            <UserPlus size={15} />
            {busy ? 'Creating Account…' : `Create ${cfg.label}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Edit Admin Modal ─── */
function EditModal({ user, onClose, onSaved }) {
  const { user: me } = useAuth()
  const isSelf = me?.id === user.id
  const [form, setForm] = useState({
    fullName: user.name || '',
    rank: user.rank || '',
    role: user.role || 'admin',
    modules: user.modules || [],
    department: user.department || '',
    designation: user.designation || '',
  })
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cfg = ROLE_CONFIG[form.role] || ROLE_CONFIG.admin

  const save = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    setError(''); setBusy(true)
    try {
      const body = { fullName: form.fullName.trim(), rank: form.rank.trim(), role: form.role }
      if (form.role === 'admin') {
        body.modules = form.modules
        body.department = form.department || null
        body.designation = form.designation || null
      }
      await adminPanelUpdateAdmin(user.id, body)
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save changes')
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title={`Edit ${ROLE_CONFIG[user.role]?.label || 'Admin'} User`}
      subtitle="Modify administrator profile, system role, and access rights"
      icon={<Pencil size={16} />}
      accent={cfg}
      onClose={onClose}
    >
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="admin-user-modal-body">
          <div className="admin-form-section">
            <div className="admin-form-section-header">
              <div className="admin-form-section-title">
                <Crown size={13} />
                <span>Account Role</span>
              </div>
              {isSelf && <span className="admin-form-section-badge">Cannot change self</span>}
            </div>

            <Field label="System Role" icon={<Shield size={13} />} required>
              <CardSelect
                value={form.role}
                onChange={v => !isSelf && setField('role', v)}
                options={ROLE_OPTIONS}
                disabled={isSelf}
                placeholder="Select role..."
              />
            </Field>
          </div>

          <div className="admin-form-section">
            <div className="admin-form-section-header">
              <div className="admin-form-section-title">
                <User size={13} />
                <span>Administrator Details</span>
              </div>
            </div>

            <div className="admin-modal-form-grid">
              <Field label="Email Address" icon={<Mail size={13} />}>
                <div style={{
                  padding: '9px 12px', borderRadius: 9,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: 13, color: 'var(--text-mut)', fontFamily: 'monospace',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Mail size={13} /> {user.email}
                </div>
              </Field>

              <Field label="Full Name" icon={<User size={13} />} required>
                <div className="admin-input-wrap">
                  <input
                    value={form.fullName}
                    onChange={e => setField('fullName', e.target.value)}
                    placeholder="e.g. Capt. Rajan Kumar"
                    required
                  />
                </div>
              </Field>

              <Field label="Title / Designation" icon={<Briefcase size={13} />}>
                <div className="admin-input-wrap">
                  <input
                    value={form.rank}
                    onChange={e => setField('rank', e.target.value)}
                    placeholder="e.g. Fleet Training Manager"
                  />
                </div>
              </Field>
            </div>
          </div>

          <AccessFields form={form} set={setField} />

          {error && <div className="form-error"><AlertCircle size={14} /> {error}</div>}
        </div>

        <div className="admin-user-modal-footer">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn primary"
            style={{ background: cfg.gradient }}
          >
            <Save size={15} />
            {busy ? 'Saving Changes…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Field({ label, icon, required, children }) {
  return (
    <label className="admin-field">
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <span style={{ color: 'var(--text-mut)' }}>{icon}</span>}
        {label}{required && <i className="req">*</i>}
      </span>
      {children}
    </label>
  )
}

/* ─── Main Page ─── */
export default function AdminUserManagement() {
  const [admins, setAdmins] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Office Staff section
  const [activeTab, setActiveTab] = useState('admin') // 'admin' | 'office_staff'
  const [officeStaff, setOfficeStaff] = useState(null)
  const [osSearch, setOsSearch] = useState('')
  const [osLoading, setOsLoading] = useState(false)

  const load = () => adminPanelListAdmins().then(setAdmins).catch(() => setAdmins([]))
  const loadOfficeStaff = () => {
    setOsLoading(true)
    adminListOfficeStaff().then(setOfficeStaff).catch(() => setOfficeStaff([])).finally(() => setOsLoading(false))
  }

  useEffect(() => {
    load()
    loadOfficeStaff()
  }, [])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'office_staff' && officeStaff === null) loadOfficeStaff()
  }

  const toggle = async (u) => {
    await adminPanelUpdateAdmin(u.id, { isActive: !u.isActive })
    load()
  }

  const filtered = (admins || []).filter(u => {
    const matchRole = roleFilter === 'all' ? true : u.role === roleFilter
    if (!matchRole) return false
    if (!search.trim()) return true
    const term = search.trim().toLowerCase()
    return (u.name || '').toLowerCase().includes(term) ||
           (u.email || '').toLowerCase().includes(term) ||
           (u.rank || '').toLowerCase().includes(term)
  })

  const osFiltered = (officeStaff || []).filter(u => {
    if (!osSearch.trim()) return true
    const term = osSearch.trim().toLowerCase()
    return (u.name || '').toLowerCase().includes(term) ||
           (u.crewId || '').toLowerCase().includes(term) ||
           (u.nationality || '').toLowerCase().includes(term)
  })

  const counts = {
    all: (admins || []).length,
    admin: (admins || []).filter(u => u.role === 'admin').length,
    super_admin: (admins || []).filter(u => u.role === 'super_admin').length,
  }

  // Pagination for Admin users
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  useEffect(() => { setCurrentPage(1) }, [search, roleFilter, activeTab])
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1
  const paginatedAdmins = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // Pagination for Office Staff
  const [osCurrentPage, setOsCurrentPage] = useState(1)
  const osItemsPerPage = 10
  useEffect(() => { setOsCurrentPage(1) }, [osSearch, activeTab])
  const osTotalPages = Math.ceil(osFiltered.length / osItemsPerPage) || 1
  const paginatedOs = osFiltered.slice((osCurrentPage - 1) * osItemsPerPage, osCurrentPage * osItemsPerPage)

  if (admins === null) return <div className="spinner">Loading admins…</div>

  return (
    <div className="um-wrapper">

      {/* ── Page Header ── */}
      <div className="um-header">
        <div className="um-header-brand">
          <div className="um-header-accent-bar" />
          <div className="um-header-icon">
            <Shield size={19} />
          </div>
          <div>
            <div className="um-header-eyebrow">Admin Panel · Access</div>
            <div className="um-header-title">User Management</div>
          </div>
        </div>

        <div className="um-header-actions">
          {activeTab === 'admin' ? (
            <>
              <div className="um-header-stat-pill">
                <Shield size={13} color="#6366f1" />
                <span>{(admins || []).length} Admins</span>
                <span style={{ opacity: 0.4 }}>•</span>
                <span style={{ color: '#16a34a' }}>{(admins || []).filter(u => u.isActive).length} Active</span>
              </div>
              <button
                className="um-add-btn"
                id="add-admin-btn"
                onClick={() => setShowCreate(true)}
              >
                <UserPlus size={15} /> Add Admin
              </button>
            </>
          ) : (
            <span className="um-header-stat-pill">
              <Briefcase size={13} color="var(--accent)" />
              {officeStaff ? `${officeStaff.length} Office Staff in Directory` : 'Office Staff Directory'}
            </span>
          )}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="um-tabs-bar">
        <button
          type="button"
          onClick={() => handleTabChange('admin')}
          className={`um-tab-btn${activeTab === 'admin' ? ' um-tab-btn--active-admin' : ''}`}
        >
          <Shield size={15} />
          <span>Admin Users</span>
          <span className="um-tab-badge">
            {(admins || []).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('office_staff')}
          className={`um-tab-btn${activeTab === 'office_staff' ? ' um-tab-btn--active-os' : ''}`}
        >
          <Briefcase size={15} />
          <span>Office Staff</span>
          <span className="um-tab-badge">
            {officeStaff !== null ? officeStaff.length : '40'}
          </span>
        </button>
      </div>

      {/* ── Main Body & Card ── */}
      <div className="um-body">
        <div className="um-card">
          {/* Sub-Toolbar: Search & Filter Row */}
          <div className="um-toolbar">
            {activeTab === 'admin' ? (
              <>
                <div className="um-search-wrap">
                  <Search size={14} className="um-search-icon" />
                  <input
                    type="text"
                    placeholder="Search admin users by name, email, or title..."
                    className="um-search-input"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button type="button" className="um-search-clear" onClick={() => setSearch('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="um-filter-group">
                  {['all', 'admin', 'super_admin'].map(key => {
                    const active = roleFilter === key
                    const label = key === 'all' ? 'All Roles' : ROLE_CONFIG[key].label
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setRoleFilter(key)}
                        className={`um-filter-btn${active ? ' um-filter-btn--active' : ''}`}
                      >
                        <span>{label}</span>
                        <span className="um-filter-badge">
                          {counts[key]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="um-search-wrap">
                  <Search size={14} className="um-search-icon" />
                  <input
                    type="text"
                    placeholder="Search office staff by name, crew ID, nationality…"
                    className="um-search-input"
                    value={osSearch}
                    onChange={e => setOsSearch(e.target.value)}
                  />
                  {osSearch && (
                    <button type="button" className="um-search-clear" onClick={() => setOsSearch('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-mut)', fontWeight: 500 }}>
                  Showing <strong style={{ color: 'var(--text)' }}>{osFiltered.length}</strong> of{' '}
                  <strong style={{ color: 'var(--text)' }}>{officeStaff?.length || 40}</strong> office staff members
                </div>
              </>
            )}
          </div>

          {/* Table Area */}
          {activeTab === 'admin' ? (
            filtered.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '60px 20px', gap: '16px', color: 'var(--text-mut)',
              }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'grid', placeItems: 'center' }}>
                  <Users size={28} color="#6366f1" strokeWidth={1.5} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '5px' }}>
                    No administrator users found
                  </div>
                  <div style={{ fontSize: '13px' }}>Try a different search or click "Add Admin" to create one.</div>
                </div>
              </div>
            ) : (
              <div className="um-table-wrap">
                <table className="um-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>Administrator</th>
                      <th>Role</th>
                      <th>Email</th>
                      <th>Title / Designation</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedAdmins.map((u, index) => (
                      <tr key={u.id} className={u.isActive ? '' : 'row-inactive'}>
                        <td className="mut" style={{ fontSize: 12 }}>{(currentPage - 1) * itemsPerPage + index + 1}</td>
                        <td>
                          <div className="um-user-name-cell">
                            <div
                              className="um-user-avatar"
                              style={{ background: (ROLE_CONFIG[u.role] || ROLE_CONFIG.admin).gradient }}
                            >
                              {getInitials(u.name)}
                            </div>
                            <div className="um-user-name-title">
                              <span className="um-user-name">{u.name}</span>
                              {u.department && (
                                <span className="um-user-subtitle">
                                  Dept: {u.department.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="um-cell-nowrap"><RolePill role={u.role} /></td>
                        <td className="mono um-cell-nowrap">{u.email}</td>
                        <td className="um-cell-nowrap">{u.rank || '—'}</td>
                        <td className="um-cell-nowrap">{formatDate(u.createdAt)}</td>
                        <td className="um-cell-nowrap">
                          <span className={`um-status-pill ${u.isActive ? 'um-status-pill--active' : 'um-status-pill--inactive'}`}>
                            <span className="um-status-dot" />
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="um-actions-cell">
                          <button type="button" className="um-action-btn" onClick={() => setEditUser(u)}>
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className={`um-action-btn ${u.isActive ? 'um-action-btn--danger' : ''}`}
                            onClick={() => toggle(u)}
                          >
                            {u.isActive ? <><Ban size={13} /> Deactivate</> : <><Check size={13} /> Activate</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            osLoading ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-mut)' }}>
                Loading office staff…
              </div>
            ) : osFiltered.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '60px 20px', gap: '16px', color: 'var(--text-mut)',
              }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(224,120,32,0.1)', display: 'grid', placeItems: 'center' }}>
                  <Briefcase size={28} color="var(--accent)" strokeWidth={1.5} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '5px' }}>
                    {officeStaff?.length === 0 ? 'No office staff found in the system' : 'No results match your search'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="um-table-wrap">
                <table className="um-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>Staff Member</th>
                      <th>Crew ID</th>
                      <th>Nationality</th>
                      <th>Assigned Vessel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOs.map((u, index) => (
                      <tr key={u.id}>
                        <td className="mut" style={{ fontSize: 12 }}>{(osCurrentPage - 1) * osItemsPerPage + index + 1}</td>
                        <td>
                          <div className="um-user-name-cell">
                            <div
                              className="um-user-avatar"
                              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
                            >
                              {getInitials(u.name)}
                            </div>
                            <div className="um-user-name-title">
                              <span className="um-user-name">{u.name}</span>
                              <span className="um-user-subtitle">OFFICE STAFF</span>
                            </div>
                          </div>
                        </td>
                        <td className="um-cell-nowrap">
                          <span className="mono" style={{ background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>
                            {u.crewId || '—'}
                          </span>
                        </td>
                        <td className="um-cell-nowrap">{u.nationality || '—'}</td>
                        <td className="um-cell-nowrap mut">{u.currentVessel || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Footer / Pagination */}
          {activeTab === 'admin' ? (
            filtered.length > 0 && (
              <div className="um-card-footer">
                <div className="um-card-footer-info">
                  Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, filtered.length)}</strong> of <strong>{filtered.length}</strong> administrator accounts
                </div>
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )
          ) : (
            osFiltered.length > 0 && (
              <div className="um-card-footer">
                <div className="um-card-footer-info">
                  Showing <strong>{(osCurrentPage - 1) * osItemsPerPage + 1}</strong> to <strong>{Math.min(osCurrentPage * osItemsPerPage, osFiltered.length)}</strong> of <strong>{osFiltered.length}</strong> office staff members
                </div>
                <Pagination
                  currentPage={osCurrentPage}
                  totalPages={osTotalPages}
                  totalItems={osFiltered.length}
                  itemsPerPage={osItemsPerPage}
                  onPageChange={setOsCurrentPage}
                />
              </div>
            )
          )}
        </div>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {editUser && <EditModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
    </div>
  )
}
