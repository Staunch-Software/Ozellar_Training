/* ------------------------------------------------------------------
   API client. Talks to the FastAPI backend at /api (proxied to :8000 in
   dev by vite.config.js). Attaches the JWT bearer token on every call and
   clears the session on a 401 from an authenticated request.
   ------------------------------------------------------------------ */
const API = '/api'
const TOKEN_KEY = 'ozellar.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const t = getToken()
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(API + path, { ...opts, headers })

  if (res.status === 401) {
    const err = await res.json().catch(() => ({}))
    // an authenticated request failing 401 = expired/invalid session → sign out
    if (getToken()) {
      setToken(null)
      if (window.location.pathname !== '/') window.location.href = '/'
    }
    throw new Error(err.detail || 'Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.detail || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return res.status === 204 ? null : res.json()
}

// auth
export const login = (body) => req('/auth/login', { method: 'POST', body: JSON.stringify(body) })
export const getMe = () => req('/auth/me')
export const searchCrewNames = (q) => req(`/auth/crew-search?q=${encodeURIComponent(q)}`)

// courses / progress
export const getCourses = () => req('/courses')
export const getCourse = (slug) => req(`/courses/${slug}`)
export const markChapterComplete = (courseId, chapterId) =>
  req(`/courses/${courseId}/chapters/${chapterId}/complete`, { method: 'POST' })
export const submitAssessment = (courseId, answers) =>
  req(`/courses/${courseId}/assessment`, { method: 'POST', body: JSON.stringify({ answers }) })
export const getCertificate = (courseId) => req(`/courses/${courseId}/certificate`)
export const getCertificates = () => req('/certificates')
export const verifyCertificate = (id) => req(`/verify/${id}`)

// fetch the certificate PDF (auth) as an object URL — used to PREVIEW the exact
// PDF in an <iframe> so what's shown is identical to what downloads
export async function fetchCertificatePdfUrl(courseId) {
  const res = await fetch(`${API}/courses/${courseId}/certificate.pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error('Could not load the certificate')
  return URL.createObjectURL(await res.blob())
}

// certificate PDF needs the auth header, so fetch as a blob and download
export async function downloadCertificatePdf(courseId, certId) {
  const res = await fetch(`${API}/courses/${courseId}/certificate.pdf`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error('Could not download the certificate')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${certId || 'ozellar-certificate'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// notifications
export const getNotifications = () => req('/notifications')
export const markNotificationRead = (id) => req(`/notifications/${id}/read`, { method: 'POST' })
export const markAllNotificationsRead = () => req('/notifications/read-all', { method: 'POST' })

// admin
export const adminListUsers = () => req('/admin/users')
export const adminCreateUser = (body) => req('/admin/users', { method: 'POST', body: JSON.stringify(body) })
export const adminUpdateUser = (id, body) => req(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const adminAssign = (id, courseId) =>
  req(`/admin/users/${id}/enrollments`, { method: 'POST', body: JSON.stringify({ courseId }) })
export const adminUnassign = (id, courseId) =>
  req(`/admin/users/${id}/enrollments/${courseId}`, { method: 'DELETE' })
export const adminReport = () => req('/admin/report')

// CSV needs the auth header, so fetch as a blob and trigger a download
export async function adminDownloadReportCsv() {
  const res = await fetch(API + '/admin/report.csv', {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error('Could not download the report')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ozellar-compliance-report.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// admin course builder
export const adminListCourses = () => req('/admin/courses')
export const adminCreateCourse = (body) => req('/admin/courses', { method: 'POST', body: JSON.stringify(body) })
export const adminGetCourseBuilder = (courseId) => req(`/admin/courses/${courseId}`)
export const adminCreateQuizChapter = (courseId, body) =>
  req(`/admin/courses/${courseId}/quiz-chapters`, { method: 'POST', body: JSON.stringify(body) })
export const adminSaveQuizQuestions = (courseId, chapterId, questions) =>
  req(`/admin/courses/${courseId}/chapters/${chapterId}/quiz-questions`,
    { method: 'PUT', body: JSON.stringify({ questions }) })
export const adminReorderChapters = (courseId, order) =>
  req(`/admin/courses/${courseId}/reorder`, { method: 'PUT', body: JSON.stringify({ order }) })
export const adminDeleteChapter = (courseId, chapterId) =>
  req(`/admin/courses/${courseId}/chapters/${chapterId}`, { method: 'DELETE' })
export const adminSaveAssessment = (courseId, body) =>
  req(`/admin/courses/${courseId}/assessment`, { method: 'PUT', body: JSON.stringify(body) })

// file uploads need FormData, so they can't go through req()'s JSON-only body
async function uploadReq(path, formData) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || `Upload failed (${res.status})`)
  }
  return res.json()
}

export const adminUploadPptx = (courseId, file) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadReq(`/admin/courses/${courseId}/upload-pptx`, fd)
}

export const adminUploadVideo = (courseId, file, { chapterId, title } = {}) => {
  const fd = new FormData()
  fd.append('file', file)
  if (chapterId) fd.append('chapterId', chapterId)
  if (title) fd.append('title', title)
  return uploadReq(`/admin/courses/${courseId}/upload-video`, fd)
}
