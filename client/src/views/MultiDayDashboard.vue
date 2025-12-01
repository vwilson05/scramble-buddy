<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMultiDayStore } from '../stores/multiday'

const route = useRoute()
const router = useRouter()
const store = useMultiDayStore()

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
  is_team_game: false
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

async function startRound(round) {
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
  const text = `Join ${tournament.value?.name} on Scramble Buddy!`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Scramble Buddy', text, url })
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
        <button @click="shareLink" class="text-gold p-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
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
            @click="showNewRound = true"
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
                  @click.stop="openTeamRandomizer(round)"
                  class="px-3 py-2 bg-purple-600 rounded-lg font-semibold text-sm hover:bg-purple-700 transition-colors"
                  title="Randomize Teams"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button
                  @click.stop="startRound(round)"
                  class="px-4 py-2 bg-golf-green rounded-lg font-semibold text-sm hover:bg-green-600 transition-colors"
                >
                  Start Round
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
            @click="showNewRound = true"
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
