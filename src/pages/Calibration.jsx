import { useAuth } from '../App'

export default function Calibration() {
  const { profile } = useAuth()
  const isAdmin = ['admin', 'owner'].includes(profile?.role)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calibration</h1>
          <p className="page-sub">
            {isAdmin ? 'Manage calibration sessions and results' : 'Your calibration sessions'}
          </p>
        </div>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 14 }}>
        Calibration module loading…
      </div>
    </div>
  )
}
