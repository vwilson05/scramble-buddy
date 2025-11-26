<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'
import { useCalcuttaStore } from '../stores/calcutta'
import { GAME_TYPE_INFO } from '../utils/scoring'

const router = useRouter()
const tournamentStore = useTournamentStore()
const courseStore = useCourseStore()
const calcuttaStore = useCalcuttaStore()

// Wizard step
const step = ref(1)
const totalSteps = 6

// Form data
const tournamentName = ref('')
const gameType = ref('stroke_play')
const playAsTeams = ref(false)
const nassauFormat = ref('6-6-6')
const courseSearch = ref('')
const selectedCourse = ref(null)
const players = ref([
  { name: '', handicap: 0, team: 1, tee: 'white' },
  { name: '', handicap: 0, team: 1, tee: 'white' }
])

const teeOptions = [
  { value: 'black', label: 'Black', color: 'bg-gray-900 border-gray-600' },
  { value: 'blue', label: 'Blue', color: 'bg-blue-600' },
  { value: 'white', label: 'White', color: 'bg-white' },
  { value: 'gold', label: 'Gold', color: 'bg-yellow-400' },
  { value: 'red', label: 'Red', color: 'bg-red-500' }
]
const numTeams = ref(2)
const betAmount = ref(5)
const nassauSegmentBet = ref(10)
const nassauOverallBet = ref(20)
const nassauAutoDouble = ref(true)
const greenieAmount = ref(1)
const skinsAmount = ref(1)
const selectedGreenieHoles = ref([])
const useCustomPayouts = ref(false)
const entryFee = ref(75)
const teamPayouts = ref([
  { place: 1, amount: 200 },
  { place: 2, amount: 100 }
])
const individualPayouts = ref([
  { place: 1, amount: 125 },
  { place: 2, amount: 75 }
])
const greeniePot = ref(100)

// Calcutta
const enableCalcutta = ref(false)
const calcuttaPayouts = ref([
  { place: 1, percent: 50 },
  { place: 2, percent: 30 },
  { place: 3, percent: 20 }
])

// Hole editing
const editingHoles = ref(false)
const editableHoles = ref([])

// Computed
const gameInfo = computed(() => GAME_TYPE_INFO[gameType.value])
const requiresTeams = computed(() => ['scramble'].includes(gameType.value))
const canBeTeams = computed(() => ['best_ball', 'high_low', 'stroke_play', 'match_play', 'nassau', 'skins'].includes(gameType.value))
const isTeamGame = computed(() => requiresTeams.value || (canBeTeams.value && playAsTeams.value))
const par3Holes = computed(() => courseStore.holes.filter(h => h.par === 3))
const validPlayers = computed(() => players.value.filter(p => p.name.trim()))

const teams = computed(() => {
  const teamMap = {}
  for (let i = 1; i <= numTeams.value; i++) {
    teamMap[i] = validPlayers.value.filter(p => p.team === i)
  }
  return teamMap
})

const canProceed = computed(() => {
  switch (step.value) {
    case 1: return tournamentName.value.trim() && gameType.value
    case 2: return selectedCourse.value
    case 3: return validPlayers.value.length >= 2
    case 4:
      if (!isTeamGame.value) return true
      // Each team must have at least 1 player
      for (let i = 1; i <= numTeams.value; i++) {
        if (!teams.value[i] || teams.value[i].length === 0) return false
      }
      return true
    case 5: return true
    case 6: return true // Calcutta is optional
    default: return false
  }
})

const calcuttaTotalPercent = computed(() => {
  return calcuttaPayouts.value.reduce((sum, p) => sum + (p.percent || 0), 0)
})

const teamColors = ['golf-green', 'gold', 'blue-500', 'purple-500', 'pink-500', 'orange-500']

// Watchers
watch(courseSearch, async (query) => {
  if (query.length >= 2) {
    await courseStore.searchCourses(query)
  }
})

watch(gameType, () => {
  if (requiresTeams.value) {
    playAsTeams.value = true
  }
})

watch(playAsTeams, (isTeam) => {
  if (isTeam) {
    distributePlayersToTeams()
  }
})

watch(numTeams, () => {
  distributePlayersToTeams()
})

// Auto-update Nassau overall when segment changes
watch(nassauSegmentBet, (newVal) => {
  if (nassauAutoDouble.value) {
    nassauOverallBet.value = newVal * 2
  }
})

watch(nassauAutoDouble, (enabled) => {
  if (enabled) {
    nassauOverallBet.value = nassauSegmentBet.value * 2
  }
})

// Methods
function distributePlayersToTeams() {
  const playersPerTeam = Math.ceil(players.value.length / numTeams.value)
  players.value.forEach((p, i) => {
    p.team = Math.floor(i / playersPerTeam) + 1
    if (p.team > numTeams.value) p.team = numTeams.value
  })
}

function selectCourse(course) {
  selectedCourse.value = course
  courseStore.selectCourse(course)
  courseSearch.value = course.name
  setTimeout(() => {
    selectedGreenieHoles.value = par3Holes.value.map(h => h.hole_number)
  }, 500)
}

function addPlayer() {
  const nextTeam = isTeamGame.value ? ((players.value.length % numTeams.value) + 1) : 1
  players.value.push({ name: '', handicap: 0, team: nextTeam, tee: 'white' })
}

function removePlayer(index) {
  if (players.value.length > 2) {
    players.value.splice(index, 1)
  }
}

function setPlayerTeam(player, team) {
  player.team = team
}

function addTeam() {
  numTeams.value++
}

function removeTeam() {
  if (numTeams.value > 2) {
    // Move players from removed team to team 1
    players.value.forEach(p => {
      if (p.team === numTeams.value) p.team = 1
    })
    numTeams.value--
  }
}

function nextStep() {
  if (step.value < totalSteps && canProceed.value) {
    step.value++
  }
}

function prevStep() {
  if (step.value > 1) {
    step.value--
  }
}

function toggleGreenieHole(holeNumber) {
  const index = selectedGreenieHoles.value.indexOf(holeNumber)
  if (index >= 0) {
    selectedGreenieHoles.value.splice(index, 1)
  } else {
    selectedGreenieHoles.value.push(holeNumber)
  }
}

function startEditingHoles() {
  editableHoles.value = courseStore.holes.map(h => ({
    hole_number: h.hole_number,
    par: h.par,
    handicap_rating: h.handicap_rating
  }))
  editingHoles.value = true
}

async function saveHoleEdits() {
  try {
    await courseStore.updateHoles(selectedCourse.value.id, editableHoles.value)
    editingHoles.value = false
    // Update greenie holes based on new pars
    setTimeout(() => {
      selectedGreenieHoles.value = par3Holes.value.map(h => h.hole_number)
    }, 100)
  } catch (error) {
    console.error('Failed to save hole edits:', error)
  }
}

function cancelHoleEdits() {
  editingHoles.value = false
  editableHoles.value = []
}

function addTeamPayout() {
  const nextPlace = teamPayouts.value.length + 1
  teamPayouts.value.push({ place: nextPlace, amount: 0 })
}

function removeTeamPayout(index) {
  if (teamPayouts.value.length > 1) {
    teamPayouts.value.splice(index, 1)
    teamPayouts.value.forEach((p, i) => p.place = i + 1)
  }
}

function addIndividualPayout() {
  const nextPlace = individualPayouts.value.length + 1
  individualPayouts.value.push({ place: nextPlace, amount: 0 })
}

function removeIndividualPayout(index) {
  if (individualPayouts.value.length > 1) {
    individualPayouts.value.splice(index, 1)
    individualPayouts.value.forEach((p, i) => p.place = i + 1)
  }
}

function addCalcuttaPayout() {
  const nextPlace = calcuttaPayouts.value.length + 1
  calcuttaPayouts.value.push({ place: nextPlace, percent: 0 })
}

function removeCalcuttaPayout(index) {
  if (calcuttaPayouts.value.length > 1) {
    calcuttaPayouts.value.splice(index, 1)
    calcuttaPayouts.value.forEach((p, i) => p.place = i + 1)
  }
}

const totalPot = computed(() => validPlayers.value.length * entryFee.value)

const totalPayouts = computed(() => {
  const teamTotal = teamPayouts.value.reduce((sum, p) => sum + (p.amount || 0), 0)
  const indivTotal = individualPayouts.value.reduce((sum, p) => sum + (p.amount || 0), 0)
  return teamTotal + indivTotal + greeniePot.value
})

function getOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

async function startTournament() {
  try {
    const payoutConfig = useCustomPayouts.value ? {
      entryFee: entryFee.value,
      teamPayouts: teamPayouts.value.filter(p => p.amount > 0),
      individualPayouts: individualPayouts.value.filter(p => p.amount > 0),
      greeniePot: greeniePot.value,
      totalPot: totalPot.value
    } : null

    const { id: tournamentId, slug } = await tournamentStore.createTournament({
      name: tournamentName.value,
      game_type: gameType.value,
      course_id: selectedCourse.value?.id,
      course_name: selectedCourse.value?.name,
      slope_rating: courseStore.selectedCourse?.slope_rating || 113,
      bet_amount: useCustomPayouts.value ? 0 : (gameType.value === 'nassau' ? nassauSegmentBet.value : betAmount.value),
      nassau_segment_bet: gameType.value === 'nassau' ? nassauSegmentBet.value : null,
      nassau_overall_bet: gameType.value === 'nassau' ? nassauOverallBet.value : null,
      greenie_amount: useCustomPayouts.value ? 0 : greenieAmount.value,
      skins_amount: gameType.value === 'skins' ? skinsAmount.value : 0,
      greenie_holes: selectedGreenieHoles.value.join(','),
      nassau_format: gameType.value === 'nassau' ? nassauFormat.value : null,
      is_team_game: isTeamGame.value ? 1 : 0,
      payout_config: payoutConfig
    })

    for (const player of validPlayers.value) {
      await tournamentStore.addPlayer(tournamentId, {
        name: player.name,
        handicap: player.handicap,
        team: isTeamGame.value ? player.team : null,
        tee_color: player.tee || 'white'
      })
    }

    // Save Calcutta config if enabled
    if (enableCalcutta.value) {
      await calcuttaStore.saveConfig(tournamentId, {
        enabled: true,
        payout_structure: calcuttaPayouts.value
          .filter(p => p.percent > 0)
          .map(p => ({ place: p.place, type: 'percent', value: p.percent }))
      })
    }

    await tournamentStore.startTournament(tournamentId)
    router.push(`/tournament/${slug}/scorecard`)
  } catch (error) {
    console.error('Failed to create tournament:', error)
  }
}

function getTeamColorClass(teamNum, type = 'bg') {
  const colors = {
    1: { bg: 'bg-green-600', text: 'text-green-400', border: 'border-green-500' },
    2: { bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-500' },
    3: { bg: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-500' },
    4: { bg: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-500' },
    5: { bg: 'bg-pink-500', text: 'text-pink-400', border: 'border-pink-500' },
    6: { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500' },
  }
  return colors[teamNum]?.[type] || colors[1][type]
}
</script>

<template>
  <div class="min-h-screen p-4 pb-24">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <button @click="router.push('/')" class="text-gray-400 hover:text-white">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class="text-xl font-bold">New Round</h1>
      <div class="text-sm text-gray-400">{{ step }}/{{ totalSteps }}</div>
    </div>

    <!-- Progress bar -->
    <div class="h-1 bg-gray-700 rounded-full mb-8">
      <div class="h-full bg-golf-green rounded-full transition-all duration-300" :style="{ width: `${(step / totalSteps) * 100}%` }"></div>
    </div>

    <!-- Step 1: Game Type -->
    <div v-if="step === 1" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">What are you playing?</h2>
      <p class="text-gray-400 mb-6">Choose your game format</p>

      <input
        v-model="tournamentName"
        type="text"
        placeholder="Round name (e.g., Saturday Scramble)"
        class="w-full p-4 bg-gray-800 border border-gray-700 rounded-xl mb-6 focus:border-golf-green focus:outline-none"
      />

      <div class="grid grid-cols-2 gap-3 mb-6">
        <button
          v-for="(info, type) in GAME_TYPE_INFO"
          :key="type"
          @click="gameType = type"
          :class="[
            'p-4 rounded-xl border-2 text-left transition-all',
            gameType === type ? 'border-golf-green bg-golf-green/10' : 'border-gray-700 hover:border-gray-600'
          ]"
        >
          <div class="text-2xl font-bold mb-1">{{ info.icon }}</div>
          <div class="font-semibold">{{ info.name }}</div>
          <div class="text-xs text-gray-400">{{ info.description }}</div>
        </button>
      </div>

      <!-- Teams Toggle -->
      <div v-if="canBeTeams && !requiresTeams" class="card">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">Play as Teams?</div>
            <div class="text-sm text-gray-400">Team competition</div>
          </div>
          <button
            @click="playAsTeams = !playAsTeams"
            :class="[
              'w-14 h-8 rounded-full transition-colors relative',
              playAsTeams ? 'bg-golf-green' : 'bg-gray-600'
            ]"
          >
            <span
              :class="[
                'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all duration-200',
                playAsTeams ? 'translate-x-6' : 'translate-x-0'
              ]"
            ></span>
          </button>
        </div>
      </div>

      <!-- Nassau Format -->
      <div v-if="gameType === 'nassau'" class="card mt-4">
        <div class="font-semibold mb-3">Nassau Format</div>
        <div class="grid grid-cols-2 gap-3">
          <button
            @click="nassauFormat = '6-6-6'"
            :class="[
              'p-3 rounded-xl border-2 text-center transition-all',
              nassauFormat === '6-6-6' ? 'border-golf-green bg-golf-green/10' : 'border-gray-700'
            ]"
          >
            <div class="font-bold">6-6-6</div>
            <div class="text-xs text-gray-400">Front 6, Mid 6, Back 6, Overall</div>
          </button>
          <button
            @click="nassauFormat = '9-9'"
            :class="[
              'p-3 rounded-xl border-2 text-center transition-all',
              nassauFormat === '9-9' ? 'border-golf-green bg-golf-green/10' : 'border-gray-700'
            ]"
          >
            <div class="font-bold">9-9</div>
            <div class="text-xs text-gray-400">Front 9, Back 9, Overall</div>
          </button>
        </div>
      </div>

      <div v-if="requiresTeams" class="mt-4 p-3 bg-golf-green/10 border border-golf-green/30 rounded-xl text-sm">
        <span class="text-golf-green font-semibold">Team Game</span> - {{ gameInfo.name }} is played as teams
      </div>
    </div>

    <!-- Step 2: Course Selection -->
    <div v-if="step === 2" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Where are you playing?</h2>
      <p class="text-gray-400 mb-6">Search for your golf course</p>

      <div class="relative mb-4">
        <input
          v-model="courseSearch"
          type="text"
          placeholder="Search courses..."
          class="w-full p-4 bg-gray-800 border border-gray-700 rounded-xl focus:border-golf-green focus:outline-none"
        />
        <div v-if="courseStore.loading" class="absolute right-4 top-4">
          <svg class="animate-spin w-5 h-5 text-golf-green" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
      </div>

      <div v-if="courseStore.searchResults.length && !selectedCourse" class="space-y-2 mb-4">
        <button
          v-for="course in courseStore.searchResults"
          :key="course.id"
          @click="selectCourse(course)"
          class="w-full p-4 bg-gray-800 rounded-xl text-left hover:bg-gray-700 transition-colors"
        >
          <div class="font-semibold">{{ course.name }}</div>
          <div class="text-sm text-gray-400">{{ course.city }}, {{ course.state }}</div>
        </button>
      </div>

      <div v-if="selectedCourse" class="card border border-golf-green">
        <div class="flex justify-between items-start">
          <div>
            <div class="font-bold text-lg">{{ selectedCourse.name }}</div>
            <div class="text-gray-400">{{ selectedCourse.city }}, {{ selectedCourse.state }}</div>
          </div>
          <button @click="selectedCourse = null; courseSearch = ''" class="text-gray-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Normal hole display -->
        <div v-if="courseStore.holes.length && !editingHoles">
          <div class="mt-4 grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in courseStore.holes.slice(0, 9)" :key="hole.hole_number" class="bg-gray-700/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <div class="font-bold">{{ hole.par }}</div>
            </div>
          </div>
          <div class="mt-1 grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in courseStore.holes.slice(9, 18)" :key="hole.hole_number" class="bg-gray-700/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <div class="font-bold">{{ hole.par }}</div>
            </div>
          </div>
          <div class="mt-2 flex items-center justify-between">
            <span class="text-sm text-gray-400">Par {{ courseStore.getTotalPar() }}</span>
            <button
              @click="startEditingHoles"
              class="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Fix Pars
            </button>
          </div>
        </div>

        <!-- Hole editing mode -->
        <div v-if="editingHoles" class="mt-4">
          <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 mb-3">
            <div class="text-xs text-yellow-400 flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Tap par to change (3, 4, or 5)
            </div>
          </div>
          <div class="grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in editableHoles.slice(0, 9)" :key="hole.hole_number" class="bg-gray-700/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <button
                @click="hole.par = hole.par === 5 ? 3 : hole.par + 1"
                class="font-bold w-full py-1 hover:bg-yellow-500/30 rounded transition-colors"
              >
                {{ hole.par }}
              </button>
            </div>
          </div>
          <div class="mt-1 grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in editableHoles.slice(9, 18)" :key="hole.hole_number" class="bg-gray-700/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <button
                @click="hole.par = hole.par === 5 ? 3 : hole.par + 1"
                class="font-bold w-full py-1 hover:bg-yellow-500/30 rounded transition-colors"
              >
                {{ hole.par }}
              </button>
            </div>
          </div>
          <div class="mt-2 text-center text-sm text-gray-400">
            Par {{ editableHoles.reduce((sum, h) => sum + h.par, 0) }}
          </div>
          <div class="mt-3 flex gap-2">
            <button @click="cancelHoleEdits" class="flex-1 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button @click="saveHoleEdits" class="flex-1 py-2 text-sm bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-400">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Players -->
    <div v-if="step === 3" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Who's playing?</h2>
      <p class="text-gray-400 mb-6">Add players with their handicaps and tees</p>

      <div class="space-y-3 mb-4">
        <div v-for="(player, index) in players" :key="index" class="card p-3">
          <div class="flex gap-2 items-center mb-2">
            <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-bold shrink-0">
              {{ index + 1 }}
            </div>
            <input
              v-model="player.name"
              type="text"
              :placeholder="`Player ${index + 1} name`"
              class="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-xl focus:border-golf-green focus:outline-none"
            />
            <button
              v-if="players.length > 2"
              @click="removePlayer(index)"
              class="p-2 text-red-400 hover:text-red-300 shrink-0"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="flex gap-2 items-center pl-10">
            <div class="flex-1">
              <label class="text-xs text-gray-500 block mb-1">Handicap</label>
              <input
                v-model.number="player.handicap"
                type="number"
                placeholder="0"
                min="0"
                max="54"
                class="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg focus:border-golf-green focus:outline-none text-center"
              />
            </div>
            <div class="flex-1">
              <label class="text-xs text-gray-500 block mb-1">Tees</label>
              <div class="flex gap-1">
                <button
                  v-for="tee in teeOptions"
                  :key="tee.value"
                  @click="player.tee = tee.value"
                  :class="[
                    'w-8 h-8 rounded-full border-2 transition-all',
                    tee.color,
                    player.tee === tee.value ? 'ring-2 ring-golf-green ring-offset-2 ring-offset-gray-800 scale-110' : 'opacity-60 hover:opacity-100'
                  ]"
                  :title="tee.label"
                ></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        @click="addPlayer"
        class="w-full p-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-colors"
      >
        + Add Player
      </button>

      <div class="mt-4 text-sm text-gray-400 text-center">
        {{ validPlayers.length }} player{{ validPlayers.length !== 1 ? 's' : '' }} added
      </div>
    </div>

    <!-- Step 4: Teams -->
    <div v-if="step === 4" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">{{ isTeamGame ? 'Set Up Teams' : 'Confirm Players' }}</h2>
      <p class="text-gray-400 mb-6">{{ isTeamGame ? 'Assign players to teams' : 'Review your lineup' }}</p>

      <!-- Team Game View -->
      <div v-if="isTeamGame">
        <!-- Number of Teams -->
        <div class="card mb-4">
          <div class="flex items-center justify-between">
            <span class="font-semibold">Number of Teams</span>
            <div class="flex items-center gap-3">
              <button
                @click="removeTeam"
                :disabled="numTeams <= 2"
                class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center disabled:opacity-30"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                </svg>
              </button>
              <span class="text-2xl font-bold w-8 text-center">{{ numTeams }}</span>
              <button
                @click="addTeam"
                :disabled="numTeams >= 6"
                class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center disabled:opacity-30"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Teams Display -->
        <div class="grid gap-3 mb-6" :class="numTeams <= 2 ? 'grid-cols-2' : numTeams <= 4 ? 'grid-cols-2' : 'grid-cols-3'">
          <div
            v-for="teamNum in numTeams"
            :key="teamNum"
            :class="['card border-2', getTeamColorClass(teamNum, 'border')]"
          >
            <h3 :class="['font-bold mb-2 text-center', getTeamColorClass(teamNum, 'text')]">
              Team {{ teamNum }}
            </h3>
            <div class="space-y-1 min-h-[60px]">
              <div
                v-for="player in teams[teamNum]"
                :key="player.name"
                class="p-2 bg-gray-700/50 rounded text-center text-sm"
              >
                {{ player.name }}
              </div>
              <div v-if="!teams[teamNum]?.length" class="text-center text-gray-500 text-sm py-2">
                Empty
              </div>
            </div>
          </div>
        </div>

        <!-- Player Team Assignment -->
        <div class="space-y-2">
          <div class="text-sm text-gray-400 mb-2">Assign each player:</div>
          <div
            v-for="player in validPlayers"
            :key="player.name"
            class="p-3 bg-gray-800 rounded-xl"
          >
            <div class="font-medium mb-2">{{ player.name }} <span class="text-gray-400 text-sm">({{ player.handicap }} HCP)</span></div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="teamNum in numTeams"
                :key="teamNum"
                @click="setPlayerTeam(player, teamNum)"
                :class="[
                  'px-3 py-1 rounded-lg text-sm font-semibold transition-all',
                  player.team === teamNum
                    ? getTeamColorClass(teamNum, 'bg') + ' text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                ]"
              >
                Team {{ teamNum }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Individual Game View -->
      <div v-else class="space-y-2">
        <div
          v-for="(player, index) in validPlayers"
          :key="player.name"
          class="flex items-center gap-4 p-4 bg-gray-800 rounded-xl"
        >
          <div class="w-10 h-10 rounded-full bg-golf-green flex items-center justify-center font-bold">
            {{ index + 1 }}
          </div>
          <div class="flex-1">
            <div class="font-semibold">{{ player.name }}</div>
            <div class="text-sm text-gray-400">{{ player.handicap }} handicap</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 5: Bets & Greenies -->
    <div v-if="step === 5" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Set Up Bets</h2>
      <p class="text-gray-400 mb-6">Optional: Add some stakes!</p>

      <!-- Payout Type Toggle -->
      <div class="card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">Custom Payouts?</div>
            <div class="text-sm text-gray-400">Set specific team & individual prizes</div>
          </div>
          <button
            @click="useCustomPayouts = !useCustomPayouts"
            :class="[
              'w-14 h-8 rounded-full transition-colors relative',
              useCustomPayouts ? 'bg-golf-green' : 'bg-gray-600'
            ]"
          >
            <span
              :class="[
                'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all duration-200',
                useCustomPayouts ? 'translate-x-6' : 'translate-x-0'
              ]"
            ></span>
          </button>
        </div>
      </div>

      <!-- Simple Bets Mode -->
      <div v-if="!useCustomPayouts" class="space-y-4">
        <!-- Nassau Bet (special UI) -->
        <div v-if="gameType === 'nassau'" class="card">
          <label class="block font-semibold mb-3">Nassau Bet</label>

          <!-- Segment Bet -->
          <div class="mb-4">
            <label class="block text-sm text-gray-400 mb-2">Per Segment</label>
            <div class="flex items-center gap-2">
              <span class="text-2xl">$</span>
              <input
                v-model.number="nassauSegmentBet"
                type="number"
                min="0"
                class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
              />
            </div>
            <div class="text-xs text-gray-500 mt-1">
              {{ nassauFormat === '6-6-6' ? 'Front 6, Middle 6, Back 6' : 'Front 9, Back 9' }}
            </div>
          </div>

          <!-- Overall Bet -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm text-gray-400">Overall</label>
              <label class="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" v-model="nassauAutoDouble" class="rounded">
                <span class="text-gray-400">Auto 2x</span>
              </label>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-2xl">$</span>
              <input
                v-model.number="nassauOverallBet"
                type="number"
                min="0"
                :disabled="nassauAutoDouble"
                :class="[
                  'flex-1 p-3 rounded-xl text-2xl font-bold focus:outline-none',
                  nassauAutoDouble ? 'bg-gray-800 text-gray-400' : 'bg-gray-700'
                ]"
              />
            </div>
          </div>

          <!-- Breakdown -->
          <div class="p-3 bg-gray-800 rounded-lg">
            <div class="grid gap-1 text-sm" :class="nassauFormat === '6-6-6' ? 'grid-cols-4' : 'grid-cols-3'">
              <div class="text-center">
                <div class="text-xs text-gray-500">{{ nassauFormat === '6-6-6' ? 'Front 6' : 'Front 9' }}</div>
                <div class="font-bold">${{ nassauSegmentBet }}</div>
              </div>
              <div v-if="nassauFormat === '6-6-6'" class="text-center">
                <div class="text-xs text-gray-500">Mid 6</div>
                <div class="font-bold">${{ nassauSegmentBet }}</div>
              </div>
              <div class="text-center">
                <div class="text-xs text-gray-500">{{ nassauFormat === '6-6-6' ? 'Back 6' : 'Back 9' }}</div>
                <div class="font-bold">${{ nassauSegmentBet }}</div>
              </div>
              <div class="text-center">
                <div class="text-xs text-gray-500">Overall</div>
                <div class="font-bold text-gold">${{ nassauOverallBet }}</div>
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-gray-700 flex justify-between">
              <span class="text-gray-400 text-sm">Max exposure:</span>
              <span class="text-lg font-bold text-gold">
                ${{ nassauSegmentBet * (nassauFormat === '6-6-6' ? 3 : 2) + nassauOverallBet }}
              </span>
            </div>
          </div>
        </div>

        <!-- Main Bet (non-Nassau) -->
        <div v-else class="card">
          <label class="block text-sm text-gray-400 mb-2">Main Bet Amount</label>
          <div class="flex items-center gap-2">
            <span class="text-2xl">$</span>
            <input
              v-model.number="betAmount"
              type="number"
              min="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
            />
          </div>
        </div>

        <!-- Greenies -->
        <div class="card">
          <label class="block text-sm text-gray-400 mb-2">Greenie Amount (per greenie)</label>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-2xl">$</span>
            <input
              v-model.number="greenieAmount"
              type="number"
              min="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
            />
          </div>

          <label class="block text-sm text-gray-400 mb-2">Greenie Holes (Par 3s)</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="hole in par3Holes"
              :key="hole.hole_number"
              @click="toggleGreenieHole(hole.hole_number)"
              :class="[
                'w-12 h-12 rounded-xl font-bold transition-all',
                selectedGreenieHoles.includes(hole.hole_number) ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
              ]"
            >
              {{ hole.hole_number }}
            </button>
          </div>
        </div>

        <!-- Skins -->
        <div v-if="gameType === 'skins'" class="card">
          <label class="block text-sm text-gray-400 mb-2">Skin Value</label>
          <div class="flex items-center gap-2">
            <span class="text-2xl">$</span>
            <input
              v-model.number="skinsAmount"
              type="number"
              min="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
            />
          </div>
        </div>

        <!-- Summary -->
        <div class="card bg-gray-900">
          <div class="font-semibold mb-2">Round Summary</div>
          <div class="text-sm space-y-1 text-gray-400">
            <div>{{ gameInfo?.name }} {{ isTeamGame ? `(${numTeams} Teams)` : '(Individual)' }}</div>
            <div>{{ validPlayers.length }} players at {{ selectedCourse?.name }}</div>
            <div v-if="gameType === 'nassau'">
              ${{ nassauSegmentBet }}/{{ nassauSegmentBet }}/{{ nassauFormat === '6-6-6' ? nassauSegmentBet + '/' : '' }}{{ nassauOverallBet }} Nassau
            </div>
            <div v-else-if="betAmount">${{ betAmount }} main bet</div>
            <div v-if="greenieAmount && selectedGreenieHoles.length">${{ greenieAmount }} greenies on {{ selectedGreenieHoles.length }} holes</div>
          </div>
        </div>
      </div>

      <!-- Custom Payouts Mode -->
      <div v-else class="space-y-4">
        <!-- Entry Fee -->
        <div class="card">
          <label class="block text-sm text-gray-400 mb-2">Entry Fee Per Player</label>
          <div class="flex items-center gap-2">
            <span class="text-2xl">$</span>
            <input
              v-model.number="entryFee"
              type="number"
              min="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
            />
          </div>
          <div class="mt-2 text-sm text-golf-green font-semibold">
            Total Pot: ${{ totalPot }} ({{ validPlayers.length }} players × ${{ entryFee }})
          </div>
        </div>

        <!-- Team Payouts -->
        <div v-if="isTeamGame" class="card">
          <div class="flex items-center justify-between mb-3">
            <label class="font-semibold">Team Payouts</label>
            <button @click="addTeamPayout" class="text-sm text-golf-green hover:text-green-400">
              + Add Place
            </button>
          </div>
          <div class="space-y-2">
            <div v-for="(payout, index) in teamPayouts" :key="index" class="flex items-center gap-2">
              <span class="w-16 text-gray-400 text-sm">{{ getOrdinal(payout.place) }}</span>
              <span class="text-lg">$</span>
              <input
                v-model.number="payout.amount"
                type="number"
                min="0"
                class="flex-1 p-2 bg-gray-700 rounded-lg font-bold focus:outline-none"
              />
              <button
                v-if="teamPayouts.length > 1"
                @click="removeTeamPayout(index)"
                class="p-1 text-red-400 hover:text-red-300"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Individual Payouts -->
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <label class="font-semibold">Individual Payouts</label>
            <button @click="addIndividualPayout" class="text-sm text-golf-green hover:text-green-400">
              + Add Place
            </button>
          </div>
          <div class="space-y-2">
            <div v-for="(payout, index) in individualPayouts" :key="index" class="flex items-center gap-2">
              <span class="w-16 text-gray-400 text-sm">{{ getOrdinal(payout.place) }}</span>
              <span class="text-lg">$</span>
              <input
                v-model.number="payout.amount"
                type="number"
                min="0"
                class="flex-1 p-2 bg-gray-700 rounded-lg font-bold focus:outline-none"
              />
              <button
                v-if="individualPayouts.length > 1"
                @click="removeIndividualPayout(index)"
                class="p-1 text-red-400 hover:text-red-300"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Greenie Pot -->
        <div class="card">
          <label class="block text-sm text-gray-400 mb-2">Greenie Pot (split among winners)</label>
          <div class="flex items-center gap-2 mb-4">
            <span class="text-2xl">$</span>
            <input
              v-model.number="greeniePot"
              type="number"
              min="0"
              class="flex-1 p-3 bg-gray-700 rounded-xl text-2xl font-bold focus:outline-none"
            />
          </div>

          <label class="block text-sm text-gray-400 mb-2">Greenie Holes (Par 3s)</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="hole in par3Holes"
              :key="hole.hole_number"
              @click="toggleGreenieHole(hole.hole_number)"
              :class="[
                'w-12 h-12 rounded-xl font-bold transition-all',
                selectedGreenieHoles.includes(hole.hole_number) ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
              ]"
            >
              {{ hole.hole_number }}
            </button>
          </div>
        </div>

        <!-- Summary -->
        <div class="card bg-gray-900">
          <div class="font-semibold mb-2">Payout Summary</div>
          <div class="text-sm space-y-2">
            <div class="flex justify-between text-gray-400">
              <span>Total Pot ({{ validPlayers.length }} × ${{ entryFee }})</span>
              <span class="text-golf-green font-bold">${{ totalPot }}</span>
            </div>
            <div class="border-t border-gray-700 pt-2">
              <div v-if="isTeamGame" class="mb-2">
                <div class="text-gray-400 mb-1">Team Prizes:</div>
                <div v-for="payout in teamPayouts.filter(p => p.amount > 0)" :key="payout.place" class="flex justify-between pl-4">
                  <span class="text-gray-500">{{ getOrdinal(payout.place) }} Place Team</span>
                  <span class="text-gold">${{ payout.amount }}</span>
                </div>
              </div>
              <div class="mb-2">
                <div class="text-gray-400 mb-1">Individual Prizes:</div>
                <div v-for="payout in individualPayouts.filter(p => p.amount > 0)" :key="payout.place" class="flex justify-between pl-4">
                  <span class="text-gray-500">{{ getOrdinal(payout.place) }} Place Solo</span>
                  <span class="text-gold">${{ payout.amount }}</span>
                </div>
              </div>
              <div v-if="greeniePot > 0" class="flex justify-between">
                <span class="text-gray-400">Greenies ({{ selectedGreenieHoles.length }} holes)</span>
                <span class="text-gold">${{ greeniePot }}</span>
              </div>
            </div>
            <div class="border-t border-gray-700 pt-2 flex justify-between font-bold">
              <span>Total Payouts</span>
              <span :class="totalPayouts === totalPot ? 'text-golf-green' : totalPayouts > totalPot ? 'text-red-400' : 'text-yellow-400'">
                ${{ totalPayouts }}
              </span>
            </div>
            <div v-if="totalPayouts !== totalPot" class="text-xs" :class="totalPayouts > totalPot ? 'text-red-400' : 'text-yellow-400'">
              {{ totalPayouts > totalPot ? 'Payouts exceed pot!' : `$${totalPot - totalPayouts} remaining` }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 6: Calcutta (Optional) -->
    <div v-if="step === 6" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Calcutta Auction</h2>
      <p class="text-gray-400 mb-6">Optional: Run a Calcutta auction on teams</p>

      <!-- Enable Toggle -->
      <div class="card mb-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold">Enable Calcutta?</div>
            <div class="text-sm text-gray-400">Auction off teams to the highest bidder</div>
          </div>
          <button
            @click="enableCalcutta = !enableCalcutta"
            :class="[
              'w-14 h-8 rounded-full transition-colors relative',
              enableCalcutta ? 'bg-yellow-500' : 'bg-gray-600'
            ]"
          >
            <span
              :class="[
                'absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all duration-200',
                enableCalcutta ? 'translate-x-6' : 'translate-x-0'
              ]"
            ></span>
          </button>
        </div>
      </div>

      <!-- Calcutta Setup -->
      <div v-if="enableCalcutta" class="space-y-4">
        <!-- How it works -->
        <div class="card bg-yellow-500/10 border border-yellow-500/30">
          <div class="flex items-start gap-3">
            <span class="text-2xl">🏆</span>
            <div>
              <div class="font-semibold text-yellow-400 mb-1">How it works</div>
              <p class="text-sm text-gray-300">
                Each {{ isTeamGame ? 'team' : 'player' }} is auctioned off before the round.
                The pot is distributed to owners based on final standings.
                You'll run the auction during the round - we'll track bids and calculate payouts.
              </p>
            </div>
          </div>
        </div>

        <!-- Payout Structure -->
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <label class="font-semibold">Payout Structure</label>
            <button @click="addCalcuttaPayout" class="text-sm text-yellow-400 hover:text-yellow-300">
              + Add Place
            </button>
          </div>
          <div class="space-y-2">
            <div v-for="(payout, index) in calcuttaPayouts" :key="index" class="flex items-center gap-2">
              <span class="w-16 text-gray-400 text-sm">{{ getOrdinal(payout.place) }}</span>
              <input
                v-model.number="payout.percent"
                type="number"
                min="0"
                max="100"
                class="flex-1 p-2 bg-gray-700 rounded-lg font-bold focus:outline-none text-center"
              />
              <span class="text-gray-400">%</span>
              <button
                v-if="calcuttaPayouts.length > 1"
                @click="removeCalcuttaPayout(index)"
                class="p-1 text-red-400 hover:text-red-300"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Total validation -->
          <div class="mt-3 pt-3 border-t border-gray-700 flex justify-between">
            <span class="text-gray-400">Total</span>
            <span :class="[
              'font-bold',
              calcuttaTotalPercent === 100 ? 'text-golf-green' : 'text-red-400'
            ]">
              {{ calcuttaTotalPercent }}%
            </span>
          </div>
          <div v-if="calcuttaTotalPercent !== 100" class="text-xs text-red-400 mt-1">
            Payouts should total 100%
          </div>
        </div>

        <!-- Example -->
        <div class="card bg-gray-900">
          <div class="font-semibold mb-2">Example</div>
          <div class="text-sm text-gray-400 space-y-1">
            <p>If total auction pot is $400:</p>
            <div v-for="payout in calcuttaPayouts.filter(p => p.percent > 0)" :key="payout.place" class="flex justify-between pl-4">
              <span>{{ getOrdinal(payout.place) }} Place</span>
              <span class="text-yellow-400">${{ Math.round(400 * payout.percent / 100) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Skip message when disabled -->
      <div v-else class="card bg-gray-900 text-center py-8">
        <div class="text-4xl mb-3">🎯</div>
        <div class="text-gray-400">No Calcutta for this round</div>
        <div class="text-sm text-gray-500 mt-1">You can always set it up later during the round</div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="fixed bottom-0 left-0 right-0 p-4 bg-dark border-t border-gray-800">
      <div class="flex gap-3 max-w-md mx-auto">
        <button v-if="step > 1" @click="prevStep" class="btn-secondary flex-1">Back</button>
        <button
          v-if="step < totalSteps"
          @click="nextStep"
          :disabled="!canProceed"
          :class="['flex-1', canProceed ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed']"
        >
          Next
        </button>
        <button v-if="step === totalSteps" @click="startTournament" class="btn-gold flex-1">
          Let's Go!
        </button>
      </div>
    </div>
  </div>
</template>
