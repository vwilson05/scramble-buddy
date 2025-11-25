import { Router } from 'express'
import db from '../db/index.js'

const router = Router()

// Submit or update score
router.post('/', (req, res) => {
  try {
    const { tournament_id, player_id, hole_number, strokes, greenie, greenie_distance } = req.body

    // Use upsert to handle both insert and update
    db.prepare(`
      INSERT INTO scores (tournament_id, player_id, hole_number, strokes, greenie, greenie_distance)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tournament_id, player_id, hole_number)
      DO UPDATE SET strokes = ?, greenie = ?, greenie_distance = ?
    `).run(
      tournament_id, player_id, hole_number, strokes, greenie || 0, greenie_distance || null,
      strokes, greenie || 0, greenie_distance || null
    )

    const score = db.prepare(`
      SELECT * FROM scores
      WHERE tournament_id = ? AND player_id = ? AND hole_number = ?
    `).get(tournament_id, player_id, hole_number)

    res.status(201).json(score)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get all scores for a tournament
router.get('/tournament/:id', (req, res) => {
  try {
    const scores = db.prepare(`
      SELECT s.*, p.name as player_name
      FROM scores s
      JOIN players p ON s.player_id = p.id
      WHERE s.tournament_id = ?
      ORDER BY s.hole_number, p.name
    `).all(req.params.id)

    res.json(scores)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get scores for a specific player in a tournament
router.get('/player/:playerId/tournament/:tournamentId', (req, res) => {
  try {
    const scores = db.prepare(`
      SELECT * FROM scores
      WHERE player_id = ? AND tournament_id = ?
      ORDER BY hole_number
    `).all(req.params.playerId, req.params.tournamentId)

    res.json(scores)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete a score
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM scores WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get greenies for a tournament
router.get('/greenies/:tournamentId', (req, res) => {
  try {
    const greenies = db.prepare(`
      SELECT s.*, p.name as player_name, h.par
      FROM scores s
      JOIN players p ON s.player_id = p.id
      LEFT JOIN holes h ON h.course_id = (
        SELECT course_id FROM tournaments WHERE id = s.tournament_id
      ) AND h.hole_number = s.hole_number
      WHERE s.tournament_id = ? AND s.greenie = 1
      ORDER BY s.hole_number
    `).all(req.params.tournamentId)

    res.json(greenies)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
