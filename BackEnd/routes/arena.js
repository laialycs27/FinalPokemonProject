// routes/arena.js
const express = require("express");
const {
  loadUsers,
  getUserHistory,
  addHistoryEntry,
  getLeaderboardSorted,
  addPoints,
  removePoints,
  recordBattle,
  ensureLeaderboardRow,
} = require("../helpers/userStorage");

const router = express.Router();

/** POST /arena/history  { id, opponentId, result:1|0 } */
router.post("/history", (req, res) => {
  try {
    const { id, opponentId, result } = req.body || {};
    if (
      !id ||
      !opponentId ||
      (result !== 0 && result !== 1 && result !== "0" && result !== "1")
    ) {
      return res
        .status(400)
        .json({ error: "id, opponentId and result (1|0) are required" });
    }

    const users = loadUsers();
    const user = users.find((u) => String(u.id) === String(id));
    if (!user) return res.status(404).json({ error: "User not found" });

    const norm = Number(result) === 1 ? 1 : 0;
    const { user: updated, added } = addHistoryEntry(id, opponentId, norm);
    res
      .status(201)
      .json({ message: "History updated", added, history: updated.history });
  } catch (err) {
    console.error("Add history error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/** GET /arena/history/:userId */
/** GET /arena/history/:userId */
router.get("/history/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    // still validate the user exists
    const users = loadUsers();
    const user = users.find((u) => String(u.id) === String(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // if no record or empty, just return an empty array (not a 404)
    const rec = getUserHistory(userId);
    const history = Array.isArray(rec?.history) ? rec.history : [];

    return res.status(200).json({ history });
  } catch (err) {
    console.error("Get history error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/** ✅ GET /arena/leaderboard */
router.get("/leaderboard", (_req, res) => {
  try {
    const board = getLeaderboardSorted();
    res.status(200).json({ leaderboard: board });
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/leaderboard/record-battle", (req, res) => {
  try {
    const {
      winnerId,
      loserId,
      winPoints = 10,
      losePoints = 0,
    } = req.body || {};
    if (!winnerId || !loserId) {
      return res
        .status(400)
        .json({ error: "winnerId and loserId are required" });
    }
    const users = loadUsers();
    const w = users.find((u) => String(u.id) === String(winnerId));
    const l = users.find((u) => String(u.id) === String(loserId));
    if (!w || !l) return res.status(404).json({ error: "User not found" });

    const result = recordBattle({
      winnerId,
      loserId,
      winPoints,
      losePoints,
      winnerName: w.username,
      loserName: l.username,
    });
    res.status(200).json({ message: "Battle recorded", ...result });
  } catch (err) {
    console.error("record-battle error:", err);
    res.status(400).json({ error: err.message || "Bad request" });
  }
});

/** (optional) keep admin-ish endpoints supporting battlesDelta */
router.post("/leaderboard/add", (req, res) => {
  try {
    const { userId, points, battlesDelta = 0 } = req.body || {};
    if (!userId || points === undefined) {
      return res.status(400).json({ error: "userId and points are required" });
    }
    const users = loadUsers();
    const u = users.find((x) => String(x.id) === String(userId));
    if (!u) return res.status(404).json({ error: "User not found" });

    const row = addPoints(userId, points, u.username, battlesDelta);
    res.json({ message: "Points added", entry: row });
  } catch (err) {
    res.status(400).json({ error: err.message || "Bad request" });
  }
});

router.post("/leaderboard/remove", (req, res) => {
  try {
    const { userId, points, battlesDelta = 0 } = req.body || {};
    if (!userId || points === undefined) {
      return res.status(400).json({ error: "userId and points are required" });
    }
    const row = removePoints(userId, points, battlesDelta);
    res.json({ message: "Points removed", entry: row });
  } catch (err) {
    res.status(400).json({ error: err.message || "Bad request" });
  }
});

module.exports = router;
