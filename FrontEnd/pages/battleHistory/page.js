// frontEnd/pages/arena.battle-history.page/battle-history.js
import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import { logout as apiLogout } from "../../services/authService.js";
import { getOnlineUsers, getHistory } from "../../services/arenaService.js";

export async function init(mount, ctx) {
  // --- Auth guard ---
  requireAuth(ctx);

  // --- DOM refs ---
  const userLabel = mount.querySelector("#userLabel");
  const logoutBtn = mount.querySelector("#logout");

  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");

  const statusEl = mount.querySelector("#status");
  const listEl = mount.querySelector("#list");
  const sortBy = mount.querySelector("#sortBy");
  const filterBy = mount.querySelector("#filterBy");

  const sumTotal = mount.querySelector("#sumTotal");
  const sumWins = mount.querySelector("#sumWins");
  const sumLosses = mount.querySelector("#sumLosses");
  const sumRate = mount.querySelector("#sumRate");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- State ---
  let destroyed = false;
  let history = []; // [{id: opponentId, result:0|1, date:string}]
  let onlineMap = new Map(); // id -> username (for nicer opponent labels)

  const setStatus = (m = "") => statusEl && (statusEl.textContent = m);

  // --- Sidenav helpers ---
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

  // --- Data loaders ---
  async function loadOnlineMap() {
    try {
      const data = await getOnlineUsers();
      const list = Array.isArray(data?.online) ? data.online : [];
      onlineMap = new Map(
        list.map((u) => [String(u.id), u.username || u.email || u.id])
      );
    } catch {
      onlineMap = new Map();
    }
  }

  async function loadHistory() {
    try {
      const data = await getHistory(user.id);
      history = Array.isArray(data?.history) ? data.history.slice() : [];
      setStatus(history.length ? "" : "No battles yet.");
      render();
    } catch (e) {
      // We changed the backend to return 200 + [] when none, but just in case:
      if (e?.status === 404) {
        history = [];
        setStatus("No battles yet.");
        render();
      } else {
        console.error("history load failed:", e);
        setStatus("Failed to load history.");
      }
    }
  }

  // --- Render ---
  const human = (s) => (!s ? "" : s[0].toUpperCase() + s.slice(1));
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso || "";
    }
  };

  function resolveOpponentName(id) {
    const key = String(id);
    return onlineMap.get(key) || `Player ${key.slice(0, 6)}…`;
  }

  function summarize(arr) {
    const total = arr.length;
    const wins = arr.filter((x) => Number(x.result) === 1).length;
    const losses = total - wins;
    const rate = total ? Math.round((wins / total) * 100) : 0;
    return { total, wins, losses, rate };
  }

  function filterItems(arr) {
    const mode = filterBy?.value || "all";
    if (mode === "wins") return arr.filter((x) => Number(x.result) === 1);
    if (mode === "losses") return arr.filter((x) => Number(x.result) === 0);
    return arr;
  }

  function sortItems(arr) {
    const mode = sortBy?.value || "date-desc";
    const a = arr.slice();
    switch (mode) {
      case "date-asc":
        a.sort((x, y) => new Date(x.date) - new Date(y.date));
        break;
      case "opponent-asc":
        a.sort((x, y) =>
          resolveOpponentName(x.id).localeCompare(
            resolveOpponentName(y.id),
            undefined,
            { sensitivity: "base" }
          )
        );
        break;
      case "opponent-desc":
        a.sort((x, y) =>
          resolveOpponentName(y.id).localeCompare(
            resolveOpponentName(x.id),
            undefined,
            { sensitivity: "base" }
          )
        );
        break;
      case "date-desc":
      default:
        a.sort((x, y) => new Date(y.date) - new Date(x.date));
        break;
    }
    return a;
  }

  function cardHTML(rec) {
    const opp = resolveOpponentName(rec.id);
    const when = fmtDate(rec.date);
    const win = Number(rec.result) === 1;
    const cls = win ? "win" : "lose";
    const txt = win ? "Win" : "Loss";
    return `
      <article class="h-card">
        <div class="row">
          <span class="opponent">${opp}</span>
          <span class="badge ${cls}">${txt}</span>
        </div>
        <div class="row">
          <span class="date">${when}</span>
          <span class="meta"></span>
        </div>
      </article>
    `;
  }

  function render() {
    const view = sortItems(filterItems(history));
    if (listEl) listEl.innerHTML = view.map(cardHTML).join("");

    const s = summarize(history);
    if (sumTotal) sumTotal.textContent = String(s.total);
    if (sumWins) sumWins.textContent = String(s.wins);
    if (sumLosses) sumLosses.textContent = String(s.losses);
    if (sumRate) sumRate.textContent = `${s.rate}%`;
  }

  // --- Events ---
  const onLogout = async () => {
    try {
      // best-effort server logout (remove from online)
      await apiLogout(user.id);
    } catch {}
    clearSession();
    (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
  };
  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);

  const onSort = () => render();
  const onFilter = () => render();

  logoutBtn?.addEventListener("click", onLogout);
  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);

  sortBy?.addEventListener("change", onSort);
  filterBy?.addEventListener("change", onFilter);

  // Boot
  setNav(getNav());
  setStatus("Loading…");
  await loadOnlineMap();
  await loadHistory();

  // Cleanup
  return () => {
    destroyed = true;
    logoutBtn?.removeEventListener("click", onLogout);
    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    sortBy?.removeEventListener("change", onSort);
    filterBy?.removeEventListener("change", onFilter);
  };
}
