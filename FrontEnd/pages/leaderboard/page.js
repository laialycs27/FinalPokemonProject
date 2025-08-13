// frontEnd/pages/arena.leaderboard.page/leaderboard.js
import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import { logout as apiLogout } from "../../services/authService.js";
import { getLeaderboard, getHistory } from "../../services/arenaService.js";

export async function init(mount, ctx) {
  // Auth
  requireAuth(ctx);

  // DOM
  const userLabel = mount.querySelector("#userLabel");
  const logoutBtn = mount.querySelector("#logout");

  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");

  const grid = mount.querySelector("#grid");
  const statusEl = mount.querySelector("#status");
  const sortBy = mount.querySelector("#sortBy");
  const min5 = mount.querySelector("#min5");
  const searchEl = mount.querySelector("#search");

  // User label
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // State
  let destroyed = false;
  let rows = []; // [{id, username, points, battles, wins, losses, rate}]
  let raw = []; // backend leaderboard rows

  const setStatus = (t = "") => {
    if (statusEl) statusEl.textContent = t;
  };

  // Sidenav helpers
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

  // Utils
  const summarizeHistory = (historyArr = []) => {
    const total = historyArr.length;
    const wins = historyArr.filter((h) => Number(h.result) === 1).length;
    const losses = total - wins;
    const rate = total ? Math.round((wins / total) * 100) : 0;
    return { battles: total, wins, losses, rate };
  };

  // simple concurrency limiter
  async function mapWithConcurrency(items, mapper, limit = 6) {
    const ret = new Array(items.length);
    let i = 0,
      active = 0;
    return new Promise((resolve) => {
      const next = () => {
        if (i >= items.length && active === 0) return resolve(ret);
        while (active < limit && i < items.length) {
          const idx = i++,
            item = items[idx];
          active++;
          Promise.resolve()
            .then(() => mapper(item, idx))
            .then((val) => {
              ret[idx] = val;
            })
            .catch(() => {
              ret[idx] = undefined;
            })
            .finally(() => {
              active--;
              next();
            });
        }
      };
      next();
    });
  }

  function passesMin5(r) {
    return !min5?.checked || (r.battles || 0) >= 5;
  }

  function matchesSearch(r, q) {
    if (!q) return true;
    const id = String(r.id || "");
    const name = (r.username || "").toLowerCase();
    q = q.toLowerCase();
    return id.includes(q) || name.includes(q);
  }

  function sortRows(arr) {
    const mode = sortBy?.value || "points-desc";
    const a = arr.slice();
    switch (mode) {
      case "points-asc":
        a.sort((x, y) => (x.points || 0) - (y.points || 0));
        break;
      case "rate-desc":
        a.sort((x, y) => (y.rate || 0) - (x.rate || 0));
        break;
      case "battles-desc":
        a.sort((x, y) => (y.battles || 0) - (x.battles || 0));
        break;
      case "wins-desc":
        a.sort((x, y) => (y.wins || 0) - (x.wins || 0));
        break;
      case "name-asc":
        a.sort((x, y) =>
          (x.username || "").localeCompare(y.username || "", undefined, {
            sensitivity: "base",
          })
        );
        break;
      case "points-desc":
      default:
        a.sort((x, y) => (y.points || 0) - (x.points || 0));
        break;
    }
    return a;
  }

  function cardHTML(r, idx) {
    const rank = idx + 1;
    const topCls =
      rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const crown =
      rank === 1 ? "👑" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "#";
    const dim = (r.battles || 0) >= 5 ? "" : "dim";
    const ratePct = Math.max(0, Math.min(100, r.rate || 0));
    return `
      <article class="lb-card ${dim}">
        <div class="rank ${topCls}">${crown} ${rank}</div>
        <div class="userline">
          <span class="username">${
            r.username || `Player ${String(r.id).slice(0, 6)}…`
          }</span>
          <span class="points">${r.points ?? 0} pts</span>
        </div>
        <div class="stats">
          <div class="stat"><span class="k">Battles</span><span class="v">${
            r.battles ?? 0
          }</span></div>
          <div class="stat"><span class="k">Wins</span><span class="v">${
            r.wins ?? 0
          }</span></div>
          <div class="stat"><span class="k">Win rate</span><span class="v">${
            r.rate ?? 0
          }%</span></div>
        </div>
        <div class="ratebar"><div class="ratefill" style="width:${ratePct}%;"></div></div>
      </article>
    `;
  }

  function render() {
    const q = searchEl?.value?.trim() || "";
    const filtered = rows.filter((r) => passesMin5(r) && matchesSearch(r, q));
    const ordered = sortRows(filtered);
    if (grid) grid.innerHTML = ordered.map((r, i) => cardHTML(r, i)).join("");
    setStatus(`${ordered.length} shown / ${rows.length} loaded`);
  }

  // Data
  async function loadData() {
    setStatus("Loading leaderboard…");
    const data = await getLeaderboard();
    raw = Array.isArray(data?.leaderboard) ? data.leaderboard.slice() : [];

    // Enrich with history (compute wins/rate).
    // Use backend's battles if provided; else fallback to history length.
    const enriched = await mapWithConcurrency(
      raw,
      async (row) => {
        try {
          const res = await getHistory(row.id);
          const s = summarizeHistory(res?.history || []);
          const battles = Number.isFinite(row.battles)
            ? row.battles
            : s.battles;
          return {
            ...row,
            battles,
            wins: s.wins,
            losses: s.losses,
            rate: s.rate,
          };
        } catch {
          // no history → keep backend battles, wins/rate 0
          const battles = Number.isFinite(row.battles) ? row.battles : 0;
          return { ...row, battles, wins: 0, losses: 0, rate: 0 };
        }
      },
      8
    );

    rows = enriched;
    render();
  }

  // Events
  const onLogout = async () => {
    try {
      await apiLogout(user.id);
    } catch {}
    clearSession();
    (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
  };
  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);
  const onSort = () => render();
  const onMin5 = () => render();
  const onSearch = () => render();

  logoutBtn?.addEventListener("click", onLogout);
  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);
  sortBy?.addEventListener("change", onSort);
  min5?.addEventListener("change", onMin5);
  searchEl?.addEventListener("input", onSearch);

  // Boot
  setNav(getNav());
  try {
    await loadData();
    setStatus("");
  } catch (e) {
    console.error(e);
    setStatus("Failed to load leaderboard.");
  }

  // Cleanup
  return () => {
    destroyed = true;
    logoutBtn?.removeEventListener("click", onLogout);
    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    sortBy?.removeEventListener("change", onSort);
    min5?.removeEventListener("change", onMin5);
    searchEl?.removeEventListener("input", onSearch);
  };
}
