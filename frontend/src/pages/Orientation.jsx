import { useEffect, useRef, useState } from 'react'
import {
  GraduationCap, CheckCircle2, AlertCircle, Send, LogOut, Ship, Anchor,
  Paperclip, X, Save, Check,
} from 'lucide-react'
import { ThemeToggle } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import {
  getMyOrientationEnrollment, completeOrientationTask,
  deleteOrientationTaskAttachment, submitOrientation,
} from '../api.js'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import NotificationBell from '../NotificationBell.jsx'
import './Orientation.css'

function ProgressRing({ pct, size = 72 }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--cnd-line)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--cnd-accent)" strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset .4s ease' }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill="var(--cnd-ink)" fontSize="14" fontWeight="800" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {pct}%
      </text>
    </svg>
  )
}

function attachmentName(url) {
  try { return decodeURIComponent(url.split('/').pop()) } catch { return url }
}

function TaskCard({ task, onToggle, onSaveNote, onAddFiles, onRemoveFile, busy, locked }) {
  const [note, setNote] = useState(task.note || '')
  const fileRef = useRef(null)
  const noteDirty = note !== (task.note || '')
  const proofMissing = task.requiresProof && (!task.proofUrls || task.proofUrls.length === 0)

  return (
    <div className={`cnd-task${task.isCompleted ? ' cnd-task--done' : ''}${proofMissing ? ' cnd-task--proof-missing' : ''}`}>
      <div className="cnd-task-top">
        <div className="cnd-task-num">{task.order + 1}</div>
        <div className="cnd-task-body">
          <div className={`cnd-task-title${task.isCompleted ? ' cnd-task-title--done' : ''}`}>
            {task.title}
            {task.requiresProof && (
              <span className={`cnd-task-required${proofMissing ? ' cnd-task-required--missing' : ''}`}>
                {proofMissing ? 'Attachment required — not added yet' : 'Attachment added'}
              </span>
            )}
          </div>
          {task.description && <div className="cnd-task-desc">{task.description}</div>}
        </div>
        <button className="cnd-task-toggle" disabled={busy || locked}
          onClick={() => onToggle(task, !task.isCompleted, note)}
          aria-label={task.isCompleted ? 'Mark incomplete' : 'Mark complete'}>
          <CheckCircle2 size={16} />
        </button>
      </div>

      <div className="cnd-task-extra">
        <div>
          <div className="cnd-task-note-label">Your notes / observations</div>
          <div className="cnd-task-note-row">
            <textarea className="cnd-task-note" rows={2} disabled={locked}
              placeholder="Add any remarks for this task..."
              value={note} onChange={(e) => setNote(e.target.value)} />
            {!locked && (
              <button className="cnd-task-note-save" disabled={busy || !noteDirty}
                onClick={() => onSaveNote(task, note)} title="Save note">
                <Save size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="cnd-attachments">
          {(task.proofUrls || []).map((url) => (
            <span key={url} className="cnd-attachment-chip">
              <Paperclip size={11} />
              <a href={url} target="_blank" rel="noreferrer">{attachmentName(url)}</a>
              {!locked && (
                <button className="cnd-attachment-remove" onClick={() => onRemoveFile(task, url)} aria-label="Remove attachment">
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {!locked && (
            <>
              <input ref={fileRef} type="file" multiple hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  if (files.length) onAddFiles(task, files, note)
                  e.target.value = ''
                }} />
              <button className="cnd-attachment-add" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Paperclip size={11} /> Add attachment
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Orientation() {
  const { user, logout } = useAuth()
  const [enrollment, setEnrollment] = useState(undefined) // undefined = loading, null = none
  const [busyTaskId, setBusyTaskId] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { confirm, dialog } = useConfirm()

  const load = () => getMyOrientationEnrollment().then(setEnrollment).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const run = async (task, action) => {
    setBusyTaskId(task.id)
    setError('')
    try {
      await action()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyTaskId(null)
    }
  }

  const toggle = (task, completed, note) => run(task, () => completeOrientationTask(task.id, completed, note, []))
  const saveNote = (task, note) => run(task, () => completeOrientationTask(task.id, task.isCompleted, note, []))
  const addFiles = (task, files, note) => run(task, () => completeOrientationTask(task.id, task.isCompleted, note, files))
  const removeFile = (task, url) => run(task, () => deleteOrientationTaskAttachment(task.id, url))

  const submit = async () => {
    if (!(await confirm('You will not be able to edit tasks while it is under review.', {
      title: 'Submit for approval?', confirmLabel: 'Submit',
    }))) return
    setSubmitting(true)
    setError('')
    try {
      await submitOrientation()
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const locked = enrollment && (enrollment.status === 'submitted' || enrollment.status === 'approved')
  const missingProof = enrollment
    ? enrollment.tasks.filter((t) => t.requiresProof && (!t.proofUrls || t.proofUrls.length === 0))
    : []

  return (
    <div className="cnd-page">
      {dialog}
      <nav className="cnd-nav">
        <div className="cnd-brand">
          <span className="cnd-brand-icon"><GraduationCap size={16} /></span>
          Orientation Program
        </div>
        <div className="cnd-nav-right">
          {user?.name && (
            <div className="cnd-nav-user"><strong>{user.name}</strong>{user.rank ? ` · ${user.rank}` : ''}</div>
          )}
          <NotificationBell />
          <ThemeToggle />
          <button className="iconbtn" aria-label="Sign out" onClick={logout}><LogOut size={18} /></button>
        </div>
      </nav>

      <div className="cnd-body">
        {enrollment === undefined ? (
          <div className="spinner">Loading…</div>
        ) : !enrollment ? (
          <div className="cnd-empty">
            <GraduationCap size={40} className="cnd-empty-icon" />
            <div className="cnd-empty-title">No orientation program assigned</div>
            <div className="cnd-empty-desc">
              Your training officer will enroll you here when it's time for your next promotion step.
            </div>
          </div>
        ) : (
          <div className="cnd-layout">
            <div className="cnd-main">
              {enrollment.status === 'submitted' && (
                <div className="cnd-banner cnd-banner--submitted">
                  <Check size={15} /> Submitted — awaiting review by {enrollment.masterName || `your vessel's ${enrollment.masterLabel?.toLowerCase()}`}.
                </div>
              )}
              {enrollment.status === 'approved' && (
                <div className="cnd-banner cnd-banner--approved"><Check size={15} /> Approved — congratulations!</div>
              )}
              {enrollment.status === 'rejected' && (
                <div className="cnd-banner cnd-banner--rejected">
                  <AlertCircle size={15} /> Sent back for review — fix the flagged items and resubmit.
                </div>
              )}

              {error && <div className="form-error" style={{ marginBottom: 16 }}><AlertCircle size={15} /> {error}</div>}

              <div className="cnd-list">
                {enrollment.tasks.map((task) => (
                  <TaskCard key={task.id} task={task}
                    onToggle={toggle} onSaveNote={saveNote} onAddFiles={addFiles} onRemoveFile={removeFile}
                    busy={busyTaskId === task.id} locked={locked} />
                ))}
              </div>
            </div>

            <aside className="cnd-side">
              <div className="cnd-side-card">
                <ProgressRing pct={enrollment.progressPct} />
                <div className="cnd-side-eyebrow">Promotion Checklist</div>
                <div className="cnd-side-title">{enrollment.programTitle}</div>
                <div className="cnd-side-meta">{enrollment.completedCount} of {enrollment.totalCount} tasks completed</div>
              </div>

              <div className="cnd-side-info">
                <div className="cnd-side-info-row">
                  <Ship size={14} />
                  <div>
                    <div className="cnd-side-info-lbl">Vessel</div>
                    <div className="cnd-side-info-val">{enrollment.vessel || '—'}</div>
                  </div>
                </div>
                <div className="cnd-side-info-row">
                  <Anchor size={14} />
                  <div>
                    <div className="cnd-side-info-lbl">{enrollment.masterLabel}</div>
                    <div className="cnd-side-info-val">{enrollment.masterName || '—'}</div>
                  </div>
                </div>
              </div>

              {(enrollment.status === 'in_progress' || enrollment.status === 'rejected') && (
                <button className="cnd-submit-btn"
                  disabled={enrollment.progressPct < 100 || missingProof.length > 0 || submitting}
                  onClick={submit}>
                  <Send size={15} /> {submitting ? 'Submitting…' : 'Submit for approval'}
                </button>
              )}
              {enrollment.progressPct < 100 && (enrollment.status === 'in_progress' || enrollment.status === 'rejected') && (
                <div className="cnd-side-hint">Complete every task to unlock submission.</div>
              )}
              {enrollment.progressPct === 100 && missingProof.length > 0 && (enrollment.status === 'in_progress' || enrollment.status === 'rejected') && (
                <div className="cnd-side-hint cnd-side-hint--warn">
                  <Paperclip size={12} /> Attach a document/photo for {missingProof.length} task{missingProof.length > 1 ? 's' : ''} to unlock submission.
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
