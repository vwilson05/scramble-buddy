<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'
import BetTracker from '../components/BetTracker.vue'

const route = useRoute()
const router = useRouter()
const store = useTournamentStore()
const courseStore = useCourseStore()

const tournamentId = computed(() => route.params.id)
const showBets = ref(false)
const showBetTracker = ref(false)
const leaderboardData = ref(null)
const showNet = ref(true) // Default to net scoring for bets
const expandedPlayer = ref(null) // For accordion scorecard

let pollInterval = null

onMounted(async () => {
  await loadData()
  pollInterval = setInterval(loadData, 15000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

async function loadData() {
  await store.fetchTournament(tournamentId.value)
  leaderboardData.value = await store.fetchLeaderboard(tournamentId.value)
}

const leaderboard = computed(() => {
  const data = leaderboardData.value?.leaderboard || []
  if (showNet.value) {
    // Sort by net total for net scoring
    return [...data].sort((a, b) => a.netTotal - b.netTotal)
  }
  return data
})

const settlements = computed(() => {
  return leaderboardData.value?.settlements || []
})

const totalPar = computed(() => {
  return leaderboardData.value?.totalPar || 72
})

function formatToPar(score, holes) {
  if (!score || !holes) return '-'
  const parForHoles = courseStore.holes.slice(0, holes).reduce((s, h) => s + h.par, 0)
  const diff = score - parForHoles
  if (diff === 0) return 'E'
  return diff > 0 ? `+${diff}` : `${diff}`
}

function getPositionClass(index) {
  if (index === 0) return 'text-gold'
  if (index === 1) return 'text-gray-400'
  if (index === 2) return 'text-orange-600'
  return 'text-gray-500'
}

function getPositionBg(index) {
  if (index === 0) return 'bg-gold/10 border-gold/30'
  return 'bg-gray-800/50 border-gray-700/50'
}

function toggleScorecard(playerId) {
  expandedPlayer.value = expandedPlayer.value === playerId ? null : playerId
}

function getScoreClass(strokes, par) {
  if (!strokes) return 'text-gray-500'
  const diff = strokes - par
  if (diff <= -2) return 'bg-yellow-500 text-dark' // Eagle or better
  if (diff === -1) return 'bg-golf-green text-white' // Birdie
  if (diff === 0) return 'text-white' // Par
  if (diff === 1) return 'bg-orange-500/80 text-white' // Bogey
  return 'bg-red-500/80 text-white' // Double+
}

function getHolePars() {
  // Return pars for holes 1-18
  return courseStore.holes.map(h => h.par) || Array(18).fill(4)
}
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- Header -->
    <div class="sticky top-0 z-10 bg-dark/95 backdrop-blur-sm border-b border-gray-800 p-4">
      <div class="flex items-center justify-between">
        <button @click="router.push(`/tournament/${tournamentId}/scorecard`)" class="text-gray-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="text-center">
          <h1 class="font-bold text-xl">Leaderboard</h1>
          <p class="text-xs text-gray-400">{{ store.currentTournament?.name }}</p>
        </div>
        <button @click="showBets = !showBets" :class="['p-2 rounded-lg', showBets ? 'bg-gold text-dark' : 'bg-gray-800']">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Live Update Indicator -->
    <div class="flex items-center justify-center gap-2 py-2 text-xs text-gray-400">
      <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
      Live updates every 15s
    </div>

    <!-- Game Type Badge + Gross/Net Toggle -->
    <div class="px-4 mb-4 flex items-center justify-between">
      <div class="inline-block px-3 py-1 bg-gray-800 rounded-full text-sm">
        {{ store.currentTournament?.game_type?.replace('_', ' ').toUpperCase() }}
      </div>
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

    <!-- Leaderboard -->
    <div class="px-4 space-y-2">
      <div
        v-for="(entry, index) in leaderboard"
        :key="entry.player?.id || entry.team"
        :class="['card border', getPositionBg(index)]"
      >
        <!-- Clickable header row -->
        <div
          class="flex items-center gap-4 cursor-pointer"
          @click="entry.player?.id && toggleScorecard(entry.player.id)"
        >
          <!-- Position -->
          <div :class="['text-2xl font-bold w-8', getPositionClass(index)]">
            {{ index + 1 }}
          </div>

          <!-- Player/Team Info -->
          <div class="flex-1">
            <div class="font-bold flex items-center gap-2">
              {{ entry.player?.name || `Team ${entry.team}` }}
              <!-- Expand indicator -->
              <svg
                v-if="entry.player?.id"
                :class="['w-4 h-4 text-gray-500 transition-transform', expandedPlayer === entry.player?.id ? 'rotate-180' : '']"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div class="text-xs text-gray-400">
              <span v-if="entry.player?.courseHandicap !== undefined">
                {{ entry.player.courseHandicap }} HCP
                <span v-if="entry.player.courseHandicap > 0" class="text-golf-green">
                  ({{ entry.player.courseHandicap }} strokes)
                </span>
              </span>
              <span v-if="entry.holesPlayed"> • {{ entry.holesPlayed }} holes</span>
            </div>
          </div>

          <!-- Score -->
          <div class="text-right">
            <div class="text-2xl font-bold" :class="(showNet ? entry.toParNet : entry.toPar) < 0 ? 'text-golf-green' : (showNet ? entry.toParNet : entry.toPar) > 0 ? 'text-red-400' : ''">
              {{ (showNet ? entry.toParNet : entry.toPar) === 0 ? 'E' : (showNet ? entry.toParNet : entry.toPar) > 0 ? `+${showNet ? entry.toParNet : entry.toPar}` : (showNet ? entry.toParNet : entry.toPar) }}
            </div>
            <div class="text-xs text-gray-400">
              {{ showNet ? entry.netTotal : entry.grossTotal }} {{ showNet ? 'net' : 'gross' }}
            </div>
          </div>
        </div>

        <!-- Accordion Scorecard -->
        <Transition name="accordion">
          <div v-if="expandedPlayer === entry.player?.id && entry.holeScores" class="mt-4 pt-4 border-t border-gray-700/50">
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
                  {{ courseStore.holes[hole - 1]?.par || 4 }}
                </div>
                <div class="w-10 text-center text-xs text-gray-400 font-semibold">
                  {{ courseStore.holes.slice(0, 9).reduce((s, h) => s + h.par, 0) }}
                </div>
              </div>
              <div class="flex gap-1 mt-1">
                <div class="flex-1 text-center text-xs font-semibold">Score</div>
                <div
                  v-for="hole in 9"
                  :key="'score-' + hole"
                  :class="['w-7 h-7 text-center text-sm font-bold rounded flex items-center justify-center', getScoreClass(entry.holeScores[hole - 1]?.gross, courseStore.holes[hole - 1]?.par || 4)]"
                >
                  {{ entry.holeScores[hole - 1]?.gross || '-' }}
                </div>
                <div class="w-10 text-center text-sm font-bold bg-gray-700 rounded flex items-center justify-center">
                  {{ entry.front9Gross || '-' }}
                </div>
              </div>
              <div v-if="showNet" class="flex gap-1 mt-1">
                <div class="flex-1 text-center text-xs text-golf-green">Net</div>
                <div
                  v-for="hole in 9"
                  :key="'net-' + hole"
                  class="w-7 text-center text-xs text-golf-green"
                >
                  {{ entry.holeScores[hole - 1]?.net || '-' }}
                  <span v-if="entry.holeScores[hole - 1]?.strokes" class="text-yellow-500">*</span>
                </div>
                <div class="w-10 text-center text-xs text-golf-green font-semibold">
                  {{ entry.front9Net || '-' }}
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
                  {{ courseStore.holes[hole + 8]?.par || 4 }}
                </div>
                <div class="w-10 text-center text-xs text-gray-400 font-semibold">
                  {{ courseStore.holes.slice(9, 18).reduce((s, h) => s + h.par, 0) }}
                </div>
              </div>
              <div class="flex gap-1 mt-1">
                <div class="flex-1 text-center text-xs font-semibold">Score</div>
                <div
                  v-for="hole in 9"
                  :key="'score-' + (hole + 9)"
                  :class="['w-7 h-7 text-center text-sm font-bold rounded flex items-center justify-center', getScoreClass(entry.holeScores[hole + 8]?.gross, courseStore.holes[hole + 8]?.par || 4)]"
                >
                  {{ entry.holeScores[hole + 8]?.gross || '-' }}
                </div>
                <div class="w-10 text-center text-sm font-bold bg-gray-700 rounded flex items-center justify-center">
                  {{ entry.back9Gross || '-' }}
                </div>
              </div>
              <div v-if="showNet" class="flex gap-1 mt-1">
                <div class="flex-1 text-center text-xs text-golf-green">Net</div>
                <div
                  v-for="hole in 9"
                  :key="'net-' + (hole + 9)"
                  class="w-7 text-center text-xs text-golf-green"
                >
                  {{ entry.holeScores[hole + 8]?.net || '-' }}
                  <span v-if="entry.holeScores[hole + 8]?.strokes" class="text-yellow-500">*</span>
                </div>
                <div class="w-10 text-center text-xs text-golf-green font-semibold">
                  {{ entry.back9Net || '-' }}
                </div>
              </div>
            </div>

            <!-- Total -->
            <div class="flex justify-end mt-3 pt-2 border-t border-gray-700/30">
              <div class="text-right">
                <div class="text-xs text-gray-500">TOTAL</div>
                <div class="font-bold">
                  {{ entry.grossTotal }} gross
                  <span v-if="showNet" class="text-golf-green ml-2">{{ entry.netTotal }} net</span>
                </div>
              </div>
            </div>

            <!-- Legend -->
            <div v-if="showNet" class="mt-2 text-xs text-gray-500 flex items-center gap-1">
              <span class="text-yellow-500">*</span> = stroke received
            </div>
          </div>
        </Transition>

        <!-- Stats Bar -->
        <div v-if="entry.stats && expandedPlayer !== entry.player?.id" class="flex gap-4 mt-3 pt-3 border-t border-gray-700/50 text-xs">
          <div v-if="entry.stats.birdies" class="text-golf-green">
            {{ entry.stats.birdies }} birdies
          </div>
          <div class="text-gray-400">{{ entry.stats.pars }} pars</div>
          <div v-if="entry.stats.bogeys" class="text-orange-400">
            {{ entry.stats.bogeys }} bogeys
          </div>
          <div v-if="entry.greeniesWon" class="text-gold">
            {{ entry.greeniesWon }} greenies
          </div>
        </div>

        <!-- Match Play Status -->
        <div v-if="entry.matchStatus" class="mt-2 text-center">
          <span :class="['text-lg font-bold', entry.matchStatus.includes('UP') ? 'text-golf-green' : entry.matchStatus.includes('DN') ? 'text-red-400' : 'text-gray-400']">
            {{ entry.matchStatus }}
          </span>
        </div>

        <!-- Skins -->
        <div v-if="entry.skinsTotal" class="mt-2 text-gold font-bold">
          ${{ entry.skinsTotal }} in skins
        </div>
      </div>
    </div>

    <!-- Bets Panel -->
    <Transition name="slide">
      <div v-if="showBets" class="fixed bottom-20 left-0 right-0 bg-gray-900 border-t border-gold/30 p-4 max-h-60 overflow-y-auto">
        <h3 class="font-bold text-gold mb-3">Bet Settlement</h3>

        <div v-if="settlements.length === 0" class="text-gray-400 text-center py-4">
          No bets to settle yet
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="(settlement, index) in settlements"
            :key="index"
            class="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg"
          >
            <div>
              <span class="text-red-400">{{ settlement.from }}</span>
              <span class="text-gray-500 mx-2">→</span>
              <span class="text-golf-green">{{ settlement.to }}</span>
            </div>
            <div class="font-bold text-gold">${{ settlement.amount }}</div>
          </div>
        </div>

        <!-- Greenie Info -->
        <div v-if="leaderboardData?.greenieHoles?.length" class="mt-4 pt-4 border-t border-gray-700">
          <h4 class="text-sm text-gray-400 mb-2">Greenie Holes</h4>
          <div class="flex gap-2">
            <span
              v-for="hole in leaderboardData.greenieHoles"
              :key="hole"
              class="px-3 py-1 bg-golf-green/20 text-golf-green rounded-full text-sm"
            >
              #{{ hole }}
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Bottom Navigation -->
    <div class="fixed bottom-0 left-0 right-0 bg-dark border-t border-gray-800 p-4">
      <div class="flex justify-around max-w-md mx-auto">
        <button
          @click="router.push(`/tournament/${tournamentId}/scorecard`)"
          class="flex flex-col items-center text-gray-400"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-xs mt-1">Scorecard</span>
        </button>
        <button
          @click="router.push(`/tournament/${tournamentId}/leaderboard`)"
          class="flex flex-col items-center text-golf-green"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="text-xs mt-1">Leaderboard</span>
        </button>
        <button
          @click="showBetTracker = true"
          class="flex flex-col items-center text-gray-400"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-xs mt-1">Bets</span>
        </button>
      </div>
    </div>

    <!-- Bet Tracker Modal -->
    <div v-if="showBetTracker" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <BetTracker
        :tournament-id="tournamentId"
        :current-hole="1"
        @close="showBetTracker = false"
      />
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateY(100%);
}

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
  max-height: 500px;
  opacity: 1;
}
</style>
