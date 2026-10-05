import { useState, useEffect } from 'react'
import {
  ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Clock,
  Calendar, Award, FileText, Layers, Filter, Check, X,
  HelpCircle, Eye, Phone, User, TrendingUp
} from 'lucide-react'
import * as api from '../../api.js'
import './AdminScreeningAnswers.css'

function fmtDt(iso) {
  if (!iso) return '—'
  try {
    const withOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}+05:30`
    return new Date(withOffset).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    }) + ' IST'
  } catch { return iso }
}

const getInitials = (name) => {
  if (!name) return '?'
  const p = name.trim().split(/\s+/)
  if (p.length === 1) return p[0].substring(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

export default function AdminScreeningAnswersReview({ candidateId, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSecId, setSelectedSecId] = useState('all') 
  const [statusFilter, setStatusFilter] = useState('all') 
  const [modalImage, setModalImage] = useState(null)

  useEffect(() => {
    if (!candidateId) return
    setLoading(true)
    setError('')
    api.adminGetCandidateAnswers(candidateId)
      .then(res => setData(res))
      .catch(err => setError(err.message || 'Failed to load candidate answer records.'))
      .finally(() => setLoading(false))
  }, [candidateId])

  // Scroll to top of the view whenever filters change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectedSecId, statusFilter])

  if (loading) {
    return (
      <div className="ans-unified-wrapper">
        <button className="ans-btn-back" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
          <ArrowLeft size={14} /> Back to Results
        </button>
        <div className="ans-loading-state">
          <div className="ans-spinner" />
          <div className="ans-loading-title">Loading Candidate Answers…</div>
          <div className="ans-loading-sub">Retrieving submitted attempt responses and scoring breakdown.</div>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ans-unified-wrapper">
        <button className="ans-btn-back" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: 16 }}>
          <ArrowLeft size={14} /> Back to Results
        </button>
        <div className="ans-error-state">
          <AlertTriangle size={32} />
          <div className="ans-error-title">Unable to load answers</div>
          <div className="ans-error-sub">{error || 'Candidate answer data could not be retrieved.'}</div>
          <button className="ans-btn-back" onClick={onBack} style={{ marginTop: 24, background: '#fff' }}>
            Return to Results Table
          </button>
        </div>
      </div>
    )
  }

  const { candidate, test, score, maxScore, correctCount, wrongCount, unansweredCount, sections = [] } = data
  const scorePct = maxScore > 0 ? Math.round((Math.max(0, score) / maxScore) * 100) : 0

  // Pre-calculate global question numbers across the entire test
  let globalRunningNum = 1;
  const enhancedSections = sections.map(sec => {
    if (sec.type === 'personal_data') return sec;
    return {
      ...sec,
      questions: (sec.questions || []).map(q => ({
        ...q,
        globalNum: globalRunningNum++
      }))
    }
  });

  const visibleSections = enhancedSections.filter(sec => {
    if (selectedSecId === 'all') return true
    return sec.id === selectedSecId
  })

  return (
    <div className="ans-unified-wrapper">
      {modalImage && (
        <div className="ans-img-modal" onClick={() => setModalImage(null)}>
          <button className="ans-img-modal-close" onClick={() => setModalImage(null)}>
            <X size={20} />
          </button>
          <img src={modalImage} alt="Enlarged diagram" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* ══ COMPACT HERO PANEL ══ */}
      <div className="ans-hero-panel">
        <div className="ans-hero-bar">
          <button className="ans-btn-back" onClick={onBack}>
            <ArrowLeft size={14} /> Back to Results
          </button>
          <div className="ans-hero-badges">
            {candidate.timeTakenMinutes != null && (
              <span className="ans-badge-time">
                <Clock size={13} /> {candidate.timeTakenMinutes} mins taken
              </span>
            )}
            <span className={`ans-badge-tabs ${candidate.tabSwitchCount > 0 ? 'warn' : 'ok'}`}>
              {candidate.tabSwitchCount > 0 ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              {candidate.tabSwitchCount} tab switch{candidate.tabSwitchCount !== 1 ? 'es' : ''}
            </span>
          </div>
        </div>

        <div className="ans-hero-content">
          <div className="ans-hero-profile">
            <div className="ans-avatar">{getInitials(candidate.fullName)}</div>
            <div className="ans-profile-details">
              <h1 className="ans-name">{candidate.fullName}</h1>
              <div className="ans-meta">
                {candidate.mobileNumber && <span><Phone size={12} /> {candidate.mobileNumber}</span>}
                <span><FileText size={12} /> {test.title}</span>
                {candidate.submittedAt && <span><Calendar size={12} /> {fmtDt(candidate.submittedAt)}</span>}
              </div>
            </div>
          </div>

          <div className="ans-hero-metrics">
            <div className="ans-metric-compact score">
              <div className="ans-ring-wrap">
                <svg viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" className="ans-ring-bg" />
                  <circle
                    cx="18" cy="18" r="15.915"
                    className="ans-ring-fill"
                    strokeDasharray="100 100"
                    strokeDashoffset={100 - scorePct}
                  />
                </svg>
                <div className="ans-ring-val">{scorePct}%</div>
              </div>
              <div className="ans-metric-text">
                <strong className={score >= 0 ? 'positive' : 'negative'}>
                  {score} <span>/ {maxScore} pts</span>
                </strong>
                <label>Total Score</label>
              </div>
            </div>
            
            <div className="ans-metric-divider" />
            
            <div className="ans-metric-compact correct">
              <div className="ans-m-icon"><CheckCircle2 size={18} /></div>
              <div className="ans-metric-text">
                <strong>{correctCount}</strong><label>Correct</label>
              </div>
            </div>
            <div className="ans-metric-compact wrong">
              <div className="ans-m-icon"><XCircle size={18} /></div>
              <div className="ans-metric-text">
                <strong>{wrongCount}</strong><label>Wrong</label>
              </div>
            </div>
            <div className="ans-metric-compact skipped">
              <div className="ans-m-icon"><HelpCircle size={18} /></div>
              <div className="ans-metric-text">
                <strong>{unansweredCount}</strong><label>Skipped</label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ SLIM NAV BAR (Replaces bulky section cards & filters) ══ */}
      <div className="ans-nav-bar">
        <div className="ans-nav-sections">
          <button className={selectedSecId === 'all' ? 'active' : ''} onClick={() => setSelectedSecId('all')}>
            <Layers size={14} style={{ marginRight: 4, opacity: 0.6 }} /> Overview
          </button>
          {sections.map((sec, i) => {
            const isPersonal = sec.type === 'personal_data'
            return (
              <button key={sec.id} className={selectedSecId === sec.id ? 'active' : ''} onClick={() => setSelectedSecId(sec.id)}>
                {sec.title}
                {!isPersonal && <span className="ans-nav-sec-score">{sec.score}/{sec.maxScore}</span>}
              </button>
            )
          })}
        </div>
        
        <div className="ans-nav-status">
          <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>All</button>
          <button className={`correct ${statusFilter === 'correct' ? 'active' : ''}`} onClick={() => setStatusFilter('correct')}>
            <Check size={13}/> {correctCount}
          </button>
          <button className={`wrong ${statusFilter === 'wrong' ? 'active' : ''}`} onClick={() => setStatusFilter('wrong')}>
            <X size={13}/> {wrongCount}
          </button>
          <button className={`skipped ${statusFilter === 'unanswered' ? 'active' : ''}`} onClick={() => setStatusFilter('unanswered')}>
            <HelpCircle size={13}/> {unansweredCount}
          </button>
        </div>
      </div>

      {/* ══ QUESTIONS AREA ══ */}
      <div className="ans-q-container">
        {visibleSections.map(sec => {
          const isPersonal = sec.type === 'personal_data'
          const rawQs = sec.questions || []
          const filteredQs = rawQs.filter(q => {
            if (statusFilter === 'correct') return q.isCorrect
            if (statusFilter === 'wrong') return q.isWrong
            if (statusFilter === 'unanswered') return q.isUnanswered
            return true
          })

          if (!isPersonal && statusFilter !== 'all' && filteredQs.length === 0) return null

          return (
            <div key={sec.id} className="ans-section-block">
              {/* Sleek Section Header */}
              <div className="ans-section-title-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h2 className="ans-section-heading">{sec.title}</h2>
                  <span className="ans-section-type">
                    {isPersonal ? 'Profile' : sec.passage ? 'Comprehension' : 'Multiple Choice'}
                  </span>
                </div>
                {!isPersonal && (
                  <div className="ans-section-score-pill">
                    Score: <strong>{sec.score != null ? sec.score : 0}</strong><span>/{sec.maxScore}</span>
                  </div>
                )}
              </div>

              {isPersonal ? (
                <div className="ans-personal-grid">
                  {candidate.personalData && Object.keys(candidate.personalData).length > 0 ? (
                    Object.entries(candidate.personalData).map(([key, val]) => (
                      <div key={key} className="ans-personal-field">
                        <label>{key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</label>
                        <span>{String(val || '—')}</span>
                      </div>
                    ))
                  ) : (
                    <div className="ans-empty-state">No personal details captured.</div>
                  )}
                </div>
              ) : (
                <>
                  {sec.passage && (
                    <div className="ans-passage-card">
                      <div className="ans-passage-header"><FileText size={14} /> Reading Passage</div>
                      <div className="ans-passage-text">{sec.passage}</div>
                    </div>
                  )}

                  <div className="ans-questions-list">
                    {filteredQs.length === 0 ? (
                      <div className="ans-empty-state">No questions match the "{statusFilter}" filter.</div>
                    ) : (
                      filteredQs.map((q, qIndex) => {
                        const optLetters = ['A', 'B', 'C', 'D', 'E', 'F']
                        const statusClass = q.isCorrect ? 'is-correct' : q.isWrong ? 'is-wrong' : 'is-unanswered'

                        return (
                          <div key={q.id || qIndex} className={`ans-q-card ${statusClass}`}>
                            <div className="ans-q-top">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="ans-q-num">Q{q.globalNum}</span>
                                {q.isCorrect && <span className="ans-status-tag correct"><CheckCircle2 size={13} /> Correct</span>}
                                {q.isWrong && <span className="ans-status-tag wrong"><XCircle size={13} /> Incorrect</span>}
                                {q.isUnanswered && <span className="ans-status-tag unanswered"><HelpCircle size={13} /> Skipped</span>}
                              </div>
                              <span className={`ans-points-tag ${q.points > 0 ? 'pos' : q.points < 0 ? 'neg' : ''}`}>
                                {q.points > 0 ? `+${q.points}` : q.points} pt{Math.abs(q.points) !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="ans-q-prompt">{q.prompt}</div>

                            {q.imageUrls && q.imageUrls.length > 0 && (
                              <div className="ans-q-images">
                                {q.imageUrls.map((url, imgIdx) => (
                                  <img key={imgIdx} src={url} alt="Diagram" className="ans-q-img" onClick={() => setModalImage(url)} />
                                ))}
                              </div>
                            )}

                            <div className="ans-options-stack">
                              {(q.options || []).map((opt, optIdx) => {
                                const isCandSelected = q.selectedAnswer === optIdx
                                const isCorrectOpt = q.correctAnswer === optIdx

                                let rowClass = ''
                                let flagBadge = null

                                if (isCandSelected && isCorrectOpt) {
                                  rowClass = 'cand-correct'
                                  flagBadge = <span className="ans-opt-flag"><Check size={12} strokeWidth={3} /> Candidate (Correct)</span>
                                } else if (isCandSelected && !isCorrectOpt) {
                                  rowClass = 'cand-wrong'
                                  flagBadge = <span className="ans-opt-flag"><X size={12} strokeWidth={3} /> Candidate (Incorrect)</span>
                                } else if (!isCandSelected && isCorrectOpt) {
                                  rowClass = 'target-correct'
                                  flagBadge = <span className="ans-opt-flag"><Check size={12} strokeWidth={3} /> Correct Answer</span>
                                }

                                return (
                                  <div key={optIdx} className={`ans-opt-row ${rowClass}`}>
                                    <span className="ans-opt-key">{optLetters[optIdx] || optIdx + 1}</span>
                                    <span className="ans-opt-text">{opt || <em>Option {optIdx + 1}</em>}</span>
                                    {flagBadge}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
