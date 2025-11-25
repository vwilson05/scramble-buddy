import express from 'express'
import db from '../db/index.js'

const router = express.Router()

// Get all side bets for a tournament (with calculated status)
router.get('/:tournamentId', (req, res) => {
  try {
    const { tournamentId } = req.params

    // Get all side bets including presses
    const sideBets = db.prepare(`
      SELECT * FROM side_bets WHERE tournament_id = ? ORDER BY created_at
    `).all(tournamentId)

    // Get tournament data for scoring
    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournamentId)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(tournamentId)

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

    const result = db.prepare(`
      INSERT INTO side_bets (
        tournament_id, parent_bet_id, name, game_type, nassau_format, use_high_low,
        party1, party2, party1_name, party2_name,
        front_amount, middle_amount, back_amount, overall_amount, per_hole_amount,
        segment, start_hole, auto_press
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tournament_id,
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

  // Determine segments based on game type
  if (bet.game_type === 'nassau') {
    return calculateNassauStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole)
  } else if (bet.game_type === 'skins') {
    return calculateSkinsStatus(bet, party1Ids, party2Ids, scores, startHole)
  } else {
    // match_play, best_ball, high_low - single match
    return calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, 1, 18)
  }
}

function calculateNassauStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole) {
  const format = bet.nassau_format || '9-9'
  const segment = bet.segment // If this is a press, only calculate that segment

  let segments = {}

  if (format === '6-6-6') {
    if (!segment || segment === 'front') {
      segments.front = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 1), 1, 6)
      segments.front.amount = bet.front_amount
    }
    if (!segment || segment === 'middle') {
      segments.middle = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 7), 7, 12)
      segments.middle.amount = bet.middle_amount
    }
    if (!segment || segment === 'back') {
      segments.back = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 13), 13, 18)
      segments.back.amount = bet.back_amount
    }
  } else {
    // 9-9 format
    if (!segment || segment === 'front') {
      segments.front = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 1), 1, 9)
      segments.front.amount = bet.front_amount
    }
    if (!segment || segment === 'back') {
      segments.back = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
        Math.max(startHole, 10), 10, 18)
      segments.back.amount = bet.back_amount
    }
  }

  if (!segment || segment === 'overall') {
    segments.overall = calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow,
      startHole, 1, 18)
    segments.overall.amount = bet.overall_amount
  }

  return segments
}

function calculateMatchStatus(bet, party1Ids, party2Ids, scores, useHighLow, startHole, segmentStart, segmentEnd) {
  let party1Wins = 0
  let party2Wins = 0
  let ties = 0
  let holesPlayed = 0

  for (let hole = Math.max(startHole, segmentStart); hole <= segmentEnd; hole++) {
    const result = compareHole(hole, party1Ids, party2Ids, scores, useHighLow, bet.game_type)

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

function compareHole(holeNumber, party1Ids, party2Ids, scores, useHighLow, gameType) {
  // Get scores for this hole for each party
  const party1Scores = party1Ids
    .map(id => scores.find(s => s.player_id === id && s.hole_number === holeNumber)?.strokes)
    .filter(s => s !== undefined && s !== null)

  const party2Scores = party2Ids
    .map(id => scores.find(s => s.player_id === id && s.hole_number === holeNumber)?.strokes)
    .filter(s => s !== undefined && s !== null)

  if (party1Scores.length === 0 || party2Scores.length === 0) {
    return null // Can't compare, missing scores
  }

  let party1Score, party2Score

  if (gameType === 'high_low' || useHighLow) {
    // High-low: best + worst
    party1Score = Math.min(...party1Scores) + Math.max(...party1Scores)
    party2Score = Math.min(...party2Scores) + Math.max(...party2Scores)
  } else {
    // Best ball: just the lowest
    party1Score = Math.min(...party1Scores)
    party2Score = Math.min(...party2Scores)
  }

  // Return negative if party1 wins, positive if party2 wins, 0 for tie
  return party1Score - party2Score
}

function calculateSkinsStatus(bet, party1Ids, party2Ids, scores, startHole) {
  // For skins, everyone competes individually
  const allPlayerIds = [...party1Ids, ...party2Ids]
  const skins = []
  let carryover = 0

  for (let hole = startHole; hole <= 18; hole++) {
    const holeScores = allPlayerIds
      .map(id => {
        const score = scores.find(s => s.player_id === id && s.hole_number === hole)
        return score ? { playerId: id, strokes: score.strokes } : null
      })
      .filter(s => s !== null)

    if (holeScores.length < allPlayerIds.length) {
      // Not all scores in yet
      continue
    }

    const minScore = Math.min(...holeScores.map(s => s.strokes))
    const winners = holeScores.filter(s => s.strokes === minScore)

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
