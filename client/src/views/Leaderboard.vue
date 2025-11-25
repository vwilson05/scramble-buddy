<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'

const route = useRoute()
const router = useRouter()
const store = useTournamentStore()
const courseStore = useCourseStore()

const tournamentId = computed(() => route.params.id)
const showBets = ref(false)
const leaderboardData = ref(null)

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
  return leaderboardData.value?.leaderboard || []
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

    <!-- Game Type Badge -->
    <div class="px-4 mb-4">
      <div class="inline-block px-3 py-1 bg-gray-800 rounded-full text-sm">
        {{ store.currentTournament?.game_type?.replace('_', ' ').toUpperCase() }}
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="px-4 space-y-2">
      <div
        v-for="(entry, index) in leaderboard"
        :key="entry.player?.id || entry.team"
        :class="['card border', getPositionBg(index)]"
      >
        <div class="flex items-center gap-4">
          <!-- Position -->
          <div :class="['text-2xl font-bold w-8', getPositionClass(index)]">
            {{ index + 1 }}
          </div>

          <!-- Player/Team Info -->
          <div class="flex-1">
            <div class="font-bold">
              {{ entry.player?.name || `Team ${entry.team}` }}
            </div>
            <div class="text-xs text-gray-400">
              <span v-if="entry.player?.courseHandicap">{{ entry.player.courseHandicap }} HCP</span>
              <span v-if="entry.holesPlayed"> • {{ entry.holesPlayed }} holes</span>
            </div>
          </div>

          <!-- Score -->
          <div class="text-right">
            <div class="text-2xl font-bold" :class="entry.toPar < 0 ? 'text-golf-green' : entry.toPar > 0 ? 'text-red-400' : ''">
              {{ entry.toPar === 0 ? 'E' : entry.toPar > 0 ? `+${entry.toPar}` : entry.toPar }}
            </div>
            <div class="text-xs text-gray-400">
              {{ entry.grossTotal }} gross
            </div>
          </div>
        </div>

        <!-- Stats Bar -->
        <div v-if="entry.stats" class="flex gap-4 mt-3 pt-3 border-t border-gray-700/50 text-xs">
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
          @click="router.push(`/tournament/${tournamentId}/results`)"
          class="flex flex-col items-center text-gray-400"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="text-xs mt-1">Bets</span>
        </button>
      </div>
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
</style>
