import express from 'express'
import db from '../db/index.js'

const router = express.Router()

// Get all side bets for a tournament
router.get('/:tournamentId', (req, res) => {
  try {
    const { tournamentId } = req.params

    const sideBets = db.prepare(`
      SELECT * FROM side_bets WHERE tournament_id = ?
    `).all(tournamentId)

    // Get presses for each side bet
    const sideBetsWithPresses = sideBets.map(bet => {
      const presses = db.prepare(`
        SELECT * FROM bet_presses WHERE side_bet_id = ? ORDER BY start_hole, id
      `).all(bet.id)
      return { ...bet, presses }
    })

    res.json(sideBetsWithPresses)
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
      bet_type,
      party1_id,
      party2_id,
      party1_name,
      party2_name,
      front_amount,
      back_amount,
      overall_amount,
      auto_press
    } = req.body

    const result = db.prepare(`
      INSERT INTO side_bets (tournament_id, bet_type, party1_id, party2_id, party1_name, party2_name, front_amount, back_amount, overall_amount, auto_press)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tournament_id, bet_type, party1_id, party2_id, party1_name, party2_name, front_amount || 0, back_amount || 0, overall_amount || 0, auto_press || 0)

    const sideBet = db.prepare('SELECT * FROM side_bets WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json({ ...sideBet, presses: [] })
  } catch (error) {
    console.error('Error creating side bet:', error)
    res.status(500).json({ error: 'Failed to create side bet' })
  }
})

// Update a side bet
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { front_amount, back_amount, overall_amount, auto_press } = req.body

    db.prepare(`
      UPDATE side_bets
      SET front_amount = ?, back_amount = ?, overall_amount = ?, auto_press = ?
      WHERE id = ?
    `).run(front_amount || 0, back_amount || 0, overall_amount || 0, auto_press || 0, id)

    const sideBet = db.prepare('SELECT * FROM side_bets WHERE id = ?').get(id)
    const presses = db.prepare('SELECT * FROM bet_presses WHERE side_bet_id = ?').all(id)
    res.json({ ...sideBet, presses })
  } catch (error) {
    console.error('Error updating side bet:', error)
    res.status(500).json({ error: 'Failed to update side bet' })
  }
})

// Delete a side bet
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    db.prepare('DELETE FROM side_bets WHERE id = ?').run(id)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting side bet:', error)
    res.status(500).json({ error: 'Failed to delete side bet' })
  }
})

// Create a press on a side bet
router.post('/:sideBetId/press', (req, res) => {
  try {
    const { sideBetId } = req.params
    const { segment, start_hole, amount, parent_press_id } = req.body

    const result = db.prepare(`
      INSERT INTO bet_presses (side_bet_id, segment, start_hole, amount, parent_press_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(sideBetId, segment, start_hole, amount, parent_press_id || null)

    const press = db.prepare('SELECT * FROM bet_presses WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(press)
  } catch (error) {
    console.error('Error creating press:', error)
    res.status(500).json({ error: 'Failed to create press' })
  }
})

// Delete a press
router.delete('/press/:pressId', (req, res) => {
  try {
    const { pressId } = req.params
    // Delete this press and any child presses
    db.prepare('DELETE FROM bet_presses WHERE id = ? OR parent_press_id = ?').run(pressId, pressId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting press:', error)
    res.status(500).json({ error: 'Failed to delete press' })
  }
})

// Calculate side bet status (who's winning each segment)
router.get('/:tournamentId/status', (req, res) => {
  try {
    const { tournamentId } = req.params

    // Get tournament and players
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId)
    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournamentId)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(tournamentId)
    const sideBets = db.prepare('SELECT * FROM side_bets WHERE tournament_id = ?').all(tournamentId)

    const results = sideBets.map(bet => {
      const presses = db.prepare('SELECT * FROM bet_presses WHERE side_bet_id = ?').all(bet.id)

      // Calculate match play status for each segment
      const status = calculateBetStatus(bet, players, scores, tournament)
      const pressStatuses = presses.map(press => ({
        ...press,
        status: calculatePressStatus(press, bet, players, scores, tournament)
      }))

      return {
        ...bet,
        status,
        presses: pressStatuses
      }
    })

    res.json(results)
  } catch (error) {
    console.error('Error calculating bet status:', error)
    res.status(500).json({ error: 'Failed to calculate bet status' })
  }
})

// Helper function to calculate bet status
function calculateBetStatus(bet, players, scores, tournament) {
  const isTeamBet = bet.bet_type === 'team'

  // Get scores for each party
  const party1Scores = isTeamBet
    ? getTeamScores(bet.party1_id, players, scores)
    : getPlayerScores(bet.party1_id, scores)
  const party2Scores = isTeamBet
    ? getTeamScores(bet.party2_id, players, scores)
    : getPlayerScores(bet.party2_id, scores)

  // Calculate match play results per hole
  const front = calculateSegment(party1Scores, party2Scores, 1, 9)
  const back = calculateSegment(party1Scores, party2Scores, 10, 18)
  const overall = calculateSegment(party1Scores, party2Scores, 1, 18)

  return {
    front: { ...front, amount: bet.front_amount },
    back: { ...back, amount: bet.back_amount },
    overall: { ...overall, amount: bet.overall_amount }
  }
}

function calculatePressStatus(press, bet, players, scores, tournament) {
  const isTeamBet = bet.bet_type === 'team'

  const party1Scores = isTeamBet
    ? getTeamScores(bet.party1_id, players, scores)
    : getPlayerScores(bet.party1_id, scores)
  const party2Scores = isTeamBet
    ? getTeamScores(bet.party2_id, players, scores)
    : getPlayerScores(bet.party2_id, scores)

  // Determine end hole based on segment
  let endHole
  if (press.segment === 'front') endHole = 9
  else if (press.segment === 'back') endHole = 18
  else endHole = 18

  return calculateSegment(party1Scores, party2Scores, press.start_hole, endHole)
}

function getPlayerScores(playerId, scores) {
  const playerScores = {}
  scores.filter(s => s.player_id === playerId).forEach(s => {
    playerScores[s.hole_number] = s.strokes
  })
  return playerScores
}

function getTeamScores(teamNumber, players, scores) {
  // For team bets, use the best ball (lowest score) for each hole
  const teamPlayers = players.filter(p => p.team === teamNumber)
  const teamScores = {}

  for (let hole = 1; hole <= 18; hole++) {
    const holeScores = teamPlayers.map(p => {
      const score = scores.find(s => s.player_id === p.id && s.hole_number === hole)
      return score?.strokes
    }).filter(s => s !== undefined && s !== null)

    if (holeScores.length > 0) {
      teamScores[hole] = Math.min(...holeScores)
    }
  }

  return teamScores
}

function calculateSegment(party1Scores, party2Scores, startHole, endHole) {
  let party1Wins = 0
  let party2Wins = 0
  let holesPlayed = 0

  for (let hole = startHole; hole <= endHole; hole++) {
    const p1 = party1Scores[hole]
    const p2 = party2Scores[hole]

    if (p1 !== undefined && p2 !== undefined) {
      holesPlayed++
      if (p1 < p2) party1Wins++
      else if (p2 < p1) party2Wins++
      // Ties don't affect the count
    }
  }

  const diff = party1Wins - party2Wins
  const holesRemaining = (endHole - startHole + 1) - holesPlayed

  return {
    party1Wins,
    party2Wins,
    diff, // positive = party1 up, negative = party2 up
    holesPlayed,
    holesRemaining,
    leader: diff > 0 ? 'party1' : diff < 0 ? 'party2' : 'tied',
    displayStatus: formatMatchStatus(diff, holesRemaining)
  }
}

function formatMatchStatus(diff, remaining) {
  if (remaining === 0) {
    if (diff === 0) return 'AS (All Square)'
    return diff > 0 ? `${diff} UP` : `${Math.abs(diff)} UP`
  }
  if (diff === 0) return 'AS'
  const absDiff = Math.abs(diff)
  if (absDiff >= remaining) {
    return diff > 0 ? `${absDiff}&${remaining}` : `${absDiff}&${remaining}`
  }
  return diff > 0 ? `${absDiff} UP` : `${absDiff} UP`
}

export default router
