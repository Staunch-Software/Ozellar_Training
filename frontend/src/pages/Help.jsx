import { LogIn, BookOpen, ClipboardCheck, Award, LifeBuoy } from 'lucide-react'
import { TopNav } from '../App.jsx'

const SECTIONS = [
  {
    icon: <LogIn size={18} />, title: 'Signing in',
    points: [
      'Crew sign in with their full name and date of birth as 8 digits (DDMMYYYY). Example: 25 March 2004 → 25032004.',
      'If two crew members share the same name and date of birth, you will be asked for your Crew ID to confirm which record is yours.',
      'Trouble signing in? Contact your training officer to check your details.',
    ],
  },
  {
    icon: <BookOpen size={18} />, title: 'Working through a course',
    points: [
      'Your dashboard shows only the courses assigned to you.',
      'Open a course and read each lesson. Some lessons unlock the next step as you scroll through them.',
      'Your progress is saved automatically as you complete lessons.',
    ],
  },
  {
    icon: <ClipboardCheck size={18} />, title: 'Final assessment',
    points: [
      'Answer every question, then submit — results are graded and shown at the end.',
      'You need to reach the pass mark shown on the assessment to pass.',
      'After submitting, you can review each question with the correct answer and an explanation.',
    ],
  },
  {
    icon: <Award size={18} />, title: 'Certificates',
    points: [
      'When you pass, a certificate is issued automatically with a unique certificate number.',
      'Find all your certificates under “Certificates”, where you can download each as a PDF.',
      'Each certificate can be verified online using its certificate number.',
    ],
  },
]

export default function Help() {
  return (
    <>
      <TopNav />
      <div className="page">
        <div className="eyebrow">Support</div>
        <h1 style={{ fontSize: 26, margin: '6px 0 20px' }}>Help</h1>

        <div className="help-grid">
          {SECTIONS.map((s) => (
            <div key={s.title} className="admin-card">
              <div className="help-head"><span className="help-icon">{s.icon}</span> {s.title}</div>
              <ul className="help-list">
                {s.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="admin-card" style={{ marginTop: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
          <LifeBuoy size={20} />
          <div>
            <b>Still need help?</b>
            <div className="mut" style={{ fontSize: 13.5 }}>Contact your training officer or email support@ozellarmarine.com.</div>
          </div>
        </div>
      </div>
    </>
  )
}
