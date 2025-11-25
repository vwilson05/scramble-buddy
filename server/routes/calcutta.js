import express from 'express'
import db from '../db/index.js'

const router = express.Router()

// Get Calcutta config and purchases for a tournament
router.get('/:tournamentId', (req, res) => {
  try {
    const { tournamentId } = req.params

    // Get config
    let config = db.prepare(`
      SELECT * FROM calcutta_config WHERE tournament_id = ?
    `).get(tournamentId)

    if (!config) {
      // Return default config if none exists
      config = {
        tournament_id: parseInt(tournamentId),
        enabled: 0,
        payout_structure: JSON.stringify([
          { place: 1, type: 'percent', value: 50 },
          { place: 2, type: 'percent', value: 30 },
          { place: 3, type: 'percent', value: 20 }
        ])
      }
    } else {
      config.payout_structure = config.payout_structure || '[]'
    }

    // Get purchases
    const purchases = db.prepare(`
      SELECT * FROM calcutta_purchases WHERE tournament_id = ? ORDER BY team_number
    `).all(tournamentId)

    // Get teams with player info
    const players = db.prepare(`
      SELECT * FROM players WHERE tournament_id = ? ORDER BY team, name
    `).all(tournamentId)

    // Group players by team
    const teams = {}
    players.forEach(p => {
      if (p.team) {
        if (!teams[p.team]) {
          teams[p.team] = []
        }
        teams[p.team].push(p)
      }
    })

    // Calculate total pot
    const totalPot = purchases.reduce((sum, p) => sum + p.amount, 0)

    res.json({
      config: {
        ...config,
        payout_structure: JSON.parse(config.payout_structure)
      },
      purchases,
      teams,
      totalPot
    })
  } catch (error) {
    console.error('Error fetching Calcutta:', error)
    res.status(500).json({ error: 'Failed to fetch Calcutta data' })
  }
})

// Get Calcutta results with current standings
router.get('/:tournamentId/results', (req, res) => {
  try {
    const { tournamentId } = req.params

    // Get config
    const config = db.prepare(`
      SELECT * FROM calcutta_config WHERE tournament_id = ?
    `).get(tournamentId)

    if (!config || !config.enabled) {
      return res.json({ enabled: false, standings: [], payouts: [] })
    }

    // Get purchases
    const purchases = db.prepare(`
      SELECT * FROM calcutta_purchases WHERE tournament_id = ? ORDER BY team_number
    `).all(tournamentId)

    // Get players and scores
    const players = db.prepare(`
      SELECT * FROM players WHERE tournament_id = ?
    `).all(tournamentId)

    const scores = db.prepare(`
      SELECT * FROM scores WHERE tournament_id = ?
    `).all(tournamentId)

    // Get tournament for game type
    const tournament = db.prepare(`
      SELECT * FROM tournaments WHERE id = ?
    `).get(tournamentId)

    // Calculate team standings
    const teamStandings = calculateTeamStandings(tournament, players, scores)

    // Calculate payouts
    const totalPot = purchases.reduce((sum, p) => sum + p.amount, 0)
    const payoutStructure = JSON.parse(config.payout_structure || '[]')

    const payouts = teamStandings.map((team, index) => {
      const place = index + 1
      const payoutRule = payoutStructure.find(p => p.place === place)
      const purchase = purchases.find(p => p.team_number === team.teamNumber)

      let payout = 0
      if (payoutRule) {
        payout = payoutRule.type === 'percent'
          ? (totalPot * payoutRule.value / 100)
          : payoutRule.value
      }

      return {
        place,
        teamNumber: team.teamNumber,
        teamName: team.teamName,
        score: team.score,
        holesPlayed: team.holesPlayed,
        buyerName: purchase?.buyer_name || 'Unsold',
        purchaseAmount: purchase?.amount || 0,
        payout,
        profit: payout - (purchase?.amount || 0)
      }
    })

    res.json({
      enabled: true,
      totalPot,
      standings: teamStandings,
      payouts,
      payoutStructure
    })
  } catch (error) {
    console.error('Error fetching Calcutta results:', error)
    res.status(500).json({ error: 'Failed to fetch Calcutta results' })
  }
})

// Save/update Calcutta config
router.post('/:tournamentId/config', (req, res) => {
  try {
    const { tournamentId } = req.params
    const { enabled, payout_structure } = req.body

    // Check if config exists
    const existing = db.prepare(`
      SELECT id FROM calcutta_config WHERE tournament_id = ?
    `).get(tournamentId)

    if (existing) {
      db.prepare(`
        UPDATE calcutta_config
        SET enabled = ?, payout_structure = ?
        WHERE tournament_id = ?
      `).run(
        enabled ? 1 : 0,
        JSON.stringify(payout_structure),
        tournamentId
      )
    } else {
      db.prepare(`
        INSERT INTO calcutta_config (tournament_id, enabled, payout_structure)
        VALUES (?, ?, ?)
      `).run(
        tournamentId,
        enabled ? 1 : 0,
        JSON.stringify(payout_structure)
      )
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error saving Calcutta config:', error)
    res.status(500).json({ error: 'Failed to save Calcutta config' })
  }
})

// Add/update a team purchase
router.post('/:tournamentId/purchase', (req, res) => {
  try {
    const { tournamentId } = req.params
    const { team_number, buyer_name, amount } = req.body

    if (!team_number || !buyer_name || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Upsert the purchase
    db.prepare(`
      INSERT INTO calcutta_purchases (tournament_id, team_number, buyer_name, amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(tournament_id, team_number) DO UPDATE SET
        buyer_name = excluded.buyer_name,
        amount = excluded.amount
    `).run(tournamentId, team_number, buyer_name, amount)

    const purchase = db.prepare(`
      SELECT * FROM calcutta_purchases
      WHERE tournament_id = ? AND team_number = ?
    `).get(tournamentId, team_number)

    res.json(purchase)
  } catch (error) {
    console.error('Error saving purchase:', error)
    res.status(500).json({ error: 'Failed to save purchase' })
  }
})

// Delete a team purchase
router.delete('/:tournamentId/purchase/:teamNumber', (req, res) => {
  try {
    const { tournamentId, teamNumber } = req.params

    db.prepare(`
      DELETE FROM calcutta_purchases
      WHERE tournament_id = ? AND team_number = ?
    `).run(tournamentId, teamNumber)

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting purchase:', error)
    res.status(500).json({ error: 'Failed to delete purchase' })
  }
})

// ============ HELPER FUNCTIONS ============

function calculateTeamStandings(tournament, players, scores) {
  // Group players by team
  const teams = {}
  players.forEach(p => {
    if (p.team) {
      if (!teams[p.team]) {
        teams[p.team] = { players: [], teamNumber: p.team }
      }
      teams[p.team].players.push(p)
    }
  })

  // Calculate score for each team based on game type
  const gameType = tournament.game_type
  const standings = []

  for (const [teamNum, team] of Object.entries(teams)) {
    const playerIds = team.players.map(p => p.id)
    let totalScore = 0
    let holesPlayed = 0

    for (let hole = 1; hole <= 18; hole++) {
      const holeScores = playerIds
        .map(id => scores.find(s => s.player_id === id && s.hole_number === hole)?.strokes)
        .filter(s => s !== undefined && s !== null)

      if (holeScores.length > 0) {
        holesPlayed++

        if (gameType === 'scramble') {
          // Scramble: single score per team
          totalScore += Math.min(...holeScores)
        } else if (gameType === 'bestball') {
          // Best ball: lowest score
          totalScore += Math.min(...holeScores)
        } else if (gameType === 'highlow') {
          // High-low: best + worst
          totalScore += Math.min(...holeScores) + Math.max(...holeScores)
        } else {
          // Default: sum all scores (stroke play)
          totalScore += holeScores.reduce((a, b) => a + b, 0)
        }
      }
    }

    standings.push({
      teamNumber: parseInt(teamNum),
      teamName: team.players.map(p => p.name).join(' & '),
      players: team.players,
      score: totalScore,
      holesPlayed
    })
  }

  // Sort by score (lowest first)
  standings.sort((a, b) => {
    // Teams with more holes played come first if scores equal
    if (a.score === b.score) {
      return b.holesPlayed - a.holesPlayed
    }
    return a.score - b.score
  })

  return standings
}

export default router
