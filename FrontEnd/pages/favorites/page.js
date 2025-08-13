// frontEnd/pages/favorites.page/favorites.js
import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import {
  getFavorites,
  removeFavorite,
  downloadFavoritesCsv,
} from "../../services/favoritesService.js";
import { pokeImgSmall } from "../../services/pokeService.js";
import { logout } from "../../services/authService.js";

export async function init(mount, ctx) {
  // --- Auth guard ---
  requireAuth(ctx);

  // --- DOM refs ---
  const resultsEl = mount.querySelector("#results");
  const statusEl = mount.querySelector("#status");
  const sortBy = mount.querySelector("#sortBy");
  const logoutBtn = mount.querySelector("#logout");
  const userLabel = mount.querySelector("#userLabel");
  const downloadBtn = mount.querySelector("#downloadCsv");

  // Sidenav refs
  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");
  const navFavorites = mount.querySelector("#navFavorites");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- State ---
  let items = [];
  let destroyed = false;

  const setStatus = (msg = "") => {
    if (statusEl) statusEl.textContent = msg;
  };

  // ---- Sidenav helpers ----
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

  // ---- Data ----
  async function loadFavorites() {
    if (!user?.id) return;
    try {
      const data = await getFavorites(user.id);
      items = Array.isArray(data?.favorites) ? data.favorites.slice() : [];
      if (items.length === 0) setStatus("No favorites yet.");
      else
        setStatus(
          `You have ${items.length} favorite${items.length > 1 ? "s" : ""}.`
        );
      render();
    } catch (e) {
      if (e?.status === 404) {
        items = [];
        setStatus("No favorites yet.");
        render();
      } else {
        console.error("Failed to load favorites:", e);
        setStatus("Could not load favorites.");
      }
    }
  }

  // ---- Render ----
  function chipsHTML(arr = []) {
    if (!arr || !arr.length) return "—";
    return arr.map((x) => `<span class="chip">${x}</span>`).join("");
  }

  function cardHTML(p) {
    const id = Number(p.id);
    const name = p.name ? p.name[0].toUpperCase() + p.name.slice(1) : `#${id}`;
    const types = p.types || [];
    const abilities = p.abilities || [];
    const img = p.image || pokeImgSmall(id);

    return `
      <article class="card" data-id="${id}">
        <button class="remove-btn" data-id="${id}" aria-label="Remove ${name}">✕</button>
        <img src="${img}" alt="${name}" loading="lazy" />
        <h3>#${id} ${name}</h3>
        <div class="meta">
          <div class="row">
            <span class="label">Types:</span>
            <div class="chips types">${chipsHTML(types)}</div>
          </div>
          <div class="row">
            <span class="label">Abilities:</span>
            <div class="chips abilities">${chipsHTML(abilities)}</div>
          </div>
        </div>
      </article>
    `;
  }

  function sortItems(arr, mode) {
    const a = arr.slice();
    switch (mode) {
      case "id-desc":
        a.sort((x, y) => Number(y.id) - Number(x.id));
        break;
      case "name-asc":
        a.sort((x, y) =>
          (x.name || "").localeCompare(y.name || "", undefined, {
            sensitivity: "base",
          })
        );
        break;
      case "name-desc":
        a.sort((x, y) =>
          (y.name || "").localeCompare(x.name || "", undefined, {
            sensitivity: "base",
          })
        );
        break;
      case "id-asc":
      default:
        a.sort((x, y) => Number(x.id) - Number(y.id));
        break;
    }
    return a;
  }

  function render() {
    const mode = sortBy?.value || "id-asc";
    const list = sortItems(items, mode);
    if (resultsEl) resultsEl.innerHTML = list.map(cardHTML).join("");
  }

  // ---- Events ----
  const onSortChange = () => render();

  const onResultsClick = async (e) => {
    const btn = e.target.closest(".remove-btn");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!id) return;

    try {
      btn.setAttribute("disabled", "true");
      await removeFavorite(user.id, id);
      items = items.filter((p) => Number(p.id) !== id);
      const card = resultsEl?.querySelector(`article.card[data-id="${id}"]`);
      if (card) card.remove();
      setStatus(
        items.length
          ? `You have ${items.length} favorite${items.length > 1 ? "s" : ""}.`
          : "No favorites yet."
      );
    } catch (err) {
      console.error("Remove favorite failed:", err);
      setStatus("Could not remove. Try again.");
      btn.removeAttribute("disabled");
    }
  };

  const onDownloadClick = async () => {
    if (!user?.id) {
      clearSession();
      (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
      return;
    }
    try {
      downloadBtn?.setAttribute("disabled", "true");
      setStatus("Preparing CSV...");
      const { blob, filename } = await downloadFavoritesCsv(user.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `favorites-${user.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("CSV downloaded.");
    } catch (err) {
      console.error("CSV download failed:", err);
      setStatus("Could not download CSV.");
    } finally {
      downloadBtn?.removeAttribute("disabled");
    }
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
  const onNavFavorites = (e) => {
    e.preventDefault();
    setNav(false);
  };

  sortBy?.addEventListener("change", onSortChange);
  resultsEl?.addEventListener("click", onResultsClick);
  downloadBtn?.addEventListener("click", onDownloadClick);
  logoutBtn?.addEventListener("click", onLogout);

  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);
  document.addEventListener("keydown", onKeyDown);
  navFavorites?.addEventListener("click", onNavFavorites);

  // Restore nav state (optional)
  setNav(getNav());

  // First load
  await loadFavorites();

  // Cleanup
  return () => {
    destroyed = true;

    sortBy?.removeEventListener("change", onSortChange);
    resultsEl?.removeEventListener("click", onResultsClick);
    downloadBtn?.removeEventListener("click", onDownloadClick);
    logoutBtn?.removeEventListener("click", onLogout);

    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    document.removeEventListener("keydown", onKeyDown);
    navFavorites?.removeEventListener("click", onNavFavorites);
  };
}
