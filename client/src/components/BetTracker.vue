<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSideBetsStore } from '../stores/sidebets'
import { useTournamentStore } from '../stores/tournament'
import { useCourseStore } from '../stores/course'

const props = defineProps({
  tournamentId: {
    type: [Number, String],
    required: true
  },
  currentHole: {
    type: Number,
    default: 1
  }
})

const emit = defineEmits(['close'])

const sideBetsStore = useSideBetsStore()
const tournamentStore = useTournamentStore()
const courseStore = useCourseStore()

const loading = ref(true)
const showPressModal = ref(false)
const pressingBet = ref(null)
const pressingSegment = ref(null)
const showAlohaModal = ref(false)
const alohaFired = ref(false)
const alohaStartHole = ref(18) // 16, 17, or 18

onMounted(async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
  loading.value = false
})

// Watch for score changes and refresh
watch(() => tournamentStore.scores, async () => {
  await sideBetsStore.fetchSideBets(props.tournamentId)
}, { deep: true })

// Get all top-level bets (not presses)
const bets = computed(() => {
  return sideBetsStore.sideBets.filter(b => !b.parent_bet_id)
})

// Calculate total losses for Aloha Press
// This sums up all resolved/losing bets and current losing positions
const alohaCalculation = computed(() => {
  let totalLosses = 0
  let breakdown = []

  for (const bet of sideBetsStore.sideBets) {
    const segments = getBetSegmentsForCalc(bet)

    for (const seg of segments) {
      const status = seg.status
      if (!status) continue

      const amount = getSegmentAmount(bet, seg.key) || 0
      const { diff, holesRemaining, closedOut } = status

      // Only count if we're losing (diff < 0)
      if (diff < 0) {
        const holesDown = Math.abs(diff)

        // Resolved loss (closed out or no holes remaining)
        if (closedOut || holesRemaining === 0) {
          totalLosses += amount
          breakdown.push({
            label: bet.parent_bet_id ? `Press (${seg.label})` : seg.label,
            amount,
            status: 'lost'
          })
        }
        // Projected loss (currently losing, not yet resolved)
        else {
          totalLosses += amount
          breakdown.push({
            label: bet.parent_bet_id ? `Press (${seg.label})` : seg.label,
            amount,
            status: 'losing',
            diff: holesDown,
            remaining: holesRemaining
          })
        }
      }
    }
  }

  // Determine which start holes are available based on current hole
  const availableStarts = []
  if (props.currentHole >= 16 && props.currentHole <= 16) availableStarts.push(16, 17, 18)
  else if (props.currentHole === 17) availableStarts.push(17, 18)
  else if (props.currentHole === 18) availableStarts.push(18)

  return {
    totalLosses,
    alohaAmount: totalLosses, // Double or nothing = bet what you've lost
    breakdown,
    available: totalLosses > 0 && props.currentHole >= 16, // Available starting hole 16
    availableStarts,
    holesForStart: (start) => 19 - start // 16->3 holes, 17->2 holes, 18->1 hole
  }
})

// Helper to get segments for calculation (without UI formatting)
function getBetSegmentsForCalc(bet) {
  if (bet.game_type !== 'nassau') {
    return [{ key: 'overall', label: 'Overall', status: bet.status }]
  }

  const format = bet.nassau_format || '6-6-6'
  const segments = []

  if (format === '6-6-6') {
    if (bet.status?.front) segments.push({ key: 'front', label: 'Front 6', status: bet.status.front })
    if (bet.status?.middle) segments.push({ key: 'middle', label: 'Middle 6', status: bet.status.middle })
    if (bet.status?.back) segments.push({ key: 'back', label: 'Back 6', status: bet.status.back })
  } else {
    if (bet.status?.front) segments.push({ key: 'front', label: 'Front 9', status: bet.status.front })
    if (bet.status?.back) segments.push({ key: 'back', label: 'Back 9', status: bet.status.back })
  }

  if (bet.status?.overall) segments.push({ key: 'overall', label: 'Overall', status: bet.status.overall })

  return segments
}

// Fire the Aloha Press
async function fireAlohaPress() {
  if (!alohaCalculation.value.available || alohaFired.value) return

  // Find the first bet to attach the aloha to (or create standalone)
  const parentBet = bets.value[0]
  if (!parentBet) return

  try {
    await sideBetsStore.createPress(parentBet.id, {
      segment: 'overall',
      start_hole: alohaStartHole.value,
      amount: alohaCalculation.value.alohaAmount,
      is_aloha: true
    })

    await sideBetsStore.fetchSideBets(props.tournamentId)
    alohaFired.value = true
  } catch (err) {
    console.error('Failed to create Aloha Press:', err)
  }

  showAlohaModal.value = false
}

// Get label for aloha hole count
function getAlohaLabel(startHole) {
  const holes = 19 - startHole
  if (holes === 1) return '1 hole (all-in)'
  if (holes === 2) return '2 holes'
  return '3 holes'
}

// Helper to get segment holes
function getSegmentHoles(bet, segment) {
  const format = bet.nassau_format || '6-6-6'
  if (format === '6-6-6') {
    if (segment === 'front') return { start: 1, end: 6 }
    if (segment === 'middle') return { start: 7, end: 12 }
    if (segment === 'back') return { start: 13, end: 18 }
  } else {
    if (segment === 'front') return { start: 1, end: 9 }
    if (segment === 'back') return { start: 10, end: 18 }
  }
  return { start: 1, end: 18 } // overall
}

// Get the status display for a bet/segment
function getStatusDisplay(status) {
  if (!status) return { text: '-', class: 'text-gray-400' }

  const { diff, holesRemaining, closedOut, holesPlayed } = status

  if (holesPlayed === 0) return { text: 'Not started', class: 'text-gray-500' }

  if (closedOut) {
    return {
      text: `${Math.abs(diff)}&${holesRemaining}`,
      class: diff > 0 ? 'text-green-400' : 'text-red-400',
      resolved: true
    }
  }

  if (holesRemaining === 0) {
    if (diff === 0) return { text: 'HALVED', class: 'text-yellow-400', resolved: true }
    return {
      text: `${Math.abs(diff)} UP`,
      class: diff > 0 ? 'text-green-400' : 'text-red-400',
      resolved: true
    }
  }

  if (diff === 0) return { text: 'AS', class: 'text-gray-300' }

  const holesDown = Math.abs(diff)
  // Check if "locked up" - need all remaining holes just to tie
  const isLockedUp = diff < 0 && holesDown >= holesRemaining

  return {
    text: `${holesDown} ${diff > 0 ? 'UP' : 'DN'}`,
    class: diff > 0 ? 'text-green-400' : 'text-red-400',
    lockedUp: isLockedUp
  }
}

// Check if a press is available
// Press available when:
// 1. Down 2 or more (traditional auto-press), OR
// 2. "Locked up" - can't win outright, can only tie (down by exactly holes remaining)
// 3. AND this bet hasn't already been pressed (only press the last in the chain)
function canPress(status, segment, bet) {
  if (!status) return false
  const { diff, holesRemaining, closedOut } = status

  // Can't press if closed out or no holes remaining
  if (closedOut || holesRemaining === 0) return false

  // Must be down (diff < 0 means losing)
  if (diff >= 0) return false

  // Can't press a bet that's already been pressed - only the last in chain can be pressed
  if (hasBeenPressed(bet, segment)) return false

  const holesDown = Math.abs(diff)

  // "Locked up" = need to win ALL remaining holes just to tie
  // (can't win outright anymore, but can still halve)
  const isLockedUp = holesDown >= holesRemaining

  // Traditional trigger: down 2 or more
  const isDown2OrMore = holesDown >= 2

  return isLockedUp || isDown2OrMore
}

// Get the full press chain for a bet/segment (ladder of presses)
function getPressChain(bet, segment) {
  const chain = []
  let current = bet

  while (true) {
    // Find a press that has current as parent
    const press = sideBetsStore.sideBets.find(
      b => b.parent_bet_id === current.id && b.segment === segment
    )
    if (!press) break
    chain.push(press)
    current = press
  }

  return chain
}

// Check if this bet has already been pressed (has a child press for this segment)
function hasBeenPressed(bet, segment) {
  return sideBetsStore.sideBets.some(
    b => b.parent_bet_id === bet.id && b.segment === segment
  )
}

// Calculate remaining holes for a press
function getPressHolesInfo(press) {
  const { start, end } = getSegmentHoles(press, press.segment)
  const startHole = press.start_hole || start
  const totalHoles = end - startHole + 1
  const holesPlayed = press.status?.holesPlayed || 0
  return { totalHoles, holesPlayed, remaining: totalHoles - holesPlayed }
}

// Get amount for a segment
function getSegmentAmount(bet, segment) {
  if (segment === 'front') return bet.front_amount
  if (segment === 'middle') return bet.middle_amount
  if (segment === 'back') return bet.back_amount
  return bet.overall_amount
}

// Start press flow
function startPress(bet, segment) {
  pressingBet.value = bet
  pressingSegment.value = segment
  showPressModal.value = true
}

// Create the press
async function confirmPress() {
  if (!pressingBet.value || !pressingSegment.value) return

  try {
    await sideBetsStore.createPress(pressingBet.value.id, {
      segment: pressingSegment.value,
      start_hole: props.currentHole,
      amount: getSegmentAmount(pressingBet.value, pressingSegment.value)
    })

    await sideBetsStore.fetchSideBets(props.tournamentId)
  } catch (err) {
    console.error('Failed to create press:', err)
  }

  showPressModal.value = false
  pressingBet.value = null
  pressingSegment.value = null
}

// Format money
function formatMoney(amount) {
  if (!amount) return ''
  return `$${amount}`
}

// Get segments for a bet based on its type
function getBetSegments(bet) {
  if (bet.game_type !== 'nassau') {
    return [{ key: 'overall', label: 'Match', status: bet.status }]
  }

  const format = bet.nassau_format || '6-6-6'
  const segments = []

  if (format === '6-6-6') {
    if (bet.status?.front) segments.push({ key: 'front', label: 'Front 6', status: bet.status.front })
    if (bet.status?.middle) segments.push({ key: 'middle', label: 'Middle 6', status: bet.status.middle })
    if (bet.status?.back) segments.push({ key: 'back', label: 'Back 6', status: bet.status.back })
  } else {
    if (bet.status?.front) segments.push({ key: 'front', label: 'Front 9', status: bet.status.front })
    if (bet.status?.back) segments.push({ key: 'back', label: 'Back 9', status: bet.status.back })
  }

  if (bet.status?.overall) segments.push({ key: 'overall', label: 'Overall', status: bet.status.overall })

  return segments
}

// Check if current hole is in segment
function isSegmentActive(segment, bet) {
  const { start, end } = getSegmentHoles(bet, segment)
  return props.currentHole >= start && props.currentHole <= end
}
</script>

<template>
  <div class="bet-tracker">
    <div class="header">
      <h3>Bet Tracker</h3>
      <button @click="emit('close')" class="close-btn">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div v-if="loading" class="loading">Loading bets...</div>

    <div v-else-if="bets.length === 0" class="empty">
      <p>No bets configured</p>
      <p class="hint">Set up bets from the Side Bets menu</p>
    </div>

    <div v-else class="bets-list">
      <div v-for="bet in bets" :key="bet.id" class="bet-card">
        <!-- Bet Header -->
        <div class="bet-header">
          <div class="bet-title">
            <span class="party1">{{ bet.party1_name || 'Party 1' }}</span>
            <span class="vs">vs</span>
            <span class="party2">{{ bet.party2_name || 'Party 2' }}</span>
          </div>
          <div class="bet-type">
            {{ bet.game_type === 'nassau' ? `Nassau ${bet.nassau_format || '6-6-6'}` : bet.game_type }}
          </div>
        </div>

        <!-- Segments -->
        <div class="segments">
          <div
            v-for="segment in getBetSegments(bet)"
            :key="segment.key"
            class="segment-group"
          >
            <!-- Main Segment Bet -->
            <div
              class="segment-row"
              :class="{
                active: isSegmentActive(segment.key, bet),
                resolved: getStatusDisplay(segment.status).resolved
              }"
            >
              <div class="segment-info">
                <span class="segment-label">{{ segment.label }}</span>
                <span class="segment-amount">{{ formatMoney(getSegmentAmount(bet, segment.key)) }}</span>
              </div>

              <div class="segment-status">
                <span :class="['status-text', getStatusDisplay(segment.status).class]">
                  {{ getStatusDisplay(segment.status).text }}
                </span>
                <span v-if="getStatusDisplay(segment.status).lockedUp" class="locked-badge">
                  LOCKED
                </span>
                <span v-if="segment.status?.holesRemaining > 0" class="holes-left">
                  ({{ segment.status.holesRemaining }} left)
                </span>
              </div>

              <div class="segment-actions">
                <button
                  v-if="canPress(segment.status, segment.key, bet)"
                  @click="startPress(bet, segment.key)"
                  class="press-btn pulse"
                >
                  PRESS
                </button>
                <span v-else-if="getStatusDisplay(segment.status).resolved" class="resolved-badge">
                  FINAL
                </span>
              </div>
            </div>

            <!-- Presses for this segment (full ladder/chain) -->
            <div
              v-for="(press, pIdx) in getPressChain(bet, segment.key)"
              :key="press.id"
              class="press-row"
              :class="{
                resolved: getStatusDisplay(press.status?.[segment.key] || press.status).resolved,
                'press-depth-1': pIdx === 0,
                'press-depth-2': pIdx >= 1
              }"
              :style="{ marginLeft: `${1 + pIdx * 0.5}rem` }"
            >
              <div class="press-indicator">
                <div class="press-line"></div>
                <span class="press-label">Press #{{ pIdx + 1 }}</span>
              </div>

              <div class="press-info">
                <span class="press-start">from H{{ press.start_hole }}</span>
                <span class="press-amount">{{ formatMoney(press.front_amount || press.middle_amount || press.back_amount || press.overall_amount) }}</span>
              </div>

              <div class="segment-status">
                <span :class="['status-text', getStatusDisplay(press.status?.[segment.key] || press.status).class]">
                  {{ getStatusDisplay(press.status?.[segment.key] || press.status).text }}
                </span>
                <span v-if="getStatusDisplay(press.status?.[segment.key] || press.status).lockedUp" class="locked-badge small">
                  LOCKED
                </span>
                <span v-if="getPressHolesInfo(press).remaining > 0" class="holes-left">
                  ({{ getPressHolesInfo(press).remaining }} left)
                </span>
              </div>

              <div class="segment-actions">
                <button
                  v-if="canPress(press.status?.[segment.key] || press.status, segment.key, press)"
                  @click="startPress(press, segment.key)"
                  class="press-btn pulse small"
                >
                  PRESS
                </button>
                <span v-else-if="getStatusDisplay(press.status?.[segment.key] || press.status).resolved" class="resolved-badge small">
                  FINAL
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Settlement Summary -->
        <div v-if="bet.status" class="settlement-preview">
          <div class="settlement-label">Projected Settlement:</div>
          <div class="settlement-amounts">
            <!-- Calculate total owed based on resolved bets -->
          </div>
        </div>
      </div>
    </div>

    <!-- Aloha Press Section -->
    <div v-if="alohaCalculation.available && !alohaFired" class="aloha-section">
      <div class="aloha-card">
        <div class="aloha-header">
          <span class="aloha-icon">🤙</span>
          <span class="aloha-title">Aloha Press</span>
        </div>
        <p class="aloha-desc">Double or nothing to win it all back</p>

        <!-- Hole selector -->
        <div class="aloha-holes">
          <span class="aloha-holes-label">Start from:</span>
          <div class="aloha-hole-options">
            <button
              v-for="hole in alohaCalculation.availableStarts"
              :key="hole"
              @click="alohaStartHole = hole"
              :class="['aloha-hole-btn', { active: alohaStartHole === hole }]"
            >
              <span class="hole-num">H{{ hole }}</span>
              <span class="hole-count">{{ getAlohaLabel(hole) }}</span>
            </button>
          </div>
        </div>

        <div class="aloha-amount">
          <span class="aloha-label">Your losses:</span>
          <span class="aloha-value">${{ alohaCalculation.totalLosses }}</span>
        </div>
        <div class="aloha-breakdown" v-if="alohaCalculation.breakdown.length">
          <div v-for="(item, idx) in alohaCalculation.breakdown" :key="idx" class="breakdown-item">
            <span>{{ item.label }}</span>
            <span :class="item.status === 'lost' ? 'text-red-400' : 'text-orange-400'">
              -${{ item.amount }}
              <span v-if="item.status === 'losing'" class="text-xs">({{ item.diff }} DN)</span>
            </span>
          </div>
        </div>
        <button @click="showAlohaModal = true" class="aloha-btn">
          🌺 Fire Aloha - H{{ alohaStartHole }}-18 ({{ 19 - alohaStartHole }} hole{{ 19 - alohaStartHole > 1 ? 's' : '' }}) - ${{ alohaCalculation.alohaAmount }}
        </button>
      </div>
    </div>

    <!-- Aloha Fired Badge -->
    <div v-if="alohaFired" class="aloha-fired">
      <span class="aloha-icon">🤙</span>
      <span>Aloha FIRED H{{ alohaStartHole }}-18 - ${{ alohaCalculation.alohaAmount }} on the line!</span>
    </div>

    <!-- Aloha Confirmation Modal -->
    <div v-if="showAlohaModal" class="modal-overlay" @click.self="showAlohaModal = false">
      <div class="modal-content aloha-modal">
        <div class="aloha-modal-header">
          <span class="text-4xl">🤙🌺</span>
          <h4>Aloha Press</h4>
        </div>
        <p class="aloha-modal-desc">
          You're betting <strong>${{ alohaCalculation.alohaAmount }}</strong> on holes <strong>{{ alohaStartHole }}-18</strong>
          <span class="aloha-hole-count">({{ 19 - alohaStartHole }} hole{{ 19 - alohaStartHole > 1 ? ' match' : '' }})</span>
        </p>
        <p class="aloha-modal-stakes">
          <span class="text-green-400">WIN {{ 19 - alohaStartHole > 1 ? 'THE MATCH' : 'THE HOLE' }}:</span> Break even<br>
          <span class="text-red-400">LOSE:</span> Down ${{ alohaCalculation.alohaAmount * 2 }}<br>
          <span v-if="19 - alohaStartHole > 1" class="text-yellow-400">HALVE:</span>
          <span v-if="19 - alohaStartHole > 1"> Push (stay at -${{ alohaCalculation.totalLosses }})</span>
        </p>
        <div class="modal-actions">
          <button @click="showAlohaModal = false" class="btn-secondary">Chicken Out</button>
          <button @click="fireAlohaPress" class="btn-aloha">🤙 Send It!</button>
        </div>
      </div>
    </div>

    <!-- Press Confirmation Modal -->
    <div v-if="showPressModal" class="modal-overlay" @click.self="showPressModal = false">
      <div class="modal-content">
        <h4>Confirm Press</h4>
        <p class="press-details">
          Press the <strong>{{ pressingSegment }}</strong> starting at hole <strong>{{ currentHole }}</strong>
        </p>
        <p class="press-amount-display">
          Amount: <strong>{{ formatMoney(getSegmentAmount(pressingBet, pressingSegment)) }}</strong>
        </p>

        <div class="modal-actions">
          <button @click="showPressModal = false" class="btn-secondary">Cancel</button>
          <button @click="confirmPress" class="btn-primary">Press It!</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bet-tracker {
  background: var(--surface, #1f2937);
  border-radius: 16px;
  max-width: 500px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border, #374151);
  background: var(--surface-elevated, #111827);
}

.header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-secondary, #9ca3af);
  cursor: pointer;
  padding: 0.25rem;
}

.loading, .empty {
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--text-secondary, #9ca3af);
}

.empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
  opacity: 0.7;
}

.bets-list {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.bet-card {
  background: var(--background, #111827);
  border-radius: 12px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.bet-header {
  padding: 1rem;
  background: linear-gradient(135deg, var(--primary, #10b981) 0%, var(--primary-dark, #059669) 100%);
  color: white;
}

.bet-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.vs {
  font-size: 0.75rem;
  opacity: 0.8;
}

.bet-type {
  font-size: 0.75rem;
  opacity: 0.9;
}

.segments {
  padding: 0.5rem;
}

.segment-group {
  margin-bottom: 0.25rem;
}

.segment-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--surface, #1f2937);
  border-radius: 8px;
  margin-bottom: 2px;
  border-left: 3px solid transparent;
}

.segment-row.active {
  border-left-color: var(--primary, #10b981);
  background: var(--surface-elevated, #374151);
}

.segment-row.resolved {
  opacity: 0.7;
}

.segment-info {
  display: flex;
  flex-direction: column;
}

.segment-label {
  font-weight: 600;
  font-size: 0.9rem;
}

.segment-amount {
  font-size: 0.75rem;
  color: var(--gold, #fbbf24);
}

.segment-status {
  text-align: right;
}

.status-text {
  font-weight: 700;
  font-size: 1.1rem;
}

.holes-left {
  display: block;
  font-size: 0.7rem;
  color: var(--text-secondary, #9ca3af);
}

.locked-badge {
  display: inline-block;
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--warning, #f59e0b);
  background: rgba(245, 158, 11, 0.15);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  margin-left: 0.25rem;
  text-transform: uppercase;
}

.locked-badge.small {
  font-size: 0.55rem;
  padding: 0.05rem 0.25rem;
}

.segment-actions {
  min-width: 60px;
  text-align: right;
}

.press-btn {
  padding: 0.35rem 0.75rem;
  background: var(--danger, #ef4444);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  text-transform: uppercase;
}

.press-btn.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.65rem;
}

.press-btn.pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.resolved-badge {
  font-size: 0.65rem;
  color: var(--text-secondary, #6b7280);
  background: var(--surface, #374151);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.resolved-badge.small {
  font-size: 0.6rem;
  padding: 0.15rem 0.35rem;
}

/* Press rows */
.press-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-left: 1rem;
  background: var(--surface-elevated, #374151);
  border-radius: 6px;
  margin-bottom: 2px;
  font-size: 0.85rem;
}

.press-row.resolved {
  opacity: 0.6;
}

.press-row.press-depth-2 {
  background: var(--surface, #1f2937);
  border-left: 2px solid var(--primary, #10b981);
}

.press-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.press-line {
  width: 12px;
  height: 2px;
  background: var(--primary, #10b981);
}

.press-label {
  font-size: 0.7rem;
  color: var(--primary, #10b981);
  font-weight: 600;
}

.press-info {
  display: flex;
  flex-direction: column;
}

.press-start {
  font-size: 0.75rem;
  color: var(--text-secondary, #9ca3af);
}

.press-amount {
  font-size: 0.7rem;
  color: var(--gold, #fbbf24);
}

.press-row .segment-status {
  font-size: 0.9rem;
}

.press-row .status-text {
  font-size: 0.95rem;
}

/* Settlement */
.settlement-preview {
  padding: 0.75rem 1rem;
  background: var(--surface-elevated, #374151);
  border-top: 1px solid var(--border, #4b5563);
  font-size: 0.85rem;
}

.settlement-label {
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 0.25rem;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: var(--surface, #1f2937);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 320px;
  width: 100%;
  text-align: center;
}

.modal-content h4 {
  margin: 0 0 1rem;
  font-size: 1.25rem;
}

.press-details {
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 0.5rem;
}

.press-amount-display {
  font-size: 1.25rem;
  margin-bottom: 1.5rem;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-secondary, .btn-primary {
  flex: 1;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary {
  background: var(--surface-elevated, #374151);
  color: var(--text, #f3f4f6);
}

.btn-primary {
  background: var(--primary, #10b981);
  color: white;
}

/* Aloha Press */
.aloha-section {
  padding: 1rem;
  border-top: 1px solid var(--border, #374151);
}

.aloha-card {
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  border-radius: 12px;
  padding: 1rem;
  color: white;
}

.aloha-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.aloha-icon {
  font-size: 1.5rem;
}

.aloha-title {
  font-size: 1.25rem;
  font-weight: 700;
}

.aloha-desc {
  font-size: 0.85rem;
  opacity: 0.9;
  margin-bottom: 0.75rem;
}

.aloha-holes {
  margin-bottom: 0.75rem;
}

.aloha-holes-label {
  font-size: 0.75rem;
  opacity: 0.8;
  display: block;
  margin-bottom: 0.5rem;
}

.aloha-hole-options {
  display: flex;
  gap: 0.5rem;
}

.aloha-hole-btn {
  flex: 1;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border: 2px solid transparent;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
}

.aloha-hole-btn:hover {
  background: rgba(0, 0, 0, 0.3);
}

.aloha-hole-btn.active {
  border-color: white;
  background: rgba(255, 255, 255, 0.2);
}

.aloha-hole-btn .hole-num {
  display: block;
  font-size: 1.1rem;
  font-weight: 700;
}

.aloha-hole-btn .hole-count {
  display: block;
  font-size: 0.65rem;
  opacity: 0.8;
}

.aloha-amount {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
}

.aloha-label {
  font-size: 0.85rem;
}

.aloha-value {
  font-size: 1.5rem;
  font-weight: 700;
}

.aloha-breakdown {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  padding: 0.5rem;
  margin-bottom: 0.75rem;
  font-size: 0.8rem;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.breakdown-item:last-child {
  border-bottom: none;
}

.aloha-btn {
  width: 100%;
  padding: 0.75rem;
  background: white;
  color: #ea580c;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s;
}

.aloha-btn:active {
  transform: scale(0.98);
}

.aloha-fired {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  font-weight: 600;
  animation: aloha-pulse 2s infinite;
}

@keyframes aloha-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.aloha-modal {
  text-align: center;
}

.aloha-modal-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.aloha-modal-header h4 {
  margin: 0;
  font-size: 1.5rem;
  color: #f97316;
}

.aloha-modal-desc {
  color: var(--text-secondary, #9ca3af);
  margin-bottom: 1rem;
}

.aloha-hole-count {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary, #6b7280);
  margin-top: 0.25rem;
}

.aloha-modal-stakes {
  background: var(--surface-elevated, #374151);
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  line-height: 1.8;
}

.btn-aloha {
  flex: 1;
  padding: 0.75rem;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
</style>
