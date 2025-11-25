<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useSideBetsStore } from '../stores/sidebets'
import { useTournamentStore } from '../stores/tournament'
import axios from 'axios'

const props = defineProps({
  tournamentId: { type: [String, Number], required: true },
  currentHole: { type: Number, default: 1 }
})

const emit = defineEmits(['close'])

const sideBetsStore = useSideBetsStore()
const tournamentStore = useTournamentStore()

// View state
const view = ref('list') // 'list', 'create', 'press'
const setupStep = ref(1)
const pressingBet = ref(null)
const pressingSegment = ref(null)
const leaderboardData = ref(null)

// Setup wizard data
const betName = ref('')
const gameType = ref('nassau')
const nassauFormat = ref('6-6-6')
const useHighLow = ref(false)
const party1 = ref([])
const party2 = ref([])
const segmentAmount = ref(10)
const overallAmount = ref(20)
const autoDoubleOverall = ref(true)
const perHoleAmount = ref(5)
const startHole = ref(1)

const players = computed(() => tournamentStore.players)
const tournament = computed(() => tournamentStore.currentTournament)

// Check if tournament has a main Nassau bet configured
const hasMainBet = computed(() => {
  const t = tournament.value
  return t && t.game_type === 'nassau' && (t.nassau_segment_bet > 0 || t.nassau_overall_bet > 0)
})

const mainBetFormat = computed(() => tournament.value?.nassau_format || '6-6-6')

// Calculate segment leaders from leaderboard data
const segmentLeaders = computed(() => {
  if (!leaderboardData.value?.leaderboard) return {}
  const lb = leaderboardData.value.leaderboard
  const format = mainBetFormat.value

  const result = {}

  // Calculate front 9 / front 6 leader
  if (format === '6-6-6') {
    // Front 6 - sum of holes 1-6
    const front6Scores = lb.map(p => ({
      player: p.player,
      score: p.holeScores?.slice(0, 6).reduce((sum, h) => sum + (h.net || 0), 0) || 0,
      holesPlayed: p.holeScores?.slice(0, 6).filter(h => h.gross).length || 0
    })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

    if (front6Scores.length > 0) {
      result.front = { leader: front6Scores[0], all: front6Scores, range: '1-6' }
    }

    // Middle 6 - sum of holes 7-12
    const mid6Scores = lb.map(p => ({
      player: p.player,
      score: p.holeScores?.slice(6, 12).reduce((sum, h) => sum + (h.net || 0), 0) || 0,
      holesPlayed: p.holeScores?.slice(6, 12).filter(h => h.gross).length || 0
    })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

    if (mid6Scores.length > 0) {
      result.middle = { leader: mid6Scores[0], all: mid6Scores, range: '7-12' }
    }

    // Back 6 - sum of holes 13-18
    const back6Scores = lb.map(p => ({
      player: p.player,
      score: p.holeScores?.slice(12, 18).reduce((sum, h) => sum + (h.net || 0), 0) || 0,
      holesPlayed: p.holeScores?.slice(12, 18).filter(h => h.gross).length || 0
    })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

    if (back6Scores.length > 0) {
      result.back = { leader: back6Scores[0], all: back6Scores, range: '13-18' }
    }
  } else {
    // 9-9 format
    const front9Scores = lb.map(p => ({
      player: p.player,
      score: p.front9Net || 0,
      holesPlayed: p.holeScores?.slice(0, 9).filter(h => h.gross).length || 0
    })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

    if (front9Scores.length > 0) {
      result.front = { leader: front9Scores[0], all: front9Scores, range: '1-9' }
    }

    const back9Scores = lb.map(p => ({
      player: p.player,
      score: p.back9Net || 0,
      holesPlayed: p.holeScores?.slice(9, 18).filter(h => h.gross).length || 0
    })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

    if (back9Scores.length > 0) {
      result.back = { leader: back9Scores[0], all: back9Scores, range: '10-18' }
    }
  }

  // Overall - use netTotal
  const overallScores = lb.map(p => ({
    player: p.player,
    score: p.netTotal || 0,
    holesPlayed: p.holesPlayed || 0
  })).filter(p => p.holesPlayed > 0).sort((a, b) => a.score - b.score)

  if (overallScores.length > 0) {
    result.overall = { leader: overallScores[0], all: overallScores, range: '1-18' }
  }

  return result
})

const gameTypes = [
  { value: 'nassau', name: 'Nassau', desc: 'Front, Back, Overall bets' },
  { value: 'best_ball', name: 'Best Ball', desc: 'Lowest score wins each hole' },
  { value: 'match_play', name: 'Match Play', desc: 'Win holes to win the match' },
  { value: 'skins', name: 'Skins', desc: 'Win outright or carry over' }
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

// Determine which segments are still active based on current hole
const activeSegments = computed(() => {
  const hole = props.currentHole
  if (nassauFormat.value === '6-6-6') {
    return {
      front: hole <= 6,
      middle: hole <= 12,
      back: hole <= 18,
      overall: true
    }
  } else {
    return {
      front: hole <= 9,
      back: hole <= 18,
      overall: true
    }
  }
})

// Calculate what the user would actually be betting on if starting now
const effectiveBets = computed(() => {
  const hole = startHole.value
  const bets = []

  if (nassauFormat.value === '6-6-6') {
    if (hole <= 6) bets.push({ name: 'Front 6', holes: '1-6', amount: segmentAmount.value })
    if (hole <= 12) bets.push({ name: 'Middle 6', holes: `${Math.max(7, hole)}-12`, amount: segmentAmount.value })
    if (hole <= 18) bets.push({ name: 'Back 6', holes: `${Math.max(13, hole)}-18`, amount: segmentAmount.value })
  } else {
    if (hole <= 9) bets.push({ name: 'Front 9', holes: '1-9', amount: segmentAmount.value })
    if (hole <= 18) bets.push({ name: 'Back 9', holes: `${Math.max(10, hole)}-18`, amount: segmentAmount.value })
  }

  bets.push({ name: 'Overall', holes: `${hole}-18`, amount: overallAmount.value })

  return bets
})

const totalExposure = computed(() => {
  return effectiveBets.value.reduce((sum, b) => sum + b.amount, 0)
})

async function fetchLeaderboard() {
  try {
    const { data } = await axios.get(`/api/tournaments/${props.tournamentId}/leaderboard`)
    leaderboardData.value = data
  } catch (e) {
    console.error('Failed to fetch leaderboard:', e)
  }
}

onMounted(async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
  await fetchLeaderboard()
  startHole.value = props.currentHole
})

watch(() => props.currentHole, async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
  await fetchLeaderboard()
})

watch(segmentAmount, (newVal) => {
  if (autoDoubleOverall.value) {
    overallAmount.value = newVal * 2
  }
})

watch(autoDoubleOverall, (enabled) => {
  if (enabled) {
    overallAmount.value = segmentAmount.value * 2
  }
})

function startCreate() {
  view.value = 'create'
  setupStep.value = 1
  resetForm()
}

function resetForm() {
  betName.value = ''
  gameType.value = 'nassau'
  nassauFormat.value = '6-6-6'
  useHighLow.value = false
  party1.value = []
  party2.value = []
  segmentAmount.value = 10
  overallAmount.value = 20
  autoDoubleOverall.value = true
  perHoleAmount.value = 5
  startHole.value = props.currentHole
}

function togglePlayer(player, party) {
  const target = party === 1 ? party1 : party2
  const other = party === 1 ? party2 : party1
  const playerData = { playerId: player.id, playerName: player.name, team: player.team }

  const idx = target.value.findIndex(p => p.playerId === player.id)
  if (idx >= 0) {
    target.value.splice(idx, 1)
  } else {
    const otherIdx = other.value.findIndex(p => p.playerId === player.id)
    if (otherIdx >= 0) other.value.splice(otherIdx, 1)
    target.value.push(playerData)
  }
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
    front_amount: segmentAmount.value,
    middle_amount: nassauFormat.value === '6-6-6' ? segmentAmount.value : 0,
    back_amount: segmentAmount.value,
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

function startPress(bet, segment) {
  pressingBet.value = bet
  pressingSegment.value = segment
  view.value = 'press'
}

async function confirmPress() {
  if (!pressingBet.value || !pressingSegment.value) return

  const segment = pressingSegment.value
  const amount = segment === 'front' ? pressingBet.value.front_amount :
                 segment === 'middle' ? pressingBet.value.middle_amount :
                 segment === 'back' ? pressingBet.value.back_amount : pressingBet.value.overall_amount

  await sideBetsStore.createPress(pressingBet.value.id, {
    segment,
    start_hole: props.currentHole,
    amount
  })

  await sideBetsStore.fetchSideBets(props.tournamentId)
  view.value = 'list'
  pressingBet.value = null
  pressingSegment.value = null
}

function getStatusDisplay(status, segment) {
  if (!status || !status[segment]) return '-'
  const s = status[segment]
  if (s.holesPlayed === 0) return '-'
  return s.display
}

function getStatusColor(status, segment) {
  if (!status || !status[segment]) return 'text-gray-400'
  const s = status[segment]
  if (s.leader === 'tied') return 'text-yellow-400'
  return s.leader === 'party1' ? 'text-green-400' : 'text-red-400'
}

function canPress(bet, segment) {
  if (!bet.status || !bet.status[segment]) return false
  const s = bet.status[segment]
  // Can press if someone is down and holes remaining
  return s.diff !== 0 && s.holesRemaining > 0
}

function getSegmentRange(bet, segment) {
  if (bet.nassau_format === '6-6-6') {
    if (segment === 'front') return '1-6'
    if (segment === 'middle') return '7-12'
    if (segment === 'back') return '13-18'
  } else {
    if (segment === 'front') return '1-9'
    if (segment === 'back') return '10-18'
  }
  return '1-18'
}

function getLosingParty(bet, segment) {
  if (!bet.status || !bet.status[segment]) return null
  const s = bet.status[segment]
  if (s.leader === 'party1') return bet.party2_name
  if (s.leader === 'party2') return bet.party1_name
  return null
}
</script>

<template>
  <div class="bg-gray-900 rounded-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-800">
      <h3 class="text-xl font-bold">
        {{ view === 'list' ? 'Side Bets' : view === 'press' ? 'Press Bet' : 'New Side Bet' }}
      </h3>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-400">Hole {{ currentHole }}</span>
        <button @click="emit('close')" class="text-gray-400 hover:text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4">

      <!-- PRESS CONFIRMATION VIEW -->
      <template v-if="view === 'press' && pressingBet">
        <div class="text-center py-4">
          <div class="text-5xl mb-4">🔥</div>
          <h4 class="text-xl font-bold mb-2">Press the {{ pressingSegment }}?</h4>

          <div class="bg-gray-800 rounded-xl p-4 mb-4">
            <div class="text-lg font-semibold mb-2">
              {{ pressingBet.party1_name }} vs {{ pressingBet.party2_name }}
            </div>

            <div class="text-gray-400 mb-3">
              {{ getLosingParty(pressingBet, pressingSegment) }} is down
              <span class="text-red-400 font-bold">
                {{ getStatusDisplay(pressingBet.status, pressingSegment) }}
              </span>
            </div>

            <div class="bg-gray-700/50 rounded-lg p-3">
              <div class="text-sm text-gray-400">New press bet</div>
              <div class="text-2xl font-bold text-gold">
                ${{ pressingSegment === 'front' ? pressingBet.front_amount :
                    pressingSegment === 'middle' ? pressingBet.middle_amount :
                    pressingSegment === 'back' ? pressingBet.back_amount : pressingBet.overall_amount }}
              </div>
              <div class="text-sm text-gray-400">
                Starting hole {{ currentHole }} through {{
                  pressingSegment === 'front' ? (pressingBet.nassau_format === '6-6-6' ? '6' : '9') :
                  pressingSegment === 'middle' ? '12' :
                  pressingSegment === 'back' ? '18' : '18'
                }}
              </div>
            </div>
          </div>

          <p class="text-sm text-gray-400 mb-4">
            This creates a new bet within the {{ pressingSegment }} segment,
            starting fresh from hole {{ currentHole }}.
          </p>
        </div>
      </template>

      <!-- LIST VIEW -->
      <template v-else-if="view === 'list'">
        <!-- MAIN TOURNAMENT BET (if Nassau) -->
        <div v-if="hasMainBet" class="mb-4">
          <div class="bg-gradient-to-br from-golf-green/20 to-gold/10 border border-golf-green/30 rounded-xl overflow-hidden">
            <div class="p-4 border-b border-golf-green/20">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-xs text-golf-green font-semibold uppercase tracking-wide">Main Tournament Bet</div>
                  <div class="font-bold text-lg">Nassau {{ mainBetFormat }}</div>
                </div>
                <div class="text-right">
                  <div class="text-xs text-gray-400">Per segment</div>
                  <div class="text-gold font-bold">${{ tournament?.nassau_segment_bet }}</div>
                </div>
              </div>
            </div>

            <div class="divide-y divide-gray-700/50">
              <!-- Front segment -->
              <div class="p-3 flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium">{{ mainBetFormat === '6-6-6' ? 'Front 6' : 'Front 9' }}</span>
                  <span class="text-xs text-gray-500 ml-2">({{ segmentLeaders.front?.range || '1-6' }})</span>
                </div>
                <div v-if="segmentLeaders.front" class="text-right">
                  <div class="font-bold text-golf-green">{{ segmentLeaders.front.leader.player.name }}</div>
                  <div class="text-xs text-gray-400">{{ segmentLeaders.front.leader.score }} ({{ segmentLeaders.front.leader.holesPlayed }} holes)</div>
                </div>
                <div v-else class="text-gray-500 text-sm">No scores yet</div>
              </div>

              <!-- Middle segment (6-6-6 only) -->
              <div v-if="mainBetFormat === '6-6-6'" class="p-3 flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium">Middle 6</span>
                  <span class="text-xs text-gray-500 ml-2">(7-12)</span>
                </div>
                <div v-if="segmentLeaders.middle" class="text-right">
                  <div class="font-bold text-golf-green">{{ segmentLeaders.middle.leader.player.name }}</div>
                  <div class="text-xs text-gray-400">{{ segmentLeaders.middle.leader.score }} ({{ segmentLeaders.middle.leader.holesPlayed }} holes)</div>
                </div>
                <div v-else class="text-gray-500 text-sm">No scores yet</div>
              </div>

              <!-- Back segment -->
              <div class="p-3 flex items-center justify-between">
                <div>
                  <span class="text-sm font-medium">{{ mainBetFormat === '6-6-6' ? 'Back 6' : 'Back 9' }}</span>
                  <span class="text-xs text-gray-500 ml-2">({{ mainBetFormat === '6-6-6' ? '13-18' : '10-18' }})</span>
                </div>
                <div v-if="segmentLeaders.back" class="text-right">
                  <div class="font-bold text-golf-green">{{ segmentLeaders.back.leader.player.name }}</div>
                  <div class="text-xs text-gray-400">{{ segmentLeaders.back.leader.score }} ({{ segmentLeaders.back.leader.holesPlayed }} holes)</div>
                </div>
                <div v-else class="text-gray-500 text-sm">No scores yet</div>
              </div>

              <!-- Overall -->
              <div class="p-3 flex items-center justify-between bg-gray-800/30">
                <div>
                  <span class="text-sm font-medium">Overall</span>
                  <span class="text-gold font-bold ml-2">${{ tournament?.nassau_overall_bet }}</span>
                </div>
                <div v-if="segmentLeaders.overall" class="text-right">
                  <div class="font-bold text-golf-green">{{ segmentLeaders.overall.leader.player.name }}</div>
                  <div class="text-xs text-gray-400">{{ segmentLeaders.overall.leader.score }} net ({{ segmentLeaders.overall.leader.holesPlayed }} holes)</div>
                </div>
                <div v-else class="text-gray-500 text-sm">No scores yet</div>
              </div>
            </div>

            <div class="p-3 bg-gray-800/50 text-xs text-gray-400 text-center">
              Lowest net score wins each segment • Everyone pays the winner
            </div>
          </div>
        </div>

        <!-- SIDE BETS SECTION -->
        <div v-if="hasMainBet && sideBetsStore.sideBets.length > 0" class="mb-3">
          <div class="text-xs text-gray-500 font-semibold uppercase tracking-wide">Additional Side Bets</div>
        </div>

        <div v-if="sideBetsStore.sideBets.length === 0 && !hasMainBet" class="text-center py-8">
          <div class="text-5xl mb-3">🤝</div>
          <p class="text-lg font-semibold mb-1">No side bets yet</p>
          <p class="text-sm text-gray-400 mb-4">Set up a Nassau or match bet between players</p>
          <button @click="startCreate" class="btn-gold">
            + Create Side Bet
          </button>
        </div>

        <div v-if="sideBetsStore.sideBets.length > 0" class="space-y-4">
          <div
            v-for="bet in sideBetsStore.sideBets"
            :key="bet.id"
            class="bg-gray-800 rounded-xl overflow-hidden"
          >
            <!-- Bet Header -->
            <div class="p-4 border-b border-gray-700">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-bold text-lg">{{ bet.party1_name }} vs {{ bet.party2_name }}</div>
                  <div class="text-xs text-gray-400">
                    {{ gameTypes.find(g => g.value === bet.game_type)?.name }}
                    <span v-if="bet.nassau_format"> • {{ bet.nassau_format }}</span>
                  </div>
                </div>
                <button @click="deleteBet(bet.id)" class="text-red-400 hover:text-red-300 text-xs px-2 py-1">
                  Delete
                </button>
              </div>
            </div>

            <!-- Nassau Segments with Press Buttons -->
            <template v-if="bet.game_type === 'nassau'">
              <div class="divide-y divide-gray-700">
                <!-- Front -->
                <div class="p-3 flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold">{{ getSegmentRange(bet, 'front') }}</span>
                      <span class="text-gold font-bold">${{ bet.front_amount }}</span>
                    </div>
                    <div :class="['text-lg font-bold', getStatusColor(bet.status, 'front')]">
                      {{ getStatusDisplay(bet.status, 'front') }}
                    </div>
                  </div>
                  <button
                    v-if="canPress(bet, 'front')"
                    @click="startPress(bet, 'front')"
                    class="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-semibold hover:bg-red-500/30"
                  >
                    PRESS
                  </button>
                  <span v-else-if="bet.status?.front?.holesRemaining === 0" class="text-xs text-gray-500">Complete</span>
                </div>

                <!-- Middle (6-6-6 only) -->
                <div v-if="bet.nassau_format === '6-6-6'" class="p-3 flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold">{{ getSegmentRange(bet, 'middle') }}</span>
                      <span class="text-gold font-bold">${{ bet.middle_amount }}</span>
                    </div>
                    <div :class="['text-lg font-bold', getStatusColor(bet.status, 'middle')]">
                      {{ getStatusDisplay(bet.status, 'middle') }}
                    </div>
                  </div>
                  <button
                    v-if="canPress(bet, 'middle')"
                    @click="startPress(bet, 'middle')"
                    class="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-semibold hover:bg-red-500/30"
                  >
                    PRESS
                  </button>
                  <span v-else-if="bet.status?.middle?.holesRemaining === 0" class="text-xs text-gray-500">Complete</span>
                </div>

                <!-- Back -->
                <div class="p-3 flex items-center justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold">{{ getSegmentRange(bet, 'back') }}</span>
                      <span class="text-gold font-bold">${{ bet.back_amount }}</span>
                    </div>
                    <div :class="['text-lg font-bold', getStatusColor(bet.status, 'back')]">
                      {{ getStatusDisplay(bet.status, 'back') }}
                    </div>
                  </div>
                  <button
                    v-if="canPress(bet, 'back')"
                    @click="startPress(bet, 'back')"
                    class="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-semibold hover:bg-red-500/30"
                  >
                    PRESS
                  </button>
                  <span v-else-if="bet.status?.back?.holesRemaining === 0" class="text-xs text-gray-500">Complete</span>
                </div>

                <!-- Overall -->
                <div class="p-3 flex items-center justify-between bg-gray-700/30">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold">Overall (1-18)</span>
                      <span class="text-gold font-bold">${{ bet.overall_amount }}</span>
                    </div>
                    <div :class="['text-lg font-bold', getStatusColor(bet.status, 'overall')]">
                      {{ getStatusDisplay(bet.status, 'overall') }}
                    </div>
                  </div>
                  <button
                    v-if="canPress(bet, 'overall')"
                    @click="startPress(bet, 'overall')"
                    class="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-semibold hover:bg-red-500/30"
                  >
                    PRESS
                  </button>
                </div>
              </div>
            </template>

            <!-- Other game types -->
            <template v-else>
              <div class="p-4">
                <div class="bg-gray-700/50 rounded-lg p-4 text-center">
                  <div class="text-gold font-bold text-lg mb-1">${{ bet.overall_amount || bet.per_hole_amount }}<span v-if="bet.game_type === 'skins'">/skin</span></div>
                  <div :class="['text-2xl font-bold', getStatusColor(bet.status, 'overall')]">
                    {{ getStatusDisplay(bet.status, 'overall') }}
                  </div>
                  <div class="text-sm text-gray-400 mt-1">
                    {{ bet.status?.overall?.holesPlayed || 0 }} holes played
                  </div>
                </div>
                <button
                  v-if="canPress(bet, 'overall') && bet.game_type !== 'skins'"
                  @click="startPress(bet, 'overall')"
                  class="mt-3 w-full px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-semibold hover:bg-red-500/30"
                >
                  PRESS
                </button>
              </div>
            </template>

            <!-- Active Presses -->
            <div v-if="bet.presses?.length" class="p-3 bg-gold/10 border-t border-gold/30">
              <div class="text-xs text-gold font-semibold mb-2">ACTIVE PRESSES ({{ bet.presses.length }})</div>
              <div class="space-y-2">
                <div
                  v-for="pressItem in bet.presses"
                  :key="pressItem.id"
                  class="flex items-center justify-between text-sm"
                >
                  <div>
                    <span class="text-gold">Press #{{ pressItem.start_hole }}</span>
                    <span class="text-gray-400"> ({{ pressItem.segment }})</span>
                    <span class="text-white ml-2 font-semibold">
                      ${{ pressItem.front_amount || pressItem.middle_amount || pressItem.back_amount || pressItem.overall_amount }}
                    </span>
                  </div>
                  <div :class="getStatusColor(pressItem.status, pressItem.segment)" class="font-bold">
                    {{ getStatusDisplay(pressItem.status, pressItem.segment) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- Add Side Bet Button (always show if main bet exists or side bets exist) -->
        <button
          v-if="hasMainBet || sideBetsStore.sideBets.length > 0"
          @click="startCreate"
          class="w-full mt-4 p-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:border-golf-green hover:text-golf-green transition-colors"
        >
          + Add Side Bet
        </button>
      </template>

      <!-- CREATE WIZARD -->
      <template v-else-if="view === 'create'">
        <!-- Step 1: Who's Playing -->
        <div v-if="setupStep === 1">
          <h4 class="font-semibold mb-4">Who's betting?</h4>
          <p class="text-sm text-gray-400 mb-4">Tap to assign players to each side</p>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                <span class="w-3 h-3 bg-green-500 rounded-full"></span>
                Side A
              </div>
              <div class="space-y-1">
                <button
                  v-for="player in players"
                  :key="'p1-' + player.id"
                  @click="togglePlayer(player, 1)"
                  :class="[
                    'w-full p-3 rounded-lg text-sm text-left transition-all font-medium',
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
              <div class="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <span class="w-3 h-3 bg-red-500 rounded-full"></span>
                Side B
              </div>
              <div class="space-y-1">
                <button
                  v-for="player in players"
                  :key="'p2-' + player.id"
                  @click="togglePlayer(player, 2)"
                  :class="[
                    'w-full p-3 rounded-lg text-sm text-left transition-all font-medium',
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

          <div v-if="party1.length && party2.length" class="mt-4 p-4 bg-gray-800 rounded-xl text-center">
            <span class="text-green-400 font-semibold">{{ party1Name }}</span>
            <span class="text-gray-400 mx-3">vs</span>
            <span class="text-red-400 font-semibold">{{ party2Name }}</span>
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
                'w-full p-4 rounded-xl text-left transition-all border-2',
                gameType === gt.value ? 'border-golf-green bg-golf-green/10' : 'border-gray-700 hover:border-gray-600'
              ]"
            >
              <div class="font-semibold">{{ gt.name }}</div>
              <div class="text-xs text-gray-400">{{ gt.desc }}</div>
            </button>
          </div>

          <!-- Nassau Format -->
          <div v-if="gameType === 'nassau'" class="mt-4 p-4 bg-gray-800 rounded-xl">
            <div class="text-sm font-semibold mb-3">Nassau Format</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="nassauFormat = '9-9'"
                :class="[
                  'p-3 rounded-lg text-sm font-medium',
                  nassauFormat === '9-9' ? 'bg-golf-green text-white' : 'bg-gray-700'
                ]"
              >
                <div>9-9</div>
                <div class="text-xs opacity-70">Front, Back, Overall</div>
              </button>
              <button
                @click="nassauFormat = '6-6-6'"
                :class="[
                  'p-3 rounded-lg text-sm font-medium',
                  nassauFormat === '6-6-6' ? 'bg-golf-green text-white' : 'bg-gray-700'
                ]"
              >
                <div>6-6-6</div>
                <div class="text-xs opacity-70">Front, Mid, Back, Overall</div>
              </button>
            </div>
          </div>
        </div>

        <!-- Step 3: Amounts -->
        <div v-if="setupStep === 3">
          <h4 class="font-semibold mb-4">Set the stakes</h4>

          <!-- Mid-round warning -->
          <div v-if="startHole > 1" class="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div class="text-yellow-400 font-semibold text-sm mb-1">Starting mid-round</div>
            <div class="text-xs text-gray-400">
              Bet starts on hole {{ startHole }}. Some segments may already be complete.
            </div>
          </div>

          <template v-if="gameType === 'nassau'">
            <div class="space-y-4">
              <!-- Segment Amount -->
              <div>
                <label class="text-sm text-gray-400 block mb-2">Per segment</label>
                <div class="flex items-center gap-2">
                  <span class="text-2xl text-gray-400">$</span>
                  <input
                    v-model.number="segmentAmount"
                    type="number"
                    min="1"
                    class="flex-1 p-3 bg-gray-700 rounded-lg text-2xl font-bold text-center"
                  >
                </div>
              </div>

              <!-- Overall Amount -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="text-sm text-gray-400">Overall bet</label>
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" v-model="autoDoubleOverall" class="rounded">
                    <span class="text-gray-400">Auto 2x</span>
                  </label>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-2xl text-gray-400">$</span>
                  <input
                    v-model.number="overallAmount"
                    type="number"
                    min="1"
                    :disabled="autoDoubleOverall"
                    :class="[
                      'flex-1 p-3 rounded-lg text-2xl font-bold text-center',
                      autoDoubleOverall ? 'bg-gray-800 text-gray-400' : 'bg-gray-700'
                    ]"
                  >
                </div>
              </div>
            </div>

            <!-- What You're Betting -->
            <div class="mt-4 p-4 bg-gray-800 rounded-xl">
              <div class="text-sm text-gray-400 mb-3">Your bets:</div>
              <div class="space-y-2">
                <div
                  v-for="bet in effectiveBets"
                  :key="bet.name"
                  class="flex justify-between items-center"
                >
                  <div>
                    <span class="font-medium">{{ bet.name }}</span>
                    <span class="text-xs text-gray-500 ml-2">holes {{ bet.holes }}</span>
                  </div>
                  <span class="text-gold font-bold">${{ bet.amount }}</span>
                </div>
              </div>
              <div class="mt-3 pt-3 border-t border-gray-700 flex justify-between">
                <span class="text-gray-400">Max exposure</span>
                <span class="text-xl font-bold text-gold">${{ totalExposure }}</span>
              </div>
            </div>
          </template>

          <template v-else-if="gameType === 'skins'">
            <div>
              <label class="text-sm text-gray-400 block mb-2">Per skin</label>
              <div class="flex items-center gap-2">
                <span class="text-2xl text-gray-400">$</span>
                <input v-model.number="perHoleAmount" type="number" min="1" class="flex-1 p-3 bg-gray-700 rounded-lg text-2xl font-bold text-center">
              </div>
            </div>
          </template>

          <template v-else>
            <div>
              <label class="text-sm text-gray-400 block mb-2">Match bet</label>
              <div class="flex items-center gap-2">
                <span class="text-2xl text-gray-400">$</span>
                <input v-model.number="overallAmount" type="number" min="1" class="flex-1 p-3 bg-gray-700 rounded-lg text-2xl font-bold text-center">
              </div>
            </div>
          </template>

          <!-- Summary -->
          <div class="mt-4 p-4 bg-golf-green/10 border border-golf-green/30 rounded-xl">
            <div class="font-semibold text-golf-green mb-1">Ready!</div>
            <div class="text-sm text-gray-300">
              {{ party1Name }} vs {{ party2Name }} •
              {{ gameTypes.find(g => g.value === gameType)?.name }}
              <span v-if="nassauFormat && gameType === 'nassau'"> ({{ nassauFormat }})</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="p-4 border-t border-gray-800">
      <div v-if="view === 'press'" class="flex gap-2">
        <button @click="view = 'list'" class="flex-1 btn-secondary">
          Cancel
        </button>
        <button @click="confirmPress" class="flex-1 btn-gold">
          Confirm Press
        </button>
      </div>
      <div v-else-if="view === 'create'" class="flex gap-2">
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
    </div>
  </div>
</template>
