import express from 'express'
import db from '../db/index.js'

const router = express.Router()

// Helper to find tournament by ID or slug
function findTournament(idOrSlug) {
  if (/^\d+$/.test(String(idOrSlug))) {
    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(idOrSlug)
  }
  return db.prepare('SELECT * FROM tournaments WHERE slug = ?').get(idOrSlug)
}

// Get all side bets for a tournament (with calculated status)
router.get('/:tournamentId', (req, res) => {
  try {
    const { tournamentId } = req.params

    // Resolve tournament ID from slug if needed
    const tournament = findTournament(tournamentId)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }
    const actualTournamentId = tournament.id

    // Get all side bets including presses
    const sideBets = db.prepare(`
      SELECT * FROM side_bets WHERE tournament_id = ? ORDER BY created_at
    `).all(actualTournamentId)

    // Get tournament data for scoring
    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(actualTournamentId)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(actualTournamentId)

    // Calculate status for each bet
    const betsWithStatus = sideBets.map(bet => {
      const status = calculateBetStatus(bet, players, scores)
      const presses = sideBets.filter(b => b.parent_bet_id === bet.id)
      return {
        ...bet,
        party1: JSON.parse(bet.party1 || '[]'),
        party2: JSON.parse(bet.party2 || '[]'),
        status,
        presses: presses.map(p => ({
          ...p,
          party1: JSON.parse(p.party1 || '[]'),
          party2: JSON.parse(p.party2 || '[]'),
          status: calculateBetStatus(p, players, scores)
        }))
      }
    }).filter(b => !b.parent_bet_id) // Only return top-level bets

    res.json(betsWithStatus)
  } catch (error) {
    console.error('Error fetching side bets:', error)
    res.status(500).json({ error: 'Failed to fetch side bets' })
  }
})

// Create a new side bet
router.post('/', (req, res) => {
  try {
    const {
      tournament_id,
      parent_bet_id,
      name,
      game_type,
      nassau_format,
      use_high_low,
      party1,
      party2,
      party1_name,
      party2_name,
      front_amount,
      middle_amount,
      back_amount,
      overall_amount,
      per_hole_amount,
      segment,
      start_hole,
      auto_press
    } = req.body

    // Resolve tournament ID from slug if needed
    const tournament = findTournament(tournament_id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }
    const actualTournamentId = tournament.id

    const result = db.prepare(`
      INSERT INTO side_bets (
        tournament_id, parent_bet_id, name, game_type, nassau_format, use_high_low,
        party1, party2, party1_name, party2_name,
        front_amount, middle_amount, back_amount, overall_amount, per_hole_amount,
        segment, start_hole, auto_press
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actualTournamentId,
      parent_bet_id || null,
      name || null,
      game_type,
      nassau_format || null,
      use_high_low ? 1 : 0,
      JSON.stringify(party1),
      JSON.stringify(party2),
      party1_name || null,
      party2_name || null,
      front_amount || 0,
      middle_amount || 0,
      back_amount || 0,
      overall_amount || 0,
      per_hole_amount || 0,
      segment || null,
      start_hole || 1,
      auto_press || 0
    )

    const sideBet = db.prepare('SELECT * FROM side_bets WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({
      ...sideBet,
      party1: JSON.parse(sideBet.party1),
      party2: JSON.parse(sideBet.party2)
    })
  } catch (error) {
    console.error('Error creating side bet:', error)
    res.status(500).json({ error: 'Failed to create side bet' })
  }
})

// Create a press (new bet referencing parent)
router.post('/:betId/press', (req, res) => {
  try {
    const { betId } = req.params
    const { segment, start_hole, amount } = req.body

    // Get parent bet
    const parentBet = db.prepare('SELECT * FROM side_bets WHERE id = ?').get(betId)
    if (!parentBet) {
      return res.status(404).json({ error: 'Parent bet not found' })
    }

    // Determine which amount field to use based on segment
    const amountField = segment === 'front' ? 'front_amount' :
                        segment === 'middle' ? 'middle_amount' :
                        segment === 'back' ? 'back_amount' : 'overall_amount'

    const result = db.prepare(`
      INSERT INTO side_bets (
        tournament_id, parent_bet_id, name, game_type, nassau_format, use_high_low,
        party1, party2, party1_name, party2_name,
        front_amount, middle_amount, back_amount, overall_amount, per_hole_amount,
        segment, start_hole, auto_press
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parentBet.tournament_id,
      betId,
      `Press - ${segment}`,
      parentBet.game_type,
      parentBet.nassau_format,
      parentBet.use_high_low,
      parentBet.party1,
      parentBet.party2,
      parentBet.party1_name,
      parentBet.party2_name,
      segment === 'front' ? (amount || parentBet.front_amount) : 0,
      segment === 'middle' ? (amount || parentBet.middle_amount) : 0,
      segment === 'back' ? (amount || parentBet.back_amount) : 0,
      segment === 'overall' ? (amount || parentBet.overall_amount) : 0,
      0,
      segment,
      start_hole,
      0
    )

    const press = db.prepare('SELECT * FROM side_bets WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({
      ...press,
      party1: JSON.parse(press.party1),
      party2: JSON.parse(press.party2)
    })
  } catch (error) {
    console.error('Error creating press:', error)
    res.status(500).json({ error: 'Failed to create press' })
  }
})

// Delete a side bet (and its presses)
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    // Delete presses first, then the bet
    db.prepare('DELETE FROM side_bets WHERE parent_bet_id = ?').run(id)
    db.prepare('DELETE FROM side_bets WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting side bet:', error)
    res.status(500).json({ error: 'Failed to delete side bet' })
  }
})

// ============ SCORING LOGIC ============

function calculateBetStatus(bet, players, scores) {
  const party1 = JSON.parse(bet.party1 || '[]')
  const party2 = JSON.parse(bet.party2 || '[]')
  const useHighLow = bet.use_high_low === 1
  const startHole = bet.start_hole || 1

  // Get player IDs for each party
  const party1Ids = party1.map(p => p.playerId)
  const party2Ids = party2.map(p => p.playerId)

  // Get tournament for slope rating and hole handicap ratings
  const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(bet.tournament_id)
  const slopeRating = tournament?.slope_rating || 113

  // Get hole data for handicap ratings
  const holes = tournament?.course_id
    ? db.prepare('SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number').all(tournament.course_id)
    : []
  const holeMap = {}
  holes.forEach(h => { holeMap[h.hole_number] = h })

  // Build player handicap map (course handicap, not index)
  const playerHandicaps = {}
  players.forEach(p => {
    playerHandicaps[p.id] = Math.round((p.handicap || 0) * (slopeRating / 113))
  })

  // Determine segments based on game type
  if (bet.game_type === 'nassau') {
    return calculateNassauStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, playerHandicaps, holeMap)
  } else if (bet.game_type === 'skins') {
    return calculateSkinsStatus(bet, party1Ids, party2Ids, scores, startHole, playerHandicaps, holeMap)
  } else {
    // match_play, best_ball, high_low - single match
    return calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, 1, 18, playerHandicaps, holeMap)
  }
}

function calculateNassauStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, playerHandicaps, holeMap) {
  const format = bet.nassau_format || '9-9'
  const segment = bet.segment // If this is a press, only calculate that segment

  let segments = {}

  if (format === '6-6-6') {
    if (!segment || segment === 'front') {
      segments.front = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 1), 1, 6, playerHandicaps, holeMap)
      segments.front.amount = bet.front_amount
    }
    if (!segment || segment === 'middle') {
      segments.middle = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 7), 7, 12, playerHandicaps, holeMap)
      segments.middle.amount = bet.middle_amount
    }
    if (!segment || segment === 'back') {
      segments.back = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 13), 13, 18, playerHandicaps, holeMap)
      segments.back.amount = bet.back_amount
    }
  } else {
    // 9-9 format
    if (!segment || segment === 'front') {
      segments.front = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 1), 1, 9, playerHandicaps, holeMap)
      segments.front.amount = bet.front_amount
    }
    if (!segment || segment === 'back') {
      segments.back = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 10), 10, 18, playerHandicaps, holeMap)
      segments.back.amount = bet.back_amount
    }
  }

  if (!segment || segment === 'overall') {
    segments.overall = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
      startHole, 1, 18, playerHandicaps, holeMap)
    segments.overall.amount = bet.overall_amount
  }

  return segments
}

function calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, segmentStart, segmentEnd, playerHandicaps, holeMap) {
  let party1Wins = 0
  let party2Wins = 0
  let ties = 0
  let holesPlayed = 0

  for (let hole = Math.max(startHole, segmentStart); hole <= segmentEnd; hole++) {
    const result = compareHole(hole, party1Ids, party2Ids, scores, useHighLow, bet.game_type, playerHandicaps, holeMap)

    if (result === null) continue // No scores for this hole

    holesPlayed++
    if (result < 0) party1Wins++
    else if (result > 0) party2Wins++
    else ties++
  }

  const diff = party1Wins - party2Wins
  const holesRemaining = segmentEnd - Math.max(startHole, segmentStart) + 1 - holesPlayed

  // Determine if match is closed out
  const closedOut = Math.abs(diff) > holesRemaining && holesRemaining > 0

  return {
    party1Wins,
    party2Wins,
    ties,
    holesPlayed,
    holesRemaining,
    diff,
    leader: diff > 0 ? 'party1' : diff < 0 ? 'party2' : 'tied',
    closedOut,
    display: formatMatchDisplay(diff, holesRemaining, closedOut)
  }
}

// Helper to calculate strokes received on a hole
// Note: No strokes given on par 3s (common rule)
function getStrokesOnHole(courseHandicap, holeHandicapRating, holePar) {
  if (!courseHandicap || courseHandicap <= 0) return 0
  if (!holeHandicapRating) return 0
  if (holePar === 3) return 0 // No strokes on par 3s
  const fullStrokes = Math.floor(courseHandicap / 18)
  const remainingStrokes = courseHandicap % 18
  return fullStrokes + (holeHandicapRating <= remainingStrokes ? 1 : 0)
}

function compareHole(holeNumber, party1Ids, party2Ids, scores, useHighLow, gameType, playerHandicaps, holeMap) {
  const hole = holeMap[holeNumber]
  const holeHandicapRating = hole?.handicap_rating || holeNumber // Fallback to hole number
  const holePar = hole?.par || 4

  // Get NET scores for this hole for each party
  const party1NetScores = party1Ids
    .map(id => {
      const score = scores.find(s => s.player_id === id && s.hole_number === holeNumber)
      if (!score || score.strokes === undefined || score.strokes === null) return null
      const strokes = getStrokesOnHole(playerHandicaps[id] || 0, holeHandicapRating, holePar)
      return score.strokes - strokes // Net score
    })
    .filter(s => s !== null)

  const party2NetScores = party2Ids
    .map(id => {
      const score = scores.find(s => s.player_id === id && s.hole_number === holeNumber)
      if (!score || score.strokes === undefined || score.strokes === null) return null
      const strokes = getStrokesOnHole(playerHandicaps[id] || 0, holeHandicapRating, holePar)
      return score.strokes - strokes // Net score
    })
    .filter(s => s !== null)

  if (party1NetScores.length === 0 || party2NetScores.length === 0) {
    return null // Can't compare, missing scores
  }

  let party1Score, party2Score

  if (gameType === 'high_low' || useHighLow) {
    // High-low: best + worst
    party1Score = Math.min(...party1NetScores) + Math.max(...party1NetScores)
    party2Score = Math.min(...party2NetScores) + Math.max(...party2NetScores)
  } else {
    // Best ball: just the lowest
    party1Score = Math.min(...party1NetScores)
    party2Score = Math.min(...party2NetScores)
  }

  // Return negative if party1 wins, positive if party2 wins, 0 for tie
  return party1Score - party2Score
}

function calculateSkinsStatus(bet, party1Ids, party2Ids, scores, startHole, playerHandicaps, holeMap) {
  // For skins, everyone competes individually using NET scores
  const allPlayerIds = [...party1Ids, ...party2Ids]
  const skins = []
  let carryover = 0

  for (let hole = startHole; hole <= 18; hole++) {
    const holeData = holeMap[hole]
    const holeHandicapRating = holeData?.handicap_rating || hole
    const holePar = holeData?.par || 4

    const holeNetScores = allPlayerIds
      .map(id => {
        const score = scores.find(s => s.player_id === id && s.hole_number === hole)
        if (!score) return null
        const strokes = getStrokesOnHole(playerHandicaps[id] || 0, holeHandicapRating, holePar)
        return { playerId: id, netScore: score.strokes - strokes }
      })
      .filter(s => s !== null)

    if (holeNetScores.length < allPlayerIds.length) {
      // Not all scores in yet
      continue
    }

    const minScore = Math.min(...holeNetScores.map(s => s.netScore))
    const winners = holeNetScores.filter(s => s.netScore === minScore)

    if (winners.length === 1) {
      skins.push({
        hole,
        winner: winners[0].playerId,
        value: 1 + carryover
      })
      carryover = 0
    } else {
      carryover++
    }
  }

  return {
    skins,
    carryover,
    perHoleAmount: bet.per_hole_amount
  }
}

function formatMatchDisplay(diff, remaining, closedOut) {
  if (closedOut) {
    return `${Math.abs(diff)}&${remaining}`
  }
  if (diff === 0) return 'AS'
  return `${Math.abs(diff)} UP`
}

export default router
