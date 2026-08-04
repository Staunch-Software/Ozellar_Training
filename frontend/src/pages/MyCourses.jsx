import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Anchor, HardHat, ShieldCheck, ArrowRight, Download, PlayCircle, BookOpen, FileDown, AlertCircle, Filter } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import { getCourses, crewDownloadMyReportXlsx } from '../api.js'

const ICONS = { Anchor, HardHat, ShieldCheck }

export default function MyCourses() {
  const [courses, setCourses] = useState(null)
  const [dlReport, setDlReport] = useState(false)
  const [dlError, setDlError] = useState(null)
  const [reportFilter, setReportFilter] = useState('all')
  const { user: learner } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { getCourses().then(setCourses) }, [])
  if (!courses) return (<><TopNav /><div className="spinner">Loading your courses…</div></>)

  // a course "counts" as completed when its assessment is passed (a cert is
  // issued on pass) — not merely when all chapters were scrolled
  const completed = courses.filter((c) => c.passed).length
  const inProgress = courses.filter((c) => !c.passed && c.progressPct > 0).length

  const downloadReport = async () => {
    setDlReport(true); setDlError(null)
    try { await crewDownloadMyReportXlsx(reportFilter) }
    catch (e) { setDlError(e.message) }
    finally { setDlReport(false) }
  }

  return (
    <>
      <TopNav />
      <div className="page myc-root">
        
        {/* ---- Reverted Hello Header with Filter ---- */}
        <div className="hello">
          <div>
            <div className="eyebrow">Welcome back</div>
            <h1>{learner.name} · {learner.rank}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div className="stats">
              <div className="s"><b>{inProgress}</b><span>In progress</span></div>
              <div className="s"><b>{completed}</b><span>Completed</span></div>
              <div className="s"><b>{completed}</b><span>Certificates</span></div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                display: 'flex', alignItems: 'center', background: 'var(--surface-2)',
                border: '1px solid var(--border-strong)', borderRadius: '10px',
                padding: '4px', gap: '4px'
              }} className="myc-filter-wrap">
                <div style={{ padding: '0 8px 0 6px', color: 'var(--text-mut)', display: 'flex', alignItems: 'center' }} title="Filter download">
                  <Filter size={14} />
                </div>
                {[
                  { val: 'all', label: 'All Courses' },
                  { val: 'completed', label: 'Completed' },
                  { val: 'in-progress', label: 'In Progress' },
                  { val: 'not-started', label: 'Not Started' }
                ].map(f => (
                  <button
                    key={f.val}
                    onClick={() => setReportFilter(f.val)}
                    style={{
                      border: 'none',
                      background: reportFilter === f.val ? 'var(--surface)' : 'transparent',
                      color: reportFilter === f.val ? 'var(--text)' : 'var(--text-mut)',
                      boxShadow: reportFilter === f.val ? 'var(--shadow-sm)' : 'none',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      fontWeight: reportFilter === f.val ? 600 : 500,
                      cursor: 'pointer',
                      transition: '0.2s'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                className="btn crew-report-btn"
                onClick={downloadReport}
                disabled={dlReport}
                title="Download your training record as an Excel file"
                style={{ height: '38px', margin: 0 }}
              >
                <FileDown size={15} />
                {dlReport ? 'Preparing…' : 'Download My Report'}
              </button>
            </div>
          </div>
        </div>

        {dlError && (
          <div className="report-error" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircle size={15} /> {dlError}
          </div>
        )}

        {/* ---- Course Grid ---- */}
        <div className="myc-grid">
          {courses.filter(c => {
            if (reportFilter === 'all') return true;
            if (reportFilter === 'completed') return c.passed;
            if (reportFilter === 'in-progress') return !c.passed && c.progressPct > 0;
            if (reportFilter === 'not-started') return !c.passed && !c.progressPct;
            return true;
          }).map((c) => (
            <CourseCard key={c.id} c={c} onOpen={() => navigate(`/course/${c.slug}`)} />
          ))}
        </div>
      </div>
    </>
  )
}

function CourseCard({ c, onOpen }) {
  const Icon = ICONS[c.icon] || BookOpen
  const pct = c.passed ? 100 : c.progressPct
  
  let badge = 'Not started'
  let badgeClass = ''
  let action = (
    <span className="myc-chip start">
      <PlayCircle size={14} /> Start
    </span>
  )
  
  if (c.passed) {
    badge = 'Completed'
    badgeClass = 'completed'
    if (c.certPending) {
      action = (
        <span className="myc-chip" style={{ background: 'var(--warning-weak)', color: 'var(--warning-strong)', border: '1px solid var(--warning-strong)' }}>
          <AlertCircle size={14} /> Pending Approval
        </span>
      )
    } else {
      action = (
        <Link to={`/course/${c.slug}/certificate`} className="myc-chip cert" onClick={(e) => e.stopPropagation()}>
          <Download size={14} /> Certificate
        </Link>
      )
    }
  } else if (c.progressPct > 0) {
    badge = 'In progress'
    action = (
      <span className="myc-chip resume">
        <ArrowRight size={14} /> Resume
      </span>
    )
  }

  // map IDs to gradient classes
  const thumbClass = ['cargo-ops', 'hsm', 'cyber'].includes(c.id) ? c.id : 'default'

  return (
    <div className="myc-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className={`myc-thumb ${thumbClass}`}>
        <span className={`myc-badge ${badgeClass}`}>{badge}</span>
        <Icon size={46} strokeWidth={1.5} className="myc-thumb-icon" />
      </div>
      <div className="myc-body">
        <h3 className="myc-title">{c.title}</h3>
        <p className="myc-subtitle">{c.subtitle}</p>
        
        <div className="myc-prog-wrap">
          <div className="myc-prog-meta">
            <span>Progress</span>
            <strong>{pct}%</strong>
          </div>
          <div className="myc-prog-track">
            <div className={`myc-prog-fill ${c.passed ? 'completed' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        
        <div className="myc-footer">
          <div className="myc-time">
            <span>{c.total} chapters</span>
            <span>·</span>
            <span>{c.durationLabel}</span>
          </div>
          {action}
        </div>
      </div>
    </div>
  )
}
