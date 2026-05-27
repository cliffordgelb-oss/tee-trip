// Tee Trip — config-driven scoring engine
//
// Ported from BamaApp's App.jsx (lines ~37-328) and made generic over:
// - number of players / groups (was hardcoded 6 players, two 3-somes)
// - scoring constants (was hardcoded 5/3/1, 12/8/4, 15-pt team bonus, 6-rung
//   championship ladder)
// - holes per round (was hardcoded 18)
//
// All player ids here are opaque — Tee Trip uses uuids, BamaApp used text.
//
// Public API:
//   computeRoundPoints({ players, round, holes, scores, roundStrokes, scoringConfig, cumulativeBefore })
//   → { [playerId]: number }
//
//   computeLeaderboard({ players, rounds, holes, scores, roundStrokes, scoringConfig })
//   → [{ playerId, total, perRound: { [roundId]: points } }]  (sorted desc)
//
// Pure functions; no React, no Supabase.

// ----- Handicap helpers -----

export function getStrokesOnHole(totalStrokes, strokeIndex, holesCount = 18) {
  if (!strokeIndex || totalStrokes <= 0) return 0
  const fullRound = Math.floor(totalStrokes / holesCount)
  const remainder = totalStrokes % holesCount
  return fullRound + (strokeIndex <= remainder ? 1 : 0)
}

// strokesMap: { [playerId]: { handicap, group_assignment } }
// For individual_stroke: per-group min handicap is the reference.
// For best_ball/scramble/championship: field-min is the reference.
// Returns { [playerId]: effectiveStrokesForRound }.
export function deriveStrokesForFormat(strokesMap, formatKey) {
  const out = {}
  const entries = Object.entries(strokesMap || {})
  if (entries.length === 0) return out
  const fieldHcps = entries.map(([, s]) => Number(s?.handicap) || 0)
  const fieldMin = Math.min(...fieldHcps)
  const groupMins = {}
  for (const [, s] of entries) {
    const g = s?.group_assignment
    if (!g) continue
    const h = Number(s?.handicap) || 0
    if (groupMins[g] === undefined || h < groupMins[g]) groupMins[g] = h
  }
  const fieldRelative = formatKey === 'best_ball'
    || formatKey === 'scramble'
    || formatKey === 'shamble'
    || formatKey === 'pinehurst'
    || formatKey === 'championship'
  for (const [pid, s] of entries) {
    if (!s) continue
    const hcp = Number(s.handicap) || 0
    const ref = fieldRelative ? fieldMin : (groupMins[s.group_assignment] ?? 0)
    out[pid] = Math.max(0, hcp - ref)
  }
  return out
}

// ----- Standard Stableford lookup. `diff` is net-minus-par on a hole
// (lower is better). Defaults to the World Handicap System scale; owners
// can override via scoring_config.stableford.pointsTable in advanced mode.
export function stablefordPointsForDiff(diff, pointsTable) {
  const t = pointsTable
  if (diff <= -2) return t?.eagleOrBetter ?? 8
  if (diff === -1) return t?.birdie ?? 4
  if (diff === 0) return t?.par ?? 2
  if (diff === 1) return t?.bogey ?? 1
  return t?.doubleOrWorse ?? 0
}

// ----- Split a prize array across ranked entries; ties average the prizes they share.
// entries: [{ pid, value }]
// prizes: array of point values (e.g. [5,3,1])
// betterIsLower: true → lowest value gets prizes[0] (net scores)
export function allocateSplit(entries, prizes, betterIsLower) {
  const sorted = [...entries].sort((a, b) => betterIsLower ? a.value - b.value : b.value - a.value)
  const out = {}
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j < sorted.length && sorted[j].value === sorted[i].value) j++
    const slice = prizes.slice(i, j)
    const avg = slice.length === 0 ? 0 : slice.reduce((a, v) => a + v, 0) / slice.length
    for (let k = i; k < j; k++) out[sorted[k].pid] = avg
    i = j
  }
  return out
}

// ----- Per-group per-hole points (5/3/1-style) used for placement ranking.
function computeHolePointStandings(groupPids, sortedHoles, scores, effectiveStrokes, holePoints) {
  const totals = Object.fromEntries(groupPids.map(pid => [pid, 0]))
  let thruHole = 0
  if (groupPids.length === 0) return { totals, thruHole }
  for (const h of sortedHoles) {
    const entries = []
    let allEntered = true
    for (const pid of groupPids) {
      const s = scores.find(sc => sc.player_id === pid && sc.hole === h.hole)
      if (!s) { allEntered = false; break }
      const so = getStrokesOnHole(effectiveStrokes[pid] || 0, h.stroke_index, sortedHoles.length)
      entries.push({ pid, value: s.gross - so })
    }
    if (!allEntered) break
    const alloc = allocateSplit(entries, holePoints, true)
    for (const pid of Object.keys(alloc)) totals[pid] += alloc[pid]
    thruHole = h.hole
  }
  return { totals, thruHole }
}

// ----- Team match-play +1 across two groups (head-to-head best ball, by hole).
function computeTeamBestBallMatch(groupA, groupB, sortedHoles, scores, strokes) {
  let aHolesUp = 0
  let thruHole = 0
  if (groupA.length === 0 || groupB.length === 0) return { aHolesUp, thruHole }
  for (const h of sortedHoles) {
    const bestNet = (g) => {
      const nets = []
      for (const pid of g) {
        const s = scores.find(sc => sc.player_id === pid && sc.hole === h.hole)
        if (!s) return null
        const so = getStrokesOnHole(strokes[pid] || 0, h.stroke_index, sortedHoles.length)
        nets.push(s.gross - so)
      }
      return nets.length ? Math.min(...nets) : null
    }
    const aNet = bestNet(groupA)
    const bNet = bestNet(groupB)
    if (aNet == null || bNet == null) break
    if (aNet < bNet) aHolesUp += 1
    else if (bNet < aNet) aHolesUp -= 1
    thruHole = h.hole
  }
  return { aHolesUp, thruHole }
}

// ----- Group players by their group_assignment letter. Returns Map<groupLetter, pid[]>.
function groupsByLetter(strokesMap) {
  const map = new Map()
  for (const [pid, s] of Object.entries(strokesMap || {})) {
    const g = s?.group_assignment
    if (!g) continue
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(pid)
  }
  // Preserve sorted group letters for determinism (A, B, C, ...).
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

// ----- Centered ladder of integer strokes for championship seeding.
// E.g. 6 players → [-3,-2,-1,0,1,2]; 4 → [-2,-1,0,1].
export function championshipLadder(n) {
  // For n=6 returns [-3,-2,-1,0,1,2] (matches BamaApp); for n=4 [-2,-1,0,1];
  // for n=5 [-2,-1,0,1,2]. Top-ranked player gets the most-favorable adjustment.
  const offset = Math.floor((n - 1) / 2) + (n % 2 === 0 ? 1 : 0)
  return Array.from({ length: n }, (_, i) => i - offset)
}

// ----- Award points for one round.
// scoringConfig: jsonb { individual_stroke, stableford, best_ball, scramble, championship }
// cumulativeBefore: { [pid]: points } for championship seeding; null for non-championship
export function computeRoundPoints({
  players, round, holes, scores, roundStrokes, scoringConfig, cumulativeBefore = null,
  championshipTierSize = null,
}) {
  const points = Object.fromEntries(players.map(p => [p.id, 0]))
  if (!round || !holes?.length) return points
  const holesCount = holes.length
  const sortedHoles = [...holes].sort((a, b) => a.hole - b.hole)

  const strokesMap = {}
  for (const rs of roundStrokes || []) {
    if (rs.round_id !== round.id) continue
    strokesMap[rs.player_id] = { handicap: rs.handicap, group_assignment: rs.group_assignment }
  }
  const effectiveStrokes = deriveStrokesForFormat(strokesMap, round.format)
  const groups = groupsByLetter(strokesMap)
  const roundScores = (scores || []).filter(s => s.round_id === round.id)

  const isf = scoringConfig?.individual_stroke ?? {}
  const sf  = scoringConfig?.stableford ?? {}
  const bb  = scoringConfig?.best_ball ?? {}
  const sc  = scoringConfig?.scramble ?? {}
  const ch  = scoringConfig?.championship ?? {}

  if (round.format === 'individual_stroke') {
    const holePoints = isf.holePoints ?? [5, 3, 1]
    const placement = isf.placement ?? [12, 8, 4]
    const matchPlayBonus = isf.matchPlayBonus ?? 0

    // Per-group hole-points → placement; only fires when group fully through.
    for (const [, gPids] of groups) {
      const standings = computeHolePointStandings(gPids, sortedHoles, roundScores, effectiveStrokes, holePoints)
      if (standings.thruHole !== holesCount) continue
      const entries = gPids.map(pid => ({ pid, value: standings.totals[pid] }))
      const alloc = allocateSplit(entries, placement, false)
      for (const pid of Object.keys(alloc)) points[pid] += alloc[pid]
    }

    // Head-to-head match-play bonus (only when num_groups === 2 — generalizing
    // to round-robin is a v2 task).
    if (matchPlayBonus > 0 && groups.size === 2) {
      const [[, gA], [, gB]] = [...groups]
      const fieldStrokes = deriveStrokesForFormat(strokesMap, 'best_ball')
      const aFull = roundScores.filter(s => gA.includes(s.player_id)).length === gA.length * holesCount
      const bFull = roundScores.filter(s => gB.includes(s.player_id)).length === gB.length * holesCount
      if (aFull && bFull) {
        const match = computeTeamBestBallMatch(gA, gB, sortedHoles, roundScores, fieldStrokes)
        const winners = match.aHolesUp > 0 ? gA : (match.aHolesUp < 0 ? gB : [])
        winners.forEach(pid => { points[pid] += matchPlayBonus })
      }
    }
    return points
  }

  if (round.format === 'stableford') {
    // Per-hole net points vs par (eagle+=8, birdie=4, par=2, bogey=1, double+=0
    // by default). Tally per player, then award placement points within the
    // group. Same per-group / per-group-min-handicap convention as
    // individual_stroke. Highest stableford total wins the group.
    const placement = sf.placement ?? [12, 8, 4]
    const matchPlayBonus = sf.matchPlayBonus ?? 0
    const pointsTable = sf.pointsTable

    for (const [, gPids] of groups) {
      const totals = {}
      let allComplete = true
      for (const pid of gPids) {
        let total = 0
        for (const h of sortedHoles) {
          const s = roundScores.find(sc2 => sc2.player_id === pid && sc2.hole === h.hole)
          if (!s) { allComplete = false; break }
          const so = getStrokesOnHole(effectiveStrokes[pid] || 0, h.stroke_index, holesCount)
          total += stablefordPointsForDiff(s.gross - so - h.par, pointsTable)
        }
        if (!allComplete) break
        totals[pid] = total
      }
      if (!allComplete) continue
      const entries = gPids.map(pid => ({ pid, value: totals[pid] }))
      const alloc = allocateSplit(entries, placement, false) // higher stableford wins
      for (const pid of Object.keys(alloc)) points[pid] += alloc[pid]
    }

    // Same head-to-head bonus shape as individual_stroke — best-net match
    // between the two groups settles the bonus.
    if (matchPlayBonus > 0 && groups.size === 2) {
      const [[, gA], [, gB]] = [...groups]
      const fieldStrokes = deriveStrokesForFormat(strokesMap, 'best_ball')
      const aFull = roundScores.filter(s => gA.includes(s.player_id)).length === gA.length * holesCount
      const bFull = roundScores.filter(s => gB.includes(s.player_id)).length === gB.length * holesCount
      if (aFull && bFull) {
        const match = computeTeamBestBallMatch(gA, gB, sortedHoles, roundScores, fieldStrokes)
        const winners = match.aHolesUp > 0 ? gA : (match.aHolesUp < 0 ? gB : [])
        winners.forEach(pid => { points[pid] += matchPlayBonus })
      }
    }
    return points
  }

  if (round.format === 'best_ball' || round.format === 'shamble') {
    // Shamble: same scoring shape as best ball — team's hole score is
    // the lowest individual on the team. The team-format difference is
    // purely in how the ball is played, not in how points fall out.
    const winnerPoints = bb.winnerPoints ?? 15
    if (groups.size < 2) return points
    const totals = []
    let allComplete = true
    for (const [letter, gPids] of groups) {
      let total = 0
      for (const h of sortedHoles) {
        const nets = []
        for (const pid of gPids) {
          const s = roundScores.find(sc2 => sc2.player_id === pid && sc2.hole === h.hole)
          if (!s) { allComplete = false; break }
          nets.push(s.gross - getStrokesOnHole(effectiveStrokes[pid] || 0, h.stroke_index, holesCount))
        }
        if (!allComplete) break
        total += Math.min(...nets)
      }
      if (!allComplete) break
      totals.push({ letter, total, gPids })
    }
    if (!allComplete || totals.length !== groups.size) return points
    const lowest = Math.min(...totals.map(t => t.total))
    const winners = totals.filter(t => t.total === lowest)
    const split = winnerPoints / winners.length
    winners.forEach(w => w.gPids.forEach(pid => { points[pid] += split }))
    return points
  }

  if (round.format === 'scramble' || round.format === 'pinehurst') {
    // Pinehurst: alternate-shot after the swap. One captain row per
    // team per hole (same as scramble), so scoring code is identical.
    const winnerPoints = sc.winnerPoints ?? 15
    if (groups.size < 2) return points
    const totals = []
    let allComplete = true
    for (const [letter, gPids] of groups) {
      const captain = gPids[0]
      const captainScores = roundScores.filter(s => s.player_id === captain)
      if (captainScores.length !== holesCount) { allComplete = false; break }
      const teamMin = Math.min(...gPids.map(pid => effectiveStrokes[pid] || 0))
      let total = 0
      for (const s of captainScores) {
        const h = sortedHoles.find(hh => hh.hole === s.hole)
        total += s.gross - getStrokesOnHole(teamMin, h?.stroke_index, holesCount)
      }
      totals.push({ letter, total, gPids })
    }
    if (!allComplete || totals.length !== groups.size) return points
    const lowest = Math.min(...totals.map(t => t.total))
    const winners = totals.filter(t => t.total === lowest)
    const split = winnerPoints / winners.length
    winners.forEach(w => w.gPids.forEach(pid => { points[pid] += split }))
    return points
  }

  if (round.format === 'championship') {
    if (!cumulativeBefore) return points
    const placement = ch.placement ?? [12, 8, 4]
    const ranked = [...players].sort((a, b) =>
      (cumulativeBefore[b.id] || 0) - (cumulativeBefore[a.id] || 0)
    )
    const ladder = championshipLadder(ranked.length)
    const adjustment = {}
    ranked.forEach((p, i) => { adjustment[p.id] = ladder[i] ?? 0 })

    // Tier players by going-in rank. Tier size from championship_tier_size,
    // last tier may be smaller if player count doesn't divide evenly.
    const tierSize = championshipTierSize ?? (placement.length || ranked.length)
    const tiers = []
    for (let i = 0; i < ranked.length; i += tierSize) {
      tiers.push(ranked.slice(i, i + tierSize).map(p => p.id))
    }

    const adjustedNet = {}
    for (const p of players) {
      const playerScores = roundScores.filter(s => s.player_id === p.id)
      if (playerScores.length !== holesCount) continue
      const totalStrokes = effectiveStrokes[p.id] || 0
      let net = 0
      for (const s of playerScores) {
        const h = sortedHoles.find(hh => hh.hole === s.hole)
        net += s.gross - getStrokesOnHole(totalStrokes, h?.stroke_index, holesCount)
      }
      adjustedNet[p.id] = net + (adjustment[p.id] || 0)
    }

    for (const tier of tiers) {
      const tierFinished = tier.filter(pid => adjustedNet[pid] !== undefined)
      const sorted = tierFinished.sort((a, b) => adjustedNet[a] - adjustedNet[b])
      sorted.forEach((pid, i) => { points[pid] += placement[i] ?? 0 })
    }
    return points
  }

  return points
}

// ----- Skins side game.
// A "skin" is awarded to the player with the unique lowest net score on a
// hole. Ties carry the skin to the next hole, accumulating. We process
// holes strictly in order and stop at the first un-finished hole — a
// pending hole's skin (and any subsequent ones) can't be resolved yet.
//
// Field-wide and net-based, regardless of the round's primary format
// (handicaps are normalized to the field minimum, same convention as
// best-ball / scramble strokes).
//
// Only applies on individual-format rounds for v1 (individual_stroke,
// championship). Team-format rounds have ambiguous per-player skin
// semantics — punt on those until users ask.

export const SKINS_ELIGIBLE_FORMATS = new Set(['individual_stroke', 'stableford', 'championship'])

export function isSkinsEligible(round) {
  return SKINS_ELIGIBLE_FORMATS.has(round?.format)
}

export function computeSkinsForRound({ round, holes, scores, roundStrokes }) {
  const result = {
    eligible: isSkinsEligible(round),
    bins: [],
    totals: {},
    unsettled: 0,
  }
  if (!result.eligible) return result
  if (!holes?.length) return result

  const sortedHoles = [...holes].sort((a, b) => a.hole - b.hole)
  const strokesMap = {}
  for (const rs of roundStrokes || []) {
    if (rs.round_id !== round.id) continue
    strokesMap[rs.player_id] = { handicap: rs.handicap, group_assignment: rs.group_assignment }
  }
  const playerIds = Object.keys(strokesMap)
  if (playerIds.length < 2) return result

  // Field-relative handicap (everyone normalized to lowest in the round).
  const effectiveStrokes = deriveStrokesForFormat(strokesMap, 'best_ball')
  for (const pid of playerIds) result.totals[pid] = 0

  const roundScores = (scores || []).filter(s => s.round_id === round.id)
  let carry = 0
  let stop = false

  for (const h of sortedHoles) {
    if (stop) {
      result.bins.push({ hole: h.hole, par: h.par, status: 'unplayed' })
      continue
    }
    const nets = []
    let allEntered = true
    for (const pid of playerIds) {
      const s = roundScores.find(sc => sc.player_id === pid && sc.hole === h.hole)
      if (!s) { allEntered = false; break }
      const so = getStrokesOnHole(effectiveStrokes[pid] || 0, h.stroke_index, sortedHoles.length)
      nets.push({ pid, net: s.gross - so })
    }
    const value = 1 + carry
    if (!allEntered) {
      result.bins.push({ hole: h.hole, par: h.par, status: 'pending', value })
      stop = true
      continue
    }
    const minNet = Math.min(...nets.map(n => n.net))
    const winners = nets.filter(n => n.net === minNet)
    if (winners.length === 1) {
      const pid = winners[0].pid
      result.bins.push({ hole: h.hole, par: h.par, status: 'won', winnerId: pid, value })
      result.totals[pid] = (result.totals[pid] || 0) + value
      carry = 0
    } else {
      result.bins.push({
        hole: h.hole, par: h.par, status: 'tied', value,
        tiedPlayerIds: winners.map(w => w.pid),
      })
      carry = value
    }
  }
  result.unsettled = carry
  return result
}

export function computeSkinsForTournament({ players, rounds, holes, scores, roundStrokes }) {
  const totals = Object.fromEntries(players.map(p => [p.id, 0]))
  const byRound = {}
  for (const r of rounds) {
    const roundHoles = holes.filter(h => h.round_id === r.id)
    const out = computeSkinsForRound({
      round: r, holes: roundHoles, scores, roundStrokes,
    })
    byRound[r.id] = out
    if (!out.eligible) continue
    for (const [pid, n] of Object.entries(out.totals)) {
      totals[pid] = (totals[pid] || 0) + n
    }
  }
  return { totals, byRound }
}

// ----- Nassau side game.
// Three side bets per round: front 9 net, back 9 net, total 18 net.
// Lowest net wins each leg. Field-wide. Individual rounds only.
// No "press" mechanic in v1 (trailing-player double-up). Add later.
//
// 9-hole rounds collapse to a single "total" leg.

export const NASSAU_ELIGIBLE_FORMATS = SKINS_ELIGIBLE_FORMATS

export function isNassauEligible(round) {
  return NASSAU_ELIGIBLE_FORMATS.has(round?.format)
}

export function computeNassauForRound({ round, holes, scores, roundStrokes }) {
  const result = {
    eligible: isNassauEligible(round),
    legs: {},
    wins: {},
  }
  if (!result.eligible) return result
  if (!holes?.length) return result

  const sortedHoles = [...holes].sort((a, b) => a.hole - b.hole)
  const strokesMap = {}
  for (const rs of roundStrokes || []) {
    if (rs.round_id !== round.id) continue
    strokesMap[rs.player_id] = { handicap: rs.handicap, group_assignment: rs.group_assignment }
  }
  const playerIds = Object.keys(strokesMap)
  if (playerIds.length < 2) return result

  const effectiveStrokes = deriveStrokesForFormat(strokesMap, 'best_ball')
  const roundScores = (scores || []).filter(s => s.round_id === round.id)

  // 18+ hole rounds get front9 + back9 + total. Shorter rounds only get total.
  const legs = []
  if (sortedHoles.length >= 18) {
    legs.push(['front9', sortedHoles.slice(0, 9)])
    legs.push(['back9', sortedHoles.slice(9, 18)])
  }
  legs.push(['total', sortedHoles])

  for (const [legName, legHoles] of legs) {
    const legTotals = {}
    let allComplete = true
    for (const pid of playerIds) {
      let sum = 0
      let entered = 0
      for (const h of legHoles) {
        const s = roundScores.find(sc => sc.player_id === pid && sc.hole === h.hole)
        if (!s) continue
        const so = getStrokesOnHole(effectiveStrokes[pid] || 0, h.stroke_index, sortedHoles.length)
        sum += s.gross - so
        entered++
      }
      if (entered === legHoles.length) {
        legTotals[pid] = sum
      } else {
        allComplete = false
      }
    }

    let winner = null
    let tied = false
    if (Object.keys(legTotals).length === playerIds.length) {
      const lowest = Math.min(...Object.values(legTotals))
      const winners = Object.entries(legTotals).filter(([, v]) => v === lowest)
      if (winners.length === 1) {
        winner = winners[0][0]
        result.wins[winner] = (result.wins[winner] || 0) + 1
      } else {
        tied = true
      }
    }

    result.legs[legName] = {
      totals: legTotals,
      winner,
      tied,
      complete: allComplete && Object.keys(legTotals).length === playerIds.length,
      holes: legHoles.length,
    }
  }

  return result
}

export function computeNassauForTournament({ players, rounds, holes, scores, roundStrokes }) {
  const totals = Object.fromEntries(players.map(p => [p.id, 0]))
  const byRound = {}
  for (const r of rounds) {
    const roundHoles = holes.filter(h => h.round_id === r.id)
    const out = computeNassauForRound({ round: r, holes: roundHoles, scores, roundStrokes })
    byRound[r.id] = out
    if (!out.eligible) continue
    for (const [pid, n] of Object.entries(out.wins)) {
      totals[pid] = (totals[pid] || 0) + n
    }
  }
  return { totals, byRound }
}

// ----- Vegas side game.
// 2v2 head-to-head with concatenated team scores. Team's score for a
// hole is the digits in low-then-high order: 4+5 = "45". A birdie by
// the OPPONENT flips your pair (high-then-low) — punishes the other
// side. Lower concatenated number wins the hole; difference is points.
//
// Eligibility: exactly 2 groups, exactly 2 players per group. Gross
// scores (net breaks concatenation; standard Vegas is gross).

export function checkVegasEligibility({ round, roundStrokes }) {
  const groups = {}
  for (const rs of roundStrokes || []) {
    if (rs.round_id !== round.id) continue
    const g = rs.group_assignment
    if (!g) continue
    if (!groups[g]) groups[g] = []
    groups[g].push(rs.player_id)
  }
  const letters = Object.keys(groups).sort()
  if (letters.length !== 2) {
    return { eligible: false, reason: 'Vegas needs exactly 2 teams set up on the round.' }
  }
  if (groups[letters[0]].length !== 2 || groups[letters[1]].length !== 2) {
    return { eligible: false, reason: 'Vegas needs exactly 2 players per team.' }
  }
  return {
    eligible: true,
    teams: { A: groups[letters[0]], B: groups[letters[1]] },
    letters,
  }
}

export function computeVegasForRound({ round, holes, scores, roundStrokes }) {
  const eligibility = checkVegasEligibility({ round, roundStrokes })
  const result = {
    eligible: eligibility.eligible,
    reason: eligibility.reason ?? null,
    teams: eligibility.teams ?? null,
    bins: [],
    total: { A: 0, B: 0 },
    unsettled: false,
  }
  if (!result.eligible) return result

  const sortedHoles = [...holes].sort((a, b) => a.hole - b.hole)
  const roundScores = (scores || []).filter(s => s.round_id === round.id)
  let stop = false

  for (const h of sortedHoles) {
    if (stop) {
      result.bins.push({ hole: h.hole, par: h.par, status: 'unplayed' })
      continue
    }
    const aRaw = []
    const bRaw = []
    let ok = true
    for (const pid of result.teams.A) {
      const s = roundScores.find(sc => sc.player_id === pid && sc.hole === h.hole)
      if (!s) { ok = false; break }
      aRaw.push(s.gross)
    }
    if (ok) for (const pid of result.teams.B) {
      const s = roundScores.find(sc => sc.player_id === pid && sc.hole === h.hole)
      if (!s) { ok = false; break }
      bRaw.push(s.gross)
    }
    if (!ok) {
      result.bins.push({ hole: h.hole, par: h.par, status: 'pending' })
      stop = true
      result.unsettled = true
      continue
    }

    const aLow = Math.min(...aRaw), aHigh = Math.max(...aRaw)
    const bLow = Math.min(...bRaw), bHigh = Math.max(...bRaw)
    const aBirdie = aRaw.some(s => s <= h.par - 1)
    const bBirdie = bRaw.some(s => s <= h.par - 1)
    // Standard Vegas: a birdie flips the OPPONENT's pair.
    const aFlipped = bBirdie
    const bFlipped = aBirdie
    const aNum = aFlipped ? aHigh * 10 + aLow : aLow * 10 + aHigh
    const bNum = bFlipped ? bHigh * 10 + bLow : bLow * 10 + bHigh

    let winner = null
    let diff = 0
    if (aNum < bNum) { winner = 'A'; diff = bNum - aNum; result.total.A += diff }
    else if (bNum < aNum) { winner = 'B'; diff = aNum - bNum; result.total.B += diff }

    result.bins.push({
      hole: h.hole, par: h.par, status: 'played',
      aScore: aNum, bScore: bNum,
      aFlipped, bFlipped, winner, diff,
    })
  }

  return result
}

export function computeVegasForTournament({ rounds, holes, scores, roundStrokes }) {
  const byRound = {}
  for (const r of rounds) {
    const roundHoles = holes.filter(h => h.round_id === r.id)
    byRound[r.id] = computeVegasForRound({
      round: r, holes: roundHoles, scores, roundStrokes,
    })
  }
  return { byRound }
}

// ----- Full tournament leaderboard.
export function computeLeaderboard({
  players, rounds, holes, scores, roundStrokes, scoringConfig, championshipTierSize,
}) {
  const perRound = {}
  const totals = Object.fromEntries(players.map(p => [p.id, 0]))

  // Order rounds so non-championship rounds compute first; their totals feed championship.
  const ordered = [...rounds].sort((a, b) => {
    if (a.format === 'championship' && b.format !== 'championship') return 1
    if (b.format === 'championship' && a.format !== 'championship') return -1
    return (a.round_number || 0) - (b.round_number || 0)
  })

  for (const r of ordered) {
    const roundHoles = holes.filter(h => h.round_id === r.id)
    const cumulativeBefore = r.format === 'championship' ? { ...totals } : null
    const pts = computeRoundPoints({
      players, round: r, holes: roundHoles, scores, roundStrokes,
      scoringConfig, cumulativeBefore, championshipTierSize,
    })
    perRound[r.id] = pts
    for (const [pid, v] of Object.entries(pts)) totals[pid] = (totals[pid] || 0) + v
  }

  return players
    .map(p => ({
      playerId: p.id,
      player: p,
      total: totals[p.id] || 0,
      perRound: Object.fromEntries(rounds.map(r => [r.id, perRound[r.id]?.[p.id] ?? 0])),
    }))
    .sort((a, b) => b.total - a.total)
}
