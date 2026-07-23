import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './api.js'

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

  const openItem = async (it) => {
    if (!it.isRead) { await markNotificationRead(it.id).catch(() => {}); load() }
    setOpen(false)
    if (it.link) navigate(it.link)
  }

  const readAll = async () => { await markAllNotificationsRead().catch(() => {}); load() }

  return (
    <div className="notif" ref={ref}>
      <button className="iconbtn" aria-label="Notifications" onClick={toggle}>
        <Bell size={18} />
        {data.unread > 0 && <span className="notif-badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-pop">
          <div className="notif-head">
            <span>Notifications</span>
            {data.unread > 0 && <button className="linklike" onClick={readAll}>Mark all read</button>}
          </div>
          <div className="notif-list">
            {data.items.length === 0 && <div className="notif-empty">No notifications yet.</div>}
            {data.items.map((it) => (
              <button key={it.id} className={`notif-item${it.isRead ? '' : ' unread'}`} onClick={() => openItem(it)}>
                <div className="notif-title">{it.title}</div>
                {it.body && <div className="notif-body">{it.body}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
