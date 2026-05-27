// 18 par-4 holes with stroke index = hole number. Owners can edit
// per-hole par + SI in the wizard or the tournament settings.
export function defaultHoles(holesCount = 18) {
  return Array.from({ length: holesCount }, (_, i) => ({
    hole: i + 1,
    par: 4,
    stroke_index: i + 1,
  }))
}

export const ROUND_FORMATS = [
  { value: 'individual_stroke', label: 'Individual stroke play' },
  { value: 'best_ball',         label: 'Best ball (team)' },
  { value: 'scramble',          label: 'Scramble (team)' },
  { value: 'championship',      label: 'Championship final (stroke play, seeded)' },
]

export function defaultRound(n) {
  return {
    round_number: n,
    name: `Round ${n}`,
    format: 'individual_stroke',
    is_championship: false,
    holes: defaultHoles(18),
  }
}

// Pool the wizard cycles through for default emojis (Tee Trip uses
// emoji as the player avatar, per the design system).
export const EMOJI_POOL = ['⛳', '🏌️', '🦅', '🐍', '🍺', '🐐', '🌮', '🥃', '🦁', '🐦', '🎯', '🏆']

export function defaultPlayer(i = 0) {
  return {
    slug: '',
    name: '',
    emoji: EMOJI_POOL[i % EMOJI_POOL.length],
    initials: '',
    email: '',
  }
}
