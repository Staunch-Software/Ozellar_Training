import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, Info } from 'lucide-react'
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
    if (!it.isRead) { 
      await markNotificationRead(it.id).catch(() => {})
      load() 
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
                      <span className="notif-time">2m ago</span>
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
