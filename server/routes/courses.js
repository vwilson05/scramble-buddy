import { Router } from 'express'
import db from '../db/index.js'

const router = Router()

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'e47ddf0da8msh5c15b2008f20a9cp1b9583jsn9c8b8b25173c'
const RAPIDAPI_HOST = 'golf-course-api.p.rapidapi.com'

// Search courses
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query

    if (!name || name.length < 2) {
      return res.json([])
    }

    const response = await fetch(
      `https://${RAPIDAPI_HOST}/search?name=${encodeURIComponent(name)}`,
      {
        headers: {
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY
        }
      }
    )

    if (!response.ok) {
      // API unavailable - return empty results, user can enter course manually
      console.log('Golf API unavailable, returning empty results')
      return res.json([])
    }

    const data = await response.json()

    // Handle various API response formats
    let courseList = []
    if (Array.isArray(data)) {
      courseList = data
    } else if (data.courses && Array.isArray(data.courses)) {
      courseList = data.courses
    } else if (data.results && Array.isArray(data.results)) {
      courseList = data.results
    } else if (typeof data === 'object' && data.name) {
      // Single course returned
      courseList = [data]
    }

    // Format response
    const courses = courseList.slice(0, 10).map(course => ({
      id: course.id || course._id || `${course.name}-${course.city}`.replace(/\s/g, '-').toLowerCase(),
      name: course.name || course.club_name,
      city: course.city || course.location?.city,
      state: course.state || course.location?.state,
      country: course.country || course.location?.country || 'USA'
    }))

    res.json(courses)
  } catch (error) {
    console.error('Course search error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get course details
router.get('/:id', async (req, res) => {
  try {
    // Check cache first
    const cached = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id)

    if (cached) {
      const holes = db.prepare('SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number').all(req.params.id)
      return res.json({
        course: {
          id: cached.id,
          name: cached.name,
          city: cached.city,
          state: cached.state,
          country: cached.country,
          slope_rating: cached.slope_rating,
          course_rating: cached.course_rating
        },
        holes
      })
    }

    // Fetch from API
    const response = await fetch(
      `https://${RAPIDAPI_HOST}/course/${req.params.id}`,
      {
        headers: {
          'x-rapidapi-host': RAPIDAPI_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY
        }
      }
    )

    if (!response.ok) {
      // Return mock data for demo purposes
      return res.json(generateMockCourse(req.params.id))
    }

    const data = await response.json()

    // Cache the course
    db.prepare(`
      INSERT OR REPLACE INTO courses (id, name, city, state, country, slope_rating, course_rating, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      data.name,
      data.city,
      data.state,
      data.country,
      data.slope_rating || 113,
      data.course_rating || 72,
      JSON.stringify(data)
    )

    // Cache holes
    const holes = data.holes || data.tees?.[0]?.holes || generateDefaultHoles()

    for (const hole of holes) {
      db.prepare(`
        INSERT OR REPLACE INTO holes (course_id, hole_number, par, handicap_rating, yardage_white, yardage_blue, yardage_gold)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.params.id,
        hole.number || hole.hole_number,
        hole.par,
        hole.handicap || hole.handicap_rating || hole.number,
        hole.yardage || hole.yardage_white || 350,
        hole.yardage_blue || hole.yardage || 380,
        hole.yardage_gold || hole.yardage || 320
      )
    }

    const cachedHoles = db.prepare('SELECT * FROM holes WHERE course_id = ? ORDER BY hole_number').all(req.params.id)

    res.json({
      course: {
        id: req.params.id,
        name: data.name,
        city: data.city,
        state: data.state,
        country: data.country,
        slope_rating: data.slope_rating || 113,
        course_rating: data.course_rating || 72
      },
      holes: cachedHoles
    })
  } catch (error) {
    console.error('Course fetch error:', error)
    // Return mock data on error
    res.json(generateMockCourse(req.params.id))
  }
})

// Generate mock course data for demo
function generateMockCourse(id) {
  const holes = generateDefaultHoles()

  // Cache mock holes
  for (const hole of holes) {
    db.prepare(`
      INSERT OR REPLACE INTO holes (course_id, hole_number, par, handicap_rating, yardage_white)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, hole.hole_number, hole.par, hole.handicap_rating, hole.yardage_white)
  }

  return {
    course: {
      id,
      name: id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      city: 'Local',
      state: 'ST',
      country: 'USA',
      slope_rating: 113,
      course_rating: 72
    },
    holes
  }
}

// Generate default 18 holes
function generateDefaultHoles() {
  const parPattern = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
  const yardageByPar = { 3: 165, 4: 380, 5: 520 }

  return parPattern.map((par, i) => ({
    hole_number: i + 1,
    par,
    handicap_rating: ((i * 7) % 18) + 1, // Distribute handicap ratings 1-18
    yardage_white: yardageByPar[par] + Math.floor(Math.random() * 40) - 20
  }))
}

export default router
