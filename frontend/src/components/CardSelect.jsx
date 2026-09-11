import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import './CardSelect.css'

/**
 * Dropdown whose open panel renders as a floating card of options
 * (icon + label + description) instead of a native <select> list.
 *
 * options: [{ value, label, description?, icon?: Component }]
 */
export default function CardSelect({
  value, onChange, options, placeholder = 'Select...', disabled = false, className = '',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => String(o.value) === String(value))
  const CurrentIcon = current?.icon

  return (
    <div className={`cardselect${disabled ? ' cardselect--disabled' : ''} ${className}`} ref={ref}>
      <button
        type="button"
        className={`cardselect-trigger${open ? ' cardselect-trigger--open' : ''}`}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
      >
        <span className="cardselect-trigger-content">
          {CurrentIcon && <CurrentIcon size={14} className="cardselect-trigger-icon" />}
          <span className={current ? '' : 'cardselect-placeholder'}>{current ? current.label : placeholder}</span>
        </span>
        <ChevronDown size={14} className="cardselect-chevron" />
      </button>

      {open && (
        <div className="cardselect-panel">
          {options.map((o) => {
            const Icon = o.icon
            const active = String(o.value) === String(value)
            return (
              <button
                type="button"
                key={o.value}
                className={`cardselect-option${active ? ' cardselect-option--active' : ''}`}
                onClick={() => { onChange(o.value); setOpen(false) }}
              >
                {Icon && <span className="cardselect-option-icon"><Icon size={14} /></span>}
                <span className="cardselect-option-text">
                  <span className="cardselect-option-label">{o.label}</span>
                  {o.description && <span className="cardselect-option-desc">{o.description}</span>}
                </span>
                {active && <Check size={14} className="cardselect-option-check" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
