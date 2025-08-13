import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import { getFavorites } from "../../services/favoritesService.js";
import { pokeImgSmall, fetchById } from "../../services/pokeService.js";
import { logout } from "../../services/authService.js";

export async function init(mount, ctx) {
  // --- Auth ---
  requireAuth(ctx);

  // --- DOM refs ---
  const userLabel = mount.querySelector("#userLabel");
  const logoutBtn = mount.querySelector("#logout");
  const statusEl = mount.querySelector("#status");

  // sidenav
  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");

  // stages
  const selectStage = mount.querySelector("#selectStage");
  const favGrid = mount.querySelector("#favGrid");

  const battleStage = mount.querySelector("#battleStage");
  const playerCard = mount.querySelector("#playerCard");
  const botCard = mount.querySelector("#botCard");
  const startBtn = mount.querySelector("#startBattle");
  const chooseAnotherBtn = mount.querySelector("#chooseAnother");
  const rerollBotBtn = mount.querySelector("#rerollBot");
  const battleStatus = mount.querySelector("#battleStatus");
  const countdownEl = mount.querySelector("#countdown");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- State ---
  let destroyed = false;
  let favorites = [];
  let chosen = null; // chosen favorite details (with stats)
  let bot = null; // bot pokemon details (with stats)

  // --- Helpers ---
  const setStatus = (msg = "") =>
    statusEl ? (statusEl.textContent = msg) : null;

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

  const randomInt = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  async function fetchRandomPokemon(maxTries = 6) {
    // Conservative safe range (to avoid 404s on some forms/IDs)
    const MAX_ID = 1010;
    for (let i = 0; i < maxTries; i++) {
      const id = randomInt(1, MAX_ID);
      try {
        const p = await fetchById(id);
        if (p?.sprites) return p;
      } catch (_) {
        // retry
      }
    }
    throw new Error("Failed to pick random bot. Try again.");
  }

  function statMap(details) {
    // Convert API stats array to {hp, attack, defense, special-attack, special-defense, speed}
    const m = {};
    (details.stats || []).forEach((s) => {
      m[s?.stat?.name] = s?.base_stat ?? 0;
    });
    return m;
  }

  function totalStats(m) {
    return (
      (m["hp"] || 0) +
      (m["attack"] || 0) +
      (m["defense"] || 0) +
      (m["special-attack"] || 0) +
      (m["special-defense"] || 0) +
      (m["speed"] || 0)
    );
  }

  function humanName(s) {
    if (!s) return "";
    return s[0].toUpperCase() + s.slice(1);
  }

  function chipsHTML(arr = []) {
    if (!arr || !arr.length) return "";
    return arr.map((x) => `<span class="b-chip">${x}</span>`).join("");
  }

  function favCardHTML(p) {
    const id = Number(p.id);
    const name = humanName(p.name);
    const img = p.image || pokeImgSmall(id);
    const types = p.types || [];
    return `
      <button class="fav-card" data-id="${id}" aria-label="Pick ${name}">
        <img src="${img}" alt="${name}" loading="lazy" />
        <h4>#${id} ${name}</h4>
        <div class="fav-types">
          ${types.map((t) => `<span class="fav-chip">${t}</span>`).join("")}
        </div>
      </button>
    `;
  }

  function fillBattleCard(node, details) {
    const name = humanName(details.name);
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

    const typesEl = node.querySelector(".b-types");
    typesEl.innerHTML = chipsHTML(types);

    // Stats bars
    const stats = statMap(details);
    const rows = [
      ["hp", "HP"],
      ["attack", "Attack"],
      ["defense", "Defense"],
      ["special-attack", "Sp. Atk"],
      ["special-defense", "Sp. Def"],
      ["speed", "Speed"],
    ];

    const maxVal = 200; // progress bar scale
    const html = rows
      .map(([key, label]) => {
        const val = stats[key] || 0;
        const w = Math.max(0, Math.min(100, Math.round((val / maxVal) * 100)));
        return `
          <div class="stat-row" data-key="${key}">
            <span class="stat-name">${label}</span>
            <div class="stat-bar">
              <div class="stat-fill" style="width:${w}%"></div>
            </div>
          </div>
        `;
      })
      .join("");
    node.querySelector(".b-stats").innerHTML = html;
  }

  function compareAndMark(playerDetails, botDetails) {
    // Reset classes
    playerCard.classList.remove("winner", "loser");
    botCard.classList.remove("winner", "loser");

    // Per-stat win marks
    const pStats = statMap(playerDetails);
    const bStats = statMap(botDetails);
    const keys = [
      "hp",
      "attack",
      "defense",
      "special-attack",
      "special-defense",
      "speed",
    ];

    let pWins = 0;
    let bWins = 0;

    keys.forEach((k) => {
      const pRow = playerCard.querySelector(`.stat-row[data-key="${k}"]`);
      const bRow = botCard.querySelector(`.stat-row[data-key="${k}"]`);
      const pv = pStats[k] || 0;
      const bv = bStats[k] || 0;
      if (pv > bv) {
        pWins++;
        pRow?.classList.add("win");
        bRow?.classList.add("lose");
      } else if (bv > pv) {
        bWins++;
        bRow?.classList.add("win");
        pRow?.classList.add("lose");
      } else {
        // equal: no mark
      }
    });

    // Decide winner
    let winner = null;
    if (pWins > bWins) winner = "player";
    else if (bWins > pWins) winner = "bot";
    else {
      // tie-breakers
      const pTotal = totalStats(pStats);
      const bTotal = totalStats(bStats);
      if (pTotal > bTotal) winner = "player";
      else if (bTotal > pTotal) winner = "bot";
      else {
        if ((pStats["speed"] || 0) > (bStats["speed"] || 0)) winner = "player";
        else if ((bStats["speed"] || 0) > (pStats["speed"] || 0))
          winner = "bot";
        else {
          winner = Math.random() < 0.5 ? "player" : "bot";
        }
      }
    }

    if (winner === "player") {
      playerCard.classList.add("winner");
      botCard.classList.add("loser");
    } else {
      botCard.classList.add("winner");
      playerCard.classList.add("loser");
    }
    return winner;
  }

  function showSelect() {
    selectStage.hidden = false;
    battleStage.hidden = true;
    battleStatus.textContent = "";
    countdownEl.hidden = true;
  }

  function showBattle() {
    selectStage.hidden = true;
    battleStage.hidden = false;
    battleStatus.textContent = "";
    countdownEl.hidden = true;
  }

  // --- Data bootstrap ---
  async function loadFavorites() {
    if (!user?.id) return;
    try {
      const data = await getFavorites(user.id);
      favorites = Array.isArray(data?.favorites) ? data.favorites.slice() : [];
      if (favorites.length === 0) {
        setStatus("No favorites yet. Add some from the Search page first.");
      } else {
        setStatus(`Pick one of your ${favorites.length} favorites to battle.`);
      }
      favGrid.innerHTML = favorites.map(favCardHTML).join("");
    } catch (e) {
      if (e?.status === 404) {
        favorites = [];
        setStatus("No favorites yet. Add some from the Search page first.");
      } else {
        console.error("Failed to load favorites:", e);
        setStatus("Could not load favorites.");
      }
    }
  }

  async function pickFavorite(id) {
    setStatus("Loading battle...");
    try {
      chosen = await fetchById(id);
      bot = await fetchRandomPokemon();

      fillBattleCard(playerCard, chosen);
      fillBattleCard(botCard, bot);

      showBattle();
      battleStatus.textContent = "Ready? Hit Start Battle!";
    } catch (e) {
      console.error(e);
      setStatus("Could not start battle. Try another Pokémon.");
    }
  }

  // --- Countdown ---
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  async function startCountdown() {
    countdownEl.hidden = false;
    for (let n = 3; n >= 1; n--) {
      countdownEl.textContent = String(n);
      await delay(800);
    }
    countdownEl.hidden = true;
  }

  // --- Events ---
  const onFavClick = (e) => {
    const card = e.target.closest(".fav-card");
    if (!card) return;
    const id = Number(card.dataset.id);
    if (!id) return;
    pickFavorite(id);
  };

  const onStart = async () => {
    if (!chosen || !bot) {
      battleStatus.textContent = "Pick a Pokémon first.";
      return;
    }
    // disable actions during countdown
    startBtn.setAttribute("disabled", "true");
    rerollBotBtn.setAttribute("disabled", "true");
    chooseAnotherBtn.setAttribute("disabled", "true");

    battleStatus.textContent = "Get ready...";
    await startCountdown();

    // clear previous marks (if any)
    playerCard.classList.remove("winner", "loser");
    botCard.classList.remove("winner", "loser");
    [...playerCard.querySelectorAll(".stat-row")].forEach((r) =>
      r.classList.remove("win", "lose")
    );
    [...botCard.querySelectorAll(".stat-row")].forEach((r) =>
      r.classList.remove("win", "lose")
    );

    const winner = compareAndMark(chosen, bot);
    battleStatus.textContent =
      winner === "player" ? "You win! 🎉" : "Bot wins! 🤖";

    // re-enable
    startBtn.removeAttribute("disabled");
    rerollBotBtn.removeAttribute("disabled");
    chooseAnotherBtn.removeAttribute("disabled");
  };

  const onReroll = async () => {
    try {
      rerollBotBtn.setAttribute("disabled", "true");
      battleStatus.textContent = "Rolling bot...";

      bot = await fetchRandomPokemon();
      fillBattleCard(botCard, bot);

      // reset marks
      playerCard.classList.remove("winner", "loser");
      botCard.classList.remove("winner", "loser");
      [...playerCard.querySelectorAll(".stat-row")].forEach((r) =>
        r.classList.remove("win", "lose")
      );
      [...botCard.querySelectorAll(".stat-row")].forEach((r) =>
        r.classList.remove("win", "lose")
      );

      battleStatus.textContent = "Bot ready. Start when you are.";
    } catch (e) {
      console.error(e);
      battleStatus.textContent = "Failed to reroll bot.";
    } finally {
      rerollBotBtn.removeAttribute("disabled");
    }
  };

  const onChooseAnother = () => {
    chosen = null;
    bot = null;
    showSelect();
  };

  const onLogout = async () => {
    try {
      const user = getSessionUser();
      if (user?.id) {
        await logout(user.id); // best-effort: remove from onlineUsers on server
      }
    } catch (err) {
      console.warn("Server logout failed, clearing local session anyway.", err);
    } finally {
      clearSession();
      (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
    }
  };

  // Sidenav interactions
  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);
  const onKeyDown = (e) => {
    if (e.key === "Escape") setNav(false);
  };

  // Wire up
  favGrid?.addEventListener("click", onFavClick);
  startBtn?.addEventListener("click", onStart);
  rerollBotBtn?.addEventListener("click", onReroll);
  chooseAnotherBtn?.addEventListener("click", onChooseAnother);
  logoutBtn?.addEventListener("click", onLogout);

  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);
  document.addEventListener("keydown", onKeyDown);

  // Restore nav state (optional)
  setNav(getNav());

  // Boot
  await loadFavorites();

  // Cleanup
  return () => {
    destroyed = true;
    favGrid?.removeEventListener("click", onFavClick);
    startBtn?.removeEventListener("click", onStart);
    rerollBotBtn?.removeEventListener("click", onReroll);
    chooseAnotherBtn?.removeEventListener("click", onChooseAnother);
    logoutBtn?.removeEventListener("click", onLogout);

    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    document.removeEventListener("keydown", onKeyDown);
  };
}
