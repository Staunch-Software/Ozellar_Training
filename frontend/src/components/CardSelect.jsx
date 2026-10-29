import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import './CardSelect.css'

/**
 * Dropdown whose open panel renders as a floating card of options
 * (icon + label + description) instead of a native <select> list.
 *
 * options: [{ value, label, description?, icon?: Component }]
 * placement: 'auto' | 'top' | 'bottom'
 * searchable: boolean (adds instant search bar inside the panel)
 */
export default function CardSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  id,
  placement = 'auto',
  searchable = false,
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(placement === 'top')
  const [filterText, setFilterText] = useState('')
  const ref = useRef(null)
  const searchInputRef = useRef(null)

  const updatePlacement = useCallback(() => {
    if (placement === 'top') {
      setDropUp(true)
      return
    }
    if (placement === 'bottom') {
      setDropUp(false)
      return
    }
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const scrollParent = ref.current.closest('.admin-user-modal-body, [data-scroll-container]') || null
    let spaceBelow = window.innerHeight - rect.bottom
    let spaceAbove = rect.top

    if (scrollParent) {
      const pRect = scrollParent.getBoundingClientRect()
      spaceBelow = pRect.bottom - rect.bottom
      spaceAbove = rect.top - pRect.top
    }

    // Panel max-height is ~280px + 6px margin.
    // If space below is less than 260px and there's enough space above, flip up
    if (spaceBelow < 260 && spaceAbove > 150) {
      setDropUp(true)
    } else {
      setDropUp(false)
    }
  }, [placement])

  const toggleOpen = () => {
    if (disabled) return
    if (!open) {
      updatePlacement()
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) {
      setFilterText('')
      return
    }
    updatePlacement()
    if (searchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, searchable, updatePlacement])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    const onScrollOrResize = () => {
      updatePlacement()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updatePlacement])

  const current = options.find((o) => String(o.value ?? '') === String(value ?? ''))
  const CurrentIcon = current?.icon

  const filteredOptions = useMemo(() => {
    if (!searchable || !filterText.trim()) return options
    const q = filterText.trim().toLowerCase()
    return options.filter((o) =>
      (o.label || '').toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q)
    )
  }, [options, searchable, filterText])

  const rootClasses = [
    'cardselect',
    open ? 'cardselect--open' : '',
    dropUp ? 'cardselect--up' : '',
    disabled ? 'cardselect--disabled' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={rootClasses} ref={ref}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`cardselect-trigger${open ? ' cardselect-trigger--open' : ''}`}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span className="cardselect-trigger-content">
          {CurrentIcon && <CurrentIcon size={15} className="cardselect-trigger-icon" />}
          <span className={current ? 'cardselect-label-text' : 'cardselect-placeholder'}>
            {current ? current.label : placeholder}
          </span>
        </span>
        <ChevronDown size={14} className="cardselect-chevron" />
      </button>

      {open && (
        <div className="cardselect-panel" role="listbox">
          {searchable && (
            <div className="cardselect-search-wrap" onClick={(e) => e.stopPropagation()}>
              <Search size={13} className="cardselect-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="cardselect-search-input"
                placeholder="Search options..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              {filterText && (
                <button
                  type="button"
                  className="cardselect-search-clear"
                  onClick={() => setFilterText('')}
                  aria-label="Clear filter search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <div className="cardselect-options-list">
            {filteredOptions.length === 0 ? (
              <div className="cardselect-empty">No matching options found</div>
            ) : (
              filteredOptions.map((o) => {
                const Icon = o.icon
                const active = String(o.value ?? '') === String(value ?? '')
                return (
                  <button
                    type="button"
                    key={String(o.value)}
                    role="option"
                    aria-selected={active}
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
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
