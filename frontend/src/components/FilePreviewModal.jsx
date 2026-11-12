import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X, ExternalLink, Download, ZoomIn, ZoomOut, RotateCw, RotateCcw,
  FileText, Image as ImageIcon, Video, Music, FileSpreadsheet,
  FileArchive, File, Copy, Check, Table, AlertCircle, FileQuestion, Maximize2, Search,
  ChevronLeft, ChevronRight, Layers
} from 'lucide-react'
import './FilePreviewModal.css'

function colToLetter(colIndex) {
  let temp, letter = ''
  let col = colIndex + 1
  while (col > 0) {
    temp = (col - 1) % 26
    letter = String.fromCharCode(65 + temp) + letter
    col = Math.floor((col - temp) / 26)
  }
  return letter
}

// -------------------------------------------------------------
// Interactive In-Browser Excel Spreadsheet Viewer (.xlsx, .xls)
// -------------------------------------------------------------
function ExcelViewer({ url, displayName, onDownload }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [activeSheet, setActiveSheet] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setWorkbook(null)

    import('xlsx')
      .then((XLSX) => {
        return fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.arrayBuffer()
          })
          .then((buffer) => {
            if (cancelled) return
            const wb = XLSX.read(buffer, { type: 'array' })
            const sheetNames = wb.SheetNames || []
            if (sheetNames.length === 0) throw new Error('Workbook contains no sheets')
            const sheetsData = {}
            sheetNames.forEach((name) => {
              const ws = wb.Sheets[name]
              sheetsData[name] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            })
            setWorkbook({ sheetNames, sheetsData })
            setActiveSheet(sheetNames[0])
            setLoading(false)
          })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not parse Excel spreadsheet')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [url])

  const rows = workbook?.sheetsData?.[activeSheet] || []
  const maxCols = useMemo(() => {
    return rows.reduce((max, r) => Math.max(max, Array.isArray(r) ? r.length : 0), 0)
  }, [rows])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((row) =>
      Array.isArray(row) && row.some((cell) => String(cell || '').toLowerCase().includes(q))
    )
  }, [rows, search])

  if (loading) {
    return (
      <div className="fpm-loading-box">
        <div className="spinner" />
        <p>Loading spreadsheet ({displayName})...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fpm-error-box">
        <AlertCircle size={28} color="#ef4444" />
        <p>Unable to preview Excel workbook inline: {error}</p>
        <button type="button" className="btn sm primary" onClick={onDownload}>
          <Download size={14} /> Download File
        </button>
      </div>
    )
  }

  return (
    <div className="fpm-excel-container">
      {/* Excel Sheet Toolbar */}
      <div className="fpm-excel-toolbar">
        <div className="fpm-excel-info">
          <FileSpreadsheet size={15} color="#107c41" />
          <span>{rows.length} rows · {maxCols} columns</span>
        </div>
        <div className="fpm-excel-search">
          <Search size={13} />
          <input
            type="text"
            placeholder="Filter cells..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="fpm-excel-clear-btn" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet Grid */}
      <div className="fpm-excel-grid-scroll">
        <table className="fpm-excel-table">
          <thead>
            <tr>
              <th className="fpm-excel-corner-cell"></th>
              {Array.from({ length: maxCols }).map((_, cIdx) => (
                <th key={cIdx} className="fpm-excel-col-header">
                  {colToLetter(cIdx)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={maxCols + 1} className="fpm-excel-empty">
                  No matching cells found
                </td>
              </tr>
            ) : (
              filteredRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  <td className="fpm-excel-row-header">{rIdx + 1}</td>
                  {Array.from({ length: maxCols }).map((_, cIdx) => {
                    const val = Array.isArray(row) ? row[cIdx] : ''
                    const text = val !== undefined && val !== null ? String(val) : ''
                    return (
                      <td key={cIdx} className="fpm-excel-cell" title={text}>
                        {text}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Sheet Tabs Bar */}
      {workbook?.sheetNames?.length > 1 && (
        <div className="fpm-excel-sheet-tabs">
          {workbook.sheetNames.map((name) => (
            <button
              key={name}
              type="button"
              className={`fpm-excel-tab ${activeSheet === name ? 'active' : ''}`}
              onClick={() => { setActiveSheet(name); setSearch('') }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------
// Interactive In-Browser Word Document Viewer (.docx)
// -------------------------------------------------------------
function DocxViewer({ url, displayName, onDownload }) {
  const containerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    import('docx-preview')
      .then((docx) => {
        return fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.arrayBuffer()
          })
          .then((buffer) => {
            if (cancelled || !containerRef.current) return
            containerRef.current.innerHTML = ''
            return docx.renderAsync(buffer, containerRef.current, undefined, {
              className: 'fpm-docx-doc',
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
              breakPages: true,
            })
          })
          .then(() => {
            if (!cancelled) setLoading(false)
          })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not parse Word document')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [url])

  return (
    <div className="fpm-docx-wrapper">
      {loading && (
        <div className="fpm-loading-box">
          <div className="spinner" />
          <p>Loading and rendering Word document ({displayName})...</p>
        </div>
      )}
      {error && (
        <div className="fpm-error-box">
          <AlertCircle size={28} color="#ef4444" />
          <p>Unable to preview Word document inline: {error}</p>
          <button type="button" className="btn sm primary" onClick={onDownload}>
            <Download size={14} /> Download Document
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="fpm-docx-container"
        style={{ display: loading || error ? 'none' : 'block' }}
      />
    </div>
  )
}

export function detectFileType(url = '', fallbackName = '') {
  const cleanUrl = (url || '').split('?')[0].split('#')[0]
  const extFromUrl = cleanUrl.split('.').pop() || ''
  const extFromName = (fallbackName || '').split('.').pop() || ''
  const ext = (extFromUrl.length <= 5 ? extFromUrl : extFromName).toLowerCase()

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) {
    return { kind: 'image', ext, label: 'Image', icon: ImageIcon, color: '#3b82f6' }
  }
  if (['pdf'].includes(ext)) {
    return { kind: 'pdf', ext, label: 'PDF Document', icon: FileText, color: '#ef4444' }
  }
  if (['txt', 'csv', 'log', 'json', 'xml', 'md', 'markdown', 'yml', 'yaml', 'ini', 'conf', 'tsv'].includes(ext)) {
    return { kind: 'text', ext, label: ext.toUpperCase(), icon: FileText, color: '#0ea5e9' }
  }
  if (['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv'].includes(ext)) {
    return { kind: 'video', ext, label: 'Video', icon: Video, color: '#8b5cf6' }
  }
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext)) {
    return { kind: 'audio', ext, label: 'Audio', icon: Music, color: '#ec4899' }
  }
  if (['docx', 'doc'].includes(ext)) {
    return { kind: 'word', ext, label: 'Word Document', icon: FileText, color: '#2b579a' }
  }
  if (['xlsx', 'xls'].includes(ext)) {
    return { kind: 'excel', ext, label: 'Excel Spreadsheet', icon: FileSpreadsheet, color: '#107c41' }
  }
  if (['pptx', 'ppt'].includes(ext)) {
    return { kind: 'powerpoint', ext, label: 'PowerPoint', icon: FileText, color: '#d24726' }
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { kind: 'archive', ext, label: 'Archive', icon: FileArchive, color: '#f59e0b' }
  }
  return { kind: 'file', ext: ext || 'bin', label: 'File', icon: File, color: '#64748b' }
}

export function cleanFileName(url = '', fallback = 'Attachment') {
  if (!url) return fallback
  try {
    const raw = decodeURIComponent(url.split('/').pop().split('?')[0])
    // Strip trailing or random uuid prefix if pattern matches uuid-hex-name
    const parts = raw.split('-')
    if (parts.length > 2 && parts[0].length >= 8) {
      return parts.slice(2).join('-') || raw
    }
    return raw || fallback
  } catch {
    return fallback
  }
}

export default function FilePreviewModal({
  url,
  title,
  items,          // Optional array of { url, title, taskTitle }
  initialIndex = 0,
  taskTitle = '',
  onClose
}) {
  const activeItems = useMemo(() => {
    if (Array.isArray(items) && items.length > 0) return items
    if (url) return [{ url, title: title || cleanFileName(url), taskTitle }]
    return []
  }, [items, url, title, taskTitle])

  const [currentIndex, setCurrentIndex] = useState(() => {
    const init = typeof initialIndex === 'number' ? initialIndex : 0
    return Math.max(0, Math.min(Math.max(0, activeItems.length - 1), init))
  })

  useEffect(() => {
    if (typeof initialIndex === 'number' && initialIndex >= 0) {
      setCurrentIndex(Math.max(0, Math.min(Math.max(0, activeItems.length - 1), initialIndex)))
    }
  }, [initialIndex, activeItems.length])

  const currentItem = activeItems[currentIndex] || activeItems[0] || {}
  const activeUrl = currentItem.url || url
  const activeTitle = currentItem.title || title || cleanFileName(activeUrl)
  const activeTaskTitle = currentItem.taskTitle || taskTitle
  const hasMultiple = activeItems.length > 1

  const goPrev = () => setCurrentIndex((idx) => Math.max(0, idx - 1))
  const goNext = () => setCurrentIndex((idx) => Math.min(activeItems.length - 1, idx + 1))

  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [copied, setCopied] = useState(false)
  const [csvViewMode, setCsvViewMode] = useState('table') // 'table' | 'raw'
  const [textContent, setTextContent] = useState(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(null)

  const meta = useMemo(() => detectFileType(activeUrl, activeTitle), [activeUrl, activeTitle])
  const displayName = useMemo(() => activeTitle || cleanFileName(activeUrl), [activeTitle, activeUrl])
  const Icon = meta.icon

  // Close on Escape, Next/Prev on ArrowLeft / ArrowRight
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft' && hasMultiple) goPrev()
      if (e.key === 'ArrowRight' && hasMultiple) goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, hasMultiple, activeItems.length])

  // Reset transforms when activeUrl changes
  useEffect(() => {
    setScale(1)
    setRotate(0)
    setTextContent(null)
    setTextError(null)
  }, [activeUrl])

  // If text file or CSV, load content
  useEffect(() => {
    if (meta.kind === 'text' && activeUrl) {
      setTextLoading(true)
      setTextError(null)
      fetch(activeUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.text()
        })
        .then((txt) => {
          setTextContent(txt)
          setTextLoading(false)
        })
        .catch((err) => {
          setTextError(`Could not preview text content: ${err.message}`)
          setTextLoading(false)
        })
    }
  }, [meta.kind, activeUrl])

  const handleDownload = async () => {
    if (!activeUrl) return
    try {
      const res = await fetch(activeUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = displayName
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    } catch {
      window.open(activeUrl, '_blank')
    }
  }

  const handleCopyText = () => {
    if (!textContent) return
    navigator.clipboard?.writeText(textContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Parse CSV text into 2D array
  const parsedCsv = useMemo(() => {
    if (meta.ext !== 'csv' && meta.ext !== 'tsv') return null
    if (!textContent) return null
    const delimiter = meta.ext === 'tsv' ? '\t' : ','
    const lines = textContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
    return lines.map((line) => {
      // simple CSV parsing handling basic quotes
      const row = []
      let insideQuote = false
      let current = ''
      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          insideQuote = !insideQuote
        } else if (char === delimiter && !insideQuote) {
          row.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      row.push(current.trim())
      return row
    })
  }, [meta.ext, textContent])

  if (!activeUrl && activeItems.length === 0) return null

  return (
    <div className="fpm-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="fpm-container" role="dialog" aria-modal="true" aria-label={`Preview: ${displayName}`}>
        {/* Header bar */}
        <div className="fpm-header">
          <div className="fpm-header-left">
            <div className="fpm-kind-badge" style={{ '--fpm-badge-color': meta.color }}>
              <Icon size={14} />
              <span>{meta.label}</span>
            </div>
            <div className="fpm-title-wrap" title={displayName}>
              <h3 className="fpm-title">{displayName}</h3>
              <span className="fpm-ext-pill">.{meta.ext.toUpperCase()}</span>
            </div>
            {activeTaskTitle && (
              <div className="fpm-task-pill" title={activeTaskTitle}>
                <span className="fpm-task-pill-dot" />
                <span className="fpm-task-pill-text">{activeTaskTitle}</span>
              </div>
            )}
          </div>

          {/* Carousel Next / Prev Controls */}
          {hasMultiple && (
            <div className="fpm-carousel-nav">
              <button
                type="button"
                className="fpm-nav-btn"
                disabled={currentIndex === 0}
                onClick={goPrev}
                title="Previous attachment (ArrowLeft)"
                aria-label="Previous attachment"
              >
                <ChevronLeft size={16} />
                <span className="fpm-nav-btn-text">Prev</span>
              </button>
              <div className="fpm-nav-counter">
                <span className="fpm-counter-current">{currentIndex + 1}</span>
                <span className="fpm-counter-sep">/</span>
                <span className="fpm-counter-total">{activeItems.length}</span>
              </div>
              <button
                type="button"
                className="fpm-nav-btn"
                disabled={currentIndex === activeItems.length - 1}
                onClick={goNext}
                title="Next attachment (ArrowRight)"
                aria-label="Next attachment"
              >
                <span className="fpm-nav-btn-text">Next</span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <div className="fpm-header-actions">
            {/* Image zoom controls */}
            {meta.kind === 'image' && (
              <div className="fpm-img-tools">
                <button
                  type="button"
                  className="fpm-tool-btn"
                  title="Zoom Out"
                  onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.2).toFixed(1))))}
                >
                  <ZoomOut size={15} />
                </button>
                <span className="fpm-zoom-label">{Math.round(scale * 100)}%</span>
                <button
                  type="button"
                  className="fpm-tool-btn"
                  title="Zoom In"
                  onClick={() => setScale((s) => Math.min(3.5, Number((s + 0.2).toFixed(1))))}
                >
                  <ZoomIn size={15} />
                </button>
                <button
                  type="button"
                  className="fpm-tool-btn"
                  title="Rotate 90°"
                  onClick={() => setRotate((r) => (r + 90) % 360)}
                >
                  <RotateCw size={15} />
                </button>
                <button
                  type="button"
                  className="fpm-tool-btn"
                  title="Reset (100%)"
                  onClick={() => { setScale(1); setRotate(0) }}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            )}

            {/* CSV view toggle */}
            {parsedCsv && (
              <div className="fpm-csv-toggle">
                <button
                  type="button"
                  className={`fpm-toggle-btn ${csvViewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setCsvViewMode('table')}
                  title="Table View"
                >
                  <Table size={13} /> Table
                </button>
                <button
                  type="button"
                  className={`fpm-toggle-btn ${csvViewMode === 'raw' ? 'active' : ''}`}
                  onClick={() => setCsvViewMode('raw')}
                  title="Raw View"
                >
                  <FileText size={13} /> Raw
                </button>
              </div>
            )}

            {/* Copy text content */}
            {meta.kind === 'text' && textContent && (
              <button
                type="button"
                className="fpm-action-btn"
                onClick={handleCopyText}
                title="Copy content to clipboard"
              >
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}

            {/* Download file */}
            <button
              type="button"
              className="fpm-action-btn"
              onClick={handleDownload}
              title="Download file to device"
            >
              <Download size={14} />
              <span>Download</span>
            </button>

            {/* Open in new tab */}
            <a
              href={activeUrl}
              target="_blank"
              rel="noreferrer"
              className="fpm-action-btn fpm-open-link"
              title="Open raw file in new browser tab"
            >
              <ExternalLink size={14} />
              <span>Open in tab</span>
            </a>

            {/* Close */}
            <button
              type="button"
              className="fpm-close-btn"
              onClick={onClose}
              aria-label="Close preview modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body Viewer */}
        <div className="fpm-body">
          {/* Floating Edge Arrows for Quick Navigation */}
          {hasMultiple && currentIndex > 0 && (
            <button
              type="button"
              className="fpm-floating-edge fpm-floating-edge--prev"
              onClick={goPrev}
              title="Previous Attachment (ArrowLeft)"
              aria-label="Previous Attachment"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {hasMultiple && currentIndex < activeItems.length - 1 && (
            <button
              type="button"
              className="fpm-floating-edge fpm-floating-edge--next"
              onClick={goNext}
              title="Next Attachment (ArrowRight)"
              aria-label="Next Attachment"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* 1. Images */}
          {meta.kind === 'image' && (
            <div className="fpm-image-stage">
              <img
                src={activeUrl}
                alt={displayName}
                style={{
                  transform: `scale(${scale}) rotate(${rotate}deg)`,
                  transition: 'transform 0.15s ease-out'
                }}
                className="fpm-preview-img"
              />
            </div>
          )}

          {/* 2. PDF */}
          {meta.kind === 'pdf' && (
            <div className="fpm-pdf-frame-wrap">
              <iframe
                src={`${activeUrl}#toolbar=1&navpanes=0`}
                title={displayName}
                className="fpm-pdf-iframe"
              />
            </div>
          )}

          {/* 3. Text / CSV / Log / Code */}
          {meta.kind === 'text' && (
            <div className="fpm-text-wrap">
              {textLoading && (
                <div className="fpm-loading-box">
                  <div className="spinner" />
                  <p>Loading text file content...</p>
                </div>
              )}
              {textError && (
                <div className="fpm-error-box">
                  <AlertCircle size={24} color="#ef4444" />
                  <p>{textError}</p>
                  <a href={activeUrl} target="_blank" rel="noreferrer" className="btn sm">
                    Open File Directly
                  </a>
                </div>
              )}
              {!textLoading && !textError && textContent !== null && (
                <>
                  {parsedCsv && csvViewMode === 'table' ? (
                    <div className="fpm-csv-table-scroll">
                      <table className="fpm-csv-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            {parsedCsv[0]?.map((col, idx) => (
                              <th key={idx}>{col || `Col ${idx + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parsedCsv.slice(1).map((row, rIdx) => (
                            <tr key={rIdx}>
                              <td className="fpm-csv-row-num">{rIdx + 1}</td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="fpm-code-container">
                      <pre className="fpm-code-pre">
                        <code>{textContent}</code>
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* 4. Video */}
          {meta.kind === 'video' && (
            <div className="fpm-media-stage">
              <video
                src={activeUrl}
                controls
                autoPlay
                className="fpm-video-player"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>
          )}

          {/* 5. Audio */}
          {meta.kind === 'audio' && (
            <div className="fpm-audio-stage">
              <div className="fpm-audio-card">
                <div className="fpm-audio-icon-wrap">
                  <Music size={40} color="var(--fpm-accent, #E07820)" />
                </div>
                <h4 className="fpm-audio-title">{displayName}</h4>
                <p className="fpm-audio-sub">Audio Attachment</p>
                <audio
                  src={activeUrl}
                  controls
                  autoPlay
                  className="fpm-audio-player"
                >
                  Your browser does not support HTML5 audio playback.
                </audio>
              </div>
            </div>
          )}

          {/* 6. Word Document (.docx inline viewer) */}
          {meta.kind === 'word' && meta.ext === 'docx' && (
            <DocxViewer
              url={activeUrl}
              displayName={displayName}
              onDownload={handleDownload}
            />
          )}

          {/* 7. Excel Spreadsheet (.xlsx / .xls inline spreadsheet grid) */}
          {meta.kind === 'excel' && (
            <ExcelViewer
              url={activeUrl}
              displayName={displayName}
              onDownload={handleDownload}
            />
          )}

          {/* 8. Legacy Word (.doc) and PowerPoint (.pptx / .ppt) */}
          {((meta.kind === 'word' && meta.ext !== 'docx') || meta.kind === 'powerpoint') && (
            <div className="fpm-doc-stage">
              <div className={`fpm-doc-card fpm-doc-card--${meta.kind}`}>
                <div className="fpm-doc-icon-box">
                  <Icon size={48} />
                </div>
                <div className="fpm-doc-info">
                  <div className="fpm-doc-badge">{meta.label}</div>
                  <h4 className="fpm-doc-title">{displayName}</h4>
                  <p className="fpm-doc-desc">
                    {meta.kind === 'word' && 'Legacy Microsoft Word document (.doc). Download to view with full formatting on your workstation.'}
                    {meta.kind === 'powerpoint' && 'Microsoft PowerPoint presentation (.pptx / .ppt). High-impact training slides and briefings.'}
                  </p>
                </div>

                <div className="fpm-doc-actions">
                  <button type="button" className="fpm-btn-primary" onClick={handleDownload}>
                    <Download size={15} /> Download Document
                  </button>
                  <a href={activeUrl} target="_blank" rel="noreferrer" className="fpm-btn-secondary">
                    <ExternalLink size={15} /> Open in New Tab
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 9. Archive & Other File Types */}
          {['archive', 'file'].includes(meta.kind) && (
            <div className="fpm-doc-stage">
              <div className="fpm-doc-card fpm-doc-card--generic">
                <div className="fpm-doc-icon-box">
                  <Icon size={48} />
                </div>
                <div className="fpm-doc-info">
                  <div className="fpm-doc-badge">{meta.label}</div>
                  <h4 className="fpm-doc-title">{displayName}</h4>
                  <p className="fpm-doc-desc">
                    Binary or compressed archive package. Download to extract and view the contents on your workstation.
                  </p>
                </div>

                <div className="fpm-doc-actions">
                  <button type="button" className="fpm-btn-primary" onClick={handleDownload}>
                    <Download size={15} /> Download {meta.label}
                  </button>
                  <a href={activeUrl} target="_blank" rel="noreferrer" className="fpm-btn-secondary">
                    <ExternalLink size={15} /> Open Link
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Attachment Strip Track */}
        {hasMultiple && (
          <div className="fpm-strip-footer">
            <div className="fpm-strip-label">
              <Layers size={13} />
              <span>QUESTION ATTACHMENTS ({activeItems.length})</span>
            </div>
            <div className="fpm-strip-track">
              {activeItems.map((item, i) => {
                const itemMeta = detectFileType(item.url, item.title)
                const ItemIcon = itemMeta.icon
                const isSel = i === currentIndex
                return (
                  <button
                    key={item.url + i}
                    type="button"
                    className={`fpm-strip-tab ${isSel ? 'selected' : ''}`}
                    onClick={() => setCurrentIndex(i)}
                    title={`Switch to Attachment ${i + 1}: ${item.title}`}
                  >
                    <span className="fpm-strip-badge">#{i + 1}</span>
                    <ItemIcon size={13} style={{ color: itemMeta.color }} />
                    <span className="fpm-strip-title">{item.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
