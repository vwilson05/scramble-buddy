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

// Polling interval for live updates
let pollInterval = null

onMounted(async () => {
  await loadTournament()
  pollInterval = setInterval(loadTournament, 15000)

  // Find the first hole without a score for the first player
  if (selectedPlayer.value) {
    const nextHole = findNextUnplayedHole(selectedPlayer.value.id)
    if (nextHole) currentHole.value = nextHole
  }
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

function findNextUnplayedHole(playerId) {
  for (let h = 1; h <= 18; h++) {
    const score = store.scores.find(s => s.player_id === playerId && s.hole_number === h)
    if (!score?.strokes) return h
  }
  return 18 // All holes played
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

const selectedPlayerTee = computed(() => {
  const tee = selectedPlayer.value?.tee_color || 'white'
  return tee.charAt(0).toUpperCase() + tee.slice(1)
})

const currentHoleYardage = computed(() => {
  const tee = selectedPlayer.value?.tee_color || 'white'
  const yardageKey = `yardage_${tee}`
  return currentHoleData.value[yardageKey] || currentHoleData.value.yardage_white || null
})

const holesCompleted = computed(() => {
  if (!selectedPlayer.value) return 0
  return store.scores.filter(s => s.player_id === selectedPlayer.value.id && s.strokes).length
})

const toPar = computed(() => {
  if (!selectedPlayer.value) return 'E'
  const completed = store.scores.filter(s => s.player_id === selectedPlayer.value.id && s.strokes)
  if (!completed.length) return 'E'
  const grossSum = completed.reduce((sum, s) => sum + s.strokes, 0)
  const parSum = completed.reduce((sum, s) => {
    const hole = courseStore.holes.find(h => h.hole_number === s.hole_number)
    return sum + (hole?.par || 4)
  }, 0)
  const diff = grossSum - parSum
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : `${diff}`
})

// Methods
function nextHole() {
  if (currentHole.value < 18) currentHole.value++
}

function prevHole() {
  if (currentHole.value > 1) currentHole.value--
}

function selectPlayer(player) {
  selectedPlayer.value = player
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
    tournament_id: store.currentTournament.id,
    player_id: selectedPlayer.value.id,
    hole_number: currentHole.value,
    strokes,
    greenie: 0
  })

  // Check if this is a greenie hole
  if (isGreenieHole.value && strokes <= par) {
    showGreenieModal.value = true
  } else {
    // Auto-advance to next hole after a brief delay
    autoAdvance()
  }
}

async function submitGreenie() {
  if (!selectedPlayer.value) return

  await store.submitScore({
    tournament_id: store.currentTournament.id,
    player_id: selectedPlayer.value.id,
    hole_number: currentHole.value,
    strokes: playerScoreForHole.value?.strokes,
    greenie: 1,
    greenie_distance: parseFloat(greenieDistance.value) || null
  })

  showGreenieModal.value = false
  greenieDistance.value = ''
  autoAdvance()
}

function skipGreenie() {
  showGreenieModal.value = false
  greenieDistance.value = ''
  autoAdvance()
}

function autoAdvance() {
  if (currentHole.value < 18) {
    setTimeout(() => {
      nextHole()
    }, 400)
  }
}

function getScoreButtonClass(score) {
  if (playerScoreForHole.value?.strokes !== score) {
    return 'bg-gray-800 text-white'
  }
  const par = currentHoleData.value.par
  const diff = score - par
  if (diff <= -2) return 'bg-yellow-500 text-gray-900 ring-4 ring-yellow-300'
  if (diff === -1) return 'bg-golf-green text-white ring-4 ring-green-400'
  if (diff === 0) return 'bg-gray-500 text-white ring-4 ring-gray-400'
  if (diff === 1) return 'bg-orange-500 text-white ring-4 ring-orange-400'
  return 'bg-red-500 text-white ring-4 ring-red-400'
}

function getScoreButtonLabel(score) {
  const par = currentHoleData.value.par
  const diff = score - par
  if (diff === -3) return 'Albatross'
  if (diff === -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Double'
  if (diff === 3) return 'Triple'
  return `+${diff}`
}
</script>

<template>
  <div class="min-h-screen bg-dark flex flex-col">
    <!-- Compact Header -->
    <div class="bg-gray-900 px-4 py-3 flex items-center justify-between">
      <button @click="router.push(`/tournament/${tournamentId}/scorecard`)" class="text-gray-400">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="text-center">
        <div class="text-sm font-semibold">{{ store.currentTournament?.name }}</div>
        <div class="text-xs text-gray-500">Quick Score</div>
      </div>
      <button @click="router.push(`/tournament/${tournamentId}/leaderboard`)" class="text-golf-green text-sm font-semibold">
        Board
      </button>
    </div>

    <!-- Player Selector - Big Buttons -->
    <div class="px-4 py-3 bg-gray-900/50">
      <div class="flex gap-2 overflow-x-auto">
        <button
          v-for="player in store.players"
          :key="player.id"
          @click="selectPlayer(player)"
          :class="[
            'px-5 py-3 rounded-xl font-bold text-lg transition-all flex-shrink-0',
            selectedPlayer?.id === player.id
              ? 'bg-golf-green text-white scale-105'
              : 'bg-gray-800 text-gray-400'
          ]"
        >
          {{ player.name }}
        </button>
      </div>
      <!-- Player Stats -->
      <div v-if="selectedPlayer" class="mt-2 flex items-center justify-center gap-4 text-sm">
        <span class="text-gray-500">{{ holesCompleted }}/18 holes</span>
        <span :class="[
          'font-bold text-lg',
          toPar.startsWith('+') ? 'text-red-400' : toPar.startsWith('-') ? 'text-green-400' : 'text-white'
        ]">
          {{ toPar }}
        </span>
      </div>
    </div>

    <!-- Main Content - Hole Card & Score Entry -->
    <div class="flex-1 flex flex-col p-4 gap-4">

      <!-- Hole Navigation & Info -->
      <div class="flex items-stretch gap-3">
        <!-- Prev Button -->
        <button
          @click="prevHole"
          :disabled="currentHole === 1"
          class="w-16 bg-gray-800 rounded-2xl flex items-center justify-center disabled:opacity-30 active:bg-gray-700"
        >
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Hole Card -->
        <div class="flex-1 bg-gray-800 rounded-2xl p-5 relative overflow-hidden">
          <!-- Greenie indicator -->
          <div v-if="isGreenieHole" class="absolute top-0 right-0 w-16 h-16">
            <div class="absolute top-0 right-0 w-0 h-0 border-solid" style="border-width: 0 64px 64px 0; border-color: transparent #22c55e transparent transparent;"></div>
            <span class="absolute top-2 right-3 text-yellow-400 font-bold text-lg">G</span>
          </div>

          <div class="text-center">
            <div class="text-6xl font-black text-white mb-2">{{ currentHole }}</div>
            <div class="flex items-center justify-center gap-6 text-gray-400">
              <div class="text-center">
                <div class="text-2xl font-bold text-white">{{ currentHoleData.par }}</div>
                <div class="text-xs uppercase tracking-wide">Par</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-white">{{ currentHoleYardage || '-' }}</div>
                <div class="text-xs uppercase tracking-wide">{{ selectedPlayerTee }}</div>
              </div>
              <div class="text-center">
                <div class="text-2xl font-bold text-white">{{ currentHoleData.handicap_rating }}</div>
                <div class="text-xs uppercase tracking-wide">HCP</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Next Button -->
        <button
          @click="nextHole"
          :disabled="currentHole === 18"
          class="w-16 bg-gray-800 rounded-2xl flex items-center justify-center disabled:opacity-30 active:bg-gray-700"
        >
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Score Buttons - Big Grid -->
      <div class="flex-1 flex flex-col justify-center">
        <div class="grid grid-cols-3 gap-3 max-w-lg mx-auto w-full">
          <button
            v-for="score in [1, 2, 3, 4, 5, 6, 7, 8, 9]"
            :key="score"
            @click="submitScore(score)"
            :class="[
              'aspect-square rounded-3xl text-4xl font-black transition-all active:scale-95 flex flex-col items-center justify-center',
              getScoreButtonClass(score)
            ]"
          >
            <span>{{ score }}</span>
            <span class="text-xs font-medium opacity-70 mt-1">{{ getScoreButtonLabel(score) }}</span>
          </button>
        </div>
        <!-- Score 10 button (rare) -->
        <button
          @click="submitScore(10)"
          :class="[
            'mt-3 mx-auto px-8 py-3 rounded-2xl text-xl font-bold transition-all active:scale-95',
            getScoreButtonClass(10)
          ]"
        >
          10+
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
    <div v-if="showGreenieModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-3xl max-w-sm w-full p-6">
        <h3 class="text-2xl font-bold text-golf-green mb-4 text-center">Greenie!</h3>
        <p class="text-gray-400 mb-4 text-center">Did {{ selectedPlayer?.name }} hit the green?</p>

        <div class="mb-6">
          <label class="block text-sm text-gray-400 mb-2 text-center">Distance to pin (optional)</label>
          <div class="flex items-center justify-center gap-3">
            <input
              v-model="greenieDistance"
              type="number"
              inputmode="numeric"
              placeholder="0"
              class="w-32 p-4 bg-gray-700 rounded-2xl text-center text-3xl font-bold focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
            <span class="text-gray-400 text-lg">feet</span>
          </div>
        </div>

        <div class="flex gap-3">
          <button @click="skipGreenie" class="flex-1 py-4 bg-gray-700 rounded-2xl font-bold text-lg">
            No Greenie
          </button>
          <button @click="submitGreenie" class="flex-1 py-4 bg-golf-green rounded-2xl font-bold text-lg">
            Greenie!
          </button>
        </div>
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
