import React from 'react'

export default function AdminHeader({ icon: Icon, title, eyebrow, subtitle, children }) {
  return (
    <div className="admin-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="admin-page-title">
          {Icon && (
            <div className="admin-page-icon">
              <Icon size={22} strokeWidth={2.5} />
            </div>
          )}
          <span className="admin-page-text">{title}</span>
        </h1>
        {subtitle && <p className="dash-sub" style={{ margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {children && (
        <div className="admin-head-actions">
          {children}
        </div>
      )}
    </div>
  )
}
