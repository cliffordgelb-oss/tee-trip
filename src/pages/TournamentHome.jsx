import { useMemo } from 'react'
import { Link, NavLink, Route, Routes, useParams, Navigate } from 'react-router-dom'
import { useTournament } from '../lib/useTournament.js'
import { useAuth } from '../lib/auth.jsx'
import { computeLeaderboard } from '../lib/scoring.js'

export default function TournamentHome() {
  const { slug } = useParams()
  const { user } = useAuth()
  const t = useTournament(slug)

  if (t.loading) {
    return <div className="shell"><p className="muted">Loading…</p></div>
  }
  if (t.error) {
    return (
      <div className="shell stack">
        <Link to="/dashboard" className="small muted">← Dashboard</Link>
        <div className="card">
          <p style={{ color: 'var(--danger)' }}>{t.error}</p>
        </div>
      </div>
    )
  }

  const myMembership = t.members.find(m => m.user_id === user?.id)
  const isOwnerOrAdmin = ['owner', 'admin'].includes(myMembership?.role)

  return (
    <div className="shell stack">
      <header className="stack--tight">
        <Link to="/dashboard" className="small muted">← Dashboard</Link>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>{t.tournament.title}</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {t.players.length} players · {t.rounds.length} rounds · status: {t.tournament.status}
        </p>
      </header>

      <nav style={{ display: 'flex', gap: '.25rem', overflowX: 'auto' }}>
        <TabLink to={`/t/${slug}`} end>Leaderboard</TabLink>
        <TabLink to={`/t/${slug}/rounds`}>Rounds</TabLink>
        <TabLink to={`/t/${slug}/chat`}>Chat</TabLink>
        {isOwnerOrAdmin && <TabLink to={`/t/${slug}/settings`}>Settings</TabLink>}
      </nav>

      <Routes>
        <Route index element={<Leaderboard {...t} />} />
        <Route path="rounds" element={<RoundsList {...t} />} />
        <Route path="chat" element={<ChatStub />} />
        <Route path="settings" element={isOwnerOrAdmin ? <SettingsStub {...t} /> : <Navigate to={`/t/${slug}`} replace />} />
      </Routes>
    </div>
  )
}

function TabLink({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: '.4rem .8rem',
        borderRadius: 8,
        background: isActive ? 'var(--accent)' : 'transparent',
        color: isActive ? '#fff' : 'var(--ink-soft)',
        fontSize: '.9rem',
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      })}
    >{children}</NavLink>
  )
}

function Leaderboard({ tournament, players, rounds, holes, scores, roundStrokes }) {
  const rows = useMemo(() => {
    if (!players.length || !rounds.length) return []
    return computeLeaderboard({
      players,
      rounds,
      holes,
      scores,
      roundStrokes,
      scoringConfig: tournament.scoring_config,
      championshipTierSize: tournament.championship_tier_size,
    })
  }, [tournament, players, rounds, holes, scores, roundStrokes])

  if (!players.length) {
    return <div className="card"><p className="muted">No players yet.</p></div>
  }

  return (
    <div className="card">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>Player</th>
            {rounds.map(r => (
              <th key={r.id} style={th} title={r.name}>R{r.round_number}</th>
            ))}
            <th style={{ ...th, textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.playerId} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={td}>{i + 1}</td>
              <td style={td}>
                <span style={{ marginRight: '.4em' }}>{row.player.emoji}</span>
                {row.player.name}
              </td>
              {rounds.map(r => (
                <td key={r.id} style={{ ...td, textAlign: 'center', color: 'var(--ink-soft)' }}>
                  {fmt(row.perRound[r.id])}
                </td>
              ))}
              <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoundsList({ rounds, holes }) {
  const { slug } = useParams()
  if (!rounds.length) {
    return <div className="card"><p className="muted">No rounds configured.</p></div>
  }
  return (
    <div className="stack--tight">
      {rounds.map(r => {
        const roundHoles = holes.filter(h => h.round_id === r.id).sort((a, b) => a.hole - b.hole)
        const totalPar = roundHoles.reduce((s, h) => s + (h.par || 0), 0)
        return (
          <Link
            key={r.id}
            to={`/t/${slug}/round/${r.round_number}`}
            className="card"
            style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>R{r.round_number} — {r.name}</strong>
              <span className="small muted">{r.format.replace('_', ' ')}</span>
            </div>
            <p className="small muted" style={{ margin: '.25rem 0 0' }}>
              {roundHoles.length} holes · par {totalPar} · status {r.status}
            </p>
          </Link>
        )
      })}
    </div>
  )
}

function ChatStub() {
  return <div className="card"><p className="muted small">Chat coming next.</p></div>
}

function SettingsStub({ players, members }) {
  return (
    <div className="card stack">
      <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Settings</h2>
      <p className="small muted">Editable settings coming next. Today: players + members.</p>
      <div>
        <h3 className="small" style={{ margin: '.5rem 0' }}>Players ({players.length})</h3>
        <ul className="small muted" style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {players.map(p => (
            <li key={p.id}>{p.emoji} {p.name} <code>({p.slug})</code></li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="small" style={{ margin: '.5rem 0' }}>Members ({members.length})</h3>
        <ul className="small muted" style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {members.map(m => (
            <li key={m.id}>
              {m.user_id ? `User ${m.user_id.slice(0, 8)}…` : `Invite: ${m.email_invite}`}
              {' '}— {m.role}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const th = { textAlign: 'left', padding: '.5rem .4rem', fontWeight: 600, fontSize: '.85rem', color: 'var(--ink-soft)' }
const td = { padding: '.5rem .4rem', fontSize: '.95rem' }

function fmt(n) {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
