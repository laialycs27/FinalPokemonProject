export function setPageStylesheet(href) {
  let link = document.querySelector("link[data-page-style]");
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.setAttribute("data-page-style", "true");
    document.head.appendChild(link);
  }
  link.href = href;
}

export async function loadHTML(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.text();
}

export function setTitle(title) {
  document.title = title
    ? `${title} • Laialy Final Project`
    : "Laialy Final Project";
}

export function focusMain(mount) {
  mount?.focus?.();
}
