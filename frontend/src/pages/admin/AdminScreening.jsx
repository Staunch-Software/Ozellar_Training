import { useState, useEffect, useRef } from 'react'
import {
  ClipboardList, Plus, Trash2, Edit3, Users, BarChart3,
  Download, ChevronRight, ChevronDown, CheckCircle2, Clock,
  AlertTriangle, X, Save, Eye, EyeOff, BookOpen, Layers,
  User, Phone, ToggleLeft, ToggleRight, RefreshCw,
  TrendingUp, Award, Search, Filter, Image as ImageIcon, Upload,
} from 'lucide-react'
import * as api from '../../api.js'

/* ── Design Tokens ── */
const C = {
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  border: 'var(--border)',
  text: 'var(--text)',
  mut: 'var(--text-mut)',
  accent: 'var(--accent)',
}

const STATUS = {
  pending:     { label:'Pending',     color:'#6366f1', bg:'rgba(99,102,241,0.1)', border:'rgba(99,102,241,0.25)' },
  in_progress: { label:'In Progress', color:'#f59e0b', bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.25)' },
  submitted:   { label:'Submitted',   color:'#10b981', bg:'rgba(16,185,129,0.1)', border:'rgba(16,185,129,0.25)' },
}

const chip = (status) => {
  const s = STATUS[status] || { label:status, color:'#64748b', bg:'rgba(100,116,139,0.1)', border:'rgba(100,116,139,0.2)' }
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 11px', borderRadius:20, fontSize:12, fontWeight:700, color:s.color, background:s.bg, border:`1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}

function fmtDt(iso) {
  if (!iso) return '—'
  try {
    // The backend stores naive IST wall-clock datetimes and serialises them
    // via .isoformat() without a timezone suffix. A suffix-free string is
    // parsed by JS as *the viewer's own browser/OS timezone*, not the
    // server's — so on any admin machine not itself set to IST this used to
    // render the wrong time (e.g. shifted by the viewer's UTC offset).
    // Attaching the +05:30 offset explicitly makes the instant unambiguous
    // regardless of the viewing browser's local timezone.
    const withOffset = /[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}+05:30`
    return new Date(withOffset).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    }) + ' IST'
  }
  catch { return iso }
}

function Card({ children, style={} }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, ...style }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.07em', textTransform:'uppercase', color:'var(--text-faint)', marginBottom:10 }}>{children}</div>
}

function Input({ label, ...props }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {label && <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>{label}</label>}
      <input {...props} style={{ width:'100%', padding:'9px 13px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border .15s', ...(props.style||{}) }}
        onFocus={e => e.target.style.borderColor='var(--accent)'}
        onBlur={e => e.target.style.borderColor='var(--border)'}
      />
    </div>
  )
}

// ============================================================
// MODERN SELECT COMPONENT
// ============================================================
function CardSelect({ value, onChange, options, placeholder, icon, required }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  
  useEffect(() => {
    const click = (e) => { if(ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', click)
    return () => document.removeEventListener('mousedown', click)
  }, [])

  const selected = options.find(o => o.id === value)
  const displayLabel = selected ? selected.title : placeholder

  return (
    <div ref={ref} style={{ position:'relative', width:'100%', minWidth:200 }}>
      {required && <select required value={value} onChange={()=>{}} style={{ position:'absolute', opacity:0, pointerEvents:'none', width:1, height:1 }}><option value={value}/></select>}
      
      <button type="button" onClick={() => setOpen(!open)}
        style={{ width:'100%', padding:'10px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13.5, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, cursor:'pointer', outline:'none', boxShadow:'0 2px 5px rgba(0,0,0,.02)', transition:'all .15s', borderColor: open ? 'var(--accent)' : 'var(--border)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:8, color: selected ? 'var(--text)' : 'var(--text-mut)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, fontWeight: selected ? 600 : 500 }}>
          {icon} {displayLabel}
        </span>
        <ChevronDown size={14} style={{ color:'var(--text-mut)', transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink:0 }}/>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:6, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,.1)', zIndex:100, overflow:'hidden', animation:'tw-in .15s ease-out' }}>
          <div style={{ maxHeight:250, overflowY:'auto' }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              style={{ width:'100%', padding:'11px 14px', border:'none', background: value === '' ? 'var(--accent-weak)' : 'transparent', color: value === '' ? 'var(--accent)' : 'var(--text-mut)', fontSize:13.5, textAlign:'left', cursor:'pointer' }}>
              {placeholder}
            </button>
            {options.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false) }}
                style={{ width:'100%', padding:'11px 14px', border:'none', borderTop:'1px solid var(--border)', background: value === o.id ? 'var(--accent-weak)' : 'transparent', color: value === o.id ? 'var(--accent)' : 'var(--text)', fontSize:13.5, textAlign:'left', cursor:'pointer', display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight: value === o.id ? 700 : 500 }}>
                {o.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// CREATE CANDIDATE CARD COMPONENT
// ============================================================
function CreateCandidateCard({ form, setForm, saving, allTests, onCreate, onCancel }) {
  const [showPw, setShowPw] = useState(false)
  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid var(--border)', boxShadow:'0 12px 32px rgba(0,0,0,.08), 0 4px 12px rgba(99,102,241,.06)', animation:'tw-in .3s ease-out' }}>
      <div style={{ background:'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', padding:'20px 24px', borderRadius:'16px 16px 0 0', borderBottom:'1px solid rgba(99,102,241,.15)', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'#4f46e5', display:'grid', placeItems:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(79,70,229,.3)' }}>
          <User size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#312e81', letterSpacing:'-.01em' }}>Add New Candidate</div>
          <div style={{ fontSize:12.5, color:'#4f46e5', marginTop:3, fontWeight:600 }}>Create an account and assign a test</div>
        </div>
      </div>
      <form onSubmit={onCreate} style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <Input label="Full Name *" type="text" placeholder="e.g. Rahul Sharma" required value={form.fullName} onChange={e => setForm(f=>({...f,fullName:e.target.value}))} style={{ padding:'12px 14px', borderRadius:10 }}/>
          <Input label="Mobile Number" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="XXXXXXXXXX" value={form.mobileNumber} onChange={e => setForm(f=>({...f,mobileNumber:e.target.value.replace(/\D/g,'').slice(0,10)}))} style={{ padding:'12px 14px', borderRadius:10 }}/>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>Password *</label>
            <div style={{ position:'relative' }}>
              <input type={showPw?'text':'password'} required value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} placeholder="Set login password"
                style={{ width:'100%', padding:'12px 42px 12px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border .15s' }}
                onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
              <button type="button" onClick={()=>setShowPw(v=>!v)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-mut)', display:'grid', placeItems:'center' }}>
                {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
          </div>
          
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>Assign to Test *</label>
            <CardSelect required value={form.testId} onChange={val => setForm(f=>({...f,testId:val}))} options={allTests} placeholder="Select test…" icon={<BookOpen size={14}/>}/>
          </div>
        </div>

        <div style={{ height:1, background:'#e5e7eb', margin:'8px -24px 0' }}/>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
          <button type="button" onClick={onCancel} style={{ padding:'11px 24px', borderRadius:12, border:'1px solid #d1d5db', background:'#fff', fontWeight:600, color:'#4b5563', cursor:'pointer', fontSize:14, transition:'all .2s' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding:'11px 28px', borderRadius:12, border:'none', background: saving ? '#a5b4fc' : '#4f46e5', color:'#fff', fontWeight:700, fontSize:14, cursor: saving ? 'not-allowed' : 'pointer', transition:'all .2s', boxShadow:'0 4px 14px rgba(79,70,229,.25)' }}>
            {saving ? 'Adding Candidate…' : 'Add Candidate'}
          </button>
        </div>
      </form>
    </div>
  )
}


// ============================================================
// EDIT CANDIDATE CARD COMPONENT
// ============================================================
function EditCandidateCard({ candidate, allTests, onSave, onCancel }) {
  const [fullName, setFullName] = useState(candidate.fullName)
  const [mobileNumber, setMobileNumber] = useState(candidate.mobileNumber || '')
  const [testId, setTestId] = useState(candidate.testId)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  const testChanged = testId !== candidate.testId
  const hasProgress = candidate.status !== 'pending'

  const submit = async (e) => {
    e.preventDefault()
    if (testChanged && hasProgress) {
      const ok = confirm(
        `${candidate.fullName} already has ${candidate.status === 'submitted' ? 'a submitted result' : 'progress'} on "${candidate.testTitle}". ` +
        `Switching to a different test will permanently erase that attempt (score, answers, timings) and reset them to "pending" on the new test. Continue?`
      )
      if (!ok) return
    }
    setSaving(true)
    const patch = { fullName, mobileNumber }
    if (password) patch.password = password
    if (testChanged) patch.testId = testId
    try { await onSave(patch) } finally { setSaving(false) }
  }

  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid var(--border)', boxShadow:'0 12px 32px rgba(0,0,0,.08), 0 4px 12px rgba(79,70,229,.06)', animation:'tw-in .3s ease-out' }}>
      <div style={{ background:'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', padding:'20px 24px', borderRadius:'16px 16px 0 0', borderBottom:'1px solid rgba(99,102,241,.15)', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'#4f46e5', display:'grid', placeItems:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(79,70,229,.3)' }}>
          <Edit3 size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#312e81', letterSpacing:'-.01em' }}>Edit Candidate</div>
          <div style={{ fontSize:12.5, color:'#4f46e5', marginTop:3, fontWeight:600 }}>{candidate.testTitle}</div>
        </div>
      </div>
      <form onSubmit={submit} style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
          <Input label="Full Name *" type="text" required value={fullName} onChange={e => setFullName(e.target.value)} style={{ padding:'12px 14px', borderRadius:10 }}/>
          <Input label="Mobile Number" type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={mobileNumber} onChange={e => setMobileNumber(e.target.value.replace(/\D/g,'').slice(0,10))} style={{ padding:'12px 14px', borderRadius:10 }}/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>Assigned Test</label>
          <CardSelect value={testId} onChange={setTestId} options={allTests} placeholder="Select test…" icon={<BookOpen size={14}/>}/>
          {testChanged && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginTop:6, padding:'10px 12px', borderRadius:10, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', color:'#b91c1c', fontSize:12.5, fontWeight:600 }}>
              <AlertTriangle size={14} style={{ flexShrink:0, marginTop:1 }}/>
              {hasProgress
                ? 'This candidate already has an attempt on the current test. Changing the test will permanently delete that attempt (score, answers, timings) and reset status to Pending.'
                : 'Changing the assigned test will reset this candidate to Pending on the new test.'}
            </div>
          )}
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:5, maxWidth:320 }}>
          <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>Reset Password (optional)</label>
          <div style={{ position:'relative' }}>
            <input type={showPw?'text':'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave blank to keep current"
              style={{ width:'100%', padding:'12px 42px 12px 14px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border .15s' }}
              onFocus={e=>e.target.style.borderColor='var(--accent)'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            <button type="button" onClick={()=>setShowPw(v=>!v)}
              style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-mut)', display:'grid', placeItems:'center' }}>
              {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
            </button>
          </div>
        </div>

        <div style={{ height:1, background:'#e5e7eb', margin:'8px -24px 0' }}/>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
          <button type="button" onClick={onCancel} style={{ padding:'11px 24px', borderRadius:12, border:'1px solid #d1d5db', background:'#fff', fontWeight:600, color:'#4b5563', cursor:'pointer', fontSize:14, transition:'all .2s' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding:'11px 28px', borderRadius:12, border:'none', background: saving ? '#a5b4fc' : '#4f46e5', color:'#fff', fontWeight:700, fontSize:14, cursor: saving ? 'not-allowed' : 'pointer', transition:'all .2s', boxShadow:'0 4px 14px rgba(79,70,229,.25)' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================
export default function AdminScreening() {
  const [tab, setTab] = useState('tests')
  const [tests, setTests] = useState([])
  const [candidates, setCandidates] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [builderTest, setBuilderTest] = useState(null)
  const [builderSection, setBuilderSection] = useState(null)

  const loadTests      = async () => { setLoading(true); try { setTests(await api.adminListScreeningTests()) } catch(e) { setError(e.message) } finally { setLoading(false) } }
  const loadCandidates = async () => { setLoading(true); try { setCandidates(await api.adminListScreeningCandidates()) } catch(e) { setError(e.message) } finally { setLoading(false) } }
  const loadResults    = async () => { setLoading(true); try { setResults(await api.adminGetScreeningResults()) } catch(e) { setError(e.message) } finally { setLoading(false) } }

  useEffect(() => {
    if (tab === 'tests') loadTests()
    else if (tab === 'candidates') loadCandidates()
    else if (tab === 'results') loadResults()
  }, [tab])

  const openBuilder = async (testId) => {
    try { setBuilderTest(await api.adminGetScreeningTest(testId)); setBuilderSection(null) }
    catch(e) { setError(e.message) }
  }

  const TABS = [
    { key:'tests',      label:'Assessment Tests', icon:<BookOpen size={14}/> },
    { key:'candidates', label:'Candidates',       icon:<Users size={14}/> },
    { key:'results',    label:'Results',          icon:<BarChart3 size={14}/> },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

      {/* ── Page header + Tabs in one row ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-faint)', marginBottom:6 }}>Ozellar Marine</div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0, letterSpacing:'-.01em' }}>Assessment Management</h1>
          <p style={{ margin:'5px 0 0', color:'var(--text-mut)', fontSize:13.5 }}>
            Manage entrance assessments, candidates, and export results.
          </p>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', gap:4, background:'var(--surface-2)', padding:4, borderRadius:14, border:'1px solid var(--border)', flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setBuilderTest(null); setBuilderSection(null) }}
              style={{
                display:'flex', alignItems:'center', gap:7, padding:'9px 18px', borderRadius:10,
                border:'none', cursor:'pointer', fontWeight:600, fontSize:13.5,
                background: tab === t.key ? 'var(--accent)' : 'transparent',
                color: tab === t.key ? 'var(--on-accent)' : 'var(--text-mut)',
                transition:'all .15s',
                boxShadow: tab === t.key ? '0 2px 10px rgba(47,111,237,.3)' : 'none',
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>


      {/* ── Error toast ── */}
      {error && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 18px', background:'var(--danger-weak)', border:'1px solid rgba(220,38,38,.25)', borderRadius:12, color:'var(--danger)', fontSize:13.5 }}>
          <AlertTriangle size={15} style={{ flexShrink:0 }}/> {error}
          <button onClick={() => setError('')} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'inherit', display:'grid', placeItems:'center' }}><X size={14}/></button>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'80px 0', color:'var(--text-faint)' }}>
          <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin .8s linear infinite' }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <span style={{ fontSize:13.5 }}>Loading…</span>
        </div>
      ) : (
        <>
          {tab === 'tests' && (builderTest
            ? <TestBuilder test={builderTest} section={builderSection} onSelectSection={setBuilderSection}
                onBack={() => { setBuilderTest(null); setBuilderSection(null) }}
                onRefresh={async () => setBuilderTest(await api.adminGetScreeningTest(builderTest.id))}
                onError={setError}/>
            : <TestsTab tests={tests} onRefresh={loadTests} onOpenBuilder={openBuilder} onError={setError}/>
          )}
          {tab === 'candidates' && <CandidatesTab candidates={candidates} onRefresh={loadCandidates} onError={setError}/>}
          {tab === 'results'    && <ResultsTab results={results} onRefresh={loadResults} onError={setError}/>}
        </>
      )}
    </div>
  )
}

// ============================================================
// CREATE TEST CARD COMPONENT
// ============================================================
function CreateTestCard({ form, setForm, saving, onCreate, onCancel }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, border:'1px solid var(--border)', overflow:'hidden', boxShadow:'0 12px 32px rgba(0,0,0,.08), 0 4px 12px rgba(37,99,235,.06)', animation:'tw-in .3s ease-out' }}>
      <style>{`@keyframes tw-in { from { opacity:0; transform:translateY(-8px) } to { opacity:1; transform:translateY(0) } }`}</style>
      <div style={{ background:'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding:'20px 24px', borderBottom:'1px solid rgba(37,99,235,.15)', display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:40, height:40, borderRadius:12, background:'#2563eb', display:'grid', placeItems:'center', flexShrink:0, boxShadow:'0 4px 12px rgba(37,99,235,.3)' }}>
          <ClipboardList size={18} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize:15, fontWeight:800, color:'#1e3a8a', letterSpacing:'-.01em' }}>Create New Assessment</div>
          <div style={{ fontSize:12.5, color:'#3b82f6', marginTop:3, fontWeight:600 }}>Configure the core parameters for the new test</div>
        </div>
      </div>
      <form onSubmit={onCreate} style={{ padding:'28px 24px', display:'flex', flexDirection:'column', gap:24 }}>
        <div>
          <Input label="Assessment Title *" type="text" placeholder="e.g. Engine Cadet Assessment 2026 — Batch B" required value={form.title} onChange={e => setForm(f=>({...f, title:e.target.value}))} style={{ padding:'12px 16px', fontSize:14.5, borderRadius:12 }}/>
        </div>
        
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
          <div style={{ background:'#f8fafc', padding:16, borderRadius:14, border:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><Clock size={13}/> Time Limit</div>
            <Input type="number" min="1" max="300" value={form.timerMinutes} onChange={e => setForm(f=>({...f, timerMinutes:+e.target.value}))} style={{ padding:'10px 14px', background:'#fff', borderRadius:10, border:'1px solid #cbd5e1' }}/>
            <div style={{ fontSize:11.5, fontWeight:500, color:'#94a3b8', marginTop:8 }}>Duration in minutes</div>
          </div>
          <div style={{ background:'#f0fdf4', padding:16, borderRadius:14, border:'1px solid #bbf7d0' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#166534', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><CheckCircle2 size={13}/> Correct Mark</div>
            <Input type="number" min="1" max="10" value={form.correctScore} onChange={e => setForm(f=>({...f, correctScore:+e.target.value}))} style={{ padding:'10px 14px', background:'#fff', border:'1px solid #86efac' }}/>
            <div style={{ fontSize:11.5, fontWeight:500, color:'#22c55e', marginTop:8 }}>Points awarded per question</div>
          </div>
          <div style={{ background:'#fef2f2', padding:16, borderRadius:14, border:'1px solid #fecaca' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#991b1b', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}><AlertTriangle size={13}/> Wrong Penalty</div>
            <Input type="number" min="0" max="10" value={form.wrongPenalty} onChange={e => setForm(f=>({...f, wrongPenalty:+e.target.value}))} style={{ padding:'10px 14px', background:'#fff', border:'1px solid #fca5a5' }}/>
            <div style={{ fontSize:11.5, fontWeight:500, color:'#ef4444', marginTop:8 }}>Points deducted per error</div>
          </div>
        </div>

        <div style={{ height:1, background:'#e5e7eb', margin:'4px -24px' }}/>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:12 }}>
          <button type="button" onClick={onCancel} style={{ padding:'11px 24px', borderRadius:12, border:'1px solid #d1d5db', background:'#fff', fontWeight:600, color:'#4b5563', cursor:'pointer', fontSize:14, transition:'all .2s' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving} style={{ padding:'11px 28px', borderRadius:12, border:'none', background: saving ? '#93c5fd' : '#2563eb', color:'#fff', fontWeight:700, fontSize:14, cursor: saving ? 'not-allowed' : 'pointer', transition:'all .2s', boxShadow:'0 4px 14px rgba(37,99,235,.25)' }}>
            {saving ? 'Creating Assessment…' : 'Create Assessment'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ============================================================
// TESTS TAB
// ============================================================
function TestsTab({ tests, onRefresh, onOpenBuilder, onError }) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title:'', timerMinutes:80, correctScore:4, wrongPenalty:1 })
  const [saving, setSaving] = useState(false)

  const create = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await api.adminCreateScreeningTest(form); setShowCreate(false); setForm({ title:'', timerMinutes:80, correctScore:4, wrongPenalty:1 }); onRefresh() }
    catch(e) { onError(e.message) }
    finally { setSaving(false) }
  }

  const toggle = async (id) => { try { await api.adminToggleScreeningTest(id); onRefresh() } catch(e) { onError(e.message) } }
  const del = async (id) => {
    if (!confirm('Delete this test and all its data? This cannot be undone.')) return
    try { await api.adminDeleteScreeningTest(id); onRefresh() } catch(e) { onError(e.message) }
  }

  /* ── Single test: show prominent management card ── */
  if (tests.length === 1) {
    const t = tests[0]
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* Create test action */}
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn primary" onClick={() => setShowCreate(v=>!v)} style={{ display:'flex', alignItems:'center', gap:7, borderRadius:11, padding:'9px 18px', fontSize:13.5, fontWeight:600 }}>
            <Plus size={15}/> {showCreate ? 'Cancel' : 'Create Test'}
          </button>
        </div>

        {showCreate && <CreateTestCard form={form} setForm={setForm} saving={saving} onCreate={create} onCancel={() => setShowCreate(false)} />}

        {/* Hero card */}
        <Card style={{ overflow:'hidden' }}>
          <div style={{ padding:'20px 24px', display:'flex', alignItems:'center', gap:20 }}>
            <div style={{ width:52, height:52, borderRadius:15, background: t.isActive ? 'var(--accent-weak)' : 'var(--surface-2)', border:`1.5px solid ${t.isActive ? 'rgba(47,111,237,.25)' : 'var(--border)'}`, display:'grid', placeItems:'center', flexShrink:0 }}>
              <ClipboardList size={22} color={t.isActive ? 'var(--accent)' : 'var(--text-faint)'} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <div style={{ fontWeight:800, fontSize:16, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.title}</div>
                <span style={{ flexShrink:0, fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20, border:'1px solid', color: t.isActive ? 'var(--success)' : '#ef4444', background: t.isActive ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)', borderColor: t.isActive ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.2)' }}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:16, color:'var(--text-mut)', fontSize:12.5 }}>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><Clock size={12}/> {t.timerMinutes} min</span>
                <span>+{t.correctScore} / −{t.wrongPenalty} marks</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><Layers size={12}/> {t.totalQuestions || 0} questions</span>
                <span style={{ display:'flex', alignItems:'center', gap:5 }}><Users size={12}/> {t.candidateCount || 0} candidates ({t.submittedCount || 0} submitted)</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              <button className="btn primary" onClick={() => onOpenBuilder(t.id)} style={{ display:'flex', alignItems:'center', gap:7, borderRadius:11, padding:'9px 18px', fontSize:13.5, fontWeight:600 }}>
                <Edit3 size={14}/> Edit Test
              </button>
              <button onClick={() => toggle(t.id)} style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:11, border:'1.5px solid var(--border)', background:'var(--surface-2)', cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--text-mut)', fontFamily:'inherit' }}>
                {t.isActive ? <><ToggleRight size={15} color="var(--accent)"/> Active</> : <><ToggleLeft size={15}/> Inactive</>}
              </button>
              <button className="iconbtn" title="Delete test" onClick={() => del(t.id)}>
                <Trash2 size={15} color="var(--danger)" />
              </button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  /* ── No tests yet ── */
  if (tests.length === 0) return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn primary" onClick={() => setShowCreate(v=>!v)} style={{ display:'flex', alignItems:'center', gap:7, borderRadius:11, padding:'9px 18px', fontSize:13.5, fontWeight:600 }}>
          <Plus size={15}/> {showCreate ? 'Cancel' : 'Create Test'}
        </button>
      </div>
      {showCreate && <CreateTestCard form={form} setForm={setForm} saving={saving} onCreate={create} onCancel={() => setShowCreate(false)} />}
      <Card style={{ padding:'80px 0', textAlign:'center' }}>
        <ClipboardList size={44} style={{ opacity:.2, marginBottom:12, color:'var(--text-mut)' }}/>
        <div style={{ fontWeight:600, color:'var(--text-mut)', fontSize:15 }}>No assessment tests yet</div>
        <div style={{ color:'var(--text-faint)', fontSize:13, marginTop:5 }}>Click "Create Test" to get started</div>
      </Card>
    </div>
  )

  /* ── Multiple tests ── */
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn primary" onClick={() => setShowCreate(v=>!v)} style={{ display:'flex', alignItems:'center', gap:7, borderRadius:11, padding:'9px 18px', fontSize:13.5, fontWeight:600 }}>
          <Plus size={15}/> {showCreate ? 'Cancel' : 'Create Test'}
        </button>
      </div>
      {showCreate && <CreateTestCard form={form} setForm={setForm} saving={saving} onCreate={create} onCancel={() => setShowCreate(false)} />}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {tests.map(t => (
          <div key={t.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'24px 28px', display:'flex', alignItems:'center', gap:24, opacity: t.isActive ? 1 : 0.7, transition:'all .2s', boxShadow:'0 4px 20px rgba(0,0,0,.03)' }}
               onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,.06)'}
               onMouseLeave={e => e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.03)'}>
            <div style={{ width:54, height:54, borderRadius:16, background: t.isActive ? 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)' : 'var(--surface-2)', border:`1px solid ${t.isActive ? 'rgba(99,102,241,.15)' : 'var(--border)'}`, display:'grid', placeItems:'center', flexShrink:0, boxShadow: t.isActive ? '0 4px 12px rgba(79,70,229,.15)' : 'none' }}>
              <ClipboardList size={22} color={t.isActive ? '#4f46e5' : 'var(--text-mut)'}/>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <div style={{ fontWeight:800, fontSize:16.5, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', letterSpacing:'-.01em' }}>{t.title}</div>
                {!t.isActive && <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', padding:'3px 10px', borderRadius:20, textTransform:'uppercase', letterSpacing:'.04em' }}>Inactive</span>}
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:18, color:'var(--text-mut)', fontSize:13, fontWeight:500 }}>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}><Clock size={13} color="var(--accent)"/>{t.timerMinutes} min</span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}><CheckCircle2 size={13} color="var(--success)"/>+{t.correctScore} / −{t.wrongPenalty} marks</span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}><Layers size={13} color="#8b5cf6"/>{t.totalQuestions} questions</span>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}><Users size={13} color="#f59e0b"/>{t.candidateCount} candidates ({t.submittedCount} submitted)</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, flexShrink:0 }}>
              <button className="btn sm" style={{ display:'flex', alignItems:'center', gap:6, borderRadius:10, fontWeight:700, padding:'8px 16px', fontSize:13 }} onClick={() => onOpenBuilder(t.id)}>
                <Edit3 size={14}/> Edit
              </button>
              <button className="iconbtn" title={t.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggle(t.id)} style={{ padding:8 }}>
                {t.isActive ? <ToggleRight size={22} color="var(--success)"/> : <ToggleLeft size={22}/>}
              </button>
              <button className="iconbtn" title="Delete" onClick={() => del(t.id)} style={{ padding:8 }}>
                <Trash2 size={16} color="var(--danger)"/>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// TEST BUILDER
// ============================================================
function TestBuilder({ test, section, onSelectSection, onBack, onRefresh, onError }) {
  const [editOpen, setEditOpen] = useState(false)
  const [form, setForm] = useState({ title:test.title, timerMinutes:test.timerMinutes, correctScore:test.correctScore, wrongPenalty:test.wrongPenalty })
  const [addSec, setAddSec] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setForm({ title:test.title, timerMinutes:test.timerMinutes, correctScore:test.correctScore, wrongPenalty:test.wrongPenalty }), [test])

  if (section) return <QuestionEditor test={test} section={section} onBack={async () => { await onRefresh(); onSelectSection(null) }} onError={onError}/>

  const saveTest = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await api.adminUpdateScreeningTest(test.id, form); await onRefresh(); setEditOpen(false) }
    catch(e) { onError(e.message) } finally { setSaving(false) }
  }

  const addSection = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await api.adminAddScreeningSection(test.id, { title:addSec.title, section_type:'mcq', passage:addSec.passage||null }); await onRefresh(); setAddSec(null) }
    catch(e) { onError(e.message) } finally { setSaving(false) }
  }

  const delSection = async (sid) => {
    if (!confirm('Delete this section and all its questions?')) return
    try { await api.adminDeleteScreeningSection(test.id, sid); await onRefresh() } catch(e) { onError(e.message) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, color:'var(--text-mut)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', fontWeight:700, padding:0, fontSize:13.5 }}>← Tests</button>
        <ChevronRight size={13}/>
        <span style={{ color:'var(--text)', fontWeight:600 }}>{test.title}</span>
      </div>

      {/* Test meta card */}
      <Card style={{ overflow:'hidden' }}>
        <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:16 }}>{test.title}</div>
            <div style={{ display:'flex', gap:16, color:'var(--text-mut)', fontSize:12.5, marginTop:5 }}>
              <span><Clock size={11} style={{ verticalAlign:'middle', marginRight:4 }}/>{test.timerMinutes} min</span>
              <span>+{test.correctScore} / −{test.wrongPenalty}</span>
              <span>{test.totalQuestions||0} MCQ questions</span>
            </div>
          </div>
          <button className="btn sm" style={{ display:'flex', alignItems:'center', gap:6, borderRadius:9 }} onClick={() => setEditOpen(v=>!v)}>
            <Edit3 size={13}/> Edit Settings
          </button>
        </div>

        {editOpen && (
          <div style={{ padding:'20px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
            <form onSubmit={saveTest} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, alignItems:'end' }}>
              <div style={{ gridColumn:'span 4' }}>
                <Input label="Title" type="text" required value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))}/>
              </div>
              <Input label="Timer (min)" type="number" min="1" value={form.timerMinutes} onChange={e => setForm(f=>({...f,timerMinutes:+e.target.value}))}/>
              <Input label="Correct" type="number" min="1" value={form.correctScore} onChange={e => setForm(f=>({...f,correctScore:+e.target.value}))}/>
              <Input label="Wrong" type="number" min="0" value={form.wrongPenalty} onChange={e => setForm(f=>({...f,wrongPenalty:+e.target.value}))}/>
              <div style={{ display:'flex', gap:8 }}>
                <button type="submit" className="btn primary sm" disabled={saving} style={{ flex:1 }}>{saving?'…':'Save'}</button>
                <button type="button" className="btn sm" onClick={()=>setEditOpen(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </Card>

      {/* Sections */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <SectionLabel>Sections ({test.sections?.length || 0})</SectionLabel>
          <button className="btn sm" style={{ display:'flex', alignItems:'center', gap:6, borderRadius:9 }} onClick={() => setAddSec({title:'',passage:''})}>
            <Plus size={13}/> Add Section
          </button>
        </div>

        {addSec && (
          <Card style={{ padding:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Add MCQ Section</div>
            <form onSubmit={addSection} style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <Input label="Section Title *" type="text" placeholder="e.g. Mathematics & Reasoning" required value={addSec.title} onChange={e => setAddSec(f=>({...f,title:e.target.value}))}/>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontSize:12.5, fontWeight:600, color:'var(--text-mut)' }}>Reading Passage (optional)</label>
                <textarea placeholder="Paste comprehension passage here…" rows={4}
                  style={{ padding:'10px 13px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', resize:'vertical', fontSize:14, fontFamily:'inherit', outline:'none' }}
                  value={addSec.passage} onChange={e => setAddSec(f=>({...f,passage:e.target.value}))}/>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="submit" className="btn primary sm" disabled={saving}>{saving?'…':'Add Section'}</button>
                <button type="button" className="btn sm" onClick={()=>setAddSec(null)}>Cancel</button>
              </div>
            </form>
          </Card>
        )}

        {(test.sections || []).map((sec, i) => (
          <div key={sec.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 22px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, transition:'box-shadow .15s' }}>
            <div style={{ width:38, height:38, borderRadius:12, background: sec.type==='personal_data' ? 'rgba(99,102,241,0.1)' : 'var(--accent-weak)', border:`1px solid ${sec.type==='personal_data'?'rgba(99,102,241,0.25)':'rgba(47,111,237,0.25)'}`, display:'grid', placeItems:'center', fontWeight:800, fontSize:13.5, color: sec.type==='personal_data'?'#6366f1':'var(--accent)', flexShrink:0 }}>
              {i + 1}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>{sec.title}</div>
              <div style={{ color:'var(--text-mut)', fontSize:12.5, marginTop:3 }}>
                {sec.type === 'personal_data'
                  ? 'Personal information form (auto-generated)'
                  : `${sec.questions?.length || 0} questions${sec.passage ? ' · has reading passage' : ''}`}
              </div>
            </div>
            {sec.type !== 'personal_data' && (
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn sm" style={{ display:'flex', alignItems:'center', gap:5, borderRadius:9, fontWeight:600 }} onClick={() => onSelectSection(sec)}>
                  <Edit3 size={12}/> Edit Questions
                </button>
                <button className="iconbtn" onClick={() => delSection(sec.id)}>
                  <Trash2 size={14} color="var(--danger)"/>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// QUESTION EDITOR
// ============================================================
// Lowercase letters label each image on a question: a, b, c, ... z, aa, ab, ...
const imageLabel = (i) => (i < 26 ? String.fromCharCode(97 + i) : imageLabel(Math.floor(i / 26) - 1) + imageLabel(i % 26))

function QuestionEditor({ test, section, onBack, onError }) {
  const [questions, setQuestions] = useState((section.questions || []).map(q => ({ ...q, options: q.options || ['','','',''], imageUrls: q.imageUrls || [] })))
  const [passage, setPassage] = useState(section.passage || '')
  const [editPassage, setEditPassage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingIdx, setUploadingIdx] = useState(null)
  const fileInputRef = useRef(null)
  const pendingUploadIdx = useRef(null)
  const LTRS = ['A','B','C','D']

  const addQ = () => setQuestions(qs => [...qs, { prompt:'', options:['','','',''], answer:0, imageUrls:[], order:qs.length }])
  const remQ = (i) => setQuestions(qs => qs.filter((_,j) => j !== i))
  const upQ  = (i,f,v) => setQuestions(qs => qs.map((q,j) => j===i ? {...q,[f]:v} : q))
  const upOpt = (qi,oi,v) => setQuestions(qs => qs.map((q,j) => j===qi ? {...q, options:q.options.map((o,k)=>k===oi?v:o)} : q))
  const removeImage = (qi, imgIdx) => setQuestions(qs => qs.map((q,j) => j===qi ? {...q, imageUrls: q.imageUrls.filter((_,k)=>k!==imgIdx)} : q))

  const pickImage = (qi) => { pendingUploadIdx.current = qi; fileInputRef.current?.click() }
  const onImageChosen = async (e) => {
    const file = e.target.files?.[0]
    const qi = pendingUploadIdx.current
    e.target.value = ''
    if (!file || qi == null) return
    setUploadingIdx(qi)
    try {
      const { imageUrl } = await api.adminUploadScreeningQuestionImage(file)
      setQuestions(qs => qs.map((q,j) => j===qi ? {...q, imageUrls: [...(q.imageUrls||[]), imageUrl]} : q))
    } catch (err) { onError(err.message) }
    finally { setUploadingIdx(null) }
  }

  const save = async () => {
    for (let i = 0; i < questions.length; i++) {
      if (!questions[i].prompt.trim()) return onError(`Question ${i+1} has no text`)
      if (questions[i].options.some(o => !o.trim())) return onError(`Question ${i+1} has an empty option`)
    }
    setSaving(true)
    try {
      if (editPassage) await api.adminUpdateScreeningSection(test.id, section.id, { title:section.title, section_type:section.type, passage })
      await api.adminSaveScreeningQuestions(test.id, section.id, questions.map((q,i) => ({ prompt:q.prompt, options:q.options, answer:q.answer, imageUrls:q.imageUrls||[], order:i })))
      await onBack()
    } catch(e) { onError(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={onImageChosen}/>

      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13.5, color:'var(--text-mut)' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', fontWeight:700, padding:0, fontSize:13.5 }}>← {test.title}</button>
        <ChevronRight size={13}/>
        <span style={{ color:'var(--text)', fontWeight:600 }}>{section.title}</span>
      </div>

      {/* Passage editor */}
      <Card style={{ padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: editPassage ? 14 : 0 }}>
          <div style={{ fontWeight:600, fontSize:14 }}>Reading Passage <span style={{ color:'var(--text-faint)', fontWeight:400, fontSize:13 }}>{section.passage ? '(has content)' : '(none)'}</span></div>
          <button className="btn sm" onClick={() => setEditPassage(v=>!v)}>{editPassage ? 'Done' : 'Edit Passage'}</button>
        </div>
        {editPassage && (
          <textarea rows={6} placeholder="Paste comprehension passage (leave blank if none)…"
            style={{ width:'100%', padding:'10px 13px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', resize:'vertical', fontSize:14, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
            value={passage} onChange={e => setPassage(e.target.value)}/>
        )}
      </Card>

      {/* Questions */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {questions.map((q, qi) => (
          <Card key={qi} style={{ overflow:'hidden' }}>
            <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', gap:12 }}>
              <div style={{ width:30, height:30, borderRadius:9, background:'var(--accent)', color:'var(--on-accent)', display:'grid', placeItems:'center', fontWeight:800, fontSize:13, flexShrink:0, marginTop:3 }}>
                {qi+1}
              </div>
              <textarea placeholder="Question text…" rows={2}
                style={{ flex:1, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', resize:'vertical', fontSize:14, fontFamily:'inherit', outline:'none' }}
                value={q.prompt} onChange={e => upQ(qi,'prompt',e.target.value)}/>
              <button className="iconbtn" onClick={() => remQ(qi)} title="Remove"><Trash2 size={14} color="var(--danger)"/></button>
            </div>

            {/* Images (optional, multiple — for figure/diagram-based questions).
                Each is labelled a, b, c… in upload order, shown to candidates
                the same way so "compare figure a and figure b" reads correctly. */}
            <div style={{ padding:'12px 20px 0', display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:12 }}>
              {(q.imageUrls||[]).map((url, imgIdx) => (
                <div key={imgIdx} style={{ position:'relative', flexShrink:0 }}>
                  <img src={url} alt="" style={{ display:'block', maxHeight:90, borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)' }}/>
                  <span style={{ position:'absolute', top:4, left:4, width:18, height:18, borderRadius:5, background:'rgba(17,17,17,.72)', color:'#fff', fontSize:11, fontWeight:800, display:'grid', placeItems:'center', textTransform:'lowercase' }}>
                    {imageLabel(imgIdx)}
                  </span>
                  <button className="iconbtn" onClick={() => removeImage(qi, imgIdx)} title="Remove image"
                    style={{ position:'absolute', top:-8, right:-8, width:22, height:22, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'50%', boxShadow:'0 1px 4px rgba(0,0,0,.15)' }}>
                    <X size={12} color="var(--danger)"/>
                  </button>
                </div>
              ))}
              <button className="btn sm" style={{ display:'inline-flex', alignItems:'center', gap:6 }}
                onClick={() => pickImage(qi)} disabled={uploadingIdx===qi}>
                {uploadingIdx===qi ? 'Uploading…' : <><ImageIcon size={13}/> Add Image</>}
              </button>
            </div>

            <div style={{ padding:'14px 20px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {q.options.map((opt, oi) => (
                <div key={oi} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, border:`1.5px solid ${q.answer===oi ? 'var(--success)' : 'var(--border)'}`, background: q.answer===oi ? 'var(--success-weak)' : 'transparent', transition:'all .15s' }}>
                  <button type="button" onClick={() => upQ(qi,'answer',oi)}
                    style={{ width:26, height:26, borderRadius:8, background: q.answer===oi ? 'var(--success)' : 'var(--surface-2)', border:`1px solid ${q.answer===oi?'var(--success)':'var(--border)'}`, color: q.answer===oi ? '#fff' : 'var(--text-mut)', fontWeight:800, fontSize:12, cursor:'pointer', flexShrink:0 }}
                    title="Mark as correct">
                    {LTRS[oi]}
                  </button>
                  <input type="text" placeholder={`Option ${LTRS[oi]}`} value={opt} onChange={e => upOpt(qi,oi,e.target.value)}
                    style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'var(--text)', fontSize:13.5, fontFamily:'inherit' }}/>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button className="btn" style={{ display:'flex', alignItems:'center', gap:6, borderRadius:10 }} onClick={addQ}><Plus size={14}/> Add Question</button>
        <button className="btn primary" style={{ display:'flex', alignItems:'center', gap:6, borderRadius:10 }} onClick={save} disabled={saving}>
          <Save size={14}/> {saving ? 'Saving…' : `Save ${questions.length} Questions`}
        </button>
        <span style={{ marginLeft:'auto', color:'var(--text-faint)', fontSize:13 }}>{questions.length} question{questions.length!==1?'s':''}</span>
      </div>
    </div>
  )
}

// ============================================================
// CANDIDATES TAB
// ============================================================
function CandidatesTab({ candidates, onRefresh, onError }) {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ fullName:'', password:'', testId:'', mobileNumber:'' })
  const [saving, setSaving] = useState(false)
  const [allTests, setAllTests] = useState([])
  const [filterTest, setFilterTest] = useState('')
  const [search, setSearch] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [editCand, setEditCand] = useState(null)
  const editFormRef = useRef(null)

  useEffect(() => { api.adminListScreeningTests().then(setAllTests).catch(()=>{}) }, [])

  // Clicking Edit on a row far down a long candidate table opens the edit
  // form up near the top of the page, out of view — scroll it into sight
  // rather than leaving the admin to notice and scroll up themselves.
  useEffect(() => {
    if (editCand) editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editCand])

  const create = async (e) => {
    e.preventDefault(); setSaving(true)
    try { await api.adminCreateScreeningCandidate(form); setShowCreate(false); setForm({ fullName:'', password:'', testId:'', mobileNumber:'' }); onRefresh() }
    catch(e) { onError(e.message) } finally { setSaving(false) }
  }

  const del = async (id) => {
    if (!confirm('Delete this candidate and their attempt?')) return
    try { await api.adminDeleteScreeningCandidate(id); onRefresh() } catch(e) { onError(e.message) }
  }

  const saveEdit = async (patch) => {
    try { await api.adminUpdateScreeningCandidate(editCand.id, patch); setEditCand(null); onRefresh() }
    catch(e) { onError(e.message) }
  }

  const filtered = candidates
    .filter(c => !filterTest || c.testId === filterTest)
    .filter(c => !search || c.fullName.toLowerCase().includes(search.toLowerCase()) || (c.mobileNumber||'').includes(search))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'0 0 200px' }}>
          <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-faint)', pointerEvents:'none' }}/>
          <input type="text" placeholder="Search name / mobile…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13.5, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div style={{ flex:'0 0 220px' }}>
          <CardSelect value={filterTest} onChange={setFilterTest} options={[{id:'', title:'All Tests'}, ...allTests]} placeholder="Filter by Test…" icon={<Filter size={14}/>}/>
        </div>
        <button className="iconbtn" onClick={onRefresh} title="Refresh"><RefreshCw size={15}/></button>
        <button className="btn primary" onClick={() => setShowCreate(v=>!v)} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, borderRadius:10, fontWeight:600 }}>
          <Plus size={14}/> {showCreate ? 'Cancel' : 'Add Candidate'}
        </button>
      </div>

      {showCreate && <CreateCandidateCard form={form} setForm={setForm} saving={saving} allTests={allTests} onCreate={create} onCancel={() => setShowCreate(false)} />}

      {editCand && (
        <div ref={editFormRef}>
          <EditCandidateCard candidate={editCand} allTests={allTests} onSave={saveEdit} onCancel={() => setEditCand(null)} />
        </div>
      )}

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          { label:'Total', value:filtered.length, color:'var(--accent)', bg:'var(--accent-weak)' },
          { label:'In Progress', value:filtered.filter(c=>c.status==='in_progress').length, color:'#f59e0b', bg:'rgba(245,158,11,.1)' },
          { label:'Submitted', value:filtered.filter(c=>c.status==='submitted').length, color:'var(--success)', bg:'var(--success-weak)' },
        ].map(s => (
          <div key={s.label} style={{ background:s.bg, border:`1px solid ${s.color}25`, borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12, color:s.color, fontWeight:600, opacity:.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <Card style={{ overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding:'80px 0', textAlign:'center', color:'var(--text-faint)' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--surface-2)', display:'grid', placeItems:'center', margin:'0 auto 16px' }}>
              <Users size={28} style={{ opacity:.4 }}/>
            </div>
            <div style={{ fontWeight:600, fontSize:15, color:'var(--text)', marginBottom:4 }}>No candidates found</div>
            <div style={{ fontSize:13 }}>Add a candidate to get started.</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13.5 }}>
              <thead>
                <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                  {['Name','Mobile','Test','Status','Started','Submitted','Score','Tab Sw.',''].map(h => (
                    <th key={h} style={{ padding:'14px 20px', textAlign:'left', fontWeight:700, color:'var(--text-mut)', fontSize:12, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} style={{ borderBottom:'1px solid var(--border)', background: 'transparent', transition:'background .15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding:'14px 20px', fontWeight:700, color:'var(--text)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--accent-weak)', color:'var(--accent)', display:'grid', placeItems:'center', fontSize:12, fontWeight:800 }}>
                          {c.fullName.charAt(0).toUpperCase()}
                        </div>
                        {c.fullName}
                      </div>
                    </td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)' }}>{c.mobileNumber||'—'}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', maxWidth:200 }}><span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}>{c.testTitle}</span></td>
                    <td style={{ padding:'14px 20px' }}>{chip(c.status)}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', fontSize:12.5, whiteSpace:'nowrap' }}>{fmtDt(c.startedAt)}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', fontSize:12.5, whiteSpace:'nowrap' }}>{fmtDt(c.submittedAt)}</td>
                    <td style={{ padding:'14px 20px', fontWeight:800, color: c.score!=null ? 'var(--accent)' : 'var(--text-faint)', fontSize:14 }}>{c.score!=null?c.score:'—'}</td>
                    <td style={{ padding:'14px 20px' }}>{tabSwitchBadge(c.tabSwitchCount)}</td>
                    <td style={{ padding:'14px 20px', textAlign:'right', whiteSpace:'nowrap' }}>
                      <button className="iconbtn" onClick={() => setEditCand(c)} title="Edit Candidate"><Edit3 size={15} color="var(--accent)"/></button>
                      <button className="iconbtn" onClick={() => del(c.id)} title="Delete Candidate"><Trash2 size={15} color="var(--danger)"/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// Tab-switch count badge — plain and quiet under 3, red/urgent at 3+ so an
// admin scanning the table can spot likely cheating attempts at a glance.
function tabSwitchBadge(count) {
  if (!count) return <span style={{ color:'var(--text-faint)' }}>—</span>
  const flagged = count >= 3
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:999,
      fontSize:12.5, fontWeight:800,
      color: flagged ? '#fff' : 'var(--warn, #9c5b12)',
      background: flagged ? 'var(--danger, #b23b2e)' : 'var(--warn-weak, #fbeedb)',
    }}>
      {flagged && <AlertTriangle size={12}/>}
      {count}
    </span>
  )
}

// ============================================================
// RESULTS TAB
// ============================================================
function ResultsTab({ results, onRefresh, onError }) {
  const [allTests, setAllTests] = useState([])
  const [filterTest, setFilterTest] = useState('')
  const [search, setSearch] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { api.adminListScreeningTests().then(setAllTests).catch(()=>{}) }, [])

  const download = async () => {
    setDownloading(true)
    try { await api.adminDownloadScreeningResultsXlsx(filterTest||null) } catch(e) { onError(e.message) } finally { setDownloading(false) }
  }

  const filtered = results
    .filter(r => !filterTest || r.testId === filterTest)
    .filter(r => !search || r.fullName.toLowerCase().includes(search.toLowerCase()))

  const avg = (arr) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : '—'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'0 0 200px' }}>
          <Search size={14} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-faint)', pointerEvents:'none' }}/>
          <input type="text" placeholder="Search name…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width:'100%', padding:'8px 12px 8px 32px', borderRadius:10, border:'1.5px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13.5, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}/>
        </div>
        <div style={{ flex:'0 0 220px' }}>
          <CardSelect value={filterTest} onChange={setFilterTest} options={[{id:'', title:'All Tests'}, ...allTests]} placeholder="Filter by Test…" icon={<Filter size={14}/>}/>
        </div>
        <button className="iconbtn" onClick={onRefresh} title="Refresh"><RefreshCw size={15}/></button>
        <button className="btn primary" onClick={download} disabled={downloading}
          style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6, borderRadius:10, fontWeight:600 }}>
          <Download size={14}/> {downloading ? 'Preparing…' : 'Export Excel'}
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Submissions', value:filtered.length, color:'var(--accent)', bg:'var(--accent-weak)', icon:<TrendingUp size={16}/> },
          { label:'Avg Score', value: filtered.length ? avg(filtered.map(r=>r.score||0)) : '—', color:'#f59e0b', bg:'rgba(245,158,11,.1)', icon:<Award size={16}/> },
          { label:'Avg Correct', value: filtered.length ? avg(filtered.map(r=>r.correct||0)) : '—', color:'var(--success)', bg:'var(--success-weak)', icon:<CheckCircle2 size={16}/> },
          { label:'Avg Wrong', value: filtered.length ? avg(filtered.map(r=>r.wrong||0)) : '—', color:'var(--danger)', bg:'var(--danger-weak)', icon:<AlertTriangle size={16}/> },
        ].map(s => (
          <Card key={s.label} style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:s.bg, display:'grid', placeItems:'center', color:s.color, flexShrink:0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:24, fontWeight:800, color:s.color, letterSpacing:'-.01em' }}>{s.value}</div>
              <div style={{ fontSize:11.5, color:'var(--text-faint)', fontWeight:600 }}>{s.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card style={{ overflow:'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding:'80px 0', textAlign:'center', color:'var(--text-faint)' }}>
            <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--surface-2)', display:'grid', placeItems:'center', margin:'0 auto 16px' }}>
              <BarChart3 size={28} style={{ opacity:.4 }}/>
            </div>
            <div style={{ fontWeight:600, fontSize:15, color:'var(--text)', marginBottom:4 }}>No results found</div>
            <div style={{ fontSize:13 }}>Scores will appear here once candidates submit tests.</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13.5 }}>
              <thead>
                <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                  {['Name','Mobile','Test','Start','Submit','Time (min)','✓','✗','○','Total Q','Score / Max','Tab Sw.'].map(h => (
                    <th key={h} style={{ padding:'14px 20px', textAlign:'left', fontWeight:700, color:'var(--text-mut)', fontSize:12, letterSpacing:'.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.candidateId} style={{ borderBottom:'1px solid var(--border)', background: 'transparent', transition:'background .15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding:'14px 20px', fontWeight:700, color:'var(--text)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--accent-weak)', color:'var(--accent)', display:'grid', placeItems:'center', fontSize:12, fontWeight:800 }}>
                          {r.fullName.charAt(0).toUpperCase()}
                        </div>
                        {r.fullName}
                      </div>
                    </td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)' }}>{r.mobileNumber||'—'}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', maxWidth:160 }}><span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}>{r.testTitle}</span></td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', whiteSpace:'nowrap', fontSize:12.5 }}>{fmtDt(r.startedAt)}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)', whiteSpace:'nowrap', fontSize:12.5 }}>{fmtDt(r.submittedAt)}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)' }}>{r.timeTakenMinutes!=null?r.timeTakenMinutes:'—'}</td>
                    <td style={{ padding:'14px 20px', color:'var(--success)', fontWeight:800 }}>{r.correct}</td>
                    <td style={{ padding:'14px 20px', color:'var(--danger)', fontWeight:800 }}>{r.wrong}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)' }}>{r.unanswered}</td>
                    <td style={{ padding:'14px 20px', color:'var(--text-mut)' }}>{r.totalQuestions!=null?r.totalQuestions:'—'}</td>
                    <td style={{ padding:'14px 20px', fontWeight:900, color:'var(--accent)', fontSize:15, whiteSpace:'nowrap' }}>
                      {r.score}{r.maxScore!=null ? ` / ${r.maxScore}` : ''}
                    </td>
                    <td style={{ padding:'14px 20px' }}>{tabSwitchBadge(r.tabSwitchCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
