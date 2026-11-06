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
 * multi: boolean (enables multi-selection of items)
 */
export default function CardSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  disabled = false,
  className = '',
  id,
  placement = 'auto',
  searchable = false,
  multi = false,
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

  const isSelected = (val) => {
    if (multi) {
      return Array.isArray(value) && value.some((v) => String(v) === String(val))
    }
    return String(val ?? '') === String(value ?? '')
  }

  const current = useMemo(() => {
    if (multi) return null
    return options.find((o) => String(o.value ?? '') === String(value ?? ''))
  }, [multi, options, value])

  const CurrentIcon = current?.icon

  const triggerLabel = useMemo(() => {
    if (multi) {
      if (!Array.isArray(value) || value.length === 0) return placeholder
      if (value.length === 1) {
        const found = options.find((o) => String(o.value ?? '') === String(value[0]))
        return found ? found.label : '1 Selected'
      }
      return `${value.length} Selected`
    }
    return current ? current.label : placeholder
  }, [multi, value, options, placeholder, current])

  const handleOptionClick = (val) => {
    if (multi) {
      const arr = Array.isArray(value) ? [...value] : []
      const strVal = String(val)
      const idx = arr.findIndex((v) => String(v) === strVal)
      if (idx >= 0) {
        arr.splice(idx, 1)
      } else {
        arr.push(val)
      }
      onChange(arr)
    } else {
      onChange(val)
      setOpen(false)
    }
  }

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

  const hasSelection = multi ? (Array.isArray(value) && value.length > 0) : Boolean(current)

  return (
    <div className={rootClasses} ref={ref}>
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`cardselect-trigger${open ? ' cardselect-trigger--open' : ''}${hasSelection ? ' cardselect-trigger--has-val' : ''}`}
        onClick={toggleOpen}
        disabled={disabled}
      >
        <span className="cardselect-trigger-content">
          {CurrentIcon && <CurrentIcon size={15} className="cardselect-trigger-icon" />}
          <span className={hasSelection ? 'cardselect-label-text' : 'cardselect-placeholder'}>
            {triggerLabel}
          </span>
          {multi && Array.isArray(value) && value.length > 1 && (
            <span className="cardselect-count-badge">{value.length}</span>
          )}
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

          {multi && (
            <div className="cardselect-multi-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cardselect-multi-btn"
                onClick={() => onChange(filteredOptions.map((o) => o.value))}
              >
                Select All ({filteredOptions.length})
              </button>
              {Array.isArray(value) && value.length > 0 && (
                <button
                  type="button"
                  className="cardselect-multi-btn cardselect-multi-btn--clear"
                  onClick={() => onChange([])}
                >
                  Clear Selection
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
                const active = isSelected(o.value)
                return (
                  <button
                    type="button"
                    key={String(o.value)}
                    role="option"
                    aria-selected={active}
                    className={`cardselect-option${active ? ' cardselect-option--active' : ''}`}
                    onClick={() => handleOptionClick(o.value)}
                  >
                    {Icon && <span className="cardselect-option-icon"><Icon size={14} /></span>}
                    <span className="cardselect-option-text">
                      <span className="cardselect-option-label">{o.label}</span>
                      {o.description && <span className="cardselect-option-desc">{o.description}</span>}
                    </span>
                    {active && <Check size={14} className="cardselect-option-check" strokeWidth={2.5} />}
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
