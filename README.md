# 18Eagles

The best golf tournament app for you and your buddies!

## Features

- **Multiple Game Types**: Stroke Play, Match Play, Scramble, Best Ball, High-Low, Skins, Nassau
- **Live Scoring**: Real-time scorecard with auto-polling updates
- **Handicap Support**: Automatic net score calculations with course handicap
- **Greenies**: Track closest-to-pin on par 3s
- **Bet Tracking**: Live bet calculations with automatic settlement
- **Mobile-First**: Optimized for use on the course

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev
```

Then open http://localhost:5173 in your browser.

## Development

- **Frontend**: http://localhost:5173 (Vue 3 + Vite + Tailwind)
- **Backend API**: http://localhost:3001/api (Express + SQLite)

## Project Structure

```
scramble-buddy/
├── client/              # Vue 3 frontend
│   ├── src/
│   │   ├── views/       # Page components
│   │   ├── stores/      # Pinia state management
│   │   └── utils/       # Scoring helpers
├── server/              # Express backend
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic
│   └── db/              # SQLite setup
└── database.sqlite      # SQLite database
```

## Deployment (Railway)

1. Push to GitHub
2. Connect to Railway
3. Add environment variable: `NODE_ENV=production`
4. Deploy!

Railway config is already set up in `railway.json`.

## API Endpoints

- `GET/POST /api/tournaments` - List/Create tournaments
- `GET /api/tournaments/:id` - Get tournament details
- `POST /api/tournaments/:id/players` - Add player
- `POST /api/scores` - Submit score
- `GET /api/tournaments/:id/leaderboard` - Get leaderboard
- `GET /api/courses/search?name=` - Search golf courses

## Tech Stack

- Vue 3 + Vite + Tailwind CSS
- Express.js + better-sqlite3
- Golf Course API (RapidAPI)
