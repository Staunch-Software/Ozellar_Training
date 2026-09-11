import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, GraduationCap, CheckSquare } from 'lucide-react'
import { adminGetOrientationProgram } from '../../api.js'

export default function AdminOrientationPreview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [program, setProgram] = useState(null)

  useEffect(() => { adminGetOrientationProgram(id).then(setProgram) }, [id])

  if (!program) return <div className="spinner">Loading preview…</div>

  return (
    <div className="orn-preview-page">
      <div className="orn-preview-nav">
        <button className="btn sm" onClick={() => navigate(`/admin/orientation/${id}`)}>
          <ArrowLeft size={14} /> Exit Preview
        </button>
        <div className="orn-preview-brand">
          <GraduationCap size={17} color="#7c3aed" /> {program.title} — Crew Preview
        </div>
      </div>

      <div className="orn-preview-body">
        <p className="orn-preview-intro">
          This is what the crew member sees: a checklist of {program.tasks.length} tasks. This view is
          read-only — no completion state is recorded here.
        </p>
        <div className="orn-list-lg">
          {program.tasks.map((task, i) => (
            <div key={task.id} className="orn-preview-task">
              <CheckSquare size={18} color="var(--text-faint)" className="orn-preview-task-icon" />
              <div>
                <div className="orn-preview-task-title">{i + 1}. {task.title}</div>
                {task.description && <div className="orn-preview-task-desc">{task.description}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
