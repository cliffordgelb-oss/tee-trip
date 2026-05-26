import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { PRESETS, presetForCount } from '../lib/scoringPresets.js'
import { slugify, randomSuffix } from '../lib/slug.js'
import { defaultHoles, defaultRound, defaultPlayer, ROUND_FORMATS } from '../lib/defaults.js'
import { Shell, Header, Card, Button } from '../components/ui.jsx'

const TOTAL_STEPS = 5

export default function NewTournament() {
  const nav = useNavigate()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [players, setPlayers] = useState(() =>
    Array.from({ length: 6 }, () => defaultPlayer())
  )

  // Scoring state stores user choices only. Effective preset is derived from
  // the populated player count + the user's explicit pick (if any).
  const [overridePresetKey, setOverridePresetKey] = useState(null)
  const [advancedJson, setAdvancedJson] = useState(
    () => JSON.stringify(PRESETS[6].scoring_config, null, 2)
  )
  const [advanced, setAdvanced] = useState(false)

  const [rounds, setRounds] = useState(() => [
    defaultRound(1), defaultRound(2), defaultRound(3),
    defaultRound(4), { ...defaultRound(5), format: 'championship', is_championship: true },
  ])

  const populatedPlayerCount = players.filter(p => p.name.trim()).length
  const derivedPreset = useMemo(
    () => overridePresetKey ? PRESETS[overridePresetKey] : presetForCount(populatedPlayerCount || 2),
    [overridePresetKey, populatedPlayerCount]
  )

  function onTitleChange(t) {
    setTitle(t)
    if (!slugTouched) setSlug(slugify(t))
  }

  function next() { setError(null); setStep(s => Math.min(TOTAL_STEPS, s + 1)) }
  function back() { setError(null); setStep(s => Math.max(1, s - 1)) }

  function updatePlayer(i, patch) {
    setPlayers(arr => arr.map((p, j) => j === i ? { ...p, ...patch } : p))
  }
  function addPlayer() { setPlayers(arr => [...arr, defaultPlayer(arr.length)]) }
  function removePlayer(i) { setPlayers(arr => arr.filter((_, j) => j !== i)) }

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
    setRounds(arr => arr.map((r, j) => ({
      ...r,
      is_championship: j === i ? !r.is_championship : false,
      format: j === i && !r.is_championship ? 'championship' : (r.format === 'championship' && j !== i ? 'individual_stroke' : r.format),
    })))
  }

  function validate() {
    if (step === 1) {
      if (!title.trim()) return 'Give the tournament a title.'
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) return 'Slug must be 3–40 chars, lowercase letters / numbers / dashes.'
    }
    if (step === 2) {
      const named = players.filter(p => p.name.trim())
      if (named.length < 2) return 'Add at least 2 players.'
      const slugs = named.map(p => slugify(p.slug || p.name))
      if (new Set(slugs).size !== slugs.length) return 'Each player needs a unique slug.'
    }
    if (step === 3 && advanced) {
      try { JSON.parse(advancedJson) }
      catch { return 'Scoring JSON is not valid.' }
    }
    if (step === 4) {
      if (rounds.length < 1) return 'At least one round.'
      const numbers = rounds.map(r => r.round_number)
      if (new Set(numbers).size !== numbers.length) return 'Round numbers must be unique.'
    }
    return null
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const finalPlayers = players
        .filter(p => p.name.trim())
        .map((p, i) => ({
          slug: slugify(p.slug || p.name),
          name: p.name.trim(),
          emoji: p.emoji || '⛳',
          initials: (p.initials || p.name.trim().slice(0, 2)).toUpperCase(),
          email: p.email?.trim() || null,
          display_order: i,
        }))
      const scoring_config = advanced
        ? JSON.parse(advancedJson)
        : derivedPreset.scoring_config
      const championship = rounds.find(r => r.is_championship)
      const config = {
        slug,
        title: title.trim(),
        num_groups: derivedPreset.num_groups,
        championship_tier_size: derivedPreset.championship_tier_size,
        scoring_config,
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
        // Slug collision retry with a suffix.
        if (/duplicate key|unique constraint/i.test(rpcError.message)) {
          config.slug = `${slug}-${randomSuffix()}`
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
          height: 4,
          background: 'var(--tt-line)',
          borderRadius: 2,
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div style={{
          width: `${(step / TOTAL_STEPS) * 100}%`,
          height: '100%',
          background: 'var(--tt-fairway)',
          transition: 'width 150ms linear',
        }} />
      </div>

      <Card>
        <div className="stack">
          {step === 1 && (
            <Step1 {...{ title, onTitleChange, slug, setSlug, setSlugTouched }} />
          )}
          {step === 2 && (
            <Step2 {...{ players, updatePlayer, addPlayer, removePlayer }} />
          )}
          {step === 3 && (
            <Step3 {...{
              overridePresetKey, setOverridePresetKey,
              advanced, setAdvanced, advancedJson, setAdvancedJson,
              derivedPreset, populatedPlayerCount,
            }} />
          )}
          {step === 4 && (
            <Step4 {...{ rounds, setRoundCount, updateRound, toggleChampionship }} />
          )}
          {step === 5 && (
            <Step5 {...{ title, slug, players, derivedPreset, rounds }} />
          )}

          {error && (
            <p style={{ color: 'var(--tt-pencil)' }} className="tt-small">{error}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            <Button
              variant="ghost"
              onClick={back}
              disabled={step === 1 || submitting}
            >Back</Button>
            <Button
              onClick={handleNext}
              disabled={submitting}
            >
              {step === TOTAL_STEPS ? (submitting ? 'Creating…' : 'Create tournament') : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </Shell>
  )
}

function Step1({ title, onTitleChange, slug, setSlug, setSlugTouched }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0 }}>What's the trip called?</h2>
      <label className="stack--tight">
        <span className="tt-eyebrow">Title</span>
        <input
          autoFocus
          value={title}
          placeholder="Bama Golf Trip 2026"
          onChange={e => onTitleChange(e.target.value)}
        />
      </label>
      <label className="stack--tight">
        <span className="tt-eyebrow">URL slug</span>
        <input
          value={slug}
          onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()) }}
        />
        <span className="small muted">
          tee-trip.app/t/<strong>{slug || '…'}</strong>
        </span>
      </label>
    </div>
  )
}

function Step2({ players, updatePlayer, addPlayer, removePlayer }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0 }}>Who's playing?</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Add a row per player. Email is optional — when an invited email signs in with
        Google/Apple, they're auto-linked to that player.
      </p>
      <div className="stack--tight">
        {players.map((p, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '2.5rem 1fr 4rem 3.5rem 1fr auto',
            gap: '.4rem', alignItems: 'center',
          }}>
            <input
              value={p.emoji}
              maxLength={4}
              style={{ textAlign: 'center', padding: '.4em .2em' }}
              onChange={e => updatePlayer(i, { emoji: e.target.value })}
              aria-label="Emoji"
            />
            <input
              placeholder="Name"
              value={p.name}
              onChange={e => updatePlayer(i, { name: e.target.value })}
            />
            <input
              placeholder="slug"
              value={p.slug}
              onChange={e => updatePlayer(i, { slug: slugify(e.target.value) })}
              aria-label="Slug"
            />
            <input
              placeholder="IN"
              value={p.initials}
              maxLength={3}
              style={{ textTransform: 'uppercase', textAlign: 'center' }}
              onChange={e => updatePlayer(i, { initials: e.target.value.toUpperCase() })}
              aria-label="Initials"
            />
            <input
              placeholder="email (optional)"
              type="email"
              value={p.email}
              onChange={e => updatePlayer(i, { email: e.target.value })}
            />
            <button
              className="btn btn--ghost small"
              style={{ padding: '.3rem .6rem' }}
              onClick={() => removePlayer(i)}
              disabled={players.length <= 1}
              aria-label="Remove"
            >✕</button>
          </div>
        ))}
      </div>
      <button className="btn btn--ghost small" style={{ alignSelf: 'flex-start' }} onClick={addPlayer}>
        + Add player
      </button>
    </div>
  )
}

function Step3({
  setOverridePresetKey,
  advanced, setAdvanced, advancedJson, setAdvancedJson,
  derivedPreset, populatedPlayerCount,
}) {
  const presetKeys = Object.keys(PRESETS).map(Number)
  const activeKey = derivedPreset
    ? presetKeys.find(k => PRESETS[k] === derivedPreset)
    : null

  function applyPreset(k) {
    setOverridePresetKey(k)
    setAdvanced(false)
    setAdvancedJson(JSON.stringify(PRESETS[k].scoring_config, null, 2))
  }

  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0 }}>How are you scoring?</h2>
      <p className="small muted" style={{ margin: 0 }}>
        We picked a preset based on your {populatedPlayerCount || 0} player(s). Adjust if needed.
      </p>

      <div className="stack--tight">
        {presetKeys.map(k => (
          <label key={k} style={{
            display: 'flex', alignItems: 'center', gap: '.5rem',
            padding: '.5rem .75rem',
            border: `1px solid ${activeKey === k && !advanced ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 8, cursor: 'pointer',
          }}>
            <input
              type="radio"
              name="preset"
              checked={activeKey === k && !advanced}
              onChange={() => applyPreset(k)}
              style={{ width: 'auto' }}
            />
            <span>{PRESETS[k].label}</span>
          </label>
        ))}
      </div>

      <div className="stack--tight">
        <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <input
            type="checkbox"
            checked={advanced}
            onChange={e => setAdvanced(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <span className="small">Advanced: edit raw scoring JSON</span>
        </label>
        {advanced && (
          <textarea
            rows={10}
            value={advancedJson}
            onChange={e => setAdvancedJson(e.target.value)}
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '.85rem' }}
          />
        )}
      </div>

      <div className="stack--tight small muted">
        <div>Number of groups: <strong>{derivedPreset.num_groups}</strong></div>
        <div>Championship tier size: <strong>{derivedPreset.championship_tier_size}</strong></div>
      </div>
    </div>
  )
}

function Step4({ rounds, setRoundCount, updateRound, toggleChampionship }) {
  return (
    <div className="stack">
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0 }}>Rounds</h2>
      <p className="small muted" style={{ margin: 0 }}>
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
        />
      </label>

      <div className="stack--tight">
        {rounds.map((r, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '3rem 1fr 1fr auto',
            gap: '.4rem', alignItems: 'center',
          }}>
            <span className="small muted" style={{ textAlign: 'center' }}>R{r.round_number}</span>
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
              className="small"
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
      <h2 style={{ fontSize: 'var(--tt-text-lg)', margin: 0 }}>Ready?</h2>
      <dl className="stack--tight" style={{ margin: 0 }}>
        <Row k="Trip" v={title} />
        <Row k="URL" v={`/t/${slug}`} />
        <Row k="Players" v={`${named.length} (${named.map(p => p.name).join(', ')})`} />
        <Row k="Groups" v={String(derivedPreset.num_groups)} />
        <Row k="Championship tier" v={String(derivedPreset.championship_tier_size)} />
        <Row k="Rounds" v={`${rounds.length}: ${rounds.map(r => r.format.replace('_', ' ')).join(', ')}`} />
      </dl>
      <p className="small muted" style={{ margin: 0 }}>
        You can edit any of this from tournament settings after creation.
      </p>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '8rem 1fr', gap: '.5rem' }}>
      <dt className="small muted">{k}</dt>
      <dd className="small" style={{ margin: 0 }}>{v}</dd>
    </div>
  )
}
