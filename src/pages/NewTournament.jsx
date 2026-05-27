import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { PRESETS, presetForCount } from '../lib/scoringPresets.js'
import { slugify, randomSuffix } from '../lib/slug.js'
import { defaultHoles, defaultRound, defaultPlayer, EMOJI_POOL, ROUND_FORMATS } from '../lib/defaults.js'
import { Shell, Header, Card, Button } from '../components/ui.jsx'

const TOTAL_STEPS = 5
const PRESET_COUNTS = [4, 6, 8, 12]

export default function NewTournament() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Step 1 — title (slug derives automatically; user never sees it)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')

  // Step 2 — count
  const [playerCount, setPlayerCount] = useState(6)
  const [otherMode, setOtherMode] = useState(false)

  // Step 3 — players
  const [players, setPlayers] = useState(() =>
    Array.from({ length: 6 }, (_, i) => defaultPlayer(i))
  )

  // Step 4 — rounds
  const [rounds, setRounds] = useState(() => [
    defaultRound(1), defaultRound(2), defaultRound(3),
  ])

  // Derived: scoring preset auto-applied from count (nearest match).
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

  function updateRound(i, patch) {
    setRounds(arr => arr.map((r, j) => j === i ? { ...r, ...patch } : r))
  }
  function setRoundCount(n) {
    setRounds(arr => {
      const next = []
      for (let i = 0; i < n; i++) next.push(arr[i] ?? defaultRound(i + 1))
      return next.map((r, i) => ({ ...r, round_number: i + 1 }))
    })
  }
  function toggleChampionship(i) {
    setRounds(arr => arr.map((r, j) => {
      if (j !== i) {
        return r.format === 'championship'
          ? { ...r, is_championship: false, format: 'individual_stroke' }
          : { ...r, is_championship: false }
      }
      const turningOn = !r.is_championship
      return {
        ...r,
        is_championship: turningOn,
        format: turningOn ? 'championship' : (r.format === 'championship' ? 'individual_stroke' : r.format),
      }
    }))
  }

  function next() { setError(null); setStep(s => Math.min(TOTAL_STEPS, s + 1)) }
  function back() { setError(null); setStep(s => Math.max(1, s - 1)) }

  function validate() {
    if (step === 1) {
      if (!title.trim() || title.trim().length < 2) return 'Give the trip a name.'
    }
    if (step === 2) {
      if (!playerCount || playerCount < 2) return 'Need at least 2 players.'
      if (playerCount > 24) return 'Max 24 players.'
    }
    if (step === 3) {
      const named = players.filter(p => p.name.trim())
      if (named.length < 2) return 'Add at least 2 player names.'
      const slugs = named.map(p => slugify(p.slug || p.name))
      if (new Set(slugs).size !== slugs.length) return 'Two players have the same auto-derived slug — give them slightly different names.'
    }
    if (step === 4) {
      if (rounds.length < 1) return 'At least one round.'
    }
    return null
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      // Sanitize slug — fall back to a random one if title slugifies to
      // something the DB regex (^[a-z0-9-]{3,40}$) won't accept.
      let finalSlug = slug
      if (!/^[a-z0-9-]{3,40}$/.test(finalSlug)) {
        finalSlug = `trip-${randomSuffix(6)}`
      }
      const finalPlayers = players
        .filter(p => p.name.trim())
        .map((p, i) => ({
          slug: slugify(p.slug || p.name),
          name: p.name.trim(),
          emoji: p.emoji || EMOJI_POOL[i % EMOJI_POOL.length],
          initials: deriveInitials(p.name),
          email: p.email?.trim() || null,
          display_order: i,
        }))
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
          name: r.name.trim() || `Round ${r.round_number}`,
          format: r.format,
          holes: r.holes?.length ? r.holes : defaultHoles(18),
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
          {step === 1 && <Step1 {...{ title, onTitleChange }} />}
          {step === 2 && <Step2 {...{ playerCount, otherMode, setOtherMode, applyCount, derivedPreset }} />}
          {step === 3 && <Step3 {...{ players, updatePlayer, addPlayer, removePlayer }} />}
          {step === 4 && <Step4 {...{ rounds, setRoundCount, updateRound, toggleChampionship }} />}
          {step === 5 && <Step5 {...{ title, slug, players, derivedPreset, rounds }} />}

          {error && <p style={{ color: 'var(--tt-pencil)' }} className="tt-small">{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={back} disabled={step === 1 || submitting}>Back</Button>
            <Button onClick={handleNext} disabled={submitting}>
              {step === TOTAL_STEPS ? (submitting ? 'Creating…' : 'Create tournament') : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </Shell>
  )
}

function Step1({ title, onTitleChange }) {
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

function Step2({ playerCount, otherMode, setOtherMode, applyCount, derivedPreset }) {
  const isPresetMatch = PRESET_COUNTS.includes(playerCount) && !otherMode

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
            placeholder={isPresetMatch ? '' : '7'}
            style={{ width: 80, textAlign: 'center', fontFamily: 'var(--tt-font-mono)' }}
          />
        </label>
      </div>

      <p className="tt-xs tt-muted" style={{ margin: 0 }}>
        Scoring: {derivedPreset.num_groups} groups, championship tier of {derivedPreset.championship_tier_size}.
      </p>
    </div>
  )
}

function Step3({ players, updatePlayer, addPlayer, removePlayer }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Who's playing?
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Email is optional — when an invited address signs in with Google or Apple, they're
        auto-linked to that player. Share the trip URL with them after you create the tournament.
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
              style={{
                textAlign: 'center', padding: '.4em .2em',
                fontSize: 18,
              }}
            />
            <input
              placeholder="Name"
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

function Step4({ rounds, setRoundCount, updateRound, toggleChampionship }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Rounds
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Pick a format per round. Default is 18 par-4 holes; edit pars and stroke index
        from tournament settings after creation.
      </p>

      <label className="stack--tight">
        <span className="tt-eyebrow">How many rounds?</span>
        <input
          type="number"
          min={1}
          max={12}
          value={rounds.length}
          onChange={e => setRoundCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
          style={{ maxWidth: 120, fontFamily: 'var(--tt-font-mono)', textAlign: 'center' }}
        />
      </label>

      <div className="stack--tight">
        {rounds.map((r, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '3rem 1fr 1fr auto',
            gap: '.4rem', alignItems: 'center',
          }}>
            <span className="tt-small tt-muted" style={{ textAlign: 'center' }}>R{r.round_number}</span>
            <input
              value={r.name}
              placeholder={`Round ${r.round_number}`}
              onChange={e => updateRound(i, { name: e.target.value })}
            />
            <select
              value={r.format}
              onChange={e => updateRound(i, { format: e.target.value })}
            >
              {ROUND_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <label
              className="tt-small"
              style={{ display: 'flex', alignItems: 'center', gap: '.3rem', whiteSpace: 'nowrap' }}
              title="Mark as the final championship round"
            >
              <input
                type="checkbox"
                checked={r.is_championship}
                onChange={() => toggleChampionship(i)}
                style={{ width: 'auto' }}
              />
              🏆
            </label>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step5({ title, slug, players, derivedPreset, rounds }) {
  const named = players.filter(p => p.name.trim())
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Ready?
      </h2>
      <dl className="stack--tight" style={{ margin: 0 }}>
        <Row k="Trip" v={title} />
        <Row k="URL" v={`/t/${slug}`} />
        <Row k="Players" v={`${named.length} (${named.map(p => `${p.emoji} ${p.name}`).join(', ')})`} />
        <Row k="Groups" v={String(derivedPreset.num_groups)} />
        <Row k="Championship tier" v={String(derivedPreset.championship_tier_size)} />
        <Row k="Rounds" v={`${rounds.length}: ${rounds.map(r => r.format.replace('_', ' ')).join(', ')}`} />
      </dl>
      <p className="tt-xs tt-muted" style={{ margin: 0 }}>
        You can edit any of this from tournament settings after creation.
      </p>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '8rem 1fr', gap: '.5rem' }}>
      <dt className="tt-small tt-muted">{k}</dt>
      <dd className="tt-small" style={{ margin: 0 }}>{v}</dd>
    </div>
  )
}

function deriveInitials(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase().slice(0, 3)
}
