import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { PRESETS, presetForCount } from '../lib/scoringPresets.js'
import { slugify, randomSuffix } from '../lib/slug.js'
import { defaultHoles, defaultPlayer, EMOJI_POOL, ROUND_FORMAT_TILES } from '../lib/defaults.js'
import { Shell, Header, Card, Button } from '../components/ui.jsx'

const TOTAL_STEPS = 4
const PRESET_COUNTS = [4, 6, 8, 12]
const ROUND_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8]
const DEFAULT_PLAYER_COUNT = 8
const DEFAULT_ROUND_COUNT = 3
// Rotation used by the "Decide for me" button to vary up the trip.
const SUGGESTION_ROTATION = ['individual_stroke', 'best_ball', 'scramble', 'shamble']

const TILE_BY_VALUE = Object.fromEntries(ROUND_FORMAT_TILES.map(t => [t.value, t]))

export default function NewTournament() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Step 1 — group size + round count
  const [playerCount, setPlayerCount] = useState(DEFAULT_PLAYER_COUNT)
  const [otherMode, setOtherMode] = useState(false)
  const [roundCount, setRoundCount] = useState(DEFAULT_ROUND_COUNT)

  // Step 2 — players (all optional)
  const [players, setPlayers] = useState(() =>
    Array.from({ length: DEFAULT_PLAYER_COUNT }, (_, i) => defaultPlayer(i))
  )

  // Step 3 — round formats picked, in order. Starts empty; user either
  // taps tiles themselves or hits "Decide for me" for an auto-pick.
  const [selectedFormats, setSelectedFormats] = useState([])

  // Step 4 — trip name (slug derives silently)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')

  const derivedPreset = useMemo(
    () => presetForCount(playerCount || 2),
    [playerCount]
  )

  function onTitleChange(t) {
    setTitle(t)
    setSlug(slugify(t))
  }

  function applyCount(n) {
    const clamped = Math.max(2, Math.min(24, n | 0))
    setPlayerCount(clamped)
    setPlayers(prev => {
      const next = [...prev]
      while (next.length < clamped) next.push(defaultPlayer(next.length))
      return next.slice(0, clamped)
    })
  }

  function applyRoundCount(n) {
    const clamped = Math.max(1, Math.min(12, n | 0))
    setRoundCount(clamped)
    // Truncate if user previously picked more than the new count; never
    // auto-add — they decide formats explicitly (or hit "Decide for me").
    setSelectedFormats(prev => prev.slice(0, clamped))
  }

  function decideForMe() {
    setSelectedFormats(suggestFormatsFor(roundCount))
  }

  function updatePlayer(i, patch) {
    setPlayers(arr => arr.map((p, j) => j === i ? { ...p, ...patch } : p))
  }
  function addPlayer() {
    setPlayers(arr => {
      const next = [...arr, defaultPlayer(arr.length)]
      setPlayerCount(next.length)
      return next
    })
  }
  function removePlayer(i) {
    setPlayers(arr => {
      const next = arr.filter((_, j) => j !== i)
      setPlayerCount(next.length)
      return next
    })
  }

  function addFormat(value) {
    setSelectedFormats(prev => {
      if (prev.length >= roundCount) return prev
      return moveChampionshipLast([...prev, value])
    })
  }
  function removeFormatAt(index) {
    setSelectedFormats(prev => prev.filter((_, i) => i !== index))
  }

  // Round objects derived from the selected formats.
  const rounds = useMemo(() => selectedFormats.map((fmt, i) => ({
    round_number: i + 1,
    name: `Round ${i + 1}`,
    format: fmt,
    is_championship: fmt === 'championship',
    holes: defaultHoles(18),
  })), [selectedFormats])

  function next() { setError(null); setStep(s => Math.min(TOTAL_STEPS, s + 1)) }
  function back() { setError(null); setStep(s => Math.max(1, s - 1)) }

  function validate() {
    if (step === 1) {
      if (!playerCount || playerCount < 2) return 'Need at least 2 players.'
      if (playerCount > 24) return 'Max 24 players.'
      if (!roundCount || roundCount < 1) return 'Pick at least one round.'
    }
    if (step === 3) {
      if (selectedFormats.length !== roundCount) {
        return `Pick a format for each of the ${roundCount} round${roundCount === 1 ? '' : 's'}.`
      }
    }
    if (step === 4) {
      if (!title.trim() || title.trim().length < 2) return 'Give the trip a name.'
    }
    return null
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      let finalSlug = slug
      if (!/^[a-z0-9-]{3,40}$/.test(finalSlug)) {
        finalSlug = `trip-${randomSuffix(6)}`
      }

      const finalPlayers = players.map((p, i) => {
        const name = p.name.trim() || `Player ${i + 1}`
        const baseSlug = slugify(p.slug || name)
        return {
          slug: baseSlug || `player-${i + 1}`,
          name,
          emoji: p.emoji || EMOJI_POOL[i % EMOJI_POOL.length],
          initials: deriveInitials(name),
          email: p.email?.trim() || null,
          display_order: i,
        }
      })
      const seen = new Set()
      for (const p of finalPlayers) {
        let candidate = p.slug
        let n = 2
        while (seen.has(candidate)) {
          candidate = `${p.slug}-${n}`
          n++
        }
        p.slug = candidate
        seen.add(candidate)
      }

      const championship = rounds.find(r => r.is_championship)
      const config = {
        slug: finalSlug,
        title: title.trim(),
        num_groups: derivedPreset.num_groups,
        championship_tier_size: derivedPreset.championship_tier_size,
        scoring_config: derivedPreset.scoring_config,
        players: finalPlayers,
        championship_round_number: championship?.round_number ?? null,
        rounds: rounds.map(r => ({
          round_number: r.round_number,
          name: r.name,
          format: r.format,
          holes: r.holes,
        })),
      }
      const { data, error: rpcError } = await supabase.rpc('rpc_create_tournament', { config })
      if (rpcError) {
        if (/duplicate key|unique constraint/i.test(rpcError.message)) {
          config.slug = `${finalSlug}-${randomSuffix()}`
          const retry = await supabase.rpc('rpc_create_tournament', { config })
          if (retry.error) throw retry.error
          nav(`/t/${retry.data.slug}`)
          return
        }
        throw rpcError
      }
      nav(`/t/${data.slug}`)
    } catch (e) {
      setError(e.message || String(e))
      setSubmitting(false)
    }
  }

  function handleNext() {
    const err = validate()
    if (err) { setError(err); return }
    if (step === TOTAL_STEPS) submit()
    else next()
  }

  // "Add later" on step 2 — advance with no edits.
  function skipPlayers() {
    setError(null)
    setStep(3)
  }

  return (
    <Shell>
      <Link
        to="/dashboard"
        className="tt-small tt-muted"
        style={{ display: 'inline-block', marginBottom: 6 }}
      >← Dashboard</Link>
      <Header
        eyebrow={`Step ${step} of ${TOTAL_STEPS}`}
        title="New tournament"
        meta="Takes about 5 minutes. You can edit everything later."
      />

      <div
        aria-hidden="true"
        style={{
          height: 4, background: 'var(--tt-line)',
          borderRadius: 2, overflow: 'hidden', marginBottom: 16,
        }}
      >
        <div style={{
          width: `${(step / TOTAL_STEPS) * 100}%`, height: '100%',
          background: 'var(--tt-fairway)', transition: 'width 150ms linear',
        }} />
      </div>

      <Card>
        <div className="stack">
          {step === 1 && (
            <Step1 {...{
              playerCount, otherMode, setOtherMode, applyCount, derivedPreset,
              roundCount, applyRoundCount,
            }} />
          )}
          {step === 2 && (
            <Step2 {...{ players, updatePlayer, addPlayer, removePlayer }} />
          )}
          {step === 3 && (
            <Step3 {...{
              selectedFormats, roundCount, addFormat, removeFormatAt, decideForMe,
            }} />
          )}
          {step === 4 && <Step4 {...{ title, onTitleChange }} />}

          {error && <p style={{ color: 'var(--tt-pencil)' }} className="tt-small">{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={back} disabled={step === 1 || submitting}>Back</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {step === 2 && (
                <Button variant="ghost" onClick={skipPlayers} disabled={submitting}>
                  Add later
                </Button>
              )}
              <Button onClick={handleNext} disabled={submitting}>
                {step === TOTAL_STEPS ? (submitting ? 'Creating…' : 'Create tournament') : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </Shell>
  )
}

// ── Step 1 — group size + round count ────────────────────────
function Step1({
  playerCount, otherMode, setOtherMode, applyCount, derivedPreset,
  roundCount, applyRoundCount,
}) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        How many people are you going with?
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        We'll pre-fill the player list and pick a sensible scoring preset.
      </p>

      <div className="stack--tight">
        {PRESET_COUNTS.map(n => {
          const active = !otherMode && playerCount === n
          return (
            <label
              key={n}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '.7rem .9rem',
                border: `1px solid ${active ? 'var(--tt-fairway)' : 'var(--tt-line)'}`,
                background: active ? 'var(--tt-fairway-tint)' : 'var(--tt-paper)',
                borderRadius: 10, cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="count"
                checked={active}
                onChange={() => { setOtherMode(false); applyCount(n) }}
                style={{ width: 'auto' }}
              />
              <span><strong>{n}</strong> players — {PRESETS[n].label.split('—')[1]?.trim()}</span>
            </label>
          )
        })}

        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '.7rem .9rem',
          border: `1px solid ${otherMode ? 'var(--tt-fairway)' : 'var(--tt-line)'}`,
          background: otherMode ? 'var(--tt-fairway-tint)' : 'var(--tt-paper)',
          borderRadius: 10, cursor: 'pointer',
        }}>
          <input
            type="radio"
            name="count"
            checked={otherMode}
            onChange={() => setOtherMode(true)}
            style={{ width: 'auto' }}
          />
          <span>Other:</span>
          <input
            type="number"
            min={2}
            max={24}
            value={otherMode ? playerCount : ''}
            onChange={e => { setOtherMode(true); applyCount(Number(e.target.value) || 0) }}
            onClick={() => setOtherMode(true)}
            placeholder="7"
            style={{ width: 80, textAlign: 'center', fontFamily: 'var(--tt-font-mono)' }}
          />
        </label>
      </div>

      <div style={{ borderTop: '1px solid var(--tt-line)', paddingTop: 16, marginTop: 4 }}>
        <h2 style={{
          fontSize: 'var(--tt-text-lg)',
          margin: '0 0 8px',
          fontFamily: 'var(--tt-font-display)',
        }}>
          How many rounds?
        </h2>
        <p className="tt-small tt-muted" style={{ margin: '0 0 10px' }}>
          One round per day of golf you'll be playing.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ROUND_COUNT_OPTIONS.map(n => {
            const active = roundCount === n
            return (
              <button
                key={n}
                type="button"
                onClick={() => applyRoundCount(n)}
                style={{
                  minWidth: 44,
                  padding: '.55rem .9rem',
                  borderRadius: 10,
                  border: `1px solid ${active ? 'var(--tt-fairway)' : 'var(--tt-line)'}`,
                  background: active ? 'var(--tt-fairway)' : 'var(--tt-paper)',
                  color: active ? '#fff' : 'var(--tt-ink)',
                  fontFamily: 'var(--tt-font-mono)',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: 'pointer',
                  transition: 'background 150ms linear, color 150ms linear',
                }}
              >{n}</button>
            )
          })}
        </div>
      </div>

      <p className="tt-xs tt-muted" style={{ margin: 0 }}>
        Scoring: {derivedPreset.num_groups} groups, championship tier of {derivedPreset.championship_tier_size}.
      </p>
    </div>
  )
}

// ── Step 2 — player names (optional) ─────────────────────────
function Step2({ players, updatePlayer, addPlayer, removePlayer }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Add players
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Names are optional — hit <strong>Add later</strong> to skip and fill them in from
        settings. If you put an email here, that player auto-links when they sign in with
        Google or Apple.
      </p>

      <div className="stack--tight">
        {players.map((p, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '2.5rem 1fr 1fr auto',
            gap: '.4rem', alignItems: 'center',
          }}>
            <input
              value={p.emoji}
              maxLength={4}
              onChange={e => updatePlayer(i, { emoji: e.target.value })}
              aria-label="Emoji"
              style={{ textAlign: 'center', padding: '.4em .2em', fontSize: 18 }}
            />
            <input
              placeholder={`Player ${i + 1}`}
              value={p.name}
              onChange={e => updatePlayer(i, { name: e.target.value })}
              autoComplete="off"
            />
            <input
              placeholder="Email (optional)"
              type="email"
              value={p.email}
              onChange={e => updatePlayer(i, { email: e.target.value })}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => removePlayer(i)}
              disabled={players.length <= 2}
              aria-label="Remove player"
              style={{
                width: 30, height: 30, padding: 0,
                border: '1px solid var(--tt-line)',
                borderRadius: 6, background: 'transparent',
                color: 'var(--tt-ink-muted)',
                cursor: players.length <= 2 ? 'not-allowed' : 'pointer',
                opacity: players.length <= 2 ? 0.4 : 1,
              }}
            >✕</button>
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={addPlayer} style={{ alignSelf: 'flex-start' }}>
        + Add player
      </Button>
    </div>
  )
}

// ── Step 3 — round format tiles ──────────────────────────────
function Step3({ selectedFormats, roundCount, addFormat, removeFormatAt, decideForMe }) {
  const positions = useMemo(() => {
    const map = {}
    selectedFormats.forEach((fmt, i) => {
      if (!map[fmt]) map[fmt] = []
      map[fmt].push(i + 1)
    })
    return map
  }, [selectedFormats])

  const filled = selectedFormats.length
  const remaining = roundCount - filled
  const atCap = filled >= roundCount

  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Pick your rounds
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Tap a format to add it as the next round. You can pick the same format more than
        once (e.g. two stroke-play days). Championship always plays last.
      </p>

      <div style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}>
        <p className="tt-small" style={{ margin: 0, color: 'var(--tt-ink-soft)' }}>
          <strong>{filled}</strong> of <strong>{roundCount}</strong> picked
          {remaining > 0 && ` · ${remaining} to go`}
          {atCap && ' · all set'}
        </p>
        <Button variant="ghost" size="sm" onClick={decideForMe}>
          🎲 Decide for me
        </Button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {ROUND_FORMAT_TILES.map(tile => {
          const tilePositions = positions[tile.value] || []
          const count = tilePositions.length
          const selected = count > 0
          return (
            <button
              key={tile.value}
              type="button"
              onClick={() => addFormat(tile.value)}
              disabled={atCap}
              style={{
                position: 'relative',
                textAlign: 'left',
                padding: '14px 16px',
                border: `1px solid ${selected ? 'var(--tt-fairway)' : 'var(--tt-line)'}`,
                background: selected ? 'var(--tt-fairway-tint)' : 'var(--tt-paper)',
                borderRadius: 12,
                cursor: atCap ? 'not-allowed' : 'pointer',
                opacity: atCap && !selected ? 0.55 : 1,
                fontFamily: 'inherit',
                transition: 'background 150ms linear, border-color 150ms linear, opacity 150ms linear',
              }}
            >
              {selected && (
                <span
                  aria-label={`Selected as round ${tilePositions.join(', ')}`}
                  style={{
                    position: 'absolute',
                    top: 10, left: 10,
                    minWidth: 24, height: 24,
                    padding: '0 7px',
                    borderRadius: 999,
                    background: 'var(--tt-fairway)',
                    color: '#fff',
                    fontFamily: 'var(--tt-font-mono)',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >{count === 1 ? tilePositions[0] : `×${count}`}</span>
              )}
              <div style={{ paddingLeft: selected ? 36 : 0 }}>
                <div style={{
                  fontFamily: 'var(--tt-font-display)',
                  fontSize: 'var(--tt-text-lg)',
                  fontWeight: 600,
                  color: 'var(--tt-ink)',
                  marginBottom: 2,
                }}>{tile.title}</div>
                <div className="tt-small" style={{ color: 'var(--tt-ink-soft)', marginBottom: 6 }}>
                  {tile.short}
                </div>
                <div className="tt-xs tt-muted" style={{ lineHeight: 1.45 }}>
                  {tile.desc}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Round order — remove a slot to renumber */}
      {selectedFormats.length > 0 && (
        <div className="stack--tight">
          <div className="tt-eyebrow">Round order</div>
          {selectedFormats.map((fmt, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--tt-cream-deep)',
                borderRadius: 8,
              }}
            >
              <span className="tt-small">
                <strong style={{ fontFamily: 'var(--tt-font-mono)' }}>R{i + 1}</strong>
                {'  '}—{'  '}
                {TILE_BY_VALUE[fmt]?.title ?? fmt}
              </span>
              <button
                type="button"
                onClick={() => removeFormatAt(i)}
                aria-label={`Remove round ${i + 1}`}
                style={{
                  width: 26, height: 26, padding: 0,
                  border: '1px solid var(--tt-line)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--tt-ink-muted)',
                  cursor: 'pointer',
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Step 4 — trip name ───────────────────────────────────────
function Step4({ title, onTitleChange }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        What's the trip called?
      </h2>
      <label className="stack--tight">
        <span className="tt-eyebrow">Trip name</span>
        <input
          autoFocus
          value={title}
          placeholder="Bama Golf Trip 2026"
          onChange={e => onTitleChange(e.target.value)}
        />
      </label>
    </div>
  )
}

function deriveInitials(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase().slice(0, 3)
}

// Make sure 'championship' is always the last entry in the array.
function moveChampionshipLast(arr) {
  const champIdx = arr.indexOf('championship')
  if (champIdx === -1 || champIdx === arr.length - 1) return arr
  return [...arr.slice(0, champIdx), ...arr.slice(champIdx + 1), 'championship']
}

// "Decide for me" — rotate stroke / best-ball / scramble / shamble for
// variety, end with championship when the trip has 2+ rounds.
function suggestFormatsFor(n) {
  if (n <= 0) return []
  if (n === 1) return ['individual_stroke']
  const out = []
  for (let i = 0; i < n - 1; i++) {
    out.push(SUGGESTION_ROTATION[i % SUGGESTION_ROTATION.length])
  }
  out.push('championship')
  return out
}
