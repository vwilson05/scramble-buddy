import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import tournamentRoutes from './routes/tournaments.js'
import playerRoutes from './routes/players.js'
import scoreRoutes from './routes/scores.js'
import courseRoutes from './routes/courses.js'
import emailRoutes from './routes/email.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const isProduction = process.env.NODE_ENV === 'production'

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// API Routes
app.use('/api/tournaments', tournamentRoutes)
app.use('/api/players', playerRoutes)
app.use('/api/scores', scoreRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/email', emailRoutes)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static files in production
if (isProduction) {
  const clientDist = path.join(__dirname, '../client/dist')
  app.use(express.static(clientDist))

  // Handle client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Something went wrong!' })
})

app.listen(PORT, () => {
  console.log(`
  ⛳ Scramble Buddy Server running on port ${PORT}
  📍 API: http://localhost:${PORT}/api
  ${isProduction ? '🌐 Serving client from /client/dist' : '🔧 Development mode'}
  `)
})
