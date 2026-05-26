import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth.jsx'
import { useTournament } from '../lib/useTournament.js'
import { deriveStrokesForFormat, getStrokesOnHole } from '../lib/scoring.js'

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export default function RoundDetail() {
  const { slug, number } = useParams()
  const { user } = useAuth()
  const t = useTournament(slug)

  if (t.loading) return <div className="shell"><p className="muted">Loading…</p></div>
  if (t.error) return <div className="shell"><p style={{ color: 'var(--danger)' }}>{t.error}</p></div>

  const round = t.rounds.find(r => String(r.round_number) === String(number))
  if (!round) {
    return (
      <div className="shell stack">
        <Link to={`/t/${slug}/rounds`} className="small muted">← Rounds</Link>
        <div className="card"><p>Round not found.</p></div>
      </div>
    )
  }

  const myMembership = t.members.find(m => m.user_id === user?.id)
  const isOwnerOrAdmin = ['owner', 'admin'].includes(myMembership?.role)
  const roundHoles = t.holes.filter(h => h.round_id === round.id).sort((a, b) => a.hole - b.hole)
  const roundStrokes = t.roundStrokes.filter(rs => rs.round_id === round.id)
  const roundScores = t.scores.filter(s => s.round_id === round.id)

  return (
    <div className="shell stack">
      <Link to={`/t/${slug}/rounds`} className="small muted">← Rounds</Link>
      <header className="stack--tight">
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>
          R{round.round_number} · {round.name}
        </h1>
        <p className="muted small" style={{ margin: 0 }}>
          {round.format.replace('_', ' ')} · {roundHoles.length} holes · {round.status}
        </p>
      </header>

      <RoundSetup
        tournament={t.tournament}
        round={round}
        players={t.players}
        roundStrokes={roundStrokes}
        canEdit={isOwnerOrAdmin}
        onSaved={t.refetch}
      />

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
    </div>
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
      <div className="card stack--tight">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1rem', margin: 0 }}>Setup</h2>
          {canEdit && (
            <button className="btn btn--ghost small" onClick={() => setEditing(true)}>Edit</button>
          )}
        </div>
        {!allSet && (
          <p className="small muted" style={{ margin: 0 }}>
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
            <div key={g} className="small" style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <strong>Group {g}:</strong>
              <span>{groupPlayers.map(p => `${p.emoji} ${p.name}`).join(', ') || '—'}</span>
              <span className="muted">
                Scorekeeper: {skPlayer ? `${skPlayer.emoji} ${skPlayer.name}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card stack">
      <h2 style={{ fontSize: '1rem', margin: 0 }}>Setup</h2>

      <div className="stack--tight">
        <div className="small muted">Scorekeepers</div>
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
        <div className="small muted">Per-player handicap & group</div>
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

      {error && <p style={{ color: 'var(--danger)' }} className="small">{error}</p>}

      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button className="btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save setup'}
        </button>
        <button className="btn btn--ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
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
      <div className="card">
        <p className="muted small">Save the round setup first to enable scoring.</p>
      </div>
    )
  }
  if (!holes.length) {
    return <div className="card"><p className="muted small">No holes configured for this round.</p></div>
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
        <div style={{ display: 'flex', gap: '.25rem' }}>
          {groupsPresent.map(g => (
            <button
              key={g}
              className="btn"
              style={{
                background: activeGroup === g ? 'var(--accent)' : 'transparent',
                color: activeGroup === g ? '#fff' : 'var(--ink-soft)',
                border: '1px solid var(--line)',
                padding: '.4rem .8rem',
              }}
              onClick={() => setActiveGroup(g)}
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
  return (
    <div className="card" style={{ overflowX: 'auto', padding: '.5rem' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cellTh}>Hole</th>
            <th style={cellTh}>Par</th>
            <th style={cellTh}>SI</th>
            {visiblePlayers.map(p => (
              <th key={p.id} style={cellTh} title={p.name}>
                {p.emoji}<br />
                <span className="small">{p.initials || p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holes.map(h => (
            <tr key={h.hole} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={cellTd}>{h.hole}</td>
              <td style={cellTd}>{h.par}</td>
              <td style={cellTd}>{h.stroke_index}</td>
              {visiblePlayers.map(p => (
                <ScoreCell
                  key={p.id}
                  round={round}
                  hole={h}
                  player={p}
                  enteredBy={myPlayerId}
                  effectiveStrokes={effectiveStrokes}
                  initialValue={scores.find(s => s.player_id === p.id && s.hole === h.hole)?.gross ?? ''}
                  onChange={onChange}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: '.5rem 0 0' }}>
        Strokes show as net under par when handicap applies. Scores save when you tab/blur out.
      </p>
    </div>
  )
}

function ScoreCell({ round, hole, player, enteredBy, effectiveStrokes, initialValue, onChange }) {
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
      // Delete the score if cleared.
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

  const so = getStrokesOnHole(effectiveStrokes[player.id] || 0, hole.stroke_index, /* holesCount inferred from app */ undefined)
  const grossNum = parseInt(val, 10)
  const netDiff = !Number.isNaN(grossNum) ? (grossNum - so - hole.par) : null
  const tone = netDiff == null ? null : netDiff <= -2 ? '#1565c0' : netDiff === -1 ? '#2e7d32' : netDiff === 0 ? null : netDiff === 1 ? '#a05a00' : '#b94a3a'

  return (
    <td style={{ ...cellTd, position: 'relative' }}>
      <input
        type="number"
        min={1}
        max={20}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
        style={{
          width: '3rem',
          textAlign: 'center',
          padding: '.3em .2em',
          color: tone || 'inherit',
          fontWeight: tone ? 600 : 400,
          borderColor: error ? 'var(--danger)' : undefined,
          opacity: saving ? 0.6 : 1,
        }}
      />
    </td>
  )
}

const cellTh = { padding: '.4rem .3rem', fontWeight: 600, fontSize: '.8rem', color: 'var(--ink-soft)', textAlign: 'center' }
const cellTd = { padding: '.3rem .2rem', fontSize: '.9rem', textAlign: 'center' }
