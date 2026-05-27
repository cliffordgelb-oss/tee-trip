import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { PRESETS, presetForCount } from '../lib/scoringPresets.js'
import { slugify, randomSuffix } from '../lib/slug.js'
import { defaultHoles, defaultPlayer, EMOJI_POOL, ROUND_FORMAT_TILES } from '../lib/defaults.js'
import { Shell, Header, Card, Button } from '../components/ui.jsx'

const TOTAL_STEPS = 5
const PRESET_COUNTS = [4, 6, 8, 12]
const DEFAULT_FORMATS = ['individual_stroke', 'best_ball', 'scramble', 'championship']

export default function NewTournament() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Step 1 — group size
  const [playerCount, setPlayerCount] = useState(6)
  const [otherMode, setOtherMode] = useState(false)

  // Step 2 — players (all optional)
  const [players, setPlayers] = useState(() =>
    Array.from({ length: 6 }, (_, i) => defaultPlayer(i))
  )

  // Step 3 — round formats picked, in order
  const [selectedFormats, setSelectedFormats] = useState(() => [...DEFAULT_FORMATS])

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

  // Toggle a format on/off. Champion always sits at the end.
  function toggleFormat(value) {
    setSelectedFormats(prev => {
      const has = prev.includes(value)
      if (has) return prev.filter(v => v !== value)
      if (value === 'championship') return [...prev, value]
      const champIdx = prev.indexOf('championship')
      if (champIdx >= 0) {
        return [...prev.slice(0, champIdx), value, ...prev.slice(champIdx)]
      }
      return [...prev, value]
    })
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
    }
    if (step === 2) {
      // Names optional, no validation
    }
    if (step === 3) {
      if (selectedFormats.length < 1) return 'Pick at least one round format.'
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

      // Default name "Player N" for any blank rows so the DB has unique slugs.
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
      // De-dup slugs (e.g. two "Player 1" rows produce same slug).
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
          {step === 1 && <Step1 {...{ playerCount, otherMode, setOtherMode, applyCount, derivedPreset }} />}
          {step === 2 && <Step2 {...{ players, updatePlayer, addPlayer, removePlayer }} />}
          {step === 3 && <Step3 {...{ selectedFormats, toggleFormat }} />}
          {step === 4 && <Step4 {...{ title, onTitleChange }} />}
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

// ── Step 1 — group size ──────────────────────────────────────
function Step1({ playerCount, otherMode, setOtherMode, applyCount, derivedPreset }) {
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
        Names are optional — leave blank to fill in later from settings. If you add an email,
        we'll auto-link that player when they sign in with Google or Apple.
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
function Step3({ selectedFormats, toggleFormat }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Pick your rounds
      </h2>
      <p className="tt-small tt-muted" style={{ margin: 0 }}>
        Tap a format to add it as the next round. Tap again to remove. The number on each tile
        shows the round order. Championship always plays last.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {ROUND_FORMAT_TILES.map(tile => {
          const idx = selectedFormats.indexOf(tile.value)
          const selected = idx !== -1
          return (
            <button
              key={tile.value}
              type="button"
              onClick={() => toggleFormat(tile.value)}
              style={{
                position: 'relative',
                textAlign: 'left',
                padding: '14px 16px',
                border: `1px solid ${selected ? 'var(--tt-fairway)' : 'var(--tt-line)'}`,
                background: selected ? 'var(--tt-fairway-tint)' : 'var(--tt-paper)',
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 150ms linear, border-color 150ms linear',
              }}
            >
              {selected && (
                <span
                  aria-label={`Round ${idx + 1}`}
                  style={{
                    position: 'absolute',
                    top: 10, left: 10,
                    width: 24, height: 24,
                    borderRadius: '50%',
                    background: 'var(--tt-fairway)',
                    color: '#fff',
                    fontFamily: 'var(--tt-font-mono)',
                    fontWeight: 700,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >{idx + 1}</span>
              )}
              <div style={{ paddingLeft: selected ? 32 : 0 }}>
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

      {selectedFormats.length > 0 && (
        <p className="tt-small" style={{ margin: 0, color: 'var(--tt-ink-soft)' }}>
          <strong>{selectedFormats.length} round{selectedFormats.length === 1 ? '' : 's'}:</strong>{' '}
          {selectedFormats.map((f, i) => (
            <span key={f}>
              {i > 0 && ' · '}
              {i + 1}. {ROUND_FORMAT_TILES.find(t => t.value === f)?.title}
            </span>
          ))}
        </p>
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

// ── Step 5 — review ──────────────────────────────────────────
function Step5({ title, slug, players, derivedPreset, rounds }) {
  const named = players.filter(p => p.name.trim())
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0, fontFamily: 'var(--tt-font-display)' }}>
        Ready?
      </h2>
      <dl className="stack--tight" style={{ margin: 0 }}>
        <Row k="Trip" v={title} />
        <Row k="URL" v={`/t/${slug || '(auto)'}`} />
        <Row k="Players" v={
          named.length === 0
            ? `${players.length} (names later)`
            : `${players.length}: ${named.map(p => `${p.emoji} ${p.name}`).join(', ')}${named.length < players.length ? ', …' : ''}`
        } />
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
