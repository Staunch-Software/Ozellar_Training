/* ------------------------------------------------------------------
   Data access layer. Today it reads local seed data and stores
   progress in the browser (localStorage) so the app is fully usable
   with no backend. When the FastAPI backend is ready, set USE_API =
   true and these functions fetch the same shapes from /api instead.
   ------------------------------------------------------------------ */
import { courses as seedCourses, learner as seedLearner } from './data/courses.js'

const USE_API = false // flip to true once the FastAPI backend is running
const PROGRESS_KEY = 'ozellar.progress.v1'

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {} }
  catch { return {} }
}
function saveProgress(p) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
}

/* progress shape: { [courseId]: { done: [chapterId...], passed: bool, score: number } } */

export function getLearner() {
  return seedLearner
}

export function getCourses() {
  if (USE_API) return fetch('/api/courses').then((r) => r.json())
  const progress = loadProgress()
  return Promise.resolve(
    seedCourses.map((c) => decorate(c, progress[c.id])),
  )
}

export function getCourse(slug) {
  if (USE_API) return fetch(`/api/courses/${slug}`).then((r) => r.json())
  const course = seedCourses.find((c) => c.slug === slug)
  if (!course) return Promise.resolve(null)
  const progress = loadProgress()
  return Promise.resolve(decorate(course, progress[course.id]))
}

function decorate(course, cp) {
  const done = new Set(cp?.done || [])
  const total = course.chapters.length
  const completedCount = course.chapters.filter((ch) => done.has(ch.id)).length
  let pct = total ? Math.round((completedCount / total) * 100) : 0
  if (course.progressOverride != null && !cp) pct = course.progressOverride
  return {
    ...course,
    completedCount,
    total,
    progressPct: pct,
    passed: cp?.passed ?? course.status === 'completed',
    score: cp?.score ?? (course.status === 'completed' ? 92 : null),
    chapters: course.chapters.map((ch) => ({ ...ch, done: done.has(ch.id) })),
  }
}

export function markChapterComplete(courseId, chapterId) {
  const p = loadProgress()
  const cp = p[courseId] || { done: [] }
  if (!cp.done.includes(chapterId)) cp.done.push(chapterId)
  p[courseId] = cp
  saveProgress(p)
}

export function recordAssessment(courseId, score, passed) {
  const p = loadProgress()
  const cp = p[courseId] || { done: [] }
  cp.score = score
  cp.passed = passed
  p[courseId] = cp
  saveProgress(p)
}

export function getResult(courseId) {
  return loadProgress()[courseId] || null
}
