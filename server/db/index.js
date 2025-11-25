import Database from 'better-sqlite3'
import { initializeDatabase } from './schema.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Use DATABASE_PATH env var if set (for Railway volume), otherwise local
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../database.sqlite')

// Ensure directory exists for Railway volume
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

console.log(`Database path: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// Initialize tables
initializeDatabase(db)

export default db
