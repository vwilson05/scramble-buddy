import express from 'express'
import db from '../db/index.js'

const router = express.Router()

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

// Get all multi-day tournaments
router.get('/', (req, res) => {
  try {
    const tournaments = db.prepare(`
      SELECT * FROM multi_day_tournaments ORDER BY created_at DESC
    `).all()

    res.json(tournaments.map(t => ({
      ...t,
      point_system: JSON.parse(t.point_system || '[]'),
      payout_structure: JSON.parse(t.payout_structure || '[]')
    })))
  } catch (error) {
    console.error('Error fetching multi-day tournaments:', error)
    res.status(500).json({ error: 'Failed to fetch multi-day tournaments' })
  }
})

// Get a single multi-day tournament with all rounds and standings
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params

    // Get the multi-day tournament
    const tournament = db.prepare(`
      SELECT * FROM multi_day_tournaments WHERE id = ? OR slug = ?
    `).get(id, id)

    if (!tournament) {
      return res.status(404).json({ error: 'Multi-day tournament not found' })
    }

    // Get all players
    const players = db.prepare(`
      SELECT * FROM multi_day_players WHERE multi_day_id = ? ORDER BY name
    `).all(tournament.id)

    // Get all rounds (tournaments linked to this multi-day)
    const rounds = db.prepare(`
      SELECT * FROM tournaments WHERE multi_day_id = ? ORDER BY day_number, round_number
    `).all(tournament.id)

    // Calculate standings
    const standings = calculateMultiDayStandings(tournament, players, rounds)

    res.json({
      ...tournament,
      point_system: JSON.parse(tournament.point_system || '[]'),
      payout_structure: JSON.parse(tournament.payout_structure || '[]'),
      players,
      rounds,
      standings
    })
  } catch (error) {
    console.error('Error fetching multi-day tournament:', error)
    res.status(500).json({ error: 'Failed to fetch multi-day tournament' })
  }
})

// Create a new multi-day tournament
router.post('/', (req, res) => {
  try {
    const {
      name,
      start_date,
      end_date,
      num_days,
      num_rounds,
      point_system,
      payout_structure,
      players,
      scheduled_rounds
    } = req.body

    const slug = generateSlug(name || 'tournament')

    const result = db.prepare(`
      INSERT INTO multi_day_tournaments (name, start_date, end_date, num_days, num_rounds, point_system, payout_structure, slug, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'setup')
    `).run(
      name,
      start_date,
      end_date || null,
      num_days || 1,
      num_rounds || 1,
      JSON.stringify(point_system || []),
      JSON.stringify(payout_structure || []),
      slug
    )

    const multiDayId = result.lastInsertRowid

    // Add players
    if (players && players.length > 0) {
      const insertPlayer = db.prepare(`
        INSERT INTO multi_day_players (multi_day_id, name, handicap, team)
        VALUES (?, ?, ?, ?)
      `)

      for (const player of players) {
        insertPlayer.run(multiDayId, player.name, player.handicap || 0, player.team || null)
      }
    }

    // Get saved players for creating rounds
    const savedPlayers = db.prepare('SELECT * FROM multi_day_players WHERE multi_day_id = ?').all(multiDayId)

    // Create scheduled rounds if provided
    if (scheduled_rounds && scheduled_rounds.length > 0) {
      const insertRound = db.prepare(`
        INSERT INTO tournaments (
          name, date, game_type, status, course_name, slope_rating,
          bet_amount, greenie_amount, skins_amount, greenie_holes, nassau_format,
          is_team_game, multi_day_id, day_number, round_number, slug, selfie_hole, handicap_mode
        ) VALUES (?, ?, ?, 'scheduled', ?, 113, ?, ?, 0, ?, '6-6-6', 0, ?, ?, ?, ?, ?, ?)
      `)

      const insertRoundPlayer = db.prepare(`
        INSERT INTO players (tournament_id, name, handicap, team, multi_day_player_id)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (const round of scheduled_rounds) {
        const roundSlug = generateSlug(`${name}-round-${round.round_number}`)
        const selfieHole = Math.floor(Math.random() * 12) + 4 // Random hole 4-15

        // Default greenie holes for par 3s (common defaults)
        const greenieHoles = round.greenie_amount > 0 ? '4,7,13,17' : null

        const roundResult = insertRound.run(
          round.name || `${name} - Round ${round.round_number}`,
          round.date || start_date,
          round.game_type || 'scramble',
          round.course_name || null,
          round.bet_amount || 0,
          round.greenie_amount || 0,
          greenieHoles,
          multiDayId,
          round.day_number || 1,
          round.round_number,
          roundSlug,
          selfieHole,
          round.handicap_mode || 'gross'
        )

        // Copy players to this round
        const roundId = roundResult.lastInsertRowid
        for (const player of savedPlayers) {
          insertRoundPlayer.run(roundId, player.name, player.handicap, player.team, player.id)
        }
      }
    }

    const tournament = db.prepare('SELECT * FROM multi_day_tournaments WHERE id = ?').get(multiDayId)
    const rounds = db.prepare('SELECT * FROM tournaments WHERE multi_day_id = ? ORDER BY round_number').all(multiDayId)

    res.status(201).json({
      ...tournament,
      point_system: JSON.parse(tournament.point_system || '[]'),
      payout_structure: JSON.parse(tournament.payout_structure || '[]'),
      players: savedPlayers,
      rounds
    })
  } catch (error) {
    console.error('Error creating multi-day tournament:', error)
    res.status(500).json({ error: 'Failed to create multi-day tournament' })
  }
})

// Update multi-day tournament
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, start_date, end_date, num_days, num_rounds, point_system, payout_structure, status, handicap_mode } = req.body

    // Find tournament by ID or slug
    let tournament = db.prepare('SELECT * FROM multi_day_tournaments WHERE id = ? OR slug = ?').get(id, id)
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' })
    }
    const tournamentId = tournament.id

    // Check if handicap_mode column exists
    const tableInfo = db.prepare("PRAGMA table_info(multi_day_tournaments)").all()
    const hasHandicapMode = tableInfo.some(col => col.name === 'handicap_mode')

    if (hasHandicapMode) {
      db.prepare(`
        UPDATE multi_day_tournaments
        SET name = COALESCE(?, name),
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            num_days = COALESCE(?, num_days),
            num_rounds = COALESCE(?, num_rounds),
            point_system = COALESCE(?, point_system),
            payout_structure = COALESCE(?, payout_structure),
            status = COALESCE(?, status),
            handicap_mode = COALESCE(?, handicap_mode)
        WHERE id = ?
      `).run(
        name,
        start_date,
        end_date,
        num_days,
        num_rounds,
        point_system ? JSON.stringify(point_system) : null,
        payout_structure ? JSON.stringify(payout_structure) : null,
        status,
        handicap_mode,
        tournamentId
      )
    } else {
      // Fallback without handicap_mode
      db.prepare(`
        UPDATE multi_day_tournaments
        SET name = COALESCE(?, name),
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            num_days = COALESCE(?, num_days),
            num_rounds = COALESCE(?, num_rounds),
            point_system = COALESCE(?, point_system),
            payout_structure = COALESCE(?, payout_structure),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(
        name,
        start_date,
        end_date,
        num_days,
        num_rounds,
        point_system ? JSON.stringify(point_system) : null,
        payout_structure ? JSON.stringify(payout_structure) : null,
        status,
        tournamentId
      )
    }

    // Fetch updated tournament
    tournament = db.prepare('SELECT * FROM multi_day_tournaments WHERE id = ?').get(tournamentId)
    res.json({
      ...tournament,
      point_system: JSON.parse(tournament.point_system || '[]'),
      payout_structure: JSON.parse(tournament.payout_structure || '[]')
    })
  } catch (error) {
    console.error('Error updating multi-day tournament:', error)
    res.status(500).json({ error: 'Failed to update multi-day tournament', details: error.message })
  }
})

// Add a player to multi-day tournament
router.post('/:id/players', (req, res) => {
  try {
    const { id } = req.params
    const { name, handicap, team } = req.body

    const result = db.prepare(`
      INSERT INTO multi_day_players (multi_day_id, name, handicap, team)
      VALUES (?, ?, ?, ?)
    `).run(id, name, handicap || 0, team || null)

    const player = db.prepare('SELECT * FROM multi_day_players WHERE id = ?').get(result.lastInsertRowid)
    res.status(201).json(player)
  } catch (error) {
    console.error('Error adding player:', error)
    res.status(500).json({ error: 'Failed to add player' })
  }
})

// Update a multi-day player
router.put('/:id/players/:playerId', (req, res) => {
  try {
    const { playerId } = req.params
    const { name, handicap, team } = req.body

    db.prepare(`
      UPDATE multi_day_players
      SET name = COALESCE(?, name),
          handicap = COALESCE(?, handicap),
          team = COALESCE(?, team)
      WHERE id = ?
    `).run(name, handicap, team, playerId)

    const player = db.prepare('SELECT * FROM multi_day_players WHERE id = ?').get(playerId)
    res.json(player)
  } catch (error) {
    console.error('Error updating player:', error)
    res.status(500).json({ error: 'Failed to update player' })
  }
})

// Delete a player from multi-day tournament
router.delete('/:id/players/:playerId', (req, res) => {
  try {
    const { playerId } = req.params
    db.prepare('DELETE FROM multi_day_players WHERE id = ?').run(playerId)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting player:', error)
    res.status(500).json({ error: 'Failed to delete player' })
  }
})

// Create a round for the multi-day tournament
router.post('/:id/rounds', (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      date,
      day_number,
      round_number,
      game_type,
      course_id,
      course_name,
      slope_rating,
      nassau_format,
      nassau_segment_bet,
      nassau_overall_bet,
      bet_amount,
      greenie_amount,
      skins_amount,
      greenie_holes,
      is_team_game,
      handicap_mode,
      payout_config,
      players: playerData  // Player array with team and tee assignments
    } = req.body

    // Get multi-day tournament
    const multiDay = db.prepare('SELECT * FROM multi_day_tournaments WHERE id = ?').get(id)
    if (!multiDay) {
      return res.status(404).json({ error: 'Multi-day tournament not found' })
    }

    // Generate a selfie hole for this round
    const selfieHole = Math.floor(Math.random() * 18) + 1

    // Create the round tournament
    const slug = generateSlug(name || `round-${round_number}`)
    const result = db.prepare(`
      INSERT INTO tournaments (
        name, date, game_type, status, course_id, course_name, slope_rating,
        bet_amount, greenie_amount, skins_amount, greenie_holes, nassau_format,
        nassau_segment_bet, nassau_overall_bet, is_team_game, multi_day_id,
        day_number, round_number, slug, selfie_hole, handicap_mode, payout_config
      ) VALUES (?, ?, ?, 'setup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name || `${multiDay.name} - Round ${round_number}`,
      date || multiDay.start_date,
      game_type || 'scramble',
      course_id || null,
      course_name || null,
      slope_rating || 113,
      bet_amount || 0,
      greenie_amount || 0,
      skins_amount || 0,
      greenie_holes || null,
      nassau_format || '6-6-6',
      nassau_segment_bet || null,
      nassau_overall_bet || null,
      is_team_game ? 1 : 0,
      id,
      day_number || 1,
      round_number || 1,
      slug,
      selfieHole,
      handicap_mode || 'gross',
      payout_config ? JSON.stringify(payout_config) : null
    )

    const tournamentId = result.lastInsertRowid

    // If player data provided from Setup.vue, use it (includes team/tee assignments)
    if (playerData && playerData.length > 0) {
      const insertPlayer = db.prepare(`
        INSERT INTO players (tournament_id, name, handicap, team, tee_color, multi_day_player_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      for (const player of playerData) {
        insertPlayer.run(
          tournamentId,
          player.name,
          player.handicap || 0,
          player.team || null,
          player.tee_color || 'white',
          player.multiDayPlayerId || null
        )
      }
    } else {
      // Fall back to copying players from multi-day tournament
      const multiDayPlayers = db.prepare('SELECT * FROM multi_day_players WHERE multi_day_id = ?').all(id)

      const insertPlayer = db.prepare(`
        INSERT INTO players (tournament_id, name, handicap, team, multi_day_player_id)
        VALUES (?, ?, ?, ?, ?)
      `)

      for (const player of multiDayPlayers) {
        insertPlayer.run(tournamentId, player.name, player.handicap, player.team, player.id)
      }
    }

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId)
    const players = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(tournamentId)

    res.status(201).json({
      ...tournament,
      players
    })
  } catch (error) {
    console.error('Error creating round:', error)
    res.status(500).json({ error: 'Failed to create round' })
  }
})

// Get overall standings/leaderboard for multi-day tournament
router.get('/:id/standings', (req, res) => {
  try {
    const { id } = req.params

    const tournament = db.prepare('SELECT * FROM multi_day_tournaments WHERE id = ?').get(id)
    if (!tournament) {
      return res.status(404).json({ error: 'Multi-day tournament not found' })
    }

    const players = db.prepare('SELECT * FROM multi_day_players WHERE multi_day_id = ?').all(id)
    const rounds = db.prepare('SELECT * FROM tournaments WHERE multi_day_id = ? ORDER BY day_number, round_number').all(id)

    const standings = calculateMultiDayStandings(tournament, players, rounds)

    res.json({
      standings,
      rounds: rounds.map(r => ({
        id: r.id,
        name: r.name,
        day_number: r.day_number,
        round_number: r.round_number,
        status: r.status,
        game_type: r.game_type
      }))
    })
  } catch (error) {
    console.error('Error fetching standings:', error)
    res.status(500).json({ error: 'Failed to fetch standings' })
  }
})

// Delete a multi-day tournament
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params

    // Delete all linked tournaments first
    const rounds = db.prepare('SELECT id FROM tournaments WHERE multi_day_id = ?').all(id)
    for (const round of rounds) {
      db.prepare('DELETE FROM scores WHERE tournament_id = ?').run(round.id)
      db.prepare('DELETE FROM players WHERE tournament_id = ?').run(round.id)
      db.prepare('DELETE FROM side_bets WHERE tournament_id = ?').run(round.id)
    }
    db.prepare('DELETE FROM tournaments WHERE multi_day_id = ?').run(id)

    // Delete multi-day players
    db.prepare('DELETE FROM multi_day_players WHERE multi_day_id = ?').run(id)

    // Delete the multi-day tournament itself
    db.prepare('DELETE FROM multi_day_tournaments WHERE id = ?').run(id)

    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting multi-day tournament:', error)
    res.status(500).json({ error: 'Failed to delete multi-day tournament' })
  }
})

// ============ HELPER FUNCTIONS ============

function calculateMultiDayStandings(multiDay, players, rounds) {
  const pointSystem = JSON.parse(multiDay.point_system || '[]')

  // Initialize standings for each player
  const standings = players.map(player => ({
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    totalPoints: 0,
    roundResults: [],
    wins: 0,
    totalStrokes: 0
  }))

  // Process each round
  for (const round of rounds) {
    // Skip rounds that haven't been played yet
    if (round.status === 'setup' || round.status === 'scheduled') continue

    // Get round players and scores
    const roundPlayers = db.prepare('SELECT * FROM players WHERE tournament_id = ?').all(round.id)
    const scores = db.prepare('SELECT * FROM scores WHERE tournament_id = ?').all(round.id)

    // Calculate results for this round
    const roundResults = calculateRoundResults(round, roundPlayers, scores)

    // Assign points based on position
    for (const result of roundResults) {
      const multiDayPlayer = standings.find(s => {
        const roundPlayer = roundPlayers.find(rp => rp.id === result.playerId)
        return roundPlayer && roundPlayer.multi_day_player_id === s.playerId
      })

      if (multiDayPlayer) {
        // Find points for this position
        const pointRule = pointSystem.find(p => p.place === result.position)
        const points = pointRule ? pointRule.points : 0

        multiDayPlayer.totalPoints += points
        multiDayPlayer.totalStrokes += result.grossTotal || 0

        if (result.position === 1) {
          multiDayPlayer.wins++
        }

        multiDayPlayer.roundResults.push({
          roundId: round.id,
          roundNumber: round.round_number,
          dayNumber: round.day_number,
          roundName: round.name,
          position: result.position,
          points,
          grossTotal: result.grossTotal,
          toPar: result.toPar
        })
      }
    }
  }

  // Sort by total points (desc), then wins, then total strokes (asc)
  standings.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.totalStrokes - b.totalStrokes
  })

  // Add position
  standings.forEach((s, i) => {
    s.position = i + 1
  })

  return standings
}

function calculateRoundResults(round, players, scores) {
  const isTeamGame = round.is_team_game

  if (isTeamGame) {
    // Group by team
    const teams = {}
    for (const player of players) {
      if (!teams[player.team]) {
        teams[player.team] = { players: [], team: player.team }
      }
      teams[player.team].players.push(player)
    }

    const teamResults = []
    for (const [teamNum, teamData] of Object.entries(teams)) {
      const playerIds = teamData.players.map(p => p.id)
      let grossTotal = 0
      let holesPlayed = 0

      for (let hole = 1; hole <= 18; hole++) {
        const holeScores = playerIds
          .map(id => scores.find(s => s.player_id === id && s.hole_number === hole)?.strokes)
          .filter(s => s !== undefined && s !== null)

        if (holeScores.length > 0) {
          holesPlayed++
          // Use best ball for team games
          grossTotal += Math.min(...holeScores)
        }
      }

      teamResults.push({
        playerId: teamData.players[0]?.id, // Use first player's ID for linking
        team: parseInt(teamNum),
        grossTotal,
        holesPlayed,
        toPar: grossTotal - (holesPlayed * 4) // Rough estimate
      })
    }

    // Sort and assign positions
    teamResults.sort((a, b) => a.grossTotal - b.grossTotal)
    teamResults.forEach((r, i) => { r.position = i + 1 })
    return teamResults
  } else {
    // Individual results
    const results = players.map(player => {
      const playerScores = scores.filter(s => s.player_id === player.id)
      const grossTotal = playerScores.reduce((sum, s) => sum + (s.strokes || 0), 0)
      const holesPlayed = playerScores.filter(s => s.strokes).length

      return {
        playerId: player.id,
        playerName: player.name,
        grossTotal,
        holesPlayed,
        toPar: grossTotal - (holesPlayed * 4) // Rough estimate
      }
    })

    // Sort and assign positions
    results.sort((a, b) => a.grossTotal - b.grossTotal)
    results.forEach((r, i) => { r.position = i + 1 })
    return results
  }
}

export default router
