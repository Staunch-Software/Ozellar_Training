import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Check, AlertCircle, ShieldCheck, Clock, FileText, Paperclip,
  Eye, Search, Ship, Cog, MessageSquare, CheckCircle2, XCircle,
  ExternalLink, X, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, ShieldQuestion,
  FileSpreadsheet, Image as ImageIcon, Music, Video, FileArchive, Download, Send, CheckCheck
} from 'lucide-react'
import {
  adminGetOrientationEnrollmentDetail,
  adminDecideOrientationEnrollment,
  adminVerifyOrientationTask,
  adminApproveAllOrientationTasks
} from '../../api.js'
import { useAuth } from '../../auth.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import FilePreviewModal, { detectFileType, cleanFileName } from '../../components/FilePreviewModal.jsx'
import './AdminOrientationReviewPage.css'

function fmt(iso) {
  if (!iso) return '—'
  const withOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}+05:30`
  return new Date(withOffset).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

function attachmentLabel(url, i, total) {
  const clean = cleanFileName(url, '')
  if (clean && clean !== 'Attachment') return clean
  return total > 1 ? `Attachment ${i + 1}` : 'Attachment'
}

// Premium Evidence Card for High-Priority Attachment Section
function PremiumEvidenceCard({ url, taskTitle, onOpen }) {
  const meta = detectFileType(url)
  const Icon = meta.icon
  const fileName = cleanFileName(url, 'Attachment')

  return (
    <div
      className="orp-evidence-card"
      onClick={onOpen}
      title={`Click to preview ${fileName}`}
    >
      <div className={`orp-evidence-thumb orp-evidence-thumb--${meta.kind}`}>
        {meta.kind === 'image' ? (
          <img src={url} alt={fileName} loading="lazy" />
        ) : (
          <div className="orp-evidence-icon-wrap">
            <Icon size={28} style={{ color: meta.color }} />
            <span className="orp-evidence-ext-badge">{meta.ext.toUpperCase()}</span>
          </div>
        )}
        <div className="orp-evidence-overlay">
          <span className="orp-evidence-preview-pill">
            <Eye size={12} /> Preview
          </span>
        </div>
      </div>
      <div className="orp-evidence-meta">
        <span className="orp-evidence-title" title={fileName}>{fileName}</span>
        <span className="orp-evidence-sub">{meta.label}</span>
      </div>
    </div>
  )
}

// Custom Ultra-Premium Jump Dropdown Component
function TaskJumpDropdown({ tasks, currentIndex, onSelect }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)
  const searchInputRef = useRef(null)

  const currentTask = tasks[currentIndex]
  const isCurrentVerified = currentTask?.status === 'approved' || currentTask?.verified

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setSearch('')
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [open])

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks
    const q = search.trim().toLowerCase()
    return tasks.filter((t, i) =>
      `#${i + 1}`.includes(q) ||
      (t.title || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }, [tasks, search])

  const verifiedInList = useMemo(() => {
    return tasks.filter((t) => t.status === 'approved' || t.verified).length
  }, [tasks])

  return (
    <div className="orp-jump-dropdown" ref={containerRef}>
      <button
        type="button"
        className={`orp-jump-trigger ${open ? 'orp-jump-trigger--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Jump directly to any task"
      >
        <span className={`orp-jump-num-pill ${isCurrentVerified ? 'orp-jump-num-pill--verified' : ''}`}>
          #{currentIndex + 1}
        </span>
        {isCurrentVerified && (
          <ShieldCheck size={13} className="orp-jump-icon-verified" />
        )}
        <span className="orp-jump-label-text">
          {currentTask?.title || 'Select task...'}
        </span>
        <ChevronDown size={14} className={`orp-jump-chevron ${open ? 'orp-jump-chevron--rotated' : ''}`} />
      </button>

      {open && (
        <div className="orp-jump-menu" role="listbox">
          <div className="orp-jump-menu-head">
            <span className="orp-jump-menu-title">Task Navigator ({tasks.length})</span>
            <span className="orp-jump-menu-stats">
              <ShieldCheck size={11} />
              {verifiedInList}/{tasks.length} Verified
            </span>
          </div>

          {tasks.length >= 2 && (
            <div className="orp-jump-menu-search">
              <Search size={13} className="orp-jump-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="orp-jump-search-input"
                placeholder={tasks.length > 5 ? `Search across ${tasks.length} tasks...` : 'Search tasks by name or #...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {search && (
                <button
                  type="button"
                  className="orp-jump-search-clear"
                  onClick={() => setSearch('')}
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <div className="orp-jump-menu-list">
            {filteredTasks.length === 0 ? (
              <div className="orp-jump-menu-empty">No matching tasks found</div>
            ) : (
              filteredTasks.map((t) => {
                const origIdx = tasks.findIndex((orig) => orig.id === t.id)
                const isSelected = origIdx === currentIndex
                const isVerified = t.status === 'approved' || t.verified
                const isRejected = t.status === 'rejected'
                const proofs = t.proofUrls || []
                const hasNote = !!t.note

                return (
                  <button
                    key={t.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`orp-jump-menu-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSelect(origIdx)
                      setOpen(false)
                    }}
                  >
                    <span className={`orp-jump-item-num ${isVerified ? 'verified' : ''}`}>
                      #{origIdx + 1}
                    </span>

                    <span className="orp-jump-item-name" title={t.title}>
                      {t.title}
                    </span>

                    <div className="orp-jump-item-tags">
                      {proofs.length > 0 && (
                        <span className="orp-jump-tag-proof" title={`${proofs.length} attachment(s)`}>
                          <Paperclip size={10} /> {proofs.length}
                        </span>
                      )}
                      {hasNote && (
                        <span className="orp-jump-tag-note" title="Officer Note">
                          <MessageSquare size={11} />
                        </span>
                      )}
                      {isVerified ? (
                        <span className="orp-jump-tag-verified" title="Master Verified">
                          <ShieldCheck size={13} />
                        </span>
                      ) : isRejected ? (
                        <span className="orp-jump-tag-rejected" title="Needs Revision">
                          <XCircle size={13} />
                        </span>
                      ) : null}
                      {isSelected && (
                        <Check size={13} className="orp-jump-item-check" />
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminOrientationReviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: me } = useAuth()
  const isSuperAdmin = me?.role === 'super_admin'
  const isAdmin = me?.role === 'admin' || me?.role === 'office_admin' || isSuperAdmin

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [idx, setIdx] = useState(0)
  const [viewer, setViewer] = useState(null) // { items, index, taskTitle }
  const [deciding, setDeciding] = useState(false)
  const [taskBusyId, setTaskBusyId] = useState(null)
  const [rejectModal, setRejectModal] = useState({
    open: false,
    task: null,
    remark: '',
    error: '',
    submitting: false,
  })
  const [programRejectModal, setProgramRejectModal] = useState({
    open: false,
    remark: '',
    error: '',
    submitting: false,
  })
  const [bulkApproving, setBulkApproving] = useState(false)
  const activePipRef = useRef(null)
  const { confirm, dialog } = useConfirm()

  const openViewer = (clickedIdx) => {
    const proofUrls = task?.proofUrls || []
    const items = proofUrls.map((u, i) => ({
      url: u,
      title: attachmentLabel(u, i, proofUrls.length),
      taskTitle: `Task #${idx + 1}: ${task?.title || 'Checklist Requirement'}`
    }))
    setViewer({
      items,
      index: clickedIdx,
      taskTitle: `Task #${idx + 1}: ${task?.title || ''}`
    })
  }

  const loadData = () => {
    if (!id) return
    setLoading(true)
    setError(null)
    adminGetOrientationEnrollmentDetail(id)
      .then((res) => {
        setData(res)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Could not load enrollment review data.')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { setIdx(0) }, [id])

  const tasks = data?.tasks || []
  const total = tasks.length
  const task = tasks[Math.min(idx, Math.max(0, total - 1))] || null
  const goTo = (i) => setIdx(Math.max(0, Math.min(total - 1, i)))

  // Scroll active pip into view
  useEffect(() => {
    activePipRef.current?.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' })
  }, [idx])

  // Keyboard navigation (ArrowLeft / ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === 'ArrowLeft') {
        setIdx((prev) => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight') {
        setIdx((prev) => Math.min(total - 1, prev + 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [total])

  const evidenceCount = (task?.proofUrls || []).length
  const verifiedCount = data?.verifiedCount ?? tasks.filter((t) => t.status === 'approved' || t.verified).length
  const enrollmentStatus = data?.enrollmentStatus || data?.status || 'in_progress'
  const isFinalApproved = enrollmentStatus === 'approved'
  const isMasterApproved = enrollmentStatus === 'master_approved'

  const isTaskAdminApproved = (t) => Boolean(
    t &&
    t.status === 'approved' &&
    (
      t.isAdminApproved === true ||
      ['admin', 'super_admin', 'office_admin'].includes(t.verifiedByRole) ||
      (t.verifiedBy && (
        t.verifiedBy.toLowerCase().includes('admin') ||
        t.verifiedBy === me?.full_name
      ))
    )
  )

  const allTasksApproved = total > 0 && tasks.every((t) => isTaskAdminApproved(t))
  const approvedTasksCount = tasks.filter((t) => isTaskAdminApproved(t)).length
  const isAdminApproved = isTaskAdminApproved(task)

  const handleApproveAll = async () => {
    if (!data || bulkApproving) return
    const ok = await confirm(
      `Approve all ${total} tasks as Admin for ${data.candidateName}? This will verify all checklist tasks and enable Final Approval.`,
      {
        title: 'Approve All Tasks?',
        confirmLabel: 'Approve All',
        danger: false,
      }
    )
    if (!ok) return
    setBulkApproving(true)
    setError(null)
    try {
      const updated = await adminApproveAllOrientationTasks(data.id)
      setData(updated)
    } catch (e) {
      setError(e.message || 'Failed to approve all tasks.')
    } finally {
      setBulkApproving(false)
    }
  }

  const handleDecide = async (action) => {
    if (!data) return
    const isApprove = action === 'approve'
    if (!isApprove) {
      setProgramRejectModal({ open: true, remark: '', error: '', submitting: false })
      return
    }
    if (!allTasksApproved) {
      alert(`Cannot final approve: please approve all tasks first (${approvedTasksCount}/${total} tasks approved by Admin).`)
      return
    }
    const title = 'Final Approve Program?'
    const msg = `This will grant final admin approval for ${data.candidateName}'s promotion checklist and notify the crew member.`
    const ok = await confirm(msg, {
      title,
      confirmLabel: 'Final Approve',
      danger: false,
    })
    if (!ok) return

    setDeciding(true)
    try {
      await adminDecideOrientationEnrollment(data.id, 'approve')
      loadData()
    } catch (e) {
      setError(e.message || 'Failed to update program status.')
    } finally {
      setDeciding(false)
    }
  }

  const handleConfirmProgramReject = async () => {
    setProgramRejectModal((prev) => ({ ...prev, submitting: true, error: '' }))
    try {
      await adminDecideOrientationEnrollment(data.id, 'reject', programRejectModal.remark)
      setProgramRejectModal({ open: false, remark: '', error: '', submitting: false })
      loadData()
    } catch (e) {
      setProgramRejectModal((prev) => ({ ...prev, submitting: false, error: e.message || 'Failed to reject program.' }))
    }
  }

  const handleApproveTask = async (taskId) => {
    if (!data || !taskId) return
    setTaskBusyId(taskId)
    setError(null)
    try {
      const updated = await adminVerifyOrientationTask(data.id, taskId, 'approve')
      setData(updated)
    } catch (e) {
      setError(e.message || 'Failed to approve task.')
    } finally {
      setTaskBusyId(null)
    }
  }

  const openRejectModal = (t) => {
    setRejectModal({
      open: true,
      task: t,
      remark: t?.rejectionNote || '',
      error: '',
      submitting: false,
    })
  }

  const closeRejectModal = () => {
    setRejectModal({
      open: false,
      task: null,
      remark: '',
      error: '',
      submitting: false,
    })
  }

  const handleConfirmTaskReject = async () => {
    const { task, remark } = rejectModal
    if (!task) return
    const trimmed = (remark || '').trim()
    if (!trimmed) {
      setRejectModal((prev) => ({ ...prev, error: 'Please enter a remark explaining what the seafarer must do.' }))
      return
    }

    setRejectModal((prev) => ({ ...prev, submitting: true, error: '' }))
    setTaskBusyId(task.id)
    try {
      const updated = await adminVerifyOrientationTask(data.id, task.id, 'reject', trimmed)
      setData(updated)
      closeRejectModal()
    } catch (e) {
      setRejectModal((prev) => ({ ...prev, submitting: false, error: e.message || 'Failed to reject task.' }))
    } finally {
      setTaskBusyId(null)
    }
  }

  return (
    <div className="orp-container">
      {dialog}
      {viewer && (
        <FilePreviewModal
          items={viewer.items}
          initialIndex={viewer.index}
          taskTitle={viewer.taskTitle}
          onClose={() => setViewer(null)}
        />
      )}

      <div className="orp-frame">
        {loading && !data && (
          <div className="orp-loading">
            <RefreshCw size={28} className="orp-spin" />
            <span>Loading orientation tasks...</span>
          </div>
        )}

        {error && (
          <div className="orp-error">
            <AlertCircle size={32} color="#dc2626" />
            <div className="orp-error-title">Error loading review</div>
            <p className="orp-error-sub">{error}</p>
            <button type="button" className="orp-btn" onClick={loadData}>Try Again</button>
          </div>
        )}

        {data && (
          <div className="orp-card-wrapper">
            {/* 1. Header Row — Candidate, Rank, Vessel, Program, Status Badge */}
            <div className="orp-header">
              <button
                type="button"
                className="orp-back-btn"
                onClick={() => {
                  if (window.history.length > 1) {
                    navigate(-1)
                  } else {
                    navigate('/admin/orientation-program/enrollments')
                  }
                }}
                title="Return to Enrollments"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>

              <div className="orp-header-info">
                <h1 className="orp-candidate-name">{data.candidateName}</h1>
                <div className="orp-candidate-meta">
                  <span>{(data.candidateRank || 'Officer').toUpperCase()}</span>
                  <span className="orp-meta-sep">·</span>
                  <span>{data.programTitle}</span>
                  <span className="orp-meta-sep">·</span>
                  <span>{data.vessel || data.vesselName || 'Vessel'}</span>
                </div>
              </div>

              <div className="orp-header-status-group">
                <span className={`orp-status-pill orp-status-pill--${enrollmentStatus}`}>
                  {enrollmentStatus === 'master_approved' ? 'PENDING ADMIN APPROVAL' : enrollmentStatus.replace('_', ' ').toUpperCase()}
                </span>
                <span className="orp-submitted-date">Submitted {fmt(data.submittedAt)}</span>
                <button
                  type="button"
                  className="orp-refresh-btn"
                  onClick={loadData}
                  title="Refresh enrollment data"
                >
                  <RefreshCw size={13} className={loading ? 'orp-spin' : ''} />
                </button>
              </div>
            </div>

            {/* 2. Sub-Header: Stepper Pips + Position Navigator + Custom Premium Jump Select */}
            <div className="orp-sub-header">
              <div className="orp-stepper-left">
                <div className="orp-stepper-track">
                  {tasks.map((t, i) => {
                    const flagged = !!t.note || (t.proofUrls || []).length > 0
                    const isVerified = t.status === 'approved' || t.verified
                    const isRejected = t.status === 'rejected'
                    const isAdminDone = isTaskAdminApproved(t)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        ref={i === idx ? activePipRef : null}
                        className={`orp-stepper-pip${i === idx ? ' orp-stepper-pip--active' : ''}${flagged ? ' orp-stepper-pip--flagged' : ''}${isAdminDone ? ' orp-stepper-pip--admin-verified' : (isVerified ? ' orp-stepper-pip--verified' : (isRejected ? ' orp-stepper-pip--rejected' : ''))}`}
                        onClick={() => goTo(i)}
                        title={`Task ${i + 1}: ${t.title}${isAdminDone ? ' — Approved by Admin' : (isVerified ? ' — Verified by Master' : '')}`}
                      >
                        {isAdminDone ? (
                          <ShieldCheck size={12} />
                        ) : isVerified ? (
                          <ShieldCheck size={12} />
                        ) : isRejected ? (
                          <XCircle size={12} />
                        ) : (
                          i + 1
                        )}
                      </button>
                    )
                  })}
                </div>
                <div className="orp-stepper-summary">
                  <ShieldCheck size={12} className="orp-verified-icon" />
                  <span>
                    {approvedTasksCount} of {total} tasks approved by Admin
                    {verifiedCount > 0 && ` (${verifiedCount} verified by Master)`}
                  </span>
                  {approvedTasksCount < total && isMasterApproved && (isAdmin || isSuperAdmin) && (
                    <button
                      type="button"
                      className="orp-approve-all-btn"
                      onClick={handleApproveAll}
                      disabled={bulkApproving || loading}
                      title="Approve all remaining tasks as Admin"
                    >
                      <CheckCheck size={13} />
                      {bulkApproving ? 'Approving...' : 'Approve All Tasks'}
                    </button>
                  )}
                </div>
              </div>

              <div className="orp-stepper-center">
                <button
                  type="button"
                  className="orp-step-btn"
                  disabled={idx === 0}
                  onClick={() => goTo(idx - 1)}
                  aria-label="Previous Task"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="orp-step-counter">
                  Task {idx + 1} of {total}
                </div>
                <button
                  type="button"
                  className="orp-step-btn"
                  disabled={idx === total - 1}
                  onClick={() => goTo(idx + 1)}
                  aria-label="Next Task"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="orp-stepper-right">
                <span className="orp-jump-lbl">Jump:</span>
                <TaskJumpDropdown
                  tasks={tasks}
                  currentIndex={idx}
                  onSelect={(newIdx) => goTo(newIdx)}
                />
              </div>
            </div>

            {/* 3. THE 70% HEIGHT PLACE: Primary Question & Attachments Review Box */}
            <div className="orp-review-container-70">
              {task ? (
                <div className="orp-review-card">
                  {/* Question / Task Title Header (High Priority) */}
                  <div className="orp-task-head">
                    <div className="orp-task-num-badge">{idx + 1}</div>
                    <div className="orp-task-title-wrap">
                      <h2 className="orp-task-title">{task.title}</h2>
                      {task.description && (
                        <div className="orp-task-desc">{task.description}</div>
                      )}
                    </div>
                    {task.isCompleted ? (
                      <CheckCircle2 size={22} className="orp-completed-check" title="Completed by Officer" />
                    ) : (
                      <span className="orp-incomplete-tag">Incomplete</span>
                    )}
                  </div>

                  {/* Officer's Note Section */}
                  {task.note && (
                    <div className="orp-section-box orp-note-box">
                      <div className="orp-box-label">
                        <MessageSquare size={13} />
                        <span>OFFICER'S NOTE</span>
                      </div>
                      <div className="orp-note-text">{task.note}</div>
                    </div>
                  )}

                  {/* Attachments Section (Highest Priority) */}
                  <div className="orp-section-box orp-attachment-box">
                    <div className="orp-box-label orp-attachment-label">
                      <Paperclip size={13} />
                      <span>ATTACHMENTS ({evidenceCount}) — CLICK TO PREVIEW</span>
                    </div>

                    {evidenceCount > 0 ? (
                      <div className="orp-evidence-row">
                        {task.proofUrls.map((url, i) => (
                          <PremiumEvidenceCard
                            key={url}
                            url={url}
                            taskTitle={attachmentLabel(url, i, evidenceCount)}
                            onOpen={() => openViewer(i)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="orp-no-attachments">
                        {task.requiresProof ? (
                          <span className="orp-missing-proof-alert">
                            <AlertCircle size={14} /> Attachment required by checklist, but no file uploaded yet.
                          </span>
                        ) : (
                          <span>Marked complete — no attachments were required or added for this task.</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Task Verification / Decision Bar */}
                  <div className="orp-task-verify-bar">
                    {isFinalApproved ? (
                      <div className="orp-master-banner orp-master-banner--verified">
                        <div className="orp-master-banner-text">
                          <ShieldCheck size={16} />
                          <span>
                            Approved by Admin ({task.verifiedBy || me?.full_name || 'Fleet Admin'})
                            {task.verifiedAt ? ` · ${fmt(task.verifiedAt)}` : ''}
                          </span>
                        </div>
                        <div className="orp-task-action-btns">
                          <span className="orp-task-approved-badge">
                            <CheckCircle2 size={13} /> Approved
                          </span>
                        </div>
                      </div>
                    ) : (task.status === 'approved' || task.verified) ? (
                      <div className="orp-master-banner orp-master-banner--verified">
                        <div className="orp-master-banner-text">
                          <ShieldCheck size={16} />
                          <span>
                            {isAdminApproved
                              ? `Approved by Admin (${task.verifiedBy || me?.full_name || 'Fleet Admin'})`
                              : task.verifiedBy
                                ? `Verified by Vessel Approver (${task.verifiedBy})`
                                : `Verified by Vessel Approver (${data.masterName || 'Capt. Suresh Sharma'})`}
                            {task.verifiedAt ? ` · ${fmt(task.verifiedAt)}` : ''}
                          </span>
                        </div>
                        <div className="orp-task-action-btns">
                          {isAdminApproved ? (
                            <button
                              type="button"
                              className="orp-task-btn orp-task-btn--approved-badge"
                              disabled={taskBusyId === task.id}
                              onClick={() => handleApproveTask(task.id)}
                              title="Task is approved by Admin. Click to re-verify approval."
                            >
                              <CheckCircle2 size={13} /> Approved
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="orp-task-btn orp-task-btn--approve"
                              disabled={taskBusyId === task.id}
                              onClick={() => handleApproveTask(task.id)}
                              title="Approve this task as Admin"
                            >
                              <CheckCircle2 size={13} /> Approve Task
                            </button>
                          )}
                          <button
                            type="button"
                            className="orp-task-btn orp-task-btn--subtle-reject"
                            disabled={taskBusyId === task.id}
                            onClick={() => openRejectModal(task)}
                            title="Reject this task and request revision"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </div>
                      </div>
                    ) : task.status === 'rejected' ? (
                      <div className="orp-master-banner orp-master-banner--rejected">
                        <div className="orp-master-banner-text">
                          <XCircle size={16} />
                          <span>
                            Revision Requested {task.rejectionNote ? ` · Remark: ${task.rejectionNote}` : ''}
                          </span>
                        </div>
                        <div className="orp-task-action-btns">
                          <button
                            type="button"
                            className="orp-task-btn orp-task-btn--subtle-reject"
                            disabled={taskBusyId === task.id}
                            onClick={() => openRejectModal(task)}
                            title="Edit rejection remark"
                          >
                            Edit Remark
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="orp-task-pending-bar">
                        <div className="orp-task-pending-hint">
                          <Clock size={15} />
                          <span>Awaiting Admin / Approver Verification</span>
                        </div>
                        <div className="orp-task-action-btns">
                          <button
                            type="button"
                            className="orp-task-btn orp-task-btn--approve"
                            disabled={taskBusyId === task.id}
                            onClick={() => handleApproveTask(task.id)}
                            title="Approve this task"
                          >
                            <CheckCircle2 size={14} /> Approve Task
                          </button>
                          <button
                            type="button"
                            className="orp-task-btn orp-task-btn--reject"
                            disabled={taskBusyId === task.id}
                            onClick={() => openRejectModal(task)}
                            title="Reject this task with feedback"
                          >
                            <XCircle size={14} /> Reject Task
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="orp-review-card orp-empty-card">
                  <span>No task selected.</span>
                </div>
              )}

              {/* Prev / Next Buttons directly under card */}
              <div className="orp-card-nav-row">
                <button
                  type="button"
                  className="orp-card-nav-btn"
                  disabled={idx === 0}
                  onClick={() => goTo(idx - 1)}
                >
                  <ChevronLeft size={14} /> Previous
                </button>
                <button
                  type="button"
                  className="orp-card-nav-btn orp-card-nav-btn--next"
                  disabled={idx === total - 1}
                  onClick={() => goTo(idx + 1)}
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* 4. Bottom Action Bar — Less and Small */}
            <div className="orp-footer">
              <button
                type="button"
                className="orp-footer-return"
                onClick={() => navigate('/admin/orientation-program/enrollments')}
              >
                <ArrowLeft size={14} /> Return to Enrollments
              </button>

              <div className="orp-footer-actions">
                {isFinalApproved ? (
                  <span className="orp-decided-hint orp-decided-hint--approved">
                    <ShieldCheck size={16} /> Program Fully Approved{data.decidedAt ? ` · Decided ${fmt(data.decidedAt)}` : ''}
                  </span>
                ) : isMasterApproved && (isAdmin || isSuperAdmin) ? (
                  <>
                    <button
                      type="button"
                      className="orp-action-btn orp-action-btn--reject"
                      disabled={deciding || loading}
                      onClick={() => handleDecide('reject')}
                    >
                      <XCircle size={15} /> Reject
                    </button>
                    <button
                      type="button"
                      className="orp-action-btn orp-action-btn--approve"
                      disabled={!allTasksApproved || deciding || loading}
                      onClick={() => handleDecide('approve')}
                      title={!allTasksApproved ? `Approve all tasks as Admin (${approvedTasksCount}/${total}) to enable Final Approval` : 'Final Approve Program'}
                    >
                      <CheckCircle2 size={15} /> Final Approve Program
                    </button>
                  </>
                ) : (
                  <span className="orp-decided-hint">
                    Status: <strong>{enrollmentStatus === 'master_approved' ? 'Pending Admin Approval' : enrollmentStatus.replace('_', ' ')}</strong>
                    {data.decidedAt ? ` · Decided ${fmt(data.decidedAt)}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simplified Task Rejection Modal */}
      {rejectModal.open && rejectModal.task && (
        <div className="orp-modal-overlay" onClick={closeRejectModal}>
          <div
            className="orp-reject-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="orp-reject-modal-title"
          >
            <div className="orp-reject-modal-header">
              <div className="orp-reject-modal-header-icon">
                <AlertCircle size={20} />
              </div>
              <div className="orp-reject-modal-header-text">
                <h3 id="orp-reject-modal-title" className="orp-reject-modal-title">
                  Reject Task #{tasks.findIndex((t) => t.id === rejectModal.task.id) + 1 || idx + 1}
                </h3>
                <p className="orp-reject-modal-subtitle">
                  {rejectModal.task.title}
                </p>
              </div>
              <button
                type="button"
                className="orp-reject-modal-close"
                onClick={closeRejectModal}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="orp-reject-form-group">
              <label htmlFor="orp-reject-input" className="orp-reject-label">
                <span>Reason for Rejection</span>
                <span className="orp-reject-req">*</span>
              </label>

              <textarea
                id="orp-reject-input"
                className="orp-reject-textarea"
                rows={3}
                placeholder="Type rejection remark (what needs to be fixed)..."
                value={rejectModal.remark}
                onChange={(e) => setRejectModal((prev) => ({ ...prev, remark: e.target.value, error: '' }))}
                autoFocus
              />

              {rejectModal.error && (
                <div className="orp-reject-error-msg">
                  <AlertCircle size={13} />
                  <span>{rejectModal.error}</span>
                </div>
              )}
            </div>

            <div className="orp-reject-modal-footer">
              <button
                type="button"
                className="orp-reject-btn-cancel"
                onClick={closeRejectModal}
                disabled={rejectModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="orp-reject-btn-submit"
                onClick={handleConfirmTaskReject}
                disabled={rejectModal.submitting}
              >
                {rejectModal.submitting ? (
                  <>
                    <RefreshCw size={14} className="orp-spin" /> Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle size={14} /> Reject Task
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Program Rejection Modal */}
      {programRejectModal.open && (
        <div className="orp-modal-overlay" onClick={() => setProgramRejectModal({ open: false, remark: '', error: '', submitting: false })}>
          <div
            className="orp-reject-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="orp-reject-modal-header">
              <div className="orp-reject-modal-header-icon">
                <AlertCircle size={20} />
              </div>
              <div className="orp-reject-modal-header-text">
                <h3 className="orp-reject-modal-title">Reject Program</h3>
                <p className="orp-reject-modal-subtitle">
                  {data?.candidateName} · {data?.programTitle}
                </p>
              </div>
              <button
                type="button"
                className="orp-reject-modal-close"
                onClick={() => setProgramRejectModal({ open: false, remark: '', error: '', submitting: false })}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="orp-reject-form-group">
              <label className="orp-reject-label">
                <span>Reason for Rejection</span>
              </label>
              <textarea
                className="orp-reject-textarea"
                rows={3}
                placeholder="Type rejection reason..."
                value={programRejectModal.remark}
                onChange={(e) => setProgramRejectModal((prev) => ({ ...prev, remark: e.target.value, error: '' }))}
                autoFocus
              />
              {programRejectModal.error && (
                <div className="orp-reject-error-msg">
                  <AlertCircle size={13} />
                  <span>{programRejectModal.error}</span>
                </div>
              )}
            </div>

            <div className="orp-reject-modal-footer">
              <button
                type="button"
                className="orp-reject-btn-cancel"
                onClick={() => setProgramRejectModal({ open: false, remark: '', error: '', submitting: false })}
                disabled={programRejectModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="orp-reject-btn-submit"
                onClick={handleConfirmProgramReject}
                disabled={programRejectModal.submitting}
              >
                {programRejectModal.submitting ? (
                  <>
                    <RefreshCw size={14} className="orp-spin" /> Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle size={14} /> Reject Program
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
