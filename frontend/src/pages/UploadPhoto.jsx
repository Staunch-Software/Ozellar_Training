import { useState, useRef } from 'react'
import { Camera, Upload, AlertCircle } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { uploadCrewPhoto } from '../api.js'

export default function UploadPhoto() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  const submit = async () => {
    if (!file) {
      setError('Please select a photo first')
      return
    }
    setBusy(true)
    setError('')
    try {
      await uploadCrewPhoto(file)
      // Force a full reload so the app re-fetches /auth/me and sees hasPhoto=true
      window.location.href = '/my-courses'
    } catch (err) {
      setError(err.message || 'Failed to upload photo')
      setBusy(false)
    }
  }

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file (JPG or PNG)')
      return
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('File is too large (max 5MB)')
      return
    }
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setError('')
  }

  return (
    <>
      <TopNav />
      <div className="page" style={{ maxWidth: 600, margin: '40px auto' }}>
        <div style={{ padding: 32, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', textAlign: 'center' }}>
          <Camera size={48} style={{ color: 'var(--primary)', marginBottom: 16 }} />
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Upload Passport Photo</h1>
          <p style={{ color: 'var(--text-dim)', marginBottom: 24 }}>
            Before you continue, please upload a clear passport-size photo. 
            This photo will be placed on your course certificates.
          </p>

          <div 
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 8,
              padding: preview ? 8 : 40,
              cursor: 'pointer',
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 200,
              background: 'var(--bg)'
            }}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 4 }} />
            ) : (
              <>
                <Upload size={24} style={{ color: 'var(--text-dim)', marginBottom: 12 }} />
                <span style={{ color: 'var(--text-dim)' }}>Click to browse photos (JPG/PNG)</span>
              </>
            )}
            <input 
              type="file" 
              accept="image/*" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleFile} 
            />
          </div>

          {error && <div className="form-error" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><AlertCircle size={15} /> {error}</div>}

          <button 
            className="btn primary" 
            style={{ width: '100%', padding: '12px 0', fontSize: 16 }}
            disabled={!file || busy}
            onClick={submit}
          >
            {busy ? 'Uploading...' : 'Save and Continue'}
          </button>
        </div>
      </div>
    </>
  )
}
