/**
 * Database schema and initialization
 */

export function initializeDatabase(db) {
  // Tournaments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      game_type TEXT NOT NULL,
      status TEXT DEFAULT 'setup',
      course_id TEXT,
      course_name TEXT,
      slope_rating INTEGER DEFAULT 113,
      bet_amount REAL DEFAULT 0,
      greenie_amount REAL DEFAULT 0,
      skins_amount REAL DEFAULT 0,
      greenie_holes TEXT,
      nassau_format TEXT DEFAULT '6-6-6',
      is_team_game INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Add columns if they don't exist (migration for existing DBs)
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN nassau_format TEXT DEFAULT '6-6-6'`)
  } catch (e) { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN is_team_game INTEGER DEFAULT 0`)
  } catch (e) { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN payout_config TEXT`)
  } catch (e) { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN slug TEXT UNIQUE`)
  } catch (e) { /* column already exists */ }

  // Players table
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      handicap REAL DEFAULT 0,
      team INTEGER,
      tee_color TEXT DEFAULT 'white',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `)

  // Holes table (cached course data)
  db.exec(`
    CREATE TABLE IF NOT EXISTS holes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id TEXT NOT NULL,
      hole_number INTEGER NOT NULL,
      par INTEGER NOT NULL,
      handicap_rating INTEGER,
      yardage_white INTEGER,
      yardage_blue INTEGER,
      yardage_gold INTEGER,
      UNIQUE(course_id, hole_number)
    )
  `)

  // Scores table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      hole_number INTEGER NOT NULL,
      strokes INTEGER,
      greenie INTEGER DEFAULT 0,
      greenie_distance REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      UNIQUE(tournament_id, player_id, hole_number)
    )
  `)

  // Courses cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      country TEXT,
      slope_rating INTEGER,
      course_rating REAL,
      data TEXT,
      cached_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  console.log('Database initialized successfully')
}
