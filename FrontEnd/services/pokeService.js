// frontEnd/services/pokeService.js

const POKEAPI = "https://pokeapi.co/api/v2";

export const PAGE_SIZE_DEFAULT = 12;

export const pokeImgSmall = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`; // small sprite

export const idFromUrl = (url) => {
  const m = url?.match(/\/pokemon\/(\d+)\//);
  return m ? Number(m[1]) : null;
};

async function fetchJSON(url, { signal } = {}) {
  const res = await fetch(url, { signal });
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
 * List Pokémon for browsing/paging.
 * If `type` is provided: returns slice of Pokémon having that type.
 * Otherwise: returns the global list endpoint.
 */
export async function fetchList({
  offset = 0,
  type = "",
  pageSize = PAGE_SIZE_DEFAULT,
  signal,
} = {}) {
  if (type) {
    const data = await fetchJSON(
      `${POKEAPI}/type/${encodeURIComponent(type)}`,
      { signal }
    );
    const total = data.pokemon.length;
    // data.pokemon: [{ pokemon: { name, url }, slot }]
    const slice = data.pokemon.slice(offset, offset + pageSize).map((x) => {
      const { name, url } = x.pokemon;
      return { name, url, _types: [type], id: idFromUrl(url) };
    });
    return { results: slice, total };
  } else {
    const data = await fetchJSON(
      `${POKEAPI}/pokemon?limit=${pageSize}&offset=${offset}`,
      { signal }
    );
    // results: [{ name, url }]
    const results = (data.results || []).map((r) => ({
      ...r,
      id: idFromUrl(r.url),
    }));
    const total = data.count ?? 1302;
    return { results, total };
  }
}

/** Exact lookup by ID (no name lookups) */
export async function fetchById(id, { signal } = {}) {
  return fetchJSON(`${POKEAPI}/pokemon/${encodeURIComponent(String(id))}`, {
    signal,
  });
}

/**
 * Search by ability name.
 * Returns a paged list of { name, url, id } WITHOUT fetching per-Pokémon details.
 * We only fetch details when adding to favorites to keep things snappy.
 */
export async function searchByAbility(
  ability,
  { offset = 0, pageSize = PAGE_SIZE_DEFAULT, signal } = {}
) {
  const data = await fetchJSON(
    `${POKEAPI}/ability/${encodeURIComponent(ability.toLowerCase())}`,
    { signal }
  );
  const total = data.pokemon.length;
  const slice = data.pokemon.slice(offset, offset + pageSize).map((x) => {
    const { name, url } = x.pokemon;
    return { name, url, id: idFromUrl(url) };
  });
  return { results: slice, total };
}
