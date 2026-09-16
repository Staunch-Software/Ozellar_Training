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
export const searchCrewNames = (q, scope) =>
  req(`/auth/crew-search?q=${encodeURIComponent(q)}${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`)

export const uploadCrewPhoto = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadReq('/crew/photo', fd)
}

export const getCrewPhoto = async () => {
  const t = getToken()
  const res = await fetch(`${API}/crew/photo?_t=${Date.now()}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {}
  })
  if (!res.ok) throw new Error('No photo')
  return URL.createObjectURL(await res.blob())
}

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
export const adminDashboardStats = () => req('/admin/dashboard-stats')
export const adminApproveCertificate = (userId, courseId, remark = '') =>
  req(`/admin/users/${userId}/courses/${courseId}/approve`, { method: 'POST', body: JSON.stringify({ remark }) })

export const adminGetNotifications = () => req('/admin/notifications')

// Admin Panel — manage Admin and Super Admin users
export const adminPanelListAdmins = () => req('/admin/panel/admins')
export const adminPanelCreateAdmin = (body) => req('/admin/panel/admins', { method: 'POST', body: JSON.stringify(body) })
export const adminPanelUpdateAdmin = (id, body) => req(`/admin/panel/admins/${id}`, { method: 'PATCH', body: JSON.stringify(body) })


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

// Admin: download full compliance report as a styled Excel workbook (.xlsx)
// Accepts optional filters: { crewSearch, courseId, status }
// The backend applies the same filters before generating the file so the
// downloaded Excel matches exactly what the user sees on screen.
export async function adminDownloadReportXlsx({ crewSearch, courseId, status } = {}) {
  const params = new URLSearchParams()
  if (crewSearch) params.set('crew_search', crewSearch)
  if (courseId)   params.set('course_id',   courseId)
  if (status)     params.set('status',      status)
  const qs = params.toString()
  const res = await fetch(API + '/admin/report.xlsx' + (qs ? '?' + qs : ''), {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error('Could not download the Excel report')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ozellar-compliance-report.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Crew: download personal training record as a styled Excel workbook (.xlsx)
export async function crewDownloadMyReportXlsx(status = 'all') {
  const query = status !== 'all' ? `?status=${status}` : ''
  const res = await fetch(API + `/crew/my-report.xlsx${query}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) throw new Error('Could not download your training report')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'my-training-report.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}


// admin course builder
export const adminListCourses = () => req('/admin/courses')
export const adminCreateCourse = (body) => req('/admin/courses', { method: 'POST', body: JSON.stringify(body) })
export const adminUpdateCourse = (courseId, body) => req(`/admin/courses/${courseId}`, { method: 'PUT', body: JSON.stringify(body) })
export const adminGetCourseBuilder = (courseId) => req(`/admin/courses/${courseId}`)
export const adminSaveCourseCertificate = (courseId, body) =>
  req(`/admin/courses/${courseId}/certificate`, { method: 'PUT', body: JSON.stringify(body) })
export const adminCourseCertificatePreviewUrl = (courseId, { titleUpper, topics }) => {
  const qs = new URLSearchParams()
  qs.set('token', getToken())
  if (titleUpper) qs.set('titleUpper', titleUpper)
  topics.forEach(t => qs.append('topics', t))
  return `/api/admin/courses/${courseId}/certificate-preview.pdf?${qs.toString()}`
}
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

// File uploads need FormData, so they can't go through req()'s JSON-only body.
// XHR rather than fetch: fetch gives no upload progress, and course decks run
// to hundreds of MB — without a real percentage the admin has no way to tell a
// slow upload from a dead one. `onProgress` receives { loaded, total, pct }
// as the bytes go out.
function uploadReq(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', API + path)
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return
        onProgress({
          loaded: e.loaded,
          total: e.total,
          pct: Math.round((e.loaded / e.total) * 100),
        })
      }
    }

    xhr.onload = () => {
      let body = {}
      try { body = JSON.parse(xhr.responseText || '{}') } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body)
      if (xhr.status === 413) {
        return reject(new Error('The server rejected this file as too large. ' +
          'Ask an admin to raise nginx client_max_body_size.'))
      }
      reject(new Error(body.detail || `Upload failed (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error during upload — the connection dropped.'))
    xhr.ontimeout = () => reject(new Error('The upload timed out.'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    xhr.send(formData)
  })
}

export const adminUploadPptx = (courseId, file, onProgress) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadReq(`/admin/courses/${courseId}/upload-pptx`, fd, onProgress)
}

// Progress of the server-side work that runs after the last byte arrives
// (LibreOffice render, video extraction, chapter creation).
export const adminPptxStatus = (courseId) =>
  req(`/admin/courses/${courseId}/pptx-status`)

export const adminUploadVideo = (courseId, file, { chapterId, title } = {}, onProgress) => {
  const fd = new FormData()
  fd.append('file', file)
  if (chapterId) fd.append('chapterId', chapterId)
  if (title) fd.append('title', title)
  return uploadReq(`/admin/courses/${courseId}/upload-video`, fd, onProgress)
}


// ============================================================
// SCREENING TEST — TEST-TAKER APIs
// ============================================================

export const screeningLogin = (body) =>
  req('/screening/login', { method: 'POST', body: JSON.stringify(body) })

export const screeningGetTest = () => req('/screening/test')

export const screeningStart = () => req('/screening/start', { method: 'POST' })

export const screeningTabSwitch = () => req('/screening/tab-switch', { method: 'POST' })

export const screeningSubmit = (body) =>
  req('/screening/submit', { method: 'POST', body: JSON.stringify(body) })

export const screeningAutosave = (body) =>
  req('/screening/autosave', { method: 'POST', body: JSON.stringify(body) })

export const screeningGetResult = () => req('/screening/result')

export const screeningUploadPhoto = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadReq('/screening/photo', fd)
}

/* The photo route is bearer-authenticated, so it can't be used as a plain
   <img src>. Fetch it once and hand back an object URL (null if none on
   record); callers are responsible for revoking it on unmount. */
export async function screeningPhotoObjectUrl() {
  const res = await fetch(`${API}/screening/photo`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) return null
  return URL.createObjectURL(await res.blob())
}


// ============================================================
// ADMIN — SCREENING MANAGEMENT
// ============================================================

export const adminListScreeningTests = () => req('/admin/screening/tests')
export const adminCreateScreeningTest = (body) =>
  req('/admin/screening/tests', { method: 'POST', body: JSON.stringify(body) })
export const adminGetScreeningTest = (id) => req(`/admin/screening/tests/${id}`)
export const adminUpdateScreeningTest = (id, body) =>
  req(`/admin/screening/tests/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const adminToggleScreeningTest = (id) =>
  req(`/admin/screening/tests/${id}/toggle`, { method: 'PATCH' })
export const adminDeleteScreeningTest = (id) =>
  req(`/admin/screening/tests/${id}`, { method: 'DELETE' })

export const adminAddScreeningSection = (testId, body) =>
  req(`/admin/screening/tests/${testId}/sections`, { method: 'POST', body: JSON.stringify(body) })
export const adminUpdateScreeningSection = (testId, sectionId, body) =>
  req(`/admin/screening/tests/${testId}/sections/${sectionId}`, { method: 'PATCH', body: JSON.stringify(body) })
export const adminDeleteScreeningSection = (testId, sectionId) =>
  req(`/admin/screening/tests/${testId}/sections/${sectionId}`, { method: 'DELETE' })
export const adminSaveScreeningQuestions = (testId, sectionId, questions) =>
  req(`/admin/screening/tests/${testId}/sections/${sectionId}/questions`,
    { method: 'PUT', body: JSON.stringify({ questions }) })
export const adminUploadScreeningQuestionImage = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return uploadReq('/admin/screening/upload-question-image', fd)
}

export const adminListScreeningCandidates = (testId) =>
  req(`/admin/screening/candidates${testId ? `?test_id=${testId}` : ''}`)
export const adminCreateScreeningCandidate = (body) =>
  req('/admin/screening/candidates', { method: 'POST', body: JSON.stringify(body) })
export const adminUpdateScreeningCandidate = (id, body) =>
  req(`/admin/screening/candidates/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
export const adminDeleteScreeningCandidate = (id) =>
  req(`/admin/screening/candidates/${id}`, { method: 'DELETE' })

export const adminGetScreeningResults = (testId) =>
  req(`/admin/screening/results${testId ? `?test_id=${testId}` : ''}`)

export async function adminDownloadScreeningResultsXlsx(testId) {
  const url = `/api/admin/screening/results.xlsx${testId ? `?test_id=${testId}` : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Could not download results')
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = 'screening-results.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}


// ============================================================
// ORIENTATION PROGRAM
// ============================================================

// Candidate-facing (existing crew login)
export const getMyOrientationEnrollment = () => req('/orientation/my-enrollment')
export const submitOrientation = () => req('/orientation/submit', { method: 'POST' })
export const completeOrientationTask = (taskId, completed, note, files) => {
  const fd = new FormData()
  fd.append('completed', completed ? 'true' : 'false')
  if (note !== undefined && note !== null) fd.append('note', note)
  for (const file of (files || [])) fd.append('files', file)
  return uploadReq(`/orientation/tasks/${taskId}/complete`, fd)
}
export const deleteOrientationTaskAttachment = (taskId, url) =>
  req(`/orientation/tasks/${taskId}/attachments?url=${encodeURIComponent(url)}`, { method: 'DELETE' })

// Approver-facing (vessel Master / Chief Engineer)
export const getApproverSubmissions = () => req('/approver/submissions')
export const approveOrientationSubmission = (id) =>
  req(`/approver/submissions/${id}/approve`, { method: 'POST' })
export const rejectOrientationSubmission = (id) =>
  req(`/approver/submissions/${id}/reject`, { method: 'POST' })
export const verifyOrientationTask = (submissionId, taskId, verified) =>
  req(`/approver/submissions/${submissionId}/tasks/${taskId}/verify`, {
    method: 'POST', body: JSON.stringify({ verified }),
  })

// Admin — programs / tasks
export const adminListOrientationPrograms = () => req('/admin/orientation/programs')
export const adminCreateOrientationProgram = (body) =>
  req('/admin/orientation/programs', { method: 'POST', body: JSON.stringify(body) })
export const adminGetOrientationProgram = (id) => req(`/admin/orientation/programs/${id}`)
export const adminUpdateOrientationProgram = (id, body) =>
  req(`/admin/orientation/programs/${id}`, { method: 'PUT', body: JSON.stringify(body) })
export const adminToggleOrientationProgram = (id) =>
  req(`/admin/orientation/programs/${id}/toggle`, { method: 'PATCH' })
export const adminDeleteOrientationProgram = (id) =>
  req(`/admin/orientation/programs/${id}`, { method: 'DELETE' })

export const adminAddOrientationTask = (programId, body) =>
  req(`/admin/orientation/programs/${programId}/tasks`, { method: 'POST', body: JSON.stringify(body) })
export const adminUpdateOrientationTask = (programId, taskId, body) =>
  req(`/admin/orientation/programs/${programId}/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify(body) })
export const adminDeleteOrientationTask = (programId, taskId) =>
  req(`/admin/orientation/programs/${programId}/tasks/${taskId}`, { method: 'DELETE' })
export const adminReorderOrientationTasks = (programId, order) =>
  req(`/admin/orientation/programs/${programId}/reorder`, { method: 'PUT', body: JSON.stringify({ order }) })

export async function adminDownloadOrientationProgramsXlsx() {
  const url = '/api/admin/orientation/programs.xlsx'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Could not download programs')
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = 'orientation-programs.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}

// Admin — candidates / enrollments
export const adminListOrientationVessels = () => req('/admin/orientation/vessels')
export const adminListOrientationCandidates = (q = '', programId, rank = '', vessel = '', onSail = false) => {
  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (programId) qs.set('program_id', programId)
  if (rank) qs.set('rank', rank)
  if (vessel) qs.set('vessel', vessel)
  if (onSail) qs.set('on_sail', 'true')
  const s = qs.toString()
  return req(`/admin/orientation/candidates${s ? `?${s}` : ''}`)
}
export const adminListOrientationEnrollments = (programId, status) => {
  const qs = new URLSearchParams()
  if (programId) qs.set('program_id', programId)
  if (status) qs.set('status', status)
  const s = qs.toString()
  return req(`/admin/orientation/enrollments${s ? `?${s}` : ''}`)
}
export const adminCreateOrientationEnrollment = (learnerId, programId, vesselName, masterName) =>
  req('/admin/orientation/enrollments', { method: 'POST', body: JSON.stringify({ learnerId, programId, vesselName, masterName }) })
export const adminDeleteOrientationEnrollment = (id) =>
  req(`/admin/orientation/enrollments/${id}`, { method: 'DELETE' })

// Admin — results / monitoring
export const adminGetOrientationResults = (programId) =>
  req(`/admin/orientation/results${programId ? `?program_id=${programId}` : ''}`)

export async function adminDownloadOrientationResultsXlsx(programId) {
  const url = `/api/admin/orientation/results.xlsx${programId ? `?program_id=${programId}` : ''}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error('Could not download results')
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = 'orientation-results.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objUrl)
}
