import { Router } from 'express'
import db from '../db/index.js'
import { connectGhin, refreshHandicap } from '../services/ghin.js'

const router = Router()

/**
 * Connect a player to GHIN
 * POST /api/ghin/connect
 * Body: { playerId, ghinNumber, password }
 */
router.post('/connect', async (req, res) => {
  try {
    const { playerId, ghinNumber, password } = req.body

    if (!ghinNumber || !password) {
      return res.status(400).json({ error: 'GHIN number and password required' })
    }

    // Connect to GHIN
    const result = await connectGhin(ghinNumber, password)

    if (!result.success) {
      return res.status(401).json({ error: result.error })
    }

    // If playerId provided, update the player record
    if (playerId) {
      db.prepare(`
        UPDATE players
        SET ghin_number = ?,
            ghin_token = ?,
            ghin_connected_at = datetime('now'),
            handicap = ?
        WHERE id = ?
      `).run(ghinNumber, result.token, result.handicapIndex, playerId)

      const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId)
      return res.json({
        success: true,
        handicapIndex: result.handicapIndex,
        golfer: result.golfer,
        player
      })
    }

    // No playerId - just return the GHIN data
    res.json({
      success: true,
      handicapIndex: result.handicapIndex,
      golfer: result.golfer
    })
  } catch (error) {
    console.error('GHIN connect error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Refresh handicap for a connected player
 * POST /api/ghin/refresh/:playerId
 */
router.post('/refresh/:playerId', async (req, res) => {
  try {
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.playerId)

    if (!player) {
      return res.status(404).json({ error: 'Player not found' })
    }

    if (!player.ghin_number || !player.ghin_token) {
      return res.status(400).json({ error: 'Player not connected to GHIN' })
    }

    // Refresh handicap
    const result = await refreshHandicap(player.ghin_number, player.ghin_token)

    if (!result.success) {
      // Token may have expired - user needs to reconnect
      return res.status(401).json({
        error: result.error,
        needsReconnect: true
      })
    }

    // Update player handicap
    db.prepare(`
      UPDATE players
      SET handicap = ?,
          ghin_connected_at = datetime('now')
      WHERE id = ?
    `).run(result.handicapIndex, req.params.playerId)

    const updatedPlayer = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.playerId)

    res.json({
      success: true,
      handicapIndex: result.handicapIndex,
      player: updatedPlayer
    })
  } catch (error) {
    console.error('GHIN refresh error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * Disconnect player from GHIN
 * DELETE /api/ghin/disconnect/:playerId
 */
router.delete('/disconnect/:playerId', (req, res) => {
  try {
    db.prepare(`
      UPDATE players
      SET ghin_number = NULL,
          ghin_token = NULL,
          ghin_connected_at = NULL
      WHERE id = ?
    `).run(req.params.playerId)

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Lookup handicap without connecting (one-time lookup)
 * POST /api/ghin/lookup
 * Body: { ghinNumber, password }
 */
router.post('/lookup', async (req, res) => {
  try {
    const { ghinNumber, password } = req.body

    if (!ghinNumber || !password) {
      return res.status(400).json({ error: 'GHIN number and password required' })
    }

    const result = await connectGhin(ghinNumber, password)

    if (!result.success) {
      return res.status(401).json({ error: result.error })
    }

    res.json({
      success: true,
      handicapIndex: result.handicapIndex,
      golfer: result.golfer
    })
  } catch (error) {
    console.error('GHIN lookup error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
