import { useEffect, useState, useCallback } from 'react'
import {
  Users, GraduationCap, Award, BarChart3, TrendingUp, Ship,
  RefreshCw, CheckCircle, Clock, BookOpen, Target, Zap
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import { adminDashboardStats } from '../../api.js'

const CHART_COLORS = {
  blue:    '#4c8dff',
  teal:    '#0d9488',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  purple:  '#8b5cf6',
  indigo:  '#6366f1',
  sky:     '#38bdf8',
  orange:  '#fb923c',
  lime:    '#84cc16',
  pink:    '#ec4899',
  cyan:    '#06b6d4',
}
const PIE_COLORS = Object.values(CHART_COLORS)

function useThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  return {
    gridStroke:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    tickFill:     isDark ? '#6b7178' : '#8a909b',
    tooltipBg:    isDark ? '#1c2027' : '#ffffff',
    tooltipBorder:isDark ? '#282d34' : '#e4e7ec',
    tooltipText:  isDark ? '#e8eaed' : '#16181d',
  }
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return d + 'd ago'
  if (d < 30) return Math.floor(d / 7) + 'w ago'
  return Math.floor(d / 30) + 'mo ago'
}

function KpiCard({ icon: Icon, label, value, note, color }) {
  const colorMap = {
    blue:    { bg: 'rgba(76,141,255,.13)',   fg: '#4c8dff'  },
    emerald: { bg: 'rgba(16,185,129,.13)',   fg: '#10b981'  },
    amber:   { bg: 'rgba(245,158,11,.13)',   fg: '#f59e0b'  },
    rose:    { bg: 'rgba(244,63,94,.13)',    fg: '#f43f5e'  },
    purple:  { bg: 'rgba(139,92,246,.13)',   fg: '#8b5cf6'  },
    teal:    { bg: 'rgba(13,148,136,.13)',   fg: '#0d9488'  },
    indigo:  { bg: 'rgba(99,102,241,.13)',   fg: '#6366f1'  },
    sky:     { bg: 'rgba(56,189,248,.13)',   fg: '#38bdf8'  },
  }
  const c = colorMap[color] || colorMap.blue
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-icon" style={{ background: c.bg, color: c.fg }}>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="dash-kpi-body">
        <div className="dash-kpi-value">{value ?? '—'}</div>
        <div className="dash-kpi-label">{label}</div>
        {note && <div className="dash-kpi-note">{note}</div>}
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="dash-section-head">
      <div className="dash-section-icon"><Icon size={16} /></div>
      <div>
        <div className="dash-section-title">{title}</div>
        {subtitle && <div className="dash-section-sub">{subtitle}</div>}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, icon, children, span }) {
  return (
    <div className={`dash-chart-card${span === 2 ? ' span-2' : ''}`}>
      <SectionHeader icon={icon} title={title} subtitle={subtitle} />
      <div className="dash-chart-body">{children}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  const t = useThemeColors()
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: t.tooltipBg, border: '1px solid ' + t.tooltipBorder,
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
      boxShadow: '0 8px 24px rgba(0,0,0,.15)', color: t.tooltipText,
    }}>
      {label && <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, opacity: .7 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.fill || p.color, display: 'inline-block' }} />
          <span style={{ opacity: .8 }}>{p.name}:</span>
          <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  )
}

function PieTooltip({ active, payload }) {
  const t = useThemeColors()
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div style={{
      background: t.tooltipBg, border: '1px solid ' + t.tooltipBorder,
      borderRadius: 10, padding: '10px 14px', fontSize: 13,
      boxShadow: '0 8px 24px rgba(0,0,0,.15)', color: t.tooltipText,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: p.payload.fill, display: 'inline-block' }} />
        <strong>{p.name}</strong>: {p.value}
      </div>
    </div>
  )
}

function DonutLegend({ data, colors }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <div className="dash-donut-legend">
      {data.map((d, i) => (
        <div key={d.status} className="dash-donut-legend-row">
          <span className="dash-donut-dot" style={{ background: colors[i % colors.length] }} />
          <span className="dash-donut-name">{d.status}</span>
          <span className="dash-donut-pct">{total ? Math.round((d.count / total) * 100) : 0}%</span>
          <span className="dash-donut-count">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function PassRateCell({ stat }) {
  const fill = stat.passRate >= 80 ? CHART_COLORS.emerald
             : stat.passRate >= 50 ? CHART_COLORS.amber
             : CHART_COLORS.rose
  const bg = stat.passRate >= 80 ? 'rgba(16,185,129,.08)'
           : stat.passRate >= 50 ? 'rgba(245,158,11,.08)'
           : 'rgba(244,63,94,.08)'
  const circumference = 2 * Math.PI * 24  // r=24
  return (
    <div className="dash-rate-cell">
      <div className="dash-rate-arc" style={{ background: bg }}>
        <svg viewBox="0 0 60 60" width="60" height="60">
          <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(128,128,128,.12)" strokeWidth="5" />
          <circle
            cx="30" cy="30" r="24" fill="none" stroke={fill} strokeWidth="5"
            strokeDasharray={(stat.passRate / 100) * circumference + ' ' + circumference}
            strokeLinecap="round"
            transform="rotate(-90 30 30)"
          />
          <text x="30" y="34" textAnchor="middle" fontSize="11" fontWeight="700" fill={fill}>
            {stat.passRate}%
          </text>
        </svg>
      </div>
      <div className="dash-rate-course" title={stat.course}>{stat.course}</div>
      <div className="dash-rate-meta">
        <span style={{ color: CHART_COLORS.emerald }}>{stat.passed} passed</span>
        {' / '}{stat.enrolled} enrolled
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const tc = useThemeColors()

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try { setData(await adminDashboardStats()) }
    finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { load(false) }, [load])

  if (loading) return (
    <div className="dash-loading">
      <div className="dash-loading-ring" />
      <span>Loading dashboard…</span>
    </div>
  )
  if (!data) return <div className="dash-loading">Failed to load dashboard data.</div>

  const { kpis, crewByRank, crewByStatus, crewByVessel, courseStats, enrollmentTrend, recentCertificates } = data

  const kpiCards = [
    { icon: Users,        label: 'Total Crew',      value: kpis.totalCrew,         note: kpis.activeCrew + ' active',                                   color: 'blue'    },
    { icon: BookOpen,     label: 'Courses',         value: kpis.totalCourses,      note: 'available for training',                                      color: 'indigo'  },
    { icon: GraduationCap,label: 'Enrollments',     value: kpis.totalEnrollments,  note: 'total assignments',                                           color: 'teal'    },
    { icon: Award,        label: 'Certificates',    value: kpis.totalCertificates, note: 'issued to date',                                              color: 'emerald' },
    { icon: Target,       label: 'Overall Pass Rate',value: kpis.overallPassRate + '%', note: kpis.passAttempts + '/' + kpis.totalAttempts + ' attempts', color: kpis.overallPassRate >= 70 ? 'emerald' : kpis.overallPassRate >= 50 ? 'amber' : 'rose' },
    { icon: Zap,          label: 'Active Crew',     value: kpis.activeCrew,        note: (kpis.totalCrew - kpis.activeCrew) + ' inactive',              color: 'purple'  },
  ]

  const coursesWithData = courseStats.filter(c => c.enrolled > 0)

  return (
    <div className="dash-root">
      <div className="dash-header">
        <div>
          <div className="eyebrow">Ozellar Marine · Fleet Command</div>
          <h1 className="dash-title">Training Dashboard</h1>
          <p className="dash-subtitle">Real-time overview of crew training progress &amp; compliance</p>
        </div>
        <div className="dash-header-right">
          <button id="dashboard-refresh-btn" className="btn sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="dash-kpi-grid-row">
        {kpiCards.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="dash-chart-grid">

        {/* Pass Rate per Course — radial cells */}
        {coursesWithData.length > 0 && (
          <ChartCard title="Pass Rate per Course" subtitle="Percentage of enrolled crew who passed" icon={Target} span={2}>
            <div className="dash-rate-grid">
              {coursesWithData.map((s) => <PassRateCell key={s.courseId} stat={s} />)}
            </div>
          </ChartCard>
        )}

        {/* Recent Certificates */}
        <div className="dash-chart-card span-2">
          <SectionHeader icon={Award} title="Recent Certificates" subtitle="Latest crew achievements" />
          <div className="dash-cert-list">
            {recentCertificates.length === 0 ? (
              <div className="dash-empty">No certificates issued yet.</div>
            ) : recentCertificates.map((cert) => (
              <div key={cert.id} className="dash-cert-row" id={'cert-row-' + cert.id}>
                <div className="dash-cert-seal"><Award size={15} /></div>
                <div className="dash-cert-info">
                  <div className="dash-cert-name">{cert.learner}</div>
                  <div className="dash-cert-meta">
                    {cert.rank && <span className="dash-cert-rank">{cert.rank}</span>}
                    <span>{cert.course}</span>
                  </div>
                </div>
                <div className="dash-cert-right">
                  <div className="dash-cert-score"><CheckCircle size={12} />{cert.score !== null ? cert.score + '%' : '—'}</div>
                  <div className="dash-cert-time"><Clock size={11} /> {timeAgo(cert.issuedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Course Completion Breakdown — stacked bar */}
        {coursesWithData.length > 0 && (
          <ChartCard title="Course Completion Breakdown" subtitle="Passed · In Progress · Not Started" icon={BarChart3} span={2}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={coursesWithData} margin={{ top: 5, right: 20, left: -10, bottom: 44 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStroke} vertical={false} />
                <XAxis dataKey="course" tick={{ fontSize: 10.5, fill: tc.tickFill }} axisLine={false} tickLine={false} angle={-22} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 6, color: tc.tickFill }} />
                <Bar dataKey="passed"     name="Passed"      stackId="a" fill={CHART_COLORS.emerald} />
                <Bar dataKey="inProgress" name="In Progress" stackId="a" fill={CHART_COLORS.amber}   />
                <Bar dataKey="assigned"   name="Not Started" stackId="a" fill={CHART_COLORS.sky} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Enrollment Trend — area */}
        <ChartCard title="Enrollment Trend" subtitle="Course assignments — last 6 months" icon={TrendingUp} span={2}>
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={enrollmentTrend} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gradBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.blue} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tc.gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tc.tickFill }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="enrollments" name="Enrollments"
                stroke={CHART_COLORS.blue} strokeWidth={2.5} fill="url(#gradBlue)"
                dot={{ r: 4, fill: CHART_COLORS.blue, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: CHART_COLORS.blue, strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

      </div>
    </div>
  )
}
