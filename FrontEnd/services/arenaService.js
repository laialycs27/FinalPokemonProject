// frontEnd/services/arenaService.js

const API_BASE = "http://localhost:3000";

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore if no body
  }
  if (!res.ok) {
    const msg =
      data?.error || data?.message || `${res.status} ${res.statusText}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* ======================= Online users ======================= */

/** Get currently online users (from /auth/online). */
export function getOnlineUsers() {
  return fetchJSON(`${API_BASE}/auth/online`);
}

/* ======================= Battle History ======================= */

/**
 * Get battle history for a user.
 * @param {string} userId
 * @returns {Promise<{history: Array<{id:string,result:0|1,date:string}>}>}
 */
export function getHistory(userId) {
  return fetchJSON(`${API_BASE}/arena/history/${encodeURIComponent(userId)}`);
}

/**
 * Append a single history entry for a user.
 * Backend expects: { id, opponentId, result } where result is 1|0.
 * @param {string} userId
 * @param {string} opponentId
 * @param {0|1|boolean|number|string} result - truthy→1, falsy→0
 * @returns {Promise<{message:string, added:{id:string,result:0|1,date:string}, history:Array}>}
 */
export function addHistory(userId, opponentId, result) {
  const normalized = Number(result) === 1 ? 1 : 0;
  return fetchJSON(`${API_BASE}/arena/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, opponentId, result: normalized }),
  });
}

/**
 * Record a match for BOTH players in the history (two calls).
 * @param {string} playerId
 * @param {string} opponentId
 * @param {boolean} playerWon - true if playerId won
 */
export async function addHistoryForBoth(playerId, opponentId, playerWon) {
  const playerRes = playerWon ? 1 : 0;
  const oppRes = playerWon ? 0 : 1;
  await addHistory(playerId, opponentId, playerRes);
  await addHistory(opponentId, playerId, oppRes);
}

/* ======================= Leaderboard (points + battles) ======================= */

/** Get the leaderboard list. */
export function getLeaderboard() {
  return fetchJSON(`${API_BASE}/arena/leaderboard`);
}

/**
 * Add points to a user (optionally bump battles too).
 * @param {string} userId
 * @param {number} points
 * @param {number} [battlesDelta=0]
 */
export function addPoints(userId, points, battlesDelta = 0) {
  const amt = Number(points);
  return fetchJSON(`${API_BASE}/arena/leaderboard/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, points: amt, battlesDelta }),
  });
}

/**
 * Remove points from a user (optionally bump battles too).
 * @param {string} userId
 * @param {number} points
 * @param {number} [battlesDelta=0]
 */
export function removePoints(userId, points, battlesDelta = 0) {
  const amt = Number(points);
  return fetchJSON(`${API_BASE}/arena/leaderboard/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, points: amt, battlesDelta }),
  });
}

/**
 * Record a completed battle for BOTH players in one atomic request.
 * - Increments battles for winner and loser by +1
 * - Adds points to winner, removes (or not) from loser
 * @param {string} winnerId
 * @param {string} loserId
 * @param {number} [winPoints=10]
 * @param {number} [losePoints=0]  // set >0 to subtract from loser
 * @returns {Promise<{message:string, winner:{id,username,points,battles}, loser:{id,username,points,battles}}>}
 */
export function recordBattle(
  winnerId,
  loserId,
  winPoints = 10,
  losePoints = 0
) {
  return fetchJSON(`${API_BASE}/arena/leaderboard/record-battle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ winnerId, loserId, winPoints, losePoints }),
  });
}
