import React from 'react'

export default function AdminHeader({ icon: Icon, title, eyebrow, subtitle, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:15 }}>
      <div>
        {eyebrow && <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{eyebrow}</div>}
        <h1 style={{ margin:0, fontSize:28, fontWeight:800, color:'var(--text)', letterSpacing:'-.02em', display:'flex', alignItems:'center', gap:12 }}>
          {Icon && (
            <div style={{ width:42, height:42, borderRadius:12, background:'var(--accent)', display:'grid', placeItems:'center', color:'#fff', boxShadow:'0 4px 14px rgba(79,70,229,.3)' }}>
              <Icon size={22} strokeWidth={2.5} />
            </div>
          )}
          {title}
        </h1>
        {subtitle && <p style={{ margin: '6px 0 0', color: 'var(--text-mut)', fontSize: 13.5, fontWeight: 500 }}>{subtitle}</p>}
      </div>
      {children && (
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          {children}
        </div>
      )}
    </div>
  )
}
