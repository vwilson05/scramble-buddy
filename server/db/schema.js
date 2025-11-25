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
    db.exec(`ALTER TABLE tournaments ADD COLUMN slug TEXT`)
  } catch (e) { /* column already exists */ }

  // Create index for slug lookups (SQLite can't add UNIQUE constraint via ALTER)
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(slug)`)
  } catch (e) { /* index may already exist */ }

  // Add selfie_hole column for random selfie reminder
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN selfie_hole INTEGER`)
  } catch (e) { /* column already exists */ }

  // Add Nassau segment/overall bet columns
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN nassau_segment_bet REAL`)
  } catch (e) { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN nassau_overall_bet REAL`)
  } catch (e) { /* column already exists */ }

  // Side bets table - flexible mini-tournaments between any parties
  // Each side bet is like its own game with its own format
  // Presses create NEW side_bet entries with parent_bet_id set
  db.exec(`
    CREATE TABLE IF NOT EXISTS side_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      parent_bet_id INTEGER, -- null for original bet, set for presses
      name TEXT,

      -- Game format
      game_type TEXT NOT NULL, -- 'match_play', 'best_ball', 'high_low', 'nassau', 'skins'
      nassau_format TEXT, -- '9-9' or '6-6-6' (only for nassau type)
      use_high_low INTEGER DEFAULT 0, -- 1 = use best+worst scoring for teams

      -- Participants (JSON arrays of {playerId, playerName, team?})
      party1 TEXT NOT NULL, -- JSON array
      party2 TEXT NOT NULL, -- JSON array
      party1_name TEXT, -- Display name like "Team 1" or "John & Mike"
      party2_name TEXT,

      -- Bet amounts (in dollars)
      front_amount REAL DEFAULT 0, -- holes 1-9 or 1-6
      middle_amount REAL DEFAULT 0, -- holes 7-12 (6-6-6 only)
      back_amount REAL DEFAULT 0, -- holes 10-18 or 13-18
      overall_amount REAL DEFAULT 0, -- full 18
      per_hole_amount REAL DEFAULT 0, -- for skins/match play per hole

      -- For presses: which segment and starting hole
      segment TEXT, -- 'front', 'middle', 'back', 'overall' (null = all segments)
      start_hole INTEGER DEFAULT 1,

      auto_press INTEGER DEFAULT 0, -- auto-press when down by X holes
      status TEXT DEFAULT 'active', -- 'active', 'completed'
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_bet_id) REFERENCES side_bets(id) ON DELETE CASCADE
    )
  `)

  // Drop old bet_presses table if exists (no longer needed - presses are side_bets)
  try {
    db.exec(`DROP TABLE IF EXISTS bet_presses`)
  } catch (e) { /* ignore */ }

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

  // Calcutta auction configuration
  db.exec(`
    CREATE TABLE IF NOT EXISTS calcutta_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL UNIQUE,
      enabled INTEGER DEFAULT 0,
      payout_structure TEXT, -- JSON: [{place: 1, type: 'percent'|'fixed', value: 50}, ...]
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    )
  `)

  // Calcutta team purchases (who bought which team for how much)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calcutta_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      team_number INTEGER NOT NULL,
      buyer_name TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      UNIQUE(tournament_id, team_number)
    )
  `)

  // Multi-day tournament container
  db.exec(`
    CREATE TABLE IF NOT EXISTS multi_day_tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      num_days INTEGER DEFAULT 1,
      num_rounds INTEGER DEFAULT 1,
      point_system TEXT, -- JSON: [{place: 1, points: 10}, {place: 2, points: 8}, ...]
      payout_structure TEXT, -- JSON for overall payouts
      status TEXT DEFAULT 'setup', -- 'setup', 'active', 'completed'
      slug TEXT UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Multi-day players (master list shared across all rounds)
  db.exec(`
    CREATE TABLE IF NOT EXISTS multi_day_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      multi_day_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      handicap REAL DEFAULT 0,
      team INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (multi_day_id) REFERENCES multi_day_tournaments(id) ON DELETE CASCADE
    )
  `)

  // Add multi_day_id to tournaments (links a round to its parent multi-day)
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN multi_day_id INTEGER REFERENCES multi_day_tournaments(id)`)
  } catch (e) { /* column already exists */ }

  // Add round_number to tournaments
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN round_number INTEGER`)
  } catch (e) { /* column already exists */ }

  // Add day_number to tournaments (which day of the multi-day event)
  try {
    db.exec(`ALTER TABLE tournaments ADD COLUMN day_number INTEGER`)
  } catch (e) { /* column already exists */ }

  // Add multi_day_player_id to players (links round player to master player)
  try {
    db.exec(`ALTER TABLE players ADD COLUMN multi_day_player_id INTEGER`)
  } catch (e) { /* column already exists */ }

  console.log('Database initialized successfully')
}
