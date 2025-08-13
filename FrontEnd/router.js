import { setPageStylesheet, loadHTML, setTitle, focusMain } from "./utils.js";

const routes = [
  {
    path: "/",
    title: "Home",
    html: "/pages/home/view.html",
    css: "/pages/home/styles.css",
    js: "/pages/home/page.js",
  },
  {
    path: "/login",
    title: "Login",
    html: "/pages/login/view.html",
    css: "/pages/login/styles.css",
    js: "/pages/login/page.js",
  },
  {
    path: "/register",
    title: "Register",
    html: "/pages/register/view.html",
    css: "/pages/register/styles.css",
    js: "/pages/register/page.js",
  },
  {
    path: "/search",
    title: "Search",
    html: "/pages/search/view.html",
    css: "/pages/search/styles.css",
    js: "/pages/search/page.js",
  },
  {
    path: "/favorites",
    title: "Favorites",
    html: "/pages/favorites/view.html",
    css: "/pages/favorites/styles.css",
    js: "/pages/favorites/page.js",
  },
  {
    path: "/arena",
    title: "Arena",
    html: "/pages/arena/view.html",
    css: "/pages/arena/styles.css",
    js: "/pages/arena/page.js",
  },
  {
    path: "/arena/vs-bot",
    title: "Battle Vs Bot",
    html: "/pages/battleVsBot/view.html",
    css: "/pages/battleVsBot/styles.css",
    js: "/pages/battleVsBot/page.js",
  },
  {
    path: "/arena/random-vs-player",
    title: "Battle Vs Player",
    html: "/pages/battleVsPlayer/view.html",
    css: "/pages/battleVsPlayer/styles.css",
    js: "/pages/battleVsPlayer/page.js",
  },
  {
    path: "/arena/battle-history",
    title: "Battle History",
    html: "/pages/battleHistory/view.html",
    css: "/pages/battleHistory/styles.css",
    js: "/pages/battleHistory/page.js",
  },
  {
    path: "/arena/leaderboard",
    title: "LeaderBoard",
    html: "/pages/leaderboard/view.html",
    css: "/pages/leaderboard/styles.css",
    js: "/pages/leaderboard/page.js",
  },
  // catch-all 404 (will be used if no exact match)
  {
    path: "*",
    title: "Not Found",
    html: "/pages/not-found/view.html",
    css: "/pages/not-found/styles.css",
    js: "/pages/not-found/page.js",
  },
];

let active = { destroy: null, route: null };

function matchRoute(pathname) {
  return (
    routes.find((r) => r.path === pathname) ||
    routes.find((r) => r.path === "*")
  );
}

function isInternalLink(a) {
  return (
    a &&
    a.tagName === "A" &&
    a.origin === location.origin &&
    !a.target &&
    !a.download
  );
}

export async function navigateTo(url, replace = false) {
  if (replace) history.replaceState(null, "", url);
  else if (location.pathname !== url) history.pushState(null, "", url);
  await render();
}

export async function render() {
  const mount = document.getElementById("app");
  const route = matchRoute(location.pathname);
  const ctx = { navigateTo, store: window.__APP_STORE__ };

  // route guard (optional)
  if (route.guard) {
    const next = await route.guard(ctx);
    if (next && next !== location.pathname) {
      return navigateTo(next, true);
    }
  }

  // cleanup previous page
  if (active.destroy) {
    try {
      active.destroy();
    } catch {}
    active.destroy = null;
  }

  // swap CSS
  setPageStylesheet(route.css);

  // inject HTML
  const html = await loadHTML(route.html);
  mount.innerHTML = html;

  // load and init page script (can return a destroy fn)
  let destroy = null;
  if (route.js) {
    const mod = await import(route.js);
    if (typeof mod.init === "function") {
      const maybeDestroy = await mod.init(mount, ctx);
      if (typeof maybeDestroy === "function") destroy = maybeDestroy;
    }
  }

  active = { destroy, route };

  // title, focus, scroll
  setTitle(route.title);
  focusMain(mount);
  window.scrollTo(0, 0);
}

export function initRouter() {
  // intercept internal links
  document.addEventListener("click", (e) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const a = e.target.closest("a");
    if (!isInternalLink(a)) return;
    const to = a.getAttribute("href");
    if (!to) return;
    e.preventDefault();
    navigateTo(to);
  });

  window.addEventListener("popstate", render);
  render();
}
