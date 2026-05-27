// Scoring recipes from the forkable-golf-trip-tournament README,
// keyed by player count. Owners can edit these in advanced mode.

export const PRESETS = {
  4: {
    label: '4 players — two 2-somes',
    num_groups: 2,
    championship_tier_size: 2,
    scoring_config: {
      individual_stroke:   { holePoints: [3, 1], placement: [8, 4], matchPlayBonus: 1 },
      stableford:          { placement: [8, 4], matchPlayBonus: 1 },
      modified_stableford: { placement: [8, 4], matchPlayBonus: 1 },
      best_ball:           { winnerPoints: 10 },
      scramble:            { winnerPoints: 10 },
      match_play:          { winnerPoints: 10 },
      wolf:                { points: { wolfPartnerWin: 2, wolfPartnerLose: 3, loneWolfWin: 4, loneWolfLose: 1, tied: 0 } },
      championship:        { placement: [8, 4] },
    },
  },
  6: {
    label: '6 players — two 3-somes',
    num_groups: 2,
    championship_tier_size: 3,
    scoring_config: {
      individual_stroke:   { holePoints: [5, 3, 1], placement: [12, 8, 4], matchPlayBonus: 1 },
      stableford:          { placement: [12, 8, 4], matchPlayBonus: 1 },
      modified_stableford: { placement: [12, 8, 4], matchPlayBonus: 1 },
      best_ball:           { winnerPoints: 15 },
      scramble:            { winnerPoints: 15 },
      match_play:          { winnerPoints: 15 },
      championship:        { placement: [12, 8, 4] },
    },
  },
  8: {
    label: '8 players — two 4-somes',
    num_groups: 2,
    championship_tier_size: 4,
    scoring_config: {
      individual_stroke:   { holePoints: [6, 4, 2, 0], placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      stableford:          { placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      modified_stableford: { placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      best_ball:           { winnerPoints: 20 },
      scramble:            { winnerPoints: 20 },
      match_play:          { winnerPoints: 20 },
      championship:        { placement: [16, 10, 6, 2] },
    },
  },
  12: {
    label: '12 players — three 4-somes',
    num_groups: 3,
    championship_tier_size: 4,
    scoring_config: {
      individual_stroke:   { holePoints: [6, 4, 2, 0], placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      stableford:          { placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      modified_stableford: { placement: [16, 10, 6, 2], matchPlayBonus: 2 },
      best_ball:           { winnerPoints: 20 },
      scramble:            { winnerPoints: 20 },
      match_play:          { winnerPoints: 20 },
      championship:        { placement: [16, 10, 6, 2] },
    },
  },
}

// Closest preset for a given player count (round down to nearest known key).
export function presetForCount(n) {
  const keys = Object.keys(PRESETS).map(Number).sort((a, b) => a - b)
  let chosen = keys[0]
  for (const k of keys) if (n >= k) chosen = k
  return PRESETS[chosen]
}
