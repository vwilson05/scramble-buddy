import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useTournamentStore = defineStore('tournament', () => {
  // State
  const currentTournament = ref(null)
  const tournaments = ref([])
  const players = ref([])
  const scores = ref([])
  const leaderboard = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Getters
  const isTeamGame = computed(() => {
    const teamGames = ['scramble', 'best_ball', 'high_low']
    return teamGames.includes(currentTournament.value?.game_type)
  })

  const greenieHoles = computed(() => {
    if (!currentTournament.value?.greenie_holes) return []
    return currentTournament.value.greenie_holes.split(',').map(Number)
  })

  // Actions
  async function fetchTournaments() {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/tournaments`)
      tournaments.value = data
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function fetchTournament(id) {
    loading.value = true
    try {
      const { data } = await axios.get(`${API_URL}/tournaments/${id}`)
      currentTournament.value = data.tournament
      players.value = data.players
      scores.value = data.scores
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  async function createTournament(tournamentData) {
    loading.value = true
    try {
      const { data } = await axios.post(`${API_URL}/tournaments`, tournamentData)
      return { id: data.id, slug: data.slug }
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  async function addPlayer(tournamentId, playerData) {
    try {
      const { data } = await axios.post(`${API_URL}/tournaments/${tournamentId}/players`, playerData)
      players.value.push(data)
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function updatePlayer(playerId, playerData) {
    try {
      const { data } = await axios.put(`${API_URL}/players/${playerId}`, playerData)
      const index = players.value.findIndex(p => p.id === playerId)
      if (index !== -1) players.value[index] = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function submitScore(scoreData) {
    try {
      const { data } = await axios.post(`${API_URL}/scores`, scoreData)
      // Update or add score
      const index = scores.value.findIndex(
        s => s.player_id === data.player_id && s.hole_number === data.hole_number
      )
      if (index !== -1) {
        scores.value[index] = data
      } else {
        scores.value.push(data)
      }
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function fetchLeaderboard(tournamentId) {
    try {
      const { data } = await axios.get(`${API_URL}/tournaments/${tournamentId}/leaderboard`)
      leaderboard.value = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function startTournament(id) {
    try {
      await axios.put(`${API_URL}/tournaments/${id}`, { status: 'active' })
      if (currentTournament.value) {
        currentTournament.value.status = 'active'
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function finishTournament(id) {
    try {
      await axios.put(`${API_URL}/tournaments/${id}`, { status: 'completed' })
      if (currentTournament.value) {
        currentTournament.value.status = 'completed'
      }
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  async function deleteTournament(id) {
    try {
      await axios.delete(`${API_URL}/tournaments/${id}`)
      tournaments.value = tournaments.value.filter(t => t.id !== id)
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  function getPlayerScore(playerId, holeNumber) {
    return scores.value.find(
      s => s.player_id === playerId && s.hole_number === holeNumber
    )
  }

  function getPlayerTotalGross(playerId) {
    return scores.value
      .filter(s => s.player_id === playerId)
      .reduce((sum, s) => sum + (s.strokes || 0), 0)
  }

  return {
    // State
    currentTournament,
    tournaments,
    players,
    scores,
    leaderboard,
    loading,
    error,
    // Getters
    isTeamGame,
    greenieHoles,
    // Actions
    fetchTournaments,
    fetchTournament,
    createTournament,
    addPlayer,
    updatePlayer,
    submitScore,
    fetchLeaderboard,
    startTournament,
    finishTournament,
    deleteTournament,
    getPlayerScore,
    getPlayerTotalGross
  }
})
