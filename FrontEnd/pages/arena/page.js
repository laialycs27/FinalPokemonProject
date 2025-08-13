// frontEnd/pages/arena.page/arena.js
import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import { logout } from "../../services/authService.js";

export async function init(mount, ctx) {
  // --- Auth guard ---
  requireAuth(ctx);

  // --- DOM refs ---
  const userLabel = mount.querySelector("#userLabel");
  const logoutBtn = mount.querySelector("#logout");

  // sidenav
  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");
  const navSearch = mount.querySelector("#navSearch");
  const navArena = mount.querySelector("#navArena");
  const navFavorites = mount.querySelector("#navFavorites");

  // tiles
  const tileBot = mount.querySelector("#tileBot");
  const tileRandomPvP = mount.querySelector("#tileRandomPvP");
  const tileHistory = mount.querySelector("#tileHistory");
  const tileLeaderboard = mount.querySelector("#tileLeaderboard");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- Navigation helpers ---
  const go = ctx?.navigateTo ?? ((u) => (window.location.href = u));

  // ---- Sidenav controls ----
  const NAV_KEY = "navOpen";
  function setNav(open) {
    if (!sidenav || !navBackdrop || !navToggle) return;
    sidenav.classList.toggle("open", !!open);
    sidenav.setAttribute("aria-hidden", open ? "false" : "true");
    navBackdrop.hidden = !open;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    sessionStorage.setItem(NAV_KEY, open ? "1" : "0");
  }
  function getNav() {
    return sessionStorage.getItem(NAV_KEY) === "1";
  }

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

  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);
  const onKeyDown = (e) => {
    if (e.key === "Escape") setNav(false);
  };

  const onNavSearch = (e) => {
    e.preventDefault();
    setNav(false);
    go("/search");
  };
  const onNavArena = (e) => {
    e.preventDefault();
    setNav(false);
    go("/arena");
  };
  const onNavFavorites = (e) => {
    e.preventDefault();
    setNav(false);
    go("/favorites");
  };

  const onTileBot = () => go("/arena/vs-bot");
  const onTileRandomPvP = () => go("/arena/random-vs-player");
  const onTileHistory = () => go("/arena/battle-history");
  const onTileLeaderboard = () => go("/arena/leaderboard");

  // bind
  logoutBtn?.addEventListener("click", onLogout);

  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);
  document.addEventListener("keydown", onKeyDown);

  navSearch?.addEventListener("click", onNavSearch);
  navArena?.addEventListener("click", onNavArena);
  navFavorites?.addEventListener("click", onNavFavorites);

  tileBot?.addEventListener("click", onTileBot);
  tileRandomPvP?.addEventListener("click", onTileRandomPvP);
  tileHistory?.addEventListener("click", onTileHistory);
  tileLeaderboard?.addEventListener("click", onTileLeaderboard);

  // restore sidenav state
  setNav(getNav());

  // cleanup
  return () => {
    logoutBtn?.removeEventListener("click", onLogout);

    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    document.removeEventListener("keydown", onKeyDown);

    navSearch?.removeEventListener("click", onNavSearch);
    navArena?.removeEventListener("click", onNavArena);
    navFavorites?.removeEventListener("click", onNavFavorites);

    tileBot?.removeEventListener("click", onTileBot);
    tileRandomPvP?.removeEventListener("click", onTileRandomPvP);
    tileHistory?.removeEventListener("click", onTileHistory);
    tileLeaderboard?.removeEventListener("click", onTileLeaderboard);
  };
}
