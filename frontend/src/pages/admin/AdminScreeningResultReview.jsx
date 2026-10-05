import { useParams, useNavigate } from 'react-router-dom'
import AdminScreeningAnswersReview from './AdminScreeningAnswersReview.jsx'

export default function AdminScreeningResultReview() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px', minHeight: '100vh', background: 'var(--bg)' }}>
      <AdminScreeningAnswersReview
        candidateId={id}
        onBack={() => navigate('/admin/screening')}
      />
    </div>
  )
}
