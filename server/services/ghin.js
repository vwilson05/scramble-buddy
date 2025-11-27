/**
 * GHIN (Golf Handicap Information Network) Integration Service
 *
 * Handles authentication and handicap lookup from GHIN.
 * Note: This uses unofficial API endpoints that may change.
 */

const GHIN_LOGIN_URL = 'https://api2.ghin.com/api/v1/golfer_login.json'
const GHIN_API_URL = 'https://api.ghin.com/api/v1'

/**
 * Authenticate with GHIN and get a bearer token
 * @param {string} ghinNumber - User's GHIN number
 * @param {string} password - User's GHIN password
 * @returns {Promise<{success: boolean, token?: string, golfer?: object, error?: string}>}
 */
export async function ghinLogin(ghinNumber, password) {
  try {
    const response = await fetch(GHIN_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user: {
          email_or_ghin: ghinNumber,
          password: password,
          remember_me: true
        },
        token: 'nonblank' // Required by GHIN API
      })
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      // Provide clearer error messages
      let errorMsg = data.error || data.message || 'Login failed'
      if (errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('invalid')) {
        errorMsg = 'GHIN account not found or inactive. Please check your GHIN number and ensure your membership is active.'
      }
      return {
        success: false,
        error: errorMsg
      }
    }

    // Extract token and golfer info
    const token = data.golfer_user?.golfer_user_token
    const golfer = data.golfer_user?.golfer

    if (!token) {
      return {
        success: false,
        error: 'No token received from GHIN'
      }
    }

    return {
      success: true,
      token,
      golfer: {
        id: golfer?.id,
        ghinNumber: golfer?.ghin,
        firstName: golfer?.first_name,
        lastName: golfer?.last_name,
        handicapIndex: golfer?.handicap_index,
        clubName: golfer?.club_name
      }
    }
  } catch (error) {
    console.error('GHIN login error:', error)
    return {
      success: false,
      error: 'Failed to connect to GHIN'
    }
  }
}

/**
 * Fetch handicap index for a golfer
 * @param {string} ghinNumber - User's GHIN number
 * @param {string} token - Bearer token from login
 * @returns {Promise<{success: boolean, handicapIndex?: number, golfer?: object, error?: string}>}
 */
export async function getHandicap(ghinNumber, token) {
  try {
    const response = await fetch(
      `${GHIN_API_URL}/golfers/search.json?per_page=1&page=1&golfer_id=${ghinNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Failed to fetch handicap'
      }
    }

    const golfer = data.golfers?.[0]
    if (!golfer) {
      return {
        success: false,
        error: 'Golfer not found'
      }
    }

    return {
      success: true,
      handicapIndex: parseFloat(golfer.handicap_index) || 0,
      golfer: {
        id: golfer.id,
        ghinNumber: golfer.ghin,
        firstName: golfer.first_name,
        lastName: golfer.last_name,
        handicapIndex: parseFloat(golfer.handicap_index) || 0,
        clubName: golfer.club_name,
        association: golfer.association_name
      }
    }
  } catch (error) {
    console.error('GHIN handicap fetch error:', error)
    return {
      success: false,
      error: 'Failed to connect to GHIN'
    }
  }
}

/**
 * Connect a player to GHIN - login and fetch handicap
 * @param {string} ghinNumber - User's GHIN number
 * @param {string} password - User's GHIN password
 * @returns {Promise<{success: boolean, token?: string, handicapIndex?: number, golfer?: object, error?: string}>}
 */
export async function connectGhin(ghinNumber, password) {
  // First, login to get token
  const loginResult = await ghinLogin(ghinNumber, password)

  if (!loginResult.success) {
    return loginResult
  }

  // Then fetch full handicap info
  const handicapResult = await getHandicap(ghinNumber, loginResult.token)

  if (!handicapResult.success) {
    return handicapResult
  }

  return {
    success: true,
    token: loginResult.token,
    handicapIndex: handicapResult.handicapIndex,
    golfer: handicapResult.golfer
  }
}

/**
 * Refresh handicap for an already-connected player
 * @param {string} ghinNumber - User's GHIN number
 * @param {string} token - Stored bearer token
 * @returns {Promise<{success: boolean, handicapIndex?: number, error?: string}>}
 */
export async function refreshHandicap(ghinNumber, token) {
  return getHandicap(ghinNumber, token)
}
