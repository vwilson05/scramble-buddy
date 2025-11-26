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
    updateHoles
  }
})
