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

const showAddBet = ref(false)
const betType = ref('player')
const party1Id = ref(null)
const party2Id = ref(null)
const frontAmount = ref(5)
const backAmount = ref(5)
const overallAmount = ref(5)
const autoPress = ref(0)

const isTeamGame = computed(() => tournamentStore.currentTournament?.is_team_game)
const players = computed(() => tournamentStore.players)
const teams = computed(() => {
  if (!isTeamGame.value) return []
  const teamNums = [...new Set(players.value.map(p => p.team).filter(t => t))]
  return teamNums.sort().map(num => ({
    id: num,
    name: `Team ${num}`,
    players: players.value.filter(p => p.team === num)
  }))
})

const availableParties = computed(() => {
  if (betType.value === 'team') return teams.value
  return players.value.map(p => ({ id: p.id, name: p.name }))
})

const party2Options = computed(() => {
  return availableParties.value.filter(p => p.id !== party1Id.value)
})

onMounted(async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
  await sideBetsStore.fetchSideBetStatus(props.tournamentId)
})

// Refresh status when current hole changes
watch(() => props.currentHole, async () => {
  await sideBetsStore.fetchSideBetStatus(props.tournamentId)
})

async function addSideBet() {
  if (!party1Id.value || !party2Id.value) return

  const party1 = availableParties.value.find(p => p.id === party1Id.value)
  const party2 = availableParties.value.find(p => p.id === party2Id.value)

  await sideBetsStore.createSideBet({
    tournament_id: props.tournamentId,
    bet_type: betType.value,
    party1_id: party1Id.value,
    party2_id: party2Id.value,
    party1_name: party1?.name,
    party2_name: party2?.name,
    front_amount: frontAmount.value,
    back_amount: backAmount.value,
    overall_amount: overallAmount.value,
    auto_press: autoPress.value
  })

  await sideBetsStore.fetchSideBetStatus(props.tournamentId)
  resetForm()
}

function resetForm() {
  showAddBet.value = false
  party1Id.value = null
  party2Id.value = null
  frontAmount.value = 5
  backAmount.value = 5
  overallAmount.value = 5
  autoPress.value = 0
}

async function deleteBet(betId) {
  if (confirm('Delete this side bet?')) {
    await sideBetsStore.deleteSideBet(betId)
  }
}

async function press(bet, segment) {
  const amount = bet[`${segment}_amount`]
  await sideBetsStore.createPress(bet.id, {
    segment,
    start_hole: props.currentHole,
    amount,
    parent_press_id: null
  })
  await sideBetsStore.fetchSideBetStatus(props.tournamentId)
}

async function pressAPress(bet, pressItem) {
  await sideBetsStore.createPress(bet.id, {
    segment: pressItem.segment,
    start_hole: props.currentHole,
    amount: pressItem.amount,
    parent_press_id: pressItem.id
  })
  await sideBetsStore.fetchSideBetStatus(props.tournamentId)
}

function getStatusColor(status) {
  if (!status) return 'text-gray-400'
  if (status.leader === 'party1') return 'text-green-400'
  if (status.leader === 'party2') return 'text-red-400'
  return 'text-yellow-400'
}

function formatStatus(status, party1Name, party2Name) {
  if (!status || status.holesPlayed === 0) return 'Not started'
  if (status.leader === 'tied') return 'AS'
  const leader = status.leader === 'party1' ? party1Name : party2Name
  const diff = Math.abs(status.diff)
  if (status.holesRemaining === 0) {
    return `${leader} wins ${diff} up`
  }
  if (diff >= status.holesRemaining) {
    return `${leader} ${diff}&${status.holesRemaining}`
  }
  return `${leader} ${diff} UP`
}
</script>

<template>
  <div class="bg-gray-900 rounded-xl p-4 max-h-[80vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-xl font-bold">Side Bets</h3>
      <button @click="emit('close')" class="text-gray-400 hover:text-white">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Existing Side Bets -->
    <div v-if="sideBetsStore.sideBetStatus.length" class="space-y-4 mb-6">
      <div
        v-for="bet in sideBetsStore.sideBetStatus"
        :key="bet.id"
        class="bg-gray-800 rounded-xl p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <div class="font-bold">
            {{ bet.party1_name }} vs {{ bet.party2_name }}
          </div>
          <button @click="deleteBet(bet.id)" class="text-red-400 hover:text-red-300 text-sm">
            Delete
          </button>
        </div>

        <!-- Segments -->
        <div class="grid grid-cols-3 gap-2 text-sm mb-3">
          <!-- Front -->
          <div class="bg-gray-700/50 rounded-lg p-2">
            <div class="text-gray-400 text-xs mb-1">Front 9</div>
            <div class="font-bold">${{ bet.front_amount }}</div>
            <div :class="getStatusColor(bet.status?.front)" class="text-xs">
              {{ formatStatus(bet.status?.front, bet.party1_name, bet.party2_name) }}
            </div>
            <button
              v-if="bet.status?.front?.diff !== 0 && bet.status?.front?.holesRemaining > 0 && currentHole <= 9"
              @click="press(bet, 'front')"
              class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30"
            >
              Press
            </button>
          </div>

          <!-- Back -->
          <div class="bg-gray-700/50 rounded-lg p-2">
            <div class="text-gray-400 text-xs mb-1">Back 9</div>
            <div class="font-bold">${{ bet.back_amount }}</div>
            <div :class="getStatusColor(bet.status?.back)" class="text-xs">
              {{ formatStatus(bet.status?.back, bet.party1_name, bet.party2_name) }}
            </div>
            <button
              v-if="bet.status?.back?.diff !== 0 && bet.status?.back?.holesRemaining > 0 && currentHole >= 10"
              @click="press(bet, 'back')"
              class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30"
            >
              Press
            </button>
          </div>

          <!-- Overall -->
          <div class="bg-gray-700/50 rounded-lg p-2">
            <div class="text-gray-400 text-xs mb-1">Overall</div>
            <div class="font-bold">${{ bet.overall_amount }}</div>
            <div :class="getStatusColor(bet.status?.overall)" class="text-xs">
              {{ formatStatus(bet.status?.overall, bet.party1_name, bet.party2_name) }}
            </div>
            <button
              v-if="bet.status?.overall?.diff !== 0 && bet.status?.overall?.holesRemaining > 0"
              @click="press(bet, 'overall')"
              class="mt-1 px-2 py-0.5 bg-golf-green/20 text-golf-green text-xs rounded hover:bg-golf-green/30"
            >
              Press
            </button>
          </div>
        </div>

        <!-- Active Presses -->
        <div v-if="bet.presses?.length" class="border-t border-gray-700 pt-3 mt-3">
          <div class="text-xs text-gray-400 mb-2">Active Presses</div>
          <div class="space-y-2">
            <div
              v-for="pressItem in bet.presses"
              :key="pressItem.id"
              class="flex items-center justify-between bg-gray-700/30 rounded p-2 text-sm"
            >
              <div>
                <span class="text-gold">Press</span>
                <span class="text-gray-400"> - {{ pressItem.segment }} from hole {{ pressItem.start_hole }}</span>
                <span class="ml-2">${{ pressItem.amount }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span :class="getStatusColor(pressItem.status)" class="text-xs">
                  {{ formatStatus(pressItem.status, bet.party1_name, bet.party2_name) }}
                </span>
                <button
                  v-if="pressItem.status?.diff !== 0 && pressItem.status?.holesRemaining > 0"
                  @click="pressAPress(bet, pressItem)"
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

    <div v-else class="text-center text-gray-400 py-8 mb-4">
      No side bets yet
    </div>

    <!-- Add New Bet -->
    <div v-if="!showAddBet">
      <button
        @click="showAddBet = true"
        class="w-full p-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-colors"
      >
        + Add Side Bet
      </button>
    </div>

    <div v-else class="bg-gray-800 rounded-xl p-4">
      <h4 class="font-semibold mb-3">New Side Bet</h4>

      <!-- Bet Type -->
      <div v-if="isTeamGame" class="mb-4">
        <div class="text-sm text-gray-400 mb-2">Bet Type</div>
        <div class="grid grid-cols-2 gap-2">
          <button
            @click="betType = 'player'; party1Id = null; party2Id = null"
            :class="[
              'p-2 rounded-lg text-sm transition-all',
              betType === 'player' ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
            ]"
          >
            Player vs Player
          </button>
          <button
            @click="betType = 'team'; party1Id = null; party2Id = null"
            :class="[
              'p-2 rounded-lg text-sm transition-all',
              betType === 'team' ? 'bg-golf-green text-white' : 'bg-gray-700 text-gray-400'
            ]"
          >
            Team vs Team
          </button>
        </div>
      </div>

      <!-- Party Selection -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div class="text-sm text-gray-400 mb-2">{{ betType === 'team' ? 'Team 1' : 'Player 1' }}</div>
          <select
            v-model="party1Id"
            class="w-full p-2 bg-gray-700 rounded-lg focus:outline-none"
          >
            <option :value="null">Select...</option>
            <option v-for="party in availableParties" :key="party.id" :value="party.id">
              {{ party.name }}
            </option>
          </select>
        </div>
        <div>
          <div class="text-sm text-gray-400 mb-2">{{ betType === 'team' ? 'Team 2' : 'Player 2' }}</div>
          <select
            v-model="party2Id"
            class="w-full p-2 bg-gray-700 rounded-lg focus:outline-none"
          >
            <option :value="null">Select...</option>
            <option v-for="party in party2Options" :key="party.id" :value="party.id">
              {{ party.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- Amounts -->
      <div class="text-sm text-gray-400 mb-2">Nassau Amounts</div>
      <div class="grid grid-cols-3 gap-2 mb-4">
        <div>
          <label class="text-xs text-gray-500 block mb-1">Front 9</label>
          <div class="flex items-center gap-1">
            <span class="text-gray-400">$</span>
            <input
              v-model.number="frontAmount"
              type="number"
              min="0"
              class="w-full p-2 bg-gray-700 rounded-lg focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">Back 9</label>
          <div class="flex items-center gap-1">
            <span class="text-gray-400">$</span>
            <input
              v-model.number="backAmount"
              type="number"
              min="0"
              class="w-full p-2 bg-gray-700 rounded-lg focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">Overall</label>
          <div class="flex items-center gap-1">
            <span class="text-gray-400">$</span>
            <input
              v-model.number="overallAmount"
              type="number"
              min="0"
              class="w-full p-2 bg-gray-700 rounded-lg focus:outline-none"
            />
          </div>
        </div>
      </div>

      <!-- Auto Press -->
      <div class="mb-4">
        <div class="text-sm text-gray-400 mb-2">Auto-Press (optional)</div>
        <div class="flex items-center gap-2">
          <span class="text-gray-400 text-sm">Press when down by</span>
          <select v-model.number="autoPress" class="p-2 bg-gray-700 rounded-lg">
            <option :value="0">Off</option>
            <option :value="2">2 holes</option>
            <option :value="3">3 holes</option>
          </select>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2">
        <button @click="resetForm" class="flex-1 btn-secondary">
          Cancel
        </button>
        <button
          @click="addSideBet"
          :disabled="!party1Id || !party2Id"
          :class="[
            'flex-1',
            party1Id && party2Id ? 'btn-gold' : 'btn-secondary opacity-50 cursor-not-allowed'
          ]"
        >
          Add Bet
        </button>
      </div>
    </div>
  </div>
</template>
