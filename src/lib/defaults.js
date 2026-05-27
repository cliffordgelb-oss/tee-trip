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
  { value: 'stableford',        label: 'Stableford' },
  { value: 'modified_stableford', label: 'Modified Stableford' },
  { value: 'best_ball',         label: 'Best ball (team)' },
  { value: 'scramble',          label: 'Scramble (team)' },
  { value: 'shamble',           label: 'Shamble (team)' },
  { value: 'pinehurst',         label: 'Pinehurst (team)' },
  { value: 'match_play',        label: 'Match play (team)' },
  { value: 'wolf',              label: 'Wolf (4 players)' },
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
    value: 'stableford',
    title: 'Stableford',
    short: 'Points per hole. One blow-up won\'t kill your round.',
    desc:
      'Every golfer plays their own ball. Each hole earns points based on net score vs par: eagle-or-better = 8, birdie = 4, par = 2, bogey = 1, double-or-worse = 0. Highest points wins. Forgiving — you can\'t lose more than zero on a hole — so big numbers don\'t torpedo your day.',
  },
  {
    value: 'modified_stableford',
    title: 'Modified Stableford',
    short: 'Aggressive points. Birdies pay, blow-ups hurt.',
    desc:
      'The PGA "International" event scale: eagle-or-better = 5, birdie = 2, par = 0, bogey = -1, double-or-worse = -3. Rewards going for it; punishes the wheels-coming-off hole. Totals can go negative. Highest wins.',
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
    value: 'match_play',
    title: 'Match play',
    short: 'Two teams. Win the hole, win the point.',
    desc:
      'Two teams play head-to-head. On every hole, each team\'s lowest net score is compared — the team with the better number wins the hole; tied holes are halved. Whoever wins more holes takes the match. Needs exactly two groups; works for any group size (singles, two-vs-two four-ball, three-vs-three, etc.).',
  },
  {
    value: 'pinehurst',
    title: 'Pinehurst (Chapman)',
    short: 'Two-player teams. Tee off, switch balls, then alternate shot.',
    desc:
      'Old-school strategic format. Two-player teams; both partners tee off, then switch and play their partner\'s drive for shot two. After that, they pick the better-positioned ball and finish the hole alternate-shot. One score per team per hole. Best with even-numbered groups paired up.',
  },
  {
    value: 'wolf',
    title: 'Wolf',
    short: '4 players, rotating partner — or go it alone.',
    desc:
      'Strictly 4 players in one group. Each hole picks a "wolf" in rotation (hole 1 → player 1, hole 2 → player 2, etc.). The wolf either takes a partner for that hole or plays Lone Wolf vs the other three. Best net score on each side decides the hole. Default points: 2 each for wolf+partner win, 3 each for the other team if they win, 4 to lone wolf if they win solo, 1 each to the other three if lone wolf loses, 0 on a tie.',
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
