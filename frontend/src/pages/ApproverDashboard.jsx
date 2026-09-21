import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ShieldCheck, LogOut, CheckCircle2, XCircle, AlertCircle, Paperclip, Inbox,
  FileText, X, ExternalLink, Image as ImageIcon, MessageSquare, ChevronLeft, ChevronRight,
  ShieldQuestion,
} from 'lucide-react'
import { ThemeToggle, TopNav } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import {
  getApproverSubmissions, verifyOrientationTask, decideOrientationSubmission,
} from '../api.js'
import { useConfirm } from '../components/ConfirmDialog.jsx'
import NotificationBell from '../NotificationBell.jsx'
import './ApproverDashboard.css'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

function fmtShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' })
}

function attachmentName(url, i, total) {
  const label = total > 1 ? `Attachment ${i + 1}` : 'Attachment'
  return label
}

function attachmentKind(url) {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'file'
}

// Evidence-grid thumbnail, captioned with the
// task it belongs to — lets the reviewer flash through every attachment in
// the submission without hunting through 40+ task cards to find them.
function EvidenceCard({ url, taskTitle, onOpen }) {
  const kind = attachmentKind(url)
  return (
    <button type="button" className="apr-evidence-card" onClick={() => onOpen(url, kind)} title={taskTitle}>
      <div className={`apr-evidence-thumb apr-evidence-thumb--${kind}`}>
        {kind === 'image' ? <img src={url} alt={taskTitle} loading="lazy" />
          : kind === 'pdf' ? <FileText size={22} /> : <Paperclip size={20} />}
      </div>
      <span className="apr-evidence-caption">{taskTitle}</span>
    </button>
  )
}

function AttachmentViewer({ url, kind, onClose }) {
  return (
    <div className="apr-viewer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="apr-viewer">
        <div className="apr-viewer-bar">
          <span className="apr-viewer-bar-icon">{kind === 'pdf' ? <FileText size={14} /> : <ImageIcon size={14} />}</span>
          <a href={url} target="_blank" rel="noreferrer" className="apr-viewer-open"><ExternalLink size={13} /> Open in new tab</a>
          <button className="apr-viewer-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="apr-viewer-body">
          {kind === 'pdf'
            ? <iframe src={url} title="Attachment preview" />
            : <img src={url} alt="Attachment preview" />}
        </div>
      </div>
    </div>
  )
}

function SubmissionDetail({ s, onDecide, onVerifyTask }) {
  const [busy, setBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [viewer, setViewer] = useState(null)
  const [idx, setIdx] = useState(0)
  const activePipRef = useRef(null)
  const { confirm, dialog } = useConfirm()
  const openViewer = (url, kind) => setViewer({ url, kind })

  // Start from the first task whenever a different submission is opened.
  useEffect(() => { setIdx(0) }, [s.id])

  // Keep the active pip in view as idx changes (Prev/Next or a task jump) —
  // with up to 49 tasks the strip scrolls horizontally, so without this the
  // active pip can walk off-screen while stepping through with Next. Plain
  // 'auto' (instant) rather than 'smooth' — smooth animations queued back
  // to back (fast repeated clicks) interrupt each other and can leave the
  // strip short of the real target; instant always lands correctly.
  useEffect(() => {
    activePipRef.current?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' })
  }, [idx])

  const tasks = s.tasks
  const total = tasks.length
  const task = tasks[Math.min(idx, total - 1)]
  const goTo = (i) => setIdx(Math.max(0, Math.min(total - 1, i)))
  const evidenceCount = (task.proofUrls || []).length
  const isPending = s.status === 'pending'
  const verifiedCount = s.verifiedCount ?? tasks.filter((t) => t.status === 'approved').length
  const allVerified = s.allVerified ?? (total > 0 && verifiedCount === total)


  const decide = async (action) => {
    const msg = action === 'approve'
      ? 'This will mark the orientation as fully approved and notify the crew member and admin.'
      : 'This will reject the orientation program.'
    if (!(await confirm(msg, { title: action === 'approve' ? 'Final Approve Program?' : 'Reject Program?', confirmLabel: action === 'approve' ? 'Approve Program' : 'Reject' }))) return
    setBusy(true)
    try {
      await onDecide(s.id, action)
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async (action) => {
    let note = null
    if (action === 'reject') {
      note = window.prompt("Rejection Note: What needs to be fixed?")
      if (!note) return // cancelled
    }
    setVerifyBusy(true)
    try {
      await onVerifyTask(s.id, task.id, action, note)
      // Auto-advance to the next pending task
      const nextPending = tasks.findIndex((t, i) => i > idx && !t.verified && t.status !== 'rejected' && t.status === 'pending_review')
      if (nextPending >= 0) {
        setIdx(nextPending)
      } else {
        const anyPending = tasks.findIndex((t) => !t.verified && t.status !== 'rejected' && t.status === 'pending_review')
        if (anyPending >= 0) {
          setIdx(anyPending)
        }
      }
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <div className="apr-detail">
      {dialog}
      {viewer && <AttachmentViewer url={viewer.url} kind={viewer.kind} onClose={() => setViewer(null)} />}
      <div className="apr-detail-head">
        <div className="apr-detail-head-info">
          <div className="apr-detail-name">{s.candidateName}</div>
          <div className="apr-detail-sub">{s.candidateRank} · {s.programTitle} · {s.vessel}</div>
        </div>
        <span className={`apr-status-pill apr-status-pill--${s.status}`}>
          {s.status === 'waiting_on_crew' ? 'Waiting on Crew' : s.status}
        </span>
        <div className="apr-detail-date">Submitted {fmt(s.submittedAt)}</div>
      </div>

      {/* task-by-task navigator — jump to any task, or step through with Prev/Next */}
      <div className="apr-stepper">
        <div className="apr-stepper-track">
          {tasks.map((t, i) => {
            const flagged = !!t.note || (t.proofUrls || []).length > 0
            return (
              <button key={t.id} type="button" ref={i === idx ? activePipRef : null}
                className={`apr-stepper-pip${i === idx ? ' apr-stepper-pip--active' : ''}${flagged ? ' apr-stepper-pip--flagged' : ''}${t.status === 'approved' ? ' apr-stepper-pip--verified' : (t.status === 'rejected' ? ' apr-stepper-pip--rejected' : '')}`}
                onClick={() => goTo(i)} title={t.verified ? `${t.title} — verified` : t.title}>
                {t.status === 'approved' ? <ShieldCheck size={11} /> : (t.status === 'rejected' ? <XCircle size={11} /> : i + 1)}
              </button>
            )
          })}
        </div>
        <div className="apr-stepper-progress">
          <ShieldQuestion size={12} /> {verifiedCount} of {total} tasks verified
        </div>
      </div>

      <div className="apr-detail-body apr-detail-body--review">
        <div className="apr-review-nav">
          <button className="apr-nav-btn" disabled={idx === 0} onClick={() => goTo(idx - 1)} aria-label="Previous task">
            <ChevronLeft size={16} />
          </button>
          <div className="apr-review-position">Task {idx + 1} of {total}</div>
          <button className="apr-nav-btn" disabled={idx === total - 1} onClick={() => goTo(idx + 1)} aria-label="Next task">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="apr-review-card">
          <div className="apr-review-top">
            <div className="apr-review-num">{idx + 1}</div>
            <div className="apr-review-title">{task.title}</div>
            <CheckCircle2 size={18} className="apr-review-check" title="Completed" />
          </div>

          {task.description && <div className="apr-review-desc">{task.description}</div>}

          {task.note && (
            <div className="apr-review-note">
              <div className="apr-review-block-label"><MessageSquare size={12} /> Officer's note</div>
              <div className="apr-review-note-text">{task.note}</div>
            </div>
          )}

          {evidenceCount > 0 && (
            <div className="apr-review-evidence">
              <div className="apr-review-block-label"><Paperclip size={12} /> Attachments ({evidenceCount})</div>
              <div className="apr-evidence-grid">
                {task.proofUrls.map((url, i) => (
                  <EvidenceCard key={url} url={url} taskTitle={attachmentName(url, i, evidenceCount)} onOpen={openViewer} />
                ))}
              </div>
            </div>
          )}

          {!task.note && evidenceCount === 0 && (
            <div className="apr-review-empty">Marked complete — no notes or attachments were added for this task.</div>
          )}

          {task.status === 'pending_review' && (
            <div className="apr-task-decide-actions" style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" disabled={verifyBusy}
                className="apr-btn apr-btn--approve"
                onClick={() => handleVerify('approve')}>
                <CheckCircle2 size={14} /> Approve Task
              </button>
              <button type="button" disabled={verifyBusy}
                className="apr-btn apr-btn--reject"
                onClick={() => handleVerify('reject')}>
                <XCircle size={14} /> Reject Task
              </button>
            </div>
          )}
          {task.status === 'approved' && (
            <div className="apr-task-status-banner" style={{ marginTop: 16, padding: 10, background: '#dcfce7', color: '#166534', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <ShieldCheck size={15} /> Verified {task.verifiedAt ? ` · ${fmt(task.verifiedAt)}` : ''}
            </div>
          )}
          {task.status === 'rejected' && (
            <div className="apr-task-status-banner" style={{ marginTop: 16, padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <XCircle size={15} /> Rejected {task.rejectionNote ? ` · Note: ${task.rejectionNote}` : ''}
            </div>
          )}
        </div>

        <div className="apr-review-footer-nav">
          <button className="apr-review-navbtn" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
            <ChevronLeft size={14} /> Previous
          </button>
          <button className="apr-review-navbtn apr-review-navbtn--next" disabled={idx === total - 1} onClick={() => goTo(idx + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {(s.status === 'pending' || s.status === 'waiting_on_crew') ? (
        <div className="apr-detail-foot">
          <button className="apr-btn apr-btn--approve" disabled={busy || !allVerified} onClick={() => decide('approve')}
            title={allVerified ? undefined : `Verify all ${total} tasks before approving (${verifiedCount} of ${total} done)`}>
            <CheckCircle2 size={14} /> Final Approve Program
          </button>
          <button className="apr-btn apr-btn--reject" disabled={busy} onClick={() => decide('reject')}>
            <XCircle size={14} /> Reject
          </button>
          {!allVerified && (
            <span className="apr-verify-hint">Verify all {total} tasks to enable Approve ({verifiedCount}/{total})</span>
          )}
        </div>
      ) : (
        <div className="apr-detail-decided">Decided {fmt(s.decidedAt)}</div>
      )}
    </div>
  )
}

export default function ApproverDashboard() {
  const { user, logout } = useAuth()
  const [submissions, setSubmissions] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('pending')
  const [selectedId, setSelectedId] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkedId = searchParams.get('submission')

  const load = () => getApproverSubmissions().then(setSubmissions).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  // Patch just the one submission in place rather than refetching the
  // whole list on every single task-verify click.
  const verifyTask = async (submissionId, taskId, action, note) => {
    const updated = await verifyOrientationTask(submissionId, taskId, action, note)
    setSubmissions((prev) => (prev || []).map((sub) => (sub.id === submissionId ? updated : sub)))
  }

  const decideSubmission = async (submissionId, action) => {
    await decideOrientationSubmission(submissionId, action)
    await load()
  }

  const pending = useMemo(() => (submissions || []).filter((s) => s.status === 'pending' || s.status === 'waiting_on_crew'), [submissions])
  const decided = useMemo(() => (submissions || []).filter((s) => s.status !== 'pending' && s.status !== 'waiting_on_crew'), [submissions])
  const visibleList = tab === 'pending' ? pending : decided

  // Keep a selection alive across reloads (e.g. right after approving one),
  // falling back to the first row of whichever tab is active — unless we
  // just landed here from a "New submission awaiting your review"
  // notification (?submission=<id>), in which case that submission wins
  // (on its own tab — Pending vs History, since it may already be decided
  // by the time the approver clicks through). Consumed once so a later
  // manual selection isn't fought.
  useEffect(() => {
    if (!submissions) return
    if (deepLinkedId) {
      setSearchParams((prev) => { prev.delete('submission'); return prev }, { replace: true })
      const target = submissions.find((s) => s.id === deepLinkedId)
      if (target) {
        setTab((target.status === 'pending' || target.status === 'waiting_on_crew') ? 'pending' : 'history')
        setSelectedId(target.id)
        return
      }
    }
    if (selectedId && submissions.some((s) => s.id === selectedId)) return
    setSelectedId(visibleList[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, tab, deepLinkedId])

  const selected = (submissions || []).find((s) => s.id === selectedId) || null

  return (
    <>
      <TopNav />
      <div className="apr-page">
        <div className="apr-body">
        {error && <div className="form-error" style={{ marginBottom: 14 }}><AlertCircle size={15} /> {error}</div>}

        {!submissions ? (
          <div className="spinner">Loading…</div>
        ) : (
          <div className="apr-layout">
            <aside className="apr-list-col">
              <div className="apr-list-tabs">
                <button className={`apr-list-tab${tab === 'pending' ? ' apr-list-tab--active' : ''}`} onClick={() => setTab('pending')}>
                  Pending <span className="apr-list-tab-count">{pending.length}</span>
                </button>
                <button className={`apr-list-tab${tab === 'history' ? ' apr-list-tab--active' : ''}`} onClick={() => setTab('history')}>
                  History <span className="apr-list-tab-count">{decided.length}</span>
                </button>
              </div>
              <div className="apr-list">
                {visibleList.length === 0 ? (
                  <div className="apr-list-empty">{tab === 'pending' ? 'Nothing pending.' : 'No decided submissions yet.'}</div>
                ) : visibleList.map((s) => (
                  <button key={s.id}
                    className={`apr-list-item${s.id === selectedId ? ' apr-list-item--active' : ''}`}
                    onClick={() => setSelectedId(s.id)}>
                    <span className={`apr-status-dot apr-status-dot--${s.status}`} />
                    <div className="apr-list-item-info">
                      <div className="apr-list-item-name">{s.candidateName}</div>
                      <div className="apr-list-item-sub">{s.candidateRank} · {s.programTitle}</div>
                    </div>
                    <div className="apr-list-item-date">{fmtShort(s.submittedAt)}</div>
                  </button>
                ))}
              </div>
            </aside>

            {selected ? (
              <SubmissionDetail s={selected} onDecide={decideSubmission} onVerifyTask={verifyTask} />
            ) : (
              <div className="apr-detail">
                <div className="apr-detail-empty">
                  <Inbox size={30} className="apr-detail-empty-icon" />
                  <div className="apr-detail-empty-title">Nothing to review</div>
                  <div>{tab === 'pending' ? 'No pending submissions for your vessel right now.' : 'No decided submissions yet.'}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
