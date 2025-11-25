import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

const API_URL = '/api'

export const useCourseStore = defineStore('course', () => {
  // State
  const searchResults = ref([])
  const selectedCourse = ref(null)
  const holes = ref([])
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
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  function clearSelection() {
    selectedCourse.value = null
    holes.value = []
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

  return {
    // State
    searchResults,
    selectedCourse,
    holes,
    loading,
    error,
    // Actions
    searchCourses,
    selectCourse,
    clearSelection,
    getHole,
    getPar3Holes,
    getTotalPar
  }
})
