<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useCalcuttaStore } from '../stores/calcutta'
import { useTournamentStore } from '../stores/tournament'

const props = defineProps({
  tournamentId: {
    type: [Number, String],
    required: true
  }
})

const calcuttaStore = useCalcuttaStore()
const tournamentStore = useTournamentStore()

const showSetup = ref(false)
const showAuction = ref(false)
const editingTeam = ref(null)
const buyerName = ref('')
const bidAmount = ref('')

// Payout structure editing
const payoutStructure = ref([
  { place: 1, type: 'percent', value: 50 },
  { place: 2, type: 'percent', value: 30 },
  { place: 3, type: 'percent', value: 20 }
])

const isEnabled = computed(() => calcuttaStore.config?.enabled)

const teamList = computed(() => {
  const teams = []
  for (const [teamNum, players] of Object.entries(calcuttaStore.teams)) {
    const purchase = calcuttaStore.purchases.find(p => p.team_number === parseInt(teamNum))
    teams.push({
      teamNumber: parseInt(teamNum),
      players,
      teamName: players.map(p => p.name).join(' & '),
      purchase
    })
  }
  return teams.sort((a, b) => a.teamNumber - b.teamNumber)
})

const payoutTotal = computed(() => {
  return payoutStructure.value
    .filter(p => p.type === 'percent')
    .reduce((sum, p) => sum + p.value, 0)
})

const projectedPayouts = computed(() => {
  if (!calcuttaStore.results?.payouts) return []
  return calcuttaStore.results.payouts
})

onMounted(async () => {
  await calcuttaStore.fetchCalcutta(props.tournamentId)
  if (calcuttaStore.config?.payout_structure?.length) {
    payoutStructure.value = [...calcuttaStore.config.payout_structure]
  }
  if (isEnabled.value) {
    await calcuttaStore.fetchResults(props.tournamentId)
  }
})

watch(() => props.tournamentId, async (newId) => {
  await calcuttaStore.fetchCalcutta(newId)
  if (isEnabled.value) {
    await calcuttaStore.fetchResults(newId)
  }
})

async function enableCalcutta() {
  await calcuttaStore.saveConfig(props.tournamentId, {
    enabled: true,
    payout_structure: payoutStructure.value
  })
  showSetup.value = false
  await calcuttaStore.fetchCalcutta(props.tournamentId)
}

async function updatePayouts() {
  await calcuttaStore.saveConfig(props.tournamentId, {
    enabled: true,
    payout_structure: payoutStructure.value
  })
}

function addPayoutPlace() {
  const nextPlace = payoutStructure.value.length + 1
  payoutStructure.value.push({ place: nextPlace, type: 'percent', value: 0 })
}

function removePayoutPlace(index) {
  payoutStructure.value.splice(index, 1)
  // Renumber places
  payoutStructure.value.forEach((p, i) => p.place = i + 1)
}

function startBid(team) {
  editingTeam.value = team
  buyerName.value = team.purchase?.buyer_name || ''
  bidAmount.value = team.purchase?.amount?.toString() || ''
  showAuction.value = true
}

async function saveBid() {
  if (!editingTeam.value || !buyerName.value || !bidAmount.value) return

  await calcuttaStore.savePurchase(props.tournamentId, {
    team_number: editingTeam.value.teamNumber,
    buyer_name: buyerName.value,
    amount: parseFloat(bidAmount.value)
  })

  await calcuttaStore.fetchResults(props.tournamentId)
  showAuction.value = false
  editingTeam.value = null
  buyerName.value = ''
  bidAmount.value = ''
}

async function removeBid(teamNumber) {
  await calcuttaStore.deletePurchase(props.tournamentId, teamNumber)
  await calcuttaStore.fetchResults(props.tournamentId)
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

function getPlaceSuffix(place) {
  if (place === 1) return 'st'
  if (place === 2) return 'nd'
  if (place === 3) return 'rd'
  return 'th'
}
</script>

<template>
  <div class="calcutta-manager">
    <!-- Not enabled state -->
    <div v-if="!isEnabled" class="setup-prompt">
      <h3>Calcutta Auction</h3>
      <p>Run a Calcutta auction where players can buy teams and compete for the pot.</p>
      <button class="btn-primary" @click="showSetup = true">Set Up Calcutta</button>
    </div>

    <!-- Setup Modal -->
    <div v-if="showSetup" class="modal-overlay" @click.self="showSetup = false">
      <div class="modal-content">
        <h3>Set Up Calcutta</h3>

        <div class="section">
          <h4>Payout Structure</h4>
          <p class="hint">Define how the pot will be split among winning teams.</p>

          <div class="payout-list">
            <div v-for="(payout, index) in payoutStructure" :key="index" class="payout-row">
              <span class="place">{{ payout.place }}{{ getPlaceSuffix(payout.place) }}</span>
              <input
                v-model.number="payout.value"
                type="number"
                min="0"
                class="payout-value"
              />
              <select v-model="payout.type" class="payout-type">
                <option value="percent">%</option>
                <option value="fixed">$</option>
              </select>
              <button
                v-if="payoutStructure.length > 1"
                class="btn-icon"
                @click="removePayoutPlace(index)"
              >
                X
              </button>
            </div>
          </div>

          <div class="payout-actions">
            <button class="btn-secondary btn-sm" @click="addPayoutPlace">+ Add Place</button>
            <span v-if="payoutTotal !== 100" class="warning">
              Total: {{ payoutTotal }}% (should be 100%)
            </span>
            <span v-else class="success">Total: 100%</span>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showSetup = false">Cancel</button>
          <button class="btn-primary" @click="enableCalcutta">Enable Calcutta</button>
        </div>
      </div>
    </div>

    <!-- Enabled state -->
    <div v-if="isEnabled" class="calcutta-content">
      <!-- Summary -->
      <div class="summary-card">
        <div class="pot-total">
          <span class="label">Total Pot</span>
          <span class="value">{{ formatMoney(calcuttaStore.totalPot) }}</span>
        </div>
        <div class="teams-sold">
          <span class="label">Teams Sold</span>
          <span class="value">{{ calcuttaStore.purchases.length }} / {{ teamList.length }}</span>
        </div>
      </div>

      <!-- Auction Section -->
      <div class="auction-section">
        <div class="section-header">
          <h4>Auction</h4>
        </div>

        <div class="team-grid">
          <div
            v-for="team in teamList"
            :key="team.teamNumber"
            class="team-card"
            :class="{ sold: team.purchase }"
            @click="startBid(team)"
          >
            <div class="team-header">
              <span class="team-number">Team {{ team.teamNumber }}</span>
              <span v-if="team.purchase" class="sold-badge">SOLD</span>
            </div>
            <div class="team-players">{{ team.teamName }}</div>
            <div v-if="team.purchase" class="purchase-info">
              <div class="buyer">{{ team.purchase.buyer_name }}</div>
              <div class="amount">{{ formatMoney(team.purchase.amount) }}</div>
            </div>
            <div v-else class="no-bid">Tap to bid</div>
          </div>
        </div>
      </div>

      <!-- Bid Modal -->
      <div v-if="showAuction" class="modal-overlay" @click.self="showAuction = false">
        <div class="modal-content">
          <h3>Team {{ editingTeam?.teamNumber }}</h3>
          <p class="team-players-modal">{{ editingTeam?.teamName }}</p>

          <div class="form-group">
            <label>Buyer Name</label>
            <input
              v-model="buyerName"
              type="text"
              placeholder="Who bought this team?"
              class="input-field"
            />
          </div>

          <div class="form-group">
            <label>Bid Amount ($)</label>
            <input
              v-model="bidAmount"
              type="number"
              min="0"
              step="5"
              placeholder="0"
              class="input-field"
            />
          </div>

          <div class="modal-actions">
            <button
              v-if="editingTeam?.purchase"
              class="btn-danger"
              @click="removeBid(editingTeam.teamNumber); showAuction = false"
            >
              Remove Bid
            </button>
            <button class="btn-secondary" @click="showAuction = false">Cancel</button>
            <button
              class="btn-primary"
              :disabled="!buyerName || !bidAmount"
              @click="saveBid"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <!-- Results Section -->
      <div v-if="calcuttaStore.results?.payouts?.length" class="results-section">
        <div class="section-header">
          <h4>Current Standings & Projected Payouts</h4>
        </div>

        <div class="results-table">
          <div class="results-header">
            <span>Place</span>
            <span>Team</span>
            <span>Score</span>
            <span>Buyer</span>
            <span>Paid</span>
            <span>Payout</span>
            <span>Profit</span>
          </div>
          <div
            v-for="result in projectedPayouts"
            :key="result.teamNumber"
            class="results-row"
            :class="{ winner: result.payout > 0, profit: result.profit > 0, loss: result.profit < 0 }"
          >
            <span class="place">{{ result.place }}{{ getPlaceSuffix(result.place) }}</span>
            <span class="team">{{ result.teamName }}</span>
            <span class="score">{{ result.score }} ({{ result.holesPlayed }}H)</span>
            <span class="buyer">{{ result.buyerName }}</span>
            <span class="paid">{{ formatMoney(result.purchaseAmount) }}</span>
            <span class="payout">{{ formatMoney(result.payout) }}</span>
            <span class="profit" :class="{ positive: result.profit > 0, negative: result.profit < 0 }">
              {{ result.profit >= 0 ? '+' : '' }}{{ formatMoney(result.profit) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Payout Config -->
      <div class="payout-config">
        <div class="section-header">
          <h4>Payout Structure</h4>
        </div>
        <div class="payout-summary">
          <div v-for="payout in payoutStructure" :key="payout.place" class="payout-item">
            <span>{{ payout.place }}{{ getPlaceSuffix(payout.place) }}:</span>
            <span>{{ payout.type === 'percent' ? payout.value + '%' : formatMoney(payout.value) }}</span>
            <span v-if="payout.type === 'percent'" class="projected">
              ({{ formatMoney(calcuttaStore.totalPot * payout.value / 100) }})
            </span>
          </div>
        </div>
        <button class="btn-secondary btn-sm" @click="showSetup = true">Edit Payouts</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calcutta-manager {
  padding: 1rem;
}

.setup-prompt {
  text-align: center;
  padding: 2rem;
  background: var(--surface);
  border-radius: 12px;
}

.setup-prompt h3 {
  margin: 0 0 0.5rem;
}

.setup-prompt p {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

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
  background: var(--surface);
  border-radius: 16px;
  padding: 1.5rem;
  max-width: 400px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 1rem;
}

.section {
  margin-bottom: 1.5rem;
}

.section h4 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.hint {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.payout-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payout-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.place {
  font-weight: 600;
  width: 40px;
}

.payout-value {
  width: 60px;
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--text);
  text-align: center;
}

.payout-type {
  padding: 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--text);
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--danger);
  color: white;
  border-radius: 8px;
  cursor: pointer;
}

.payout-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}

.warning {
  color: var(--warning, #f59e0b);
  font-size: 0.85rem;
}

.success {
  color: var(--success, #10b981);
  font-size: 0.85rem;
}

.modal-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary {
  padding: 0.75rem 1.5rem;
  background: var(--surface-elevated, #374151);
  color: var(--text);
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-danger {
  padding: 0.75rem 1.5rem;
  background: var(--danger, #ef4444);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.calcutta-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.summary-card {
  display: flex;
  gap: 1rem;
  background: linear-gradient(135deg, var(--primary), var(--primary-dark, #059669));
  padding: 1.25rem;
  border-radius: 12px;
  color: white;
}

.summary-card > div {
  flex: 1;
  text-align: center;
}

.summary-card .label {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  opacity: 0.9;
  margin-bottom: 0.25rem;
}

.summary-card .value {
  font-size: 1.5rem;
  font-weight: 700;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-header h4 {
  margin: 0;
  font-size: 1rem;
}

.team-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.team-card {
  background: var(--surface);
  border-radius: 12px;
  padding: 1rem;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.team-card:active {
  transform: scale(0.98);
}

.team-card.sold {
  border-color: var(--primary);
  background: var(--surface-elevated, #1f2937);
}

.team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.team-number {
  font-weight: 600;
  font-size: 0.9rem;
}

.sold-badge {
  font-size: 0.65rem;
  padding: 0.15rem 0.4rem;
  background: var(--primary);
  color: white;
  border-radius: 4px;
  font-weight: 600;
}

.team-players {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.purchase-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.purchase-info .buyer {
  color: var(--text);
}

.purchase-info .amount {
  font-weight: 600;
  color: var(--primary);
}

.no-bid {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-style: italic;
}

.team-players-modal {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.input-field {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  color: var(--text);
  font-size: 1rem;
}

.results-section {
  background: var(--surface);
  border-radius: 12px;
  padding: 1rem;
}

.results-table {
  font-size: 0.8rem;
  overflow-x: auto;
}

.results-header {
  display: grid;
  grid-template-columns: 40px 1fr 60px 70px 50px 60px 60px;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  color: var(--text-secondary);
}

.results-row {
  display: grid;
  grid-template-columns: 40px 1fr 60px 70px 50px 60px 60px;
  gap: 0.5rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
  align-items: center;
}

.results-row.winner {
  background: rgba(16, 185, 129, 0.1);
}

.results-row .team {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.results-row .profit.positive {
  color: var(--success, #10b981);
}

.results-row .profit.negative {
  color: var(--danger, #ef4444);
}

.payout-config {
  background: var(--surface);
  border-radius: 12px;
  padding: 1rem;
}

.payout-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.payout-item {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.payout-item .projected {
  color: var(--text-secondary);
}
</style>
