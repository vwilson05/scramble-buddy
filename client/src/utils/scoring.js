/**
 * Golf scoring utilities
 */

// Game types
export const GAME_TYPES = {
  STROKE_PLAY: 'stroke_play',
  MATCH_PLAY: 'match_play',
  SCRAMBLE: 'scramble',
  BEST_BALL: 'best_ball',
  HIGH_LOW: 'high_low',
  SKINS: 'skins',
  NASSAU: 'nassau'
}

export const GAME_TYPE_INFO = {
  stroke_play: {
    name: 'Stroke Play',
    description: 'Total strokes. Low score wins.',
    isTeamGame: false,
    icon: '1'
  },
  match_play: {
    name: 'Match Play',
    description: 'Win holes, not strokes. Most holes won wins.',
    isTeamGame: false,
    icon: 'vs'
  },
  scramble: {
    name: 'Scramble',
    description: 'Team picks best shot, all play from there.',
    isTeamGame: true,
    icon: '2'
  },
  best_ball: {
    name: 'Best Ball',
    description: 'Each plays own ball, best score counts.',
    isTeamGame: true,
    icon: 'BB'
  },
  high_low: {
    name: 'High-Low',
    description: '2v2 teams. Low point + high point per hole. Nassau betting.',
    isTeamGame: true,
    icon: 'HL'
  },
  skins: {
    name: 'Skins',
    description: 'Win hole outright, win the skin.',
    isTeamGame: false,
    icon: '$'
  },
  nassau: {
    name: 'Nassau',
    description: 'Three bets: Front 9, Back 9, Total.',
    isTeamGame: false,
    icon: 'N'
  }
}

/**
 * Calculate course handicap from handicap index
 * Course Handicap = Handicap Index × (Slope Rating / 113)
 */
export function calculateCourseHandicap(handicapIndex, slopeRating = 113) {
  if (!handicapIndex) return 0
  return Math.round(handicapIndex * (slopeRating / 113))
}

/**
 * Build stroke allocation map for a player's handicap
 * Fair allocation: non-par-3s first (by difficulty), then par-3s, then double up
 * @param {number} courseHandicap - Player's course handicap
 * @param {Array} holes - Array of hole objects with { hole_number, par, handicap_rating }
 * @returns {Object} Map of hole_number -> strokes on that hole
 */
export function buildStrokeAllocationMap(courseHandicap, holes) {
  if (courseHandicap <= 0 || !holes || holes.length === 0) return {}

  // Separate holes into non-par-3s and par-3s, sorted by handicap rating (hardest first)
  const nonPar3s = holes.filter(h => h.par !== 3).sort((a, b) => (a.handicap_rating || 99) - (b.handicap_rating || 99))
  const par3s = holes.filter(h => h.par === 3).sort((a, b) => (a.handicap_rating || 99) - (b.handicap_rating || 99))

  // Build allocation order: non-par-3s first, then par-3s
  const allocationOrder = [...nonPar3s, ...par3s]

  // Initialize stroke map
  const strokeMap = {}
  holes.forEach(h => { strokeMap[h.hole_number] = 0 })

  let remainingStrokes = courseHandicap
  let passNumber = 0

  // Keep allocating until all strokes are distributed
  while (remainingStrokes > 0) {
    for (const hole of allocationOrder) {
      if (remainingStrokes <= 0) break
      strokeMap[hole.hole_number]++
      remainingStrokes--
    }
    passNumber++
    // Safety: prevent infinite loop (max 5 strokes per hole)
    if (passNumber > 5) break
  }

  return strokeMap
}

/**
 * Calculate strokes received on a specific hole based on course handicap
 * and hole handicap rating (legacy version for backward compatibility)
 */
export function getStrokesOnHole(courseHandicap, holeHandicapRating) {
  if (courseHandicap <= 0) return 0

  // Full strokes for each 18 handicap
  const fullStrokes = Math.floor(courseHandicap / 18)
  const remainingStrokes = courseHandicap % 18

  // Get extra stroke if hole handicap rating <= remaining strokes
  const extraStroke = holeHandicapRating <= remainingStrokes ? 1 : 0

  return fullStrokes + extraStroke
}

/**
 * Calculate net score for a hole
 */
export function calculateNetScore(grossScore, courseHandicap, holeHandicapRating) {
  const strokes = getStrokesOnHole(courseHandicap, holeHandicapRating)
  return grossScore - strokes
}

/**
 * Calculate display handicaps for a group of players
 * In net mode: lowest handicap becomes 0, others are relative
 * In gross mode: full course handicaps used
 * @param {Array} players - Array of players with courseHandicap property
 * @param {string} mode - 'gross' or 'net'
 * @returns {Object} Map of playerId -> displayHandicap
 */
export function calculateDisplayHandicaps(players, mode = 'gross') {
  const result = {}

  if (!players || players.length === 0) return result

  if (mode === 'net') {
    const handicapValues = players.map(p => p.courseHandicap || 0).filter(h => h >= 0)
    const lowestHandicap = handicapValues.length > 0 ? Math.min(...handicapValues) : 0

    players.forEach(p => {
      result[p.id] = Math.max(0, (p.courseHandicap || 0) - lowestHandicap)
    })
  } else {
    players.forEach(p => {
      result[p.id] = p.courseHandicap || 0
    })
  }

  return result
}

/**
 * Get score relative to par label (birdie, par, bogey, etc.)
 */
export function getScoreLabel(score, par) {
  const diff = score - par

  if (diff <= -3) return { label: 'Albatross', class: 'text-purple-400', emoji: '🦅🦅' }
  if (diff === -2) return { label: 'Eagle', class: 'text-yellow-400', emoji: '🦅' }
  if (diff === -1) return { label: 'Birdie', class: 'text-golf-green', emoji: '🐦' }
  if (diff === 0) return { label: 'Par', class: 'text-gray-300', emoji: '' }
  if (diff === 1) return { label: 'Bogey', class: 'text-orange-400', emoji: '' }
  if (diff === 2) return { label: 'Double', class: 'text-red-400', emoji: '' }
  return { label: `+${diff}`, class: 'text-red-500', emoji: '' }
}

/**
 * Calculate team handicap for scramble
 * 25% of low handicap + 15% of high handicap (for 2 players)
 * Adjust for more players
 */
export function calculateScrambleHandicap(handicaps) {
  if (handicaps.length === 0) return 0

  const sorted = [...handicaps].sort((a, b) => a - b)

  if (sorted.length === 1) return Math.round(sorted[0] * 0.35)
  if (sorted.length === 2) return Math.round(sorted[0] * 0.25 + sorted[1] * 0.15)
  if (sorted.length === 3) return Math.round(sorted[0] * 0.20 + sorted[1] * 0.15 + sorted[2] * 0.10)
  return Math.round(sorted[0] * 0.20 + sorted[1] * 0.15 + sorted[2] * 0.10 + sorted[3] * 0.05)
}

/**
 * Calculate match play status
 * Returns: "3 UP", "2 DN", "AS" (all square), "DORMIE", etc.
 */
export function calculateMatchPlayStatus(player1Holes, player2Holes, holesPlayed, totalHoles = 18) {
  const holesRemaining = totalHoles - holesPlayed
  const diff = player1Holes - player2Holes

  if (diff === 0) {
    if (holesRemaining === 0) return { status: 'AS', description: 'All Square (Tied)' }
    return { status: 'AS', description: 'All Square' }
  }

  const absoDiff = Math.abs(diff)
  const leader = diff > 0 ? 'P1' : 'P2'

  // Check if match is over (lead > holes remaining)
  if (absoDiff > holesRemaining) {
    return {
      status: `${absoDiff}&${holesRemaining}`,
      description: `${leader} wins ${absoDiff}&${holesRemaining}`,
      winner: leader
    }
  }

  // Check for dormie (lead = holes remaining)
  if (absoDiff === holesRemaining) {
    return {
      status: 'DORMIE',
      description: `${leader} is dormie (${absoDiff} up, ${holesRemaining} to play)`,
      leader
    }
  }

  return {
    status: diff > 0 ? `${absoDiff} UP` : `${absoDiff} DN`,
    description: diff > 0 ? `${absoDiff} up` : `${absoDiff} down`,
    leader: diff > 0 ? 'P1' : 'P2'
  }
}

/**
 * Calculate skins with carryovers
 */
export function calculateSkins(holeResults, skinValue) {
  const skins = []
  let carryover = 0

  for (let hole = 1; hole <= holeResults.length; hole++) {
    const result = holeResults[hole - 1]

    if (result.winner) {
      skins.push({
        hole,
        winner: result.winner,
        value: skinValue * (carryover + 1),
        carryovers: carryover
      })
      carryover = 0
    } else if (result.tie) {
      carryover++
    }
  }

  return { skins, carryover }
}

/**
 * Calculate Nassau results (Front 9, Back 9, Overall)
 */
export function calculateNassau(player1Scores, player2Scores, betAmount) {
  const front9P1 = player1Scores.slice(0, 9).reduce((a, b) => a + b, 0)
  const front9P2 = player2Scores.slice(0, 9).reduce((a, b) => a + b, 0)
  const back9P1 = player1Scores.slice(9, 18).reduce((a, b) => a + b, 0)
  const back9P2 = player2Scores.slice(9, 18).reduce((a, b) => a + b, 0)

  return {
    front9: {
      winner: front9P1 < front9P2 ? 'P1' : front9P1 > front9P2 ? 'P2' : 'tie',
      value: front9P1 !== front9P2 ? betAmount : 0
    },
    back9: {
      winner: back9P1 < back9P2 ? 'P1' : back9P1 > back9P2 ? 'P2' : 'tie',
      value: back9P1 !== back9P2 ? betAmount : 0
    },
    overall: {
      winner: front9P1 + back9P1 < front9P2 + back9P2 ? 'P1' :
              front9P1 + back9P1 > front9P2 + back9P2 ? 'P2' : 'tie',
      value: (front9P1 + back9P1) !== (front9P2 + back9P2) ? betAmount : 0
    }
  }
}

/**
 * Format score for display (show + or - for over/under par)
 */
export function formatScoreToPar(score, par) {
  const diff = score - par
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

/**
 * Calculate total bet owed between players
 */
export function calculateBetSettlement(results, players, betAmount) {
  const settlements = {}

  // Initialize settlements
  players.forEach(p => {
    settlements[p.id] = { owes: {}, owed: {} }
    players.forEach(other => {
      if (other.id !== p.id) {
        settlements[p.id].owes[other.id] = 0
        settlements[p.id].owed[other.id] = 0
      }
    })
  })

  // Calculate based on results
  // This is simplified - actual implementation depends on game type

  return settlements
}
