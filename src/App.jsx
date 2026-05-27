import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewTournament from './pages/NewTournament.jsx'
import TournamentHome from './pages/TournamentHome.jsx'
import RoundDetail from './pages/RoundDetail.jsx'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RedirectIfAuthed({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="shell"><p className="muted">Loading…</p></div>
  if (session) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth><NewTournament /></RequireAuth>} />
        <Route path="/new/round" element={<RequireAuth><NewTournament mode="round" /></RequireAuth>} />
        <Route path="/t/:slug/round/:number" element={<RequireAuth><RoundDetail /></RequireAuth>} />
        <Route path="/t/:slug/*" element={<RequireAuth><TournamentHome /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
