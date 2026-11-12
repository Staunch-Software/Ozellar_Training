import { useState, useEffect, useRef, useMemo } from 'react'
import {
  X, ExternalLink, Download, ZoomIn, ZoomOut, RotateCw, RotateCcw,
  FileText, Image as ImageIcon, Video, Music, FileSpreadsheet,
  FileArchive, File, Copy, Check, Table, AlertCircle, FileQuestion, Maximize2
} from 'lucide-react'
import './FilePreviewModal.css'

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

export default function FilePreviewModal({ url, title, onClose }) {
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [copied, setCopied] = useState(false)
  const [csvViewMode, setCsvViewMode] = useState('table') // 'table' | 'raw'
  const [textContent, setTextContent] = useState(null)
  const [textLoading, setTextLoading] = useState(false)
  const [textError, setTextError] = useState(null)

  const meta = useMemo(() => detectFileType(url, title), [url, title])
  const displayName = useMemo(() => title || cleanFileName(url), [url, title])
  const Icon = meta.icon

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Reset transforms when url changes
  useEffect(() => {
    setScale(1)
    setRotate(0)
    setTextContent(null)
    setTextError(null)
  }, [url])

  // If text file or CSV, load content
  useEffect(() => {
    if (meta.kind === 'text' && url) {
      setTextLoading(true)
      setTextError(null)
      fetch(url)
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
  }, [meta.kind, url])

  const handleDownload = async () => {
    if (!url) return
    try {
      const res = await fetch(url)
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
      window.open(url, '_blank')
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

  if (!url) return null

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
          </div>

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
              href={url}
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
          {/* 1. Images */}
          {meta.kind === 'image' && (
            <div className="fpm-image-stage">
              <img
                src={url}
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
                src={`${url}#toolbar=1&navpanes=0`}
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
                  <a href={url} target="_blank" rel="noreferrer" className="btn sm">
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
                src={url}
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
                  src={url}
                  controls
                  autoPlay
                  className="fpm-audio-player"
                >
                  Your browser does not support HTML5 audio playback.
                </audio>
              </div>
            </div>
          )}

          {/* 6. Office Documents (Word, Excel, PowerPoint) */}
          {['word', 'excel', 'powerpoint'].includes(meta.kind) && (
            <div className="fpm-doc-stage">
              <div className={`fpm-doc-card fpm-doc-card--${meta.kind}`}>
                <div className="fpm-doc-icon-box">
                  <Icon size={48} />
                </div>
                <div className="fpm-doc-info">
                  <div className="fpm-doc-badge">{meta.label}</div>
                  <h4 className="fpm-doc-title">{displayName}</h4>
                  <p className="fpm-doc-desc">
                    {meta.kind === 'word' && 'Microsoft Word document (.docx / .doc). Complete formatted document with rich text, tables, and attachments.'}
                    {meta.kind === 'excel' && 'Microsoft Excel spreadsheet (.xlsx / .xls). Structured workbook with financial or operational data tables.'}
                    {meta.kind === 'powerpoint' && 'Microsoft PowerPoint presentation (.pptx / .ppt). High-impact training slides and briefings.'}
                  </p>
                </div>

                <div className="fpm-doc-actions">
                  <button type="button" className="fpm-btn-primary" onClick={handleDownload}>
                    <Download size={15} /> Download Document
                  </button>
                  <a href={url} target="_blank" rel="noreferrer" className="fpm-btn-secondary">
                    <ExternalLink size={15} /> Open in New Tab
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 7. Archive & Other File Types */}
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
                  <a href={url} target="_blank" rel="noreferrer" className="fpm-btn-secondary">
                    <ExternalLink size={15} /> Open Link
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
