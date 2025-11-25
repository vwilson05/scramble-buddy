import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useMultiDayStore = defineStore('multiday', () => {
  // State
  const currentMultiDay = ref(null)
  const multiDayList = ref([])
  const players = ref([])
  const rounds = ref([])
  const standings = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Computed
  const completedRounds = computed(() =>
    rounds.value.filter(r => r.status === 'completed')
  )

  const activeRound = computed(() =>
    rounds.value.find(r => r.status === 'active')
  )

  const upcomingRounds = computed(() =>
    rounds.value.filter(r => r.status === 'setup')
  )

  // Actions
  async function fetchMultiDayList() {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/multiday`)
      multiDayList.value = data
      return data
    } catch (err) {
      error.value = err.message
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchMultiDay(id) {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/multiday/${id}`)
      currentMultiDay.value = data
      players.value = data.players || []
      rounds.value = data.rounds || []
      standings.value = data.standings || []
      return data
    } catch (err) {
      error.value = err.message
      return null
    } finally {
      loading.value = false
    }
  }

  async function createMultiDay(tournamentData) {
    try {
      const { data } = await axios.post(`${API_URL}/multiday`, tournamentData)
      currentMultiDay.value = data
      players.value = data.players || []
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function updateMultiDay(id, updates) {
    try {
      const { data } = await axios.put(`${API_URL}/multiday/${id}`, updates)
      currentMultiDay.value = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function addPlayer(id, playerData) {
    try {
      const { data } = await axios.post(`${API_URL}/multiday/${id}/players`, playerData)
      players.value.push(data)
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function updatePlayer(multiDayId, playerId, updates) {
    try {
      const { data } = await axios.put(`${API_URL}/multiday/${multiDayId}/players/${playerId}`, updates)
      const idx = players.value.findIndex(p => p.id === playerId)
      if (idx >= 0) players.value[idx] = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function removePlayer(multiDayId, playerId) {
    try {
      await axios.delete(`${API_URL}/multiday/${multiDayId}/players/${playerId}`)
      players.value = players.value.filter(p => p.id !== playerId)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function createRound(multiDayId, roundData) {
    try {
      const { data } = await axios.post(`${API_URL}/multiday/${multiDayId}/rounds`, roundData)
      rounds.value.push(data)
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function fetchStandings(id) {
    try {
      const { data } = await axios.get(`${API_URL}/multiday/${id}/standings`)
      standings.value = data.standings || []
      return data
    } catch (err) {
      error.value = err.message
      return null
    }
  }

  async function deleteMultiDay(id) {
    try {
      await axios.delete(`${API_URL}/multiday/${id}`)
      multiDayList.value = multiDayList.value.filter(m => m.id !== id)
      if (currentMultiDay.value?.id === id) {
        currentMultiDay.value = null
        players.value = []
        rounds.value = []
        standings.value = []
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  function clearMultiDay() {
    currentMultiDay.value = null
    players.value = []
    rounds.value = []
    standings.value = []
  }

  return {
    currentMultiDay,
    multiDayList,
    players,
    rounds,
    standings,
    loading,
    error,
    completedRounds,
    activeRound,
    upcomingRounds,
    fetchMultiDayList,
    fetchMultiDay,
    createMultiDay,
    updateMultiDay,
    addPlayer,
    updatePlayer,
    removePlayer,
    createRound,
    fetchStandings,
    deleteMultiDay,
    clearMultiDay
  }
})
