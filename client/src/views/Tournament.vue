<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'

const route = useRoute()
const router = useRouter()
const store = useTournamentStore()
const courseStore = useCourseStore()

const tournamentId = computed(() => route.params.id)

onMounted(async () => {
  await store.fetchTournament(tournamentId.value)
  if (store.currentTournament?.course_id) {
    await courseStore.selectCourse({ id: store.currentTournament.course_id })
  }
})

const statusColor = computed(() => {
  switch (store.currentTournament?.status) {
    case 'active': return 'bg-green-500'
    case 'completed': return 'bg-gray-500'
    default: return 'bg-yellow-500'
  }
})

function goToScorecard() {
  router.push(`/tournament/${tournamentId.value}/scorecard`)
}

function goToLeaderboard() {
  router.push(`/tournament/${tournamentId.value}/leaderboard`)
}

function goToResults() {
  router.push(`/tournament/${tournamentId.value}/results`)
}

async function finishRound() {
  if (confirm('Are you sure you want to finish this round?')) {
    await store.finishTournament(tournamentId.value)
    router.push(`/tournament/${tournamentId.value}/results`)
  }
}
</script>

<template>
  <div class="min-h-screen p-4">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6">
      <button @click="router.push('/')" class="text-gray-400 hover:text-white">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="flex-1">
        <h1 class="text-2xl font-bold">{{ store.currentTournament?.name }}</h1>
        <div class="flex items-center gap-2 text-gray-400 text-sm">
          <span :class="['w-2 h-2 rounded-full', statusColor]"></span>
          {{ store.currentTournament?.status?.toUpperCase() }}
        </div>
      </div>
    </div>

    <!-- Course Info -->
    <div class="card mb-6">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 bg-golf-green/20 rounded-xl flex items-center justify-center">
          <svg class="w-6 h-6 text-golf-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <div class="font-bold">{{ store.currentTournament?.course_name || 'No course selected' }}</div>
          <div class="text-sm text-gray-400">
            {{ store.currentTournament?.game_type?.replace('_', ' ').toUpperCase() }}
          </div>
        </div>
      </div>
    </div>

    <!-- Players -->
    <div class="mb-6">
      <h2 class="text-lg font-semibold mb-3">Players</h2>
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="player in store.players"
          :key="player.id"
          :class="[
            'card',
            player.team === 1 ? 'border-golf-green/30' : player.team === 2 ? 'border-gold/30' : ''
          ]"
        >
          <div class="font-semibold">{{ player.name }}</div>
          <div class="text-sm text-gray-400">
            {{ player.handicap }} HCP
            <span v-if="player.team" class="ml-2">Team {{ player.team }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bet Info -->
    <div v-if="store.currentTournament?.bet_amount" class="card mb-6">
      <h2 class="text-lg font-semibold mb-3">Stakes</h2>
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-gray-400">Main Bet</span>
          <span class="font-bold text-gold">${{ store.currentTournament.bet_amount }}</span>
        </div>
        <div v-if="store.currentTournament.greenie_amount" class="flex justify-between">
          <span class="text-gray-400">Greenies</span>
          <span class="font-bold text-gold">${{ store.currentTournament.greenie_amount }} each</span>
        </div>
        <div v-if="store.currentTournament.skins_amount" class="flex justify-between">
          <span class="text-gray-400">Skins</span>
          <span class="font-bold text-gold">${{ store.currentTournament.skins_amount }} per skin</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="space-y-3">
      <button @click="goToScorecard" class="w-full btn-primary">
        Enter Scores
      </button>
      <button @click="goToLeaderboard" class="w-full btn-secondary">
        View Leaderboard
      </button>
      <button
        v-if="store.currentTournament?.status === 'active'"
        @click="finishRound"
        class="w-full btn-gold"
      >
        Finish Round
      </button>
      <button
        v-if="store.currentTournament?.status === 'completed'"
        @click="goToResults"
        class="w-full btn-gold"
      >
        View Results
      </button>
    </div>
  </div>
</template>
