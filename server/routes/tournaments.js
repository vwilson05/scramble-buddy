import { Router } from 'express'
import db from '../db/index.js'
import { calculateLeaderboard, calculateHighLowStandings } from '../services/scoring.js'

const router = Router()

// Generate URL-friendly slug from name
function generateSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50)

  // Add short random suffix for uniqueness
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${base}-${suffix}`
}

// Helper to find tournament by ID or slug
function findTournament(idOrSlug) {
  // Try by numeric ID first
  if (/^\d+$/.test(idOrSlug)) {
    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(idOrSlug)
  }
  // Then try by slug
  return db.prepare('SELECT * FROM tournaments WHERE slug = ?').get(idOrSlug)
}

// Get all tournaments
router.get('/', (req, res) => {
  try {
    const tournaments = db.prepare(`
      SELECT * FROM tournaments
      ORDER BY created_at DESC
    `).all()

    res.json(tournaments)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single tournament with players and scores
router.get('/:id', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)

    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const players = db.prepare(`
      SELECT * FROM players WHERE tournament_id = ?
    `).all(tournament.id)

    const scores = db.prepare(`
      SELECT * FROM scores WHERE tournament_id = ?
    `).all(tournament.id)

    const holes = tournament.course_id ? db.prepare(`
      SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number
    `).all(tournament.course_id) : []

    res.json({ tournament, players, scores, holes })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create tournament
router.post('/', (req, res) => {
  try {
    const {
      name,
      date,
      game_type,
      course_id,
      course_name,
      slope_rating,
      bet_amount,
      nassau_segment_bet,
      nassau_overall_bet,
      greenie_amount,
      skins_amount,
      greenie_holes,
      nassau_format,
      is_team_game,
      payout_config,
      handicap_mode
    } = req.body

    const slug = generateSlug(name || 'round')

    // Generate random selfie hole between 4 and 15 (avoid first/last few holes)
    const selfieHole = Math.floor(Math.random() * 12) + 4

    const result = db.prepare(`
      INSERT INTO tournaments (name, date, game_type, course_id, course_name, slope_rating, bet_amount, nassau_segment_bet, nassau_overall_bet, greenie_amount, skins_amount, greenie_holes, nassau_format, is_team_game, payout_config, slug, selfie_hole, handicap_mode)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      date || new Date().toISOString().split('T')[0],
      game_type,
      course_id || null,
      course_name || null,
      slope_rating || 113,
      bet_amount || 0,
      nassau_segment_bet || null,
      nassau_overall_bet || null,
      greenie_amount || 0,
      skins_amount || 0,
      greenie_holes || null,
      nassau_format || '6-6-6',
      is_team_game || 0,
      payout_config ? JSON.stringify(payout_config) : null,
      slug,
      selfieHole,
      handicap_mode || 'gross'
    )

    res.status(201).json({ id: result.lastInsertRowid, slug })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update tournament
router.put('/:id', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const updates = req.body
    const fields = Object.keys(updates)
    const values = Object.values(updates)

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    const setClause = fields.map(f => `${f} = ?`).join(', ')

    db.prepare(`
      UPDATE tournaments SET ${setClause} WHERE id = ?
    `).run(...values, tournament.id)

    const updated = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournament.id)
    res.json(updated)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete tournament
router.delete('/:id', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(tournament.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Add player to tournament
router.post('/:id/players', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const { name, handicap, team, tee_color } = req.body

    const result = db.prepare(`
      INSERT INTO players (tournament_id, name, handicap, team, tee_color)
      VALUES (?, ?, ?, ?, ?)
    `).run(tournament.id, name, handicap || 0, team || null, tee_color || 'white')

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(player)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update player's team
router.put('/:id/players/:playerId/team', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const { playerId } = req.params
    const { team } = req.body

    // Find the player by multi_day_player_id (since we're passing the multi-day player ID)
    let player = db.prepare('SELECT * FROM players WHERE tournament_id = ? AND multi_day_player_id = ?').get(tournament.id, playerId)

    // If not found by multi_day_player_id, try by direct player id
    if (!player) {
      player = db.prepare('SELECT * FROM players WHERE tournament_id = ? AND id = ?').get(tournament.id, playerId)
    }

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    db.prepare('UPDATE players SET team = ? WHERE id = ?').run(team, player.id)

    const updatedPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id)
    res.json(updatedPlayer)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update player (general - team, tee, handicap)
router.put('/:id/players/:playerId', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const { playerId } = req.params
    const { team, tee_color, handicap } = req.body

    // Find the player by multi_day_player_id first, then by direct id
    let player = db.prepare('SELECT * FROM players WHERE tournament_id = ? AND multi_day_player_id = ?').get(tournament.id, playerId)
    if (!player) {
      player = db.prepare('SELECT * FROM players WHERE tournament_id = ? AND id = ?').get(tournament.id, playerId)
    }

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    // Build update query dynamically
    const updates = []
    const values = []

    if (team !== undefined) {
      updates.push('team = ?')
      values.push(team)
    }
    if (tee_color !== undefined) {
      updates.push('tee_color = ?')
      values.push(tee_color)
    }
    if (handicap !== undefined) {
      updates.push('handicap = ?')
      values.push(handicap)
    }

    if (updates.length > 0) {
      values.push(player.id)
      db.prepare(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    const updatedPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(player.id)
    res.json(updatedPlayer)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get leaderboard
router.get('/:id/leaderboard', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournament.id)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(tournament.id)
    const holes = tournament.course_id ? db.prepare('SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number').all(tournament.course_id) : []

    const leaderboard = calculateLeaderboard(tournament, players, scores, holes)
    res.json(leaderboard)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get High-Low standings (2v2 team match)
router.get('/:id/high-low', (req, res) => {
  try {
    const tournament = findTournament(req.params.id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }

    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournament.id)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(tournament.id)
    const holes = tournament.course_id ? db.prepare('SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number').all(tournament.course_id) : []

    // Split players into teams
    const team1Players = players.filter(p => p.team === 1 || p.team === 'A')
    const team2Players = players.filter(p => p.team === 2 || p.team === 'B')

    if (team1Players.length === 0 || team2Players.length === 0) {
      return res.status(400).json({ error: 'High-Low requires players assigned to two teams' })
    }

    const standings = calculateHighLowStandings(tournament, team1Players, team2Players, scores, holes)

    // Add bet amounts to response
    standings.bets = {
      segmentBet: tournament.nassau_segment_bet || 0,
      overallBet: tournament.nassau_overall_bet || 0,
      nassauFormat: tournament.nassau_format || '6-6-6'
    }

    res.json(standings)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
