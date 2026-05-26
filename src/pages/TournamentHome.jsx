import { Link, useParams } from 'react-router-dom'

export default function TournamentHome() {
  const { slug } = useParams()
  return (
    <div className="shell stack">
      <Link to="/dashboard" className="small muted">← Dashboard</Link>
      <div className="card stack">
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{slug}</h1>
        <p className="muted small">
          Tournament view — leaderboard, live, rounds, scorecard, awards, chat.
        </p>
        <p className="muted small">Porting from BamaApp in the next step.</p>
      </div>
    </div>
  )
}
