import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useSideBetsStore = defineStore('sidebets', () => {
  // State
  const sideBets = ref([])
  const sideBetStatus = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Actions
  async function fetchSideBets(tournamentId) {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/sidebets/${tournamentId}`)
      sideBets.value = data
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSideBetStatus(tournamentId) {
    try {
      const { data } = await axios.get(`${API_URL}/sidebets/${tournamentId}/status`)
      sideBetStatus.value = data
      return data
    } catch (err) {
      error.value = err.message
    }
  }

  async function createSideBet(betData) {
    try {
      const { data } = await axios.post(`${API_URL}/sidebets`, betData)
      sideBets.value.push(data)
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function updateSideBet(id, betData) {
    try {
      const { data } = await axios.put(`${API_URL}/sidebets/${id}`, betData)
      const index = sideBets.value.findIndex(b => b.id === id)
      if (index !== -1) sideBets.value[index] = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deleteSideBet(id) {
    try {
      await axios.delete(`${API_URL}/sidebets/${id}`)
      sideBets.value = sideBets.value.filter(b => b.id !== id)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function createPress(sideBetId, pressData) {
    try {
      const { data } = await axios.post(`${API_URL}/sidebets/${sideBetId}/press`, pressData)
      // Add press to the appropriate side bet
      const bet = sideBets.value.find(b => b.id === sideBetId)
      if (bet) {
        if (!bet.presses) bet.presses = []
        bet.presses.push(data)
      }
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deletePress(pressId) {
    try {
      await axios.delete(`${API_URL}/sidebets/press/${pressId}`)
      // Remove press from all side bets
      sideBets.value.forEach(bet => {
        if (bet.presses) {
          bet.presses = bet.presses.filter(p => p.id !== pressId && p.parent_press_id !== pressId)
        }
      })
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  function clearSideBets() {
    sideBets.value = []
    sideBetStatus.value = []
  }

  return {
    // State
    sideBets,
    sideBetStatus,
    loading,
    error,
    // Actions
    fetchSideBets,
    fetchSideBetStatus,
    createSideBet,
    updateSideBet,
    deleteSideBet,
    createPress,
    deletePress,
    clearSideBets
  }
})
