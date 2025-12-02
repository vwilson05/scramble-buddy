import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useCourseStore = defineStore('course', () => {
  // State
  const searchResults = ref([])
  const selectedCourse = ref(null)
  const holes = ref([])
  const teeBoxes = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Actions
  async function searchCourses(query) {
    if (!query || query.length < 2) {
      searchResults.value = []
      return
    }

    loading.value = true
    error.value = null
    try {
      const { data } = await axios.get(`${API_URL}/courses/search`, {
        params: { name: query }
      })
      searchResults.value = data
    } catch (err) {
      error.value = err.message
      searchResults.value = []
    } finally {
      loading.value = false
    }
  }

  async function selectCourse(course) {
    loading.value = true
    error.value = null
    try {
      const { data } = await axios.get(`${API_URL}/courses/${course.id}`)
      selectedCourse.value = data.course
      holes.value = data.holes
      teeBoxes.value = data.teeBoxes || []
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function clearSelection() {
    selectedCourse.value = null
    holes.value = []
    teeBoxes.value = []
    searchResults.value = []
  }

  function getHole(holeNumber) {
    return holes.value.find(h => h.hole_number === holeNumber)
  }

  function getPar3Holes() {
    return holes.value.filter(h => h.par === 3)
  }

  function getTotalPar() {
    return holes.value.reduce((sum, h) => sum + h.par, 0)
  }

  function getYardage(teeColor, startHole = 1, endHole = 18) {
    const yardageKey = `yardage_${teeColor.toLowerCase()}`
    return holes.value
      .filter(h => h.hole_number >= startHole && h.hole_number <= endHole)
      .reduce((sum, h) => sum + (h[yardageKey] || 0), 0)
  }

  function getFrontNineYardage(teeColor) {
    return getYardage(teeColor, 1, 9)
  }

  function getBackNineYardage(teeColor) {
    return getYardage(teeColor, 10, 18)
  }

  function getTotalYardage(teeColor) {
    return getYardage(teeColor, 1, 18)
  }

  async function updateHoles(courseId, updatedHoles) {
    loading.value = true
    error.value = null
    try {
      const { data } = await axios.put(`${API_URL}/courses/${courseId}/holes`, {
        holes: updatedHoles
      })
      // Update local holes with the response
      holes.value = data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * Recommend tee based on player handicap and available tees
   * Uses USGA/PGA guidelines for tee selection
   * @param {number} handicap - Player's handicap index
   * @returns {object|null} - Recommended tee { name, slope, rating, reason }
   */
  function getRecommendedTee(handicap) {
    if (!teeBoxes.value || teeBoxes.value.length === 0) return null

    // Sort tees by slope (descending - hardest first)
    const sortedTees = [...teeBoxes.value].sort((a, b) => (b.slope || 0) - (a.slope || 0))

    // Tee recommendation thresholds based on handicap
    // Lower handicap = can play harder (higher slope) tees
    let recommended
    let reason

    if (handicap <= 5) {
      // Scratch to low handicap - back/championship tees
      recommended = sortedTees[0]
      reason = 'Low handicap - play the tips'
    } else if (handicap <= 12) {
      // Single digit to low teens - back to middle tees
      recommended = sortedTees.length > 1 ? sortedTees[1] : sortedTees[0]
      reason = 'Mid handicap - back/middle tees'
    } else if (handicap <= 20) {
      // Mid handicap - middle tees
      const midIndex = Math.floor(sortedTees.length / 2)
      recommended = sortedTees[midIndex] || sortedTees[0]
      reason = 'Mid-high handicap - middle tees'
    } else if (handicap <= 30) {
      // High handicap - forward/middle tees
      const forwardIndex = Math.min(sortedTees.length - 2, sortedTees.length - 1)
      recommended = sortedTees[Math.max(0, forwardIndex)]
      reason = 'High handicap - forward tees recommended'
    } else {
      // Very high handicap - most forward tees
      recommended = sortedTees[sortedTees.length - 1]
      reason = 'Forward tees for enjoyment'
    }

    return recommended ? { ...recommended, reason } : null
  }

  /**
   * Get tee recommendations for all players based on their handicaps
   * @param {Array} players - Array of player objects with handicap property
   * @returns {Array} - Array of { playerName, handicap, recommendedTee }
   */
  function getTeamTeeRecommendations(players) {
    if (!players || !teeBoxes.value.length) return []

    return players.map(p => ({
      name: p.name,
      handicap: p.handicap || 0,
      recommended: getRecommendedTee(p.handicap || 0)
    }))
  }

  /**
   * Get the recommended group tee based on average handicap
   * Useful for scrambles where the whole team plays from the same tee
   * @param {Array} players - Array of player objects with handicap property
   * @returns {object|null} - Recommended tee for the group
   */
  function getGroupTeeRecommendation(players) {
    if (!players || players.length === 0) return null

    const avgHandicap = players.reduce((sum, p) => sum + (p.handicap || 0), 0) / players.length
    const recommendation = getRecommendedTee(avgHandicap)

    if (recommendation) {
      recommendation.avgHandicap = Math.round(avgHandicap * 10) / 10
      recommendation.reason = `Group avg HCP: ${recommendation.avgHandicap}`
    }

    return recommendation
  }

  return {
    // State
    searchResults,
    selectedCourse,
    holes,
    teeBoxes,
    loading,
    error,
    // Actions
    searchCourses,
    selectCourse,
    clearSelection,
    getHole,
    getPar3Holes,
    getTotalPar,
    getYardage,
    getFrontNineYardage,
    getBackNineYardage,
    getTotalYardage,
    updateHoles,
    // Tee recommendations
    getRecommendedTee,
    getTeamTeeRecommendations,
    getGroupTeeRecommendation
  }
})
