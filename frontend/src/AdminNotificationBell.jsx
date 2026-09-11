import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Award, Info, ArrowRight } from 'lucide-react'
import {
  adminGetNotifications, getNotifications, markNotificationRead, markAllNotificationsRead,
} from './api.js'

// Certificate approvals (AssessmentApproval rows) have no server-side
// is_read flag — they're "read" for as long as the admin has seen them,
// tracked client-side since the row itself disappears once approved.
const VIEWED_KEY = 'ozellar.admin.viewed_notifs'

function getViewed() {
  try { return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]')) }
  catch { return new Set() }
}

function addViewed(id) {
  const s = getViewed()
  s.add(id)
  localStorage.setItem(VIEWED_KEY, JSON.stringify([...s]))
}

function pruneViewed(activeIds) {
  const s = getViewed()
  const pruned = [...s].filter(id => activeIds.has(id))
  localStorage.setItem(VIEWED_KEY, JSON.stringify(pruned))
}

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)    return 'Just now'
  if (diff < 3600000)  return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Yesterday'
  if (d < 7)   return d + 'd ago'
  return Math.floor(d / 7) + 'w ago'
}

// One bell, two sources merged into a single timeline: pending
// certificate approvals (AssessmentApproval, tracked as "viewed" in
// localStorage since those rows vanish once approved) and generic
// notifications (the shared Notification table — orientation events,
// etc., tracked server-side via isRead).
export default function AdminNotificationBell() {
  const [open, setOpen] = useState(false)
  const [certItems, setCertItems] = useState([])
  const [genData, setGenData] = useState({ unread: 0, items: [] })
  const [viewed, setViewed] = useState(getViewed)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = useCallback(() => {
    adminGetNotifications().then(d => {
      const items = d.items || []
      const activeIds = new Set(items.map(i => `cert-${i.id}`))
      pruneViewed(activeIds)
      setViewed(getViewed())
      setCertItems(items)
    }).catch(() => {})
    getNotifications().then(setGenData).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = () => { const n = !open; setOpen(n); if (n) load() }

  const merged = [
    ...certItems.map((item) => ({
      key: `cert-${item.id}`, type: 'cert', raw: item,
      isRead: viewed.has(`cert-${item.id}`),
      createdAt: item.createdAt,
    })),
    ...genData.items.map((item) => ({
      key: `gen-${item.id}`, type: 'generic', raw: item,
      isRead: item.isRead,
      createdAt: item.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  const unreadCount = merged.filter((m) => !m.isRead).length

  const openItem = (m) => {
    setOpen(false)
    if (m.type === 'cert') {
      addViewed(m.key)
      setViewed(getViewed())
      navigate(`/admin/course-management/report?crew=${encodeURIComponent(m.raw.learnerName)}&course=${encodeURIComponent(m.raw.courseId)}&status=pending`)
    } else {
      if (!m.isRead) markNotificationRead(m.raw.id).then(load).catch(() => {})
      if (m.raw.link) navigate(m.raw.link)
    }
  }

  const readAll = async () => {
    certItems.forEach((item) => addViewed(`cert-${item.id}`))
    setViewed(getViewed())
    await markAllNotificationsRead().catch(() => {})
    load()
  }

  return (
    <div className="notif" ref={ref}>
      <button className={`iconbtn ${open ? 'open' : ''}`} aria-label="Notifications" onClick={toggle}>
        <Bell size={20} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-pop">
          <div className="notif-head">
            <span>Notifications</span>
            {unreadCount > 0 && <button className="linklike" onClick={readAll}>MARK ALL AS READ</button>}
          </div>

          <div className="notif-list">
            {merged.length === 0 ? (
              <div className="notif-empty">
                <BellOff size={40} strokeWidth={1.5} />
                <span>You're all caught up!</span>
              </div>
            ) : (
              merged.map((m) => (
                <div key={m.key} className={`notif-item${m.isRead ? '' : ' unread'}`}
                  onClick={() => openItem(m)} style={{ cursor: 'pointer' }}>
                  <div className="notif-icon-wrap"
                    style={m.isRead ? {} : m.type === 'cert'
                      ? { background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff' }
                      : {}}>
                    {m.type === 'cert' ? <Award size={18} strokeWidth={2} /> : <Info size={20} strokeWidth={2} />}
                  </div>
                  <div className="notif-content">
                    <div className="notif-title-row">
                      <div className="notif-title">{m.type === 'cert' ? m.raw.learnerName : m.raw.title}</div>
                      <div className="notif-meta">
                        <span className="notif-time">{timeAgo(m.createdAt)}</span>
                        {!m.isRead && (
                          <div className="notif-dot"
                            style={m.type === 'cert' ? { background: 'var(--warn)', boxShadow: '0 0 6px #d97706' } : {}} />
                        )}
                      </div>
                    </div>
                    <div className="notif-body">
                      {m.type === 'cert'
                        ? <>Completed <strong style={{ color: 'var(--text)' }}>{m.raw.courseName}</strong> — awaiting certificate approval</>
                        : m.raw.body}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {certItems.length > 0 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
              <button className="linklike" style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => { setOpen(false); navigate('/admin/course-management/report?status=pending') }}>
                View all pending certificates <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
