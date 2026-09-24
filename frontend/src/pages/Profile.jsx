import { useState, useEffect, useRef } from 'react'
import { Camera, Upload, AlertCircle, User as UserIcon } from 'lucide-react'
import { TopNav } from '../App.jsx'
import { useAuth } from '../auth.jsx'
import { getCrewPhoto, uploadCrewPhoto } from '../api.js'

export default function Profile() {
  const { user } = useAuth()
  const [photoUrl, setPhotoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (user?.hasPhoto) {
      getCrewPhoto()
        .then(setPhotoUrl)
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [user])

  const submit = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await uploadCrewPhoto(file)
      window.location.reload()
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

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const Field = ({ label, value }) => {
    if (!value) return null
    return (
      <div style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{value}</div>
      </div>
    )
  }

  const SectionCard = ({ title, children }) => (
    <div style={{ 
      background: 'var(--surface)', 
      border: '1px solid var(--border)', 
      borderRadius: 'var(--radius-lg)', 
      padding: 24,
      marginBottom: 24,
      boxShadow: 'var(--shadow-sm)'
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
        {title}
      </h2>
      {children}
    </div>
  )

  return (
    <>
      <TopNav />
     <div className="page" style={{ margin: '0 auto', padding: '40px 20px' }}>
        
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>Profile Settings</h1>
          <div className="mut" style={{ fontSize: 14 }}>Manage your account details and certificate photograph.</div>
        </div>

        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          
          {/* Left Column: Photo & Basic Identity */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <div style={{ 
              background: 'var(--surface)', 
              border: '1px solid var(--border)', 
              borderRadius: 'var(--radius-lg)', 
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center'
            }}>
              
              <div style={{ 
                width: 140, 
                height: 140, 
                borderRadius: '50%', 
                background: 'var(--surface-3)', 
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                border: '1px solid var(--border)'
              }}>
                {loading ? (
                  <span className="spinner" />
                ) : preview ? (
                  <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : photoUrl ? (
                  <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserIcon size={48} className="faint" strokeWidth={1.5} />
                )}
              </div>

              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{user?.name}</div>
              <div className="mut" style={{ fontSize: 13, marginBottom: 24 }}>{user?.rank || 'Crew Member'}</div>

              {/* Upload Action */}
              <div style={{ width: '100%' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={handleFile} 
                />
                
                {!file ? (
                  <button 
                    className="btn block" 
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera size={16} /> {photoUrl ? 'Change Photo' : 'Upload Photo'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button 
                      className="btn primary block" 
                      onClick={submit} 
                      disabled={busy}
                    >
                      {busy ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Upload size={16} />} 
                      {busy ? 'Saving...' : 'Save Photo'}
                    </button>
                    <button 
                      className="btn block" 
                      onClick={() => { setFile(null); setPreview(null); setError('') }} 
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                
                {error && (
                  <div style={{ marginTop: 12, padding: 8, background: 'var(--danger-weak)', color: 'var(--danger)', borderRadius: 'var(--radius)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
                  </div>
                )}
                
                <div className="faint" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.4 }}>
                  JPG or PNG up to 5MB. Must be a clear, passport-style photograph.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Detailed Info Grid */}
          <div style={{ flexGrow: 1, minWidth: 300 }}>
            
            <SectionCard title="Identity Details">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Crew ID" value={user?.crewId} />
                <Field label="Nationality" value={user?.nationality} />
                <Field label="Passport Number" value={user?.ppNo} />
                <Field label="Seaman Book Number" value={user?.seamenBookNo} />
                <Field label="Date of Birth" value={formatDate(user?.dateOfBirth)} />
              </div>
            </SectionCard>

            {(user?.empStatus || user?.currentVessel || user?.signOnDate || user?.reliefDate) && (
              <SectionCard title="Professional Status">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {user?.empStatus && (
                    <div style={{ marginBottom: 16 }}>
                      <div className="eyebrow" style={{ marginBottom: 4 }}>SmartPAL Status</div>
                      <div style={{ 
                        display: 'inline-block', 
                        padding: '2px 8px', 
                        background: user.empStatus === 'SAIL' ? 'var(--success-weak)' : 'var(--surface-3)', 
                        color: user.empStatus === 'SAIL' ? 'var(--success)' : 'var(--text-mut)', 
                        borderRadius: 4, 
                        fontSize: 12, 
                        fontWeight: 600 
                      }}>
                        {user.empStatus}
                      </div>
                    </div>
                  )}
                  <Field label="Current Vessel" value={user?.currentVessel} />
                  <Field label="Sign On Date" value={formatDate(user?.signOnDate)} />
                  <Field label="Relief Date" value={formatDate(user?.reliefDate)} />
                </div>
              </SectionCard>
            )}

          </div>

        </div>
      </div>
    </>
  )
}
