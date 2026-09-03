import { useEffect, useState, useCallback } from "react";
import {
  Users,
  GraduationCap,
  Award,
  BarChart3,
  TrendingUp,
  Ship,
  RefreshCw,
  CheckCircle,
  Clock,
  BookOpen,
  Target,
  Zap
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer
} from "recharts";
import { adminDashboardStats } from "../../api.js";
const CHART_COLORS = {
  blue: "#4c8dff",
  teal: "#0d9488",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#f43f5e",
  purple: "#8b5cf6",
  indigo: "#6366f1",
  sky: "#38bdf8",
  orange: "#fb923c",
  lime: "#84cc16",
  pink: "#ec4899",
  cyan: "#06b6d4"
};
const PIE_COLORS = Object.values(CHART_COLORS);
function useThemeColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark" || !document.documentElement.getAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return {
    gridStroke: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
    tickFill: isDark ? "#6b7178" : "#8a909b",
    tooltipBg: isDark ? "#1c2027" : "#ffffff",
    tooltipBorder: isDark ? "#282d34" : "#e4e7ec",
    tooltipText: isDark ? "#e8eaed" : "#16181d"
  };
}
function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 864e5);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return d + "d ago";
  if (d < 30) return Math.floor(d / 7) + "w ago";
  return Math.floor(d / 30) + "mo ago";
}
function KpiCard({ icon: Icon, label, value, note, color }) {
  const colorMap = {
    blue: { bg: "rgba(76,141,255,.13)", fg: "#4c8dff" },
    emerald: { bg: "rgba(16,185,129,.13)", fg: "#10b981" },
    amber: { bg: "rgba(245,158,11,.13)", fg: "#f59e0b" },
    rose: { bg: "rgba(244,63,94,.13)", fg: "#f43f5e" },
    purple: { bg: "rgba(139,92,246,.13)", fg: "#8b5cf6" },
    teal: { bg: "rgba(13,148,136,.13)", fg: "#0d9488" },
    indigo: { bg: "rgba(99,102,241,.13)", fg: "#6366f1" },
    sky: { bg: "rgba(56,189,248,.13)", fg: "#38bdf8" }
  };
  const c = colorMap[color] || colorMap.blue;
  return /* @__PURE__ */ React.createElement("div", { className: "dash-kpi" }, /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-icon", style: { background: c.bg, color: c.fg } }, /* @__PURE__ */ React.createElement(Icon, { size: 20, strokeWidth: 1.8 })), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-body" }, /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-value" }, value ?? "\u2014"), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-label" }, label), note && /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-note" }, note)));
}
function SectionHeader({ icon: Icon, title, subtitle }) {
  return /* @__PURE__ */ React.createElement("div", { className: "dash-section-head" }, /* @__PURE__ */ React.createElement("div", { className: "dash-section-icon" }, /* @__PURE__ */ React.createElement(Icon, { size: 16 })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "dash-section-title" }, title), subtitle && /* @__PURE__ */ React.createElement("div", { className: "dash-section-sub" }, subtitle)));
}
function ChartCard({ title, subtitle, icon, children, span }) {
  return /* @__PURE__ */ React.createElement("div", { className: `dash-chart-card${span === 2 ? " span-2" : ""}` }, /* @__PURE__ */ React.createElement(SectionHeader, { icon, title, subtitle }), /* @__PURE__ */ React.createElement("div", { className: "dash-chart-body" }, children));
}
function CustomTooltip({ active, payload, label }) {
  const t = useThemeColors();
  if (!active || !payload?.length) return null;
  return /* @__PURE__ */ React.createElement("div", { style: {
    background: t.tooltipBg,
    border: "1px solid " + t.tooltipBorder,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    boxShadow: "0 8px 24px rgba(0,0,0,.15)",
    color: t.tooltipText
  } }, label && /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 600, marginBottom: 6, fontSize: 12, opacity: 0.7 } }, label), payload.map((p, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 10, height: 10, borderRadius: 3, background: p.fill || p.color, display: "inline-block" } }), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.8 } }, p.name, ":"), /* @__PURE__ */ React.createElement("strong", null, p.value))));
}
function PieTooltip({ active, payload }) {
  const t = useThemeColors();
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return /* @__PURE__ */ React.createElement("div", { style: {
    background: t.tooltipBg,
    border: "1px solid " + t.tooltipBorder,
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 13,
    boxShadow: "0 8px 24px rgba(0,0,0,.15)",
    color: t.tooltipText
  } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 10, height: 10, borderRadius: 3, background: p.payload.fill, display: "inline-block" } }), /* @__PURE__ */ React.createElement("strong", null, p.name), ": ", p.value));
}
function DonutLegend({ data, colors }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return /* @__PURE__ */ React.createElement("div", { className: "dash-donut-legend" }, data.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: d.status, className: "dash-donut-legend-row" }, /* @__PURE__ */ React.createElement("span", { className: "dash-donut-dot", style: { background: colors[i % colors.length] } }), /* @__PURE__ */ React.createElement("span", { className: "dash-donut-name" }, d.status), /* @__PURE__ */ React.createElement("span", { className: "dash-donut-pct" }, total ? Math.round(d.count / total * 100) : 0, "%"), /* @__PURE__ */ React.createElement("span", { className: "dash-donut-count" }, d.count))));
}
function PassRateCell({ stat }) {
  const fill = stat.passRate >= 80 ? CHART_COLORS.emerald : stat.passRate >= 50 ? CHART_COLORS.amber : CHART_COLORS.rose;
  const bg = stat.passRate >= 80 ? "rgba(16,185,129,.08)" : stat.passRate >= 50 ? "rgba(245,158,11,.08)" : "rgba(244,63,94,.08)";
  const circumference = 2 * Math.PI * 24;
  return /* @__PURE__ */ React.createElement("div", { className: "dash-rate-cell" }, /* @__PURE__ */ React.createElement("div", { className: "dash-rate-arc", style: { background: bg } }, /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 60 60", width: "60", height: "60" }, /* @__PURE__ */ React.createElement("circle", { cx: "30", cy: "30", r: "24", fill: "none", stroke: "rgba(128,128,128,.12)", strokeWidth: "5" }), /* @__PURE__ */ React.createElement(
    "circle",
    {
      cx: "30",
      cy: "30",
      r: "24",
      fill: "none",
      stroke: fill,
      strokeWidth: "5",
      strokeDasharray: stat.passRate / 100 * circumference + " " + circumference,
      strokeLinecap: "round",
      transform: "rotate(-90 30 30)"
    }
  ), /* @__PURE__ */ React.createElement("text", { x: "30", y: "34", textAnchor: "middle", fontSize: "11", fontWeight: "700", fill }, stat.passRate, "%"))), /* @__PURE__ */ React.createElement("div", { className: "dash-rate-course", title: stat.course }, stat.course), /* @__PURE__ */ React.createElement("div", { className: "dash-rate-meta" }, /* @__PURE__ */ React.createElement("span", { style: { color: CHART_COLORS.emerald } }, stat.passed, " passed"), " / ", stat.enrolled, " enrolled"));
}
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();
  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await adminDashboardStats());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    load(false);
  }, [load]);
  if (loading) return /* @__PURE__ */ React.createElement("div", { className: "dash-loading" }, /* @__PURE__ */ React.createElement("div", { className: "dash-loading-ring" }), /* @__PURE__ */ React.createElement("span", null, "Loading dashboard\u2026"));
  if (!data) return /* @__PURE__ */ React.createElement("div", { className: "dash-loading" }, "Failed to load dashboard data.");
  const { kpis, crewByRank, crewByStatus, crewByVessel, courseStats, enrollmentTrend, recentCertificates } = data;
  const kpiCards = [
    { icon: Users, label: "Total Crew", value: kpis.totalCrew, note: kpis.activeCrew + " active", color: "blue" },
    { icon: BookOpen, label: "Courses", value: kpis.totalCourses, note: "available for training", color: "indigo" },
    { icon: GraduationCap, label: "Enrollments", value: kpis.totalEnrollments, note: "total assignments", color: "teal" },
    { icon: Award, label: "Certificates", value: kpis.totalCertificates, note: "issued to date", color: "emerald" },
    { icon: Target, label: "Overall Pass Rate", value: kpis.overallPassRate + "%", note: kpis.passAttempts + "/" + kpis.totalAttempts + " attempts", color: kpis.overallPassRate >= 70 ? "emerald" : kpis.overallPassRate >= 50 ? "amber" : "rose" },
    { icon: Zap, label: "Active Crew", value: kpis.activeCrew, note: kpis.totalCrew - kpis.activeCrew + " inactive", color: "purple" }
  ];
  const coursesWithData = courseStats.filter((c) => c.enrolled > 0);
  return /* @__PURE__ */ React.createElement("div", { className: "dash-root" }, /* @__PURE__ */ React.createElement("div", { className: "dash-header" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "eyebrow" }, "Ozellar Marine \xB7 Fleet Command"), /* @__PURE__ */ React.createElement("h1", { className: "dash-title" }, "Training Dashboard"), /* @__PURE__ */ React.createElement("p", { className: "dash-subtitle" }, "Real-time overview of crew training progress & compliance")), /* @__PURE__ */ React.createElement("div", { className: "dash-header-right" }, /* @__PURE__ */ React.createElement("button", { id: "dashboard-refresh-btn", className: "btn sm", onClick: () => load(true), disabled: refreshing }, /* @__PURE__ */ React.createElement(RefreshCw, { size: 13, style: { animation: refreshing ? "spin 1s linear infinite" : "none" } }), refreshing ? "Refreshing\u2026" : "Refresh"))), /* @__PURE__ */ React.createElement("div", { className: "dash-kpi-grid" }, kpiCards.map((k) => /* @__PURE__ */ React.createElement(KpiCard, { key: k.label, ...k }))), /* @__PURE__ */ React.createElement("div", { className: "dash-chart-grid" }, /* @__PURE__ */ React.createElement(ChartCard, { title: "Enrollment Trend", subtitle: "Course assignments \u2014 last 6 months", icon: TrendingUp, span: 2 }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 210 }, /* @__PURE__ */ React.createElement(AreaChart, { data: enrollmentTrend, margin: { top: 5, right: 20, left: -10, bottom: 0 } }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("linearGradient", { id: "gradBlue", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ React.createElement("stop", { offset: "5%", stopColor: CHART_COLORS.blue, stopOpacity: 0.25 }), /* @__PURE__ */ React.createElement("stop", { offset: "95%", stopColor: CHART_COLORS.blue, stopOpacity: 0.01 }))), /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: tc.gridStroke, vertical: false }), /* @__PURE__ */ React.createElement(XAxis, { dataKey: "month", tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false }), /* @__PURE__ */ React.createElement(YAxis, { tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false, allowDecimals: false }), /* @__PURE__ */ React.createElement(Tooltip, { content: /* @__PURE__ */ React.createElement(CustomTooltip, null) }), /* @__PURE__ */ React.createElement(
    Area,
    {
      type: "monotone",
      dataKey: "enrollments",
      name: "Enrollments",
      stroke: CHART_COLORS.blue,
      strokeWidth: 2.5,
      fill: "url(#gradBlue)",
      dot: { r: 4, fill: CHART_COLORS.blue, strokeWidth: 0 },
      activeDot: { r: 6, fill: CHART_COLORS.blue, strokeWidth: 2, stroke: "#fff" }
    }
  )))), /* @__PURE__ */ React.createElement(ChartCard, { title: "Crew by Rank", subtitle: "Distribution across all ranks", icon: Users }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 280 }, /* @__PURE__ */ React.createElement(BarChart, { data: crewByRank, layout: "vertical", margin: { top: 0, right: 20, left: 70, bottom: 0 }, barSize: 13 }, /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: tc.gridStroke, horizontal: false }), /* @__PURE__ */ React.createElement(XAxis, { type: "number", tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false, allowDecimals: false }), /* @__PURE__ */ React.createElement(YAxis, { type: "category", dataKey: "rank", tick: { fontSize: 10.5, fill: tc.tickFill }, axisLine: false, tickLine: false, width: 80 }), /* @__PURE__ */ React.createElement(Tooltip, { content: /* @__PURE__ */ React.createElement(CustomTooltip, null) }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "count", name: "Crew", radius: [0, 6, 6, 0] }, crewByRank.map((_, i) => /* @__PURE__ */ React.createElement(Cell, { key: i, fill: PIE_COLORS[i % PIE_COLORS.length], fillOpacity: 0.88 })))))), /* @__PURE__ */ React.createElement(ChartCard, { title: "Crew Status", subtitle: "Active, leave, and other", icon: Ship }, crewByStatus.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "dash-empty" }, "No status data") : /* @__PURE__ */ React.createElement("div", { className: "dash-donut-wrap" }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 190 }, /* @__PURE__ */ React.createElement(PieChart, null, /* @__PURE__ */ React.createElement(
    Pie,
    {
      data: crewByStatus,
      cx: "50%",
      cy: "50%",
      innerRadius: 52,
      outerRadius: 78,
      dataKey: "count",
      nameKey: "status",
      paddingAngle: 3,
      strokeWidth: 0
    },
    crewByStatus.map((_, i) => /* @__PURE__ */ React.createElement(Cell, { key: i, fill: PIE_COLORS[i % PIE_COLORS.length] }))
  ), /* @__PURE__ */ React.createElement(Tooltip, { content: /* @__PURE__ */ React.createElement(PieTooltip, null) }))), /* @__PURE__ */ React.createElement(DonutLegend, { data: crewByStatus, colors: PIE_COLORS }))), coursesWithData.length > 0 && /* @__PURE__ */ React.createElement(ChartCard, { title: "Course Completion Breakdown", subtitle: "Passed \xB7 In Progress \xB7 Not Started", icon: BarChart3, span: 2 }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 240 }, /* @__PURE__ */ React.createElement(BarChart, { data: coursesWithData, margin: { top: 5, right: 20, left: -10, bottom: 44 }, barSize: 28 }, /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: tc.gridStroke, vertical: false }), /* @__PURE__ */ React.createElement(XAxis, { dataKey: "course", tick: { fontSize: 10.5, fill: tc.tickFill }, axisLine: false, tickLine: false, angle: -22, textAnchor: "end", interval: 0 }), /* @__PURE__ */ React.createElement(YAxis, { tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false, allowDecimals: false }), /* @__PURE__ */ React.createElement(Tooltip, { content: /* @__PURE__ */ React.createElement(CustomTooltip, null) }), /* @__PURE__ */ React.createElement(Legend, { iconType: "circle", iconSize: 8, wrapperStyle: { fontSize: 11, paddingTop: 6, color: tc.tickFill } }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "passed", name: "Passed", stackId: "a", fill: CHART_COLORS.emerald }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "inProgress", name: "In Progress", stackId: "a", fill: CHART_COLORS.amber }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "assigned", name: "Not Started", stackId: "a", fill: CHART_COLORS.sky, radius: [4, 4, 0, 0] })))), coursesWithData.length > 0 && /* @__PURE__ */ React.createElement(ChartCard, { title: "Pass Rate per Course", subtitle: "Percentage of enrolled crew who passed", icon: Target, span: 2 }, /* @__PURE__ */ React.createElement("div", { className: "dash-rate-grid" }, coursesWithData.map((s) => /* @__PURE__ */ React.createElement(PassRateCell, { key: s.courseId, stat: s })))), crewByVessel.length > 0 && /* @__PURE__ */ React.createElement(ChartCard, { title: "Crew by Vessel", subtitle: "Top vessels by crew headcount", icon: Ship, span: 2 }, /* @__PURE__ */ React.createElement(ResponsiveContainer, { width: "100%", height: 220 }, /* @__PURE__ */ React.createElement(BarChart, { data: crewByVessel, margin: { top: 5, right: 20, left: -10, bottom: 40 }, barSize: 32 }, /* @__PURE__ */ React.createElement(CartesianGrid, { strokeDasharray: "3 3", stroke: tc.gridStroke, vertical: false }), /* @__PURE__ */ React.createElement(XAxis, { dataKey: "vessel", tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false, angle: -20, textAnchor: "end", interval: 0 }), /* @__PURE__ */ React.createElement(YAxis, { tick: { fontSize: 11, fill: tc.tickFill }, axisLine: false, tickLine: false, allowDecimals: false }), /* @__PURE__ */ React.createElement(Tooltip, { content: /* @__PURE__ */ React.createElement(CustomTooltip, null) }), /* @__PURE__ */ React.createElement(Bar, { dataKey: "count", name: "Crew", radius: [6, 6, 0, 0] }, crewByVessel.map((_, i) => /* @__PURE__ */ React.createElement(Cell, { key: i, fill: PIE_COLORS[(i + 3) % PIE_COLORS.length], fillOpacity: 0.88 })))))), /* @__PURE__ */ React.createElement("div", { className: "dash-chart-card span-2" }, /* @__PURE__ */ React.createElement(SectionHeader, { icon: Award, title: "Recent Certificates", subtitle: "Latest crew achievements" }), /* @__PURE__ */ React.createElement("div", { className: "dash-cert-list" }, recentCertificates.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "dash-empty" }, "No certificates issued yet.") : recentCertificates.map((cert) => /* @__PURE__ */ React.createElement("div", { key: cert.id, className: "dash-cert-row", id: "cert-row-" + cert.id }, /* @__PURE__ */ React.createElement("div", { className: "dash-cert-seal" }, /* @__PURE__ */ React.createElement(Award, { size: 15 })), /* @__PURE__ */ React.createElement("div", { className: "dash-cert-info" }, /* @__PURE__ */ React.createElement("div", { className: "dash-cert-name" }, cert.learner), /* @__PURE__ */ React.createElement("div", { className: "dash-cert-meta" }, cert.rank && /* @__PURE__ */ React.createElement("span", { className: "dash-cert-rank" }, cert.rank), /* @__PURE__ */ React.createElement("span", null, cert.course))), /* @__PURE__ */ React.createElement("div", { className: "dash-cert-right" }, /* @__PURE__ */ React.createElement("div", { className: "dash-cert-score" }, /* @__PURE__ */ React.createElement(CheckCircle, { size: 12 }), cert.score !== null ? cert.score + "%" : "\u2014"), /* @__PURE__ */ React.createElement("div", { className: "dash-cert-time" }, /* @__PURE__ */ React.createElement(Clock, { size: 11 }), " ", timeAgo(cert.issuedAt)))))))));
}
