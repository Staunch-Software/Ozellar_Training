import { useEffect, useState } from 'react'
import { Shield, UserPlus, Check, Ban, AlertCircle, X, Mail, Lock, User,
         Crown, Pencil, Save, Search, Users, Briefcase, ChevronDown, ChevronUp,
         Phone, MapPin, Building2, Eye } from 'lucide-react'
import { adminPanelListAdmins, adminPanelCreateAdmin, adminPanelUpdateAdmin, adminListOfficeStaff } from '../../api.js'
import { useAuth } from '../../auth.jsx'

const EMPTY_CREATE = { role: 'admin', fullName: '', email: '', password: '', rank: '' }

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
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ─── Modal shell ─── */
function Modal({ title, icon, accent, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(2px)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        width: 'min(480px, 100%)', maxHeight: '90vh', overflow: 'auto',
        background: 'var(--surface)', borderRadius: 16,
        border: `1.5px solid ${accent.border}`,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '18px 22px', borderBottom: `1px solid ${accent.border}`,
          background: accent.bg,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: accent.gradient,
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
          }}>
            {icon}
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', flex: 1 }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mut)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  )
}

/* ─── Create Admin modal ─── */
function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_CREATE)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const cfg = ROLE_CONFIG[form.role]

  const create = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      await adminPanelCreateAdmin(form)
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not create user')
    } finally { setBusy(false) }
  }

  return (
    <Modal title="Create New Admin User" icon={<UserPlus size={15} />} accent={cfg} onClose={onClose}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['admin', 'super_admin'].map(r => {
          const c = ROLE_CONFIG[r]; const Icon = c.Icon; const active = form.role === r
          return (
            <button key={r} type="button" onClick={() => set('role', r)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${active ? c.color : 'var(--border)'}`,
              background: active ? c.bg : 'var(--surface-2)',
              color: active ? c.color : 'var(--text-mut)',
              fontWeight: 700, fontSize: 13,
            }}>
              <Icon size={14} /> {c.label}
            </button>
          )
        })}
      </div>

      <form onSubmit={create}>
        <div className="form-grid">
          <Field label="Full Name" icon={<User size={13} />} required>
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="e.g. Capt. Rajan Kumar" required />
          </Field>
          <Field label="Title / Designation" icon={<Shield size={13} />}>
            <input value={form.rank} onChange={e => set('rank', e.target.value)} placeholder="e.g. Fleet Manager" />
          </Field>
          <Field label="Email Address" icon={<Mail size={13} />} required>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="name@ozellarmarine.com" required />
          </Field>
          <Field label="Password (min 8 chars)" icon={<Lock size={13} />} required>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password} onChange={e => set('password', e.target.value)}
                placeholder="••••••••" required style={{ paddingRight: 60 }}
              />
              <button type="button" onClick={() => setShowPassword(s => !s)} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11, fontWeight: 600, color: 'var(--text-mut)',
                background: 'none', border: 'none', cursor: 'pointer',
              }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        </div>

        {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button className="btn primary" disabled={busy} style={{ background: cfg.gradient }}>
            <UserPlus size={14} /> {busy ? 'Creating…' : `Create ${cfg.label}`}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Edit Admin modal ─── */
function EditModal({ user, onClose, onSaved }) {
  const { user: me } = useAuth()
  const isSelf = me?.id === user.id
  const [form, setForm] = useState({ fullName: user.name || '', rank: user.rank || '', role: user.role || 'admin' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const cfg = ROLE_CONFIG[form.role] || ROLE_CONFIG.admin

  const save = async (e) => {
    e.preventDefault()
    if (!form.fullName.trim()) { setError('Full name is required'); return }
    setError(''); setBusy(true)
    try {
      await adminPanelUpdateAdmin(user.id, {
        fullName: form.fullName.trim(), rank: form.rank.trim(), role: form.role,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save changes')
    } finally { setBusy(false) }
  }

  return (
    <Modal title={`Edit ${ROLE_CONFIG[user.role]?.label || 'Admin'}`} icon={<Pencil size={14} />} accent={cfg} onClose={onClose}>
      <form onSubmit={save}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mut)', display: 'block', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{
              padding: '9px 12px', borderRadius: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-mut)', fontFamily: 'monospace',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Mail size={13} /> {user.email}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-mut)', display: 'block', marginBottom: 6 }}>
              Role
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['admin', 'super_admin'].map(r => {
                const c = ROLE_CONFIG[r]; const Icon = c.Icon; const active = form.role === r
                return (
                  <button
                    key={r} type="button" disabled={isSelf}
                    onClick={() => setForm(f => ({ ...f, role: r }))}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '10px 14px', borderRadius: 10,
                      cursor: isSelf ? 'not-allowed' : 'pointer',
                      opacity: isSelf ? 0.6 : 1,
                      border: `2px solid ${active ? c.color : 'var(--border)'}`,
                      background: active ? c.bg : 'var(--surface-2)',
                      color: active ? c.color : 'var(--text-mut)',
                      fontWeight: 700, fontSize: 13,
                    }}
                  >
                    <Icon size={14} /> {c.label}
                  </button>
                )
              })}
            </div>
            {isSelf && (
              <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>
                You can't change your own role.
              </div>
            )}
          </div>

          <Field label="Full Name" icon={<User size={13} />} required>
            <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Capt. Rajan Kumar" required />
          </Field>
          <Field label="Title / Designation" icon={<Shield size={13} />}>
            <input value={form.rank} onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
              placeholder="e.g. Fleet Manager" />
          </Field>

          {error && <div className="form-error"><AlertCircle size={14} /> {error}</div>}
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button type="submit" disabled={busy} className="btn primary" style={{ background: cfg.gradient }}>
            <Save size={14} /> {busy ? 'Saving…' : 'Save Changes'}
          </button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
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

  if (admins === null) return <div className="spinner">Loading admins…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* ── Page Header ── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '4px', height: '36px',
            background: 'linear-gradient(180deg, #6366f1, #8b5cf6)',
            borderRadius: '0 4px 4px 0', flexShrink: 0,
          }} />
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            border: '1px solid rgba(99,102,241,0.2)'
          }}>
            <Shield size={19} />
          </div>
          <div>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6366f1', opacity: 0.9 }}>Admin Panel · Access</span>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginTop: '1px' }}>User Management</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {activeTab === 'admin' ? (
            <button className="btn primary" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserPlus size={15} /> Add Admin
            </button>
          ) : (
            <span style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-mut)',
              background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 20,
              border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6
            }}>
              <Briefcase size={13} color="var(--accent)" />
              {officeStaff ? `${officeStaff.length} Office Staff in Directory` : 'Office Staff Directory'}
            </span>
          )}
        </div>
      </div>

      {/* ── Navigation Tabs ── */}
      <div style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '28px',
      }}>
        <button
          onClick={() => handleTabChange('admin')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '13px 4px',
            border: 'none',
            borderBottom: activeTab === 'admin' ? '2.5px solid #6366f1' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'admin' ? '#6366f1' : 'var(--text-mut)',
            fontWeight: activeTab === 'admin' ? 700 : 500,
            fontSize: 13.5,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Shield size={15} />
          <span>Admin Users</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 99,
            background: activeTab === 'admin' ? 'rgba(99,102,241,0.12)' : 'var(--surface-2)',
            color: activeTab === 'admin' ? '#6366f1' : 'var(--text-faint)',
            border: `1px solid ${activeTab === 'admin' ? 'rgba(99,102,241,0.25)' : 'var(--border)'}`,
          }}>
            {(admins || []).length}
          </span>
        </button>

        <button
          onClick={() => handleTabChange('office_staff')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '13px 4px',
            border: 'none',
            borderBottom: activeTab === 'office_staff' ? '2.5px solid #ea580c' : '2.5px solid transparent',
            background: 'transparent',
            color: activeTab === 'office_staff' ? '#ea580c' : 'var(--text-mut)',
            fontWeight: activeTab === 'office_staff' ? 700 : 500,
            fontSize: 13.5,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Briefcase size={15} />
          <span>Office Staff</span>
          <span style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 99,
            background: activeTab === 'office_staff' ? 'rgba(234,88,12,0.12)' : 'var(--surface-2)',
            color: activeTab === 'office_staff' ? '#ea580c' : 'var(--text-faint)',
            border: `1px solid ${activeTab === 'office_staff' ? 'rgba(234,88,12,0.25)' : 'var(--border)'}`,
          }}>
            {officeStaff !== null ? officeStaff.length : '40'}
          </span>
        </button>
      </div>

      {/* ── Sub-Toolbar: Search & Filter Row ── */}
      <div style={{
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
      }}>
        {activeTab === 'admin' ? (
          <>
            <div className="rpt-search-wrap" style={{ minWidth: 260, maxWidth: 360, margin: 0 }}>
              <Search size={14} className="rpt-field-icon" />
              <input
                type="text"
                placeholder="Search admin users by name, email, or role..."
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

            <div style={{
              display: 'inline-flex',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}>
              {['all', 'admin', 'super_admin'].map(key => {
                const active = roleFilter === key
                const label = key === 'all' ? 'All Roles' : ROLE_CONFIG[key].label
                return (
                  <button
                    key={key}
                    onClick={() => setRoleFilter(key)}
                    style={{
                      border: 'none',
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text-mut)',
                      fontWeight: active ? 700 : 500,
                      fontSize: 12.5,
                      padding: '6px 14px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{label}</span>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 99,
                      background: active ? 'rgba(99,102,241,0.1)' : 'rgba(0,0,0,0.04)',
                      color: active ? '#6366f1' : 'var(--text-faint)',
                    }}>
                      {counts[key]}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <div className="rpt-search-wrap" style={{ minWidth: 260, maxWidth: 420, margin: 0 }}>
              <Search size={14} className="rpt-field-icon" />
              <input
                type="text"
                placeholder="Search office staff by name, crew ID, nationality…"
                className="rpt-field"
                value={osSearch}
                onChange={e => setOsSearch(e.target.value)}
              />
              {osSearch && (
                <button className="rpt-x-btn" onClick={() => setOsSearch('')}>
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

      {/* ── Content ── */}
      {activeTab === 'admin' ? (
        <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {filtered.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '60px 20px', gap: '16px', color: 'var(--text-mut)',
            }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(99,102,241,0.1)', display: 'grid', placeItems: 'center' }}>
                <Users size={28} color="#6366f1" strokeWidth={1.5} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)', marginBottom: '5px' }}>
                  No users found
                </div>
                <div style={{ fontSize: '13px' }}>Try a different search or click "Add Admin" to create one.</div>
              </div>
            </div>
          ) : (
            <div className="admin-table-wrap" style={{ flex: 1 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>SI No.</th><th>Name</th><th>Role</th><th>Email</th><th>Title</th>
                    <th>Joined</th><th>Status</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, index) => (
                    <tr key={u.id} className={u.isActive ? '' : 'row-inactive'}>
                      <td className="mut" style={{ fontSize: 12 }}>{index + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: (ROLE_CONFIG[u.role] || ROLE_CONFIG.admin).gradient,
                            color: '#fff', display: 'grid', placeItems: 'center',
                            fontSize: '12px', fontWeight: 700, flexShrink: 0,
                          }}>
                            {getInitials(u.name)}
                          </div>
                          <b>{u.name}</b>
                        </div>
                      </td>
                      <td><RolePill role={u.role} /></td>
                      <td className="mono">{u.email}</td>
                      <td>{u.rank || '—'}</td>
                      <td>{formatDate(u.createdAt)}</td>
                      <td>
                        <span
                          className="pill"
                          style={{
                            background: u.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: u.isActive ? '#166534' : '#991b1b',
                            border: 'none',
                          }}
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn sm" onClick={() => setEditUser(u)} style={{ marginRight: 8 }}>
                          <Pencil size={13} /> Edit
                        </button>
                        <button className="btn sm" onClick={() => toggle(u)}>
                          {u.isActive ? <><Ban size={13} /> Deactivate</> : <><Check size={13} /> Activate</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {osLoading ? (
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
            <div className="admin-table-wrap" style={{ flex: 1 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>#</th><th>Name</th><th>Crew ID</th><th>Nationality</th><th>Status</th><th>Vessel</th><th>Mobile</th>
                  </tr>
                </thead>
                <tbody>
                  {osFiltered.map((u, index) => (
                    <tr key={u.id}>
                      <td className="mut" style={{ fontSize: 12 }}>{index + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #f97316, #ea580c)',
                            color: '#fff', display: 'grid', placeItems: 'center',
                            fontSize: '12px', fontWeight: 700, flexShrink: 0,
                          }}>
                            {getInitials(u.name)}
                          </div>
                          <div>
                            <b>{u.name}</b>
                            <div style={{ fontSize: 11, color: 'var(--text-mut)', marginTop: 2 }}>OFFICE STAFF</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="mono" style={{ background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{u.crewId || '—'}</span></td>
                      <td>{u.nationality || '—'}</td>
                      <td>
                        <span className="pill" style={{
                          background: u.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: u.isActive ? '#15803d' : '#b91c1c',
                          border: 'none',
                        }}>
                          {u.empStatus || (u.isActive ? 'Active' : 'Inactive')}
                        </span>
                      </td>
                      <td className="mut">{u.currentVessel || '—'}</td>
                      <td className="mut">{u.mobileNo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {editUser && <EditModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
    </div>
  )
}
