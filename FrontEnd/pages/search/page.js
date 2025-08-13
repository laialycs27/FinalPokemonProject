import {
  requireAuth,
  getSessionUser,
  clearSession,
} from "../../services/session.js";
import {
  PAGE_SIZE_DEFAULT,
  pokeImgSmall,
  idFromUrl,
  fetchList,
  fetchById,
  searchByAbility,
} from "../../services/pokeService.js";
import { getFavorites, addFavorite } from "../../services/favoritesService.js";
import { logout } from "../../services/authService.js";

export async function init(mount, ctx) {
  // --- Auth guard ---
  requireAuth(ctx);

  // --- DOM refs ---
  const q = mount.querySelector("#q");
  const typeFilter = mount.querySelector("#typeFilter");
  const resultsEl = mount.querySelector("#results");
  const statusEl = mount.querySelector("#status");
  const prevBtn = mount.querySelector("#prevPage");
  const nextBtn = mount.querySelector("#nextPage");
  const pageInfo = mount.querySelector("#pageInfo");
  const logoutBtn = mount.querySelector("#logout");
  const userLabel = mount.querySelector("#userLabel");

  // Sidenav refs
  const sidenav = mount.querySelector("#sidenav");
  const navBackdrop = mount.querySelector("#navBackdrop");
  const navToggle = mount.querySelector("#navToggle");
  const navClose = mount.querySelector("#navClose");

  // NEW: nav links
  const navSearch = mount.querySelector("#navSearch");
  const navArena = mount.querySelector("#navArena");
  const navVsBot = mount.querySelector("#navVsBot");
  const navRandom = mount.querySelector("#navRandom");
  const navHistory = mount.querySelector("#navHistory");
  const navFavorites = mount.querySelector("#navFavorites");

  // --- User label ---
  const user = getSessionUser();
  if (userLabel) {
    const name = user?.username || user?.email || "User";
    userLabel.textContent = `Hi, ${name}`;
  }

  // --- State ---
  let page = 1;
  const PAGE_SIZE = PAGE_SIZE_DEFAULT; // 12
  let destroyed = false;
  let currentController = null;
  let favIds = new Set(); // keep favorites ids to render hearts as "added"

  // --- Utils ---
  const debounce = (fn, delay = 700) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), delay);
    };
  };

  const setStatus = (msg = "") => {
    if (statusEl) statusEl.textContent = msg;
  };

  const setPaging = (canPrev, canNext) => {
    if (prevBtn) prevBtn.disabled = !canPrev;
    if (nextBtn) nextBtn.disabled = !canNext;
    if (pageInfo) pageInfo.textContent = `Page ${page}`;
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

  // ---- Favorites bootstrap ----
  async function loadFavorites() {
    if (!user?.id) return;
    try {
      const data = await getFavorites(user.id);
      favIds = new Set((data?.favorites || []).map((p) => Number(p.id)));
    } catch (e) {
      if (e?.status === 404) favIds = new Set(); // no favorites yet
      else console.warn("Failed to load favorites:", e);
    }
  }

  // ---- Cards ----
  function chipsHTML(items = [], cls = "chip") {
    if (!items || !items.length) return "—";
    return items.map((x) => `<span class="${cls}">${x}</span>`).join("");
  }

  const cardHTML = (p) => {
    const id = p.id ?? idFromUrl(p.url);
    const nameRaw = p.name ?? "";
    const name = nameRaw
      ? nameRaw[0].toUpperCase() + nameRaw.slice(1)
      : `#${id}`;

    const types =
      p.types?.map((t) => t.type.name) ??
      p._types /* from type-filter list */ ??
      null;
    const abilities = p.abilities?.map((a) => a.ability.name) ?? null;

    const isFav = favIds.has(Number(id));
    const favClass = isFav ? "fav-btn added" : "fav-btn";
    const favPressed = isFav ? "true" : "false";

    return `
      <article class="card" data-id="${id}" data-name="${nameRaw}">
        <button class="${favClass}" data-id="${id}" aria-pressed="${favPressed}" aria-label="Add ${name} to favorites">❤</button>
        <img src="${pokeImgSmall(id)}" alt="${name}" loading="lazy" />
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
  };

  const renderList = (list) => {
    if (resultsEl) resultsEl.innerHTML = list.map(cardHTML).join("");
  };

  // Hydrate types+abilities lazily with small concurrency
  async function hydrateDetails(list, signal) {
    const CONCURRENCY = 4;
    const ids = list.map((p) => p.id ?? idFromUrl(p.url)).filter(Boolean);

    let index = 0;
    async function worker() {
      while (index < ids.length && !destroyed) {
        const i = index++;
        const id = ids[i];
        try {
          const details = await fetchById(id, { signal });
          const types = (details.types || []).map((t) => t.type.name);
          const abilities = (details.abilities || []).map(
            (a) => a.ability.name
          );

          const card = resultsEl?.querySelector(
            `article.card[data-id="${id}"]`
          );
          if (!card) continue;

          const typesEl = card.querySelector(".chips.types");
          const abilitiesEl = card.querySelector(".chips.abilities");
          if (typesEl) typesEl.innerHTML = chipsHTML(types);
          if (abilitiesEl) abilitiesEl.innerHTML = chipsHTML(abilities);
        } catch (err) {
          if (err?.name === "AbortError") return;
          console.warn("Hydrate failed for id", id, err);
        }
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
  }

  // ---- Search runner ----
  async function runSearch() {
    if (currentController) currentController.abort();
    const controller = new AbortController();
    currentController = controller;

    try {
      setStatus("Loading...");
      const term = (q?.value || "").trim();
      const type = (typeFilter?.value || "").trim();

      if (term) {
        const isNumeric = /^\d+$/.test(term);

        if (isNumeric) {
          // ID lookup
          try {
            const p = await fetchById(term, { signal: controller.signal });
            if (destroyed) return;
            renderList([p]);
            setPaging(false, false);
            setStatus(`Found Pokémon #${p.id}.`);
            return;
          } catch (err) {
            if (err?.status === 404) {
              if (resultsEl) resultsEl.innerHTML = "";
              setStatus(`No Pokémon with ID “${term}”.`);
              setPaging(false, false);
              return;
            }
            throw err;
          }
        } else {
          // Ability lookup → render quickly, then hydrate
          try {
            const offset = (page - 1) * PAGE_SIZE;
            const { results, total } = await searchByAbility(term, {
              offset,
              pageSize: PAGE_SIZE,
              signal: controller.signal,
            });
            if (destroyed) return;

            renderList(results);
            const canPrev = page > 1;
            const canNext = offset + PAGE_SIZE < total;
            setPaging(canPrev, canNext);
            setStatus(
              `Showing ${results.length} Pokémon with ability “${term}”.`
            );

            await hydrateDetails(results, controller.signal);
            return;
          } catch (err) {
            if (err?.status === 404) {
              if (resultsEl) resultsEl.innerHTML = "";
              setStatus(`No ability found named “${term}”.`);
              setPaging(false, false);
              return;
            }
            throw err;
          }
        }
      }

      // No term → browsing list (optionally filtered by type)
      const offset = (page - 1) * PAGE_SIZE;
      const { results, total } = await fetchList({
        offset,
        type,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      });
      if (destroyed) return;

      renderList(results);
      const canPrev = page > 1;
      const canNext = offset + PAGE_SIZE < total;
      setPaging(canPrev, canNext);

      const tMsg = type ? ` in type “${type}”` : "";
      setStatus(`Showing ${results.length} Pokémon${tMsg}.`);

      await hydrateDetails(results, controller.signal);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.error(e);
      if (resultsEl) resultsEl.innerHTML = "";
      setStatus("Oops, something went wrong. Try again.");
      setPaging(false, false);
    }
  }

  const debounced = debounce(() => {
    page = 1;
    runSearch();
  }, 700);

  const onQInput = () => debounced();
  const onTypeChange = () => {
    page = 1;
    runSearch();
  };
  const onPrev = () => {
    if (page > 1) {
      page--;
      runSearch();
    }
  };
  const onNext = () => {
    page++;
    runSearch();
  };

  // ---- Favorites ----
  async function addToFavoritesHandler(pokeId, buttonEl) {
    if (!user?.id) {
      alert("Please log in again.");
      clearSession();
      (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
      return;
    }

    if (favIds.has(Number(pokeId))) {
      buttonEl?.classList.add("added");
      buttonEl?.setAttribute("aria-pressed", "true");
      setStatus("Already in favorites.");
      return;
    }

    try {
      buttonEl?.setAttribute("disabled", "true");

      const details = await fetchById(pokeId);
      const payload = {
        id: details.id,
        name: details.name,
        image:
          details.sprites?.other?.["official-artwork"]?.front_default ||
          pokeImgSmall(details.id),
        types: (details.types || []).map((t) => t.type.name),
        abilities: (details.abilities || []).map((a) => a.ability.name),
      };

      await addFavorite(user.id, payload);

      favIds.add(Number(pokeId));
      buttonEl?.classList.add("added");
      buttonEl?.setAttribute("aria-pressed", "true");
      setStatus(`Added ${payload.name} to favorites.`);
    } catch (err) {
      if (err?.status === 409) {
        favIds.add(Number(pokeId));
        buttonEl?.classList.add("added");
        buttonEl?.setAttribute("aria-pressed", "true");
        setStatus("Already in favorites.");
        return;
      }
      console.error("Add favorite failed:", err);
      setStatus("Could not add to favorites. Try again.");
    } finally {
      buttonEl?.removeAttribute("disabled");
    }
  }

  // --- Events ---
  const onResultsClick = (e) => {
    const btn = e.target.closest(".fav-btn");
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (!id) return;
    addToFavoritesHandler(id, btn);
  };

  const onLogout = async () => {
    try {
      const u = getSessionUser();
      if (u?.id) {
        await logout(u.id); // best-effort: remove from onlineUsers
      }
    } catch {}
    clearSession();
    (ctx?.navigateTo ?? ((u) => (window.location.href = u)))("/login");
  };

  // Sidenav interactions
  const onNavToggle = () => setNav(!sidenav.classList.contains("open"));
  const onNavClose = () => setNav(false);
  const onNavBackdrop = () => setNav(false);
  const onKeyDown = (e) => {
    if (e.key === "Escape") setNav(false);
  };

  // NEW: nav link handlers (no leaderboard)
  const go = ctx?.navigateTo ?? ((u) => (window.location.href = u));
  const onNav = (path) => (e) => {
    e.preventDefault();
    setNav(false);
    go(path);
  };

  navSearch?.addEventListener("click", onNav("/search"));
  navArena?.addEventListener("click", onNav("/arena"));
  navVsBot?.addEventListener("click", onNav("/arena/vs-bot"));
  navRandom?.addEventListener("click", onNav("/arena/random-vs-player"));
  navHistory?.addEventListener("click", onNav("/arena/battle-history"));
  navFavorites?.addEventListener("click", onNav("/favorites"));

  q?.addEventListener("input", onQInput);
  typeFilter?.addEventListener("change", onTypeChange);
  prevBtn?.addEventListener("click", onPrev);
  nextBtn?.addEventListener("click", onNext);
  resultsEl?.addEventListener("click", onResultsClick);
  logoutBtn?.addEventListener("click", onLogout);

  navToggle?.addEventListener("click", onNavToggle);
  navClose?.addEventListener("click", onNavClose);
  navBackdrop?.addEventListener("click", onNavBackdrop);
  document.addEventListener("keydown", onKeyDown);

  // Restore nav state
  setNav(getNav());

  // Initial load: favorites first so hearts render as "added"
  await loadFavorites();
  runSearch();

  // Cleanup
  return () => {
    destroyed = true;
    if (currentController) currentController.abort();

    navSearch?.removeEventListener("click", onNav("/search"));
    navArena?.removeEventListener("click", onNav("/arena"));
    navVsBot?.removeEventListener("click", onNav("/arena/vs-bot"));
    navRandom?.removeEventListener("click", onNav("/arena/random-vs-player"));
    navHistory?.removeEventListener("click", onNav("/arena/battle-history"));
    navFavorites?.removeEventListener("click", onNav("/favorites"));

    q?.removeEventListener("input", onQInput);
    typeFilter?.removeEventListener("change", onTypeChange);
    prevBtn?.removeEventListener("click", onPrev);
    nextBtn?.removeEventListener("click", onNext);
    resultsEl?.removeEventListener("click", onResultsClick);
    logoutBtn?.removeEventListener("click", onLogout);

    navToggle?.removeEventListener("click", onNavToggle);
    navClose?.removeEventListener("click", onNavClose);
    navBackdrop?.removeEventListener("click", onNavBackdrop);
    document.removeEventListener("keydown", onKeyDown);
  };
}
