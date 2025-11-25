# Scramble Buddy - Golf Tournament App

## Overview
A fun, elegant web app for running golf tournaments/matches with friends. Vue 3 frontend + Express backend with SQLite storage.

---

## Tech Stack
- **Frontend:** Vue 3 + Vite + Tailwind CSS
- **Backend:** Express.js + SQLite (better-sqlite3)
- **API:** Golf Course API (RapidAPI)
- **Real-time:** Polling (auto-refresh every 15 seconds)

---

## Core Features

### 1. Game Types Supported
| Game | Description | Scoring |
|------|-------------|---------|
| **Scramble** | Team picks best shot, all play from there | Team gross/net score |
| **Best Ball** | Each plays own ball, best score counts | Best individual score per hole |
| **High-Low** | Team of 2, high + low score combined | Combined team score |
| **Stroke Play** | Individual, total strokes | Gross & Net (handicap adjusted) |
| **Match Play** | Hole-by-hole winner | Holes up/down |
| **Skins** | Win hole outright, win the skin | Skins won + carryovers |
| **Nassau** | Front 9, Back 9, Total (3 bets) | 3 separate match results |

### 2. Tournament Setup Flow
```
1. Create Tournament
   └─ Name, Date, Game Type

2. Select Course (API lookup)
   └─ Search by name → Get hole info (par, yardage, handicap rating)

3. Add Players (1-4)
   └─ Name, Handicap Index, Tees (for yardage)

4. Configure Teams (if team game)
   └─ Drag-drop or auto-assign

5. Set Bets
   └─ Main bet amount
   └─ Greenie holes (select par 3s)
   └─ Greenie amount
   └─ Skins amount (if applicable)

6. Start Tournament!
```

### 3. Live Scoring Dashboard
- **Hole-by-hole entry** - Simple number pad for each player
- **Live Leaderboard** - Auto-updates every 15 seconds
- **Gross & Net scores** - Calculated from handicap
- **Running bet tracker** - Who owes whom, live
- **Greenie tracker** - Closest to pin on par 3s
- **Current hole indicator** - See where everyone is

### 4. Results & Settlement
- Final leaderboard with rankings
- Bet breakdown (who pays whom)
- Stats summary (birdies, pars, etc.)
- Share results

---

## Database Schema

```sql
-- Tournaments
tournaments (
  id, name, date, game_type, status,
  course_id, course_name, bet_amount,
  greenie_amount, skins_amount, created_at
)

-- Players (per tournament)
players (
  id, tournament_id, name, handicap,
  team, tee_color, created_at
)

-- Holes (from API, cached per course)
holes (
  id, course_id, hole_number, par,
  handicap_rating, yardage_white, yardage_blue
)

-- Scores
scores (
  id, tournament_id, player_id, hole_number,
  strokes, greenie, greenie_distance, created_at
)

-- Greenie Holes (which par 3s are greenie holes)
greenie_holes (
  id, tournament_id, hole_number
)
```

---

## UI/UX Design

### Color Palette (Golf-inspired)
- **Primary:** Forest Green (#228B22)
- **Secondary:** Fairway Green (#90EE90)
- **Accent:** Gold/Yellow (#FFD700) - for wins/highlights
- **Dark:** Rich Black (#1a1a2e)
- **Light:** Off-white (#f8f9fa)

### Pages
1. **Home** - Start new tournament or continue existing
2. **Setup Wizard** - Step-by-step tournament creation
3. **Scorecard** - Enter scores (mobile-optimized)
4. **Leaderboard** - Live standings + bets
5. **Results** - Final summary + payouts

### Mobile-First Design
- Large touch targets for score entry
- Swipe between holes
- Pull-to-refresh leaderboard
- Works great on phone at the course

---

## Project Structure

```
scramble-buddy/
├── client/                 # Vue 3 frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── views/          # Page components
│   │   ├── stores/         # Pinia state management
│   │   ├── composables/    # Shared logic
│   │   ├── utils/          # Helpers (scoring, handicap calc)
│   │   └── assets/         # Styles, images
│   └── index.html
├── server/                 # Express backend
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── db/                 # SQLite setup + migrations
│   └── index.js            # Server entry
├── database.sqlite         # SQLite database file
└── package.json
```

---

## API Endpoints

```
POST   /api/tournaments           - Create tournament
GET    /api/tournaments/:id       - Get tournament details
PUT    /api/tournaments/:id       - Update tournament
DELETE /api/tournaments/:id       - Delete tournament

POST   /api/tournaments/:id/players    - Add player
PUT    /api/players/:id                - Update player
DELETE /api/players/:id                - Remove player

POST   /api/scores                 - Submit score
GET    /api/tournaments/:id/scores - Get all scores
GET    /api/tournaments/:id/leaderboard - Calculated leaderboard

GET    /api/courses/search?name=   - Search courses (proxy to Golf API)
GET    /api/courses/:id            - Get course details + holes
```

---

## Scoring Logic

### Handicap Calculation
- Course Handicap = Handicap Index × (Slope Rating / 113)
- Strokes received per hole based on hole handicap rating
- Net score = Gross score - strokes received on that hole

### Game-Specific Scoring

**Scramble:**
- Team handicap = 25% of low + 15% of high (2 players)
- Compare team net vs par

**Best Ball:**
- Each player's net score calculated
- Best net on each hole counts

**Match Play:**
- Compare net scores hole-by-hole
- Track holes up/down
- "Dormie" status detection

**Skins:**
- Must win hole outright (no ties)
- Ties carry over to next hole
- Track skin values with carryovers

---

## Implementation Order

### Phase 1: Foundation
1. Initialize project (Vue + Vite + Express)
2. Set up SQLite database with schema
3. Create basic API routes
4. Build home page + tournament creation

### Phase 2: Course Integration
5. Integrate Golf Course API
6. Course search + selection UI
7. Cache course/hole data locally

### Phase 3: Tournament Setup
8. Player management UI
9. Team assignment
10. Bet configuration
11. Greenie hole selection

### Phase 4: Scoring
12. Scorecard component (mobile-optimized)
13. Score entry with validation
14. Auto-polling for updates

### Phase 5: Leaderboard & Bets
15. Live leaderboard calculations
16. Bet tracker (who owes whom)
17. Greenie tracking

### Phase 6: Polish
18. Results/settlement page
19. Animations and transitions
20. Error handling + offline support
21. Deployment prep (Railway)

---

## Fun Extras (If Time)
- Hole-by-hole animations (birdie celebration!)
- Sound effects for birdies/eagles
- Photo upload for greenies
- Historical stats across tournaments
- Trash talk message board

---

## Deployment
- Railway for Express + SQLite (persistent volume)
- Or Render/Fly.io as alternatives
- Environment variables for API keys
