import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [tournaments, setTournaments] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, slug, title, created_at, tournament_members!inner(role)')
        .eq('tournament_members.user_id', user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setTournaments(data ?? [])
    }
    load()
    return () => { cancelled = true }
  }, [user.id])

  return (
    <div className="shell stack">
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Tee Trip</h1>
        <button className="btn btn--ghost small" onClick={signOut}>Sign out</button>
      </header>

      <div className="card stack--tight">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Your tournaments</h2>
          <Link to="/new" className="btn small">New tournament</Link>
        </div>

        {error && <p style={{ color: 'var(--danger)' }} className="small">{error}</p>}
        {!error && tournaments === null && <p className="muted small">Loading…</p>}
        {!error && tournaments?.length === 0 && (
          <p className="muted small">
            No tournaments yet. Start one — takes about 5 minutes.
          </p>
        )}
        {!error && tournaments?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tournaments.map(t => (
              <li key={t.id} style={{ padding: '.6rem 0', borderTop: '1px solid var(--line)' }}>
                <Link to={`/t/${t.slug}`} style={{ display: 'block' }}>
                  <strong>{t.title}</strong>
                  <span className="muted small" style={{ marginLeft: '.5rem' }}>
                    {t.tournament_members?.[0]?.role ?? 'member'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
