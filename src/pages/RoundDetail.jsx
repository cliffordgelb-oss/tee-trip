import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { useTournament } from '../lib/useTournament.js'
import {
  deriveStrokesForFormat, getStrokesOnHole,
  computeSkinsForRound, isSkinsEligible,
  computeNassauForRound, isNassauEligible,
  computeVegasForRound,
  computeBBBForRound, BBB_EVENT_TYPES,
} from '../lib/scoring.js'
import { Shell, Header, Card, Button, Chip, PencilFilters } from '../components/ui.jsx'

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function RoundDetail() {
  const { slug, number } = useParams()
  const { user } = useAuth()
  const t = useTournament(slug)

  if (t.loading) return <Shell><p className="tt-muted">Loading…</p></Shell>
  if (t.error) {
    return (
      <Shell>
        <p style={{ color: 'var(--tt-pencil)' }}>{t.error}</p>
      </Shell>
    )
  }

  const round = t.rounds.find(r => String(r.round_number) === String(number))
  if (!round) {
    return (
      <Shell>
        <Link to={`/t/${slug}/rounds`} className="tt-small tt-muted">← Rounds</Link>
        <Card><p>Round not found.</p></Card>
      </Shell>
    )
  }

  const myMembership = t.members.find(m => m.user_id === user?.id)
  const isOwnerOrAdmin = ['owner', 'admin'].includes(myMembership?.role)
  const roundHoles = t.holes.filter(h => h.round_id === round.id).sort((a, b) => a.hole - b.hole)
  const roundStrokes = t.roundStrokes.filter(rs => rs.round_id === round.id)
  const roundScores = t.scores.filter(s => s.round_id === round.id)
  const totalPar = roundHoles.reduce((s, h) => s + (h.par || 0), 0)

  return (
    <Shell>
      <Link
        to={`/t/${slug}/rounds`}
        className="tt-small tt-muted"
        style={{ display: 'inline-block', marginBottom: 6 }}
      >← Rounds</Link>
      <Header
        eyebrow={`Round ${round.round_number}`}
        title={round.name}
        meta={`${round.format.replace('_', ' ')} · ${roundHoles.length} holes · par ${totalPar} · status ${round.status}`}
        right={<Chip tone="format">{round.format.replace('_', ' ')}</Chip>}
      />

      <RoundSetup
        tournament={t.tournament}
        round={round}
        players={t.players}
        roundStrokes={roundStrokes}
        canEdit={isOwnerOrAdmin}
        onSaved={t.refetch}
      />

      <h2 style={{
        fontFamily: 'var(--tt-font-display)',
        fontSize: 'var(--tt-text-lg)',
        margin: '20px 0 10px',
      }}>Scorecard</h2>

      <Scorecard
        round={round}
        players={t.players}
        holes={roundHoles}
        roundStrokes={roundStrokes}
        scores={roundScores}
        myUserId={user?.id}
        members={t.members}
        onChange={t.refetch}
      />

      {isSkinsEligible(round) && (
        <SkinsPanel
          round={round}
          players={t.players}
          holes={roundHoles}
          scores={roundScores}
          roundStrokes={roundStrokes}
        />
      )}

      {isNassauEligible(round) && (
        <NassauPanel
          round={round}
          players={t.players}
          holes={roundHoles}
          scores={roundScores}
          roundStrokes={roundStrokes}
        />
      )}

      <VegasPanel
        round={round}
        players={t.players}
        holes={roundHoles}
        scores={roundScores}
        roundStrokes={roundStrokes}
      />

      <BBBPanel
        round={round}
        tournamentId={t.tournament.id}
        players={t.players}
        holes={roundHoles}
        holeEvents={t.holeEvents ?? []}
        onChange={t.refetch}
      />
    </Shell>
  )
}

// ── Bingo Bango Bongo panel (per round) ──────────────────────
function BBBPanel({ round, tournamentId, players, holes, holeEvents, onChange }) {
  const [editing, setEditing] = useState(false)
  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p])),
    [players]
  )
  const { totals, byHole } = useMemo(
    () => computeBBBForRound({ round, players, holeEvents }),
    [round, players, holeEvents]
  )
  const standings = useMemo(() => Object.entries(totals)
    .map(([pid, n]) => ({ player: playerMap[pid], total: n }))
    .filter(r => r.player)
    .sort((a, b) => b.total - a.total)
  , [totals, playerMap])

  const sortedHoles = useMemo(
    () => [...holes].sort((a, b) => a.hole - b.hole),
    [holes]
  )

  async function setEvent(hole, eventType, playerId) {
    if (!playerId) {
      const { error } = await supabase
        .from('hole_events')
        .delete()
        .eq('round_id', round.id)
        .eq('hole', hole)
        .eq('event_type', eventType)
      if (error) { alert(error.message); return }
    } else {
      const { error } = await supabase
        .from('hole_events')
        .upsert(
          { round_id: round.id, tournament_id: tournamentId, hole, player_id: playerId, event_type: eventType },
          { onConflict: 'round_id,hole,event_type' }
        )
      if (error) { alert(error.message); return }
    }
    onChange?.()
  }

  const hasAny = standings.some(s => s.total > 0)

  return (
    <>
      <h2 style={{
        fontFamily: 'var(--tt-font-display)',
        fontSize: 'var(--tt-text-lg)',
        margin: '20px 0 10px',
      }}>Bingo Bango Bongo</h2>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <p className="tt-xs tt-muted" style={{ margin: 0, maxWidth: '60%' }}>
            Tap an event cell to assign it: first on green / closest to pin / first in hole.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setEditing(e => !e)}>
            {editing ? 'Done' : 'Edit'}
          </Button>
        </div>

        {/* Standings */}
        {hasAny ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
            {standings.map((row, i) => (
              <li
                key={row.player.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--tt-line)',
                }}
              >
                <span className="tt-small">
                  <span style={{ marginRight: 6 }}>{row.player.emoji}</span>
                  {row.player.name}
                </span>
                <span style={{ fontFamily: 'var(--tt-font-mono)', fontWeight: 700 }}>
                  {row.total}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tt-small tt-muted" style={{ margin: '0 0 14px' }}>
            No events awarded yet.
          </p>
        )}

        {editing && (
          <div className="stack--tight">
            <div className="tt-eyebrow">Award events</div>
            <div style={{
              overflowX: 'auto',
              border: '1px solid var(--tt-line)',
              borderRadius: 8,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr>
                    <th style={bbbTh}>Hole</th>
                    <th style={bbbTh}>Par</th>
                    <th style={bbbTh}>Bingo</th>
                    <th style={bbbTh}>Bango</th>
                    <th style={bbbTh}>Bongo</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoles.map(h => (
                    <tr key={h.hole} style={{ borderTop: '1px solid var(--tt-line)' }}>
                      <td style={bbbTd}>{h.hole}</td>
                      <td style={{ ...bbbTd, color: 'var(--tt-ink-muted)' }}>{h.par}</td>
                      {BBB_EVENT_TYPES.map(et => (
                        <td key={et} style={bbbTd}>
                          <select
                            value={byHole[h.hole]?.[et] ?? ''}
                            onChange={e => setEvent(h.hole, et, e.target.value || null)}
                            style={{
                              fontFamily: 'inherit',
                              fontSize: 13,
                              padding: '4px 6px',
                              border: '1px solid var(--tt-line)',
                              borderRadius: 6,
                              background: 'var(--tt-paper)',
                              width: '100%',
                              minWidth: 110,
                            }}
                          >
                            <option value="">—</option>
                            {players.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.emoji} {p.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!editing && hasAny && (
          <>
            <div className="tt-eyebrow" style={{ marginBottom: 6 }}>Hole by hole</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {sortedHoles.map(h => (
                <BBBHolePill key={h.hole} hole={h.hole} events={byHole[h.hole]} playerMap={playerMap} />
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  )
}

function BBBHolePill({ hole, events, playerMap }) {
  const count = events ? Object.keys(events).length : 0
  if (count === 0) {
    return (
      <span style={{ ...bbbPillBase, color: 'var(--tt-ink-muted)', opacity: 0.4 }}>
        {hole}
      </span>
    )
  }
  return (
    <span style={{ ...bbbPillBase, background: 'var(--tt-fairway-tint)', color: 'var(--tt-fairway-deep)' }}>
      <span style={{ fontFamily: 'var(--tt-font-mono)' }}>{hole}</span>
      {' '}
      {BBB_EVENT_TYPES.map(et => events[et] ? playerMap[events[et]]?.emoji ?? '⛳' : null)
        .filter(Boolean)
        .join('')}
    </span>
  )
}

const bbbPillBase = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 8px',
  borderRadius: 8,
  fontFamily: 'var(--tt-font-ui)',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid var(--tt-line)',
}
const bbbTh = {
  padding: '6px 8px',
  background: 'var(--tt-fairway)',
  color: '#fff',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}
const bbbTd = {
  padding: '4px 6px',
  fontSize: 13,
  textAlign: 'center',
  fontFamily: 'var(--tt-font-mono)',
}

// ── Nassau panel (per round) ─────────────────────────────────
function NassauPanel({ round, players, holes, scores, roundStrokes }) {
  const result = useMemo(
    () => computeNassauForRound({ round, holes, scores, roundStrokes }),
    [round, holes, scores, roundStrokes]
  )
  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p])),
    [players]
  )
  if (!result.eligible) return null
  const legOrder = ['front9', 'back9', 'total'].filter(name => result.legs[name])

  return (
    <>
      <h2 style={{
        fontFamily: 'var(--tt-font-display)',
        fontSize: 'var(--tt-text-lg)',
        margin: '20px 0 10px',
      }}>Nassau</h2>

      <Card>
        <p className="tt-xs tt-muted" style={{ margin: '0 0 12px' }}>
          Three side bets: front 9, back 9, total — net, lowest wins each.
        </p>
        <div className="stack--tight">
          {legOrder.map(legName => {
            const leg = result.legs[legName]
            const label = legName === 'front9' ? 'Front 9' : legName === 'back9' ? 'Back 9' : 'Total 18'
            const winnerPlayer = leg.winner ? playerMap[leg.winner] : null
            return (
              <div key={legName} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: 'var(--tt-cream-deep)',
                borderRadius: 8,
                gap: 8,
              }}>
                <strong className="tt-small" style={{ fontWeight: 600, minWidth: 80 }}>{label}</strong>
                <span className="tt-small" style={{ fontFamily: 'var(--tt-font-mono)', color: 'var(--tt-ink-soft)' }}>
                  {!leg.complete && 'In progress…'}
                  {leg.complete && leg.tied && 'Tied'}
                  {leg.complete && winnerPlayer && (
                    <>
                      <span style={{ marginRight: 6 }}>{winnerPlayer.emoji}</span>
                      <strong>{winnerPlayer.name}</strong>
                      {' · '}
                      <span style={{ color: 'var(--tt-ink-muted)' }}>
                        {leg.totals[leg.winner] > 0 ? `+${leg.totals[leg.winner]}` : leg.totals[leg.winner]}
                      </span>
                    </>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}

// ── Vegas panel (per round) ──────────────────────────────────
function VegasPanel({ round, players, holes, scores, roundStrokes }) {
  const result = useMemo(
    () => computeVegasForRound({ round, holes, scores, roundStrokes }),
    [round, holes, scores, roundStrokes]
  )
  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p])),
    [players]
  )
  if (!result.eligible) return null

  const margin = result.total.A - result.total.B
  const leader = margin === 0 ? null : margin > 0 ? 'A' : 'B'
  const teamAEmojis = result.teams.A.map(pid => playerMap[pid]?.emoji ?? '⛳').join(' ')
  const teamBEmojis = result.teams.B.map(pid => playerMap[pid]?.emoji ?? '⛳').join(' ')

  return (
    <>
      <h2 style={{
        fontFamily: 'var(--tt-font-display)',
        fontSize: 'var(--tt-text-lg)',
        margin: '20px 0 10px',
      }}>Vegas</h2>

      <Card>
        <p className="tt-xs tt-muted" style={{ margin: '0 0 12px' }}>
          2v2 head-to-head. Team score = digits concatenated, low first. A birdie flips the opponent's pair. Gross scores.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 12,
        }}>
          <div style={{
            padding: '10px 12px',
            background: leader === 'A' ? 'var(--tt-fairway-tint)' : 'var(--tt-cream-deep)',
            border: `1px solid ${leader === 'A' ? 'var(--tt-fairway)' : 'transparent'}`,
            borderRadius: 8,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18 }}>{teamAEmojis}</div>
            <div className="tt-eyebrow" style={{ margin: '4px 0 2px' }}>Team A</div>
            <div style={{ fontFamily: 'var(--tt-font-mono)', fontWeight: 700, fontSize: 'var(--tt-text-xl)' }}>
              {result.total.A}
            </div>
          </div>
          <div style={{
            padding: '10px 12px',
            background: leader === 'B' ? 'var(--tt-fairway-tint)' : 'var(--tt-cream-deep)',
            border: `1px solid ${leader === 'B' ? 'var(--tt-fairway)' : 'transparent'}`,
            borderRadius: 8,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18 }}>{teamBEmojis}</div>
            <div className="tt-eyebrow" style={{ margin: '4px 0 2px' }}>Team B</div>
            <div style={{ fontFamily: 'var(--tt-font-mono)', fontWeight: 700, fontSize: 'var(--tt-text-xl)' }}>
              {result.total.B}
            </div>
          </div>
        </div>

        <div className="tt-eyebrow" style={{ marginBottom: 6 }}>Hole by hole</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))',
          gap: 4,
        }}>
          {result.bins.map(bin => <VegasPill key={bin.hole} bin={bin} />)}
        </div>
      </Card>
    </>
  )
}

function VegasPill({ bin }) {
  const baseStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 2px',
    borderRadius: 6,
    fontFamily: 'var(--tt-font-mono)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 11,
    fontWeight: 600,
    border: '1px solid var(--tt-line)',
  }
  if (bin.status === 'played') {
    const winColor = bin.winner === 'A'
      ? { background: 'var(--tt-fairway-tint)', color: 'var(--tt-fairway-deep)' }
      : bin.winner === 'B'
      ? { background: 'rgba(196,154,58,.15)', color: '#8a6a1e' }
      : { color: 'var(--tt-ink-muted)' }
    return (
      <span style={{ ...baseStyle, ...winColor }}>
        <span style={{ color: 'var(--tt-ink-muted)', fontSize: 10 }}>{bin.hole}</span>
        <span>{bin.aScore} · {bin.bScore}</span>
      </span>
    )
  }
  if (bin.status === 'pending') {
    return (
      <span style={{ ...baseStyle, color: 'var(--tt-ink-muted)' }}>
        <span style={{ fontSize: 10 }}>{bin.hole}</span>
        <span>—</span>
      </span>
    )
  }
  return (
    <span style={{ ...baseStyle, color: 'var(--tt-ink-muted)', opacity: 0.5 }}>
      <span style={{ fontSize: 10 }}>{bin.hole}</span>
      <span>·</span>
    </span>
  )
}

// ── Skins panel (per round) ──────────────────────────────────
function SkinsPanel({ round, players, holes, scores, roundStrokes }) {
  const result = useMemo(
    () => computeSkinsForRound({ round, holes, scores, roundStrokes }),
    [round, holes, scores, roundStrokes]
  )
  const playerMap = useMemo(
    () => Object.fromEntries(players.map(p => [p.id, p])),
    [players]
  )
  const standings = useMemo(() => {
    return Object.entries(result.totals)
      .map(([pid, n]) => ({ player: playerMap[pid], total: n }))
      .filter(r => r.player)
      .sort((a, b) => b.total - a.total)
  }, [result.totals, playerMap])

  if (!result.eligible) return null

  return (
    <>
      <h2 style={{
        fontFamily: 'var(--tt-font-display)',
        fontSize: 'var(--tt-text-lg)',
        margin: '20px 0 10px',
      }}>Skins</h2>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span className="tt-eyebrow">Standings</span>
          {result.unsettled > 0 && (
            <Chip tone="gold">{result.unsettled} carrying</Chip>
          )}
        </div>

        {standings.length === 0 ? (
          <p className="tt-small tt-muted" style={{ margin: 0 }}>
            No skins yet — set up the round and start entering scores.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
            {standings.map((row, i) => (
              <li
                key={row.player.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--tt-line)',
                }}
              >
                <span className="tt-small">
                  <span style={{ marginRight: 6 }}>{row.player.emoji}</span>
                  {row.player.name}
                </span>
                <span style={{ fontFamily: 'var(--tt-font-mono)', fontWeight: 700 }}>
                  {row.total}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="tt-eyebrow" style={{ marginBottom: 6 }}>Hole by hole</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {result.bins.map(bin => (
            <SkinPill key={bin.hole} bin={bin} playerMap={playerMap} />
          ))}
        </div>
      </Card>
    </>
  )
}

function SkinPill({ bin, playerMap }) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    borderRadius: 8,
    fontFamily: 'var(--tt-font-mono)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 12,
    fontWeight: 600,
    border: '1px solid var(--tt-line)',
  }
  if (bin.status === 'won') {
    const p = playerMap[bin.winnerId]
    return (
      <span style={{ ...baseStyle, background: 'var(--tt-fairway-tint)', color: 'var(--tt-fairway-deep)' }}>
        {bin.hole}: {p?.emoji ?? '⛳'}
        {bin.value > 1 && <span>×{bin.value}</span>}
      </span>
    )
  }
  if (bin.status === 'tied') {
    return (
      <span style={{ ...baseStyle, background: 'rgba(196,154,58,.15)', color: '#8a6a1e', borderColor: 'rgba(196,154,58,.4)' }}>
        {bin.hole}: tied — carry
      </span>
    )
  }
  if (bin.status === 'pending') {
    return (
      <span style={{ ...baseStyle, color: 'var(--tt-ink-muted)' }}>
        {bin.hole}: pending
      </span>
    )
  }
  return (
    <span style={{ ...baseStyle, color: 'var(--tt-ink-muted)', opacity: 0.5 }}>
      {bin.hole}: —
    </span>
  )
}

// --- Round setup: scorekeepers + per-player handicap/group ---

function RoundSetup({ tournament, round, players, roundStrokes, canEdit, onSaved }) {
  const allSet = players.length > 0
    && players.every(p => roundStrokes.find(rs => rs.player_id === p.id)?.group_assignment)
  const [editing, setEditing] = useState(!allSet && canEdit)
  const [scorekeepers, setScorekeepers] = useState(() => round.scorekeepers || {})
  const [rows, setRows] = useState(() => initialRows(players, roundStrokes))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Sync local form state when the round/players/strokes refetch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScorekeepers(round.scorekeepers || {})
    setRows(initialRows(players, roundStrokes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.id, players, roundStrokes])

  const groupLetters = useMemo(
    () => GROUP_LETTERS.slice(0, tournament.num_groups || 2),
    [tournament.num_groups]
  )

  function updateRow(pid, patch) {
    setRows(prev => ({ ...prev, [pid]: { ...prev[pid], ...patch } }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const skUpdate = await supabase
        .from('rounds')
        .update({ scorekeepers })
        .eq('id', round.id)
      if (skUpdate.error) throw skUpdate.error

      const upsertRows = players.map(p => ({
        round_id: round.id,
        player_id: p.id,
        tournament_id: tournament.id,
        handicap: parseInt(rows[p.id]?.handicap, 10) || 0,
        group_assignment: rows[p.id]?.group || null,
      }))
      const rsUpsert = await supabase
        .from('round_strokes')
        .upsert(upsertRows, { onConflict: 'round_id,player_id' })
      if (rsUpsert.error) throw rsUpsert.error

      setEditing(false)
      onSaved?.()
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{
            fontSize: 'var(--tt-text-lg)',
            margin: 0,
            fontFamily: 'var(--tt-font-display)',
            fontWeight: 600,
          }}>Setup</h2>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
        {!allSet && (
          <p className="tt-small tt-muted" style={{ margin: 0 }}>
            Players still need group assignments before scoring can start.
          </p>
        )}
        {allSet && groupLetters.map(g => {
          const groupPlayers = players.filter(p =>
            roundStrokes.find(rs => rs.player_id === p.id)?.group_assignment === g
          )
          const skId = (round.scorekeepers || {})[g]
          const skPlayer = players.find(p => p.id === skId)
          return (
            <div
              key={g}
              className="tt-small"
              style={{ display: 'flex', gap: 8, padding: '6px 0', flexWrap: 'wrap', alignItems: 'center' }}
            >
              <strong style={{ fontWeight: 600 }}>Group {g}:</strong>
              <span style={{ color: 'var(--tt-ink-soft)' }}>
                {groupPlayers.map(p => `${p.emoji} ${p.name}`).join(' · ') || '—'}
              </span>
              <span className="tt-xs tt-muted">
                Scorekeeper: {skPlayer ? `${skPlayer.emoji} ${skPlayer.name}` : '—'}
              </span>
            </div>
          )
        })}
      </Card>
    )
  }

  return (
    <Card>
      <div className="stack">
      <h2 style={{
        fontSize: 'var(--tt-text-lg)',
        margin: 0,
        fontFamily: 'var(--tt-font-display)',
        fontWeight: 600,
      }}>Setup</h2>

      <div className="stack--tight">
        <div className="tt-eyebrow">Scorekeepers</div>
        {groupLetters.map(g => (
          <div key={g} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '.5rem', alignItems: 'center' }}>
            <span className="small">Group {g}</span>
            <select
              value={scorekeepers[g] || ''}
              onChange={e => setScorekeepers(s => ({ ...s, [g]: e.target.value || null }))}
            >
              <option value="">— pick a player —</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="stack--tight">
        <div className="tt-eyebrow">Per-player handicap & group</div>
        {players.map(p => (
          <div key={p.id} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 5rem 5rem',
            gap: '.4rem', alignItems: 'center',
          }}>
            <span>{p.emoji} {p.name}</span>
            <input
              type="number"
              placeholder="Hcp"
              value={rows[p.id]?.handicap ?? ''}
              onChange={e => updateRow(p.id, { handicap: e.target.value })}
              style={{ fontFamily: 'var(--tt-font-mono)', textAlign: 'center' }}
            />
            <select
              value={rows[p.id]?.group ?? ''}
              onChange={e => updateRow(p.id, { group: e.target.value || null })}
            >
              <option value="">—</option>
              {groupLetters.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        ))}
      </div>

      {error && <p style={{ color: 'var(--tt-pencil)' }} className="tt-small">{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save setup'}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
      </div>
    </Card>
  )
}

function initialRows(players, roundStrokes) {
  const out = {}
  for (const p of players) {
    const rs = roundStrokes.find(r => r.player_id === p.id)
    out[p.id] = { handicap: rs?.handicap ?? '', group: rs?.group_assignment ?? '' }
  }
  return out
}

// --- Scorecard: per-hole gross entry grid ---

function Scorecard({ round, players, holes, roundStrokes, scores, myUserId, members, onChange }) {
  // Find which player the current user is (if any).
  const myMember = members.find(m => m.user_id === myUserId)
  const myPlayerId = myMember?.player_id

  // Tabs by group letter (when groups exist) or single group.
  const groupsPresent = useMemo(() => {
    const set = new Set()
    for (const rs of roundStrokes) if (rs.group_assignment) set.add(rs.group_assignment)
    return [...set].sort()
  }, [roundStrokes])

  const [activeGroup, setActiveGroup] = useState(() => groupsPresent[0] || null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!activeGroup && groupsPresent[0]) setActiveGroup(groupsPresent[0])
  }, [groupsPresent, activeGroup])

  if (!roundStrokes.length) {
    return (
      <Card>
        <p className="tt-muted tt-small">Save the round setup first to enable scoring.</p>
      </Card>
    )
  }
  if (!holes.length) {
    return <Card><p className="tt-muted tt-small">No holes configured for this round.</p></Card>
  }

  // Scramble: only the captain (first listed player in the group) has scores written.
  const isScramble = round.format === 'scramble'
  const strokesMap = Object.fromEntries(roundStrokes.map(rs =>
    [rs.player_id, { handicap: rs.handicap, group_assignment: rs.group_assignment }]
  ))
  const effectiveStrokes = deriveStrokesForFormat(strokesMap, round.format)
  const holesSorted = [...holes].sort((a, b) => a.hole - b.hole)

  return (
    <div className="stack">
      {groupsPresent.length > 1 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {groupsPresent.map(g => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              style={{
                padding: '.4rem .8rem',
                borderRadius: 8,
                background: activeGroup === g ? 'var(--tt-fairway)' : 'transparent',
                color: activeGroup === g ? '#fff' : 'var(--tt-ink-soft)',
                fontSize: 14,
                fontWeight: 600,
                border: 'none',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 150ms linear, color 150ms linear',
              }}
            >Group {g}</button>
          ))}
        </div>
      )}

      <ScorecardGrid
        round={round}
        players={players.filter(p => {
          const rs = roundStrokes.find(r => r.player_id === p.id)
          const g = rs?.group_assignment
          if (!g) return false
          if (groupsPresent.length > 1) return g === activeGroup
          return true
        })}
        holes={holesSorted}
        scores={scores}
        effectiveStrokes={effectiveStrokes}
        myPlayerId={myPlayerId}
        isScramble={isScramble}
        onChange={onChange}
      />
    </div>
  )
}

function ScorecardGrid({ round, players, holes, scores, effectiveStrokes, myPlayerId, isScramble, onChange }) {
  // For scramble, only the first player in the group (the "captain") is shown.
  const visiblePlayers = isScramble && players.length ? [players[0]] : players
  const playerTotal = (pid) =>
    scores.filter(s => s.player_id === pid).reduce((a, s) => a + (s.gross || 0), 0)

  return (
    <>
      <Card padded={false} style={{ overflowX: 'auto', padding: 8 }}>
        <PencilFilters />
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={cellTh}>Hole</th>
              <th style={cellTh}>Par</th>
              <th style={cellTh}>SI</th>
              {visiblePlayers.map(p => (
                <th key={p.id} style={{ ...cellTh, paddingTop: 8 }} title={p.name}>
                  <div style={{ fontSize: 18 }}>{p.emoji}</div>
                  <div className="tt-xs" style={{
                    marginTop: 2,
                    fontFamily: 'var(--tt-font-ui)',
                    color: 'var(--tt-ink-soft)',
                  }}>{p.initials || p.name}</div>
                </th>
              ))}
              <th style={cellTh}>Tot</th>
            </tr>
          </thead>
          <tbody>
            {holes.map(h => (
              <tr key={h.hole} style={{ borderTop: '1px solid var(--tt-line)' }}>
                <td style={cellTd}>{h.hole}</td>
                <td style={{ ...cellTd, color: 'var(--tt-ink-muted)' }}>{h.par}</td>
                <td style={{ ...cellTd, color: 'var(--tt-ink-muted)' }}>{h.stroke_index}</td>
                {visiblePlayers.map(p => (
                  <ScoreCell
                    key={p.id}
                    round={round}
                    hole={h}
                    player={p}
                    mine={p.id === myPlayerId}
                    enteredBy={myPlayerId}
                    effectiveStrokes={effectiveStrokes}
                    holesCount={holes.length}
                    initialValue={scores.find(s => s.player_id === p.id && s.hole === h.hole)?.gross ?? ''}
                    onChange={onChange}
                  />
                ))}
                <td style={{ ...cellTd, color: 'var(--tt-ink-muted)' }}>—</td>
              </tr>
            ))}
            <tr style={{
              borderTop: '2px solid var(--tt-fairway)',
              background: 'var(--tt-cream-deep)',
            }}>
              <td style={cellTd} colSpan={3} className="tt-eyebrow">Total</td>
              {visiblePlayers.map(p => {
                const total = playerTotal(p.id)
                return (
                  <td key={p.id} style={{ ...cellTd, fontWeight: 700 }}>
                    {total > 0 ? total : '—'}
                  </td>
                )
              })}
              <td style={cellTd}>—</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <p className="tt-xs tt-muted" style={{ marginTop: 8 }}>
        Tap any cell to enter a gross score. Net difference colors the digit.
      </p>
    </>
  )
}

function ScoreCell({ round, hole, player, mine, enteredBy, effectiveStrokes, holesCount, initialValue, onChange }) {
  const [val, setVal] = useState(String(initialValue ?? ''))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVal(String(initialValue ?? ''))
  }, [initialValue])

  async function commit() {
    const n = parseInt(val, 10)
    if (val === '' || Number.isNaN(n)) {
      if (initialValue != null && initialValue !== '') {
        setSaving(true)
        const del = await supabase
          .from('scores')
          .delete()
          .eq('round_id', round.id)
          .eq('player_id', player.id)
          .eq('hole', hole.hole)
        setSaving(false)
        if (del.error) setError(true)
        else { setError(false); onChange?.() }
      }
      return
    }
    if (n < 1 || n > 20) { setError(true); return }
    if (n === initialValue) return
    setSaving(true)
    const up = await supabase
      .from('scores')
      .upsert({
        round_id: round.id,
        tournament_id: round.tournament_id,
        player_id: player.id,
        hole: hole.hole,
        gross: n,
        entered_by: enteredBy ?? null,
      }, { onConflict: 'round_id,player_id,hole' })
    setSaving(false)
    if (up.error) { setError(true); return }
    setError(false)
    onChange?.()
  }

  const so = getStrokesOnHole(effectiveStrokes[player.id] || 0, hole.stroke_index, holesCount)
  const grossNum = parseInt(val, 10)
  const netDiff = !Number.isNaN(grossNum) ? (grossNum - so - hole.par) : null
  const tone =
    netDiff == null            ? null :
    netDiff <= -2              ? 'var(--tt-score-eagle)' :
    netDiff === -1             ? 'var(--tt-score-birdie)' :
    netDiff === 0              ? 'var(--tt-ink)' :
    netDiff === 1              ? 'var(--tt-score-bogey)' :
                                 'var(--tt-score-double)'
  const decorate = netDiff != null && netDiff <= -1 && val !== ''

  return (
    <td style={{ ...cellTd, position: 'relative' }}>
      <div style={{
        position: 'relative',
        display: 'inline-block',
        width: 44,
        height: 34,
        verticalAlign: 'middle',
      }}>
        <input
          inputMode="numeric"
          value={val}
          onChange={e => setVal(e.target.value.replace(/[^\d]/g, '').slice(0, 2))}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            textAlign: 'center',
            padding: 0,
            border: '1px solid ' + (error ? 'var(--tt-pencil)' : (mine ? 'var(--tt-fairway)' : 'transparent')),
            background: mine ? 'rgba(220, 232, 210, 0.4)' : 'transparent',
            borderRadius: 6,
            font: 'inherit',
            fontFamily: 'var(--tt-font-mono)',
            fontWeight: tone && netDiff !== 0 ? 700 : 500,
            color: tone || 'var(--tt-ink)',
            outline: 'none',
            fontSize: 16,
            opacity: saving ? 0.6 : 1,
          }}
        />
        {decorate && (
          <svg
            style={{ position: 'absolute', inset: -4, pointerEvents: 'none', overflow: 'visible' }}
            viewBox="0 0 60 44"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <g fill="none" stroke="var(--tt-ink)" strokeLinecap="round">
              <ellipse
                cx="30" cy="22" rx="24" ry="16"
                strokeWidth="1.4"
                strokeDasharray="110 6"
                strokeDashoffset="3"
                opacity="0.85"
                filter="url(#tt-pencil-1)"
              />
              <ellipse
                cx="30.6" cy="21.4" rx="22.8" ry="15.2"
                strokeWidth="1"
                strokeDasharray="118 4"
                strokeDashoffset="22"
                opacity="0.55"
                filter="url(#tt-pencil-2)"
              />
            </g>
          </svg>
        )}
      </div>
    </td>
  )
}

const cellTh = {
  padding: '6px 4px',
  fontFamily: 'var(--tt-font-ui)',
  fontWeight: 600,
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--tt-ink-soft)',
  textAlign: 'center',
}
const cellTd = {
  padding: '4px 2px',
  fontFamily: 'var(--tt-font-mono)',
  fontVariantNumeric: 'tabular-nums',
  fontSize: 14,
  textAlign: 'center',
  color: 'var(--tt-ink)',
}
