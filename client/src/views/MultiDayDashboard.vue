<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMultiDayStore } from '../stores/multiday'
import { useCourseStore } from '../stores/course'

const route = useRoute()
const router = useRouter()
const store = useMultiDayStore()
const courseStore = useCourseStore()

const multiDayId = computed(() => route.params.id)
const showNewRound = ref(false)
const showShareToast = ref(false)

// New round form
const newRound = ref({
  name: '',
  date: '',
  day_number: 1,
  round_number: 1,
  game_type: 'scramble',
  course_name: '',
  nassau_format: '6-6-6',
  bet_amount: 0,
  greenie_amount: 0,
  is_team_game: false,
  handicap_mode: 'gross' // 'gross' or 'net'
})

let pollInterval = null

onMounted(async () => {
  await store.fetchMultiDay(multiDayId.value)

  // Set defaults for new round
  if (store.currentMultiDay) {
    const nextRound = store.rounds.length + 1
    newRound.value.round_number = nextRound
    newRound.value.day_number = Math.ceil(nextRound / (store.currentMultiDay.num_rounds / store.currentMultiDay.num_days))
    newRound.value.date = store.currentMultiDay.start_date
    newRound.value.name = `${store.currentMultiDay.name} - Round ${nextRound}`
  }

  // Poll for updates every 30 seconds
  pollInterval = setInterval(() => store.fetchStandings(multiDayId.value), 30000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})

const tournament = computed(() => store.currentMultiDay)
const standings = computed(() => store.standings)
const rounds = computed(() => store.rounds)

const gameTypes = [
  { value: 'scramble', label: 'Scramble' },
  { value: 'bestball', label: 'Best Ball' },
  { value: 'stroke', label: 'Stroke Play' },
  { value: 'modified', label: 'Modified Scramble' },
  { value: 'shamble', label: 'Shamble' }
]

async function createRound() {
  try {
    const round = await store.createRound(multiDayId.value, newRound.value)
    showNewRound.value = false

    // Navigate to the round setup
    router.push(`/tournament/${round.id}/scorecard`)
  } catch (err) {
    console.error('Error creating round:', err)
  }
}

function goToRound(round) {
  if (round.status === 'completed') {
    router.push(`/tournament/${round.id}/results`)
  } else if (round.status === 'scheduled') {
    // Don't navigate, show start button instead
    return
  } else {
    router.push(`/tournament/${round.id}/scorecard`)
  }
}

const showTeamRandomizer = ref(false)
const selectedRoundForTeams = ref(null)
const randomizedTeams = ref([])

// Course selection for starting rounds
const showCourseSelection = ref(false)
const selectedRoundForCourse = ref(null)
const courseSearch = ref('')
const selectedCourse = ref(null)

// Custom scorecard / edit pars
const showCustomScorecard = ref(false)
const customCourseName = ref('')
const editableHoles = ref([])
const editingPars = ref(false)

// Tournament editing
const showEditTournament = ref(false)
const editForm = ref({
  name: '',
  num_days: 1,
  num_rounds: 1,
  point_system: []
})

// New player form for editing
const newPlayerName = ref('')
const newPlayerHandicap = ref('')

function openEditTournament() {
  if (tournament.value) {
    let pointSystem = []
    try {
      pointSystem = JSON.parse(tournament.value.point_system || '[]')
    } catch (e) {
      // Default point system if parsing fails
      pointSystem = []
    }
    editForm.value = {
      name: tournament.value.name,
      num_days: tournament.value.num_days,
      num_rounds: tournament.value.num_rounds,
      point_system: pointSystem
    }
  }
  showEditTournament.value = true
}

async function saveEditTournament() {
  try {
    await store.updateMultiDay(multiDayId.value, {
      name: editForm.value.name,
      num_days: editForm.value.num_days,
      num_rounds: editForm.value.num_rounds,
      point_system: editForm.value.point_system
    })
    await store.fetchMultiDay(multiDayId.value)
    showEditTournament.value = false
  } catch (err) {
    console.error('Error saving tournament:', err)
  }
}

async function addPlayerToTournament() {
  if (!newPlayerName.value.trim()) return

  try {
    await store.addPlayer(multiDayId.value, {
      name: newPlayerName.value.trim(),
      handicap: parseFloat(newPlayerHandicap.value) || 0
    })
    newPlayerName.value = ''
    newPlayerHandicap.value = ''
    await store.fetchMultiDay(multiDayId.value)
  } catch (err) {
    console.error('Error adding player:', err)
  }
}

async function removePlayerFromTournament(playerId) {
  try {
    await store.removePlayer(multiDayId.value, playerId)
    await store.fetchMultiDay(multiDayId.value)
  } catch (err) {
    console.error('Error removing player:', err)
  }
}

async function updatePlayerHandicap(player, newHandicap) {
  try {
    await store.updatePlayer(multiDayId.value, player.id, {
      handicap: parseFloat(newHandicap) || 0
    })
  } catch (err) {
    console.error('Error updating player:', err)
  }
}

// Watch for course search
watch(courseSearch, async (query) => {
  if (query.length >= 2) {
    await courseStore.searchCourses(query)
  }
})

// Initialize default holes for custom scorecard
function initCustomHoles() {
  editableHoles.value = Array.from({ length: 18 }, (_, i) => ({
    hole_number: i + 1,
    par: 4,
    handicap_rating: i + 1
  }))
}

function openCustomScorecard() {
  customCourseName.value = ''
  initCustomHoles()
  showCustomScorecard.value = true
}

function startEditingPars() {
  editableHoles.value = courseStore.holes.map(h => ({
    hole_number: h.hole_number,
    par: h.par,
    handicap_rating: h.handicap_rating || h.hole_number
  }))
  editingPars.value = true
}

function cancelEditPars() {
  editingPars.value = false
  editableHoles.value = []
}

async function saveEditedPars() {
  if (selectedCourse.value) {
    await courseStore.updateHoles(selectedCourse.value.id, editableHoles.value)
  }
  editingPars.value = false
}

function openCourseSelection(round) {
  selectedRoundForCourse.value = round
  courseSearch.value = round.course_name || ''
  selectedCourse.value = null
  showCourseSelection.value = true
}

async function selectCourseForRound(course) {
  selectedCourse.value = course
  await courseStore.selectCourse(course)
  courseSearch.value = course.name
}

async function startRoundWithCourse() {
  if (!selectedRoundForCourse.value) return

  try {
    const round = selectedRoundForCourse.value
    const updates = { status: 'active' }

    // Add course data if selected
    if (selectedCourse.value) {
      updates.course_id = selectedCourse.value.id
      updates.course_name = selectedCourse.value.name
      updates.slope_rating = courseStore.selectedCourse?.slope_rating || 113

      // Use edited pars if available, otherwise use course holes
      const holes = editingPars.value && editableHoles.value.length > 0
        ? editableHoles.value
        : courseStore.holes

      // Set greenie holes to par 3s if there's greenie money
      if (round.greenie_amount > 0 && holes.length > 0) {
        const par3s = holes.filter(h => h.par === 3).map(h => h.hole_number)
        updates.greenie_holes = par3s.join(',')
      }
    }

    // Update the round
    await fetch(`/api/tournaments/${round.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })

    showCourseSelection.value = false
    editingPars.value = false
    router.push(`/tournament/${round.id}/scorecard`)
  } catch (err) {
    console.error('Error starting round:', err)
  }
}

async function startRoundWithCustomCourse() {
  if (!selectedRoundForCourse.value || !customCourseName.value.trim()) return

  try {
    const round = selectedRoundForCourse.value

    // Create custom course in database
    const courseResponse = await fetch('/api/courses/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: customCourseName.value.trim(),
        holes: editableHoles.value
      })
    })

    const courseData = await courseResponse.json()

    // Update round with custom course
    const updates = {
      status: 'active',
      course_id: courseData.id,
      course_name: customCourseName.value.trim(),
      slope_rating: 113
    }

    // Set greenie holes to par 3s
    if (round.greenie_amount > 0) {
      const par3s = editableHoles.value.filter(h => h.par === 3).map(h => h.hole_number)
      updates.greenie_holes = par3s.join(',')
    }

    await fetch(`/api/tournaments/${round.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    })

    showCustomScorecard.value = false
    showCourseSelection.value = false
    router.push(`/tournament/${round.id}/scorecard`)
  } catch (err) {
    console.error('Error starting round with custom course:', err)
  }
}

async function startRound(round) {
  // Open course selection if no course set
  if (!round.course_id) {
    openCourseSelection(round)
    return
  }

  try {
    // Update the round status to active
    await fetch(`/api/tournaments/${round.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' })
    })
    // Navigate to the scorecard
    router.push(`/tournament/${round.id}/scorecard`)
  } catch (err) {
    console.error('Error starting round:', err)
  }
}

function createNewRound() {
  // Navigate to full Setup.vue with multiDayId param
  const nextRound = rounds.value.length + 1
  router.push({
    path: '/setup',
    query: {
      multiDayId: multiDayId.value,
      roundNumber: nextRound,
      dayNumber: Math.ceil(nextRound / (tournament.value.num_rounds / tournament.value.num_days))
    }
  })
}

function setupRound(round) {
  // Navigate to Setup.vue with the existing round ID for full configuration
  router.push({
    path: '/setup',
    query: {
      multiDayId: multiDayId.value,
      roundId: round.id,
      roundNumber: round.round_number,
      dayNumber: round.day_number
    }
  })
}

function openTeamRandomizer(round) {
  selectedRoundForTeams.value = round
  randomizeTeams()
  showTeamRandomizer.value = true
}

function randomizeTeams() {
  // Shuffle players using Fisher-Yates
  const shuffled = [...store.players]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Pair them into teams
  const teams = []
  const playersPerTeam = shuffled.length >= 4 ? 2 : 1

  for (let i = 0; i < shuffled.length; i += playersPerTeam) {
    const teamNum = Math.floor(i / playersPerTeam) + 1
    const teamPlayers = shuffled.slice(i, i + playersPerTeam)
    teams.push({
      team: teamNum,
      players: teamPlayers
    })
  }

  randomizedTeams.value = teams
}

async function applyTeams() {
  if (!selectedRoundForTeams.value) return

  try {
    // Update each player's team in this round
    for (const team of randomizedTeams.value) {
      for (const player of team.players) {
        await fetch(`/api/tournaments/${selectedRoundForTeams.value.id}/players/${player.id}/team`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team: team.team })
        })
      }
    }

    // Refresh data
    await store.fetchMultiDay(multiDayId.value)
    showTeamRandomizer.value = false
  } catch (err) {
    console.error('Error applying teams:', err)
  }
}

async function applyAndStartRound() {
  await applyTeams()
  if (selectedRoundForTeams.value) {
    await startRound(selectedRoundForTeams.value)
  }
}

async function shareLink() {
  const url = window.location.href
  const text = `Join ${tournament.value?.name} on 18Eagles!`

  if (navigator.share) {
    try {
      await navigator.share({ title: '18Eagles', text, url })
    } catch (e) { /* cancelled */ }
  } else {
    await navigator.clipboard.writeText(url)
    showShareToast.value = true
    setTimeout(() => { showShareToast.value = false }, 2000)
  }
}

function getPlaceSuffix(place) {
  if (place === 1) return 'st'
  if (place === 2) return 'nd'
  if (place === 3) return 'rd'
  return 'th'
}

function getRoundStatusClass(status) {
  if (status === 'completed') return 'bg-golf-green'
  if (status === 'active') return 'bg-gold'
  if (status === 'scheduled') return 'bg-blue-500'
  return 'bg-gray-600'
}

function getRoundStatusLabel(status) {
  if (status === 'completed') return 'Completed'
  if (status === 'active') return 'In Progress'
  if (status === 'scheduled') return 'Scheduled'
  return 'Setup'
}

function getGameTypeLabel(type) {
  return gameTypes.find(g => g.value === type)?.label || type
}

// Tee recommendations
const groupTeeRecommendation = computed(() => {
  if (!courseStore.teeBoxes.length || !store.players.length) return null
  return courseStore.getGroupTeeRecommendation(store.players)
})

function getTeeColorClass(teeName) {
  if (!teeName) return 'bg-gray-500'
  const name = teeName.toLowerCase()
  if (name.includes('black') || name.includes('champion')) return 'bg-gray-900'
  if (name.includes('blue') || name.includes('back')) return 'bg-blue-600'
  if (name.includes('white') || name.includes('middle')) return 'bg-white'
  if (name.includes('gold') || name.includes('yellow') || name.includes('senior')) return 'bg-yellow-400'
  if (name.includes('red') || name.includes('forward')) return 'bg-red-500'
  return 'bg-gray-500'
}
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- Share Toast -->
    <Transition name="fade">
      <div v-if="showShareToast" class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-golf-green text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
        Link copied!
      </div>
    </Transition>

    <!-- Header -->
    <div class="sticky top-0 z-10 bg-dark/95 backdrop-blur-sm border-b border-gray-800 p-4">
      <div class="flex items-center justify-between">
        <button @click="router.push('/')" class="text-gray-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="text-center flex-1">
          <div class="font-bold text-lg">{{ tournament?.name }}</div>
          <div class="text-xs text-gray-400">
            {{ tournament?.num_rounds }} rounds over {{ tournament?.num_days }} days
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button @click="openEditTournament" class="text-gray-400 hover:text-white p-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button @click="shareLink" class="text-gold p-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div class="p-4">
      <!-- Overall Standings -->
      <div class="mb-6">
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <svg class="w-6 h-6 text-gold" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
          </svg>
          Overall Standings
        </h2>

        <div class="space-y-2">
          <div
            v-for="player in standings"
            :key="player.playerId"
            class="card flex items-center gap-4"
            :class="{ 'border-gold': player.position === 1 }"
          >
            <div :class="[
              'w-10 h-10 rounded-full flex items-center justify-center font-bold',
              player.position === 1 ? 'bg-gold text-dark' :
              player.position === 2 ? 'bg-gray-400 text-dark' :
              player.position === 3 ? 'bg-orange-600 text-white' :
              'bg-gray-700'
            ]">
              {{ player.position }}
            </div>

            <div class="flex-1">
              <div class="font-semibold">{{ player.playerName }}</div>
              <div class="text-xs text-gray-400">
                {{ player.wins }} win{{ player.wins !== 1 ? 's' : '' }} |
                {{ player.roundResults.length }} rounds played
              </div>
            </div>

            <div class="text-right">
              <div class="text-2xl font-bold text-golf-green">{{ player.totalPoints }}</div>
              <div class="text-xs text-gray-400">points</div>
            </div>
          </div>
        </div>

        <div v-if="standings.length === 0" class="text-center text-gray-500 py-8">
          No rounds completed yet
        </div>
      </div>

      <!-- Rounds -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Rounds</h2>
          <button
            v-if="rounds.length < tournament?.num_rounds"
            @click="createNewRound"
            class="px-4 py-2 bg-golf-green rounded-lg font-semibold text-sm"
          >
            + New Round
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="round in rounds"
            :key="round.id"
            @click="goToRound(round)"
            :class="[
              'card transition-all',
              round.status === 'scheduled' ? '' : 'cursor-pointer hover:border-golf-green'
            ]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div :class="['w-3 h-3 rounded-full', getRoundStatusClass(round.status)]"></div>
                <div>
                  <div class="font-semibold">{{ round.name }}</div>
                  <div class="text-sm text-gray-400">
                    Day {{ round.day_number }} | {{ getGameTypeLabel(round.game_type) }}
                    <span v-if="round.course_name"> | {{ round.course_name }}</span>
                  </div>
                </div>
              </div>

              <!-- Buttons for scheduled rounds -->
              <div v-if="round.status === 'scheduled'" class="flex gap-2">
                <button
                  @click.stop="setupRound(round)"
                  class="px-4 py-2 bg-golf-green rounded-lg font-semibold text-sm hover:bg-green-600 transition-colors"
                >
                  Set Up Round
                </button>
              </div>

              <!-- Status badge for other rounds -->
              <div v-else class="flex items-center gap-2">
                <span :class="[
                  'text-xs px-2 py-1 rounded-full',
                  round.status === 'completed' ? 'bg-golf-green/20 text-golf-green' :
                  round.status === 'active' ? 'bg-gold/20 text-gold' : 'bg-gray-700 text-gray-400'
                ]">
                  {{ getRoundStatusLabel(round.status) }}
                </span>
                <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            <!-- Show bet info for scheduled rounds -->
            <div v-if="round.status === 'scheduled' && (round.bet_amount || round.greenie_amount)" class="mt-2 pt-2 border-t border-gray-700 flex gap-4 text-sm text-gray-400">
              <span v-if="round.bet_amount">${{ round.bet_amount }} bet</span>
              <span v-if="round.greenie_amount">${{ round.greenie_amount }} greenies</span>
            </div>
          </div>
        </div>

        <!-- Empty state for rounds -->
        <div v-if="rounds.length === 0" class="text-center py-8">
          <p class="text-gray-500 mb-4">No rounds created yet</p>
          <button
            @click="createNewRound"
            class="px-6 py-3 bg-golf-green rounded-xl font-semibold"
          >
            Create First Round
          </button>
        </div>
      </div>

      <!-- Round Results Breakdown -->
      <div v-if="standings.length > 0 && standings[0].roundResults.length > 0" class="mb-6">
        <h2 class="text-xl font-bold mb-4">Points by Round</h2>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-gray-400 border-b border-gray-700">
                <th class="text-left py-2 px-2">Player</th>
                <th
                  v-for="round in rounds.filter(r => r.status !== 'setup')"
                  :key="round.id"
                  class="text-center py-2 px-2"
                >
                  R{{ round.round_number }}
                </th>
                <th class="text-center py-2 px-2 text-golf-green">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="player in standings"
                :key="player.playerId"
                class="border-b border-gray-800"
              >
                <td class="py-3 px-2 font-medium">{{ player.playerName }}</td>
                <td
                  v-for="round in rounds.filter(r => r.status !== 'setup')"
                  :key="round.id"
                  class="text-center py-3 px-2"
                >
                  <span v-if="player.roundResults.find(r => r.roundId === round.id)" class="inline-flex items-center justify-center">
                    <span class="font-semibold">{{ player.roundResults.find(r => r.roundId === round.id)?.points || 0 }}</span>
                    <span class="text-xs text-gray-500 ml-1">({{ player.roundResults.find(r => r.roundId === round.id)?.position }}{{ getPlaceSuffix(player.roundResults.find(r => r.roundId === round.id)?.position) }})</span>
                  </span>
                  <span v-else class="text-gray-600">-</span>
                </td>
                <td class="text-center py-3 px-2 font-bold text-golf-green">{{ player.totalPoints }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Team Randomizer Modal -->
    <div v-if="showTeamRandomizer" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold flex items-center gap-2">
            <span class="text-2xl">🎲</span>
            Random Teams
          </h3>
          <button @click="showTeamRandomizer = false" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-gray-400 text-sm mb-4">
          Teams for {{ selectedRoundForTeams?.name }}
        </p>

        <!-- Team Display -->
        <div class="space-y-3 mb-6">
          <div
            v-for="team in randomizedTeams"
            :key="team.team"
            class="bg-gray-800 rounded-xl p-4"
          >
            <div class="flex items-center gap-3 mb-2">
              <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-sm">
                {{ team.team }}
              </div>
              <span class="font-semibold">Team {{ team.team }}</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="player in team.players"
                :key="player.id"
                class="px-3 py-1 bg-gray-700 rounded-full text-sm"
              >
                {{ player.name }}
              </span>
            </div>
          </div>
        </div>

        <!-- Shuffle Again Button -->
        <button
          @click="randomizeTeams"
          class="w-full py-3 bg-gray-700 rounded-xl font-semibold mb-3 flex items-center justify-center gap-2 hover:bg-gray-600 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Shuffle Again
        </button>

        <!-- Action Buttons -->
        <div class="flex gap-3">
          <button
            @click="applyTeams"
            class="flex-1 py-3 bg-purple-600 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
          >
            Save Teams
          </button>
          <button
            @click="applyAndStartRound"
            class="flex-1 py-3 bg-golf-green rounded-xl font-semibold hover:bg-green-600 transition-colors"
          >
            Save & Start
          </button>
        </div>
      </div>
    </div>

    <!-- Course Selection Modal -->
    <div v-if="showCourseSelection" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Select Course</h3>
          <button @click="showCourseSelection = false" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-gray-400 text-sm mb-4">
          Search for a course to get accurate hole data and par info for {{ selectedRoundForCourse?.name }}
        </p>

        <!-- Course Search -->
        <div class="relative mb-4">
          <input
            v-model="courseSearch"
            type="text"
            placeholder="Search courses..."
            class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
          />
          <div v-if="courseStore.loading" class="absolute right-3 top-3">
            <svg class="animate-spin w-5 h-5 text-golf-green" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        </div>

        <!-- Search Results -->
        <div v-if="courseStore.searchResults.length && !selectedCourse" class="space-y-2 mb-4 max-h-48 overflow-y-auto">
          <button
            v-for="course in courseStore.searchResults"
            :key="course.id"
            @click="selectCourseForRound(course)"
            class="w-full p-3 bg-gray-700 rounded-lg text-left hover:bg-gray-600 transition-colors"
          >
            <div class="font-semibold">{{ course.name }}</div>
            <div class="text-sm text-gray-400">{{ course.city }}, {{ course.state }}</div>
          </button>
        </div>

        <!-- Selected Course -->
        <div v-if="selectedCourse && !editingPars" class="p-4 bg-gray-700 rounded-lg border border-golf-green mb-4">
          <div class="flex justify-between items-start">
            <div>
              <div class="font-bold">{{ selectedCourse.name }}</div>
              <div class="text-sm text-gray-400">{{ selectedCourse.city }}, {{ selectedCourse.state }}</div>
            </div>
            <button @click="selectedCourse = null; courseSearch = ''" class="text-gray-400 hover:text-white">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <!-- Hole Preview -->
          <div v-if="courseStore.holes.length" class="mt-3 grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in courseStore.holes.slice(0, 9)" :key="hole.hole_number" class="bg-gray-600/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <div class="font-bold">{{ hole.par }}</div>
            </div>
          </div>
          <div v-if="courseStore.holes.length" class="mt-1 grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in courseStore.holes.slice(9, 18)" :key="hole.hole_number" class="bg-gray-600/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <div class="font-bold">{{ hole.par }}</div>
            </div>
          </div>
          <div v-if="courseStore.holes.length" class="mt-2 text-center text-sm text-gray-400">
            Par {{ courseStore.holes.reduce((sum, h) => sum + h.par, 0) }}
          </div>

          <!-- Tee Recommendations -->
          <div v-if="groupTeeRecommendation && courseStore.teeBoxes.length" class="mt-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div class="flex items-center gap-2">
              <div :class="['w-5 h-5 rounded-full border-2 border-blue-400', getTeeColorClass(groupTeeRecommendation.name)]"></div>
              <div class="flex-1">
                <div class="text-xs font-semibold text-blue-400">Recommended Tees</div>
                <div class="text-xs text-gray-400">
                  {{ groupTeeRecommendation.name }}
                  <span v-if="groupTeeRecommendation.slope"> (Slope: {{ groupTeeRecommendation.slope }})</span>
                  <span class="text-gray-500"> - {{ groupTeeRecommendation.reason }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Available Tees Info -->
          <div v-if="courseStore.teeBoxes.length > 1" class="mt-2 flex flex-wrap gap-2 justify-center">
            <div
              v-for="tee in courseStore.teeBoxes"
              :key="tee.name"
              class="flex items-center gap-1 px-2 py-1 bg-gray-600/50 rounded text-[10px]"
            >
              <div :class="['w-3 h-3 rounded-full', getTeeColorClass(tee.name)]"></div>
              <span class="text-gray-300">{{ tee.name }}</span>
              <span v-if="tee.slope" class="text-gray-500">({{ tee.slope }})</span>
            </div>
          </div>

          <!-- Edit Pars Button -->
          <button
            @click="startEditingPars"
            class="mt-3 w-full py-2 bg-gray-600 rounded-lg text-sm hover:bg-gray-500 transition-colors"
          >
            Edit Pars
          </button>
        </div>

        <!-- Editing Pars -->
        <div v-if="selectedCourse && editingPars" class="p-4 bg-gray-700 rounded-lg border border-gold mb-4">
          <div class="flex justify-between items-start mb-3">
            <div>
              <div class="font-bold">{{ selectedCourse.name }}</div>
              <div class="text-xs text-gold">Editing pars...</div>
            </div>
          </div>
          <!-- Editable Holes Grid -->
          <div class="grid grid-cols-9 gap-1 text-xs text-center mb-1">
            <div v-for="hole in editableHoles.slice(0, 9)" :key="hole.hole_number" class="bg-gray-600/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <select v-model="hole.par" class="w-full bg-transparent text-center font-bold focus:outline-none">
                <option :value="3">3</option>
                <option :value="4">4</option>
                <option :value="5">5</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in editableHoles.slice(9, 18)" :key="hole.hole_number" class="bg-gray-600/50 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <select v-model="hole.par" class="w-full bg-transparent text-center font-bold focus:outline-none">
                <option :value="3">3</option>
                <option :value="4">4</option>
                <option :value="5">5</option>
              </select>
            </div>
          </div>
          <div class="mt-2 text-center text-sm text-gray-400">
            Par {{ editableHoles.reduce((sum, h) => sum + h.par, 0) }}
          </div>
          <div class="mt-3 flex gap-2">
            <button @click="cancelEditPars" class="flex-1 py-2 text-sm text-gray-400 hover:text-white">
              Cancel
            </button>
            <button @click="saveEditedPars" class="flex-1 py-2 bg-gold text-dark rounded-lg text-sm font-semibold">
              Save Pars
            </button>
          </div>
        </div>

        <!-- Custom Scorecard Option -->
        <div class="mb-4 p-3 bg-gray-800 rounded-lg border border-dashed border-gray-600">
          <div class="text-sm text-gray-400 mb-2">Course not in database?</div>
          <button
            @click="openCustomScorecard"
            class="w-full py-2 bg-purple-600/20 border border-purple-500/50 rounded-lg text-purple-400 text-sm hover:bg-purple-600/30 transition-colors"
          >
            Create Custom Scorecard
          </button>
        </div>

        <!-- Skip Course Selection -->
        <div class="text-center text-sm text-gray-500 mb-4">
          <button @click="startRoundWithCourse" class="text-gray-400 hover:text-white underline">
            Skip and start without course data
          </button>
        </div>

        <!-- Action Button -->
        <button
          @click="startRoundWithCourse"
          :disabled="!selectedCourse"
          :class="[
            'w-full py-3 rounded-xl font-semibold transition-colors',
            selectedCourse ? 'bg-golf-green hover:bg-green-600' : 'bg-gray-700 text-gray-500'
          ]"
        >
          {{ selectedCourse ? 'Start Round' : 'Select a Course' }}
        </button>
      </div>
    </div>

    <!-- Custom Scorecard Modal -->
    <div v-if="showCustomScorecard" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Custom Scorecard</h3>
          <button @click="showCustomScorecard = false" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p class="text-gray-400 text-sm mb-4">
          Create a custom scorecard for a course not in our database.
        </p>

        <!-- Course Name -->
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-1">Course Name</label>
          <input
            v-model="customCourseName"
            type="text"
            placeholder="e.g., Desert Springs Golf Club"
            class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <!-- Editable Holes -->
        <div class="mb-4">
          <label class="block text-sm text-gray-400 mb-2">Set Par for Each Hole</label>
          <div class="grid grid-cols-9 gap-1 text-xs text-center mb-1">
            <div v-for="hole in editableHoles.slice(0, 9)" :key="hole.hole_number" class="bg-gray-700 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <select v-model="hole.par" class="w-full bg-transparent text-center font-bold focus:outline-none">
                <option :value="3">3</option>
                <option :value="4">4</option>
                <option :value="5">5</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-9 gap-1 text-xs text-center">
            <div v-for="hole in editableHoles.slice(9, 18)" :key="hole.hole_number" class="bg-gray-700 rounded p-1">
              <div class="text-gray-400">{{ hole.hole_number }}</div>
              <select v-model="hole.par" class="w-full bg-transparent text-center font-bold focus:outline-none">
                <option :value="3">3</option>
                <option :value="4">4</option>
                <option :value="5">5</option>
              </select>
            </div>
          </div>
          <div class="mt-2 text-center text-sm text-gray-400">
            Par {{ editableHoles.reduce((sum, h) => sum + h.par, 0) }}
          </div>
        </div>

        <!-- Action Button -->
        <button
          @click="startRoundWithCustomCourse"
          :disabled="!customCourseName.trim()"
          :class="[
            'w-full py-3 rounded-xl font-semibold transition-colors',
            customCourseName.trim() ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-700 text-gray-500'
          ]"
        >
          Create & Start Round
        </button>
      </div>
    </div>

    <!-- New Round Modal -->
    <div v-if="showNewRound" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">New Round</h3>
          <button @click="showNewRound = false" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">Round Name</label>
            <input
              v-model="newRound.name"
              type="text"
              class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-2">Day</label>
              <input
                v-model.number="newRound.day_number"
                type="number"
                min="1"
                :max="tournament?.num_days"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Round #</label>
              <input
                v-model.number="newRound.round_number"
                type="number"
                min="1"
                :max="tournament?.num_rounds"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm text-gray-400 mb-2">Game Type</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="type in gameTypes"
                :key="type.value"
                @click="newRound.game_type = type.value"
                :class="[
                  'py-3 rounded-lg font-medium transition-all',
                  newRound.game_type === type.value
                    ? 'bg-golf-green text-white'
                    : 'bg-gray-700 text-gray-300'
                ]"
              >
                {{ type.label }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-sm text-gray-400 mb-2">Course (optional)</label>
            <input
              v-model="newRound.course_name"
              type="text"
              placeholder="Enter course name"
              class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-2">Bet Amount ($)</label>
              <input
                v-model.number="newRound.bet_amount"
                type="number"
                min="0"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Greenie ($)</label>
              <input
                v-model.number="newRound.greenie_amount"
                type="number"
                min="0"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
          </div>

          <!-- Handicap Mode -->
          <div>
            <label class="block text-sm text-gray-400 mb-2">Handicap Strokes</label>
            <div class="flex gap-2">
              <button
                @click="newRound.handicap_mode = 'gross'"
                :class="[
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                  newRound.handicap_mode === 'gross' ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
                ]"
              >
                Gross (Full)
              </button>
              <button
                @click="newRound.handicap_mode = 'net'"
                :class="[
                  'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
                  newRound.handicap_mode === 'net' ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
                ]"
              >
                Net (Relative)
              </button>
            </div>
            <p class="text-xs text-gray-500 mt-1">
              {{ newRound.handicap_mode === 'gross' ? 'All players use their full handicap strokes' : 'Strokes relative to lowest handicap (lowest gets 0)' }}
            </p>
          </div>

          <label class="flex items-center gap-3 cursor-pointer">
            <input
              v-model="newRound.is_team_game"
              type="checkbox"
              class="w-5 h-5 rounded bg-gray-700 border-gray-600 text-golf-green focus:ring-golf-green"
            />
            <span>Team game (use team scoring)</span>
          </label>
        </div>

        <div class="flex gap-3 mt-6">
          <button @click="showNewRound = false" class="flex-1 py-3 bg-gray-700 rounded-xl font-semibold">
            Cancel
          </button>
          <button @click="createRound" class="flex-1 py-3 bg-golf-green rounded-xl font-semibold">
            Create Round
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Tournament Modal -->
    <div v-if="showEditTournament" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div class="card max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold">Edit Tournament</h3>
          <button @click="showEditTournament = false" class="text-gray-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <!-- Tournament Name -->
          <div>
            <label class="block text-sm text-gray-400 mb-2">Tournament Name</label>
            <input
              v-model="editForm.name"
              type="text"
              class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
          </div>

          <!-- Days & Rounds -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-2">Days</label>
              <input
                v-model.number="editForm.num_days"
                type="number"
                min="1"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Rounds</label>
              <input
                v-model.number="editForm.num_rounds"
                type="number"
                min="1"
                class="w-full p-3 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
            </div>
          </div>

          <!-- Players Section -->
          <div>
            <label class="block text-sm text-gray-400 mb-2">Players</label>

            <!-- Add Player -->
            <div class="flex gap-2 mb-3">
              <input
                v-model="newPlayerName"
                type="text"
                placeholder="Player name"
                class="flex-1 p-2 bg-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-golf-green"
                @keyup.enter="addPlayerToTournament"
              />
              <input
                v-model="newPlayerHandicap"
                type="number"
                placeholder="HCP"
                class="w-16 p-2 bg-gray-700 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-golf-green"
              />
              <button
                @click="addPlayerToTournament"
                :disabled="!newPlayerName.trim()"
                class="px-3 py-2 bg-golf-green rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                Add
              </button>
            </div>

            <!-- Player List -->
            <div class="space-y-2 max-h-40 overflow-y-auto">
              <div
                v-for="player in store.players"
                :key="player.id"
                class="flex items-center justify-between p-2 bg-gray-700 rounded-lg"
              >
                <div class="flex items-center gap-2">
                  <span class="font-medium">{{ player.name }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <input
                    :value="player.handicap"
                    @change="updatePlayerHandicap(player, $event.target.value)"
                    type="number"
                    class="w-14 p-1 bg-gray-600 rounded text-sm text-center focus:outline-none"
                  />
                  <button @click="removePlayerFromTournament(player.id)" class="text-red-400 hover:text-red-300">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Point System -->
          <div>
            <label class="block text-sm text-gray-400 mb-2">Point System</label>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              <div
                v-for="(point, index) in editForm.point_system"
                :key="index"
                class="flex items-center gap-2"
              >
                <span class="text-sm text-gray-400 w-12">{{ index + 1 }}{{ index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th' }}</span>
                <input
                  v-model.number="point.points"
                  type="number"
                  min="0"
                  class="flex-1 p-2 bg-gray-700 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-golf-green"
                />
                <span class="text-sm text-gray-500">pts</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button @click="showEditTournament = false" class="flex-1 py-3 bg-gray-700 rounded-xl font-semibold">
            Cancel
          </button>
          <button @click="saveEditTournament" class="flex-1 py-3 bg-golf-green rounded-xl font-semibold">
            Save Changes
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
