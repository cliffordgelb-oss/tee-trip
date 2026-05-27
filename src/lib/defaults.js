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
  { value: 'shamble',           label: 'Shamble (team)' },
  { value: 'pinehurst',         label: 'Pinehurst (team)' },
  { value: 'championship',      label: 'Championship final (stroke play, seeded)' },
]

// Format tiles for the wizard's "pick your rounds" step. Each tile
// shows a one-line tagline + a richer description so non-golfers can
// understand what they're picking without Googling.
export const ROUND_FORMAT_TILES = [
  {
    value: 'individual_stroke',
    title: 'Individual stroke play',
    short: 'Every golfer for themselves.',
    desc:
      'Everyone plays their own ball the whole round. Lowest total strokes wins. The classic — works great with mixed handicaps and rewards consistency.',
  },
  {
    value: 'best_ball',
    title: 'Best ball',
    short: 'Two teams. Best score per hole counts.',
    desc:
      'Split into two teams. Each player plays their own ball, but on every hole only the lowest score on each team counts toward that team\'s total. Lowest team score wins the round.',
  },
  {
    value: 'scramble',
    title: 'Scramble',
    short: 'Two teams. Hit, pick the best shot, repeat.',
    desc:
      'Split into two teams. Everyone tees off, the team picks the best shot, then everyone plays from there. Same for the next shot, all the way down. Fast, social, forgiving of a bad day.',
  },
  {
    value: 'shamble',
    title: 'Shamble',
    short: 'Teams tee off, take the best drive, then play your own ball.',
    desc:
      'A middle ground between scramble and best ball. Everyone tees off, the team picks the best drive, then each player finishes the hole with their own ball. The team\'s hole score is the lowest individual score. Less luck than scramble, less brutal than best ball.',
  },
  {
    value: 'pinehurst',
    title: 'Pinehurst (Chapman)',
    short: 'Two-player teams. Tee off, switch balls, then alternate shot.',
    desc:
      'Old-school strategic format. Two-player teams; both partners tee off, then switch and play their partner\'s drive for shot two. After that, they pick the better-positioned ball and finish the hole alternate-shot. One score per team per hole. Best with even-numbered groups paired up.',
  },
  {
    value: 'championship',
    title: 'Championship final',
    short: 'Last round. Stroke play. Top players get a head start.',
    desc:
      'A stroke-play round where leaders going in get negative-stroke head starts based on the standings. This is the one that decides the trip champion. Always plays last.',
  },
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
