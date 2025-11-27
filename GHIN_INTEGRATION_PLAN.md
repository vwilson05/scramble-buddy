# GHIN Integration Plan

## User Requirements
- **Handicap lookup**: Auto-fetch from GHIN ✓
- **Score posting**: Post completed rounds back to GHIN ✓
- **Credentials**: User is OK entering GHIN credentials in app ✓

---

## Research Summary

### GHIN API Status

Based on research from multiple sources ([Stack Overflow](https://stackoverflow.com/questions/70985282/usga-website-api-and-json-quit-working-getting-error-invalid-token), [The Sand Trap Forum](https://thesandtrap.com/forums/topic/112075-usga-ghin-api/), [GitHub projects](https://github.com/georgebjork/GHIN-API)):

**The GHIN API exists but has significant restrictions:**

1. **Official API Access Requirements**: USGA requires that software supports "10 clubs or 1,400 golfers" for official API access
2. **Authentication**: Uses bearer token auth via `POST https://api2.ghin.com/api/v1/golfer_login.json`
3. **No Public API**: The public endpoint was removed; all access requires user credentials
4. **OAuth Available**: There's an OAuth flow at `https://api.ghin.com/oauth/authorize` for authorized apps

### Known Endpoints (Unofficial)

```
POST https://api2.ghin.com/api/v1/golfer_login.json
  Body: { user: { email_or_ghin, password, remember_me }, token: "nonblank" }
  Returns: golfer_user_token (bearer token)

GET https://api.ghin.com/api/v1/golfers/search.json?golfer_id={GHIN}
  Header: Authorization: Bearer {token}
  Returns: handicap_index, golfer info

GET https://api.ghin.com/api/v1/golfers/{ghin}/handicap_history_count.json
  Returns: handicap history
```

### Score Posting
**Score posting endpoints are NOT publicly documented.** Apps that post to GHIN (TheGrint, Golfshot) likely have commercial API agreements with USGA.

---

## Proposed Approach

### Option A: Direct GHIN Login (Recommended for MVP)
User enters their GHIN credentials directly in our app. We authenticate on their behalf.

**Pros:**
- Works without commercial API agreement
- User controls their own credentials
- Can fetch handicap immediately

**Cons:**
- User must trust us with GHIN password (security concern)
- Could break if GHIN changes API
- Cannot post scores (endpoint unknown)
- May violate GHIN ToS

### Option B: OAuth Integration (Requires USGA Partnership)
Proper OAuth flow where user logs in on GHIN's site and grants us access.

**Pros:**
- More secure - we never see password
- Would enable score posting
- Proper, sanctioned integration

**Cons:**
- Requires partnership with USGA
- May require meeting their 10 clubs/1,400 golfers threshold
- Significant business development effort

### Option C: Manual Entry with GHIN Lookup (Hybrid)
User enters GHIN number only. We look up their handicap from public sources or they manually enter it.

**Pros:**
- No credential storage
- Simple implementation
- No ToS concerns

**Cons:**
- Cannot auto-sync handicap
- Cannot post scores
- Limited value add

---

## Recommended Implementation: Option A (MVP)

Since Scramble Buddy is a personal/friend-group app without logins, we can:

1. **Per-Player GHIN Connection** (not app-wide login)
2. **Store encrypted credentials locally** (or just the token)
3. **Fetch handicap on demand**
4. **Skip score posting for now** (no known endpoint)

### Implementation Steps

#### Phase 1: Handicap Lookup

1. **Add GHIN fields to player schema**
   ```sql
   ALTER TABLE players ADD COLUMN ghin_number TEXT;
   ALTER TABLE players ADD COLUMN ghin_token TEXT; -- encrypted bearer token
   ALTER TABLE players ADD COLUMN ghin_connected_at TEXT;
   ```

2. **Create GHIN service on server**
   - `POST /api/ghin/login` - Authenticate with GHIN
   - `GET /api/ghin/handicap/:ghinNumber` - Fetch current handicap
   - Server-side to avoid CORS issues

3. **Add "Connect GHIN" button in Setup.vue**
   - Opens modal asking for GHIN # and password
   - On success: saves token, fetches handicap, updates player
   - Shows green checkmark if connected

4. **Auto-refresh handicap**
   - On tournament load, refresh handicap for connected players
   - Show "last synced" timestamp

#### Phase 2: Score Posting (Future - Requires Research)

This would require either:
- Finding the undocumented score posting endpoint
- Partnering with USGA for official API access
- Using a third-party service like SportsFirst

---

## UI/UX Design

### Setup Page - Player Card

```
┌─────────────────────────────────────────────┐
│ Player Name: [Victor Wilson        ]        │
│                                             │
│ Handicap: [12.4] ← auto-filled if GHIN     │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🔗 Connect GHIN                         │ │
│ └─────────────────────────────────────────┘ │
│           OR (if connected)                 │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ GHIN Connected (12.4)    [Refresh]    │ │
│ │   Last synced: 2 min ago                │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Tee: [White ▼]                              │
└─────────────────────────────────────────────┘
```

### GHIN Connect Modal

```
┌─────────────────────────────────────────────┐
│        Connect to GHIN                   X  │
├─────────────────────────────────────────────┤
│                                             │
│  GHIN Number: [1234567        ]             │
│                                             │
│  Password:    [••••••••       ]             │
│                                             │
│  ⓘ Your credentials are used only to       │
│    fetch your handicap from GHIN.           │
│    We don't store your password.            │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │            Connect                      ││
│  └─────────────────────────────────────────┘│
│                                             │
└─────────────────────────────────────────────┘
```

---

## Technical Considerations

### Security
- **Never store raw passwords** - only the bearer token
- **Encrypt tokens** at rest in SQLite
- **Token expiry** - tokens may expire, need refresh logic
- **HTTPS only** - all GHIN API calls over HTTPS

### Error Handling
- Invalid credentials
- GHIN API down/changed
- Token expired
- Rate limiting

### CORS
- GHIN API likely blocks browser requests
- All calls must go through our server as proxy

---

## Questions for User

1. **Scope**: Is handicap lookup enough for MVP, or is score posting essential?
2. **Credential Storage**: Are you comfortable with users entering GHIN passwords in the app?
3. **Alternative**: Would linking to GHIN app for manual score posting be acceptable?

---

## Risks

1. **API Stability**: Unofficial API could change/break
2. **ToS Violation**: Using unofficial API may violate GHIN terms
3. **Score Posting**: May not be possible without partnership
4. **User Trust**: Asking for GHIN credentials requires trust

---

## Implementation Plan

### Phase 1: Handicap Lookup (2-3 hours)

1. **Database changes**
   - Add `ghin_number`, `ghin_token`, `ghin_connected_at` to players table

2. **Server-side GHIN service** (`server/services/ghin.js`)
   ```javascript
   // Login and get token
   async function ghinLogin(ghinNumber, password) {
     const response = await fetch('https://api2.ghin.com/api/v1/golfer_login.json', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         user: { email_or_ghin: ghinNumber, password, remember_me: true },
         token: 'nonblank'
       })
     })
     return response.json() // contains golfer_user_token
   }

   // Fetch handicap
   async function getHandicap(ghinNumber, token) {
     const response = await fetch(
       `https://api.ghin.com/api/v1/golfers/search.json?golfer_id=${ghinNumber}`,
       { headers: { Authorization: `Bearer ${token}` } }
     )
     const data = await response.json()
     return data.golfers[0].handicap_index
   }
   ```

3. **API routes** (`server/routes/ghin.js`)
   - `POST /api/ghin/connect` - Login, save token, return handicap
   - `POST /api/ghin/refresh/:playerId` - Refresh handicap for connected player

4. **UI in Setup.vue**
   - "Connect GHIN" button per player
   - Modal for GHIN # and password entry
   - Show connected status with handicap

### Phase 2: Score Posting (Research Required)

The score posting endpoint is **not publicly documented**. To implement:

1. **Option A: Reverse Engineer**
   - Use a proxy (Charles/mitmproxy) to capture GHIN mobile app traffic
   - Find the POST endpoint for score submission
   - Replicate in our app

2. **Option B: Deep Link to GHIN App**
   - After round, show "Post to GHIN" button
   - Opens GHIN mobile app (if installed) with pre-filled data
   - URL scheme: `ghin://` (need to verify)

3. **Option C: Web Redirect**
   - Open GHIN website score posting page
   - Pre-fill what we can via URL params (if supported)

**Recommended: Start with Phase 1, then Option A for Phase 2**

---

## Next Steps

1. Implement Phase 1 (handicap lookup)
2. Test with real GHIN credentials
3. Research score posting endpoint (may need to intercept GHIN app traffic)
4. Implement score posting once endpoint is found

**Estimated Total Effort:**
- Phase 1: 2-3 hours
- Phase 2: 2-4 hours (depending on endpoint discovery)
