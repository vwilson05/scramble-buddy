import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useSideBetsStore = defineStore('sidebets', () => {
  // State
  const sideBets = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Actions
  async function fetchSideBets(tournamentId) {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/sidebets/${tournamentId}`)
      sideBets.value = data
      return data
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
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

  async function deleteSideBet(id) {
    try {
      await axios.delete(`${API_URL}/sidebets/${id}`)
      sideBets.value = sideBets.value.filter(b => b.id !== id)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function createPress(betId, pressData) {
    try {
      const { data } = await axios.post(`${API_URL}/sidebets/${betId}/press`, pressData)
      // Refresh to get updated presses
      const bet = sideBets.value.find(b => b.id === betId)
      if (bet) {
        if (!bet.presses) bet.presses = []
        bet.presses.push({ ...data, status: {} })
      }
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  function clearSideBets() {
    sideBets.value = []
  }

  return {
    sideBets,
    loading,
    error,
    fetchSideBets,
    createSideBet,
    deleteSideBet,
    createPress,
    clearSideBets
  }
})
