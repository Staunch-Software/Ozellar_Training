import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCourses, getMyOrientationEnrollment } from '../api.js'

export default function CrewDashboardRouter() {
  const navigate = useNavigate()

  useEffect(() => {
    async function routeUser() {
      try {
        const courses = await getCourses()
        // If they have courses, default to courses.
        if (courses && courses.length > 0) {
          navigate('/my-courses', { replace: true })
          return
        }
        
        // If they have no courses, check orientation
        const orient = await getMyOrientationEnrollment()
        if (orient) {
          navigate('/orientation', { replace: true })
          return
        }
        
        // If they have neither, default back to courses (where they will see the empty state)
        navigate('/my-courses', { replace: true })
      } catch (e) {
        navigate('/my-courses', { replace: true })
      }
    }
    routeUser()
  }, [navigate])

  return <div className="spinner">Routing...</div>
}
