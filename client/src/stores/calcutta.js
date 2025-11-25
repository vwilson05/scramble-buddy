import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useCalcuttaStore = defineStore('calcutta', () => {
  // State
  const config = ref(null)
  const purchases = ref([])
  const teams = ref({})
  const totalPot = ref(0)
  const results = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // Actions
  async function fetchCalcutta(tournamentId) {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/calcutta/${tournamentId}`)
      config.value = data.config
      purchases.value = data.purchases
      teams.value = data.teams
      totalPot.value = data.totalPot
      return data
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function fetchResults(tournamentId) {
    try {
      const { data } = await axios.get(`${API_URL}/calcutta/${tournamentId}/results`)
      results.value = data
      return data
    } catch (err) {
      error.value = err.message
      return null
    }
  }

  async function saveConfig(tournamentId, configData) {
    try {
      await axios.post(`${API_URL}/calcutta/${tournamentId}/config`, configData)
      config.value = { ...config.value, ...configData }
      return true
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function savePurchase(tournamentId, purchaseData) {
    try {
      const { data } = await axios.post(`${API_URL}/calcutta/${tournamentId}/purchase`, purchaseData)

      // Update local state
      const idx = purchases.value.findIndex(p => p.team_number === purchaseData.team_number)
      if (idx >= 0) {
        purchases.value[idx] = data
      } else {
        purchases.value.push(data)
      }

      // Recalculate total pot
      totalPot.value = purchases.value.reduce((sum, p) => sum + p.amount, 0)

      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deletePurchase(tournamentId, teamNumber) {
    try {
      await axios.delete(`${API_URL}/calcutta/${tournamentId}/purchase/${teamNumber}`)
      purchases.value = purchases.value.filter(p => p.team_number !== teamNumber)
      totalPot.value = purchases.value.reduce((sum, p) => sum + p.amount, 0)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  function clearCalcutta() {
    config.value = null
    purchases.value = []
    teams.value = {}
    totalPot.value = 0
    results.value = null
  }

  return {
    config,
    purchases,
    teams,
    totalPot,
    results,
    loading,
    error,
    fetchCalcutta,
    fetchResults,
    saveConfig,
    savePurchase,
    deletePurchase,
    clearCalcutta
  }
})
