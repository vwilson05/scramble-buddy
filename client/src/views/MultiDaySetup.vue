<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMultiDayStore } from '../stores/multiday'

const router = useRouter()
const store = useMultiDayStore()

const step = ref(1)
const totalSteps = 4

// Step 1: Basic Info
const tournamentName = ref('')
const startDate = ref(new Date().toISOString().split('T')[0])
const endDate = ref('')
const numDays = ref(3)
const numRounds = ref(6)

// Step 2: Players
const players = ref([])
const newPlayerName = ref('')
const newPlayerHandicap = ref('')
const isTeamEvent = ref(false)

// Step 3: Point System
const pointSystem = ref([
  { place: 1, points: 10 },
  { place: 2, points: 8 },
  { place: 3, points: 6 },
  { place: 4, points: 5 },
  { place: 5, points: 4 },
  { place: 6, points: 3 },
  { place: 7, points: 2 },
  { place: 8, points: 1 }
])

// Step 4: Payouts
const payoutStructure = ref([
  { place: 1, type: 'percent', value: 50 },
  { place: 2, type: 'percent', value: 30 },
  { place: 3, type: 'percent', value: 20 }
])
const totalBuyIn = ref(100)

const loading = ref(false)
const error = ref(null)

// Computed
const canProceed = computed(() => {
  switch (step.value) {
    case 1:
      return tournamentName.value.trim() && startDate.value && numDays.value > 0 && numRounds.value > 0
    case 2:
      return players.value.length >= 2
    case 3:
      return pointSystem.value.length > 0
    case 4:
      return true
    default:
      return false
  }
})

const payoutTotal = computed(() => {
  return payoutStructure.value
    .filter(p => p.type === 'percent')
    .reduce((sum, p) => sum + p.value, 0)
})

// Methods
function addPlayer() {
  if (newPlayerName.value.trim()) {
    players.value.push({
      name: newPlayerName.value.trim(),
      handicap: parseFloat(newPlayerHandicap.value) || 0,
      team: isTeamEvent.value ? Math.ceil(players.value.length / 2) + 1 : null
    })
    newPlayerName.value = ''
    newPlayerHandicap.value = ''
  }
}

function removePlayer(index) {
  players.value.splice(index, 1)
  // Reassign teams if team event
  if (isTeamEvent.value) {
    players.value.forEach((p, i) => {
      p.team = Math.ceil((i + 1) / 2)
    })
  }
}

function addPointPlace() {
  const nextPlace = pointSystem.value.length + 1
  pointSystem.value.push({ place: nextPlace, points: 0 })
}

function removePointPlace(index) {
  pointSystem.value.splice(index, 1)
  pointSystem.value.forEach((p, i) => { p.place = i + 1 })
}

function addPayoutPlace() {
  const nextPlace = payoutStructure.value.length + 1
  payoutStructure.value.push({ place: nextPlace, type: 'percent', value: 0 })
}

function removePayoutPlace(index) {
  payoutStructure.value.splice(index, 1)
  payoutStructure.value.forEach((p, i) => { p.place = i + 1 })
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

async function createTournament() {
  loading.value = true
  error.value = null

  try {
    const data = await store.createMultiDay({
      name: tournamentName.value.trim(),
      start_date: startDate.value,
      end_date: endDate.value || null,
      num_days: numDays.value,
      num_rounds: numRounds.value,
      point_system: pointSystem.value,
      payout_structure: payoutStructure.value,
      players: players.value
    })

    // Navigate to the multi-day dashboard
    router.push(`/multiday/${data.id}`)
  } catch (err) {
    error.value = err.response?.data?.error || 'Failed to create tournament'
  } finally {
    loading.value = false
  }
}

function getPlaceSuffix(place) {
  if (place === 1) return 'st'
  if (place === 2) return 'nd'
  if (place === 3) return 'rd'
  return 'th'
}

function calculateEndDate() {
  if (startDate.value && numDays.value) {
    const start = new Date(startDate.value)
    start.setDate(start.getDate() + numDays.value - 1)
    endDate.value = start.toISOString().split('T')[0]
  }
}
</script>

<template>
  <div class="min-h-screen p-4 pb-24">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <button @click="router.push('/')" class="text-gray-400">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <h1 class="text-xl font-bold">Multi-Day Tournament</h1>
      <div class="w-6"></div>
    </div>

    <!-- Progress Bar -->
    <div class="mb-8">
      <div class="flex justify-between text-sm text-gray-400 mb-2">
        <span>Step {{ step }} of {{ totalSteps }}</span>
        <span>{{ Math.round((step / totalSteps) * 100) }}%</span>
      </div>
      <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-golf-green transition-all duration-300"
          :style="{ width: `${(step / totalSteps) * 100}%` }"
        ></div>
      </div>
    </div>

    <!-- Step 1: Basic Info -->
    <div v-if="step === 1" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-6">Tournament Details</h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Tournament Name</label>
          <input
            v-model="tournamentName"
            type="text"
            placeholder="e.g., Annual Golf Trip 2024"
            class="w-full p-4 bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-golf-green"
          />
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">Start Date</label>
            <input
              v-model="startDate"
              type="date"
              @change="calculateEndDate"
              class="w-full p-4 bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-2">Number of Days</label>
            <input
              v-model.number="numDays"
              type="number"
              min="1"
              max="14"
              @change="calculateEndDate"
              class="w-full p-4 bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-golf-green"
            />
          </div>
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-2">Total Rounds</label>
          <div class="flex gap-2">
            <button
              v-for="n in [2, 3, 4, 5, 6, 7, 8]"
              :key="n"
              @click="numRounds = n"
              :class="[
                'flex-1 py-3 rounded-xl font-semibold transition-all',
                numRounds === n ? 'bg-golf-green text-white' : 'bg-gray-800 text-gray-400'
              ]"
            >
              {{ n }}
            </button>
          </div>
          <p class="text-sm text-gray-500 mt-2">
            {{ numRounds }} rounds over {{ numDays }} days ({{ (numRounds / numDays).toFixed(1) }} rounds/day avg)
          </p>
        </div>
      </div>
    </div>

    <!-- Step 2: Players -->
    <div v-if="step === 2" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-6">Players</h2>

      <div class="mb-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            v-model="isTeamEvent"
            type="checkbox"
            class="w-5 h-5 rounded bg-gray-800 border-gray-600 text-golf-green focus:ring-golf-green"
          />
          <span>Team event (auto-assign partners)</span>
        </label>
      </div>

      <div class="flex gap-2 mb-4">
        <input
          v-model="newPlayerName"
          type="text"
          placeholder="Player name"
          @keyup.enter="addPlayer"
          class="flex-1 p-4 bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-golf-green"
        />
        <input
          v-model="newPlayerHandicap"
          type="number"
          placeholder="HCP"
          @keyup.enter="addPlayer"
          class="w-20 p-4 bg-gray-800 rounded-xl text-center focus:outline-none focus:ring-2 focus:ring-golf-green"
        />
        <button
          @click="addPlayer"
          :disabled="!newPlayerName.trim()"
          class="px-6 py-4 bg-golf-green rounded-xl font-semibold disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div class="space-y-2">
        <div
          v-for="(player, index) in players"
          :key="index"
          class="flex items-center justify-between p-4 bg-gray-800 rounded-xl"
        >
          <div class="flex items-center gap-3">
            <div v-if="isTeamEvent" class="w-8 h-8 rounded-full bg-golf-green/20 flex items-center justify-center text-golf-green font-bold text-sm">
              T{{ player.team }}
            </div>
            <div>
              <div class="font-semibold">{{ player.name }}</div>
              <div class="text-sm text-gray-400">Handicap: {{ player.handicap }}</div>
            </div>
          </div>
          <button @click="removePlayer(index)" class="text-red-400 p-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      <p v-if="players.length < 2" class="text-center text-gray-500 mt-6">
        Add at least 2 players to continue
      </p>
    </div>

    <!-- Step 3: Point System -->
    <div v-if="step === 3" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Point System</h2>
      <p class="text-gray-400 mb-6">Points awarded per round based on finishing position</p>

      <div class="space-y-3 mb-4">
        <div
          v-for="(point, index) in pointSystem"
          :key="index"
          class="flex items-center gap-3 p-3 bg-gray-800 rounded-xl"
        >
          <div class="w-12 text-center font-bold text-gold">
            {{ point.place }}{{ getPlaceSuffix(point.place) }}
          </div>
          <input
            v-model.number="point.points"
            type="number"
            min="0"
            class="flex-1 p-3 bg-gray-700 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-golf-green"
          />
          <span class="text-gray-400">pts</span>
          <button
            v-if="pointSystem.length > 1"
            @click="removePointPlace(index)"
            class="text-red-400 p-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <button @click="addPointPlace" class="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-all">
        + Add Place
      </button>

      <div class="mt-6 p-4 bg-gray-800 rounded-xl">
        <h3 class="font-semibold mb-2">Preview</h3>
        <p class="text-sm text-gray-400">
          With {{ numRounds }} rounds, max possible points: {{ pointSystem[0]?.points * numRounds || 0 }}
        </p>
      </div>
    </div>

    <!-- Step 4: Payouts -->
    <div v-if="step === 4" class="animate-slide-up">
      <h2 class="text-2xl font-bold mb-2">Overall Payouts</h2>
      <p class="text-gray-400 mb-6">Final standings payout structure</p>

      <div class="mb-6">
        <label class="block text-sm text-gray-400 mb-2">Total Prize Pool ($)</label>
        <input
          v-model.number="totalBuyIn"
          type="number"
          min="0"
          placeholder="0"
          class="w-full p-4 bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-golf-green"
        />
      </div>

      <div class="space-y-3 mb-4">
        <div
          v-for="(payout, index) in payoutStructure"
          :key="index"
          class="flex items-center gap-3 p-3 bg-gray-800 rounded-xl"
        >
          <div class="w-12 text-center font-bold text-gold">
            {{ payout.place }}{{ getPlaceSuffix(payout.place) }}
          </div>
          <input
            v-model.number="payout.value"
            type="number"
            min="0"
            class="flex-1 p-3 bg-gray-700 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-golf-green"
          />
          <select v-model="payout.type" class="p-3 bg-gray-700 rounded-lg">
            <option value="percent">%</option>
            <option value="fixed">$</option>
          </select>
          <span v-if="payout.type === 'percent'" class="text-gray-400 w-16">
            ${{ Math.round(totalBuyIn * payout.value / 100) }}
          </span>
          <button
            v-if="payoutStructure.length > 1"
            @click="removePayoutPlace(index)"
            class="text-red-400 p-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <button @click="addPayoutPlace" class="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-all mb-4">
        + Add Place
      </button>

      <div v-if="payoutTotal !== 100" class="p-3 bg-orange-500/20 border border-orange-500/50 rounded-lg text-orange-400 text-sm">
        Payout total: {{ payoutTotal }}% (should be 100%)
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mt-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400">
      {{ error }}
    </div>

    <!-- Navigation Buttons -->
    <div class="fixed bottom-0 left-0 right-0 bg-dark border-t border-gray-800 p-4">
      <div class="flex gap-3 max-w-md mx-auto">
        <button
          v-if="step > 1"
          @click="prevStep"
          class="flex-1 py-4 bg-gray-800 rounded-xl font-semibold"
        >
          Back
        </button>
        <button
          v-if="step < totalSteps"
          @click="nextStep"
          :disabled="!canProceed"
          class="flex-1 py-4 bg-golf-green rounded-xl font-semibold disabled:opacity-50"
        >
          Continue
        </button>
        <button
          v-if="step === totalSteps"
          @click="createTournament"
          :disabled="loading"
          class="flex-1 py-4 bg-gold text-dark rounded-xl font-bold disabled:opacity-50"
        >
          {{ loading ? 'Creating...' : 'Create Tournament' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
