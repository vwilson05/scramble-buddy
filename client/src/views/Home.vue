<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useMultiDayStore } from '../stores/multiday'

const router = useRouter()
const store = useTournamentStore()
const multiDayStore = useMultiDayStore()

const activeTournaments = ref([])
const recentTournaments = ref([])
const multiDayTournaments = ref([])
const confirmDelete = ref(null)
const confirmDeleteMultiDay = ref(null)

onMounted(async () => {
  await Promise.all([
    store.fetchTournaments(),
    multiDayStore.fetchMultiDayList()
  ])
  refreshLists()
})

function refreshLists() {
  // Filter out rounds that belong to multi-day tournaments
  const standaloneTournaments = store.tournaments.filter(t => !t.multi_day_id)
  activeTournaments.value = standaloneTournaments.filter(t => t.status === 'active' || t.status === 'setup')
  recentTournaments.value = standaloneTournaments
    .filter(t => t.status === 'completed')
    .slice(0, 5)
  multiDayTournaments.value = multiDayStore.multiDayList
}

function startNewTournament() {
  router.push('/setup')
}

function startMultiDayTournament() {
  router.push('/multiday/setup')
}

function continueMultiDay(tournament) {
  router.push(`/multiday/${tournament.slug || tournament.id}`)
}

function continueTournament(tournament) {
  const identifier = tournament.slug || tournament.id
  router.push(`/tournament/${identifier}`)
}

async function deleteRound(id, event) {
  event.stopPropagation()
  if (confirmDelete.value === id) {
    await store.deleteTournament(id)
    refreshLists()
    confirmDelete.value = null
  } else {
    confirmDelete.value = id
    setTimeout(() => {
      if (confirmDelete.value === id) confirmDelete.value = null
    }, 3000)
  }
}

function cancelDelete(event) {
  event.stopPropagation()
  confirmDelete.value = null
}

async function deleteMultiDay(id, event) {
  event.stopPropagation()
  if (confirmDeleteMultiDay.value === id) {
    await multiDayStore.deleteMultiDay(id)
    refreshLists()
    confirmDeleteMultiDay.value = null
  } else {
    confirmDeleteMultiDay.value = id
    setTimeout(() => {
      if (confirmDeleteMultiDay.value === id) confirmDeleteMultiDay.value = null
    }, 3000)
  }
}

function cancelDeleteMultiDay(event) {
  event.stopPropagation()
  confirmDeleteMultiDay.value = null
}
</script>

<template>
  <div class="min-h-screen p-4 pb-20">
    <!-- Header -->
    <div class="text-center py-8 animate-slide-up">
      <h1 class="text-4xl font-bold mb-2">
        <span class="text-golf-green">18</span>
        <span class="text-gold">Eagles</span>
      </h1>
      <p class="text-gray-400">The best golf tournament app for you and your buddies</p>
    </div>

    <!-- Main Actions -->
    <div class="max-w-md mx-auto mb-8 space-y-3">
      <button
        @click="startNewTournament"
        class="w-full btn-primary text-xl py-5 flex items-center justify-center gap-3 animate-pulse-gold"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
        </svg>
        Start Single Round
      </button>

      <button
        @click="startMultiDayTournament"
        class="w-full bg-gradient-to-r from-golf-green to-gold text-dark text-lg py-4 rounded-xl font-bold flex items-center justify-center gap-3"
      >
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Multi-Day Tournament
      </button>
    </div>

    <!-- Multi-Day Tournaments -->
    <div v-if="multiDayTournaments.length > 0" class="max-w-md mx-auto mb-8 animate-slide-up">
      <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Multi-Day Tournaments
      </h2>
      <div class="space-y-3">
        <div
          v-for="tournament in multiDayTournaments"
          :key="tournament.id"
          @click="continueMultiDay(tournament)"
          class="card cursor-pointer hover:border-gold transition-colors border-l-4 border-l-gold"
        >
          <div class="flex justify-between items-center">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ tournament.name }}</h3>
              <p class="text-sm text-gray-400">
                {{ tournament.num_rounds }} rounds over {{ tournament.num_days }} days
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span :class="[
                'text-xs px-2 py-1 rounded-full',
                tournament.status === 'active' ? 'bg-golf-green/20 text-golf-green' :
                tournament.status === 'completed' ? 'bg-gray-500/20 text-gray-400' :
                'bg-yellow-500/20 text-yellow-400'
              ]">
                {{ tournament.status.toUpperCase() }}
              </span>
              <button
                v-if="confirmDeleteMultiDay !== tournament.id"
                @click="deleteMultiDay(tournament.id, $event)"
                class="p-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div v-else class="flex items-center gap-1">
                <button
                  @click="deleteMultiDay(tournament.id, $event)"
                  class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  @click="cancelDeleteMultiDay($event)"
                  class="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active Tournaments -->
    <div v-if="activeTournaments.length > 0" class="max-w-md mx-auto mb-8 animate-slide-up">
      <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        Active Rounds
      </h2>
      <div class="space-y-3">
        <div
          v-for="tournament in activeTournaments"
          :key="tournament.id"
          @click="continueTournament(tournament)"
          class="card cursor-pointer hover:border-golf-green transition-colors"
        >
          <div class="flex justify-between items-center">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold truncate">{{ tournament.name }}</h3>
              <p class="text-sm text-gray-400 truncate">{{ tournament.course_name }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span v-if="tournament.status === 'setup'" class="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                SETUP
              </span>
              <span v-else class="text-xs bg-golf-green/20 text-golf-green px-2 py-1 rounded-full">
                {{ tournament.game_type.replace('_', ' ').toUpperCase() }}
              </span>
              <button
                v-if="confirmDelete !== tournament.id"
                @click="deleteRound(tournament.id, $event)"
                class="p-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div v-else class="flex items-center gap-1">
                <button
                  @click="deleteRound(tournament.id, $event)"
                  class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  @click="cancelDelete($event)"
                  class="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Tournaments -->
    <div v-if="recentTournaments.length > 0" class="max-w-md mx-auto animate-slide-up">
      <h2 class="text-xl font-semibold mb-4 text-gray-400">Recent Rounds</h2>
      <div class="space-y-2">
        <div
          v-for="tournament in recentTournaments"
          :key="tournament.id"
          @click="continueTournament(tournament)"
          class="card cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
        >
          <div class="flex justify-between items-center">
            <div class="flex-1 min-w-0">
              <h3 class="font-medium truncate">{{ tournament.name }}</h3>
              <p class="text-sm text-gray-500 truncate">{{ tournament.course_name }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <div class="text-right text-sm text-gray-500">
                {{ new Date(tournament.date).toLocaleDateString() }}
              </div>
              <button
                v-if="confirmDelete !== tournament.id"
                @click="deleteRound(tournament.id, $event)"
                class="p-2 text-gray-500 hover:text-red-400 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div v-else class="flex items-center gap-1">
                <button
                  @click="deleteRound(tournament.id, $event)"
                  class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
                <button
                  @click="cancelDelete($event)"
                  class="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="activeTournaments.length === 0 && recentTournaments.length === 0" class="max-w-md mx-auto text-center py-12">
      <div class="text-6xl mb-4">
        <svg class="w-24 h-24 mx-auto text-gray-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
      <h3 class="text-xl font-semibold text-gray-400 mb-2">No rounds yet</h3>
      <p class="text-gray-500">Start your first round and track scores with your buddies!</p>
    </div>
  </div>
</template>
