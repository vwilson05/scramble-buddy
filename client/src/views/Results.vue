<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCalcuttaStore } from '../stores/calcutta'
import { useCourseStore } from '../stores/course'
import { downloadResultsPDF, getResultsPDFBase64 } from '../utils/pdfGenerator'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const store = useTournamentStore()
const calcuttaStore = useCalcuttaStore()
const courseStore = useCourseStore()

const tournamentId = computed(() => route.params.id)
const leaderboardData = ref(null)
const showConfetti = ref(false)
const showEmailModal = ref(false)
const emailAddress = ref('')
const emailSending = ref(false)
const emailSent = ref(false)
const emailError = ref('')
const expandedTeam = ref(null)
const showNet = ref(true)

onMounted(async () => {
  await store.fetchTournament(tournamentId.value)
  leaderboardData.value = await store.fetchLeaderboard(tournamentId.value)

  // Load course data for scorecard display
  if (store.currentTournament?.course_id) {
    await courseStore.selectCourse({ id: store.currentTournament.course_id })
  }

  // Fetch Calcutta results
  await calcuttaStore.fetchCalcutta(tournamentId.value)
  if (calcuttaStore.config?.enabled) {
    await calcuttaStore.fetchResults(tournamentId.value)
  }

  // Show confetti animation
  setTimeout(() => { showConfetti.value = true }, 500)
})

const calcuttaEnabled = computed(() => calcuttaStore.config?.enabled)
const calcuttaResults = computed(() => calcuttaStore.results)

// Check if this is a team game
const isTeamGame = computed(() => {
  return ['scramble', 'best_ball', 'high_low'].includes(store.currentTournament?.game_type)
})

// Get payout configuration
const payoutConfig = computed(() => {
  if (!store.currentTournament?.payout_config) return null
  return typeof store.currentTournament.payout_config === 'string'
    ? JSON.parse(store.currentTournament.payout_config)
    : store.currentTournament.payout_config
})

function formatMoney(amount) {
  if (amount === undefined || amount === null) return '$0'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function getPlaceSuffix(place) {
  if (place === 1) return 'st'
  if (place === 2) return 'nd'
  if (place === 3) return 'rd'
  return 'th'
}

// Raw leaderboard from server
const rawLeaderboard = computed(() => {
  return leaderboardData.value?.leaderboard || []
})

// Team standings for team games (sorted by net)
const teamStandings = computed(() => {
  if (!isTeamGame.value) return []

  // Server already returns team entries for team games
  // Sort by net total
  return [...rawLeaderboard.value].sort((a, b) => {
    return (a.netTotal || a.grossTotal) - (b.netTotal || b.grossTotal)
  })
})

// Calculate team stats by aggregating individual player stats
function getTeamStats(entry) {
  if (!entry.players || entry.players.length === 0) {
    return { birdies: 0, pars: 0, bogeys: 0, doubles: 0 }
  }

  // Aggregate stats from all team members
  const stats = { birdies: 0, pars: 0, bogeys: 0, doubles: 0 }
  entry.players.forEach(playerEntry => {
    if (playerEntry.stats) {
      stats.birdies += playerEntry.stats.birdies || 0
      stats.pars += playerEntry.stats.pars || 0
      stats.bogeys += playerEntry.stats.bogeys || 0
      stats.doubles += playerEntry.stats.doubles || 0
    }
  })
  return stats
}

// Get team name from players
function getTeamName(entry) {
  if (entry.player?.name) return entry.player.name
  if (entry.players?.length) {
    return entry.players.map(p => p.player?.name).join(' & ')
  }
  return `Team ${entry.team}`
}

// Toggle team expansion
function toggleTeam(teamId) {
  expandedTeam.value = expandedTeam.value === teamId ? null : teamId
}

// Final leaderboard (use team standings for team games)
const leaderboard = computed(() => {
  if (isTeamGame.value) {
    return teamStandings.value
  }
  // For individual games, sort by net
  return [...rawLeaderboard.value].sort((a, b) => {
    return (a.netTotal || a.grossTotal) - (b.netTotal || b.grossTotal)
  })
})

const winner = computed(() => {
  return leaderboard.value?.[0]
})

const settlements = computed(() => {
  return leaderboardData.value?.settlements || []
})

const greeniesWinners = computed(() => {
  return rawLeaderboard.value.filter(p => p.greeniesWon)
})

// Calculate winner prize from payout config
const winnerPrize = computed(() => {
  if (payoutConfig.value?.teamPayouts?.length && isTeamGame.value) {
    return payoutConfig.value.teamPayouts[0]?.amount || 0
  }
  if (payoutConfig.value?.individualPayouts?.length) {
    return payoutConfig.value.individualPayouts[0]?.amount || 0
  }
  // Fallback to old calculation
  const main = (store.currentTournament?.bet_amount || 0) * (store.players.length - 1)
  return main
})

// Calculate final settlements for team games
const teamSettlements = computed(() => {
  if (!payoutConfig.value || !isTeamGame.value || teamStandings.value.length === 0) return []

  const entryFee = payoutConfig.value.entryFee || 0
  const playerNetResults = {}

  // Initialize all players with -entryFee
  store.players.forEach(player => {
    playerNetResults[player.id] = {
      player,
      paid: entryFee,
      won: 0,
      net: -entryFee
    }
  })

  // Add team prize winnings
  if (payoutConfig.value.teamPayouts?.length) {
    payoutConfig.value.teamPayouts.forEach((payout, idx) => {
      const team = teamStandings.value[idx]
      if (team?.players?.length > 0) {
        const perPlayer = payout.amount / team.players.length
        team.players.forEach(playerEntry => {
          const playerId = playerEntry.player?.id
          if (playerId && playerNetResults[playerId]) {
            playerNetResults[playerId].won += perPlayer
            playerNetResults[playerId].net += perPlayer
          }
        })
      }
    })
  }

  // Add individual prizes
  if (payoutConfig.value.individualPayouts?.length) {
    // Sort individual standings by net
    const individualStandings = [...rawLeaderboard.value]
      .filter(e => e.player?.id)
      .sort((a, b) => (a.netTotal || a.grossTotal) - (b.netTotal || b.grossTotal))

    payoutConfig.value.individualPayouts.forEach((payout, idx) => {
      const entry = individualStandings[idx]
      if (entry?.player?.id && playerNetResults[entry.player.id]) {
        playerNetResults[entry.player.id].won += payout.amount
        playerNetResults[entry.player.id].net += payout.amount
      }
    })
  }

  // Generate simplified settlements
  const results = Object.values(playerNetResults)
  const winners = results.filter(r => r.net > 0)
  const losers = results.filter(r => r.net < 0)
  const settlementsList = []

  const winnerBalances = winners.map(w => ({ ...w, remaining: w.net }))
  const loserBalances = losers.map(l => ({ ...l, remaining: Math.abs(l.net) }))

  for (const loser of loserBalances) {
    for (const winner of winnerBalances) {
      if (loser.remaining <= 0) break
      if (winner.remaining <= 0) continue

      const amount = Math.min(loser.remaining, winner.remaining)
      if (amount > 0) {
        settlementsList.push({
          from: loser.player.name,
          to: winner.player.name,
          amount: Math.round(amount * 100) / 100
        })
        loser.remaining -= amount
        winner.remaining -= amount
      }
    }
  }

  return settlementsList
})

// Use team settlements if available, otherwise use server settlements
const finalSettlements = computed(() => {
  if (isTeamGame.value && payoutConfig.value && teamSettlements.value.length > 0) {
    return teamSettlements.value
  }
  return settlements.value
})

// Score styling helper
function getScoreClass(strokes, par) {
  if (!strokes) return 'text-gray-500'
  const diff = strokes - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  return 'score-double'
}

function shareResults() {
  const text = `${store.currentTournament?.name} Results\n\n` +
    leaderboard.value.map((p, i) =>
      `${i + 1}. ${p.player?.name}: ${p.grossTotal} (${p.toPar >= 0 ? '+' : ''}${p.toPar})`
    ).join('\n')

  if (navigator.share) {
    navigator.share({
      title: '18Eagles Results',
      text
    })
  } else {
    navigator.clipboard.writeText(text)
    alert('Results copied to clipboard!')
  }
}

function downloadPDF() {
  downloadResultsPDF(
    store.currentTournament,
    store.players,
    leaderboard.value,
    settlements.value,
    greeniesWinners.value
  )
}

function openEmailModal() {
  showEmailModal.value = true
  emailSent.value = false
  emailError.value = ''
}

async function sendEmail() {
  if (!emailAddress.value) {
    emailError.value = 'Please enter an email address'
    return
  }

  emailSending.value = true
  emailError.value = ''

  try {
    const pdfBase64 = getResultsPDFBase64(
      store.currentTournament,
      store.players,
      leaderboard.value,
      settlements.value,
      greeniesWinners.value
    )

    const response = await axios.post('/api/email/send-results', {
      email: emailAddress.value,
      pdfBase64,
      tournamentName: store.currentTournament?.name
    })

    emailSent.value = true
    setTimeout(() => {
      showEmailModal.value = false
      emailAddress.value = ''
    }, 2000)
  } catch (err) {
    emailError.value = err.response?.data?.error || 'Failed to send email. Try downloading the PDF instead.'
  } finally {
    emailSending.value = false
  }
}

function newRound() {
  router.push('/setup')
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen p-4 pb-24">
    <!-- Confetti Animation (CSS only) -->
    <div v-if="showConfetti" class="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <div v-for="i in 50" :key="i" class="confetti" :style="{ left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 3}s` }"></div>
    </div>

    <!-- Header -->
    <div class="text-center py-8">
      <h1 class="text-3xl font-bold mb-2">Round Complete!</h1>
      <p class="text-gray-400">{{ store.currentTournament?.name }}</p>
      <p class="text-sm text-gray-500">{{ store.currentTournament?.course_name }}</p>
    </div>

    <!-- Winner Card -->
    <div v-if="winner" class="card border-gold bg-gold/10 text-center mb-8 animate-slide-up">
      <div class="text-6xl mb-4">
        <svg class="w-16 h-16 mx-auto text-gold" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      </div>
      <div class="text-2xl font-bold text-gold mb-1">
        {{ getTeamName(winner) }}
      </div>
      <div class="text-4xl font-bold mb-2">
        {{ winner.netTotal || winner.grossTotal }}
        <span class="text-lg text-gray-400 font-normal">net</span>
      </div>
      <div :class="['text-lg', (winner.toParNet ?? winner.toPar) < 0 ? 'text-golf-green' : (winner.toParNet ?? winner.toPar) > 0 ? 'text-red-400' : 'text-gray-400']">
        {{ (winner.toParNet ?? winner.toPar) === 0 ? 'Even Par' : (winner.toParNet ?? winner.toPar) > 0 ? `+${winner.toParNet ?? winner.toPar}` : `${winner.toParNet ?? winner.toPar}` }}
      </div>
      <div v-if="winnerPrize" class="mt-4 pt-4 border-t border-gold/30">
        <span class="text-gold text-xl font-bold">Wins {{ formatMoney(winnerPrize) }}</span>
      </div>
    </div>

    <!-- Full Leaderboard -->
    <div class="mb-8">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">Final Standings</h2>
        <!-- Gross/Net Toggle -->
        <div class="flex bg-gray-800 rounded-lg p-1">
          <button
            @click="showNet = false"
            :class="[
              'px-3 py-1 rounded text-sm font-medium transition-all',
              !showNet ? 'bg-golf-green text-white' : 'text-gray-400'
            ]"
          >
            Gross
          </button>
          <button
            @click="showNet = true"
            :class="[
              'px-3 py-1 rounded text-sm font-medium transition-all',
              showNet ? 'bg-golf-green text-white' : 'text-gray-400'
            ]"
          >
            Net
          </button>
        </div>
      </div>
      <div class="space-y-2">
        <div
          v-for="(entry, index) in leaderboard"
          :key="entry.player?.id || entry.team"
          class="card"
        >
          <!-- Main row - clickable for teams -->
          <div
            class="flex items-center gap-4"
            :class="{ 'cursor-pointer': isTeamGame && entry.players?.length }"
            @click="isTeamGame && entry.players?.length && toggleTeam(entry.team)"
          >
            <div :class="[
              'w-10 h-10 rounded-full flex items-center justify-center font-bold',
              index === 0 ? 'bg-gold text-dark' :
              index === 1 ? 'bg-gray-400 text-dark' :
              index === 2 ? 'bg-orange-600 text-white' :
              'bg-gray-700'
            ]">
              {{ index + 1 }}
            </div>
            <div class="flex-1">
              <div class="font-semibold flex items-center gap-2">
                {{ getTeamName(entry) }}
                <!-- Expand indicator for teams -->
                <svg
                  v-if="isTeamGame && entry.players?.length"
                  :class="['w-4 h-4 text-gray-500 transition-transform', expandedTeam === entry.team ? 'rotate-180' : '']"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div class="text-xs text-gray-400">
                <template v-if="isTeamGame && entry.players?.length">
                  {{ getTeamStats(entry).birdies }} birdies, {{ getTeamStats(entry).pars }} pars
                </template>
                <template v-else>
                  {{ entry.stats?.birdies || 0 }} birdies, {{ entry.stats?.pars || 0 }} pars
                </template>
              </div>
            </div>
            <div class="text-right">
              <div class="font-bold text-xl">{{ showNet ? (entry.netTotal || entry.grossTotal) : entry.grossTotal }}</div>
              <div :class="['text-sm', (showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar) < 0 ? 'text-golf-green' : (showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar) > 0 ? 'text-red-400' : 'text-gray-400']">
                {{ (showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar) === 0 ? 'E' : (showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar) > 0 ? `+${showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar}` : (showNet ? (entry.toParNet ?? entry.toPar) : entry.toPar) }}
                <span class="text-gray-500 ml-1">{{ showNet ? 'net' : 'gross' }}</span>
              </div>
            </div>
          </div>

          <!-- Expanded Team Scorecards -->
          <Transition name="accordion">
            <div v-if="isTeamGame && expandedTeam === entry.team && entry.players?.length" class="mt-4 pt-4 border-t border-gray-700/50">
              <div v-for="(playerEntry, playerIndex) in entry.players" :key="playerEntry.player?.id" :class="['mb-6', playerIndex > 0 ? 'pt-4 border-t border-gray-700/30' : '']">
                <!-- Player Header -->
                <div class="flex items-center justify-between mb-3">
                  <div class="font-semibold text-sm">
                    {{ playerEntry.player?.name }}
                    <span v-if="playerEntry.player?.courseHandicap !== undefined" class="text-xs text-gray-400 ml-2">
                      ({{ playerEntry.player.displayHandicap ?? playerEntry.player.courseHandicap }} strokes)
                    </span>
                  </div>
                  <div class="text-sm">
                    <span class="text-gray-400">{{ playerEntry.grossTotal }}</span>
                    <span v-if="showNet" class="text-golf-green ml-2">{{ playerEntry.netTotal }} net</span>
                  </div>
                </div>

                <!-- Front 9 -->
                <div class="mb-3">
                  <div class="text-xs text-gray-500 mb-1">FRONT 9</div>
                  <div class="flex gap-1">
                    <div class="flex-1 text-center text-xs text-gray-500">Hole</div>
                    <div v-for="hole in 9" :key="hole" class="w-7 text-center text-xs text-gray-500">{{ hole }}</div>
                    <div class="w-10 text-center text-xs text-gray-500">OUT</div>
                  </div>
                  <div class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs text-gray-400">Par</div>
                    <div v-for="hole in 9" :key="'par-' + hole" class="w-7 text-center text-xs text-gray-400">
                      {{ playerEntry.holeScores?.[hole - 1]?.par || 4 }}
                    </div>
                    <div class="w-10 text-center text-xs text-gray-400 font-semibold">
                      {{ playerEntry.holeScores?.slice(0, 9).reduce((s, h) => s + (h?.par || 4), 0) }}
                    </div>
                  </div>
                  <div class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs font-semibold">Score</div>
                    <div
                      v-for="hole in 9"
                      :key="'score-' + hole"
                      :class="['w-7 h-7 text-center text-sm font-bold rounded flex items-center justify-center', getScoreClass(playerEntry.holeScores?.[hole - 1]?.gross, playerEntry.holeScores?.[hole - 1]?.par || 4)]"
                    >
                      {{ playerEntry.holeScores?.[hole - 1]?.gross || '-' }}
                    </div>
                    <div class="w-10 text-center text-sm font-bold bg-gray-700 rounded flex items-center justify-center">
                      {{ playerEntry.front9Gross || '-' }}
                    </div>
                  </div>
                  <div v-if="showNet" class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs text-golf-green">Net</div>
                    <div v-for="hole in 9" :key="'net-' + hole" class="w-7 text-center text-xs text-golf-green">
                      {{ playerEntry.holeScores?.[hole - 1]?.net || '-' }}
                      <span v-if="playerEntry.holeScores?.[hole - 1]?.strokes" class="text-yellow-500">*</span>
                    </div>
                    <div class="w-10 text-center text-xs text-golf-green font-semibold">
                      {{ playerEntry.front9Net || '-' }}
                    </div>
                  </div>
                </div>

                <!-- Back 9 -->
                <div>
                  <div class="text-xs text-gray-500 mb-1">BACK 9</div>
                  <div class="flex gap-1">
                    <div class="flex-1 text-center text-xs text-gray-500">Hole</div>
                    <div v-for="hole in 9" :key="hole + 9" class="w-7 text-center text-xs text-gray-500">{{ hole + 9 }}</div>
                    <div class="w-10 text-center text-xs text-gray-500">IN</div>
                  </div>
                  <div class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs text-gray-400">Par</div>
                    <div v-for="hole in 9" :key="'par-' + (hole + 9)" class="w-7 text-center text-xs text-gray-400">
                      {{ playerEntry.holeScores?.[hole + 8]?.par || 4 }}
                    </div>
                    <div class="w-10 text-center text-xs text-gray-400 font-semibold">
                      {{ playerEntry.holeScores?.slice(9, 18).reduce((s, h) => s + (h?.par || 4), 0) }}
                    </div>
                  </div>
                  <div class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs font-semibold">Score</div>
                    <div
                      v-for="hole in 9"
                      :key="'score-' + (hole + 9)"
                      :class="['w-7 h-7 text-center text-sm font-bold rounded flex items-center justify-center', getScoreClass(playerEntry.holeScores?.[hole + 8]?.gross, playerEntry.holeScores?.[hole + 8]?.par || 4)]"
                    >
                      {{ playerEntry.holeScores?.[hole + 8]?.gross || '-' }}
                    </div>
                    <div class="w-10 text-center text-sm font-bold bg-gray-700 rounded flex items-center justify-center">
                      {{ playerEntry.back9Gross || '-' }}
                    </div>
                  </div>
                  <div v-if="showNet" class="flex gap-1 mt-1">
                    <div class="flex-1 text-center text-xs text-golf-green">Net</div>
                    <div v-for="hole in 9" :key="'net-' + (hole + 9)" class="w-7 text-center text-xs text-golf-green">
                      {{ playerEntry.holeScores?.[hole + 8]?.net || '-' }}
                      <span v-if="playerEntry.holeScores?.[hole + 8]?.strokes" class="text-yellow-500">*</span>
                    </div>
                    <div class="w-10 text-center text-xs text-golf-green font-semibold">
                      {{ playerEntry.back9Net || '-' }}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Legend -->
              <div v-if="showNet" class="mt-2 text-xs text-gray-500 flex items-center gap-1">
                <span class="text-yellow-500">*</span> = stroke received
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Bet Settlement -->
    <div v-if="finalSettlements.length" class="mb-8">
      <h2 class="text-xl font-bold mb-4 text-gold">Settle Up</h2>
      <div class="card border-gold/30">
        <div class="space-y-3">
          <div
            v-for="(settlement, index) in finalSettlements"
            :key="index"
            class="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
          >
            <div class="flex items-center gap-2">
              <span class="text-red-400 font-medium">{{ settlement.from }}</span>
              <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              <span class="text-golf-green font-medium">{{ settlement.to }}</span>
            </div>
            <div class="text-xl font-bold text-gold">{{ formatMoney(settlement.amount) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Greenies Summary -->
    <div v-if="leaderboard.some(p => p.greeniesWon)" class="mb-8">
      <h2 class="text-xl font-bold mb-4">Greenies</h2>
      <div class="space-y-2">
        <div
          v-for="entry in leaderboard.filter(p => p.greeniesWon)"
          :key="entry.player?.id"
          class="card flex items-center justify-between"
        >
          <div class="flex items-center gap-3">
            <span class="text-2xl">
              <svg class="w-8 h-8 text-golf-green" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </span>
            <span class="font-semibold">{{ entry.player?.name }}</span>
          </div>
          <div class="text-golf-green font-bold">
            {{ entry.greeniesWon }} greenie{{ entry.greeniesWon > 1 ? 's' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Calcutta Results -->
    <div v-if="calcuttaEnabled && calcuttaResults?.payouts?.length" class="mb-8">
      <h2 class="text-xl font-bold mb-4 text-yellow-400">Calcutta Results</h2>
      <div class="card border-yellow-400/30 mb-4">
        <div class="text-center mb-4">
          <div class="text-sm text-gray-400">Total Pot</div>
          <div class="text-3xl font-bold text-yellow-400">{{ formatMoney(calcuttaResults.totalPot) }}</div>
        </div>
      </div>

      <div class="space-y-2">
        <div
          v-for="result in calcuttaResults.payouts"
          :key="result.teamNumber"
          class="card flex items-center gap-4"
          :class="{ 'border-yellow-400/50': result.payout > 0 }"
        >
          <div :class="[
            'w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm',
            result.place === 1 ? 'bg-yellow-400 text-dark' :
            result.place === 2 ? 'bg-gray-400 text-dark' :
            result.place === 3 ? 'bg-orange-600 text-white' :
            'bg-gray-700'
          ]">
            {{ result.place }}{{ getPlaceSuffix(result.place) }}
          </div>
          <div class="flex-1">
            <div class="font-semibold">{{ result.teamName }}</div>
            <div class="text-xs text-gray-400">
              Bought by <span class="text-white">{{ result.buyerName }}</span> for {{ formatMoney(result.purchaseAmount) }}
            </div>
          </div>
          <div class="text-right">
            <div v-if="result.payout > 0" class="font-bold text-lg text-yellow-400">
              {{ formatMoney(result.payout) }}
            </div>
            <div :class="['text-sm', result.profit > 0 ? 'text-golf-green' : result.profit < 0 ? 'text-red-400' : 'text-gray-400']">
              {{ result.profit >= 0 ? '+' : '' }}{{ formatMoney(result.profit) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="space-y-3">
      <!-- PDF & Email Actions -->
      <div class="grid grid-cols-2 gap-3">
        <button @click="downloadPDF" class="btn-secondary flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download PDF
        </button>
        <button @click="openEmailModal" class="btn-gold flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Email Results
        </button>
      </div>

      <button @click="shareResults" class="w-full btn-secondary flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        Share Results
      </button>
      <button @click="newRound" class="w-full btn-primary">
        Start New Round
      </button>
      <button @click="goHome" class="w-full btn-secondary">
        Back to Home
      </button>
    </div>

    <!-- Email Modal -->
    <div v-if="showEmailModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-2xl p-6 w-full max-w-md animate-slide-up">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold">Email Results</h3>
          <button @click="showEmailModal = false" class="text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="emailSent" class="text-center py-8">
          <svg class="w-16 h-16 mx-auto text-golf-green mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          <p class="text-lg font-semibold text-golf-green">Email Sent!</p>
        </div>

        <div v-else>
          <p class="text-gray-400 mb-4">Enter your email to receive a PDF of the results.</p>

          <input
            v-model="emailAddress"
            type="email"
            placeholder="your@email.com"
            class="w-full p-4 bg-gray-700 border border-gray-600 rounded-xl mb-4 focus:border-golf-green focus:outline-none"
            @keyup.enter="sendEmail"
          />

          <div v-if="emailError" class="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
            {{ emailError }}
          </div>

          <div class="flex gap-3">
            <button @click="showEmailModal = false" class="flex-1 btn-secondary">
              Cancel
            </button>
            <button
              @click="sendEmail"
              :disabled="emailSending"
              class="flex-1 btn-gold flex items-center justify-center gap-2"
            >
              <svg v-if="emailSending" class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              {{ emailSending ? 'Sending...' : 'Send Email' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Accordion animation */
.accordion-enter-active,
.accordion-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.accordion-enter-from,
.accordion-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  margin-top: 0;
}

.accordion-enter-to,
.accordion-leave-from {
  max-height: 1200px;
  opacity: 1;
}

/* PGA-style score symbols */
.score-eagle {
  color: #facc15;
  font-weight: 700;
  border-radius: 50%;
  border: 2px solid #facc15;
  box-shadow: 0 0 0 2px #1f2937, 0 0 0 4px #facc15;
}

.score-birdie {
  color: #4ade80;
  font-weight: 700;
  border-radius: 50%;
  border: 2px solid #4ade80;
}

.score-par {
  color: #ffffff;
  font-weight: 700;
}

.score-bogey {
  color: #fb923c;
  font-weight: 700;
  border-radius: 2px;
  border: 2px solid #fb923c;
}

.score-double {
  color: #f87171;
  font-weight: 700;
  border-radius: 2px;
  border: 2px solid #f87171;
  box-shadow: 0 0 0 2px #1f2937, 0 0 0 4px #f87171;
}

.confetti {
  position: absolute;
  width: 10px;
  height: 10px;
  background: linear-gradient(45deg, #FFD700, #228B22, #90EE90, #FFD700);
  animation: fall 3s linear forwards;
}

@keyframes fall {
  0% {
    transform: translateY(-10vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(100vh) rotate(720deg);
    opacity: 0;
  }
}

.confetti:nth-child(2n) {
  background: #FFD700;
  width: 8px;
  height: 8px;
}

.confetti:nth-child(3n) {
  background: #228B22;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.confetti:nth-child(4n) {
  background: #90EE90;
  width: 6px;
  height: 6px;
}
</style>
