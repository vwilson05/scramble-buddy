<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'
import { getScoreLabel } from '../utils/scoring'

const route = useRoute()
const router = useRouter()
const store = useTournamentStore()
const courseStore = useCourseStore()

const tournamentId = computed(() => route.params.id)
const currentHole = ref(1)
const selectedPlayer = ref(null)
const showGreenieModal = ref(false)
const greenieDistance = ref('')
const showScoreAnimation = ref(false)
const lastScoreLabel = ref(null)
const showShareToast = ref(false)

// Polling interval for live updates
let pollInterval = null

onMounted(async () => {
  await loadTournament()
  // Start polling every 15 seconds
  pollInterval = setInterval(loadTournament, 15000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

async function loadTournament() {
  await store.fetchTournament(tournamentId.value)
  if (store.players.length && !selectedPlayer.value) {
    selectedPlayer.value = store.players[0]
  }
}

// Computed
const currentHoleData = computed(() => {
  return courseStore.holes.find(h => h.hole_number === currentHole.value) || { par: 4, handicap_rating: 9 }
})

const isGreenieHole = computed(() => {
  return store.greenieHoles.includes(currentHole.value)
})

const playerScoreForHole = computed(() => {
  if (!selectedPlayer.value) return null
  return store.getPlayerScore(selectedPlayer.value.id, currentHole.value)
})

const playerTotalGross = computed(() => {
  if (!selectedPlayer.value) return 0
  return store.getPlayerTotalGross(selectedPlayer.value.id)
})

const parTotal = computed(() => {
  return courseStore.holes.slice(0, currentHole.value).reduce((sum, h) => sum + h.par, 0)
})

const toPar = computed(() => {
  const completed = store.scores.filter(s => s.player_id === selectedPlayer.value?.id)
  if (!completed.length) return 'E'
  const grossSum = completed.reduce((sum, s) => sum + (s.strokes || 0), 0)
  const parSum = completed.reduce((sum, s) => {
    const hole = courseStore.holes.find(h => h.hole_number === s.hole_number)
    return sum + (hole?.par || 4)
  }, 0)
  const diff = grossSum - parSum
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
})

// Methods
function goToHole(hole) {
  currentHole.value = hole
}

function nextHole() {
  if (currentHole.value < 18) currentHole.value++
}

function prevHole() {
  if (currentHole.value > 1) currentHole.value--
}

async function submitScore(strokes) {
  if (!selectedPlayer.value) return

  const par = currentHoleData.value.par
  lastScoreLabel.value = getScoreLabel(strokes, par)

  // Show animation for good scores
  if (strokes <= par) {
    showScoreAnimation.value = true
    setTimeout(() => { showScoreAnimation.value = false }, 1500)
  }

  await store.submitScore({
    tournament_id: tournamentId.value,
    player_id: selectedPlayer.value.id,
    hole_number: currentHole.value,
    strokes,
    greenie: 0
  })

  // Check if this is a greenie hole
  if (isGreenieHole.value && strokes <= par) {
    showGreenieModal.value = true
  }
}

async function submitGreenie() {
  if (!selectedPlayer.value) return

  await store.submitScore({
    tournament_id: tournamentId.value,
    player_id: selectedPlayer.value.id,
    hole_number: currentHole.value,
    strokes: playerScoreForHole.value?.strokes,
    greenie: 1,
    greenie_distance: parseFloat(greenieDistance.value) || null
  })

  showGreenieModal.value = false
  greenieDistance.value = ''
}

function skipGreenie() {
  showGreenieModal.value = false
  greenieDistance.value = ''
}

function getScoreClass(strokes) {
  if (!strokes) return ''
  const par = currentHoleData.value.par
  const diff = strokes - par
  if (diff <= -2) return 'bg-yellow-500 text-dark'
  if (diff === -1) return 'bg-golf-green text-white'
  if (diff === 0) return 'bg-gray-600 text-white'
  if (diff === 1) return 'bg-orange-500 text-white'
  return 'bg-red-500 text-white'
}

function getHoleScoreIndicator(holeNumber, playerId) {
  const score = store.scores.find(s => s.player_id === playerId && s.hole_number === holeNumber)
  if (!score?.strokes) return null
  const hole = courseStore.holes.find(h => h.hole_number === holeNumber)
  if (!hole) return null
  const diff = score.strokes - hole.par
  if (diff < 0) return 'green'
  if (diff === 0) return 'gray'
  return 'red'
}

async function shareLink() {
  const url = window.location.href
  const text = `Join ${store.currentTournament?.name} on Scramble Buddy!`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Scramble Buddy', text, url })
    } catch (e) {
      // User cancelled or error
    }
  } else {
    await navigator.clipboard.writeText(url)
    showShareToast.value = true
    setTimeout(() => { showShareToast.value = false }, 2000)
  }
}
</script>

<template>
  <div class="min-h-screen pb-40">
    <!-- Share Toast -->
    <Transition name="fade">
      <div v-if="showShareToast" class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-golf-green text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
        Link copied!
      </div>
    </Transition>

    <!-- Header -->
    <div class="sticky top-0 z-10 bg-dark/95 backdrop-blur-sm border-b border-gray-800 p-4">
      <div class="flex items-center justify-between mb-3">
        <button @click="router.push(`/tournament/${tournamentId}/leaderboard`)" class="text-golf-green font-semibold">
          Leaderboard
        </button>
        <div class="text-center flex-1">
          <div class="font-bold">{{ store.currentTournament?.name }}</div>
          <div class="text-xs text-gray-400">{{ store.currentTournament?.course_name }}</div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="shareLink" class="text-gold p-1" title="Share link">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
          <button @click="router.push('/')" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Player Selector -->
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="player in store.players"
          :key="player.id"
          @click="selectedPlayer = player"
          :class="[
            'px-4 py-2 rounded-full whitespace-nowrap transition-all',
            selectedPlayer?.id === player.id
              ? 'bg-golf-green text-white'
              : 'bg-gray-800 text-gray-400'
          ]"
        >
          {{ player.name }}
        </button>
      </div>
    </div>

    <!-- Hole Navigator -->
    <div class="p-4">
      <div class="grid grid-cols-9 gap-1 mb-2">
        <button
          v-for="hole in 9"
          :key="hole"
          @click="goToHole(hole)"
          :class="[
            'aspect-square rounded-lg text-sm font-bold flex items-center justify-center relative',
            currentHole === hole ? 'bg-golf-green text-white' : 'bg-gray-800'
          ]"
        >
          {{ hole }}
          <span
            v-if="getHoleScoreIndicator(hole, selectedPlayer?.id)"
            :class="[
              'absolute -top-1 -right-1 w-2 h-2 rounded-full',
              getHoleScoreIndicator(hole, selectedPlayer?.id) === 'green' ? 'bg-golf-green' :
              getHoleScoreIndicator(hole, selectedPlayer?.id) === 'gray' ? 'bg-gray-500' : 'bg-red-500'
            ]"
          ></span>
        </button>
      </div>
      <div class="grid grid-cols-9 gap-1">
        <button
          v-for="hole in 9"
          :key="hole + 9"
          @click="goToHole(hole + 9)"
          :class="[
            'aspect-square rounded-lg text-sm font-bold flex items-center justify-center relative',
            currentHole === hole + 9 ? 'bg-golf-green text-white' : 'bg-gray-800'
          ]"
        >
          {{ hole + 9 }}
          <span
            v-if="getHoleScoreIndicator(hole + 9, selectedPlayer?.id)"
            :class="[
              'absolute -top-1 -right-1 w-2 h-2 rounded-full',
              getHoleScoreIndicator(hole + 9, selectedPlayer?.id) === 'green' ? 'bg-golf-green' :
              getHoleScoreIndicator(hole + 9, selectedPlayer?.id) === 'gray' ? 'bg-gray-500' : 'bg-red-500'
            ]"
          ></span>
        </button>
      </div>
    </div>

    <!-- Current Hole Display -->
    <div class="text-center px-4 mb-6">
      <div class="flex items-center justify-center gap-4 mb-4">
        <button @click="prevHole" :disabled="currentHole === 1" class="p-2 rounded-full bg-gray-800 disabled:opacity-30">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div>
          <div class="text-5xl font-bold">Hole {{ currentHole }}</div>
          <div class="flex items-center justify-center gap-4 mt-2">
            <span class="text-xl">Par {{ currentHoleData.par }}</span>
            <span class="text-gray-400">{{ currentHoleData.yardage_white || '---' }} yds</span>
            <span v-if="isGreenieHole" class="text-golf-green text-sm font-semibold">GREENIE</span>
          </div>
        </div>

        <button @click="nextHole" :disabled="currentHole === 18" class="p-2 rounded-full bg-gray-800 disabled:opacity-30">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Current Score Display -->
      <div v-if="selectedPlayer" class="mb-4">
        <div class="text-gray-400 mb-1">{{ selectedPlayer.name }}'s Score</div>
        <div class="text-3xl font-bold" :class="toPar.startsWith('+') ? 'text-red-400' : toPar.startsWith('-') ? 'text-golf-green' : 'text-gray-300'">
          {{ toPar }}
        </div>
      </div>
    </div>

    <!-- Score Input Grid -->
    <div class="px-4">
      <div class="grid grid-cols-5 gap-3 max-w-sm mx-auto">
        <button
          v-for="score in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
          :key="score"
          @click="submitScore(score)"
          :class="[
            'aspect-square rounded-2xl text-2xl font-bold transition-all active:scale-95',
            playerScoreForHole?.strokes === score ? getScoreClass(score) : 'bg-gray-800 hover:bg-gray-700'
          ]"
        >
          {{ score }}
        </button>
      </div>
    </div>

    <!-- Score Animation -->
    <Transition name="fade">
      <div v-if="showScoreAnimation && lastScoreLabel" class="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
        <div :class="['text-6xl font-bold animate-birdie', lastScoreLabel.class]">
          {{ lastScoreLabel.emoji }} {{ lastScoreLabel.label }}! {{ lastScoreLabel.emoji }}
        </div>
      </div>
    </Transition>

    <!-- Greenie Modal -->
    <div v-if="showGreenieModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-sm w-full animate-slide-up">
        <h3 class="text-xl font-bold text-golf-green mb-4">Greenie!</h3>
        <p class="text-gray-400 mb-4">Did {{ selectedPlayer?.name }} hit the green?</p>

        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">Distance to pin (optional)</label>
          <div class="flex items-center gap-2">
            <input
              v-model="greenieDistance"
              type="number"
              placeholder="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-center text-xl focus:outline-none"
            />
            <span class="text-gray-400">feet</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button @click="skipGreenie" class="btn-secondary flex-1">
            No Greenie
          </button>
          <button @click="submitGreenie" class="btn-gold flex-1">
            Greenie!
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom Navigation -->
    <div class="fixed bottom-0 left-0 right-0 bg-dark border-t border-gray-800 p-4">
      <div class="flex justify-around max-w-md mx-auto">
        <button
          @click="router.push(`/tournament/${tournamentId}/scorecard`)"
          class="flex flex-col items-center text-golf-green"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span class="text-xs mt-1">Scorecard</span>
        </button>
        <button
          @click="router.push(`/tournament/${tournamentId}/leaderboard`)"
          class="flex flex-col items-center text-gray-400"
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
