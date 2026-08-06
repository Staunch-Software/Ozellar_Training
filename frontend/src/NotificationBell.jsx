import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Info } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './api.js'

function timeAgo(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)  return 'Just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  const d = Math.floor(diff / 86400000)
  if (d === 1) return 'Yesterday'
  if (d < 7) return d + 'd ago'
  return Math.floor(d / 7) + 'w ago'
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ unread: 0, items: [] })
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => getNotifications().then(setData).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)  // light polling
    return () => clearInterval(t)
  }, [])

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const toggle = () => { const n = !open; setOpen(n); if (n) load() }

  const openItem = (it) => {
    if (!it.isRead) {
      markNotificationRead(it.id).then(load).catch(() => {})
    }
    if (it.link) {
      setOpen(false)
      navigate(it.link)
    }
  }

  const readAll = async () => { await markAllNotificationsRead().catch(() => {}); load() }

  return (
    <div className="notif" ref={ref}>
      <button className={`iconbtn ${open ? 'open' : ''}`} aria-label="Notifications" onClick={toggle}>
        <Bell size={20} />
        {data.unread > 0 && <span className="notif-badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">
            <span>Notifications</span>
            {data.unread > 0 && <button className="linklike" onClick={readAll}>MARK ALL AS READ</button>}
          </div>
          <div className="notif-list">
            {data.items.length === 0 && (
              <div className="notif-empty">
                <BellOff size={42} strokeWidth={1.5} />
                <span>You're all caught up!</span>
              </div>
            )}
            {data.items.map((it) => (
              <div key={it.id} className={`notif-item${it.isRead ? '' : ' unread'}`} onClick={() => openItem(it)}>
                <div className="notif-icon-wrap">
                  <Info size={20} strokeWidth={2} />
                </div>
                <div className="notif-content">
                  <div className="notif-title-row">
                    <div className="notif-title">{it.title}</div>
                    <div className="notif-meta">
                      <span className="notif-time">{timeAgo(it.createdAt)}</span>
                      {!it.isRead && <div className="notif-dot" />}
                    </div>
                  </div>
                  {it.body && <div className="notif-body">{it.body}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
