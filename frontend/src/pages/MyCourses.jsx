import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Anchor, HardHat, ShieldCheck, ArrowRight, Download, PlayCircle, BookOpen } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import { getCourses } from '../api.js'

const ICONS = { Anchor, HardHat, ShieldCheck }

export default function MyCourses() {
  const [courses, setCourses] = useState(null)
  const { user: learner } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { getCourses().then(setCourses) }, [])
  if (!courses) return (<><TopNav /><div className="spinner">Loading your courses…</div></>)

  // a course "counts" as completed when its assessment is passed (a cert is
  // issued on pass) — not merely when all chapters were scrolled
  const completed = courses.filter((c) => c.passed).length
  const inProgress = courses.filter((c) => !c.passed && c.progressPct > 0).length

  return (
    <>
      <TopNav />
      <div className="page">
        <div className="hello">
          <div>
            <div className="eyebrow">Welcome back</div>
            <h1>{learner.name} · {learner.rank}</h1>
          </div>
          <div className="stats">
            <div className="s"><b>{inProgress}</b><span>In progress</span></div>
            <div className="s"><b>{completed}</b><span>Completed</span></div>
            <div className="s"><b>{completed}</b><span>Certificates</span></div>
          </div>
        </div>

        <div className="catgrid">
          {courses.map((c) => (
            <CourseCard key={c.id} c={c} onOpen={() => navigate(`/course/${c.slug}`)} />
          ))}
        </div>
      </div>
    </>
  )
}

function CourseCard({ c, onOpen }) {
  const Icon = ICONS[c.icon] || BookOpen
  // a passed course reads as complete regardless of how many chapters were scrolled
  const pct = c.passed ? 100 : c.progressPct
  let badge = 'Not started'
  let action = <span className="chip accent">Start <ArrowRight size={13} /></span>
  if (c.passed) {
    badge = 'Completed'
    action = <Link to={`/course/${c.slug}/certificate`} className="chip success" onClick={(e) => e.stopPropagation()}>
      <Download size={13} /> Certificate</Link>
  } else if (c.progressPct > 0) {
    badge = 'In progress'
    action = <span className="chip accent"><PlayCircle size={13} /> Resume</span>
  }

  return (
    <div className="cc" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <div className={`thumb ${c.id}`}>
        <span className="badge">{badge}</span>
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <div className="bd">
        <h3>{c.title}</h3>
        <div className="sub">{c.subtitle}</div>
        <div className="meta"><span>{c.total} slides</span><span>{c.durationLabel}</span></div>
        <div className="prog"><i style={{ width: `${pct}%` }} /></div>
        <div className="status">
          <span>{c.passed ? `Passed · ${c.score}%` : c.progressPct > 0 ? `${c.completedCount} of ${c.total} done` : c.statusNote}</span>
          {action}
        </div>
      </div>
    </div>
  )
}
