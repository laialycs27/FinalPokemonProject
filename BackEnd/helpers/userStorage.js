// helpers/userStorage.js
const fs = require("fs");
const path = require("path");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const FAVORITES_FILE = path.join(__dirname, "..", "data", "favorites.json");
const ONLINE_USERS_FILE = path.join(
  __dirname,
  "..",
  "data",
  "onlineUsers.json"
);

// NEW: battle history file
const BATTLE_HISTORY_FILE = path.join(
  __dirname,
  "..",
  "data",
  "battleHistory.json"
);
const LEADERBOARD_FILE = path.join(__dirname, "..", "data", "leaderboard.json");

function readJSON(file) {
  try {
    const data = fs.readFileSync(file, "utf-8");
    return JSON.parse(data || "[]");
  } catch {
    return [];
  }
}
function writeJSON(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error(`Failed to write to ${path.basename(file)}:`, err);
  }
}

/* ===== Users ===== */
function loadUsers() {
  return readJSON(USERS_FILE);
}
function saveUsers(users) {
  writeJSON(USERS_FILE, users);
}

/* ===== Favorites ===== */
function loadFavorites() {
  return readJSON(FAVORITES_FILE);
}
function saveFavorites(favorites) {
  writeJSON(FAVORITES_FILE, favorites);
}

/* ===== Online Users ===== */
function loadOnlineUsers() {
  return readJSON(ONLINE_USERS_FILE);
}
function saveOnlineUsers(list) {
  writeJSON(ONLINE_USERS_FILE, list);
}
function addOnlineUser({ id, username, email }) {
  const list = loadOnlineUsers();
  const now = new Date().toISOString();
  const ix = list.findIndex((u) => String(u.id) === String(id));
  if (ix >= 0) {
    list[ix] = { ...list[ix], username, email, lastSeen: now };
  } else {
    list.push({ id: String(id), username, email, since: now, lastSeen: now });
  }
  saveOnlineUsers(list);
  return list;
}
function removeOnlineUser(userId) {
  const list = loadOnlineUsers();
  const next = list.filter((u) => String(u.id) !== String(userId));
  const changed = next.length !== list.length;
  if (changed) saveOnlineUsers(next);
  return changed;
}

/* ===== Battle History (per-user) =====
 * Structure:
 * [
 *   { id: "userId", history: [ { id: "opponentId", result: 1|0, date: ISO } ] }
 * ]
 */
function loadBattleHistory() {
  return readJSON(BATTLE_HISTORY_FILE);
}
function saveBattleHistory(list) {
  writeJSON(BATTLE_HISTORY_FILE, list);
}
function getUserHistory(userId) {
  const all = loadBattleHistory();
  return all.find((h) => String(h.id) === String(userId)) || null;
}
function addHistoryEntry(userId, opponentId, result) {
  const all = loadBattleHistory();
  let rec = all.find((h) => String(h.id) === String(userId));
  const entry = {
    id: String(opponentId),
    result: result ? 1 : 0,
    date: new Date().toISOString(),
  };
  if (!rec) {
    rec = { id: String(userId), history: [entry] };
    all.push(rec);
  } else {
    if (!Array.isArray(rec.history)) rec.history = [];
    rec.history.push(entry);
  }
  saveBattleHistory(all);
  return { user: rec, added: entry };
}

function loadLeaderboard() {
  return readJSON(LEADERBOARD_FILE);
}
function saveLeaderboard(list) {
  writeJSON(LEADERBOARD_FILE, list);
}
function ensureLeaderboardRow(userId, username = "") {
  const board = loadLeaderboard();
  let row = board.find((r) => String(r.id) === String(userId));
  if (!row) {
    row = { id: String(userId), username, points: 0, battles: 0 };
    board.push(row);
    saveLeaderboard(board);
  } else {
    // backfill older rows that may not have battles
    if (typeof row.battles !== "number") row.battles = 0;
    if (!row.username && username) row.username = username;
  }
  return row;
}
function getLeaderboardSorted() {
  const board = loadLeaderboard().slice();
  board.forEach((r) => {
    if (typeof r.battles !== "number") r.battles = 0;
    if (typeof r.points !== "number") r.points = 0;
  });
  board.sort((a, b) => {
    const dp = (b.points || 0) - (a.points || 0);
    if (dp !== 0) return dp;
    return (a.username || "").localeCompare(b.username || "", undefined, {
      sensitivity: "base",
    });
  });
  return board;
}

// points: positive number
// battlesDelta: how many battles to add (default 0 so you can call it just for points)
function addPoints(userId, points, username = "", battlesDelta = 0) {
  const amt = Number(points);
  if (!Number.isFinite(amt) || amt < 0) throw new Error("points must be >= 0");
  const board = loadLeaderboard();
  let row = board.find((r) => String(r.id) === String(userId));
  if (!row) {
    row = { id: String(userId), username, points: 0, battles: 0 };
    board.push(row);
  } else if (username && !row.username) {
    row.username = username;
  }
  row.points = (row.points || 0) + amt;
  row.battles = (row.battles || 0) + Number(battlesDelta || 0);
  saveLeaderboard(board);
  return row;
}

// points: positive number to subtract from current points (floored at 0)
// battlesDelta: how many battles to add (default 0)
function removePoints(userId, points, battlesDelta = 0) {
  const amt = Number(points);
  if (!Number.isFinite(amt) || amt < 0) throw new Error("points must be >= 0");
  const board = loadLeaderboard();
  let row = board.find((r) => String(r.id) === String(userId));
  if (!row) {
    // if not present yet, create it (so battles can still increase)
    row = { id: String(userId), username: "", points: 0, battles: 0 };
    board.push(row);
  }
  row.points = Math.max(0, (row.points || 0) - amt);
  row.battles = (row.battles || 0) + Number(battlesDelta || 0);
  saveLeaderboard(board);
  return row;
}

// increment only battles
function addBattles(userId, delta = 1, username = "") {
  const d = Number(delta) || 0;
  const board = loadLeaderboard();
  let row = board.find((r) => String(r.id) === String(userId));
  if (!row) {
    row = { id: String(userId), username, points: 0, battles: 0 };
    board.push(row);
  } else if (username && !row.username) {
    row.username = username;
  }
  row.battles = (row.battles || 0) + d;
  saveLeaderboard(board);
  return row;
}

// One-shot atomic battle result update for both players
function recordBattle({
  winnerId,
  loserId,
  winPoints = 10,
  losePoints = 0,
  winnerName = "",
  loserName = "",
}) {
  // ensure rows
  ensureLeaderboardRow(winnerId, winnerName);
  ensureLeaderboardRow(loserId, loserName);

  // update: both +1 battle
  // winner gains points, loser loses (or 0) points
  const w = addPoints(winnerId, Number(winPoints) || 0, winnerName, 1);
  const l = removePoints(loserId, Number(losePoints) || 0, 1);
  return { winner: w, loser: l };
}

module.exports = {
  loadUsers,
  saveUsers,
  loadFavorites,
  saveFavorites,
  loadOnlineUsers,
  saveOnlineUsers,
  addOnlineUser,
  removeOnlineUser,

  // battle history
  loadBattleHistory,
  saveBattleHistory,
  getUserHistory,
  addHistoryEntry,

  loadLeaderboard,
  saveLeaderboard,
  ensureLeaderboardRow,
  getLeaderboardSorted,
  addPoints,
  removePoints,
  addBattles,
  recordBattle,
};
