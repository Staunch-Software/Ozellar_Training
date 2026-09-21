import { useEffect, useRef, useState } from 'react'
import {
  GraduationCap, CheckCircle2, AlertCircle, Send, LogOut, Ship, Anchor,
  Paperclip, X, Save, Check,
} from 'lucide-react'
import { ThemeToggle } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import {
  getMyOrientationEnrollment, completeOrientationTask, getCourses,
  deleteOrientationTaskAttachment, submitOrientationTask, submitMultipleOrientationTasks,
} from '../api.js'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '../NotificationBell.jsx'
import { TopNav } from '../App.jsx'
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

function TaskCard({ task, onToggle, onSaveNote, onAddFiles, onRemoveFile, onSubmit, busy }) {
  const [note, setNote] = useState(task.note || '')
  const fileRef = useRef(null)
  const noteDirty = note !== (task.note || '')
  const proofMissing = task.requiresProof && (!task.proofUrls || task.proofUrls.length === 0)
  
  const locked = task.status === 'pending_review' || task.status === 'approved'
  const isRejected = task.status === 'rejected'
  const isPending = task.status === 'pending_review'
  const isApproved = task.status === 'approved'
  const canSubmit = task.isCompleted && !proofMissing && (!task.status || task.status === 'draft' || isRejected)

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
        
        <div className="cnd-task-status-row" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cnd-task-status-labels" style={{ display: 'flex', gap: 8 }}>
            {isPending && <span className="cnd-badge" style={{ color: '#854d0e', background: '#fef08a', padding: '2px 6px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12}/> Pending task approve</span>}
            {isApproved && <span className="cnd-badge" style={{ color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={12}/> Approved</span>}
            {isRejected && <span className="cnd-badge" style={{ color: '#991b1b', background: '#fee2e2', padding: '2px 6px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12}/> Needs Rework</span>}
          </div>
          
          {canSubmit && (
            <button className="cnd-btn-submit-task" disabled={busy} onClick={() => onSubmit(task)}
              style={{ padding: '6px 12px', background: 'var(--cnd-accent)', color: 'white', borderRadius: 4, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={13} /> Submit Task
            </button>
          )}
        </div>
        
        {isRejected && task.rejectionNote && (
          <div className="cnd-task-rejection-note" style={{ marginTop: 8, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 13 }}>
            <strong>Master's Note:</strong> {task.rejectionNote}
          </div>
        )}
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

  const navigate = useNavigate()

  const load = () => getMyOrientationEnrollment().then((res) => {
    setEnrollment(res || null)
  }).catch((e) => setError(e.message))
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


  const readyTasks = enrollment ? enrollment.tasks.filter(t => {
    const proofMissing = t.requiresProof && (!t.proofUrls || t.proofUrls.length === 0)
    return t.isCompleted && !proofMissing && (!t.status || t.status === 'draft' || t.status === 'rejected')
  }) : []

  const submitReadyTasks = async () => {
    if (!(await confirm(`You are about to submit ${readyTasks.length} task(s) for review.`, {
      title: 'Submit tasks?', confirmLabel: 'Submit',
    }))) return
    
    setSubmitting(true)
    setError('')
    try {
      await submitMultipleOrientationTasks(readyTasks.map((t) => t.id))
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitTask = async (task) => {
    setBusyTaskId(task.id)
    setError('')
    try {
      await submitOrientationTask(task.id)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyTaskId(null)
    }
  }

  return (
    <>
      <TopNav />
      <div className="cnd-page">
        {dialog}

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
                            {enrollment.status === 'approved' && (
                <div className="cnd-banner cnd-banner--approved"><Check size={15} /> Approved — congratulations!</div>
              )}
              
              {error && <div className="form-error" style={{ marginBottom: 16 }}><AlertCircle size={15} /> {error}</div>}

              <div className="cnd-list">
                {enrollment.tasks.map((task) => (
                  <TaskCard key={task.id} task={task}
                    onToggle={toggle} onSaveNote={saveNote} onAddFiles={addFiles} onRemoveFile={removeFile}
                    onSubmit={submitTask} busy={busyTaskId === task.id} />
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

{readyTasks.length > 0 && (
                <button className="cnd-submit-btn"
                  disabled={submitting || busyTaskId}
                  onClick={submitReadyTasks}
                  style={{ marginTop: 16 }}>
                  <Send size={15} /> {submitting ? 'Submitting…' : (readyTasks.length === enrollment.tasks.length ? 'Submit all tasks' : `Submit ${readyTasks.length} task${readyTasks.length > 1 ? 's' : ''}`)}
                </button>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
    </>
  )
}
