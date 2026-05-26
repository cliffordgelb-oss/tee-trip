import { Link } from 'react-router-dom'

export default function NewTournament() {
  return (
    <div className="shell stack">
      <Link to="/dashboard" className="small muted">← Back</Link>
      <div className="card stack">
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>New tournament</h1>
        <p className="muted small">
          Setup wizard goes here — title, players, scoring, rounds, courses.
        </p>
        <p className="muted small">Coming in the next step.</p>
      </div>
    </div>
  )
}
