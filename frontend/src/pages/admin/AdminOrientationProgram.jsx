import { GraduationCap, Users, CheckCircle2, Clock, BookOpen, ChevronRight, Plus, FileText, Video, Award } from 'lucide-react'

/* ── Design tokens ── */
const ACCENT = '#7c3aed'
const ACCENT_WEAK = 'rgba(124,58,237,0.1)'
const ACCENT_BORDER = 'rgba(124,58,237,0.2)'

const STEPS = [
  {
    id: 1,
    type: 'doc',
    title: 'Welcome & Introduction',
    desc: 'Company overview, mission, and values',
    duration: '30 min',
    status: 'active',
  },
  {
    id: 2,
    type: 'video',
    title: 'Safety Induction',
    desc: 'Emergency procedures, mustering stations, and safety drills',
    duration: '45 min',
    status: 'active',
  },
  {
    id: 3,
    type: 'book',
    title: 'Vessel Familiarisation',
    desc: 'Ship layout, crew responsibilities, and communication protocols',
    duration: '60 min',
    status: 'active',
  },
  {
    id: 4,
    type: 'award',
    title: 'Compliance & Documentation',
    desc: 'STCW requirements, certification, and documentation checklist',
    duration: '30 min',
    status: 'active',
  },
]

const STATS = [
  { label: 'Total Trainees', value: '—', color: ACCENT, bg: ACCENT_WEAK },
  { label: 'Completed', value: '—', color: '#059669', bg: 'rgba(5,150,105,0.1)' },
  { label: 'In Progress', value: '—', color: '#d97706', bg: 'rgba(217,119,6,0.1)' },
  { label: 'Avg. Duration', value: '—', color: '#0284c7', bg: 'rgba(2,132,199,0.1)' },
]

const STEP_ICONS = {
  doc:   <FileText size={20} color={ACCENT} />,
  video: <Video size={20} color='#0284c7' />,
  book:  <BookOpen size={20} color='#059669' />,
  award: <Award size={20} color='#d97706' />,
}

function StatPill({ label, value, color, bg }) {
  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}30`,
      borderRadius: 14,
      padding: '16px 22px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-.02em' }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-mut)', fontWeight: 600, marginTop: 4 }}>{label}</div>
    </div>
  )
}

function StepCard({ step }) {
  const statusColor = step.status === 'active' ? '#059669' : '#94a3b8'
  const statusBg = step.status === 'active' ? 'rgba(5,150,105,0.1)' : 'rgba(148,163,184,0.1)'
  const statusLabel = step.status === 'active' ? 'Active' : 'Draft'
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      transition: 'box-shadow .15s',
      cursor: 'pointer',
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,.07)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 13,
        background: ACCENT_WEAK, border: `1.5px solid ${ACCENT_BORDER}`,
        display: 'grid', placeItems: 'center', flexShrink: 0,
        fontWeight: 800, fontSize: 16, color: ACCENT,
      }}>
        {step.id}
      </div>
      <div style={{
        width: 42, height: 42, borderRadius: 13,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        {STEP_ICONS[step.type]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', marginBottom: 4 }}>{step.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-mut)', fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
        <Clock size={13} />
        {step.duration}
      </div>
      <span style={{
        fontSize: 11.5, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
        color: statusColor, background: statusBg, border: `1px solid ${statusColor}40`,
        flexShrink: 0,
      }}>
        {statusLabel}
      </span>
      <ChevronRight size={16} color="var(--text-faint)" style={{ flexShrink: 0 }} />
    </div>
  )
}

export default function AdminOrientationProgram() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
            color: ACCENT, background: ACCENT_WEAK, border: `1px solid ${ACCENT_BORDER}`,
            padding: '3px 12px', borderRadius: 20, marginBottom: 10,
          }}>
            <GraduationCap size={12} /> Orientation Program
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: '-.01em' }}>
            Orientation Program
          </h1>
          <p style={{ margin: '6px 0 0', color: 'var(--text-mut)', fontSize: 13.5 }}>
            Manage onboarding flows, induction modules, and trainee progress for new joiners.
          </p>
        </div>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 20px', borderRadius: 12,
            background: ACCENT, color: '#fff', border: 'none',
            fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
            boxShadow: `0 4px 16px ${ACCENT}40`, fontFamily: 'inherit',
            transition: 'all .2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#6d28d9'}
          onMouseLeave={e => e.currentTarget.style.background = ACCENT}
        >
          <Plus size={15} /> Add Module
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {STATS.map(s => <StatPill key={s.label} {...s} />)}
      </div>

      {/* Program Modules List */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase',
          color: 'var(--text-faint)', marginBottom: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>Program Modules ({STEPS.length})</span>
          <span style={{ color: 'var(--text-mut)', fontWeight: 500, textTransform: 'none', fontSize: 12, letterSpacing: 0 }}>
            Drag to reorder (coming soon)
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map(s => <StepCard key={s.id} step={s} />)}
        </div>
      </div>

      {/* Trainee tracking coming-soon banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(124,58,237,0.02) 100%)',
        border: `1px dashed ${ACCENT_BORDER}`,
        borderRadius: 18,
        padding: '36px 32px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 18, background: ACCENT_WEAK,
          border: `1.5px solid ${ACCENT_BORDER}`, display: 'grid', placeItems: 'center',
          margin: '0 auto 14px',
        }}>
          <Users size={24} color={ACCENT} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--text)', marginBottom: 6 }}>
          Trainee Tracking &amp; Reports
        </div>
        <div style={{ color: 'var(--text-mut)', fontSize: 13.5, maxWidth: 420, margin: '0 auto' }}>
          Full trainee progress tracking, completion certificates, and reporting will be available here.
          Provide the next steps and this section will be built out.
        </div>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: ACCENT, fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={14} /> Ready to configure
        </div>
      </div>

    </div>
  )
}
