/**
 * Server-side scoring calculations
 */

/**
 * Calculate course handicap from index
 */
function calculateCourseHandicap(handicapIndex, slopeRating = 113) {
  if (!handicapIndex) return 0
  return Math.round(handicapIndex * (slopeRating / 113))
}

/**
 * Get strokes received on a hole
 * Note: No strokes given on par 3s (common rule)
 */
function getStrokesOnHole(courseHandicap, holeHandicapRating, holePar) {
  if (courseHandicap <= 0) return 0
  if (holePar === 3) return 0 // No strokes on par 3s
  const fullStrokes = Math.floor(courseHandicap / 18)
  const remainingStrokes = courseHandicap % 18
  return fullStrokes + (holeHandicapRating <= remainingStrokes ? 1 : 0)
}

/**
 * Calculate net score for a hole
 */
function calculateNetScore(grossScore, courseHandicap, holeHandicapRating, holePar) {
  return grossScore - getStrokesOnHole(courseHandicap, holeHandicapRating, holePar)
}

/**
 * Calculate full leaderboard with all scoring details
 */
export function calculateLeaderboard(tournament, players, scores, holes) {
  const slopeRating = tournament.slope_rating || 113
  const greenieHoles = tournament.greenie_holes ? tournament.greenie_holes.split(',').map(Number) : []

  // Build a map for quick hole lookup
  const holeMap = {}
  holes.forEach(h => { holeMap[h.hole_number] = h })

  // Calculate total par
  const totalPar = holes.reduce((sum, h) => sum + h.par, 0)
  const front9Par = holes.filter(h => h.hole_number <= 9).reduce((sum, h) => sum + h.par, 0)
  const back9Par = holes.filter(h => h.hole_number > 9).reduce((sum, h) => sum + h.par, 0)

  // Calculate each player's stats
  const playerStats = players.map(player => {
    const courseHandicap = calculateCourseHandicap(player.handicap, slopeRating)
    const playerScores = scores.filter(s => s.player_id === player.id)

    let grossTotal = 0
    let netTotal = 0
    let front9Gross = 0
    let back9Gross = 0
    let front9Net = 0
    let back9Net = 0
    let birdies = 0
    let pars = 0
    let bogeys = 0
    let doubles = 0
    let others = 0
    let holesPlayed = 0
    let greeniesWon = 0

    const holeScores = []

    for (let i = 1; i <= 18; i++) {
      const score = playerScores.find(s => s.hole_number === i)
      const hole = holeMap[i]

      if (score && score.strokes && hole) {
        const gross = score.strokes
        const net = calculateNetScore(gross, courseHandicap, hole.handicap_rating, hole.par)
        const diff = gross - hole.par

        grossTotal += gross
        netTotal += net
        holesPlayed++

        if (i <= 9) {
          front9Gross += gross
          front9Net += net
        } else {
          back9Gross += gross
          back9Net += net
        }

        // Score type counts
        if (diff <= -1) birdies++
        else if (diff === 0) pars++
        else if (diff === 1) bogeys++
        else if (diff === 2) doubles++
        else others++

        // Greenies
        if (score.greenie && greenieHoles.includes(i)) {
          greeniesWon++
        }

        holeScores.push({
          hole: i,
          gross,
          net,
          par: hole.par,
          strokes: getStrokesOnHole(courseHandicap, hole.handicap_rating, hole.par),
          greenie: score.greenie,
          greenieDistance: score.greenie_distance
        })
      } else {
        holeScores.push({
          hole: i,
          gross: null,
          net: null,
          par: hole?.par || 4,
          strokes: hole ? getStrokesOnHole(courseHandicap, hole.handicap_rating, hole.par) : 0
        })
      }
    }

    return {
      player: {
        id: player.id,
        name: player.name,
        handicap: player.handicap,
        courseHandicap,
        team: player.team,
        tee_color: player.tee_color
      },
      grossTotal,
      netTotal,
      front9Gross,
      back9Gross,
      front9Net,
      back9Net,
      holesPlayed,
      toPar: grossTotal - (holesPlayed > 0 ? holes.slice(0, holesPlayed).reduce((s, h) => s + h.par, 0) : 0),
      toParNet: netTotal - (holesPlayed > 0 ? holes.slice(0, holesPlayed).reduce((s, h) => s + h.par, 0) : 0),
      stats: { birdies, pars, bogeys, doubles, others },
      greeniesWon,
      holeScores
    }
  })

  // Sort by game type
  let sorted
  switch (tournament.game_type) {
    case 'stroke_play':
      sorted = playerStats.sort((a, b) => a.grossTotal - b.grossTotal)
      break
    case 'match_play':
      sorted = calculateMatchPlay(playerStats, holes)
      break
    case 'scramble':
    case 'best_ball':
      sorted = calculateTeamScores(playerStats, tournament.game_type, holes)
      break
    case 'skins':
      sorted = calculateSkins(playerStats, tournament.skins_amount, holes)
      break
    default:
      sorted = playerStats.sort((a, b) => a.netTotal - b.netTotal)
  }

  // Calculate bet settlements
  const settlements = calculateBetSettlements(sorted, tournament)

  return {
    leaderboard: sorted,
    settlements,
    totalPar,
    front9Par,
    back9Par,
    greenieHoles,
    gameType: tournament.game_type
  }
}

/**
 * Calculate match play results (1v1)
 */
function calculateMatchPlay(playerStats, holes) {
  if (playerStats.length !== 2) return playerStats

  const [p1, p2] = playerStats
  let p1Holes = 0
  let p2Holes = 0

  for (let i = 0; i < 18; i++) {
    const s1 = p1.holeScores[i]
    const s2 = p2.holeScores[i]

    if (s1.net !== null && s2.net !== null) {
      if (s1.net < s2.net) p1Holes++
      else if (s2.net < s1.net) p2Holes++
    }
  }

  p1.matchStatus = p1Holes > p2Holes ? `${p1Holes - p2Holes} UP` : p1Holes < p2Holes ? `${p2Holes - p1Holes} DN` : 'AS'
  p2.matchStatus = p2Holes > p1Holes ? `${p2Holes - p1Holes} UP` : p2Holes < p1Holes ? `${p1Holes - p2Holes} DN` : 'AS'
  p1.holesWon = p1Holes
  p2.holesWon = p2Holes

  return [p1, p2].sort((a, b) => b.holesWon - a.holesWon)
}

/**
 * Calculate team scores (scramble, best ball)
 */
function calculateTeamScores(playerStats, gameType, holes) {
  const teams = {}

  playerStats.forEach(ps => {
    const teamId = ps.player.team || 0
    if (!teams[teamId]) {
      teams[teamId] = { players: [], holeScores: [] }
    }
    teams[teamId].players.push(ps)
  })

  const teamResults = Object.entries(teams).map(([teamId, team]) => {
    let teamGross = 0
    let teamNet = 0

    for (let i = 0; i < 18; i++) {
      const scores = team.players.map(p => p.holeScores[i]).filter(s => s.gross !== null)

      if (scores.length > 0) {
        if (gameType === 'best_ball') {
          const bestGross = Math.min(...scores.map(s => s.gross))
          const bestNet = Math.min(...scores.map(s => s.net))
          teamGross += bestGross
          teamNet += bestNet
        } else {
          // Scramble uses single score per hole (entered for team)
          teamGross += scores[0].gross
          teamNet += scores[0].net
        }
      }
    }

    return {
      team: teamId,
      players: team.players,
      grossTotal: teamGross,
      netTotal: teamNet
    }
  })

  return teamResults.sort((a, b) => a.netTotal - b.netTotal)
}

/**
 * Calculate skins
 */
function calculateSkins(playerStats, skinValue, holes) {
  const skins = []
  let carryover = 0

  for (let i = 0; i < 18; i++) {
    const scores = playerStats
      .map(ps => ({ player: ps.player, score: ps.holeScores[i] }))
      .filter(s => s.score.net !== null)
      .sort((a, b) => a.score.net - b.score.net)

    if (scores.length > 0) {
      const best = scores[0].score.net
      const winners = scores.filter(s => s.score.net === best)

      if (winners.length === 1) {
        skins.push({
          hole: i + 1,
          winner: winners[0].player,
          value: skinValue * (1 + carryover)
        })
        carryover = 0
      } else {
        carryover++
      }
    }
  }

  // Add skins info to player stats
  playerStats.forEach(ps => {
    ps.skinsWon = skins.filter(s => s.winner.id === ps.player.id)
    ps.skinsTotal = ps.skinsWon.reduce((sum, s) => sum + s.value, 0)
  })

  return playerStats.sort((a, b) => b.skinsTotal - a.skinsTotal)
}

/**
 * Calculate bet settlements
 */
function calculateBetSettlements(leaderboard, tournament) {
  const settlements = []
  const { bet_amount, greenie_amount, game_type } = tournament

  if (!bet_amount && !greenie_amount) return settlements

  // Sort by NET score for bet settlements (bets are always on net)
  const byNet = [...leaderboard].sort((a, b) => a.netTotal - b.netTotal)

  // Simple stroke play settlement (based on net scores)
  if (game_type === 'stroke_play' && byNet.length >= 2) {
    const winner = byNet[0]
    const losers = byNet.slice(1)

    losers.forEach(loser => {
      settlements.push({
        from: loser.player.name,
        to: winner.player.name,
        amount: bet_amount,
        reason: 'Main bet'
      })
    })
  }

  // Greenie settlements
  if (greenie_amount) {
    leaderboard.forEach(player => {
      if (player.greeniesWon > 0) {
        const others = leaderboard.filter(p => p.player.id !== player.player.id)
        others.forEach(other => {
          settlements.push({
            from: other.player.name,
            to: player.player.name,
            amount: greenie_amount * player.greeniesWon,
            reason: `Greenies (${player.greeniesWon})`
          })
        })
      }
    })
  }

  // Consolidate settlements
  const consolidated = {}
  settlements.forEach(s => {
    const key = `${s.from}->${s.to}`
    const reverseKey = `${s.to}->${s.from}`

    if (consolidated[reverseKey]) {
      consolidated[reverseKey].amount -= s.amount
      if (consolidated[reverseKey].amount < 0) {
        consolidated[key] = { ...s, amount: -consolidated[reverseKey].amount }
        delete consolidated[reverseKey]
      }
    } else if (consolidated[key]) {
      consolidated[key].amount += s.amount
    } else {
      consolidated[key] = { ...s }
    }
  })

  return Object.values(consolidated).filter(s => s.amount > 0)
}
