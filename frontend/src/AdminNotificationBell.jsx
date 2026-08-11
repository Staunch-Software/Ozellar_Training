import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Award, ArrowRight } from 'lucide-react'
import { adminGetNotifications } from './api.js'

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
  // Remove IDs that no longer exist in the API (they've been approved)
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

export default function AdminNotificationBell() {
  const [open, setOpen]       = useState(false)
  const [allItems, setAllItems] = useState([])
  const [viewed, setViewed]   = useState(getViewed)
  const ref                   = useRef(null)
  const navigate              = useNavigate()

  const load = useCallback(() => {
    adminGetNotifications().then(d => {
      const items = d.items || []
      // Prune stale viewed IDs (already approved ones disappear from API)
      const activeIds = new Set(items.map(i => i.id))
      pruneViewed(activeIds)
      setViewed(getViewed())
      setAllItems(items)
    }).catch(() => {})
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

  // Unread = items not yet viewed
  const unreadItems = allItems.filter(item => !viewed.has(item.id))
  const unreadCount = unreadItems.length

  const openItem = (item) => {
    // Mark as read
    addViewed(item.id)
    setViewed(getViewed())
    setOpen(false)
    navigate(`/admin/report?crew=${encodeURIComponent(item.learnerName)}&course=${encodeURIComponent(item.courseId)}&status=pending`)
  }

  return (
    <div className="notif" ref={ref}>
      <button
        className={`iconbtn ${open ? 'open' : ''}`}
        aria-label="Pending Approvals"
        onClick={toggle}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="notif-badge" style={{ background: 'var(--warn)' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-pop">
          {/* Header */}
          <div className="notif-head">
            <span>Pending Approvals</span>
            {unreadCount > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                background: 'var(--warn-weak)', color: 'var(--warn)',
                padding: '2px 8px', borderRadius: 99
              }}>
                {unreadCount} pending
              </span>
            )}
          </div>

          {/* List — show all pending, dimmed if already viewed */}
          <div className="notif-list">
            {allItems.length === 0 ? (
              <div className="notif-empty">
                <BellOff size={38} strokeWidth={1.5} />
                <span>All caught up — no pending approvals!</span>
              </div>
            ) : (
              allItems.map((item) => {
                const isRead = viewed.has(item.id)
                return (
                  <div
                    key={item.id}
                    className={`notif-item${isRead ? '' : ' unread'}`}
                    onClick={() => openItem(item)}
                    style={{ cursor: 'pointer', opacity: isRead ? 0.55 : 1, transition: 'opacity 0.2s' }}
                  >
                    {/* Icon */}
                    <div
                      className="notif-icon-wrap"
                      style={isRead
                        ? {}
                        : { background: 'linear-gradient(135deg, #d97706, #f59e0b)', color: '#fff' }
                      }
                    >
                      <Award size={18} strokeWidth={2} />
                    </div>

                    {/* Content */}
                    <div className="notif-content">
                      <div className="notif-title-row">
                        <div className="notif-title">{item.learnerName}</div>
                        <div className="notif-meta">
                          <span className="notif-time">{timeAgo(item.createdAt)}</span>
                          {!isRead && (
                            <div className="notif-dot" style={{ background: 'var(--warn)', boxShadow: '0 0 6px #d97706' }} />
                          )}
                        </div>
                      </div>
                      <div className="notif-body">
                        Completed <strong style={{ color: 'var(--text)' }}>{item.courseName}</strong> — awaiting certificate approval
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {allItems.length > 0 && (
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'center',
            }}>
              <button
                className="linklike"
                style={{ fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                onClick={() => { setOpen(false); navigate('/admin/report?status=pending') }}
              >
                View all pending in Report <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
