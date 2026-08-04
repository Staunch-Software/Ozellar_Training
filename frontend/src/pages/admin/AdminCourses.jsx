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
        <button className={showForm ? "btn" : "btn primary"} onClick={() => { setShowForm((s) => !s); setError('') }}>
          {showForm ? <><X size={16} /> Close</> : <><Plus size={16} /> New course</>}
        </button>
      </div>

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
            <div style={{ flex: '0 0 auto', marginBottom: '1px' }}>
              <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
            </div>
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
