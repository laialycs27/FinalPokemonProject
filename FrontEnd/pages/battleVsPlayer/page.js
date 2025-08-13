// frontEnd/pages/arena.random-vs-player.page/random-vs-player.js
import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import { getFavorites } from "../../services/favoritesService.js";
import { pokeImgSmall, fetchById } from "../../services/pokeService.js";
import {
  getOnlineUsers,
  getHistory,
  addHistoryForBoth,
  recordBattle, // ⬅️ NEW
} from "../../services/arenaService.js";

export async function init(mount, ctx) {
  // --- Auth ---
  requireAuth(ctx);

  // --- DOM refs ---
  const userLabel = mount.querySelector("#userLabel");
  const logoutBtn = mount.querySelector("#logout");
  const statusEl = mount.querySelector("#status");
  const quotaEl = mount.querySelector("#quotaInfo");

  // sidenav
  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");

  // selection stage
  const selectStage = mount.querySelector("#selectStage");
  const opponentsEl = mount.querySelector("#opponents");
  const refreshOpponentsBtn = mount.querySelector("#refreshOpponents");

  // battle stage
  const battleStage = mount.querySelector("#battleStage");
  const playerCard = mount.querySelector("#playerCard");
  const opponentCard = mount.querySelector("#opponentCard");
  const startBtn = mount.querySelector("#startBattle");
  const backBtn = mount.querySelector("#backToList");
  const battleStatus = mount.querySelector("#battleStatus");
  const countdownEl = mount.querySelector("#countdown");
  const scoreLine = mount.querySelector("#scoreLine");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- Config ---
  const DAILY_LIMIT = 5; // total per day (bots or players)
  const WIN_POINTS = 10; // ⬅️ award for winner
  const LOSE_POINTS = 3; // ⬅️ penalty for loser (set 0 if you don’t want penalties)

  // --- State ---
  let destroyed = false;
  let myFavorites = [];
  let todaysCount = 0;

  let chosenOpponent = null; // {id, username, ...}
  let myPick = null; // chosen pokemon details (with stats)
  let oppPick = null; // chosen pokemon details (with stats)

  // --- Helpers ---
  const setStatus = (msg = "") =>
    statusEl ? (statusEl.textContent = msg) : null;
  const setBattleStatus = (msg = "") =>
    battleStatus ? (battleStatus.textContent = msg) : null;
  const setQuota = (used = 0) => {
    if (!quotaEl) return;
    const left = Math.max(0, DAILY_LIMIT - used);
    quotaEl.textContent = `Daily limit: ${used}/${DAILY_LIMIT} battles used`;
    quotaEl.style.color = left > 0 ? "#cfe" : "#ffb3b3";
  };

  const NAV_KEY = "navOpen";
  const setNav = (open) => {
    if (!sidenav || !navBackdrop || !navToggle) return;
    sidenav.classList.toggle("open", !!open);
    sidenav.setAttribute("aria-hidden", open ? "false" : "true");
    navBackdrop.hidden = !open;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    sessionStorage.setItem(NAV_KEY, open ? "1" : "0");
  };
  const getNav = () => sessionStorage.getItem(NAV_KEY) === "1";

  const human = (s) => (!s ? "" : s[0].toUpperCase() + s.slice(1));
  const chipsHTML = (arr = []) =>
    (arr || []).map((x) => `<span class="b-chip">${x}</span>`).join("");

  function statMap(details) {
    const m = {};
    (details.stats || []).forEach(
      (s) => (m[s?.stat?.name] = s?.base_stat ?? 0)
    );
    return m;
  }

  function weightScore(details) {
    // Weights per spec: HP .3, Attack .4, Defense .2, Speed .1
    const m = statMap(details);
    const score =
      (m["hp"] || 0) * 0.3 +
      (m["attack"] || 0) * 0.4 +
      (m["defense"] || 0) * 0.2 +
      (m["speed"] || 0) * 0.1;
    // tiny random jitter to avoid hard ties (0..0.49)
    const jitter = Math.random() * 0.49;
    return score + jitter;
  }

  function fillBattleCard(node, details) {
    const name = human(details.name);
    const id = details.id;
    const img =
      details.sprites?.other?.["official-artwork"]?.front_default ||
      details.sprites?.front_default ||
      pokeImgSmall(id);
    const types = (details.types || []).map((t) => t.type?.name);

    node.querySelector(".b-name").textContent = `#${id} ${name}`;
    const imgEl = node.querySelector(".b-img");
    imgEl.src = img;
    imgEl.alt = name;

    node.querySelector(".b-types").innerHTML = chipsHTML(types);

    // Stats bars
    const s = statMap(details);
    const rows = [
      ["hp", "HP"],
      ["attack", "Attack"],
      ["defense", "Defense"],
      ["speed", "Speed"],
    ];
    const maxVal = 200;
    const html = rows
      .map(([key, label]) => {
        const val = s[key] || 0;
        const pct = Math.max(
          0,
          Math.min(100, Math.round((val / maxVal) * 100))
        );
        return `
          <div class="stat-row" data-key="${key}">
            <span class="stat-name">${label}</span>
            <div class="stat-bar"><div class="stat-fill" style="width:${pct}%"></div></div>
            <span class="stat-val">${val}</span>
          </div>
        `;
      })
      .join("");
    node.querySelector(".b-stats").innerHTML = html;

    node.classList.remove("winner", "loser");
  }

  function markPerStatWin(pNode, oNode, pDetails, oDetails) {
    const pm = statMap(pDetails);
    const om = statMap(oDetails);
    ["hp", "attack", "defense", "speed"].forEach((k) => {
      const pRow = pNode.querySelector(`.stat-row[data-key="${k}"]`);
      const oRow = oNode.querySelector(`.stat-row[data-key="${k}"]`);
      const pv = pm[k] || 0;
      const ov = om[k] || 0;
      if (pv > ov) {
        pRow?.classList.add("win");
        oRow?.classList.add("lose");
      } else if (ov > pv) {
        oRow?.classList.add("win");
        pRow?.classList.add("lose");
      }
    });
  }

  function showSelect() {
    selectStage.hidden = false;
    battleStage.hidden = true;
    scoreLine.textContent = "";
    setBattleStatus("");
    countdownEl.style.display = "none";
  }
  function showBattle() {
    selectStage.hidden = true;
    battleStage.hidden = false;
    scoreLine.textContent = "";
    setBattleStatus("Ready.");
    countdownEl.style.display = "none";
  }

  function todayKey(d = new Date()) {
    // local day key
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function loadQuota() {
    try {
      const data = await getHistory(user.id);
      const key = todayKey();
      todaysCount = (data?.history || []).filter((h) =>
        (h.date || "").startsWith(key)
      ).length;
    } catch (e) {
      // backend now returns 200 with [] when empty, but keep this guard
      todaysCount = 0;
    }
    setQuota(todaysCount);
  }

  async function loadMyFavorites() {
    const data = await getFavorites(user.id).catch(() => null);
    myFavorites = Array.isArray(data?.favorites) ? data.favorites.slice() : [];
  }

  function pickRandomFavorite(list) {
    if (!list || !list.length) return null;
    const i = Math.floor(Math.random() * list.length);
    return list[i];
  }

  async function fetchOpponentHasFavorites(oppId) {
    try {
      const data = await getFavorites(oppId);
      const arr = Array.isArray(data?.favorites) ? data.favorites : [];
      return { has: arr.length > 0, favorites: arr };
    } catch (e) {
      return { has: false, favorites: [] };
    }
  }

  function userCardHTML(u, canChallenge) {
    const note = canChallenge
      ? ""
      : `<div class="user-meta">No favorites yet (cannot be challenged)</div>`;
    const disabledAttr = canChallenge ? "" : "disabled";
    return `
      <article class="user-card" data-id="${u.id}">
        <h4 class="user-name">${u.username || u.email || u.id}</h4>
        <div class="user-meta">since: ${
          u.since ? new Date(u.since).toLocaleString() : "—"
        }</div>
        ${note}
        <button class="challenge-btn" data-id="${
          u.id
        }" ${disabledAttr}>Challenge</button>
      </article>
    `;
  }

  async function listOpponents() {
    setStatus("Loading opponents...");
    opponentsEl.innerHTML = "";
    try {
      const data = await getOnlineUsers();
      const all = Array.isArray(data?.online) ? data.online : data || [];
      const others = all.filter((u) => String(u.id) !== String(user.id));

      if (!others.length) {
        setStatus("No online opponents right now.");
        return;
      }

      const rows = [];
      for (const opp of others) {
        const { has } = await fetchOpponentHasFavorites(opp.id);
        if (destroyed) return;
        rows.push(userCardHTML(opp, has));
      }
      opponentsEl.innerHTML = rows.join("");
      setStatus("Pick an opponent to challenge.");
    } catch (e) {
      console.error(e);
      setStatus("Failed to load opponents.");
    }
  }

  async function prepareBattle(oppUser) {
    // Ensure quota
    if (todaysCount >= DAILY_LIMIT) {
      setStatus("Daily battle limit reached.");
      return;
    }
    // Ensure favorites
    if (!myFavorites.length) {
      setStatus("You have no favorites. Add some in the Search page.");
      return;
    }
    const oppFavData = await getFavorites(oppUser.id).catch(() => null);
    const oppFavs = Array.isArray(oppFavData?.favorites)
      ? oppFavData.favorites
      : [];
    if (!oppFavs.length) {
      setStatus("Opponent has no favorites. Pick someone else.");
      return;
    }

    // Pick random favorite for each side
    const myFav = pickRandomFavorite(myFavorites);
    const oppFav = pickRandomFavorite(oppFavs);
    if (!myFav || !oppFav) {
      setStatus("Could not select Pokémon. Try again.");
      return;
    }

    // Load full details (stats)
    const [myDet, oppDet] = await Promise.all([
      fetchById(myFav.id),
      fetchById(oppFav.id),
    ]);

    myPick = myDet;
    oppPick = oppDet;
    chosenOpponent = oppUser;

    // Render cards
    fillBattleCard(playerCard, myPick);
    fillBattleCard(opponentCard, oppPick);
    playerCard
      .querySelectorAll(".stat-row")
      .forEach((r) => r.classList.remove("win", "lose"));
    opponentCard
      .querySelectorAll(".stat-row")
      .forEach((r) => r.classList.remove("win", "lose"));
    markPerStatWin(playerCard, opponentCard, myPick, oppPick);

    // expected score (just informative)
    const ps = weightScore(myPick);
    const os = weightScore(oppPick);
    scoreLine.textContent = `Score → You: ${ps.toFixed(2)} vs ${os.toFixed(
      2
    )} : ${
      chosenOpponent.username || chosenOpponent.email || chosenOpponent.id
    }`;

    showBattle();
  }

  async function doBattle() {
    if (!myPick || !oppPick || !chosenOpponent) return;

    if (todaysCount >= DAILY_LIMIT) {
      setBattleStatus("Daily battle limit reached.");
      return;
    }

    // Countdown UI
    countdownEl.style.display = "inline-block";
    let n = 3;
    countdownEl.textContent = "3";
    setBattleStatus("Get ready...");
    await new Promise((r) => setTimeout(r, 700));
    for (n = 2; n >= 1; n--) {
      countdownEl.textContent = String(n);
      await new Promise((r) => setTimeout(r, 700));
    }
    countdownEl.style.display = "none";

    // simple shake
    playerCard.classList.add("shake");
    opponentCard.classList.add("shake");
    await new Promise((r) => setTimeout(r, 500));
    playerCard.classList.remove("shake");
    opponentCard.classList.remove("shake");

    // Decide winner by weighted score
    const ps = weightScore(myPick);
    const os = weightScore(oppPick);
    const playerWon = ps >= os;

    if (playerWon) {
      playerCard.classList.add("winner");
      opponentCard.classList.add("loser");
      setBattleStatus(
        `You win! 👑  +${WIN_POINTS} pts to you, -${LOSE_POINTS} pts to opponent`
      );
    } else {
      opponentCard.classList.add("winner");
      playerCard.classList.add("loser");
      setBattleStatus(
        `You lose…  +${WIN_POINTS} pts to opponent, -${LOSE_POINTS} pts to you`
      );
    }

    // Record history for both players + update leaderboard/battles
    try {
      // history
      await addHistoryForBoth(user.id, chosenOpponent.id, playerWon);

      // leaderboard (atomic record for both players)
      if (playerWon) {
        await recordBattle(user.id, chosenOpponent.id, WIN_POINTS, LOSE_POINTS);
      } else {
        await recordBattle(chosenOpponent.id, user.id, WIN_POINTS, LOSE_POINTS);
      }

      todaysCount += 1;
      setQuota(todaysCount);
    } catch (e) {
      console.warn("Failed to record results:", e);
    }
  }

  // --- Events ---
  const onLogout = async () => {
    clearSession();
    (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
  };
  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);

  const onOpponentsClick = async (e) => {
    const btn = e.target.closest(".challenge-btn");
    if (!btn || btn.disabled) return; // ⬅️ ignore disabled
    const oppId = btn.dataset.id;
    if (!oppId) return;

    const card = btn.closest(".user-card");
    const username =
      card?.querySelector(".user-name")?.textContent?.trim() || oppId;

    await prepareBattle({ id: oppId, username });
  };

  const onBackToList = () => {
    myPick = null;
    oppPick = null;
    chosenOpponent = null;
    showSelect();
  };

  // Wire
  logoutBtn?.addEventListener("click", onLogout);
  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);

  refreshOpponentsBtn?.addEventListener("click", listOpponents);
  opponentsEl?.addEventListener("click", onOpponentsClick);

  startBtn?.addEventListener("click", doBattle);
  backBtn?.addEventListener("click", onBackToList);

  // Boot sequence
  setNav(getNav());
  setStatus("");
  await Promise.all([loadQuota(), loadMyFavorites()]);
  await listOpponents();

  // Cleanup
  return () => {
    destroyed = true;
    logoutBtn?.removeEventListener("click", onLogout);
    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);

    refreshOpponentsBtn?.removeEventListener("click", listOpponents);
    opponentsEl?.removeEventListener("click", onOpponentsClick);

    startBtn?.removeEventListener("click", doBattle);
    backBtn?.removeEventListener("click", onBackToList);
  };
}
