import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth.jsx'
import * as api from '../../api.js'
import {
  Camera, Clock, Target, ChevronRight, Upload, CheckCircle,
  AlertTriangle, Layers, Anchor, FileText, Wifi, RotateCcw, Undo2, Lock,
  ShieldCheck, BookOpen, Award, Video, UserCheck, UserX, Monitor
} from 'lucide-react'

const RULES = [
  { icon: Wifi,       text: 'Ensure a stable internet connection before starting the assessment.' },
  { icon: Camera,     text: 'Upload or capture a clear, recent passport-size photograph with your face clearly visible for identity verification.' },
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
  
  // Camera & Face Detection State
  const [captureMode,   setCaptureMode]   = useState('upload') // 'upload' | 'camera'
  const [cameraActive,  setCameraActive]  = useState(false)
  const [faceStatus,    setFaceStatus]    = useState('searching') // 'searching', 'multiple', 'off-center', 'too-far', 'good'
  const [modelLoaded,   setModelLoaded]   = useState(false)
  const [modelLoading,  setModelLoading]  = useState(false)

  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectionIntervalRef = useRef(null)

  useEffect(() => {
    if (user?.status === 'submitted') { navigate('/test/result', { replace: true }); return }
    api.screeningGetTest().then(d => setTestData(d)).catch(() => {})

    return () => stopCamera()
  }, [])

  const loadFaceApiModels = async () => {
    if (window.faceapi && modelLoaded) return true;
    if (modelLoading) return false;
    setModelLoading(true);

    try {
      if (!window.faceapi) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }
      
      await window.faceapi.nets.tinyFaceDetector.loadFromUri('https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/');
      setModelLoaded(true);
      return true;
    } catch (err) {
      console.error('Failed to load face-api', err);
      setUploadError('Failed to load face detection model. Please use upload mode.');
      return false;
    } finally {
      setModelLoading(false);
    }
  }

  const startCamera = async () => {
    setUploadError('');
    setPhotoUploaded(false);
    setUserHasPhoto(false);
    setPreview(null);
    setPhoto(null);
    
    const loaded = await loadFaceApiModels();
    if (!loaded) {
      setCaptureMode('upload');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraActive(true);
      setCaptureMode('camera');
    } catch (err) {
      console.error('Camera error:', err);
      setUploadError('Failed to access camera. Please allow permissions or use upload.');
      setCaptureMode('upload');
    }
  }

  useEffect(() => {
    if (captureMode === 'camera' && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }
  }, [captureMode]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (detectionIntervalRef.current) {
      if (typeof detectionIntervalRef.current.stop === 'function') {
        detectionIntervalRef.current.stop();
      } else {
        clearInterval(detectionIntervalRef.current);
      }
      detectionIntervalRef.current = null;
    }
    setCameraActive(false);
    setFaceStatus('searching');
  }

  const handleVideoPlay = () => {
    if (!videoRef.current || !canvasRef.current || !window.faceapi) return;
    
    let isDetecting = true;
    detectionIntervalRef.current = { stop: () => { isDetecting = false; } };
    
    const detect = async () => {
      if (!isDetecting || !videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        const detections = await window.faceapi.detectAllFaces(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
        
        if (!isDetecting) return;

        if (detections && detections.length > 0) {
          if (canvasRef.current && videoRef.current) {
            const dims = window.faceapi.matchDimensions(canvasRef.current, videoRef.current, true);
            const resizedResults = window.faceapi.resizeResults(detections, dims);
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            window.faceapi.draw.drawDetections(canvasRef.current, resizedResults);
            
            if (detections.length > 1) {
              setFaceStatus('multiple');
            } else {
              const face = resizedResults[0].box;
              const vW = dims.width;
              const vH = dims.height;
              
              const faceCenterX = face.x + (face.width / 2);
              const faceCenterY = face.y + (face.height / 2);
              
              const isCenteredX = Math.abs(faceCenterX - vW/2) < vW * 0.2;
              const isCenteredY = Math.abs(faceCenterY - vH/2) < vH * 0.2;
              const isRightSize = face.height > vH * 0.25 && face.height < vH * 0.8;
              
              if (!isCenteredX || !isCenteredY) {
                setFaceStatus('off-center');
              } else if (!isRightSize) {
                setFaceStatus('too-far');
              } else {
                setFaceStatus('good');
              }
            }
          }
        } else {
          setFaceStatus('searching');
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      } catch (err) {
        console.error("Face detection error:", err);
      }
      
      if (isDetecting) {
        setTimeout(() => requestAnimationFrame(detect), 100);
      }
    };
    
    detect();
  }

  const capturePhoto = () => {
    if (!videoRef.current || faceStatus !== 'good') return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    
    // Draw flipped horizontally (mirror) since user-facing camera is mirrored
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(blob => {
      const file = new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
      setPhoto(file);
      
      // We flip the preview back so it looks right
      const previewCanvas = document.createElement('canvas');
      previewCanvas.width = canvas.width;
      previewCanvas.height = canvas.height;
      const pCtx = previewCanvas.getContext('2d');
      pCtx.translate(previewCanvas.width, 0);
      pCtx.scale(-1, 1);
      pCtx.drawImage(canvas, 0, 0);
      setPreview(previewCanvas.toDataURL('image/jpeg'));
      
      setCaptureMode('upload');
      stopCamera();
    }, 'image/jpeg', 0.9);
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && captureMode === 'camera' && faceStatus === 'good') {
        e.preventDefault();
        capturePhoto();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

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
    <>
    <div style={{ minHeight: '100vh', height: '100%', display: 'flex', flexDirection: 'column', background: '#f0f2f5', fontFamily: '"Inter", system-ui, sans-serif', color: '#16181d', overflow: 'auto' }}>
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

        /* ── Mobile: stack panels instead of a fixed 400px row ── */
        @media (max-width: 900px) {
          .tw-body {
            flex-direction: column !important;
            height: auto !important;
            overflow: visible !important;
          }
          .tw-left-panel {
            width: 100% !important;
            flex: none !important;
            overflow-y: visible !important;
          }
          .tw-right-panel {
            flex: none !important;
            overflow-y: visible !important;
          }
        }
        @media (max-width: 640px) {
          .tw-overview-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 640px) {
          .tw-overview-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .tw-header { padding: 0 14px !important; }
          .tw-header-spacer { display: none !important; }
          .tw-left-panel { padding: 28px 20px !important; }
          .tw-right-panel { padding: 22px 16px !important; }
          .tw-overview-grid { grid-template-columns: 1fr !important; gap: 10px !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="tw-header" style={{ flexShrink: 0, background: '#fff', borderBottom: '1px solid #e5e7eb', minHeight: 58, display: 'flex', alignItems: 'center', padding: '0 32px', flexWrap: 'wrap', gap: 0, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto', minWidth: 0, overflow: 'hidden' }}>
  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #2563eb, #1e40af)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
    <Anchor size={17} color="#fff" />
  </div>
  <div style={{ minWidth: 0, overflow: 'hidden' }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', letterSpacing: '.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Ozellar Marine</div>
    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginTop: -1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Assessment Portal</div>
  </div>
</div>

        <div className="tw-header-spacer" style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 24 }}>
          {/* Empty spacer where tabs used to be, to keep layout balanced */}
        </div>

        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px', borderRadius: 99, border: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #2563eb, #1e40af)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
            {user?.name?.charAt(0)?.toUpperCase() || 'C'}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{user?.name || 'Candidate'}</span>
        </div>
      </header>

      {/* ── Body ── */}
       <div className="tw-body" style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ════ LEFT PANEL — Identity + Stats ════ */}
        <div className="tw-left-panel" style={{ width: 400, flexShrink: 0, background: 'linear-gradient(160deg, #1e3a8a 0%, #1e40af 45%, #2563eb 100%)', display: 'flex', flexDirection: 'column', padding: '36px 32px', gap: 0, overflowY: 'auto', position: 'relative' }}>
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

            {/* Mode Toggle */}
            {!hasPhotoReady && (
              <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,.2)', padding: 4, borderRadius: 10, marginBottom: 16 }}>
                <button
                  onClick={() => { setCaptureMode('upload'); stopCamera(); }}
                  style={{ flex: 1, padding: '8px', border: 'none', background: captureMode === 'upload' ? 'rgba(255,255,255,.15)' : 'transparent', color: captureMode === 'upload' ? '#fff' : 'rgba(255,255,255,.5)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  Upload File
                </button>
                <button
                  onClick={startCamera}
                  style={{ flex: 1, padding: '8px', border: 'none', background: captureMode === 'camera' ? 'rgba(255,255,255,.15)' : 'transparent', color: captureMode === 'camera' ? '#fff' : 'rgba(255,255,255,.5)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Video size={14} /> Camera
                </button>
              </div>
            )}

            {/* Photo zone */}
            {hasPhotoReady && !preview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'rgba(52,211,153,.1)', border: '1px solid rgba(52,211,153,.25)', borderRadius: 12 }}>
                <CheckCircle size={22} color="#34d399" />
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#34d399', fontWeight: 700, fontSize: 13 }}>Photo on record</div>
                  <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginTop: 2 }}>Identity verified — you may proceed</div>
                </div>
                <button onClick={() => { setPhotoUploaded(false); setUserHasPhoto(false); setPreview(null); setPhoto(null); setCaptureMode('upload'); }}
                  style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Change
                </button>
              </div>
            ) : captureMode === 'camera' ? (
              <div style={{ padding: '24px 20px', textAlign: 'center', background: 'rgba(0,0,0,0.15)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.1)' }}>
                <Video size={36} color="rgba(255,255,255,0.6)" style={{ margin: '0 auto 12px' }} />
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Camera is Active</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Please look at the center of your screen to capture your photo.</div>
                <button
                  onClick={() => { stopCamera(); setCaptureMode('upload'); }}
                  style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.1)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  Close Camera
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
        <div className="tw-right-panel" style={{ flex: 1, overflowY: 'auto', padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 24, animation: 'tw-slide-right .5s ease-out' }}>

          {/* Overview cards */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 14 }}>Test Overview</div>
             <div className="tw-overview-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
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

          {/* Prerequisites Banner */}
          <div style={{ display: 'flex', gap: 12, padding: '16px 20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 14 }}>
            <FileText size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 14, marginBottom: 4 }}>Information Required</div>
              <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                You will need to fill out your <strong>Personal Details</strong> before starting the exam. Please have the following information ready:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, color: '#1e40af' }}>
                  <li style={{ marginBottom: 4 }}><strong>Pre-Sea Training Details:</strong> Institute name, Year of Passing, and % or CGPA</li>
                  <li style={{ marginBottom: 4 }}><strong>Class 12 Marks:</strong> PCM % and English %</li>
                  <li><strong>Other:</strong> Preferred Ship Type & Family details</li>
                </ul>
              </p>
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
      {/* ── Camera Modal Overlay ── */}
      {captureMode === 'camera' && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
          <div style={{ background: '#111827', padding: 24, borderRadius: 24, width: '100%', maxWidth: 500, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', animation: 'tw-in 0.3s ease-out' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Camera size={18} color="#60a5fa" /> Take your photo
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 12 }}>
                Look straight at the camera
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', borderRadius: 16, overflow: 'hidden', background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.1)' }}>
              {modelLoading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 13, fontWeight: 500, zIndex: 10 }}>
                  Loading AI models...
                </div>
              )}
              <div style={{ position: 'relative', width: '100%', paddingTop: '75%' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onPlay={handleVideoPlay}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
                <canvas
                  ref={canvasRef}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, transform: 'scaleX(-1)' }}
                />
                
                {cameraActive && (() => {
                  let text = 'Searching for face...';
                  let color = 'rgba(239, 68, 68, 0.9)';
                  let Icon = UserX;
                  
                  if (faceStatus === 'good') {
                    text = 'Perfect! Capture Now';
                    color = 'rgba(16, 185, 129, 0.9)';
                    Icon = UserCheck;
                  } else if (faceStatus === 'multiple') {
                    text = 'Multiple faces! Only you allowed.';
                    color = 'rgba(239, 68, 68, 0.9)';
                  } else if (faceStatus === 'off-center') {
                    text = 'Center your face in frame';
                    color = 'rgba(245, 158, 11, 0.9)';
                  } else if (faceStatus === 'too-far') {
                    text = 'Adjust distance for passport size';
                    color = 'rgba(245, 158, 11, 0.9)';
                  }
                  
                  return (
                    <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', alignItems: 'center', gap: 6, background: color, color: '#fff', padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', transition: 'background 0.3s', whiteSpace: 'nowrap' }}>
                      <Icon size={16} /> {text}
                    </div>
                  )
                })()}
              </div>
            </div>
            
            <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
              <button
                onClick={() => { stopCamera(); setCaptureMode('upload'); }}
                style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background 0.2s' }}
              >
                Cancel
              </button>
              <button
                onClick={capturePhoto}
                disabled={faceStatus !== 'good'}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: faceStatus === 'good' ? '#2563eb' : 'rgba(255,255,255,.1)', color: faceStatus === 'good' ? '#fff' : 'rgba(255,255,255,.3)', fontWeight: 700, fontSize: 15, cursor: faceStatus === 'good' ? 'pointer' : 'not-allowed', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Camera size={18} /> Capture Photo (Press Enter)
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  )
}
