<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'
import { getScoreLabel } from '../utils/scoring'
import SideBetManager from '../components/SideBetManager.vue'
import CalcuttaManager from '../components/CalcuttaManager.vue'
import BetTracker from '../components/BetTracker.vue'

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
const showSideBets = ref(false)
const showCalcutta = ref(false)
const showBetTracker = ref(false)
const showSelfieReminder = ref(false)
const selfieReminderShown = ref(false)
const showSideBetPrompt = ref(false)
const sideBetPromptShown = ref(false)
const showAdjustiesModal = ref(false)
const adjustiesShownHole7 = ref(false)
const adjustiesShownHole13 = ref(false)
const playerHandicapAdjustments = ref({}) // { playerId: newHandicap }

// Polling interval for live updates
let pollInterval = null

onMounted(async () => {
  await loadTournament()
  // Start polling every 15 seconds
  pollInterval = setInterval(loadTournament, 15000)

  // Show side bet prompt on hole 1 after a short delay
  setTimeout(() => {
    if (currentHole.value === 1 && !sideBetPromptShown.value) {
      showSideBetPrompt.value = true
      sideBetPromptShown.value = true
    }
  }, 1500)
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

const selfieHole = computed(() => store.currentTournament?.selfie_hole)

// Watch for selfie hole and adjusties checkpoints
watch(currentHole, (hole) => {
  if (hole === selfieHole.value && !selfieReminderShown.value) {
    showSelfieReminder.value = true
    selfieReminderShown.value = true
  }

  // Adjusties checkpoints at holes 7 and 13
  if (hole === 7 && !adjustiesShownHole7.value && store.players.length >= 2) {
    // Initialize adjustments with current handicaps
    store.players.forEach(p => {
      if (playerHandicapAdjustments.value[p.id] === undefined) {
        playerHandicapAdjustments.value[p.id] = p.handicap
      }
    })
    showAdjustiesModal.value = true
    adjustiesShownHole7.value = true
  }
  if (hole === 13 && !adjustiesShownHole13.value && store.players.length >= 2) {
    showAdjustiesModal.value = true
    adjustiesShownHole13.value = true
  }
})

const playerScoreForHole = computed(() => {
  if (!selectedPlayer.value) return null
  return store.getPlayerScore(selectedPlayer.value.id, currentHole.value)
})

const playerTotalGross = computed(() => {
  if (!selectedPlayer.value) return 0
  return store.getPlayerTotalGross(selectedPlayer.value.id)
})

// Scorecard computed values
const front9Par = computed(() => {
  return courseStore.holes.filter(h => h.hole_number <= 9).reduce((sum, h) => sum + h.par, 0)
})

const back9Par = computed(() => {
  return courseStore.holes.filter(h => h.hole_number > 9).reduce((sum, h) => sum + h.par, 0)
})

const totalPar = computed(() => {
  return courseStore.holes.reduce((sum, h) => sum + h.par, 0)
})

const front9Score = computed(() => {
  if (!selectedPlayer.value) return 0
  const playerScores = store.scores.filter(s => s.player_id === selectedPlayer.value.id && s.hole_number <= 9)
  return playerScores.reduce((sum, s) => sum + (s.strokes || 0), 0)
})

const back9Score = computed(() => {
  if (!selectedPlayer.value) return 0
  const playerScores = store.scores.filter(s => s.player_id === selectedPlayer.value.id && s.hole_number > 9)
  return playerScores.reduce((sum, s) => sum + (s.strokes || 0), 0)
})

const front9ToPar = computed(() => {
  return front9Score.value - front9Par.value
})

const back9ToPar = computed(() => {
  return back9Score.value - back9Par.value
})

const totalToPar = computed(() => {
  return playerTotalGross.value - totalPar.value
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

const selectedPlayerTee = computed(() => {
  const tee = selectedPlayer.value?.tee_color || 'white'
  return tee.charAt(0).toUpperCase() + tee.slice(1)
})

const currentHoleYardage = computed(() => {
  const tee = selectedPlayer.value?.tee_color || 'white'
  const yardageKey = `yardage_${tee}`
  return currentHoleData.value[yardageKey] || currentHoleData.value.yardage_white || null
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
    tournament_id: store.currentTournament.id,
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
    tournament_id: store.currentTournament.id,
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

async function applyAdjusties() {
  // Update each player's handicap
  for (const player of store.players) {
    const newHandicap = playerHandicapAdjustments.value[player.id]
    if (newHandicap !== undefined && newHandicap !== player.handicap) {
      await store.updatePlayer(player.id, { handicap: newHandicap })
    }
  }
  showAdjustiesModal.value = false
}

function skipAdjusties() {
  showAdjustiesModal.value = false
}

function adjustHandicap(playerId, delta) {
  const current = playerHandicapAdjustments.value[playerId] || 0
  playerHandicapAdjustments.value[playerId] = Math.max(0, current + delta)
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

function getHolePar(holeNumber) {
  const hole = courseStore.holes.find(h => h.hole_number === holeNumber)
  return hole?.par || 4
}

function getHoleScore(holeNumber) {
  if (!selectedPlayer.value) return null
  const score = store.scores.find(s => s.player_id === selectedPlayer.value.id && s.hole_number === holeNumber)
  return score?.strokes || null
}

function getScoreSymbolClass(holeNumber) {
  const strokes = getHoleScore(holeNumber)
  if (!strokes) return ''
  const par = getHolePar(holeNumber)
  const diff = strokes - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  return 'score-double'
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
          <button @click="showBetTracker = true" class="text-orange-400 p-1" title="Bet Tracker">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
          <button @click="showSideBets = true" class="text-green-400 p-1" title="Side Bets">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </button>
          <button @click="showCalcutta = true" class="text-yellow-400 p-1" title="Calcutta">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </button>
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

    <!-- Traditional Scorecard -->
    <div class="p-3">
      <!-- Front 9 -->
      <div class="bg-gray-800 rounded-t-xl overflow-hidden">
        <!-- Hole numbers row -->
        <div class="grid grid-cols-10 text-center text-xs">
          <div class="bg-gray-700 py-2 font-semibold text-gray-400">HOLE</div>
          <button
            v-for="hole in 9"
            :key="hole"
            @click="goToHole(hole)"
            :class="[
              'py-2 font-bold transition-colors',
              currentHole === hole ? 'bg-golf-green text-white' : 'hover:bg-gray-700'
            ]"
          >
            {{ hole }}
          </button>
        </div>
        <!-- Par row -->
        <div class="grid grid-cols-10 text-center text-xs border-t border-gray-700">
          <div class="bg-gray-700 py-1 text-gray-400">PAR</div>
          <div v-for="hole in 9" :key="hole" class="py-1 text-gray-400">
            {{ getHolePar(hole) }}
          </div>
        </div>
        <!-- Score row -->
        <div class="grid grid-cols-10 text-center border-t border-gray-700">
          <div class="bg-gray-700 py-2 text-xs text-gray-400 flex items-center justify-center">SCORE</div>
          <button
            v-for="hole in 9"
            :key="hole"
            @click="goToHole(hole)"
            class="py-2 flex items-center justify-center"
          >
            <span
              v-if="getHoleScore(hole)"
              :class="getScoreSymbolClass(hole)"
            >
              {{ getHoleScore(hole) }}
            </span>
            <span v-else class="text-gray-600">-</span>
          </button>
        </div>
        <!-- Front 9 total -->
        <div class="grid grid-cols-10 text-center border-t-2 border-gray-600 bg-gray-750">
          <div class="bg-gray-700 py-2 text-xs font-semibold text-gray-300">OUT</div>
          <div class="col-span-8 py-2 text-sm text-gray-400">{{ front9Par }}</div>
          <div class="py-2 font-bold" :class="front9ToPar > 0 ? 'text-red-400' : front9ToPar < 0 ? 'text-green-400' : 'text-white'">
            {{ front9Score || '-' }}
          </div>
        </div>
      </div>

      <!-- Back 9 -->
      <div class="bg-gray-800 rounded-b-xl overflow-hidden mt-1">
        <!-- Hole numbers row -->
        <div class="grid grid-cols-10 text-center text-xs">
          <div class="bg-gray-700 py-2 font-semibold text-gray-400">HOLE</div>
          <button
            v-for="hole in 9"
            :key="hole + 9"
            @click="goToHole(hole + 9)"
            :class="[
              'py-2 font-bold transition-colors',
              currentHole === hole + 9 ? 'bg-golf-green text-white' : 'hover:bg-gray-700'
            ]"
          >
            {{ hole + 9 }}
          </button>
        </div>
        <!-- Par row -->
        <div class="grid grid-cols-10 text-center text-xs border-t border-gray-700">
          <div class="bg-gray-700 py-1 text-gray-400">PAR</div>
          <div v-for="hole in 9" :key="hole + 9" class="py-1 text-gray-400">
            {{ getHolePar(hole + 9) }}
          </div>
        </div>
        <!-- Score row -->
        <div class="grid grid-cols-10 text-center border-t border-gray-700">
          <div class="bg-gray-700 py-2 text-xs text-gray-400 flex items-center justify-center">SCORE</div>
          <button
            v-for="hole in 9"
            :key="hole + 9"
            @click="goToHole(hole + 9)"
            class="py-2 flex items-center justify-center"
          >
            <span
              v-if="getHoleScore(hole + 9)"
              :class="getScoreSymbolClass(hole + 9)"
            >
              {{ getHoleScore(hole + 9) }}
            </span>
            <span v-else class="text-gray-600">-</span>
          </button>
        </div>
        <!-- Back 9 total -->
        <div class="grid grid-cols-10 text-center border-t-2 border-gray-600 bg-gray-750">
          <div class="bg-gray-700 py-2 text-xs font-semibold text-gray-300">IN</div>
          <div class="col-span-8 py-2 text-sm text-gray-400">{{ back9Par }}</div>
          <div class="py-2 font-bold" :class="back9ToPar > 0 ? 'text-red-400' : back9ToPar < 0 ? 'text-green-400' : 'text-white'">
            {{ back9Score || '-' }}
          </div>
        </div>
        <!-- Total row -->
        <div class="grid grid-cols-10 text-center border-t-2 border-golf-green bg-gray-900">
          <div class="bg-gray-700 py-2 text-xs font-bold text-white">TOT</div>
          <div class="col-span-8 py-2 text-sm font-semibold text-gray-300">{{ totalPar }}</div>
          <div class="py-2 font-bold text-lg" :class="totalToPar > 0 ? 'text-red-400' : totalToPar < 0 ? 'text-green-400' : 'text-white'">
            {{ playerTotalGross || '-' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Current Hole Info -->
    <div class="px-4 mb-4">
      <div class="flex items-center gap-3">
        <button @click="prevHole" :disabled="currentHole === 1" class="p-2 rounded-full bg-gray-800 disabled:opacity-30">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div class="flex-1 bg-gray-800 rounded-xl p-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="text-2xl font-bold">Hole {{ currentHole }}</div>
              <div class="flex items-center gap-3 text-sm">
                <span class="text-gray-400">Par <span class="text-white font-bold">{{ currentHoleData.par }}</span></span>
                <span class="text-gray-400">{{ currentHoleYardage }}<span class="text-xs ml-1">yds</span></span>
                <span class="text-gray-500">HCP {{ currentHoleData.handicap_rating }}</span>
              </div>
            </div>
            <div v-if="isGreenieHole" class="text-golf-green font-bold text-sm">
              🎯 GREENIE
            </div>
          </div>
          <!-- Current hole score display -->
          <div v-if="playerScoreForHole" class="mt-2 pt-2 border-t border-gray-700 flex items-center justify-between">
            <span class="text-gray-400 text-sm">{{ selectedPlayer?.name }}'s score:</span>
            <span :class="getScoreSymbolClass(currentHole)" class="text-lg">
              {{ playerScoreForHole.strokes }}
            </span>
          </div>
        </div>

        <button @click="nextHole" :disabled="currentHole === 18" class="p-2 rounded-full bg-gray-800 disabled:opacity-30">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
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

    <!-- Side Bets Modal -->
    <div v-if="showSideBets" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <SideBetManager
        :tournament-id="tournamentId"
        :current-hole="currentHole"
        @close="showSideBets = false"
      />
    </div>

    <!-- Calcutta Modal -->
    <div v-if="showCalcutta" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2">
      <div class="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4 sticky top-0 bg-gray-800 py-2 -mt-2 -mx-2 px-2">
          <h3 class="text-xl font-bold">Calcutta Auction</h3>
          <button @click="showCalcutta = false" class="text-gray-400 hover:text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <CalcuttaManager :tournament-id="tournamentId" />
      </div>
    </div>

    <!-- Bet Tracker Modal -->
    <div v-if="showBetTracker" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <BetTracker
        :tournament-id="tournamentId"
        :current-hole="currentHole"
        @close="showBetTracker = false"
      />
    </div>

    <!-- Selfie Reminder Modal -->
    <div v-if="showSelfieReminder" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-sm w-full animate-slide-up text-center">
        <div class="text-6xl mb-4">📸</div>
        <h3 class="text-2xl font-bold mb-2">Selfie Time!</h3>
        <p class="text-gray-400 mb-6">
          Don't forget to grab a group photo on hole {{ selfieHole }}!
        </p>
        <button @click="showSelfieReminder = false" class="btn-gold w-full">
          Got it!
        </button>
      </div>
    </div>

    <!-- Side Bet Prompt (Hole 1) -->
    <div v-if="showSideBetPrompt" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-sm w-full animate-slide-up text-center">
        <div class="text-5xl mb-4">🤝💰</div>
        <h3 class="text-2xl font-bold mb-2">Any side action?</h3>
        <p class="text-gray-400 mb-6">
          Set up side bets between players or teams - Nassau, best ball, high-low, and more!
        </p>
        <div class="flex gap-3">
          <button @click="showSideBetPrompt = false" class="flex-1 btn-secondary">
            Not today
          </button>
          <button @click="showSideBetPrompt = false; showSideBets = true" class="flex-1 btn-gold">
            Set up bets
          </button>
        </div>
      </div>
    </div>

    <!-- Adjusties Modal (Holes 7 and 13) -->
    <div v-if="showAdjustiesModal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full animate-slide-up">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-3xl">⚖️</span>
          <div>
            <h3 class="text-xl font-bold">Adjusties Check-in</h3>
            <p class="text-sm text-gray-400">Hole {{ currentHole }} - Adjust handicaps?</p>
          </div>
        </div>

        <p class="text-gray-400 text-sm mb-4">
          If someone's dominating, you can adjust strokes for the remaining holes to keep it fair.
        </p>

        <div class="space-y-3 mb-6">
          <div
            v-for="player in store.players"
            :key="player.id"
            class="flex items-center justify-between p-3 bg-gray-800 rounded-xl"
          >
            <div>
              <div class="font-semibold">{{ player.name }}</div>
              <div class="text-xs text-gray-400">
                Original: {{ player.handicap }} HCP
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="adjustHandicap(player.id, -1)"
                class="w-8 h-8 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/30"
              >
                -
              </button>
              <div class="w-12 text-center">
                <span class="text-xl font-bold" :class="playerHandicapAdjustments[player.id] !== player.handicap ? 'text-golf-green' : ''">
                  {{ playerHandicapAdjustments[player.id] ?? player.handicap }}
                </span>
              </div>
              <button
                @click="adjustHandicap(player.id, 1)"
                class="w-8 h-8 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center hover:bg-green-500/30"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div class="text-xs text-gray-500 mb-4">
          Adjustments will apply to all remaining holes ({{ 19 - currentHole }} holes left).
        </div>

        <div class="flex gap-3">
          <button @click="skipAdjusties" class="flex-1 btn-secondary">
            Keep Current
          </button>
          <button @click="applyAdjusties" class="flex-1 btn-gold">
            Apply Changes
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

/* PGA-style score symbols */
.score-eagle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #facc15;
  font-weight: 700;
  font-size: 14px;
  border-radius: 50%;
  border: 2px solid #facc15;
  box-shadow: 0 0 0 2px #1f2937, 0 0 0 4px #facc15;
}

.score-birdie {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #4ade80;
  font-weight: 700;
  font-size: 14px;
  border-radius: 50%;
  border: 2px solid #4ade80;
}

.score-par {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #ffffff;
  font-weight: 700;
  font-size: 14px;
}

.score-bogey {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #fb923c;
  font-weight: 700;
  font-size: 14px;
  border-radius: 4px;
  border: 2px solid #fb923c;
}

.score-double {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #f87171;
  font-weight: 700;
  font-size: 14px;
  border-radius: 4px;
  border: 2px solid #f87171;
  box-shadow: 0 0 0 2px #1f2937, 0 0 0 4px #f87171;
}

.bg-gray-750 {
  background-color: #2d3748;
}
</style>
