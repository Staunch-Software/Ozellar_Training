import { useState, useEffect, useMemo } from 'react'
import {
  X, Check, AlertCircle, ShieldCheck, Clock, FileText, Paperclip,
  Download, Eye, Search, Ship, Cog, MessageSquare, AlertTriangle,
  Award, CheckCircle2, Filter, ExternalLink
} from 'lucide-react'
import { adminGetOrientationEnrollmentDetail } from '../api.js'
import { useConfirm } from './ConfirmDialog.jsx'
import FilePreviewModal, { detectFileType, cleanFileName } from './FilePreviewModal.jsx'
import './OrientationReviewModal.css'

function fmtDate(iso) {
  if (!iso) return '—'
  try {
    const withOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}+05:30`
    return new Date(withOffset).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return iso
  }
}

function initials(name) {
  const parts = (name || '').trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

export default function OrientationReviewModal({ enrollmentId, isOpen, onClose, onDecide, isSuperAdmin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'with_proof' | 'completed' | 'verified' | 'pending'
  const [selectedPreview, setSelectedPreview] = useState(null) // { url, title }
  const [deciding, setDeciding] = useState(false)
  const { confirm, dialog } = useConfirm()

  const loadData = () => {
    if (!enrollmentId) return
    setLoading(true)
    setError(null)
    adminGetOrientationEnrollmentDetail(enrollmentId)
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
    if (isOpen && enrollmentId) {
      loadData()
      setQ('')
      setFilterTab('all')
      setSelectedPreview(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, enrollmentId])

  // Close on Escape key if preview is not open
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !selectedPreview && isOpen) onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose, selectedPreview])

  const handleDecide = async (action) => {
    if (!data) return
    const isApprove = action === 'approve'
    const title = isApprove ? 'Final Approve Program?' : 'Reject Program?'
    const msg = isApprove
      ? `This will grant final admin approval for ${data.candidateName}'s promotion checklist and notify the crew member.`
      : `This will reject ${data.candidateName}'s orientation program.`
    const ok = await confirm(msg, {
      title,
      confirmLabel: isApprove ? 'Final Approve' : 'Reject',
      danger: !isApprove,
    })
    if (!ok) return

    setDeciding(true)
    try {
      if (onDecide) {
        await onDecide(data.id, action)
      }
      loadData()
    } catch (e) {
      setError(e.message || 'Failed to update program status.')
    } finally {
      setDeciding(false)
    }
  }

  const allTasks = data?.tasks || []

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let list = allTasks
    const query = q.trim().toLowerCase()

    if (filterTab === 'with_proof') {
      list = list.filter((t) => (t.proofUrls || []).length > 0)
    } else if (filterTab === 'completed') {
      list = list.filter((t) => t.isCompleted)
    } else if (filterTab === 'verified') {
      list = list.filter((t) => t.status === 'approved')
    } else if (filterTab === 'pending') {
      list = list.filter((t) => t.status === 'pending_review' || (!t.verified && t.isCompleted))
    }

    if (query) {
      list = list.filter((t) =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query) ||
        (t.note || '').toLowerCase().includes(query) ||
        (t.rejectionNote || '').toLowerCase().includes(query)
      )
    }
    return list
  }, [allTasks, filterTab, q])

  const counts = useMemo(() => {
    return {
      total: allTasks.length,
      withProof: allTasks.filter((t) => (t.proofUrls || []).length > 0).length,
      completed: allTasks.filter((t) => t.isCompleted).length,
      verified: allTasks.filter((t) => t.status === 'approved').length,
      pending: allTasks.filter((t) => t.status === 'pending_review' || (!t.verified && t.isCompleted)).length,
      attachmentsTotal: allTasks.reduce((acc, t) => acc + (t.proofUrls || []).length, 0),
    }
  }, [allTasks])

  if (!isOpen) return null

  const enrollmentStatus = data?.enrollmentStatus || data?.status || 'in_progress'
  const isMasterApproved = enrollmentStatus === 'master_approved'
  const isApproved = enrollmentStatus === 'approved'
  const isRejected = enrollmentStatus === 'rejected'

  const dept = data?.department === 'engine' ? 'Engine' : 'Deck'
  const DeptIcon = data?.department === 'engine' ? Cog : Ship

  return (
    <>
      <div className="orm-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
        <div className="orm-container" role="dialog" aria-modal="true" aria-label="Orientation Task Review">
          {/* Header */}
          <div className="orm-header">
            <div className="orm-header-left">
              <div className="orm-header-avatar">
                {initials(data?.candidateName)}
              </div>
              <div className="orm-header-info">
                <div className="orm-header-title-row">
                  <h2 className="orm-title">{data?.candidateName || 'Candidate Review'}</h2>
                  <span className={`orm-status-badge orm-status-badge--${enrollmentStatus}`}>
                    {enrollmentStatus === 'master_approved' ? 'Pending Admin' : enrollmentStatus.replace('_', ' ')}
                  </span>
                </div>
                <div className="orm-header-meta">
                  <span className="orm-meta-item"><strong>{data?.candidateRank || '—'}</strong></span>
                  <span className="orm-meta-sep">•</span>
                  <span className="orm-meta-item"><Ship size={12} /> {data?.vessel || data?.vesselName || '—'}</span>
                  <span className="orm-meta-sep">•</span>
                  <span className="orm-meta-item"><DeptIcon size={12} /> {dept}</span>
                  <span className="orm-meta-sep">•</span>
                  <span className="orm-meta-item orm-meta-prog">{data?.programTitle || 'Orientation Program'}</span>
                </div>
              </div>
            </div>

            <div className="orm-header-actions">
              {/* If awaiting super admin approval, show prominent Final Approve and Reject */}
              {isMasterApproved && isSuperAdmin && (
                <div className="orm-decide-buttons">
                  <button
                    type="button"
                    className="orm-btn-approve"
                    disabled={deciding}
                    onClick={() => handleDecide('approve')}
                    title="Grant Final Admin Approval"
                  >
                    <Check size={14} /> Final Approve
                  </button>
                  <button
                    type="button"
                    className="orm-btn-reject"
                    disabled={deciding}
                    onClick={() => handleDecide('reject')}
                    title="Reject Program"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}

              <button
                type="button"
                className="orm-close-btn"
                onClick={onClose}
                aria-label="Close review modal"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          <div className="orm-body">
            {loading && (
              <div className="orm-loading-state">
                <div className="spinner" />
                <p>Loading officer completed task details and attachments...</p>
              </div>
            )}

            {error && (
              <div className="orm-error-state">
                <AlertCircle size={28} color="#ef4444" />
                <p>{error}</p>
                <button type="button" className="btn sm" onClick={loadData}>Retry</button>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* Executive KPI Metrics Strip */}
                <div className="orm-metrics-strip">
                  <div className="orm-metric-card">
                    <span className="orm-metric-lbl">Total Tasks</span>
                    <span className="orm-metric-val">{counts.total}</span>
                  </div>
                  <div className="orm-metric-card">
                    <span className="orm-metric-lbl">Tasks Completed</span>
                    <div className="orm-metric-val-row">
                      <span className="orm-metric-val">{counts.completed}</span>
                      <span className="orm-metric-sub">/ {counts.total}</span>
                    </div>
                    <div className="orm-progress-bar">
                      <div
                        className="orm-progress-fill"
                        style={{ width: `${counts.total ? Math.round(counts.completed / counts.total * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="orm-metric-card">
                    <span className="orm-metric-lbl">Master Verified</span>
                    <div className="orm-metric-val-row">
                      <span className="orm-metric-val orm-val-good">{counts.verified}</span>
                      <span className="orm-metric-sub">/ {counts.total}</span>
                    </div>
                  </div>
                  <div className="orm-metric-card">
                    <span className="orm-metric-lbl">Proof Attachments</span>
                    <div className="orm-metric-val-row">
                      <span className="orm-metric-val orm-val-accent">{counts.attachmentsTotal}</span>
                      <span className="orm-metric-sub">files</span>
                    </div>
                  </div>
                  <div className="orm-metric-card orm-metric-approver">
                    <span className="orm-metric-lbl">Vessel Approver</span>
                    <span className="orm-approver-name">{data.masterName || 'Master / Chief Engineer'}</span>
                    <span className="orm-approver-hint">
                      {isMasterApproved
                        ? '✓ All tasks verified by Master'
                        : isApproved
                        ? '✓ Fully Approved by Admin'
                        : `${counts.verified} of ${counts.total} tasks verified`}
                    </span>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="orm-controls-bar">
                  <div className="orm-filter-tabs">
                    <button
                      type="button"
                      className={`orm-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
                      onClick={() => setFilterTab('all')}
                    >
                      All Tasks <span className="orm-tab-count">{counts.total}</span>
                    </button>
                    <button
                      type="button"
                      className={`orm-tab-btn ${filterTab === 'with_proof' ? 'active' : ''}`}
                      onClick={() => setFilterTab('with_proof')}
                    >
                      With Attachments <span className="orm-tab-count">{counts.withProof}</span>
                    </button>
                    <button
                      type="button"
                      className={`orm-tab-btn ${filterTab === 'completed' ? 'active' : ''}`}
                      onClick={() => setFilterTab('completed')}
                    >
                      Completed <span className="orm-tab-count">{counts.completed}</span>
                    </button>
                    <button
                      type="button"
                      className={`orm-tab-btn ${filterTab === 'verified' ? 'active' : ''}`}
                      onClick={() => setFilterTab('verified')}
                    >
                      Master Verified <span className="orm-tab-count">{counts.verified}</span>
                    </button>
                    {counts.pending > 0 && (
                      <button
                        type="button"
                        className={`orm-tab-btn ${filterTab === 'pending' ? 'active' : ''}`}
                        onClick={() => setFilterTab('pending')}
                      >
                        Pending Review <span className="orm-tab-count">{counts.pending}</span>
                      </button>
                    )}
                  </div>

                  <div className="orm-search-wrap">
                    <Search size={14} className="orm-search-icon" />
                    <input
                      type="text"
                      className="orm-search-input"
                      placeholder="Search tasks, notes..."
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                    {q && (
                      <button type="button" className="orm-search-clear" onClick={() => setQ('')}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Task List */}
                <div className="orm-tasks-scroll">
                  {filteredTasks.length === 0 ? (
                    <div className="orm-empty-tasks">
                      <Filter size={32} color="var(--text-mut, #94a3b8)" />
                      <p>No tasks found matching your filter criteria.</p>
                      {(q || filterTab !== 'all') && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => { setQ(''); setFilterTab('all') }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="orm-tasks-list">
                      {filteredTasks.map((t, idx) => {
                        const proofs = t.proofUrls || []
                        const isTaskApproved = t.status === 'approved'
                        const isTaskRejected = t.status === 'rejected'
                        const isTaskPending = t.status === 'pending_review'

                        return (
                          <div
                            key={t.id || idx}
                            className={`orm-task-card ${
                              isTaskApproved
                                ? 'orm-task-card--approved'
                                : isTaskRejected
                                ? 'orm-task-card--rejected'
                                : t.isCompleted
                                ? 'orm-task-card--completed'
                                : 'orm-task-card--incomplete'
                            }`}
                          >
                            <div className="orm-task-main">
                              {/* Left status / order indicator */}
                              <div className="orm-task-index">
                                {isTaskApproved ? (
                                  <div className="orm-icon-pill orm-icon-pill--approved" title="Verified by Master">
                                    <ShieldCheck size={16} />
                                  </div>
                                ) : isTaskRejected ? (
                                  <div className="orm-icon-pill orm-icon-pill--rejected" title="Rejected by Master">
                                    <AlertTriangle size={16} />
                                  </div>
                                ) : t.isCompleted ? (
                                  <div className="orm-icon-pill orm-icon-pill--completed" title="Completed by Officer">
                                    <CheckCircle2 size={16} />
                                  </div>
                                ) : (
                                  <div className="orm-icon-pill orm-icon-pill--num">
                                    {idx + 1}
                                  </div>
                                )}
                              </div>

                              {/* Task details */}
                              <div className="orm-task-body">
                                <div className="orm-task-title-row">
                                  <h4 className="orm-task-title">{t.title}</h4>
                                  <div className="orm-task-badges">
                                    {t.requiresProof && (
                                      <span className="orm-badge orm-badge--proof">
                                        <Paperclip size={11} /> Attachment Required
                                      </span>
                                    )}
                                    {isTaskApproved && (
                                      <span className="orm-badge orm-badge--verified">
                                        <ShieldCheck size={11} /> Verified by Master
                                      </span>
                                    )}
                                    {isTaskPending && (
                                      <span className="orm-badge orm-badge--pending">
                                        <Clock size={11} /> Awaiting Master Review
                                      </span>
                                    )}
                                    {isTaskRejected && (
                                      <span className="orm-badge orm-badge--rejected">
                                        <AlertTriangle size={11} /> Needs Revision
                                      </span>
                                    )}
                                    {!isTaskApproved && !isTaskPending && !isTaskRejected && t.isCompleted && (
                                      <span className="orm-badge orm-badge--done">
                                        <Check size={11} /> Completed
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {t.description && (
                                  <p className="orm-task-desc">{t.description}</p>
                                )}

                                {/* Officer Completion Timestamps & Note */}
                                <div className="orm-task-meta-row">
                                  {t.completedAt && (
                                    <span className="orm-task-timestamp">
                                      <Clock size={12} /> Completed: {fmtDate(t.completedAt)}
                                    </span>
                                  )}
                                  {t.verifiedAt && (
                                    <span className="orm-task-timestamp orm-timestamp--verified">
                                      <ShieldCheck size={12} /> Verified: {fmtDate(t.verifiedAt)}
                                    </span>
                                  )}
                                </div>

                                {/* Officer Note */}
                                {t.note && (
                                  <div className="orm-note-box">
                                    <div className="orm-note-label">
                                      <MessageSquare size={13} /> Officer Note:
                                    </div>
                                    <p className="orm-note-text">{t.note}</p>
                                  </div>
                                )}

                                {/* Master Feedback / Rejection Note */}
                                {t.rejectionNote && (
                                  <div className="orm-note-box orm-note-box--warning">
                                    <div className="orm-note-label">
                                      <AlertTriangle size={13} /> Master Feedback:
                                    </div>
                                    <p className="orm-note-text">{t.rejectionNote}</p>
                                  </div>
                                )}

                                {/* Attachments Section */}
                                {proofs.length > 0 && (
                                  <div className="orm-attachments-section">
                                    <div className="orm-attachments-title">
                                      <Paperclip size={13} />
                                      <span>Attached Proofs ({proofs.length})</span>
                                    </div>
                                    <div className="orm-attachments-grid">
                                      {proofs.map((url, pIdx) => {
                                        const fileMeta = detectFileType(url)
                                        const FileIcon = fileMeta.icon
                                        const fileName = cleanFileName(url, `Attachment ${pIdx + 1}`)

                                        return (
                                          <div key={url} className="orm-attachment-card">
                                            <div
                                              className="orm-attachment-icon-wrap"
                                              style={{ '--orm-file-color': fileMeta.color }}
                                            >
                                              <FileIcon size={16} />
                                            </div>
                                            <div className="orm-attachment-info" title={fileName}>
                                              <span className="orm-attachment-name">{fileName}</span>
                                              <span className="orm-attachment-ext">.{fileMeta.ext.toUpperCase()}</span>
                                            </div>
                                            <div className="orm-attachment-actions">
                                              <button
                                                type="button"
                                                className="orm-attachment-btn"
                                                onClick={() => setSelectedPreview({ url, title: `${t.title} - ${fileName}` })}
                                                title="Preview file"
                                              >
                                                <Eye size={13} />
                                                <span>Preview</span>
                                              </button>
                                              <a
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="orm-attachment-btn orm-attachment-btn--ghost"
                                                title="Open in new tab"
                                              >
                                                <ExternalLink size={13} />
                                              </a>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {t.requiresProof && proofs.length === 0 && (
                                  <div className="orm-missing-proof-alert">
                                    <AlertCircle size={13} />
                                    <span>Attachment required by program checklist, but none was provided yet.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Footer Bar */}
                <div className="orm-footer">
                  <div className="orm-footer-status">
                    <span className="orm-footer-label">Enrollment Status:</span>
                    <span className={`orm-status-badge orm-status-badge--${enrollmentStatus}`}>
                      {enrollmentStatus === 'master_approved' ? 'Pending Admin Approval' : enrollmentStatus.replace('_', ' ')}
                    </span>
                    {isMasterApproved && (
                      <span className="orm-footer-hint">
                        All checklist tasks have been reviewed & verified by Master on {data.vessel || 'vessel'}.
                      </span>
                    )}
                  </div>

                  <div className="orm-footer-actions">
                    {isMasterApproved && isSuperAdmin && (
                      <>
                        <button
                          type="button"
                          className="orm-btn-reject"
                          disabled={deciding}
                          onClick={() => handleDecide('reject')}
                        >
                          <X size={14} /> Reject Program
                        </button>
                        <button
                          type="button"
                          className="orm-btn-approve"
                          disabled={deciding}
                          onClick={() => handleDecide('approve')}
                        >
                          <Check size={14} /> Grant Final Approval
                        </button>
                      </>
                    )}
                    <button type="button" className="btn sm" onClick={onClose}>
                      Close
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Embedded File Previewer Modal (Opens for every file type!) */}
      {selectedPreview && (
        <FilePreviewModal
          url={selectedPreview.url}
          title={selectedPreview.title}
          onClose={() => setSelectedPreview(null)}
        />
      )}

      {dialog}
    </>
  )
}
