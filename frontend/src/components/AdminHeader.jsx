import React from 'react'

export default function AdminHeader({ icon: Icon, title, eyebrow, subtitle, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'clamp(24px, 2vw, 42px)', flexWrap:'wrap', gap:15 }}>
      <div>
        {eyebrow && <div style={{ fontSize:'clamp(11.5px, 0.8vw, 16px)', fontWeight:700, color:'var(--text-mut)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{eyebrow}</div>}
        <h1 style={{ margin:0, fontSize:'clamp(26px, 1.8vw, 36px)', fontWeight:800, color:'var(--text)', letterSpacing:'-.02em', display:'flex', alignItems:'center', gap:10 }}>
          {Icon && (
            <div style={{ color:'var(--accent)', display:'flex', alignItems:'center', paddingRight: 4 }}>
              <Icon size={32} strokeWidth={2.5} />
            </div>
          )}
          {title}
        </h1>
        {subtitle && <p style={{ margin: '6px 0 0', color: 'var(--text-mut)', fontSize: 'clamp(13.5px, 0.9vw, 18px)', fontWeight: 500 }}>{subtitle}</p>}
      </div>
      {children && (
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {children}
        </div>
      )}
    </div>
  )
}
