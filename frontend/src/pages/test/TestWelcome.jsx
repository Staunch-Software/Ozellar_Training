import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth.jsx'
import * as api from '../../api.js'
import {
  Camera, Clock, Target, ChevronRight, Upload, CheckCircle,
  AlertTriangle, Layers, Anchor, FileText, Wifi, RotateCcw, Undo2, Lock,
  ShieldCheck, BookOpen, Award,
} from 'lucide-react'

const RULES = [
  { icon: Wifi,       text: 'Ensure a stable internet connection before starting the assessment.' },
  { icon: Camera,     text: 'Upload a clear, recent passport-size photograph for identity verification.' },
  { icon: Lock,       text: 'Complete every required field in Personal Details before moving on — once you leave that section, you cannot come back to it.' },
  { icon: Undo2,      text: 'After Personal Details, you can move freely between question sections, in any order, any time before you submit.' },
  { icon: Clock,      text: 'The countdown starts immediately upon clicking "Begin Assessment".' },
  { icon: RotateCcw,  text: 'Refreshing the browser will NOT reset your timer — progress is auto-saved.' },
  { icon: FileText,   text: 'Marking: +4 for correct, −1 for incorrect, 0 for unanswered.' },
]

export default function TestWelcome() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  const [photo,         setPhoto]         = useState(null)
  const [preview,       setPreview]       = useState(null)
  const [photoUploaded, setPhotoUploaded] = useState(false)
  const [userHasPhoto,  setUserHasPhoto]  = useState(user?.hasPhoto || false)
  const [uploading,     setUploading]     = useState(false)
  const [uploadError,   setUploadError]   = useState('')
  const [starting,      setStarting]      = useState(false)
  const [testData,      setTestData]      = useState(null)
  const [dragOver,      setDragOver]      = useState(false)
  const [activeTab,     setActiveTab]     = useState('Overview')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (user?.status === 'submitted') { navigate('/test/result', { replace: true }); return }
    api.screeningGetTest().then(d => setTestData(d)).catch(() => {})
  }, [])

  const handleFile = file => {
    if (!file || !file.type.startsWith('image/')) return
    setPhoto(file); setPreview(URL.createObjectURL(file))
    setPhotoUploaded(false); setUserHasPhoto(false); setUploadError('')
  }

  const uploadPhoto = async () => {
    if (!photo) return
    setUploading(true); setUploadError('')
    try { await api.screeningUploadPhoto(photo); setPhotoUploaded(true) }
    catch (err) { setUploadError(err.message || 'Upload failed') }
    finally { setUploading(false) }
  }

  const handleStart = async () => {
    if (!photoUploaded && !userHasPhoto && photo) await uploadPhoto()
    if (!photoUploaded && !userHasPhoto) return
    setStarting(true)
    try { await api.screeningStart(); navigate('/test/exam') }
    catch (err) { console.error(err); setStarting(false) }
  }

  const hasPhotoReady = photoUploaded || userHasPhoto
  const timerMins    = testData?.timerMinutes || 80
  const sectionCount = (testData?.sections || []).length || 6
  const totalQ       = (testData?.sections || []).reduce((s, sec) => s + (sec.questions?.length || 0), 0)
  const cs           = testData?.correctScore || 4
  const wp           = testData?.wrongPenalty || 1

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f0f2f5', fontFamily: '"Inter", system-ui, sans-serif', color: '#16181d', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .tw-photo-zone:hover { border-color: #60a5fa !important; background: rgba(255, 255, 255, 0.1) !important; }
        .tw-photo-zone { transition: border-color .2s, background .2s; }
        .tw-start-btn:hover:not(:disabled) { background: #1d4ed8 !important; box-shadow: 0 8px 24px rgba(37,99,235,.45) !important; transform: translateY(-1px); }
        .tw-start-btn { transition: all .2s; }
        .tw-upload-btn:hover:not(:disabled) { background: #1d4ed8 !important; }
        .tw-upload-btn { transition: background .15s; }
        .tw-rule-row:hover { background: #f8f9fc !important; }
        .tw-rule-row { transition: background .15s; }
        @keyframes tw-in { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tw-slide-right { from { opacity:0; transform:translateX(20px) } to { opacity:1; transform:translateX(0) } }
      `}</style>

      {/* ── Header ── */}
      <header style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #e5e7eb', height: 58, display: 'flex', alignItems: 'center', padding: '0 32px', gap: 0, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #2563eb, #1e40af)', display: 'grid', placeItems: 'center' }}>
            <Anchor size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '.1em', textTransform: 'uppercase' }}>Ozellar Marine</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginTop: -1 }}>Assessment Portal</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 24 }}>
          {/* Empty spacer where tabs used to be, to keep layout balanced */}
        </div>

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 99, border: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #1e40af)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'C'}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{user?.name || 'Candidate'}</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ════ LEFT PANEL — Identity + Stats ════ */}
        <div style={{ width: 400, flexShrink: 0, background: 'linear-gradient(160deg, #1e3a8a 0%, #1e40af 45%, #2563eb 100%)', display: 'flex', flexDirection: 'column', padding: '36px 32px', gap: 0, overflowY: 'auto', position: 'relative' }}>
          {/* Subtle grid pattern */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />
          
          {/* Welcome text */}
          <div style={{ position: 'relative', marginBottom: 28, animation: 'tw-in .5s ease-out' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>Engine Cadet Assessment</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-.02em', lineHeight: 1.25 }}>
              Welcome,<br />{user?.name?.split(' ')[0] || 'Candidate'}
            </h2>
            <p style={{ margin: '10px 0 0', color: 'rgba(255,255,255,.65)', fontSize: 13.5, lineHeight: 1.7 }}>
              Complete your identity verification and review the test details before you begin.
            </p>
          </div>

          {/* ── Photo Upload ── */}
          <div style={{ position: 'relative', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)', borderRadius: 18, padding: 22, marginBottom: 20, backdropFilter: 'blur(8px)', animation: 'tw-in .55s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Camera size={15} color="rgba(255,255,255,.7)" />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Identity Photo</span>
              {hasPhotoReady && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#34d399', background: 'rgba(52,211,153,.15)', border: '1px solid rgba(52,211,153,.3)', padding: '2px 8px', borderRadius: 20 }}>
                  <CheckCircle size={10} /> Verified
                </span>
              )}
            </div>

            {/* Photo zone */}
            {hasPhotoReady && !preview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.25)', borderRadius: 12 }}>
                <CheckCircle size={22} color="#34d399" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#34d399', fontWeight: 700, fontSize: 13 }}>Photo on record</div>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginTop: 2 }}>Identity verified — you may proceed</div>
                </div>
                <button onClick={() => { setPhotoUploaded(false); setUserHasPhoto(false); setPreview(null); setPhoto(null); }}
                  style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={e => handleFile(e.target.files[0])} accept="image/*" style={{ display: 'none' }} />
                
                {/* Large drop target */}
                <div
                  className="tw-photo-zone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
                  style={{
                    border: `2px dashed ${dragOver ? '#60a5fa' : preview ? '#60a5fa' : 'rgba(255,255,255,.3)'}`,
                    borderRadius: 14, cursor: 'pointer', textAlign: 'center',
                    background: dragOver ? 'rgba(96,165,250,.1)' : 'rgba(255,255,255,.04)',
                    padding: preview ? 14 : '28px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {preview ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <img src={preview} alt="Preview" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid #60a5fa', boxShadow: '0 0 0 4px rgba(96,165,250,.2)', flexShrink: 0 }} />
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#fff' }}>Photo ready</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>Click to change image</div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(255,255,255,.1)', display: 'grid', placeItems: 'center', margin: '0 auto 10px', color: 'rgba(255,255,255,.5)' }}>
                        <Upload size={22} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'rgba(255,255,255,.85)', marginBottom: 4 }}>Drag & drop or click to upload</div>
                      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.45)' }}>JPG, PNG, WEBP · Max 5 MB · Passport-size</div>
                    </div>
                  )}
                </div>

                {preview && !photoUploaded && (
                  <button className="tw-upload-btn" onClick={uploadPhoto} disabled={uploading}
                    style={{ width: '100%', marginTop: 12, padding: '11px', borderRadius: 11, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {uploading ? 'Uploading…' : 'Confirm & Upload Photo'}
                  </button>
                )}
                {photoUploaded && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                    <CheckCircle size={14} /> Photo uploaded successfully
                  </div>
                )}
                {uploadError && (
                  <div style={{ marginTop: 10, padding: '9px 13px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, color: '#fca5a5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <AlertTriangle size={13} /> {uploadError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Stats grid ── */}
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, animation: 'tw-in .6s ease-out' }}>
            {[
              { label: 'Duration',  value: `${timerMins} min`,   icon: Clock,  color: '#60a5fa' },
              { label: 'Sections',  value: sectionCount,          icon: Layers, color: '#a78bfa' },
              { label: 'Correct',   value: `+${cs} pts`,          icon: Target, color: '#34d399' },
              { label: 'Incorrect', value: `−${wp} pt`,           icon: AlertTriangle, color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(4px)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <s.icon size={13} color={s.color} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,.45)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, letterSpacing: '-.01em' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* ── Spacer + Begin button ── */}
          <div style={{ position: 'relative', marginTop: 'auto', paddingTop: 24 }}>
            <button
              className="tw-start-btn"
              onClick={handleStart}
              disabled={!hasPhotoReady || starting}
              style={{
                width: '100%', padding: '15px 24px', borderRadius: 14, border: 'none', fontFamily: 'inherit',
                background: hasPhotoReady ? '#2563eb' : 'rgba(255,255,255,.12)',
                color: hasPhotoReady ? '#fff' : 'rgba(255,255,255,.35)',
                fontWeight: 800, fontSize: 16, cursor: hasPhotoReady ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: hasPhotoReady ? '0 4px 20px rgba(37,99,235,.5)' : 'none',
              }}>
              {starting ? 'Starting Assessment…' : hasPhotoReady
                ? <><span>Begin Assessment</span><ChevronRight size={20} /></>
                : 'Upload Photo to Continue'}
            </button>
            {!hasPhotoReady && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,.35)', fontSize: 12, margin: '10px 0 0' }}>
                Identity photo required to unlock the assessment
              </p>
            )}
          </div>
        </div>

        {/* ════ RIGHT PANEL — Test Info + Rules ════ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 24, animation: 'tw-slide-right .5s ease-out' }}>

          {/* Overview cards */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>Test Overview</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {[
                { label: 'Test Title',     value: testData?.title || 'Engine Cadet Assessment', span: 3 },
                { label: 'Total Duration', value: `${timerMins} minutes` },
                { label: 'Total Sections', value: sectionCount },
                { label: 'Total Questions', value: totalQ || '—' },
                { label: 'Max Score',      value: totalQ ? `${totalQ * cs} pts` : '—' },
                { label: 'Correct Answer', value: `+${cs} marks` },
                { label: 'Wrong Answer',   value: `−${wp} mark` },
              ].map(r => (
                <div key={r.label} style={{ gridColumn: r.span ? `span ${r.span}` : undefined, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>{r.label}</div>
                  <div style={{ fontSize: r.span ? 15 : 17, fontWeight: 800, color: '#111827' }}>{r.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Rules */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
              <Award size={13} /> Instructions & Rules
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
              {RULES.map((r, i) => (
                <div key={i} className="tw-rule-row"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 20px', borderBottom: i < RULES.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: '#eff6ff', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1 }}>
                    <r.icon size={14} color="#2563eb" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#f0f2f5', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, color: '#6b7280', flexShrink: 0, marginTop: 2 }}>{i + 1}</div>
                    <span style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65 }}>{r.text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{ display: 'flex', gap: 12, padding: '14px 18px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14 }}>
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.7 }}>
              <strong>Important:</strong> Once you begin the assessment, the timer cannot be paused. Ensure you are in a quiet environment with a reliable internet connection. Any attempt to use external resources may result in disqualification.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
