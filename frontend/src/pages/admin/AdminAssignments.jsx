import './AdminAssignments.css'
import { useEffect, useState, useRef, useMemo } from 'react'
import {
  Check, Award, Clock, Search, X, ChevronDown, Grid3x3, Phone, BookOpen,
  ClipboardList, AlertTriangle, Loader2, CheckSquare, Square, CheckCircle2,
  Circle, Hourglass, Calendar, Target, RotateCcw, MessageSquare, Eye, EyeOff,
  ExternalLink, Download, Users, RefreshCw, Mail, MailX, MailCheck, Send
} from 'lucide-react'
import { adminReport, adminSetEnrollments, adminFetchCertificatePdfUrl, adminReassignCourse, adminSendCourseReminder } from '../../api.js'
import Pagination from '../../components/Pagination.jsx'
import CardSelect from '../../components/CardSelect.jsx'

const ACCENT = '#E07820'
const ACCENT_GRADIENT = 'linear-gradient(135deg, #E07820, #F58220)'
const VISIBLE_CHIPS = 4

const formatMobile = (mobileNo) => {
  if (!mobileNo || mobileNo.length !== 10) return mobileNo || null
  return `${mobileNo.slice(0, 5)} ${mobileNo.slice(5)}`
}

const formatDate = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  if (!y) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// status -> look. `assigned` = enrolled but nothing started yet.
const STATUS = {
  passed:        { label: 'Completed',   color: '#16a34a', bg: 'rgba(22,163,74,0.12)',  border: 'rgba(22,163,74,0.35)',  Icon: CheckCircle2 },
  'in-progress': { label: 'In progress', color: '#d97706', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.4)',  Icon: Clock },
  assigned:      { label: 'Not started', color: 'var(--text-mut)', bg: 'var(--surface-2)', border: 'var(--border-strong)', Icon: Circle },
}
const statusOf = (cell) => STATUS[cell?.status] || STATUS.assigned
const STATUS_ORDER = { passed: 0, 'in-progress': 1, assigned: 2 }

/* ─────────────────────────── shared modal shell ─────────────────────────── */

function ModalShell({ icon, title, subtitle, width = 560, busy, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  return (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        width: `min(${width}px, 100%)`, maxHeight: '88vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 16,
        border: '1.5px solid rgba(224,120,32,0.28)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 22px', borderBottom: '1px solid var(--border)',
          background: 'rgba(224,120,32,0.08)', flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: ACCENT_GRADIENT,
            display: 'grid', placeItems: 'center', color: '#fff', flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
            {subtitle && (
              <div className="mut" style={{ fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
            )}
          </div>
          <button onClick={() => !busy && onClose()} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mut)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>{footer}</div>}
      </div>
    </div>
  )
}

/* ───────────────────── course progress popup (click a course chip) ───────────────────── */

function Step({ done, current, label, last }) {
  const color = done ? '#16a34a' : current ? '#d97706' : 'var(--border-strong)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: last ? '0 0 auto' : 1, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: done ? color : 'var(--surface)', color: done ? '#fff' : color,
          border: `2px solid ${color}`,
        }}>
          {done ? <Check size={14} strokeWidth={3} /> : current ? <Clock size={13} /> : <Circle size={9} />}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: done || current ? 'var(--text)' : 'var(--text-mut)' }}>{label}</span>
      </div>
      {!last && <div style={{ flex: 1, height: 2, margin: '0 6px 18px', background: done ? color : 'var(--border)' }} />}
    </div>
  )
}

function InfoTile({ icon, label, value }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', background: 'var(--surface-2)' }}>
      <div className="mut" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}>{icon}{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{value}</div>
    </div>
  )
}

function CourseProgressModal({ row, course, cell, onClose, onManage, onReassign }) {
  const st = statusOf(cell)
  const stage = cell.status === 'passed' ? 2 : cell.status === 'in-progress' ? 1 : 0
  const pct = Math.max(0, Math.min(100, cell.completionPct ?? 0))
  const StIcon = st.Icon
  const [certBusy, setCertBusy] = useState(false)
  const [certError, setCertError] = useState('')
  const [certUrl, setCertUrl] = useState('')   // object URL of the PDF once loaded

  // free the PDF blob when it is hidden or the popup closes
  useEffect(() => () => { if (certUrl) URL.revokeObjectURL(certUrl) }, [certUrl])

  const toggleCertificate = async () => {
    setCertError('')
    if (certUrl) { setCertUrl(''); return }
    setCertBusy(true)
    try {
      setCertUrl(await adminFetchCertificatePdfUrl(row.learnerId, course.id))
    } catch (err) {
      setCertError(err.message || 'Could not load the certificate')
    } finally {
      setCertBusy(false)
    }
  }

  return (
    <ModalShell
      icon={<BookOpen size={17} />}
      title={course.title}
      subtitle={`${row.name} · ${row.crewId}${row.rank ? ` · ${row.rank}` : ''}`}
      width={certUrl ? 760 : 500}
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button type="button" className="btn" 
            onClick={() => {
              if (window.confirm('Are you sure you want to reassign this course? All progress and certificates for this course will be wiped.')) {
                onReassign()
              }
            }}
            style={{ color: '#ef4444', borderColor: '#fca5a5', background: '#fef2f2', marginRight: 'auto' }}>
            <RotateCcw size={14} /> Reassign
          </button>
          <button type="button" className="btn" onClick={onManage}><BookOpen size={14} /> Manage Courses</button>
          <button type="button" className="btn primary" onClick={onClose}
            style={{ background: ACCENT_GRADIENT, borderColor: 'transparent' }}>Close</button>
        </div>
      )}
    >
      <div style={{ padding: 22, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
            background: st.bg, color: st.color, border: `1px solid ${st.border}`, fontSize: 12.5, fontWeight: 700,
          }}>
            <StIcon size={14} /> {st.label}
          </span>
          {cell.pendingApproval && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999,
              background: 'rgba(224,120,32,0.12)', color: ACCENT, border: '1px solid rgba(224,120,32,0.35)',
              fontSize: 12.5, fontWeight: 700,
            }}>
              <Hourglass size={13} /> Awaiting approval
            </span>
          )}
        </div>

        <div style={{ display: 'flex', marginBottom: 22, padding: '0 6px' }}>
          <Step done label="Assigned" />
          <Step done={stage >= 1} label="Started" />
          <Step done={stage >= 2} current={stage === 1} label="Completed" last />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>Lesson progress</span>
            <span className="mut">{cell.completedChapters ?? 0} of {cell.totalChapters ?? 0} lessons · <b style={{ color: 'var(--text)' }}>{pct}%</b></span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--surface-3, var(--border))', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: stage === 2 && pct >= 100 ? '#16a34a' : ACCENT_GRADIENT, transition: 'width .3s ease' }} />
          </div>
          {stage === 2 && pct < 100 && cell.score != null && (
            <div className="mut" style={{ fontSize: 11.5, marginTop: 6 }}>
              Completed by passing the assessment — not every lesson was opened.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          <InfoTile icon={<Calendar size={12} />} label="Assigned on" value={formatDate(cell.startedOn)} />
          <InfoTile icon={<CheckCircle2 size={12} />} label="Completed on" value={stage === 2 ? formatDate(cell.passedOn) : '—'} />
          <InfoTile icon={<Target size={12} />} label="Assessment score" value={cell.score != null ? `${cell.score}%` : '—'} />
          <InfoTile icon={<RotateCcw size={12} />} label="Attempts" value={cell.attempts || 0} />
        </div>

        {stage === 2 && (
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
            border: '1px solid rgba(22,163,74,0.35)', background: 'rgba(22,163,74,0.08)',
          }}>
            <Award size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Certificate</div>
              <div className="mut" style={{ fontSize: 11.5 }}>
                {cell.pendingApproval ? 'Available once it has been approved' : 'Issued certificate (PDF)'}
              </div>
            </div>
            {!cell.pendingApproval && (
              <button type="button" className="btn sm" onClick={toggleCertificate} disabled={certBusy}>
                {certBusy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                  : certUrl ? <EyeOff size={13} /> : <Eye size={13} />}
                {certBusy ? 'Loading…' : certUrl ? 'Hide certificate' : 'View certificate'}
              </button>
            )}
          </div>
        )}
        {certError && <div className="form-error" style={{ marginTop: 10 }}><AlertTriangle size={14} /> {certError}</div>}
        {certUrl && (
          <div style={{ marginTop: 10 }}>
            <iframe
              title="Certificate preview" src={`${certUrl}#view=FitH`}
              style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <a className="btn sm" href={certUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open in new tab</a>
              <a className="btn sm" href={certUrl} download={`${row.name} - ${course.title} - certificate.pdf`}><Download size={13} /> Download</a>
            </div>
          </div>
        )}

        {cell.approvalRemark && (
          <div style={{
            marginTop: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--surface-2)', fontSize: 12.5,
          }}>
            <div className="mut" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, marginBottom: 3 }}>
              <MessageSquare size={12} /> Admin remark
            </div>
            <div style={{ color: 'var(--text)' }}>{cell.approvalRemark}</div>
          </div>
        )}
      </div>
    </ModalShell>
  )
}

/* ─────────────────────────── assigned-course chip ─────────────────────────── */

function CourseChip({ course, cell, onClick }) {
  const st = statusOf(cell)
  const Icon = st.Icon
  const pct = cell.completionPct ?? 0
  return (
    <button
      type="button"
      className="asg-chip"
      onClick={onClick}
      title={`${course.title} — ${st.label}${cell.status === 'in-progress' ? ` (${pct}%)` : ''}. Click for details`}
      style={{ color: st.color, background: st.bg, borderColor: st.border }}
    >
      <Icon size={12} style={{ flexShrink: 0 }} />
      <span className="asg-chip-title">{course.title}</span>
      {cell.status === 'in-progress' && <span className="asg-chip-meta">{pct}%</span>}
      {cell.status === 'passed' && cell.score != null && <span className="asg-chip-meta">{cell.score}%</span>}
      {cell.pendingApproval && <Hourglass size={11} style={{ flexShrink: 0, color: ACCENT }} />}
    </button>
  )
}

/* ─────────────────────────── manage-courses modal ─────────────────────────── */

function ManageCoursesModal({ row, courses, onClose, onSaved }) {
  const originalIds = useMemo(() => new Set(Object.keys(row.cells || {})), [row])
  const [selected, setSelected] = useState(new Set(originalIds))
  const [courseSearch, setCourseSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const toggleOne = (id) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => c.title.toLowerCase().includes(q))
  }, [courses, courseSearch])

  const selectAllFiltered = () => {
    setSelected((s) => {
      const n = new Set(s)
      filteredCourses.forEach((c) => n.add(c.id))
      return n
    })
  }
  const clearAllFiltered = () => {
    setSelected((s) => {
      const n = new Set(s)
      filteredCourses.forEach((c) => n.delete(c.id))
      return n
    })
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await adminSetEnrollments(row.learnerId, Array.from(selected))
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message || 'Could not save assignments')
      setBusy(false)
    }
  }

  const addedCount = Array.from(selected).filter((id) => !originalIds.has(id)).length
  const removedCount = Array.from(originalIds).filter((id) => !selected.has(id)).length
  const isDirty = addedCount > 0 || removedCount > 0

  return (
    <ModalShell
      icon={<BookOpen size={18} />}
      title="Manage Course Assignments"
      subtitle={`${row.name} · ${row.crewId}${row.rank ? ` · ${row.rank}` : ''}`}
      busy={busy}
      onClose={onClose}
      footer={(
        <>
          {error && <div className="form-error" style={{ marginBottom: 12 }}><AlertTriangle size={14} /> {error}</div>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span className="mut" style={{ fontSize: 12 }}>
              {isDirty ? (
                <span>
                  {addedCount > 0 && <span style={{ color: '#16a34a', fontWeight: 600 }}>+{addedCount} to enroll </span>}
                  {removedCount > 0 && <span style={{ color: '#ef4444', fontWeight: 600 }}>-{removedCount} to remove</span>}
                </span>
              ) : (
                `${selected.size} of ${courses.length} courses enrolled`
              )}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="btn primary"
                onClick={save}
                disabled={busy || !isDirty}
                style={{ background: ACCENT_GRADIENT, borderColor: 'transparent' }}
              >
                {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={14} />}
                {busy ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </>
      )}
    >
      <div style={{ padding: '14px 22px 10px', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="rpt-search-wrap" style={{ flex: '1 1 180px', margin: 0, minWidth: 0 }}>
          <Search size={14} className="rpt-field-icon" />
          <input type="text" placeholder="Search courses…" className="rpt-field"
            value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} />
          {courseSearch && (
            <button className="rpt-x-btn" onClick={() => setCourseSearch('')}><X size={12} /></button>
          )}
        </div>
        <button type="button" className="btn sm" onClick={selectAllFiltered} title="Select all courses shown below">
          <CheckSquare size={13} /> All
        </button>
        <button type="button" className="btn sm" onClick={clearAllFiltered} title="Deselect all courses shown below">
          <Square size={13} /> None
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 14px' }}>
        {filteredCourses.length === 0 && (
          <div className="mut" style={{ padding: '20px 8px', textAlign: 'center', fontSize: 13 }}>No courses match "{courseSearch}"</div>
        )}
        {filteredCourses.map((c) => {
          const cell = row.cells[c.id]
          const isOn = selected.has(c.id)
          const st = cell ? statusOf(cell) : null
          return (
            <label key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${isOn ? 'rgba(224,120,32,0.35)' : 'var(--border)'}`,
              background: isOn ? 'rgba(224,120,32,0.06)' : 'transparent',
              marginBottom: 6, transition: 'background .12s ease',
            }}>
              <input type="checkbox" checked={isOn} onChange={() => toggleOne(c.id)}
                style={{ width: 16, height: 16, accentColor: ACCENT, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </span>
              {cell && cell.status !== 'assigned' && (
                <span style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 999, color: st.color, background: st.bg, border: `1px solid ${st.border}`,
                }}>
                  {cell.status === 'passed' ? <Award size={11} /> : <Clock size={11} />}
                  {cell.status === 'passed' ? (cell.score != null ? `${cell.score}%` : 'Completed') : 'In progress'}
                </span>
              )}
              {cell && cell.pendingApproval && (
                <span className="chip accent" style={{ flexShrink: 0 }}>pending approval</span>
              )}
            </label>
          )
        })}
      </div>
    </ModalShell>
  )
}

const hasPendingCourses = (row) => {
  const cells = Object.values(row.cells || {})
  return cells.length > 0 && cells.some(c => c && c.status !== 'passed')
}

/* ─────────────────────────── send reminder modal ─────────────────────────── */

function SendReminderModal({
  rankFilter,
  totalFiltered,
  eligibleCount,
  withEmailCount,
  onClose,
  onSend,
  busy,
  result
}) {
  const [testEmail, setTestEmail] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testFeedback, setTestFeedback] = useState(null)

  useEffect(() => {
    setTestEmail('')
    setTestFeedback(null)
  }, [])

  const missingEmailCount = Math.max(0, eligibleCount - withEmailCount)

  const handleSendTest = async () => {
    if (testBusy || !testEmail.trim()) return
    setTestBusy(true)
    setTestFeedback(null)
    try {
      const res = await adminSendCourseReminder({ test_email: testEmail.trim() })
      setTestFeedback({ type: 'success', text: res.message || `Test reminder email sent to ${testEmail}` })
    } catch (e) {
      setTestFeedback({ type: 'error', text: e.message || 'Failed to send test email' })
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <ModalShell
      icon={<Mail size={17} />}
      title="Send Course Completion Reminders"
      subtitle={rankFilter && rankFilter !== 'all'
        ? `Targeting ${rankFilter} seafarers with pending courses`
        : 'Targeting all seafarers with pending courses'}
      width={600}
      busy={busy}
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              type="button"
              id="asg-modal-confirm-send-btn"
              className="btn primary"
              onClick={onSend}
              disabled={busy || withEmailCount === 0}
              style={{ background: ACCENT_GRADIENT, borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {busy ? <Loader2 size={14} className="asg-spin" /> : <Mail size={14} />}
              {busy ? 'Sending Reminders…' : `Send Reminders (${withEmailCount})`}
            </button>
          )}
        </div>
      )}
    >
      <div style={{ padding: 22, overflowY: 'auto' }}>
        {result ? (
          <div style={{
            padding: 18, borderRadius: 12,
            background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#16a34a', fontWeight: 700, fontSize: 15 }}>
              <CheckCircle2 size={20} /> Reminder Emails Dispatched!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              {result.message || `Successfully sent reminder emails to ${result.sent} seafarer(s).`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 6 }}>
              <div style={{ padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="mut" style={{ fontSize: 11 }}>Sent</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{result.sent}</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="mut" style={{ fontSize: 11 }}>Skipped (No Email)</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#e11d48' }}>{result.noEmail}</div>
              </div>
              <div style={{ padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="mut" style={{ fontSize: 11 }}>Already Completed</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-mut)' }}>{result.skipped}</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Target Summary 4-Tile Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              <div style={{ padding: '9px 11px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="mut" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Target</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rankFilter && rankFilter !== 'all' ? rankFilter : 'All Ranks'}
                </div>
              </div>
              <div style={{ padding: '9px 11px', background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div className="mut" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Pending</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: ACCENT, marginTop: 2 }}>
                  {eligibleCount} <span style={{ fontSize: 11, fontWeight: 'normal', color: 'var(--text-mut)' }}>crew</span>
                </div>
              </div>
              <div style={{ padding: '9px 11px', background: 'rgba(22,163,74,0.06)', borderRadius: 10, border: '1px solid rgba(22,163,74,0.25)' }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#16a34a', fontWeight: 600 }}>With Email</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#16a34a', marginTop: 2 }}>
                  {withEmailCount} <span style={{ fontSize: 11, fontWeight: 'normal' }}>ready</span>
                </div>
              </div>
              <div style={{ padding: '9px 11px', background: 'rgba(244,63,94,0.06)', borderRadius: 10, border: '1px solid rgba(244,63,94,0.25)' }}>
                <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#e11d48', fontWeight: 600 }}>No Email</div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e11d48', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <MailX size={12} />
                  <span>{missingEmailCount}</span>
                </div>
              </div>
            </div>

            {/* Quick Test Email Box */}
            <div className="asg-modal-test-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }}>
                  <Send size={13} style={{ color: ACCENT }} /> Send a Test Email
                </div>
                <span className="mut" style={{ fontSize: 11 }}>Verify formatting & deliverability</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="email"
                  id="asg-test-email-input"
                  name="custom-test-email-no-autofill"
                  className="asg-modal-test-input"
                  placeholder="Enter test recipient email..."
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  disabled={testBusy}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
                <button
                  type="button"
                  id="asg-test-email-btn"
                  className="asg-modal-test-btn"
                  onClick={handleSendTest}
                  disabled={testBusy || !testEmail.trim()}
                >
                  {testBusy ? <Loader2 size={12} className="asg-spin" /> : <Send size={12} />}
                  <span>{testBusy ? 'Sending…' : 'Send Test'}</span>
                </button>
              </div>
              {testFeedback && (
                <div className={`asg-modal-test-feedback asg-modal-test-feedback--${testFeedback.type}`}>
                  {testFeedback.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                  <span>{testFeedback.text}</span>
                </div>
              )}
            </div>

            {withEmailCount === 0 && (
              <div style={{
                marginBottom: 16, padding: '10px 14px', borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#ef4444', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 8
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>No seafarers in this selection currently have pending courses with a registered email address.</span>
              </div>
            )}

            {/* Email Message Preview */}
            <div style={{
              borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden',
              background: 'var(--surface-2)', fontSize: 12.5
            }}>
              <div style={{
                padding: '9px 14px', background: 'var(--surface-3, var(--border))',
                borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={13} style={{ color: '#059669' }} />
                  <span>Email Content Preview</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-mut)' }}>
                  From: <strong style={{ color: '#059669' }}>data@ozellar.com</strong> &bull; CC: <strong style={{ color: '#ea580c' }}>sudarsan.s@ozellar.com, shweta.s@ozellar.com</strong>
                </span>
              </div>
              <div style={{ padding: '14px 16px', color: 'var(--text)', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: '#059669', fontSize: 13 }}>
                  Subject: Action Required: Complete Your Assigned Courses - Ozellar Marine Training
                </div>
                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Good day &lt;Seafarer Name&gt;,</p>
                <p style={{ margin: '0 0 10px 0' }}>
                  Please be advised to complete your assigned training course(s) on the <strong>Ozellar Marine Training</strong> portal.
                </p>
                
                {/* Pending Course Preview */}
                <div style={{
                  padding: '8px 12px', background: 'var(--surface)', borderRadius: 6,
                  border: '1px solid var(--border)', borderTop: '2px solid #059669', margin: '8px 0', fontSize: 12
                }}>
                  <div style={{ fontWeight: 700, color: '#065f46', marginBottom: 4, textTransform: 'uppercase', fontSize: 10.5 }}>
                    Assigned Course(s) to Complete (Only Pending):
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
                    <span><span style={{ color: '#059669' }}>●</span> &lt;Course Title 1&gt;</span>
                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 999, fontSize: 10, fontWeight: 700 }}>Pending</span>
                  </div>
                </div>

                <div style={{
                  padding: '10px 14px', background: 'rgba(5, 150, 105, 0.05)', borderRadius: 6,
                  borderLeft: '4px solid #059669', border: '1px solid rgba(5, 150, 105, 0.25)', margin: '10px 0'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: '#ea580c', textTransform: 'uppercase', fontSize: 11 }}>Message / Steps to Complete:</div>
                  <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                    <li>Access <a href="https://training.ozellar.com" target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 700, textDecoration: 'underline' }}>training.ozellar.com</a></li>
                    <li>Click in <b>Seafarer</b> &mdash; enter name and dob</li>
                    <li>Upload passport size photo &mdash; this photo will be used for certification</li>
                    <li>Complete the assigned courses</li>
                  </ol>
                </div>

                <div style={{ textAlign: 'center', margin: '12px 0 8px 0' }}>
                  <span style={{
                    display: 'inline-block', background: 'linear-gradient(135deg, #E07820 0%, #ea580c 100%)', color: '#fff',
                    padding: '6px 18px', borderRadius: 6, fontWeight: 700, fontSize: 11.5
                  }}>
                    Access Training Portal &rarr;
                  </span>
                </div>

                <div style={{ margin: '10px 0 0 0', fontSize: 11, color: 'var(--text-mut)' }}>
                  Portal: <span style={{ color: '#059669' }}>https://training.ozellar.com</span> &bull; Support: <span style={{ color: '#ea580c', fontWeight: 600 }}>techdevops@ozellar.com</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

/* ─────────────────────────────── main page ─────────────────────────────── */

export default function AdminAssignments() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState('all')
  const [manageRow, setManageRow] = useState(null)
  const [progressView, setProgressView] = useState(null)   // { row, course, cell }
  const [expanded, setExpanded] = useState(() => new Set()) // learnerIds showing all chips
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)
  const [reminderResult, setReminderResult] = useState(null)
  const [singleSendingId, setSingleSendingId] = useState(null)
  const [singleSentIds, setSingleSentIds] = useState(() => new Set())
  const [toastMessage, setToastMessage] = useState(null)
  const tableScrollRef = useRef(null)

  // Seamless wheel scrolling coordinator between outer wrapper and table scroll
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    const onWheel = (e) => {
      const wrapper = el.closest('.cm-wrapper')
      const card = el.closest('.asg-table-card')
      const header = wrapper?.querySelector('.asg-header-container')
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
  }, [loading, data])

  const load = () => {
    setLoading(true)
    adminReport()
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { setCurrentPage(1) }, [search, rankFilter])

  const handleReassign = async (learnerId, courseId) => {
    try {
      await adminReassignCourse(learnerId, courseId)
      setProgressView(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  // Rank Filter Options for CardSelect
  const rankOptions = useMemo(() => {
    if (!data?.rows) return [{ value: 'all', label: 'All Ranks' }]
    const counts = {}
    data.rows.forEach(r => {
      const rank = (r.rank || '').trim().toUpperCase()
      if (rank) counts[rank] = (counts[rank] || 0) + 1
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
  }, [data])

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!data?.rows) return []
    return data.rows.filter(row => {
      let matchSearch = true
      if (search.trim()) {
        const term = search.trim().toLowerCase()
        matchSearch = (row.name || '').toLowerCase().includes(term) ||
               (row.crewId || '').toLowerCase().includes(term) ||
               (row.rank || '').toLowerCase().includes(term)
      }
      let matchRank = true
      if (rankFilter && rankFilter !== 'all') {
        matchRank = (row.rank || '').trim().toUpperCase() === rankFilter
      }
      return matchSearch && matchRank
    })
  }, [data, search, rankFilter])

  // Among filtered rows, how many have pending courses?
  const eligibleFilteredRows = useMemo(() => {
    return filteredRows.filter(row => hasPendingCourses(row))
  }, [filteredRows])

  // Among eligible, how many have an email address?
  const eligibleWithEmailCount = useMemo(() => {
    return eligibleFilteredRows.filter(row => row.email && row.email.trim()).length
  }, [eligibleFilteredRows])

  const handleSendBulkReminders = async () => {
    if (reminderBusy || eligibleWithEmailCount === 0) return
    setReminderBusy(true)
    setReminderResult(null)
    try {
      const res = await adminSendCourseReminder({
        learner_ids: eligibleFilteredRows.map(r => r.learnerId),
        rank: rankFilter && rankFilter !== 'all' ? rankFilter : undefined,
      })
      setReminderResult(res)
      setToastMessage({ type: 'success', text: `Sent reminder emails to ${res.sent} seafarer(s).` })
      setTimeout(() => setToastMessage(null), 4000)
    } catch (err) {
      alert(err.message || 'Failed to send reminder emails')
    } finally {
      setReminderBusy(false)
    }
  }

  const handleSendSingleReminder = async (row) => {
    if (singleSendingId || !row.email || !hasPendingCourses(row)) return
    setSingleSendingId(row.learnerId)
    try {
      const res = await adminSendCourseReminder({ learner_id: row.learnerId })
      setSingleSentIds(prev => new Set(prev).add(row.learnerId))
      setToastMessage({ type: 'success', text: `Reminder sent to ${row.name} (${row.email})` })
      setTimeout(() => setToastMessage(null), 4000)
    } catch (err) {
      setToastMessage({ type: 'error', text: err.message || `Failed to send reminder to ${row.name}` })
      setTimeout(() => setToastMessage(null), 4000)
    } finally {
      setSingleSendingId(null)
    }
  }

  if (!data) return <div className="spinner">Loading assignments…</div>

  const toggleExpanded = (id) => setExpanded((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const itemsPerPage = 20
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage)
  const currentRows = filteredRows.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const totalAssignments = data.rows.reduce((sum, row) => sum + Object.keys(row.cells || {}).length, 0)
  const totalCourses = data.courses.length
  const avgPerCrew = data.rows.length ? (totalAssignments / data.rows.length) : 0
  const completedAssignments = data.rows.reduce((sum, row) => {
    return sum + Object.values(row.cells || {}).filter(c => c && c.status === 'passed').length
  }, 0)

  const hasFilters = search.trim() !== '' || (rankFilter !== 'all' && rankFilter !== '')
  const clearFilters = () => {
    setSearch('')
    setRankFilter('all')
  }

  return (
    <div className="asg-root">

      {/* ═══════════════════════ STICKY HEADER & CONTROLS BAR ═══════════════════════ */}
      <div className="asg-header-container">
        <div className="asg-header">
          {/* Left: Brand Identity */}
          <div className="asg-header-brand">
            <div className="asg-header-accent-bar" />
            <div className="asg-header-icon">
              <Grid3x3 size={17} />
            </div>
            <div className="asg-header-title-wrap">
              <div className="asg-header-eyebrow">Fleet Training · Enrollments</div>
              <div className="asg-header-title-row">
                <h1 className="asg-header-title">Assignments</h1>
                <div className="asg-header-stat-pill">
                  <span className="asg-header-stat-count">{filteredRows.length}</span>
                  <span className="asg-header-stat-label">
                    {hasFilters ? 'Filtered' : 'Seafarers'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Search, CardSelect Rank Dropdown, and Refresh */}
          <div className="asg-header-controls">
            {/* Search Input */}
            <div className="asg-search-wrap">
              <Search size={13} className="asg-search-icon" />
              <input
                id="asg-search-input"
                type="text"
                className="asg-search-input"
                placeholder="Search seafarers, ID, rank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="asg-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* CardSelect Rank Filter */}
            <div className="asg-select-wrap">
              <CardSelect
                id="asg-rank-filter"
                value={rankFilter}
                onChange={setRankFilter}
                options={rankOptions}
                placeholder="All Ranks"
                searchable={true}
                placement="bottom"
                className="asg-cardselect"
              />
            </div>

            {/* Send Reminder Mail Button */}
            <button
              type="button"
              id="asg-send-reminders-btn"
              className="asg-btn-mail"
              onClick={() => {
                setReminderResult(null)
                setShowReminderModal(true)
              }}
              title={
                rankFilter && rankFilter !== 'all'
                  ? `Send reminder email to ${rankFilter} seafarers with pending courses (${eligibleWithEmailCount})`
                  : `Send reminder email to all filtered seafarers with pending courses (${eligibleWithEmailCount})`
              }
              aria-label="Send reminder email"
            >
              <Mail size={14} />
              <span className="asg-btn-mail-label">
                Send Mail{rankFilter && rankFilter !== 'all' ? ` (${rankFilter})` : ''}
              </span>
              {eligibleWithEmailCount > 0 && (
                <span className="asg-btn-mail-badge">{eligibleWithEmailCount}</span>
              )}
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              id="asg-refresh-btn"
              className="asg-btn-refresh"
              onClick={load}
              disabled={loading}
              title="Refresh assignments"
              aria-label="Refresh list"
            >
              <RefreshCw size={14} className={loading ? 'asg-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Active Filter Chips Strip */}
        {hasFilters && (
          <div className="asg-chips-bar">
            <span className="asg-chips-label">Active Filters:</span>

            {search.trim() && (
              <span className="asg-chip">
                Search: <strong>"{search.trim()}"</strong>
                <button
                  type="button"
                  className="asg-chip-remove"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            {rankFilter !== 'all' && rankFilter !== '' && (
              <span className="asg-chip">
                Rank: <strong>{rankFilter}</strong>
                <button
                  type="button"
                  className="asg-chip-remove"
                  onClick={() => setRankFilter('all')}
                  title="Clear rank filter"
                  aria-label="Clear rank filter"
                >
                  <X size={12} />
                </button>
              </span>
            )}

            <button
              type="button"
              className="asg-chip-clear-all"
              onClick={clearFilters}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ═══════════════════════ UNIQUE LIGHT-THEMED COMPACT KPI CARDS (~58px) ═══════════════════════ */}
      <div className="asg-kpi-strip">
        {/* Card 1: Total Seafarers (Warm Amber Accent) */}
        <div className="asg-kpi-card asg-kpi-card--amber">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Total Seafarers</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Users size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{data.rows.length}</span>
            <span className="asg-kpi-badge">Crew</span>
          </div>
        </div>

        {/* Card 2: Active Courses (Royal Indigo Accent) */}
        <div className="asg-kpi-card asg-kpi-card--indigo">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Active Courses</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <BookOpen size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{totalCourses}</span>
            <span className="asg-kpi-badge">Curriculum</span>
          </div>
        </div>

        {/* Card 3: Assigned Slots (Emerald Accent) */}
        <div className="asg-kpi-card asg-kpi-card--emerald">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Assigned Slots</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Grid3x3 size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{totalAssignments.toLocaleString()}</span>
            <span className="asg-kpi-badge">Enrollments</span>
          </div>
        </div>

        {/* Card 4: Avg per Seafarer (Violet Purple Accent) */}
        <div className="asg-kpi-card asg-kpi-card--purple">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Avg / Seafarer</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <Award size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{avgPerCrew.toFixed(1)}</span>
            <span className="asg-kpi-badge">Ratio</span>
          </div>
        </div>

        {/* Card 5: Completed Courses (Ocean Sky Accent) */}
        <div className="asg-kpi-card asg-kpi-card--sky">
          <div className="asg-kpi-top">
            <div className="asg-kpi-lbl-wrap">
              <span className="asg-kpi-dot" />
              <span className="asg-kpi-lbl">Completed Courses</span>
            </div>
            <div className="asg-kpi-icon-wrap">
              <CheckCircle2 size={14} strokeWidth={2} />
            </div>
          </div>
          <div className="asg-kpi-bottom">
            <span className="asg-kpi-val">{completedAssignments.toLocaleString()}</span>
            <span className="asg-kpi-badge">Completed</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════ TABLE CARD ═══════════════════════ */}
      <div className="asg-table-card">
        <div className="asg-table-scroll" ref={tableScrollRef}>
          <table className="asg-table admin-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th style={{ width: 300 }}>Seafarer</th>
                <th>Assigned Courses</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.length === 0 && (
                <tr><td colSpan={4} className="mut" style={{ textAlign: 'center', padding: 40 }}>No seafarers match your search.</td></tr>
              )}
              {currentRows.map((row, index) => {
                // completed first, then in progress, then not started (stable within each group)
                const assigned = Object.entries(row.cells || {})
                  .map(([cid, cell]) => ({ course: data.courses.find(c => c.id === cid), cell }))
                  .filter(a => a.course)
                  .sort((a, b) => (STATUS_ORDER[a.cell.status] ?? 2) - (STATUS_ORDER[b.cell.status] ?? 2))
                const isOpen = expanded.has(row.learnerId)
                const shown = isOpen ? assigned : assigned.slice(0, VISIBLE_CHIPS)
                const extra = assigned.length - VISIBLE_CHIPS

                return (
                  <tr key={row.learnerId} className={row.isActive ? '' : 'row-inactive'}>
                    <td className="mut" style={{ fontSize: 11 }}>{(currentPage - 1) * itemsPerPage + index + 1}.</td>
                    <td>
                      <b>{row.name}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span className="mono mut">{row.crewId}</span>
                        {row.rank && <span className="pill learner sm">{row.rank}</span>}
                        {row.mobileNo && (
                          <a href={`tel:${row.mobileNo.replace(/[^\d+]/g, '')}`} title="Call"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px 2px 6px', borderRadius: 999,
                              background: 'rgba(16,185,129,0.1)', color: '#0d9488',
                              fontSize: 11, fontWeight: 600, textDecoration: 'none',
                              border: '1px solid rgba(16,185,129,0.25)', lineHeight: 1.6,
                            }}>
                            <Phone size={10} strokeWidth={2.5} />
                            {formatMobile(row.mobileNo)}
                          </a>
                        )}
                        {row.email ? (
                          <span
                            className="asg-email-pill asg-email-pill--has"
                            title={`Registered email: ${row.email}`}
                          >
                            <Mail size={10} strokeWidth={2.2} />
                            <span className="asg-email-pill-text">{row.email}</span>
                          </span>
                        ) : (
                          <span
                            className="asg-email-pill asg-email-pill--missing"
                            title={`Email not found for ${row.name} (not registered in SmartPAL)`}
                          >
                            <MailX size={10} strokeWidth={2.2} />
                            <span>Email not found</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {assigned.length === 0 ? (
                        <span className="mut" style={{ fontSize: 12 }}>No courses assigned</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                          {shown.map(({ course, cell }) => (
                            <CourseChip key={course.id} course={course} cell={cell}
                              onClick={() => setProgressView({ row, course, cell })} />
                          ))}
                          {extra > 0 && (
                            <button type="button" className="asg-more" onClick={() => toggleExpanded(row.learnerId)}>
                              {isOpen ? 'Show less' : `+${extra} more`}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button type="button" className="asg-manage-btn" onClick={() => setManageRow(row)}>
                          <BookOpen size={13} /> Manage Courses
                        </button>
                        {(() => {
                          const isSent = singleSentIds.has(row.learnerId)
                          const isSending = singleSendingId === row.learnerId
                          const hasEmail = Boolean(row.email && row.email.trim())
                          const isPending = hasPendingCourses(row)

                          if (!hasEmail) {
                            return (
                              <button
                                type="button"
                                className="asg-row-mail-btn asg-row-mail-btn--no-email"
                                onClick={() => {
                                  setToastMessage({
                                    type: 'error',
                                    text: `Cannot send reminder: No email address found for ${row.name}.`
                                  })
                                  setTimeout(() => setToastMessage(null), 4000)
                                }}
                                title={`Email not found: No registered email address on record for ${row.name}.`}
                                aria-label={`Email not found for ${row.name}`}
                              >
                                <MailX size={13} strokeWidth={2.2} />
                              </button>
                            )
                          }

                          if (!isPending) {
                            return (
                              <button
                                type="button"
                                className="asg-row-mail-btn asg-row-mail-btn--completed"
                                disabled
                                title={`All assigned courses are already completed for ${row.name}.`}
                                aria-label={`All courses completed for ${row.name}`}
                              >
                                <Check size={12} strokeWidth={2.5} />
                              </button>
                            )
                          }

                          return (
                            <button
                              type="button"
                              className={`asg-row-mail-btn ${isSent ? 'asg-row-mail-btn--sent' : 'asg-row-mail-btn--active'}`}
                              onClick={() => handleSendSingleReminder(row)}
                              disabled={isSending}
                              title={
                                isSent
                                  ? `Reminder already sent. Click to re-send to ${row.name} (${row.email})`
                                  : `Send course completion reminder to ${row.name} (${row.email})`
                              }
                              aria-label={`Send reminder email to ${row.name}`}
                            >
                              {isSending ? (
                                <Loader2 size={13} className="asg-spin" />
                              ) : isSent ? (
                                <MailCheck size={13} strokeWidth={2.2} />
                              ) : (
                                <Mail size={13} strokeWidth={2} />
                              )}
                            </button>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="asg-pagination-wrap">
          <Pagination currentPage={currentPage} totalPages={totalPages}
            totalItems={filteredRows.length} itemsPerPage={itemsPerPage} onPageChange={setCurrentPage} />
        </div>
      </div>

      {progressView && (
        <CourseProgressModal
          row={progressView.row} course={progressView.course} cell={progressView.cell}
          onClose={() => setProgressView(null)}
          onManage={() => {
            const r = progressView.row
            setProgressView(null)
            setManageRow(r)
          }}
          onReassign={() => handleReassign(progressView.row.learnerId, progressView.course.id)}
        />
      )}
      {manageRow && (
        <ManageCoursesModal row={manageRow} courses={data.courses}
          onClose={() => setManageRow(null)} onSaved={load} />
      )}
      {showReminderModal && (
        <SendReminderModal
          rankFilter={rankFilter}
          totalFiltered={filteredRows.length}
          eligibleCount={eligibleFilteredRows.length}
          withEmailCount={eligibleWithEmailCount}
          onClose={() => {
            setShowReminderModal(false)
            setReminderResult(null)
          }}
          onSend={handleSendBulkReminders}
          busy={reminderBusy}
          result={reminderResult}
        />
      )}
      {toastMessage && (
        <div className={`asg-toast asg-toast--${toastMessage.type}`}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  )
}
