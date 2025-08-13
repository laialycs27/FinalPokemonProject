// frontEnd/services/favoritesService.js

const API_BASE = "http://localhost:3000"; // Express backend

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`
    );
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getFavorites(userId) {
  return fetchJSON(`${API_BASE}/users/${encodeURIComponent(userId)}/favorites`);
}

export async function addFavorite(userId, payload) {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/favorites`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function removeFavorite(userId, pokemonId) {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(
      userId
    )}/favorites/${encodeURIComponent(pokemonId)}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`
    );
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Optional helper if you add a "Download CSV" button.
 * Returns { blob, filename } so the caller can trigger a download:
 *   const { blob, filename } = await downloadFavoritesCsv(user.id);
 *   const url = URL.createObjectURL(blob);
 *   const a = document.createElement('a');
 *   a.href = url; a.download = filename || 'favorites.csv'; a.click();
 *   URL.revokeObjectURL(url);
 */
export async function downloadFavoritesCsv(userId) {
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/favorites/download`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`
    );
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  // Try to extract filename from Content-Disposition
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^"]+)"?/i);
  const filename = match ? match[1] : `favorites-${userId}.csv`;
  return { blob, filename };
}
