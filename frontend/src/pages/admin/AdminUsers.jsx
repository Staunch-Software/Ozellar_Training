import { useEffect, useState } from 'react'
import { UserPlus, Check, Ban, AlertCircle, X } from 'lucide-react'
import { adminListUsers, adminCreateUser, adminUpdateUser } from '../../api.js'

const EMPTY = { role: 'learner', fullName: '', crewId: '', dob: '', rank: '', ppNo: '', email: '', password: '' }

export default function AdminUsers() {
  const [users, setUsers] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => adminListUsers().then(setUsers)
  useEffect(() => { load() }, [])

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

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">Fleet training · People</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 0' }}>Users</h1>
        </div>
        <button className="btn primary" onClick={() => { setShowForm((s) => !s); setError('') }}>
          {showForm ? <><X size={16} /> Close</> : <><UserPlus size={16} /> Add user</>}
        </button>
      </div>

      {showForm && (
        <form className="admin-card" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="segmented" role="tablist" style={{ maxWidth: 240, marginBottom: 16 }}>
            <button type="button" className={form.role === 'learner' ? 'on' : ''}
              onClick={() => set('role', 'learner')}>Crew</button>
            <button type="button" className={form.role === 'admin' ? 'on' : ''}
              onClick={() => set('role', 'admin')}>Admin</button>
          </div>

          <div className="form-grid">
            <Field label="Full name" required>
              <input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="e.g. Priya Menon" />
            </Field>
            <Field label="Rank / title">
              <input value={form.rank} onChange={(e) => set('rank', e.target.value)} placeholder="e.g. Third Officer" />
            </Field>

            {form.role === 'learner' ? (
              <>
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
              </>
            ) : (
              <>
                <Field label="Email" required>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@ozellarmarine.com" />
                </Field>
                <Field label="Password (min 8 chars)" required>
                  <input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••" />
                </Field>
              </>
            )}
          </div>

          {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      )}

      <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th><th>Role</th><th>Login ID</th><th>Rank</th>
              <th>Courses</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? '' : 'row-inactive'}>
                <td><b>{u.name}</b></td>
                <td><span className={`pill ${u.role}`}>{u.role === 'admin' ? 'Admin' : 'Crew'}</span></td>
                <td className="mono">{u.role === 'admin' ? u.email : u.crewId}</td>
                <td>{u.rank || '—'}</td>
                <td>{u.role === 'learner' ? `${u.passedCount}/${u.assignedCount} passed` : '—'}</td>
                <td>
                  <span className={`pill ${u.isActive ? 'ok' : 'off'}`}>
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
