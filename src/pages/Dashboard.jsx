import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { Shell, Header, Card, Button, Chip } from '../components/ui.jsx'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const [tournaments, setTournaments] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, slug, title, status, created_at, tournament_members!inner(role)')
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
    <Shell>
      <Header
        title="Tee Trip"
        right={<Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>}
      />

      <Card padded={false}>
        <div style={{
          padding: '14px 18px 6px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
            Your tournaments
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/new/round" style={{ textDecoration: 'none' }}>
              <Button size="sm">New round</Button>
            </Link>
            <Link to="/new" style={{ textDecoration: 'none' }}>
              <Button size="sm" variant="ghost">New trip</Button>
            </Link>
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--tt-pencil)', padding: '0 18px 16px', margin: 0 }} className="tt-small">
            {error}
          </p>
        )}

        {!error && tournaments === null && (
          <p className="tt-small tt-muted" style={{ padding: '0 18px 16px', margin: 0 }}>
            Loading…
          </p>
        )}

        {!error && tournaments?.length === 0 && (
          <p className="tt-small tt-muted" style={{ padding: '0 18px 16px', margin: 0 }}>
            No tournaments yet. Start one — takes about 5 minutes.
          </p>
        )}

        {!error && tournaments?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tournaments.map(t => {
              const role = t.tournament_members?.[0]?.role ?? 'member'
              return (
                <li key={t.id} style={{ borderTop: '1px solid var(--tt-line)' }}>
                  <Link
                    to={`/t/${t.slug}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '12px 18px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span>
                      <strong style={{ fontWeight: 600 }}>{t.title}</strong>
                      <span className="tt-xs tt-muted" style={{ marginLeft: 8, textTransform: 'capitalize' }}>
                        {role}
                      </span>
                    </span>
                    <span className="tt-xs tt-muted">{t.status}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Chip tone="format">PWA</Chip>
        <span className="tt-xs tt-muted">
          Installable to home screen — same scoring, offline-ready.
        </span>
      </div>
    </Shell>
  )
}
