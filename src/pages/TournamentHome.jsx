import { useMemo } from 'react'
import { Link, NavLink, Route, Routes, useParams, Navigate } from 'react-router-dom'
import { useTournament } from '../lib/useTournament.js'
import { useAuth } from '../lib/auth.jsx'
import {
  computeLeaderboard,
  computeSkinsForTournament, isSkinsEligible,
  computeNassauForTournament, isNassauEligible,
  computeVegasForTournament,
} from '../lib/scoring.js'
import { Shell, Header, Card, Chip, PlayerAvatar } from '../components/ui.jsx'

export default function TournamentHome() {
  const { slug } = useParams()
  const { user } = useAuth()
  const t = useTournament(slug)

  if (t.loading) {
    return <Shell><p className="tt-muted">Loading…</p></Shell>
  }
  if (t.error) {
    return (
      <Shell>
        <Link to="/dashboard" className="tt-small tt-muted">← Dashboard</Link>
        <Card>
          <p style={{ color: 'var(--tt-pencil)' }}>{t.error}</p>
        </Card>
      </Shell>
    )
  }

  const myMembership = t.members.find(m => m.user_id === user?.id)
  const isOwnerOrAdmin = ['owner', 'admin'].includes(myMembership?.role)

  const activeRound = t.rounds.find(r => r.status === 'active')
  const eyebrow = activeRound
    ? `R${activeRound.round_number} · live`
    : t.tournament.status

  return (
    <Shell>
      <Link
        to="/dashboard"
        className="tt-small tt-muted"
        style={{ display: 'inline-block', marginBottom: 6 }}
      >← Dashboard</Link>
      <Header
        eyebrow={eyebrow}
        title={t.tournament.title}
        meta={`${t.players.length} players · ${t.rounds.length} rounds · status: ${t.tournament.status}`}
        right={activeRound ? <Chip tone="danger" live>LIVE</Chip> : null}
      />

      <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16 }}>
        <TabLink to={`/t/${slug}`} end>Leaderboard</TabLink>
        <TabLink to={`/t/${slug}/rounds`}>Rounds</TabLink>
        <TabLink to={`/t/${slug}/games`}>Side games</TabLink>
        <TabLink to={`/t/${slug}/chat`}>Chat</TabLink>
        {isOwnerOrAdmin && <TabLink to={`/t/${slug}/settings`}>Settings</TabLink>}
      </nav>

      <Routes>
        <Route index element={<Leaderboard {...t} />} />
        <Route path="rounds" element={<RoundsList {...t} />} />
        <Route path="games" element={<SideGamesBoard {...t} />} />
        {/* Back-compat: old /skins URL */}
        <Route path="skins" element={<Navigate to={`/t/${slug}/games`} replace />} />
        <Route path="chat" element={<ChatStub />} />
        <Route
          path="settings"
          element={isOwnerOrAdmin ? <SettingsStub {...t} /> : <Navigate to={`/t/${slug}`} replace />}
        />
      </Routes>
    </Shell>
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
        background: isActive ? 'var(--tt-fairway)' : 'transparent',
        color: isActive ? '#fff' : 'var(--tt-ink-soft)',
        fontSize: 14,
        fontWeight: 600,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
        transition: 'background 150ms linear, color 150ms linear',
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
    return <Card><p className="tt-muted">No players yet.</p></Card>
  }

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th style={leaderTh} className="tt-eyebrow">#</th>
            <th style={leaderTh} className="tt-eyebrow">Player</th>
            {rounds.map(r => (
              <th key={r.id} style={{ ...leaderTh, textAlign: 'center' }} className="tt-eyebrow" title={r.name}>
                R{r.round_number}
              </th>
            ))}
            <th style={{ ...leaderTh, textAlign: 'right' }} className="tt-eyebrow">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const winner = i === 0 && row.total > 0
            return (
              <tr key={row.playerId} style={{
                borderTop: '1px solid var(--tt-line)',
                background: winner ? 'rgba(196,154,58,0.08)' : 'transparent',
              }}>
                <td style={{ ...leaderTd, position: 'relative' }}>
                  {winner && (
                    <span style={{
                      position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--tt-trophy)',
                    }} />
                  )}
                  <span style={{ paddingLeft: winner ? 12 : 0 }}>{i + 1}</span>
                </td>
                <td style={{ ...leaderTd, fontFamily: 'var(--tt-font-ui)' }}>
                  <span style={{ marginRight: 6 }}>{row.player.emoji}</span>
                  {row.player.name}
                </td>
                {rounds.map(r => (
                  <td key={r.id} style={{ ...leaderTd, textAlign: 'center', color: 'var(--tt-ink-soft)' }}>
                    {fmt(row.perRound[r.id])}
                  </td>
                ))}
                <td style={{ ...leaderTd, textAlign: 'right', fontWeight: 700 }}>{fmt(row.total)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function RoundsList({ rounds, holes }) {
  const { slug } = useParams()
  if (!rounds.length) {
    return <Card><p className="tt-muted">No rounds configured.</p></Card>
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rounds.map(r => {
        const roundHoles = holes.filter(h => h.round_id === r.id).sort((a, b) => a.hole - b.hole)
        const totalPar = roundHoles.reduce((s, h) => s + (h.par || 0), 0)
        return (
          <Link
            key={r.id}
            to={`/t/${slug}/round/${r.round_number}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontFamily: 'var(--tt-font-display)', fontSize: 18, fontWeight: 600 }}>
                  R{r.round_number} — {r.name}
                </strong>
                <Chip tone="format">{r.format.replace('_', ' ')}</Chip>
              </div>
              <p className="tt-small tt-muted" style={{ margin: '6px 0 0' }}>
                {roundHoles.length} holes · par {totalPar} · status {r.status}
              </p>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

function SideGamesBoard({ players, rounds, holes, scores, roundStrokes }) {
  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p])),
    [players]
  )

  return (
    <div className="stack">
      <SkinsSection {...{ players, rounds, holes, scores, roundStrokes, playerMap }} />
      <NassauSection {...{ players, rounds, holes, scores, roundStrokes, playerMap }} />
      <VegasSection {...{ rounds, holes, scores, roundStrokes, playerMap }} />
    </div>
  )
}

function SkinsSection({ players, rounds, holes, scores, roundStrokes, playerMap }) {
  const eligibleRounds = useMemo(() => rounds.filter(r => isSkinsEligible(r)), [rounds])
  const { totals, byRound } = useMemo(
    () => computeSkinsForTournament({ players, rounds, holes, scores, roundStrokes }),
    [players, rounds, holes, scores, roundStrokes]
  )
  const rows = useMemo(() => Object.entries(totals)
    .map(([pid, n]) => ({ player: playerMap[pid], total: n }))
    .filter(r => r.player)
    .sort((a, b) => b.total - a.total)
  , [totals, playerMap])
  const allUnsettled = eligibleRounds.reduce((s, r) => s + (byRound[r.id]?.unsettled || 0), 0)

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <SectionHeader
        title="Skins"
        sub={eligibleRounds.length === 0
          ? 'No individual-format rounds — add one to enable.'
          : `Field-wide · net · ${eligibleRounds.length} eligible round${eligibleRounds.length === 1 ? '' : 's'}`}
      />
      {eligibleRounds.length > 0 && (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={sgTh} className="tt-eyebrow">#</th>
                <th style={sgTh} className="tt-eyebrow">Player</th>
                <th style={{ ...sgTh, textAlign: 'right' }} className="tt-eyebrow">Skins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => <LeaderRow key={row.player.id} row={row} rank={i + 1} />)}
            </tbody>
          </table>
          {allUnsettled > 0 && (
            <p className="tt-small tt-muted" style={{ margin: 0, padding: '8px 18px 14px' }}>
              {allUnsettled} skin{allUnsettled === 1 ? '' : 's'} still carrying.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function NassauSection({ players, rounds, holes, scores, roundStrokes, playerMap }) {
  const eligibleRounds = useMemo(() => rounds.filter(r => isNassauEligible(r)), [rounds])
  const { totals } = useMemo(
    () => computeNassauForTournament({ players, rounds, holes, scores, roundStrokes }),
    [players, rounds, holes, scores, roundStrokes]
  )
  const rows = useMemo(() => Object.entries(totals)
    .map(([pid, n]) => ({ player: playerMap[pid], total: n }))
    .filter(r => r.player)
    .sort((a, b) => b.total - a.total)
  , [totals, playerMap])

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <SectionHeader
        title="Nassau"
        sub={eligibleRounds.length === 0
          ? 'No individual-format rounds — add one to enable.'
          : `Front 9 · Back 9 · Total — net · ${eligibleRounds.length} round${eligibleRounds.length === 1 ? '' : 's'}`}
      />
      {eligibleRounds.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={sgTh} className="tt-eyebrow">#</th>
              <th style={sgTh} className="tt-eyebrow">Player</th>
              <th style={{ ...sgTh, textAlign: 'right' }} className="tt-eyebrow">Legs won</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => <LeaderRow key={row.player.id} row={row} rank={i + 1} />)}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function VegasSection({ rounds, holes, scores, roundStrokes, playerMap }) {
  const { byRound } = useMemo(
    () => computeVegasForTournament({ rounds, holes, scores, roundStrokes }),
    [rounds, holes, scores, roundStrokes]
  )
  const eligibleRounds = rounds.filter(r => byRound[r.id]?.eligible)

  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <SectionHeader
        title="Vegas"
        sub={eligibleRounds.length === 0
          ? 'Needs a round with exactly two 2-player teams. None set up yet.'
          : `2v2 head-to-head · gross · ${eligibleRounds.length} round${eligibleRounds.length === 1 ? '' : 's'}`}
      />
      {eligibleRounds.length > 0 && (
        <div style={{ padding: '0 18px 14px' }}>
          {eligibleRounds.map(r => {
            const v = byRound[r.id]
            const teamA = v.teams.A.map(pid => playerMap[pid]?.emoji ?? '⛳').join('')
            const teamB = v.teams.B.map(pid => playerMap[pid]?.emoji ?? '⛳').join('')
            const margin = v.total.A - v.total.B
            const leader = margin === 0 ? null : (margin > 0 ? 'A' : 'B')
            return (
              <div key={r.id} style={{
                padding: '10px 0',
                borderTop: '1px solid var(--tt-line)',
              }}>
                <div className="tt-small" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>R{r.round_number} — {r.name}</strong>
                  <span style={{ fontFamily: 'var(--tt-font-mono)' }}>
                    {teamA} <strong style={{ color: leader === 'A' ? 'var(--tt-fairway)' : undefined }}>{v.total.A}</strong>
                    {' · '}
                    {teamB} <strong style={{ color: leader === 'B' ? 'var(--tt-fairway)' : undefined }}>{v.total.B}</strong>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{
      padding: '12px 18px 6px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        {title}
      </h2>
      <span className="tt-xs tt-muted" style={{ textAlign: 'right' }}>{sub}</span>
    </div>
  )
}

function LeaderRow({ row, rank }) {
  const leader = rank === 1 && row.total > 0
  return (
    <tr style={{
      borderTop: '1px solid var(--tt-line)',
      background: leader ? 'rgba(196,154,58,0.08)' : 'transparent',
    }}>
      <td style={{ ...sgTd, position: 'relative' }}>
        {leader && (
          <span style={{
            position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
            width: 6, height: 6, borderRadius: '50%', background: 'var(--tt-trophy)',
          }} />
        )}
        <span style={{ paddingLeft: leader ? 12 : 0 }}>{rank}</span>
      </td>
      <td style={{ ...sgTd, fontFamily: 'var(--tt-font-ui)' }}>
        <span style={{ marginRight: 6 }}>{row.player.emoji}</span>
        {row.player.name}
      </td>
      <td style={{ ...sgTd, textAlign: 'right', fontWeight: 700 }}>{row.total}</td>
    </tr>
  )
}

const sgTh = {
  padding: '10px 12px', background: 'var(--tt-fairway)', color: '#fff',
  textAlign: 'left', fontWeight: 600, fontFamily: 'var(--tt-font-ui)',
}
const sgTd = {
  padding: '10px 12px', fontFamily: 'var(--tt-font-mono)',
  fontVariantNumeric: 'tabular-nums', fontSize: 14,
}

function ChatStub() {
  return (
    <Card>
      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Trip chat</div>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Realtime + push notifications coming next.
      </p>
    </Card>
  )
}

function SettingsStub({ tournament, players, members }) {
  return (
    <Card>
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: '0 0 6px' }}>Settings</h2>
      <p className="tt-small tt-muted" style={{ margin: '0 0 14px' }}>
        Players, members, scoring config.
      </p>

      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Players · {players.length}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {players.map(p => (
          <PlayerAvatar key={p.id} emoji={p.emoji} name={p.name} withName size={40} />
        ))}
      </div>

      <div className="tt-eyebrow" style={{ marginBottom: 8 }}>Members · {members.length}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {members.map(m => (
          <li key={m.id} className="tt-small" style={{
            padding: '6px 0',
            borderTop: '1px solid var(--tt-line)',
            color: 'var(--tt-ink-soft)',
          }}>
            {m.user_id ? `User ${m.user_id.slice(0, 8)}…` : `Invite: ${m.email_invite}`}
            <span className="tt-xs tt-muted" style={{ marginLeft: 8, textTransform: 'capitalize' }}>
              {m.role}
            </span>
          </li>
        ))}
      </ul>

      <div className="tt-eyebrow" style={{ margin: '14px 0 6px' }}>Share</div>
      <code style={{
        display: 'block',
        padding: '8px 10px',
        background: 'var(--tt-cream-deep)',
        border: '1px solid var(--tt-line)',
        borderRadius: 8,
        fontSize: 13,
      }}>tee-trip.app/t/{tournament.slug}</code>
    </Card>
  )
}

const leaderTh = {
  padding: '10px 12px',
  background: 'var(--tt-fairway)',
  color: '#fff',
  textAlign: 'left',
  fontWeight: 600,
  fontFamily: 'var(--tt-font-ui)',
}
const leaderTd = {
  padding: '10px 12px',
  fontFamily: 'var(--tt-font-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 14,
}

function fmt(n) {
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
