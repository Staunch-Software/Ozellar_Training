import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Plus, AlertCircle, X, ChevronRight } from 'lucide-react'
import { adminListCourses, adminCreateCourse } from '../../api.js'

const EMPTY = { title: '', subtitle: '', durationLabel: '', passMark: 80, maxAttempts: '' }

export default function AdminCourses() {
  const navigate = useNavigate()
  const [courses, setCourses] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => adminListCourses().then(setCourses)
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
      })
      setForm(EMPTY)
      setShowForm(false)
      navigate(`/admin/courses/${created.id}`)
    } catch (err) {
      setError(err.message || 'Could not create course')
    } finally {
      setBusy(false)
    }
  }

  if (!courses) return <div className="spinner">Loading courses…</div>

  return (
    <>
      <div className="admin-head">
        <div>
          <div className="eyebrow">Fleet training · Content</div>
          <h1 style={{ fontSize: 26, margin: '6px 0 0' }}>Courses</h1>
        </div>
        <button className="btn primary" onClick={() => { setShowForm((s) => !s); setError('') }}>
          {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> New course</>}
        </button>
      </div>

      {showForm && (
        <form className="admin-card" onSubmit={create} style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <Field label="Title" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Fire Prevention & Firefighting" />
            </Field>
            <Field label="Subtitle">
              <input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="One-line description" />
            </Field>
            <Field label="Duration label">
              <input value={form.durationLabel} onChange={(e) => set('durationLabel', e.target.value)} placeholder="e.g. 2 hours" />
            </Field>
            <Field label="Final assessment pass mark (%)" required>
              <input type="number" min={1} max={100} value={form.passMark}
                onChange={(e) => set('passMark', e.target.value)} />
            </Field>
            <Field label="Max attempts (blank = unlimited)">
              <input type="number" min={1} value={form.maxAttempts}
                onChange={(e) => set('maxAttempts', e.target.value)} placeholder="Unlimited" />
            </Field>
          </div>

          {error && <div className="form-error" style={{ marginTop: 14 }}><AlertCircle size={15} /> {error}</div>}
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create course'}</button>
          </div>
          <p className="mut" style={{ marginTop: 10, fontSize: 13 }}>
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
                <td><b><BookOpen size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{c.title}</b>
                  {c.subtitle && <div className="mut" style={{ fontSize: 13 }}>{c.subtitle}</div>}</td>
                <td>{c.chapterCount} module{c.chapterCount === 1 ? '' : 's'}</td>
                <td>{c.questionCount} question{c.questionCount === 1 ? '' : 's'} · pass {c.passMark}%</td>
                <td style={{ textAlign: 'right' }}><ChevronRight size={16} /></td>
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
