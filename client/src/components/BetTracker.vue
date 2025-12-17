<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSideBetsStore } from '../stores/sidebets'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'

const props = defineProps({
  tournamentId: {
    type: [Number, String],
    required: true
  },
  currentHole: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['close'])

const sideBetsStore = useSideBetsStore()
const tournamentStore = useTournamentStore()
const courseStore = useCourseStore()

const loading = ref(true)
const activeTab = ref('round') // 'round' or 'sidebets'
const showPressModal = ref(false)
const pressingBet = ref(null)
const pressingSegment = ref(null)

onMounted(async () => {
  await Promise.all([
    sideBetsStore.fetchSideBets(props.tournamentId),
    tournamentStore.fetchLeaderboard(props.tournamentId)
  ])
  // Load course data if we have a course_id
  if (tournamentStore.currentTournament?.course_id && courseStore.holes.length === 0) {
    await courseStore.selectCourse({ id: tournamentStore.currentTournament.course_id })
  }
  loading.value = false
})

// Watch for score changes and refresh
watch(() => tournamentStore.scores, async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
}, { deep: true })

// Tournament info
const tournament = computed(() => tournamentStore.currentTournament)
const players = computed(() => tournamentStore.players)
const scores = computed(() => tournamentStore.scores)
const holes = computed(() => courseStore.holes)
const leaderboard = computed(() => tournamentStore.leaderboard?.leaderboard || [])

// Check if tournament has money on the line
const hasMainBet = computed(() => {
  if (!tournament.value) return false
  return tournament.value.bet_amount > 0 ||
         tournament.value.nassau_segment_bet > 0 ||
         tournament.value.greenie_amount > 0 ||
         tournament.value.skins_amount > 0 ||
         tournament.value.payout_config
})

// Game type helpers
const isNassau = computed(() => tournament.value?.game_type === 'nassau')
const isSkins = computed(() => tournament.value?.game_type === 'skins')
const isTeamGame = computed(() => ['scramble', 'best_ball', 'high_low'].includes(tournament.value?.game_type))
const nassauFormat = computed(() => tournament.value?.nassau_format || '6-6-6')

// Get segment ranges for Nassau
const segments = computed(() => {
  if (!isNassau.value) return []

  if (nassauFormat.value === '6-6-6') {
    return [
      { key: 'front', label: 'Front 6', start: 1, end: 6 },
      { key: 'middle', label: 'Middle 6', start: 7, end: 12 },
      { key: 'back', label: 'Back 6', start: 13, end: 18 },
      { key: 'overall', label: 'Overall', start: 1, end: 18 }
    ]
  } else {
    return [
      { key: 'front', label: 'Front 9', start: 1, end: 9 },
      { key: 'back', label: 'Back 9', start: 10, end: 18 },
      { key: 'overall', label: 'Overall', start: 1, end: 18 }
    ]
  }
})

// Calculate net score for a player over a range of holes
function getNetScoreForRange(playerId, startHole, endHole) {
  // Try to use leaderboard data first (has correct pars from backend)
  const playerEntry = leaderboard.value.find(e => e.player?.id === playerId)

  if (playerEntry?.holeScores) {
    let netTotal = 0
    let rangePar = 0
    let holesPlayed = 0

    for (let h = startHole; h <= endHole; h++) {
      const holeScore = playerEntry.holeScores[h - 1]
      // Only count holes that have been played (have a net score)
      if (holeScore?.net !== null && holeScore?.net !== undefined) {
        netTotal += holeScore.net
        // Only add par for holes that have been played
        rangePar += holeScore.par || 4
        holesPlayed++
      }
    }

    return {
      net: netTotal - rangePar,
      holesPlayed,
      totalHoles: endHole - startHole + 1
    }
  }

  // Fallback to local calculation if leaderboard not available
  let totalStrokes = 0
  let totalPar = 0
  let holesPlayed = 0

  const player = players.value.find(p => p.id === playerId)
  if (!player) return { net: 0, holesPlayed: 0 }

  // Get player's course handicap strokes
  const handicap = player.handicap || 0
  const strokesPerHole = Math.floor(handicap / 18)
  const extraStrokes = handicap % 18

  for (let h = startHole; h <= endHole; h++) {
    const score = scores.value.find(s => s.player_id === playerId && s.hole_number === h)
    const hole = holes.value.find(ho => ho.hole_number === h)

    if (score?.strokes && hole) {
      totalStrokes += score.strokes
      totalPar += hole.par
      holesPlayed++

      // Subtract handicap strokes
      let strokesForHole = strokesPerHole
      if (hole.handicap_rating && hole.handicap_rating <= extraStrokes) {
        strokesForHole++
      }
      totalStrokes -= strokesForHole
    }
  }

  return {
    net: totalStrokes - totalPar,
    holesPlayed,
    totalHoles: endHole - startHole + 1
  }
}

// Get standings for a segment
function getSegmentStandings(segment) {
  const standings = players.value.map(player => {
    const result = getNetScoreForRange(player.id, segment.start, segment.end)
    return {
      player,
      ...result,
      display: result.holesPlayed > 0 ? (result.net > 0 ? `+${result.net}` : result.net === 0 ? 'E' : result.net) : '-'
    }
  })

  // Sort by net score (lowest first)
  standings.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
    if (a.holesPlayed === 0) return 1
    if (b.holesPlayed === 0) return -1
    return a.net - b.net
  })

  return standings
}

// Check if segment is active (current hole is within range)
function isSegmentActive(segment) {
  return props.currentHole >= segment.start && props.currentHole <= segment.end
}

// Check if segment is complete
function isSegmentComplete(segment) {
  return props.currentHole > segment.end
}

// Get segment bet amount
function getSegmentBetAmount(segment) {
  if (!tournament.value) return 0
  if (segment.key === 'overall') {
    return tournament.value.nassau_overall_bet || tournament.value.bet_amount || 0
  }
  return tournament.value.nassau_segment_bet || tournament.value.bet_amount || 0
}

// Get greenies for a player
function getPlayerGreenies(playerId) {
  return scores.value.filter(s => s.player_id === playerId && s.greenie)
}

// Get all greenies
const greenies = computed(() => {
  const greenieHoles = tournament.value?.greenie_holes?.split(',').map(Number) || []
  if (greenieHoles.length === 0) return []

  return greenieHoles.map(holeNum => {
    const greenieScores = scores.value.filter(s => s.hole_number === holeNum && s.greenie)
    if (greenieScores.length === 0) return { holeNumber: holeNum, winner: null }

    // Find closest to pin (lowest greenie_distance)
    const winner = greenieScores.reduce((best, s) => {
      if (!best) return s
      if (s.greenie_distance && (!best.greenie_distance || s.greenie_distance < best.greenie_distance)) {
        return s
      }
      return best
    }, null)

    const player = winner ? players.value.find(p => p.id === winner.player_id) : null
    return {
      holeNumber: holeNum,
      winner: player,
      distance: winner?.greenie_distance
    }
  })
})

// Get skins results
const skinsResults = computed(() => {
  if (!isSkins.value) return []

  const results = []
  let carryover = 0

  for (let h = 1; h <= 18; h++) {
    const holeScores = scores.value.filter(s => s.hole_number === h && s.strokes)
    if (holeScores.length === 0) continue

    // Find lowest score
    const minScore = Math.min(...holeScores.map(s => s.strokes))
    const winners = holeScores.filter(s => s.strokes === minScore)

    if (winners.length === 1) {
      const player = players.value.find(p => p.id === winners[0].player_id)
      results.push({
        hole: h,
        winner: player,
        score: minScore,
        skins: 1 + carryover
      })
      carryover = 0
    } else {
      carryover++
      results.push({
        hole: h,
        winner: null,
        tied: true,
        carryover: carryover
      })
    }
  }

  return results
})

// Custom payouts
const payoutConfig = computed(() => {
  if (!tournament.value?.payout_config) return null
  return typeof tournament.value.payout_config === 'string'
    ? JSON.parse(tournament.value.payout_config)
    : tournament.value.payout_config
})

// Overall standings for payout calculation
const overallStandings = computed(() => {
  if (!payoutConfig.value) return []

  const standings = players.value.map(player => {
    const result = getNetScoreForRange(player.id, 1, 18)
    return { player, ...result }
  })

  standings.sort((a, b) => {
    if (a.holesPlayed === 0) return 1
    if (b.holesPlayed === 0) return -1
    return a.net - b.net
  })

  return standings
})

// Team standings for team games (best ball net)
const teamStandings = computed(() => {
  if (!isTeamGame.value) return []

  // Group players by team
  const teams = {}
  players.value.forEach(player => {
    const teamId = player.team || 0
    if (!teams[teamId]) {
      teams[teamId] = { teamId, players: [], teamName: '' }
    }
    teams[teamId].players.push(player)
  })

  // Calculate team scores (best ball - lowest net per hole)
  const teamResults = Object.values(teams).map(team => {
    team.teamName = team.players.map(p => p.name).join(' & ')

    let teamNet = 0
    let teamPar = 0
    let holesPlayed = 0

    for (let h = 1; h <= 18; h++) {
      // Get net scores for all team members on this hole
      const holeNetScores = team.players.map(player => {
        const playerEntry = leaderboard.value.find(e => e.player?.id === player.id)
        if (playerEntry?.holeScores?.[h - 1]?.net !== null && playerEntry?.holeScores?.[h - 1]?.net !== undefined) {
          return {
            net: playerEntry.holeScores[h - 1].net,
            par: playerEntry.holeScores[h - 1].par || 4
          }
        }
        return null
      }).filter(s => s !== null)

      if (holeNetScores.length > 0) {
        // Best ball - take lowest net score
        const bestNet = Math.min(...holeNetScores.map(s => s.net))
        const holePar = holeNetScores[0].par
        teamNet += bestNet
        teamPar += holePar
        holesPlayed++
      }
    }

    return {
      ...team,
      netTotal: teamNet,
      toPar: teamNet - teamPar,
      holesPlayed,
      display: holesPlayed > 0 ? (teamNet - teamPar > 0 ? `+${teamNet - teamPar}` : teamNet - teamPar === 0 ? 'E' : teamNet - teamPar) : '-'
    }
  })

  // Sort by net to par (lowest first)
  teamResults.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
    if (a.holesPlayed === 0) return 1
    if (b.holesPlayed === 0) return -1
    return a.toPar - b.toPar
  })

  return teamResults
})

// Get projected team payouts based on current standings
const projectedTeamPayouts = computed(() => {
  if (!payoutConfig.value?.teamPayouts?.length || teamStandings.value.length === 0) return []

  return payoutConfig.value.teamPayouts.map((payout, idx) => {
    const team = teamStandings.value[idx]
    return {
      place: payout.place,
      amount: payout.amount,
      team: team || null,
      teamName: team?.teamName || '-'
    }
  })
})

// Get projected individual payouts based on current standings
const projectedIndividualPayouts = computed(() => {
  if (!payoutConfig.value?.individualPayouts?.length || overallStandings.value.length === 0) return []

  return payoutConfig.value.individualPayouts.map((payout, idx) => {
    const standing = overallStandings.value[idx]
    return {
      place: payout.place,
      amount: payout.amount,
      player: standing?.player || null,
      playerName: standing?.player?.name || '-'
    }
  })
})

// Calculate final settlements (who owes who)
const finalSettlements = computed(() => {
  if (!payoutConfig.value || teamStandings.value.length === 0) return []

  const entryFee = payoutConfig.value.entryFee || 0
  const playerNetResults = {}

  // Initialize all players with -entryFee (they paid in)
  players.value.forEach(player => {
    playerNetResults[player.id] = {
      player,
      paid: entryFee,
      won: 0,
      net: -entryFee
    }
  })

  // Add team prize winnings (split equally among team members)
  if (payoutConfig.value.teamPayouts?.length && isTeamGame.value) {
    payoutConfig.value.teamPayouts.forEach((payout, idx) => {
      const team = teamStandings.value[idx]
      if (team && team.players.length > 0 && team.holesPlayed > 0) {
        const perPlayer = payout.amount / team.players.length
        team.players.forEach(player => {
          if (playerNetResults[player.id]) {
            playerNetResults[player.id].won += perPlayer
            playerNetResults[player.id].net += perPlayer
          }
        })
      }
    })
  }

  // Add individual prize winnings
  if (payoutConfig.value.individualPayouts?.length) {
    payoutConfig.value.individualPayouts.forEach((payout, idx) => {
      const standing = overallStandings.value[idx]
      if (standing?.player && playerNetResults[standing.player.id]) {
        playerNetResults[standing.player.id].won += payout.amount
        playerNetResults[standing.player.id].net += payout.amount
      }
    })
  }

  // Convert to array and sort by net (winners first, then losers)
  const results = Object.values(playerNetResults)
  results.sort((a, b) => b.net - a.net)

  return results
})

// Simplified settlements (who pays who)
const simplifiedSettlements = computed(() => {
  if (finalSettlements.value.length === 0) return []

  const winners = finalSettlements.value.filter(r => r.net > 0)
  const losers = finalSettlements.value.filter(r => r.net < 0)
  const settlements = []

  // Clone to avoid modifying computed values
  const winnerBalances = winners.map(w => ({ ...w, remaining: w.net }))
  const loserBalances = losers.map(l => ({ ...l, remaining: Math.abs(l.net) }))

  // Match losers to winners
  for (const loser of loserBalances) {
    for (const winner of winnerBalances) {
      if (loser.remaining <= 0) break
      if (winner.remaining <= 0) continue

      const amount = Math.min(loser.remaining, winner.remaining)
      if (amount > 0) {
        settlements.push({
          from: loser.player,
          to: winner.player,
          amount: Math.round(amount * 100) / 100
        })
        loser.remaining -= amount
        winner.remaining -= amount
      }
    }
  }

  return settlements
})

// Check if round is complete (all players have played all 18 holes)
const roundComplete = computed(() => {
  if (players.value.length === 0) return false
  return players.value.every(player => {
    const entry = leaderboard.value.find(e => e.player?.id === player.id)
    return entry?.holesPlayed >= 18
  })
})

// Side bets
const sideBets = computed(() => {
  return sideBetsStore.sideBets.filter(b => !b.parent_bet_id)
})

// Helper functions for side bets (from original)
function getBetSegments(bet) {
  if (bet.game_type !== 'nassau') {
    return [{ key: 'overall', label: 'Match', status: bet.status }]
  }

  const format = bet.nassau_format || '6-6-6'
  const segs = []

  if (format === '6-6-6') {
    if (bet.status?.front) segs.push({ key: 'front', label: 'Front 6', status: bet.status.front })
    if (bet.status?.middle) segs.push({ key: 'middle', label: 'Middle 6', status: bet.status.middle })
    if (bet.status?.back) segs.push({ key: 'back', label: 'Back 6', status: bet.status.back })
  } else {
    if (bet.status?.front) segs.push({ key: 'front', label: 'Front 9', status: bet.status.front })
    if (bet.status?.back) segs.push({ key: 'back', label: 'Back 9', status: bet.status.back })
  }

  if (bet.status?.overall) segs.push({ key: 'overall', label: 'Overall', status: bet.status.overall })
  return segs
}

function getStatusDisplay(status) {
  if (!status) return { text: '-', class: 'text-gray-400' }
  const { diff, holesRemaining, closedOut, holesPlayed } = status

  if (holesPlayed === 0) return { text: 'Not started', class: 'text-gray-500' }

  if (closedOut) {
    return {
      text: `${Math.abs(diff)}&${holesRemaining}`,
      class: diff > 0 ? 'text-green-400' : 'text-red-400',
      resolved: true
    }
  }

  if (holesRemaining === 0) {
    if (diff === 0) return { text: 'HALVED', class: 'text-yellow-400', resolved: true }
    return {
      text: `${Math.abs(diff)} UP`,
      class: diff > 0 ? 'text-green-400' : 'text-red-400',
      resolved: true
    }
  }

  if (diff === 0) return { text: 'AS', class: 'text-gray-300' }

  return {
    text: `${Math.abs(diff)} ${diff > 0 ? 'UP' : 'DN'}`,
    class: diff > 0 ? 'text-green-400' : 'text-red-400'
  }
}

function getSegmentAmount(bet, segment) {
  if (segment === 'front') return bet.front_amount
  if (segment === 'middle') return bet.middle_amount
  if (segment === 'back') return bet.back_amount
  return bet.overall_amount
}

function canPress(status, segment, bet) {
  if (!status) return false
  const { diff, holesRemaining, closedOut } = status
  if (closedOut || holesRemaining === 0) return false
  if (diff >= 0) return false

  const holesDown = Math.abs(diff)
  return holesDown >= holesRemaining || holesDown >= 2
}

function getPressChain(bet, segment) {
  const chain = []
  let current = bet

  while (true) {
    const press = sideBetsStore.sideBets.find(
      b => b.parent_bet_id === current.id && b.segment === segment
    )
    if (!press) break
    chain.push(press)
    current = press
  }

  return chain
}

function startPress(bet, segment) {
  pressingBet.value = bet
  pressingSegment.value = segment
  showPressModal.value = true
}

async function confirmPress() {
  if (!pressingBet.value || !pressingSegment.value) return

  try {
    await sideBetsStore.createPress(pressingBet.value.id, {
      segment: pressingSegment.value,
      start_hole: props.currentHole,
      amount: getSegmentAmount(pressingBet.value, pressingSegment.value)
    })
    await sideBetsStore.fetchSideBets(props.tournamentId)
  } catch (err) {
    console.error('Failed to create press:', err)
  }

  showPressModal.value = false
  pressingBet.value = null
  pressingSegment.value = null
}

function formatMoney(amount) {
  if (!amount) return '$0'
  return `$${amount}`
}
</script>

<template>
  <div class="bet-tracker">
    <!-- Header -->
    <div class="header">
      <h3>Money Tracker</h3>
      <button @click="emit('close')" class="close-btn">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button
        @click="activeTab = 'round'"
        :class="['tab', { active: activeTab === 'round' }]"
      >
        Round Money
      </button>
      <button
        @click="activeTab = 'sidebets'"
        :class="['tab', { active: activeTab === 'sidebets' }]"
      >
        Side Bets
        <span v-if="sideBets.length > 0" class="badge">{{ sideBets.length }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <!-- Round Money Tab -->
    <div v-else-if="activeTab === 'round'" class="tab-content">
      <div v-if="!hasMainBet" class="empty">
        <p>No money on this round</p>
        <p class="hint">Set up bets when creating a new round</p>
      </div>

      <div v-else class="round-money">
        <!-- Nassau Standings -->
        <div v-if="isNassau" class="nassau-section">
          <div class="section-header">
            <span class="section-title">Nassau {{ nassauFormat }}</span>
            <span class="section-subtitle">
              {{ formatMoney(tournament.nassau_segment_bet) }} per segment / {{ formatMoney(tournament.nassau_overall_bet) }} overall
            </span>
          </div>

          <div v-for="segment in segments" :key="segment.key" class="segment-card">
            <div class="segment-header" :class="{
              active: isSegmentActive(segment),
              complete: isSegmentComplete(segment)
            }">
              <span class="segment-name">{{ segment.label }}</span>
              <span class="segment-bet">{{ formatMoney(getSegmentBetAmount(segment)) }}</span>
              <span v-if="isSegmentActive(segment)" class="segment-status-badge active">LIVE</span>
              <span v-else-if="isSegmentComplete(segment)" class="segment-status-badge complete">FINAL</span>
              <span v-else class="segment-status-badge upcoming">UPCOMING</span>
            </div>

            <div class="standings-list">
              <div
                v-for="(standing, idx) in getSegmentStandings(segment)"
                :key="standing.player.id"
                class="standing-row"
                :class="{ leader: idx === 0 && standing.holesPlayed > 0 }"
              >
                <span class="standing-pos">{{ idx + 1 }}</span>
                <span class="standing-name">{{ standing.player.name }}</span>
                <span class="standing-score" :class="{
                  'text-green-400': standing.net < 0,
                  'text-red-400': standing.net > 0,
                  'text-gray-400': standing.holesPlayed === 0
                }">
                  {{ standing.display }}
                </span>
                <span class="standing-thru">
                  {{ standing.holesPlayed > 0 ? `${standing.holesPlayed}/${standing.totalHoles}` : '-' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Team Game Standings (Best Ball, Scramble) -->
        <div v-if="isTeamGame && teamStandings.length > 0" class="team-standings-section">
          <div class="section-header">
            <span class="section-title">{{ tournament.game_type === 'best_ball' ? 'Best Ball' : tournament.game_type === 'scramble' ? 'Scramble' : 'Team' }} Standings</span>
            <span class="section-subtitle">{{ payoutConfig ? formatMoney(payoutConfig.totalPot) + ' pot' : 'Net scores' }}</span>
          </div>

          <div class="team-standings-list">
            <div
              v-for="(team, idx) in teamStandings"
              :key="team.teamId"
              class="team-standing-row"
              :class="{ leader: idx === 0 && team.holesPlayed > 0 }"
            >
              <span class="standing-pos">{{ idx + 1 }}</span>
              <div class="team-info">
                <span class="team-name">{{ team.teamName }}</span>
                <span class="team-players">{{ team.players.length }} players</span>
              </div>
              <span class="standing-score" :class="{
                'text-green-400': team.toPar < 0,
                'text-red-400': team.toPar > 0,
                'text-gray-400': team.holesPlayed === 0
              }">
                {{ team.display }}
              </span>
              <span class="standing-thru">
                {{ team.holesPlayed > 0 ? `thru ${team.holesPlayed}` : '-' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Stroke Play / Simple Bet (non-team games) -->
        <div v-else-if="tournament.bet_amount > 0 && !isTeamGame" class="simple-bet-section">
          <div class="section-header">
            <span class="section-title">{{ tournament.game_type === 'stroke_play' ? 'Stroke Play' : tournament.game_type }}</span>
            <span class="section-subtitle">{{ formatMoney(tournament.bet_amount) }} on the line</span>
          </div>

          <div class="standings-list">
            <div
              v-for="(standing, idx) in getSegmentStandings({ start: 1, end: 18 })"
              :key="standing.player.id"
              class="standing-row"
              :class="{ leader: idx === 0 && standing.holesPlayed > 0 }"
            >
              <span class="standing-pos">{{ idx + 1 }}</span>
              <span class="standing-name">{{ standing.player.name }}</span>
              <span class="standing-score" :class="{
                'text-green-400': standing.net < 0,
                'text-red-400': standing.net > 0,
                'text-gray-400': standing.holesPlayed === 0
              }">
                {{ standing.display }}
              </span>
              <span class="standing-thru">
                {{ standing.holesPlayed > 0 ? `thru ${standing.holesPlayed}` : '-' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Custom Payouts with Projected Winners -->
        <div v-if="payoutConfig" class="payouts-section">
          <div class="section-header">
            <span class="section-title">Prize Pool</span>
            <span class="section-subtitle">Total pot: {{ formatMoney(payoutConfig.totalPot) }} ({{ players.length }} × {{ formatMoney(payoutConfig.entryFee) }})</span>
          </div>

          <!-- Team Prizes with projected winners -->
          <div v-if="payoutConfig.teamPayouts?.length && isTeamGame" class="payout-group">
            <div class="payout-label">Team Prizes</div>
            <div v-for="projected in projectedTeamPayouts" :key="projected.place" class="payout-row projected">
              <div class="payout-place-info">
                <span class="place-label">{{ projected.place === 1 ? '1st' : projected.place === 2 ? '2nd' : projected.place === 3 ? '3rd' : projected.place + 'th' }}</span>
                <span class="projected-winner" :class="{ 'text-green-400': projected.team?.holesPlayed > 0 }">
                  {{ projected.teamName }}
                </span>
              </div>
              <span class="text-gold payout-amount">{{ formatMoney(projected.amount) }}</span>
            </div>
          </div>

          <!-- Non-team game team payouts (fallback) -->
          <div v-else-if="payoutConfig.teamPayouts?.length" class="payout-group">
            <div class="payout-label">Team Prizes</div>
            <div v-for="payout in payoutConfig.teamPayouts" :key="payout.place" class="payout-row">
              <span>{{ payout.place === 1 ? '1st' : payout.place === 2 ? '2nd' : payout.place + 'th' }} Place</span>
              <span class="text-gold">{{ formatMoney(payout.amount) }}</span>
            </div>
          </div>

          <!-- Individual Prizes with projected winners -->
          <div v-if="payoutConfig.individualPayouts?.length" class="payout-group">
            <div class="payout-label">Individual Prizes</div>
            <div v-for="projected in projectedIndividualPayouts" :key="projected.place" class="payout-row projected">
              <div class="payout-place-info">
                <span class="place-label">{{ projected.place === 1 ? '1st' : projected.place === 2 ? '2nd' : projected.place === 3 ? '3rd' : projected.place + 'th' }}</span>
                <span class="projected-winner" :class="{ 'text-green-400': projected.player }">
                  {{ projected.playerName }}
                </span>
              </div>
              <span class="text-gold payout-amount">{{ formatMoney(projected.amount) }}</span>
            </div>
          </div>

          <!-- Greenie Pot -->
          <div v-if="payoutConfig.greeniePot" class="payout-group">
            <div class="payout-label">Greenie Pot</div>
            <div class="payout-row">
              <span>Split among winners</span>
              <span class="text-gold">{{ formatMoney(payoutConfig.greeniePot) }}</span>
            </div>
          </div>

          <!-- Settlement Section -->
          <div v-if="simplifiedSettlements.length > 0" class="settlement-section">
            <div class="settlement-header">
              <span class="settlement-title">{{ roundComplete ? 'Final Settlement' : 'Projected Settlement' }}</span>
              <span v-if="!roundComplete" class="settlement-note">Based on current standings</span>
            </div>

            <div class="settlement-list">
              <div v-for="(settlement, idx) in simplifiedSettlements" :key="idx" class="settlement-row">
                <span class="settlement-from">{{ settlement.from.name }}</span>
                <span class="settlement-arrow">→</span>
                <span class="settlement-to">{{ settlement.to.name }}</span>
                <span class="settlement-amount">{{ formatMoney(settlement.amount) }}</span>
              </div>
            </div>

            <!-- Player Net Summary -->
            <div class="net-summary">
              <div class="net-summary-title">Net Result by Player</div>
              <div v-for="result in finalSettlements" :key="result.player.id" class="net-row">
                <span class="net-player">{{ result.player.name }}</span>
                <span :class="['net-amount', result.net > 0 ? 'text-green-400' : result.net < 0 ? 'text-red-400' : 'text-gray-400']">
                  {{ result.net >= 0 ? '+' : '' }}{{ formatMoney(result.net) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Greenies -->
        <div v-if="tournament.greenie_amount > 0 && greenies.length > 0" class="greenies-section">
          <div class="section-header">
            <span class="section-title">Greenies</span>
            <span class="section-subtitle">{{ formatMoney(tournament.greenie_amount) }} each</span>
          </div>

          <div class="greenies-grid">
            <div v-for="g in greenies" :key="g.holeNumber" class="greenie-card">
              <div class="greenie-hole">Hole {{ g.holeNumber }}</div>
              <div v-if="g.winner" class="greenie-winner">
                {{ g.winner.name }}
                <span v-if="g.distance" class="greenie-distance">{{ g.distance }}'</span>
              </div>
              <div v-else class="greenie-pending">-</div>
            </div>
          </div>
        </div>

        <!-- Skins -->
        <div v-if="isSkins && skinsResults.length > 0" class="skins-section">
          <div class="section-header">
            <span class="section-title">Skins</span>
            <span class="section-subtitle">{{ formatMoney(tournament.skins_amount) }} per skin</span>
          </div>

          <div class="skins-list">
            <div v-for="skin in skinsResults.filter(s => s.winner)" :key="skin.hole" class="skin-row">
              <span class="skin-hole">H{{ skin.hole }}</span>
              <span class="skin-winner">{{ skin.winner.name }}</span>
              <span class="skin-count">{{ skin.skins }} skin{{ skin.skins > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Side Bets Tab -->
    <div v-else-if="activeTab === 'sidebets'" class="tab-content">
      <div v-if="sideBets.length === 0" class="empty">
        <p>No side bets</p>
        <p class="hint">Add head-to-head bets from the leaderboard</p>
      </div>

      <div v-else class="sidebets-list">
        <div v-for="bet in sideBets" :key="bet.id" class="sidebet-card">
          <div class="sidebet-header">
            <div class="sidebet-parties">
              <span class="party1">{{ bet.party1_name || 'Party 1' }}</span>
              <span class="vs">vs</span>
              <span class="party2">{{ bet.party2_name || 'Party 2' }}</span>
            </div>
            <div class="sidebet-type">
              {{ bet.game_type === 'nassau' ? `Nassau ${bet.nassau_format || '6-6-6'}` : bet.game_type }}
            </div>
          </div>

          <div class="sidebet-segments">
            <div v-for="segment in getBetSegments(bet)" :key="segment.key" class="sidebet-segment">
              <div class="segment-info">
                <span class="segment-label">{{ segment.label }}</span>
                <span class="segment-amount">{{ formatMoney(getSegmentAmount(bet, segment.key)) }}</span>
              </div>
              <div class="segment-status">
                <span :class="['status-text', getStatusDisplay(segment.status).class]">
                  {{ getStatusDisplay(segment.status).text }}
                </span>
              </div>
              <div class="segment-action">
                <button
                  v-if="canPress(segment.status, segment.key, bet)"
                  @click="startPress(bet, segment.key)"
                  class="press-btn"
                >
                  PRESS
                </button>
                <span v-else-if="getStatusDisplay(segment.status).resolved" class="final-badge">FINAL</span>
              </div>

              <!-- Press chain -->
              <div v-for="(press, pIdx) in getPressChain(bet, segment.key)" :key="press.id" class="press-row">
                <span class="press-label">Press #{{ pIdx + 1 }} (H{{ press.start_hole }})</span>
                <span :class="['status-text', getStatusDisplay(press.status?.[segment.key] || press.status).class]">
                  {{ getStatusDisplay(press.status?.[segment.key] || press.status).text }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Press Modal -->
    <div v-if="showPressModal" class="modal-overlay" @click.self="showPressModal = false">
      <div class="modal-content">
        <h4>Confirm Press</h4>
        <p>Press the <strong>{{ pressingSegment }}</strong> starting at hole <strong>{{ currentHole }}</strong></p>
        <p class="press-amount">Amount: <strong>{{ formatMoney(getSegmentAmount(pressingBet, pressingSegment)) }}</strong></p>
        <div class="modal-actions">
          <button @click="showPressModal = false" class="btn-cancel">Cancel</button>
          <button @click="confirmPress" class="btn-confirm">Press It!</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bet-tracker {
  background: #1f2937;
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #374151;
  background: #111827;
}

.header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.25rem;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #374151;
}

.tab {
  flex: 1;
  padding: 0.75rem;
  background: none;
  border: none;
  color: #9ca3af;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab.active {
  color: #10b981;
  border-bottom-color: #10b981;
}

.badge {
  background: #10b981;
  color: white;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
}

.loading, .empty {
  padding: 3rem 1.5rem;
  text-align: center;
  color: #9ca3af;
}

.empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
  opacity: 0.7;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

/* Section styles */
.section-header {
  margin-bottom: 0.75rem;
}

.section-title {
  display: block;
  font-size: 1rem;
  font-weight: 700;
  color: #f3f4f6;
}

.section-subtitle {
  font-size: 0.8rem;
  color: #9ca3af;
}

/* Segment cards */
.segment-card {
  background: #111827;
  border-radius: 12px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.segment-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #374151;
}

.segment-header.active {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.segment-header.complete {
  background: #4b5563;
}

.segment-name {
  font-weight: 600;
  flex: 1;
}

.segment-bet {
  color: #fbbf24;
  font-weight: 600;
}

.segment-status-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.segment-status-badge.active {
  background: rgba(255,255,255,0.2);
}

.segment-status-badge.complete {
  background: rgba(156, 163, 175, 0.3);
  color: #9ca3af;
}

.segment-status-badge.upcoming {
  background: rgba(156, 163, 175, 0.2);
  color: #6b7280;
}

/* Standings */
.standings-list {
  padding: 0.5rem;
}

.standing-row {
  display: grid;
  grid-template-columns: 2rem 1fr auto 3rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
}

.standing-row.leader {
  background: rgba(16, 185, 129, 0.15);
}

.standing-pos {
  font-weight: 700;
  color: #9ca3af;
  text-align: center;
}

.standing-row.leader .standing-pos {
  color: #10b981;
}

.standing-name {
  font-weight: 500;
}

.standing-score {
  font-weight: 700;
  font-size: 1.1rem;
  text-align: right;
}

.standing-thru {
  font-size: 0.75rem;
  color: #6b7280;
  text-align: right;
}

/* Team standings section */
.team-standings-section {
  background: #111827;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.team-standings-list {
  margin-top: 0.5rem;
}

.team-standing-row {
  display: grid;
  grid-template-columns: 2rem 1fr auto 3.5rem;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  border-radius: 6px;
  border-bottom: 1px solid #374151;
}

.team-standing-row:last-child {
  border-bottom: none;
}

.team-standing-row.leader {
  background: rgba(16, 185, 129, 0.15);
}

.team-standing-row.leader .standing-pos {
  color: #10b981;
}

.team-info {
  display: flex;
  flex-direction: column;
}

.team-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.team-players {
  font-size: 0.7rem;
  color: #6b7280;
}

/* Simple bet section */
.simple-bet-section {
  background: #111827;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

/* Payouts */
.payouts-section {
  background: #111827;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.payout-group {
  margin-top: 0.75rem;
}

.payout-label {
  font-size: 0.8rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.payout-row {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
  border-bottom: 1px solid #374151;
}

.payout-row:last-child {
  border-bottom: none;
}

.payout-row.projected {
  align-items: center;
  padding: 0.6rem 0;
}

.payout-place-info {
  display: flex;
  flex-direction: column;
}

.place-label {
  font-weight: 600;
  font-size: 0.85rem;
}

.projected-winner {
  font-size: 0.75rem;
  color: #9ca3af;
}

.payout-amount {
  font-size: 1.1rem;
}

.text-gold {
  color: #fbbf24;
  font-weight: 600;
}

/* Settlement section */
.settlement-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #374151;
}

.settlement-header {
  margin-bottom: 0.75rem;
}

.settlement-title {
  font-weight: 700;
  font-size: 1rem;
  display: block;
}

.settlement-note {
  font-size: 0.75rem;
  color: #9ca3af;
}

.settlement-list {
  background: #1f2937;
  border-radius: 8px;
  padding: 0.5rem;
}

.settlement-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-bottom: 1px solid #374151;
}

.settlement-row:last-child {
  border-bottom: none;
}

.settlement-from {
  color: #f87171;
  font-weight: 500;
  flex: 1;
}

.settlement-arrow {
  color: #6b7280;
}

.settlement-to {
  color: #4ade80;
  font-weight: 500;
  flex: 1;
}

.settlement-amount {
  color: #fbbf24;
  font-weight: 700;
  font-size: 1rem;
}

.net-summary {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #1f2937;
  border-radius: 8px;
}

.net-summary-title {
  font-size: 0.75rem;
  color: #9ca3af;
  margin-bottom: 0.5rem;
}

.net-row {
  display: flex;
  justify-content: space-between;
  padding: 0.35rem 0;
}

.net-player {
  font-weight: 500;
  font-size: 0.9rem;
}

.net-amount {
  font-weight: 700;
  font-size: 0.9rem;
}

/* Greenies */
.greenies-section {
  margin-bottom: 1rem;
}

.greenies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
}

.greenie-card {
  background: #111827;
  border-radius: 8px;
  padding: 0.5rem;
  text-align: center;
}

.greenie-hole {
  font-size: 0.7rem;
  color: #9ca3af;
}

.greenie-winner {
  font-size: 0.8rem;
  font-weight: 600;
  color: #10b981;
}

.greenie-distance {
  font-size: 0.7rem;
  color: #6b7280;
}

.greenie-pending {
  color: #6b7280;
}

/* Skins */
.skins-section {
  margin-bottom: 1rem;
}

.skins-list {
  background: #111827;
  border-radius: 8px;
  padding: 0.5rem;
}

.skin-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-bottom: 1px solid #374151;
}

.skin-row:last-child {
  border-bottom: none;
}

.skin-hole {
  font-weight: 600;
  color: #9ca3af;
  width: 2.5rem;
}

.skin-winner {
  flex: 1;
}

.skin-count {
  color: #fbbf24;
  font-weight: 600;
}

/* Side bets */
.sidebets-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sidebet-card {
  background: #111827;
  border-radius: 12px;
  overflow: hidden;
}

.sidebet-header {
  padding: 0.75rem 1rem;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.sidebet-parties {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.vs {
  font-size: 0.75rem;
  opacity: 0.8;
}

.sidebet-type {
  font-size: 0.75rem;
  opacity: 0.9;
}

.sidebet-segments {
  padding: 0.5rem;
}

.sidebet-segment {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: #1f2937;
  border-radius: 6px;
  margin-bottom: 0.25rem;
}

.segment-info {
  display: flex;
  flex-direction: column;
}

.segment-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.segment-amount {
  font-size: 0.75rem;
  color: #fbbf24;
}

.status-text {
  font-weight: 700;
  font-size: 1rem;
}

.press-btn {
  padding: 0.35rem 0.75rem;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}

.final-badge {
  font-size: 0.65rem;
  color: #6b7280;
  background: #374151;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.press-row {
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0.5rem;
  margin-left: 1rem;
  background: #374151;
  border-radius: 4px;
  font-size: 0.85rem;
}

.press-label {
  color: #10b981;
  font-size: 0.75rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: #1f2937;
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 320px;
  width: 100%;
  text-align: center;
}

.modal-content h4 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}

.press-amount {
  font-size: 1.25rem;
  margin: 1rem 0;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-cancel, .btn-confirm {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-cancel {
  background: #374151;
  color: #f3f4f6;
}

.btn-confirm {
  background: #10b981;
  color: white;
}
</style>
