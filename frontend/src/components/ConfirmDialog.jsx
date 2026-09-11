import { useCallback, useState } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import './ConfirmDialog.css'

function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
  return (
    <div className="cfm-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="cfm-card" role="alertdialog" aria-modal="true">
        <div className={`cfm-icon${danger ? ' cfm-icon--danger' : ''}`}>
          {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
        </div>
        <div className="cfm-title">{title}</div>
        {message && <div className="cfm-message">{message}</div>}
        <div className="cfm-actions">
          <button className="cfm-btn" onClick={onCancel}>{cancelLabel || 'Cancel'}</button>
          <button className={`cfm-btn cfm-btn--primary${danger ? ' cfm-btn--danger' : ''}`} onClick={onConfirm} autoFocus>
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Promise-based replacement for window.confirm(), rendered as an in-app
 * modal instead of the native browser dialog.
 *
 * const { confirm, dialog } = useConfirm()
 * ...
 * if (!(await confirm('Delete this?'))) return
 * ...
 * return <>{dialog}{...rest of the page}</>
 */
export function useConfirm() {
  const [state, setState] = useState(null)

  const confirm = useCallback((message, opts = {}) => {
    const { title = 'Are you sure?', confirmLabel, cancelLabel, danger = false } = opts
    return new Promise((resolve) => {
      setState({ title, message, confirmLabel, cancelLabel, danger, resolve })
    })
  }, [])

  const settle = (result) => {
    state?.resolve(result)
    setState(null)
  }

  const dialog = state ? (
    <ConfirmModal
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null

  return { confirm, dialog }
}
