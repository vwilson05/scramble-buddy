<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSideBetsStore } from '../stores/sidebets'
import { useTournamentStore } from '../stores/tournament'

const props = defineProps({
  tournamentId: { type: [String, Number], required: true },
  currentHole: { type: Number, default: 1 }
})

const emit = defineEmits(['close'])

const sideBetsStore = useSideBetsStore()
const tournamentStore = useTournamentStore()

// View state
const view = ref('list') // 'list' or 'create'
const setupStep = ref(1)

// Setup wizard data
const betName = ref('')
const gameType = ref('nassau')
const nassauFormat = ref('9-9')
const useHighLow = ref(false)
const party1 = ref([])
const party2 = ref([])
const frontAmount = ref(6)
const middleAmount = ref(6)
const backAmount = ref(6)
const overallAmount = ref(6)
const perHoleAmount = ref(1)
const startHole = ref(1)

const players = computed(() => tournamentStore.players)
const isTeamGame = computed(() => tournamentStore.currentTournament?.is_team_game)

const teams = computed(() => {
  if (!isTeamGame.value) return []
  const teamNums = [...new Set(players.value.map(p => p.team).filter(t => t))]
  return teamNums.sort().map(num => ({
    team: num,
    name: `Team ${num}`,
    players: players.value.filter(p => p.team === num)
  }))
})

const gameTypes = [
  { value: 'nassau', name: 'Nassau', desc: 'Front, Back, Overall bets' },
  { value: 'best_ball', name: 'Best Ball', desc: 'Lowest score from each side' },
  { value: 'high_low', name: 'High-Low', desc: 'Best + worst score combined' },
  { value: 'match_play', name: 'Match Play', desc: 'Hole-by-hole competition' },
  { value: 'skins', name: 'Skins', desc: 'Win outright to win the hole' }
]

const party1Name = computed(() => {
  if (party1.value.length === 0) return ''
  if (party1.value.length === 1) return party1.value[0].playerName
  return party1.value.map(p => p.playerName.split(' ')[0]).join(' & ')
})

const party2Name = computed(() => {
  if (party2.value.length === 0) return ''
  if (party2.value.length === 1) return party2.value[0].playerName
  return party2.value.map(p => p.playerName.split(' ')[0]).join(' & ')
})

const canProceed = computed(() => {
  switch (setupStep.value) {
    case 1: return party1.value.length > 0 && party2.value.length > 0
    case 2: return gameType.value
    case 3: return true
    default: return false
  }
})

onMounted(async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
  startHole.value = props.currentHole
})

watch(() => props.currentHole, async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
})

function startCreate() {
  view.value = 'create'
  setupStep.value = 1
  resetForm()
}

function resetForm() {
  betName.value = ''
  gameType.value = 'nassau'
  nassauFormat.value = '9-9'
  useHighLow.value = false
  party1.value = []
  party2.value = []
  frontAmount.value = 6
  middleAmount.value = 6
  backAmount.value = 6
  overallAmount.value = 6
  perHoleAmount.value = 1
  startHole.value = props.currentHole
}

function togglePlayer(player, party) {
  const target = party === 1 ? party1 : party2
  const other = party === 1 ? party2 : party1
  const playerData = { playerId: player.id, playerName: player.name, team: player.team }

  // Check if already in this party
  const idx = target.value.findIndex(p => p.playerId === player.id)
  if (idx >= 0) {
    target.value.splice(idx, 1)
  } else {
    // Remove from other party if present
    const otherIdx = other.value.findIndex(p => p.playerId === player.id)
    if (otherIdx >= 0) other.value.splice(otherIdx, 1)
    target.value.push(playerData)
  }
}

function selectTeam(team, party) {
  const target = party === 1 ? party1 : party2
  const other = party === 1 ? party2 : party1

  // Clear other party of these players
  team.players.forEach(p => {
    const idx = other.value.findIndex(op => op.playerId === p.id)
    if (idx >= 0) other.value.splice(idx, 1)
  })

  // Set this party to the team
  target.value = team.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    team: p.team
  }))
}

function isInParty(playerId, party) {
  const target = party === 1 ? party1.value : party2.value
  return target.some(p => p.playerId === playerId)
}

async function createBet() {
  const name = betName.value || `${party1Name.value} vs ${party2Name.value}`

  await sideBetsStore.createSideBet({
    tournament_id: props.tournamentId,
    name,
    game_type: gameType.value,
    nassau_format: gameType.value === 'nassau' ? nassauFormat.value : null,
    use_high_low: useHighLow.value,
    party1: party1.value,
    party2: party2.value,
    party1_name: party1Name.value,
    party2_name: party2Name.value,
    front_amount: frontAmount.value,
    middle_amount: nassauFormat.value === '6-6-6' ? middleAmount.value : 0,
    back_amount: backAmount.value,
    overall_amount: overallAmount.value,
    per_hole_amount: perHoleAmount.value,
    start_hole: startHole.value
  })

  await sideBetsStore.fetchSideBets(props.tournamentId)
  view.value = 'list'
  resetForm()
}

async function deleteBet(betId) {
  if (confirm('Delete this side bet and all its presses?')) {
    await sideBetsStore.deleteSideBet(betId)
  }
}

async function press(bet, segment) {
  const amount = segment === 'front' ? bet.front_amount :
                 segment === 'middle' ? bet.middle_amount :
                 segment === 'back' ? bet.back_amount : bet.overall_amount

  await sideBetsStore.createPress(bet.id, {
    segment,
    start_hole: props.currentHole,
    amount
  })
  await sideBetsStore.fetchSideBets(props.tournamentId)
}

async function pressAPress(parentBetId, pressItem) {
  await sideBetsStore.createPress(parentBetId, {
    segment: pressItem.segment,
    start_hole: props.currentHole,
    amount: pressItem.front_amount || pressItem.middle_amount || pressItem.back_amount || pressItem.overall_amount
  })
  await sideBetsStore.fetchSideBets(props.tournamentId)
}

function getStatusDisplay(status, segment) {
  if (!status || !status[segment]) return '-'
  const s = status[segment]
  if (s.holesPlayed === 0) return '-'
  return s.display
}

function getStatusColor(status, segment, party1Name) {
  if (!status || !status[segment]) return 'text-gray-400'
  const s = status[segment]
  if (s.leader === 'tied') return 'text-yellow-400'
  return s.leader === 'party1' ? 'text-green-400' : 'text-red-400'
}

function getWinnerName(status, segment, p1Name, p2Name) {
  if (!status || !status[segment]) return ''
  const s = status[segment]
  if (s.leader === 'tied') return 'All Square'
  const winner = s.leader === 'party1' ? p1Name : p2Name
  return `${winner} ${s.display}`
}

function canPress(bet, segment) {
  if (!bet.status || !bet.status[segment]) return false
  const s = bet.status[segment]
  // Can press if losing and holes remaining
  return s.diff !== 0 && s.holesRemaining > 0
}
</script>

<template>
  <div class="bg-gray-900 rounded-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-800">
      <h3 class="text-xl font-bold">
        {{ view === 'list' ? 'Side Bets' : 'New Side Bet' }}
      </h3>
      <button @click="emit('close')" class="text-gray-400 hover:text-white">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- LIST VIEW -->
      <template v-if="view === 'list'">
        <div v-if="sideBetsStore.sideBets.length === 0" class="text-center py-8">
          <div class="text-4xl mb-2">🤝</div>
          <p class="text-gray-400">No side bets yet</p>
          <p class="text-sm text-gray-500 mt-1">Add a bet between players or teams</p>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="bet in sideBetsStore.sideBets"
            :key="bet.id"
            class="bg-gray-800 rounded-xl p-4"
          >
            <!-- Bet Header -->
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="font-bold">{{ bet.party1_name }} vs {{ bet.party2_name }}</div>
                <div class="text-xs text-gray-400">
                  {{ gameTypes.find(g => g.value === bet.game_type)?.name }}
                  <span v-if="bet.nassau_format"> ({{ bet.nassau_format }})</span>
                  <span v-if="bet.use_high_low"> - High/Low</span>
                </div>
              </div>
              <button @click="deleteBet(bet.id)" class="text-red-400 hover:text-red-300 text-xs">
                Delete
              </button>
            </div>

            <!-- Nassau Segments -->
            <template v-if="bet.game_type === 'nassau'">
              <div class="grid gap-2" :class="bet.nassau_format === '6-6-6' ? 'grid-cols-4' : 'grid-cols-3'">
                <!-- Front -->
                <div class="bg-gray-700/50 rounded-lg p-2 text-center">
                  <div class="text-xs text-gray-400">{{ bet.nassau_format === '6-6-6' ? '1-6' : '1-9' }}</div>
                  <div class="font-bold">${{ bet.front_amount }}</div>
                  <div :class="getStatusColor(bet.status, 'front')" class="text-sm font-semibold">
                    {{ getStatusDisplay(bet.status, 'front') }}
                  </div>
                  <button
                    v-if="canPress(bet, 'front')"
                    @click="press(bet, 'front')"
                    class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30 w-full"
                  >
                    Press
                  </button>
                </div>

                <!-- Middle (6-6-6 only) -->
                <div v-if="bet.nassau_format === '6-6-6'" class="bg-gray-700/50 rounded-lg p-2 text-center">
                  <div class="text-xs text-gray-400">7-12</div>
                  <div class="font-bold">${{ bet.middle_amount }}</div>
                  <div :class="getStatusColor(bet.status, 'middle')" class="text-sm font-semibold">
                    {{ getStatusDisplay(bet.status, 'middle') }}
                  </div>
                  <button
                    v-if="canPress(bet, 'middle')"
                    @click="press(bet, 'middle')"
                    class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30 w-full"
                  >
                    Press
                  </button>
                </div>

                <!-- Back -->
                <div class="bg-gray-700/50 rounded-lg p-2 text-center">
                  <div class="text-xs text-gray-400">{{ bet.nassau_format === '6-6-6' ? '13-18' : '10-18' }}</div>
                  <div class="font-bold">${{ bet.back_amount }}</div>
                  <div :class="getStatusColor(bet.status, 'back')" class="text-sm font-semibold">
                    {{ getStatusDisplay(bet.status, 'back') }}
                  </div>
                  <button
                    v-if="canPress(bet, 'back')"
                    @click="press(bet, 'back')"
                    class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30 w-full"
                  >
                    Press
                  </button>
                </div>

                <!-- Overall -->
                <div class="bg-gray-700/50 rounded-lg p-2 text-center">
                  <div class="text-xs text-gray-400">Overall</div>
                  <div class="font-bold">${{ bet.overall_amount }}</div>
                  <div :class="getStatusColor(bet.status, 'overall')" class="text-sm font-semibold">
                    {{ getStatusDisplay(bet.status, 'overall') }}
                  </div>
                  <button
                    v-if="canPress(bet, 'overall')"
                    @click="press(bet, 'overall')"
                    class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30 w-full"
                  >
                    Press
                  </button>
                </div>
              </div>
            </template>

            <!-- Match Play / Best Ball / High-Low -->
            <template v-else-if="['match_play', 'best_ball', 'high_low'].includes(bet.game_type)">
              <div class="bg-gray-700/50 rounded-lg p-3 text-center">
                <div :class="getStatusColor(bet.status, 'overall')" class="text-2xl font-bold">
                  {{ getWinnerName(bet.status, 'overall', bet.party1_name, bet.party2_name) || 'All Square' }}
                </div>
                <div class="text-sm text-gray-400 mt-1">
                  {{ bet.status?.overall?.holesPlayed || 0 }} holes played
                </div>
              </div>
            </template>

            <!-- Presses -->
            <div v-if="bet.presses?.length" class="mt-3 pt-3 border-t border-gray-700">
              <div class="text-xs text-gray-400 mb-2">Presses</div>
              <div class="space-y-2">
                <div
                  v-for="pressItem in bet.presses"
                  :key="pressItem.id"
                  class="bg-gray-700/30 rounded-lg p-2 flex items-center justify-between"
                >
                  <div>
                    <span class="text-gold text-sm font-semibold">Press</span>
                    <span class="text-gray-400 text-xs ml-1">
                      {{ pressItem.segment }} from #{{ pressItem.start_hole }}
                    </span>
                    <span class="text-white text-sm ml-2">
                      ${{ pressItem.front_amount || pressItem.middle_amount || pressItem.back_amount || pressItem.overall_amount }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span :class="getStatusColor(pressItem.status, pressItem.segment)" class="text-sm">
                      {{ getStatusDisplay(pressItem.status, pressItem.segment) }}
                    </span>
                    <button
                      v-if="canPress(pressItem, pressItem.segment)"
                      @click="pressAPress(bet.id, pressItem)"
                      class="px-2 py-0.5 bg-gold/20 text-gold text-xs rounded hover:bg-gold/30"
                    >
                      Press
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add Button -->
        <button
          @click="startCreate"
          class="mt-4 w-full p-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-colors"
        >
          + Add Side Bet
        </button>
      </template>

      <!-- CREATE WIZARD -->
      <template v-else>
        <!-- Step 1: Who's Playing -->
        <div v-if="setupStep === 1">
          <h4 class="font-semibold mb-4">Who's betting?</h4>

          <!-- Team Selection (if team game) -->
          <div v-if="isTeamGame && teams.length >= 2" class="mb-4">
            <div class="text-sm text-gray-400 mb-2">Quick select teams:</div>
            <div class="grid grid-cols-2 gap-2 mb-4">
              <div v-for="team in teams" :key="team.team">
                <button
                  @click="selectTeam(team, 1)"
                  :class="[
                    'w-full p-2 rounded-lg text-sm mb-1',
                    party1.some(p => p.team === team.team) ? 'bg-green-600 text-white' : 'bg-gray-700'
                  ]"
                >
                  {{ team.name }} → Side A
                </button>
                <button
                  @click="selectTeam(team, 2)"
                  :class="[
                    'w-full p-2 rounded-lg text-sm',
                    party2.some(p => p.team === team.team) ? 'bg-red-600 text-white' : 'bg-gray-700'
                  ]"
                >
                  {{ team.name }} → Side B
                </button>
              </div>
            </div>
          </div>

          <!-- Individual Player Selection -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm font-semibold text-green-400 mb-2">Side A</div>
              <div class="space-y-1">
                <button
                  v-for="player in players"
                  :key="'p1-' + player.id"
                  @click="togglePlayer(player, 1)"
                  :class="[
                    'w-full p-2 rounded-lg text-sm text-left transition-all',
                    isInParty(player.id, 1)
                      ? 'bg-green-600 text-white'
                      : isInParty(player.id, 2)
                        ? 'bg-gray-800 text-gray-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                  ]"
                >
                  {{ player.name }}
                </button>
              </div>
            </div>
            <div>
              <div class="text-sm font-semibold text-red-400 mb-2">Side B</div>
              <div class="space-y-1">
                <button
                  v-for="player in players"
                  :key="'p2-' + player.id"
                  @click="togglePlayer(player, 2)"
                  :class="[
                    'w-full p-2 rounded-lg text-sm text-left transition-all',
                    isInParty(player.id, 2)
                      ? 'bg-red-600 text-white'
                      : isInParty(player.id, 1)
                        ? 'bg-gray-800 text-gray-500'
                        : 'bg-gray-700 hover:bg-gray-600'
                  ]"
                >
                  {{ player.name }}
                </button>
              </div>
            </div>
          </div>

          <div v-if="party1.length && party2.length" class="mt-4 p-3 bg-gray-800 rounded-lg text-center">
            <span class="text-green-400">{{ party1Name }}</span>
            <span class="text-gray-400 mx-2">vs</span>
            <span class="text-red-400">{{ party2Name }}</span>
          </div>
        </div>

        <!-- Step 2: Game Type -->
        <div v-if="setupStep === 2">
          <h4 class="font-semibold mb-4">What type of bet?</h4>

          <div class="space-y-2 mb-4">
            <button
              v-for="gt in gameTypes"
              :key="gt.value"
              @click="gameType = gt.value"
              :class="[
                'w-full p-3 rounded-xl text-left transition-all border-2',
                gameType === gt.value ? 'border-golf-green bg-golf-green/10' : 'border-gray-700'
              ]"
            >
              <div class="font-semibold">{{ gt.name }}</div>
              <div class="text-xs text-gray-400">{{ gt.desc }}</div>
            </button>
          </div>

          <!-- Nassau Format -->
          <div v-if="gameType === 'nassau'" class="mt-4">
            <div class="text-sm text-gray-400 mb-2">Nassau Format</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="nassauFormat = '9-9'"
                :class="[
                  'p-2 rounded-lg text-sm',
                  nassauFormat === '9-9' ? 'bg-golf-green text-white' : 'bg-gray-700'
                ]"
              >
                9-9 (Front, Back, Overall)
              </button>
              <button
                @click="nassauFormat = '6-6-6'"
                :class="[
                  'p-2 rounded-lg text-sm',
                  nassauFormat === '6-6-6' ? 'bg-golf-green text-white' : 'bg-gray-700'
                ]"
              >
                6-6-6 (Front, Mid, Back, Overall)
              </button>
            </div>
          </div>

          <!-- High-Low Option -->
          <div v-if="['best_ball', 'nassau'].includes(gameType) && party1.length > 1" class="mt-4">
            <label class="flex items-center gap-2">
              <input type="checkbox" v-model="useHighLow" class="rounded">
              <span class="text-sm">Use High-Low scoring (best + worst)</span>
            </label>
          </div>
        </div>

        <!-- Step 3: Amounts -->
        <div v-if="setupStep === 3">
          <h4 class="font-semibold mb-4">Bet amounts</h4>

          <template v-if="gameType === 'nassau'">
            <div class="grid gap-3" :class="nassauFormat === '6-6-6' ? 'grid-cols-2' : ''">
              <div class="flex items-center gap-2">
                <label class="w-20 text-sm text-gray-400">{{ nassauFormat === '6-6-6' ? 'Front (1-6)' : 'Front 9' }}</label>
                <span>$</span>
                <input v-model.number="frontAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
              </div>
              <div v-if="nassauFormat === '6-6-6'" class="flex items-center gap-2">
                <label class="w-20 text-sm text-gray-400">Mid (7-12)</label>
                <span>$</span>
                <input v-model.number="middleAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
              </div>
              <div class="flex items-center gap-2">
                <label class="w-20 text-sm text-gray-400">{{ nassauFormat === '6-6-6' ? 'Back (13-18)' : 'Back 9' }}</label>
                <span>$</span>
                <input v-model.number="backAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
              </div>
              <div class="flex items-center gap-2">
                <label class="w-20 text-sm text-gray-400">Overall</label>
                <span>$</span>
                <input v-model.number="overallAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
              </div>
            </div>

            <div class="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
              <div class="text-gray-400">Max exposure per side:</div>
              <div class="text-xl font-bold text-gold">
                ${{ frontAmount + (nassauFormat === '6-6-6' ? middleAmount : 0) + backAmount + overallAmount }}
              </div>
            </div>
          </template>

          <template v-else-if="gameType === 'skins'">
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-400">Per skin</label>
              <span>$</span>
              <input v-model.number="perHoleAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
            </div>
          </template>

          <template v-else>
            <div class="flex items-center gap-2">
              <label class="text-sm text-gray-400">Match bet</label>
              <span>$</span>
              <input v-model.number="overallAmount" type="number" min="0" class="flex-1 p-2 bg-gray-700 rounded-lg">
            </div>
          </template>

          <!-- Starting Hole -->
          <div class="mt-4">
            <label class="text-sm text-gray-400 block mb-2">Starting hole</label>
            <input v-model.number="startHole" type="number" min="1" max="18" class="w-20 p-2 bg-gray-700 rounded-lg">
            <span class="text-sm text-gray-400 ml-2">(current: {{ currentHole }})</span>
          </div>

          <!-- Summary -->
          <div class="mt-4 p-3 bg-golf-green/10 border border-golf-green/30 rounded-lg">
            <div class="font-semibold text-golf-green mb-1">Ready to go!</div>
            <div class="text-sm text-gray-300">
              {{ party1Name }} vs {{ party2Name }}<br>
              {{ gameTypes.find(g => g.value === gameType)?.name }}
              <span v-if="nassauFormat && gameType === 'nassau'"> ({{ nassauFormat }})</span>
              <span v-if="useHighLow"> with High-Low</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-gray-800">
      <div v-if="view === 'create'" class="flex gap-2">
        <button
          @click="setupStep > 1 ? setupStep-- : view = 'list'"
          class="flex-1 btn-secondary"
        >
          {{ setupStep === 1 ? 'Cancel' : 'Back' }}
        </button>
        <button
          v-if="setupStep < 3"
          @click="setupStep++"
          :disabled="!canProceed"
          :class="['flex-1', canProceed ? 'btn-primary' : 'btn-secondary opacity-50']"
        >
          Next
        </button>
        <button
          v-else
          @click="createBet"
          class="flex-1 btn-gold"
        >
          Create Bet
        </button>
      </div>
      <div v-else class="text-xs text-gray-500 text-center">
        Hole {{ currentHole }} of 18
      </div>
    </div>
  </div>
</template>
