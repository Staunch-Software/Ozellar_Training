import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown,
  Eye, Save, X, AlertCircle, Settings, Ship, Cog, Paperclip,
  ArrowRight, ListChecks,
} from 'lucide-react'
import {
  adminGetOrientationProgram, adminUpdateOrientationProgram,
  adminAddOrientationTask, adminUpdateOrientationTask, adminDeleteOrientationTask,
  adminReorderOrientationTasks,
} from '../../api.js'
import CardSelect from '../../components/CardSelect.jsx'
import { useConfirm } from '../../components/ConfirmDialog.jsx'
import './AdminOrientationBuilder.css'

const DECK_RANKS   = ['Third Officer', 'Second Officer', 'Chief Officer', 'Master']
const ENGINE_RANKS = ['Fourth Engineer', 'Third Engineer', 'Second Engineer', 'Chief Engineer']

function TaskItem({ task, index, total, onEdit, onDelete, onMove }) {
  return (
    <div className={`ob-item${task.requiresProof ? ' ob-item--proof' : ''}`}>
      <div className="ob-item-num">{index + 1}</div>
      <div className="ob-item-body">
        <div className="ob-item-top">
          <div className="ob-item-title">
            {task.title}
            {task.requiresProof && (
              <span className="ob-item-badge"><Paperclip size={10} /> Attachment</span>
            )}
          </div>
          <div className="ob-item-actions">
            <div className="ob-item-move">
              <button className="ob-btn ob-btn-icon" disabled={index === 0}
                onClick={() => onMove(index, -1)} aria-label="Move up"><ChevronUp size={13} /></button>
              <button className="ob-btn ob-btn-icon" disabled={index === total - 1}
                onClick={() => onMove(index, 1)} aria-label="Move down"><ChevronDown size={13} /></button>
            </div>
            <button className="ob-btn ob-btn-icon" onClick={() => onEdit(task)} aria-label="Edit"><Pencil size={13} /></button>
            <button className="ob-btn ob-btn-icon ob-btn-danger" onClick={() => onDelete(task)} aria-label="Delete"><Trash2 size={13} /></button>
          </div>
        </div>
        {task.description && <div className="ob-item-desc">{task.description}</div>}
      </div>
    </div>
  )
}

export default function AdminOrientationBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [program, setProgram] = useState(null)
  const [error, setError] = useState('')
  const [editingTask, setEditingTask] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState(null)
  const { confirm, dialog } = useConfirm()

  const load = () => adminGetOrientationProgram(id).then(setProgram).catch((e) => setError(e.message))
  useEffect(() => { load() }, [id])

  if (error && !program) return <div className="ob-alert"><AlertCircle size={15} /> {error}</div>
  if (!program) return <div className="spinner">Loading...</div>

  const rankOptions = program.department === 'engine' ? ENGINE_RANKS : DECK_RANKS
  const DeptIcon = program.department === 'deck' ? Ship : Cog

  const saveTask = async () => {
    if (!editingTask.title.trim()) { setError('Title is required'); return }
    setError('')
    try {
      const body = {
        title: editingTask.title.trim(),
        description: editingTask.description || '',
        requiresProof: !!editingTask.requiresProof,
      }
      if (editingTask.id) {
        await adminUpdateOrientationTask(id, editingTask.id, body)
      } else {
        await adminAddOrientationTask(id, body)
      }
      setEditingTask(null)
      load()
    } catch (e) { setError(e.message) }
  }

  const deleteTask = async (task) => {
    if (!(await confirm(`This removes "${task.title}" from the checklist for every enrolled officer.`, {
      title: 'Delete this task?', confirmLabel: 'Delete', danger: true,
    }))) return
    await adminDeleteOrientationTask(id, task.id)
    load()
  }

  const moveTask = async (index, dir) => {
    const order = program.tasks.map((t) => t.id)
    const j = index + dir
    if (j < 0 || j >= order.length) return
    ;[order[index], order[j]] = [order[j], order[index]]
    await adminReorderOrientationTasks(id, order)
    load()
  }

  const openSettings = () => {
    setSettingsForm({
      title: program.title, subtitle: program.subtitle || '',
      department: program.department,
      fromRank: program.fromRank || '', toRank: program.toRank || '',
    })
    setShowSettings(true)
  }

  const saveSettings = async (e) => {
    e.preventDefault()
    try {
      await adminUpdateOrientationProgram(id, settingsForm)
      setShowSettings(false)
      load()
    } catch (e2) { setError(e2.message) }
  }

  return (
    <div className={`ob-page${program.department === 'engine' ? ' ob-page--engine' : ''}`}>
      {dialog}

      {/* ---- Header ---- */}
      <div className="ob-hero">
        <button className="ob-hero-back" onClick={() => navigate('/admin/orientation-program/programs')} aria-label="Back">
          <ArrowLeft size={15} />
        </button>
        <div className="ob-hero-icon"><DeptIcon size={18} /></div>
        <div className="ob-hero-info">
          <div className="ob-hero-title">{program.title}</div>
          <div className="ob-hero-path">
            {program.fromRank && program.toRank ? (
              <>{program.fromRank} <ArrowRight size={11} className="ob-hero-path-sep" /> {program.toRank}</>
            ) : (
              <span>{program.department === 'deck' ? 'Deck department' : 'Engine department'}</span>
            )}
          </div>
        </div>
        <div className="ob-hero-count">
          <span className="ob-hero-count-num">{program.tasks.length}</span>
          <span className="ob-hero-count-lbl">Tasks</span>
        </div>
        <div className="ob-hero-actions">
          <button className="ob-btn" onClick={openSettings}><Settings size={14} /> Settings</button>
          <Link className="ob-btn" to={`/admin/orientation/${id}/preview`}><Eye size={14} /> Preview</Link>
          <button className="ob-btn ob-btn-primary" onClick={() => setEditingTask({ title: '', description: '', requiresProof: false })}>
            <Plus size={14} /> Add Task
          </button>
        </div>
      </div>

      {error && <div className="ob-alert"><AlertCircle size={14} /> {error}</div>}

      {/* ---- Task edit card ---- */}
      {editingTask && (
        <div className="ob-editor">
          <div className="ob-editor-bar" />
          <div className="ob-editor-head">
            <div className="ob-editor-ring">{editingTask.id ? <Pencil size={15} /> : <Plus size={16} />}</div>
            <div className="ob-editor-head-text">
              <div className="ob-editor-title">{editingTask.id ? 'Edit task' : 'New task'}</div>
              <div className="ob-editor-sub">{editingTask.id ? 'Update this checklist item' : 'Add an item to this checklist'}</div>
            </div>
            <button className="ob-editor-close" onClick={() => { setEditingTask(null); setError('') }} aria-label="Close"><X size={15} /></button>
          </div>

          {error && <div className="ob-alert" style={{ margin: '0 20px' }}><AlertCircle size={14} /> {error}</div>}

          <div className="ob-editor-body">
            <div className="ob-field">
              <label className="ob-label">Task title</label>
              <input className="ob-input" value={editingTask.title} autoFocus
                onChange={(e) => setEditingTask((t) => ({ ...t, title: e.target.value }))}
                placeholder="e.g. Cargo gear lifting gear certificate" />
            </div>

            <div className="ob-field">
              <label className="ob-label">Description / sub-steps</label>
              <textarea rows={6} className="ob-textarea"
                value={editingTask.description || ''}
                onChange={(e) => setEditingTask((t) => ({ ...t, description: e.target.value }))}
                placeholder={"1. Sight the chain register and identify next survey due date\n2. Note the SWL of lifting gear on board\n..."} />
            </div>

            <label className="ob-toggle-row" onClick={() => setEditingTask((t) => ({ ...t, requiresProof: !t.requiresProof }))}>
              <div className={`ob-switch${editingTask.requiresProof ? ' ob-switch--on' : ''}`}>
                <div className="ob-switch-dot" />
              </div>
              <div>
                <div className="ob-toggle-label"><Paperclip size={13} /> Require document / photo attachment</div>
                <div className="ob-toggle-sub">Officer must upload a file when completing this task</div>
              </div>
            </label>
          </div>

          <div className="ob-editor-foot">
            <button className="ob-btn ob-btn-ghost" onClick={() => { setEditingTask(null); setError('') }}>Discard</button>
            <button className="ob-btn ob-btn-primary" onClick={saveTask} disabled={!editingTask.title.trim()}>
              <Save size={14} /> Save task
            </button>
          </div>
        </div>
      )}

      {/* ---- Program Settings card ---- */}
      {showSettings && settingsForm && (
        <div className="ob-editor">
          <div className="ob-editor-bar" />
          <div className="ob-editor-head">
            <div className="ob-editor-ring"><Settings size={15} /></div>
            <div className="ob-editor-head-text">
              <div className="ob-editor-title">Program settings</div>
              <div className="ob-editor-sub">Title, department and rank range</div>
            </div>
            <button className="ob-editor-close" onClick={() => setShowSettings(false)} aria-label="Close"><X size={15} /></button>
          </div>

          <div className="ob-editor-body">
            <div className="ob-grid-2">
              <div className="ob-field">
                <label className="ob-label">Title</label>
                <input className="ob-input" value={settingsForm.title}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="ob-field">
                <label className="ob-label">Subtitle</label>
                <input className="ob-input" value={settingsForm.subtitle}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, subtitle: e.target.value }))} />
              </div>
            </div>
            <div className="ob-grid-3">
              <div className="ob-field">
                <label className="ob-label">Department</label>
                <CardSelect value={settingsForm.department}
                  onChange={(v) => setSettingsForm((f) => ({ ...f, department: v }))}
                  options={[
                    { value: 'deck', label: 'Deck', icon: Ship },
                    { value: 'engine', label: 'Engine', icon: Cog },
                  ]} />
              </div>
              <div className="ob-field">
                <label className="ob-label">From rank</label>
                <CardSelect value={settingsForm.fromRank} placeholder="—"
                  onChange={(v) => setSettingsForm((f) => ({ ...f, fromRank: v }))}
                  options={rankOptions.map((r) => ({ value: r, label: r }))} />
              </div>
              <div className="ob-field">
                <label className="ob-label">To rank</label>
                <CardSelect value={settingsForm.toRank} placeholder="—"
                  onChange={(v) => setSettingsForm((f) => ({ ...f, toRank: v }))}
                  options={rankOptions.map((r) => ({ value: r, label: r }))} />
              </div>
            </div>
          </div>

          <div className="ob-editor-foot">
            <button className="ob-btn ob-btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
            <button className="ob-btn ob-btn-primary" onClick={saveSettings}><Save size={14} /> Save settings</button>
          </div>
        </div>
      )}

      {/* ---- Task list ---- */}
      {program.tasks.length === 0 ? (
        <div className="ob-empty">
          <div className="ob-empty-icon"><ListChecks size={22} /></div>
          <div className="ob-empty-title">No tasks yet</div>
          <div className="ob-empty-desc">Click <strong>Add Task</strong> above to start building this checklist.</div>
        </div>
      ) : (
        <div className="ob-list">
          {program.tasks.map((task, i) => (
            <TaskItem key={task.id} task={task} index={i} total={program.tasks.length}
              onEdit={setEditingTask} onDelete={deleteTask} onMove={moveTask} />
          ))}
        </div>
      )}
    </div>
  )
}
