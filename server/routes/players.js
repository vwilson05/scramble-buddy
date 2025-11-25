import { Router } from 'express'
import db from '../db/index.js'

const router = Router()

// Get player by ID
router.get('/:id', (req, res) => {
  try {
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id)
    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }
    res.json(player)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update player
router.put('/:id', (req, res) => {
  try {
    const { name, handicap, team, tee_color } = req.body

    db.prepare(`
      UPDATE players
      SET name = COALESCE(?, name),
          handicap = COALESCE(?, handicap),
          team = COALESCE(?, team),
          tee_color = COALESCE(?, tee_color)
      WHERE id = ?
    `).run(name, handicap, team, tee_color, req.params.id)

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id)
    res.json(player)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Delete player
router.delete('/:id', (req, res) => {
  try {
    // Also delete player's scores
    db.prepare('DELETE FROM scores WHERE player_id = ?').run(req.params.id)
    db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
