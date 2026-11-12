import { invoke, isTauri } from '@tauri-apps/api/core';
import { normalizeSearch } from '@/utils/searchText';
import { cleanMovieTitle } from '@/utils/titleClean';
import type { CatalogMovie } from '@/utils/xtreamCatalogCache';

// Filmographie d'un acteur (Wikidata, via la partie Rust) rapprochée du
// catalogue du fournisseur : « tous les films avec Brad Pitt », pas seulement
// ceux dont on a déjà ouvert la fiche.

export type FilmographyEntry = {
  titles: string[];
  year: number | null;
};

const CACHE_KEY = 'msp_filmography_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Un acteur inconnu est réessayé plus tôt : Wikidata se complète.
const EMPTY_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ACTORS = 80;

type CacheStore = Record<string, { at: number; entries: FilmographyEntry[] }>;

function readStore(): CacheStore {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as CacheStore)
      : {};
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(store));
  } catch {
    // Stockage plein ou indisponible : on refera la demande la prochaine fois.
  }
}

const cacheKey = (name: string) => normalizeSearch(name);

export function readCachedFilmography(name: string): FilmographyEntry[] | null {
  const item = readStore()[cacheKey(name)];

  if (!item || !Array.isArray(item.entries)) return null;

  const ttl = item.entries.length ? CACHE_TTL_MS : EMPTY_TTL_MS;

  return Date.now() - item.at < ttl ? item.entries : null;
}

export function cacheFilmography(name: string, entries: FilmographyEntry[]) {
  const store = readStore();

  store[cacheKey(name)] = { at: Date.now(), entries };

  const keys = Object.keys(store);

  if (keys.length > CACHE_MAX_ACTORS) {
    keys
      .sort((a, b) => store[b].at - store[a].at)
      .slice(CACHE_MAX_ACTORS)
      .forEach((old) => delete store[old]);
  }

  writeStore(store);
}

export async function loadFilmography(name: string): Promise<FilmographyEntry[]> {
  const cached = readCachedFilmography(name);

  if (cached) return cached;
  if (!isTauri()) return [];

  const entries = await invoke<FilmographyEntry[]>('fetch_filmography', { name });

  cacheFilmography(name, entries);

  return entries;
}

// ---------------------------------------------------------------- rapprochement

// Mentions de qualité ajoutées par les fournisseurs, qui ne font pas partie du titre.
const QUALITY = new Set([
  '4k', 'uhd', 'fhd', 'hd', 'sd', 'hdr', 'multi', 'vostfr', 'vf', 'vo', 'remux',
]);

// Clé de comparaison d'un titre : sans étiquette du fournisseur, sans année
// entre parenthèses, sans accents ni ponctuation, sans mention de qualité.
export function titleKey(value: string): { key: string; year: number | null } {
  let text = cleanMovieTitle(value);
  let year: number | null = null;
  const match = text.match(/[([]\s*((?:19|20)\d{2})\s*[)\]]\s*$/);

  if (match && match.index !== undefined) {
    year = Number(match[1]);
    text = text.slice(0, match.index).trim();
  }

  const words = normalizeSearch(text).split(' ').filter(Boolean);

  while (words.length > 1 && QUALITY.has(words[0])) words.shift();
  while (words.length > 1 && QUALITY.has(words[words.length - 1])) words.pop();

  return { key: words.join(' '), year };
}

export type TitleIndex = Map<string, Array<{ movie: CatalogMovie; year: number | null }>>;

export function buildTitleIndex(movies: readonly CatalogMovie[]): TitleIndex {
  const index: TitleIndex = new Map();

  for (const movie of movies) {
    const { key, year } = titleKey(movie.name);

    if (!key) continue;

    const list = index.get(key);

    if (list) list.push({ movie, year });
    else index.set(key, [{ movie, year }]);
  }

  return index;
}

// Les films du catalogue qui correspondent à la filmographie. Titre identique
// (français, anglais ou original) ; si les deux années sont connues, elles ne
// doivent pas différer de plus d'un an (évite « Fury » 1999 et « Fury » 2014).
export function matchFilmography(
  entries: readonly FilmographyEntry[],
  index: TitleIndex
): CatalogMovie[] {
  const found = new Map<string, CatalogMovie>();

  for (const entry of entries) {
    for (const title of entry.titles) {
      const { key } = titleKey(title);

      // Titres d'un ou deux caractères (« It », « Up ») : trop ambigus.
      if (key.length < 3) continue;

      for (const candidate of index.get(key) ?? []) {
        if (
          entry.year !== null &&
          candidate.year !== null &&
          Math.abs(entry.year - candidate.year) > 1
        ) {
          continue;
        }

        found.set(candidate.movie.id, candidate.movie);
      }
    }
  }

  return [...found.values()];
}
