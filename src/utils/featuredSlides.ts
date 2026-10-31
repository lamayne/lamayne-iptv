import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { XtreamCredentials } from '@/types';
import {
  useMovieCatalog,
  useSeriesCatalog,
  type CatalogMovie,
  type CatalogSeries,
} from '@/utils/xtreamCatalogCache';
import { loadMovieMetadata, type MovieMetadata } from '@/utils/movieMetadata';
import { probeImage } from '@/utils/imageLoad';
import { sharpenImage } from '@/utils/imageUrl';

// Films et séries « du moment » : 2 films + 2 séries par semaine, choisis
// parmi les mieux notés. Un titre n'est retenu que si son image se charge
// réellement (on n'affiche jamais une vedette sans visuel). Le résultat est
// enregistré : le catalogue n'est téléchargé qu'une fois par semaine.

export type FeaturedSlide = {
  kind: 'movie' | 'series';
  id: string;
  name: string;
  // Image affichée : un visuel large si disponible, sinon l'affiche.
  image: string;
  imageKind: 'backdrop' | 'poster';
  // Affiche verticale, conservée pour la progression de lecture.
  poster: string;
  categoryId: string;
  extension: string;
  plot: string;
  genres: string[];
  year: string;
  duration: string;
};

export type SeriesInfo = {
  cover: string;
  backdrop: string;
  plot: string;
  genre: string;
  year: string;
};

export type SelectionDeps = {
  probe: (url: string) => Promise<boolean>;
  movieDetails: (id: string) => Promise<MovieMetadata | null>;
  seriesInfo: (id: string) => Promise<SeriesInfo | null>;
  // Adresse de lecture d'un film, et test « le lien répond-il vraiment ? ».
  streamUrl: (id: string, extension: string) => string;
  playable: (url: string) => Promise<boolean>;
};

// v4 : nouvelle règle de choix (nouveautés, synopsis obligatoire, lien vérifié) ;
// la sélection enregistrée avec l'ancienne règle est donc refaite.
const STORAGE_PREFIX = 'msp_featured_v6:';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// L'époque Unix démarre un jeudi : on décale de 4 jours pour que la semaine
// change le lundi à 00:00 UTC.
const MONDAY_OFFSET_MS = 4 * 24 * 60 * 60 * 1000;

export function currentWeekIndex(now = Date.now()): number {
  return Math.floor((now - MONDAY_OFFSET_MS) / WEEK_MS);
}
const HIDDEN_PREFIX = 'msp_featured_hidden_v1:';
// Une sélection incomplète (par exemple sans film) est retentée au bout de ce délai.
const RETRY_AFTER_MS = 6 * 60 * 60 * 1000;
// Recommandations affichées en rotation.
export const TARGET_SLIDES = 5;
// Titres validés par type (films, séries) : les affichés, plus de quoi
// remplacer tout de suite ceux que l'utilisateur masque.
const POOL_PER_KIND = 5;
// Sous ce nombre de titres disponibles, la réserve est complétée.
export const REFILL_BELOW = 6;
// Une fois les 5 titres trouvés, la recherche de réserve s'arrête après ce délai.
const RESERVE_BUDGET_MS = 30_000;
const POOL_SIZE = 60;
// Nombre maximal de titres testés par catégorie : borne le temps et les requêtes.
const MAX_CHECKS = 36;
// Un titre sans vrai synopsis n'est jamais mis en avant.
const MIN_PLOT_LENGTH = 60;

const DAY_SECONDS = 86_400;
// Catégories qui regroupent les nouveautés chez la plupart des fournisseurs.
const FRESH_CATEGORY = /nouveaut|r[ée]cent|ajout|\bnew\b|derni|sortie|cin[ée]ma|202[4-9]/i;

/* ------------------------------------------------------------------ */
/* Fonctions pures (testables)                                         */
/* ------------------------------------------------------------------ */

export function validYear(value: string | undefined): string {
  return value?.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '';
}

// Commence à une position différente chaque semaine, puis fait le tour.
export function rotateFrom<T>(items: T[], week: number, perWeek: number): T[] {
  const pool = items.slice(0, POOL_SIZE);

  if (pool.length === 0) return [];

  const start = (((week * perWeek) % pool.length) + pool.length) % pool.length;

  return [...pool.slice(start), ...pool.slice(0, start)];
}

export function interleave<T>(first: T[], second: T[]): T[] {
  const result: T[] = [];
  const length = Math.max(first.length, second.length);

  for (let i = 0; i < length; i += 1) {
    if (i < first.length) result.push(first[i]);
    if (i < second.length) result.push(second[i]);
  }

  return result;
}

function imageCandidates(
  url: string | undefined,
  size: 'w500' | 'w1280'
): string[] {
  const clean = (url ?? '').trim();

  if (!/^https?:\/\//i.test(clean)) return [];

  const sharp = sharpenImage(clean, size);

  return sharp === clean ? [clean] : [sharp, clean];
}

async function firstWorking(
  urls: string[],
  probe: (url: string) => Promise<boolean>
): Promise<string> {
  for (const url of urls) {
    if (await probe(url)) return url;
  }

  return '';
}

function ratingOf(value: string): number {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOf(value: string): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

// « Du moment » = récent, bien noté, rangé dans une catégorie de nouveautés.
export function trendScore(args: {
  rating: string;
  addedSeconds: number;
  categoryName: string;
  nowSeconds: number;
}): number {
  const rating = Math.max(0, Math.min(10, ratingOf(args.rating)));
  const ageDays =
    args.addedSeconds > 0
      ? (args.nowSeconds - args.addedSeconds) / DAY_SECONDS
      : Number.POSITIVE_INFINITY;

  const recency =
    ageDays <= 30 ? 8 : ageDays <= 90 ? 6 : ageDays <= 180 ? 4 : ageDays <= 365 ? 2 : 0;

  const category = FRESH_CATEGORY.test(args.categoryName) ? 2 : 0;
  const unrated = rating === 0 ? -3 : 0;

  return rating + recency + category + unrated;
}

export function hasSynopsis(plot: string | undefined): boolean {
  return (plot ?? '').trim().length >= MIN_PLOT_LENGTH;
}

/* ------------------------------------------------------------------ */
/* Sélection                                                           */
/* ------------------------------------------------------------------ */

export type PickStats = Record<string, number>;

// Titres encore proposables (non masqués), dans l'ordre de la réserve.
export function availableSlides(
  pool: readonly FeaturedSlide[],
  hidden: ReadonlySet<string>
): FeaturedSlide[] {
  return pool.filter((slide) => !hidden.has(slideKey(slide)));
}

// Les premiers sont affichés ; les suivants prennent la place d'un titre masqué.
export function displaySlides(
  pool: readonly FeaturedSlide[],
  hidden: ReadonlySet<string>,
  target = TARGET_SLIDES
): FeaturedSlide[] {
  return availableSlides(pool, hidden).slice(0, target);
}

export function poolIsComplete(available: number): boolean {
  return available >= REFILL_BELOW;
}

export function slideKey(slide: { kind: 'movie' | 'series'; id: string }): string {
  return `${slide.kind}:${slide.id}`;
}

function bump(stats: PickStats | undefined, name: string) {
  if (stats) stats[name] = (stats[name] ?? 0) + 1;
}

type PickArgs = {
  isHidden: (categoryId: string) => boolean;
  categoryName: (categoryId: string) => string;
  nowSeconds: number;
  week: number;
  // Nombre de titres à trouver, et titres à ne pas reproposer (déjà affichés
  // ou masqués par l'utilisateur avec « Ne plus recommander »).
  limit: number;
  exclude: Set<string>;
  deps: SelectionDeps;
  onFound: (slide: FeaturedSlide) => void;
  isCancelled: () => boolean;
  stats?: PickStats;
};

export async function pickMovieSlides(
  args: PickArgs & { movies: CatalogMovie[] }
): Promise<FeaturedSlide[]> {
  const {
    movies,
    isHidden,
    categoryName,
    nowSeconds,
    week,
    limit,
    exclude,
    deps,
    onFound,
    isCancelled,
    stats,
  } = args;

  const scored = movies
    .filter((movie) => movie.name && !isHidden(movie.categoryId))
    .map((movie) => ({
      movie,
      score: trendScore({
        rating: movie.rating,
        addedSeconds: numberOf(movie.added),
        categoryName: categoryName(movie.categoryId),
        nowSeconds,
      }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || numberOf(b.movie.id) - numberOf(a.movie.id)
    );

  const pool = scored.map((entry) => entry.movie);

  // Les visuels larges passent en premier ; les titres qui n'ont qu'une
  // affiche verticale ne servent que de réserve si le compte n'y est pas.
  const found: FeaturedSlide[] = [];
  const reserve: FeaturedSlide[] = [];
  let checks = 0;

  if (limit <= 0) return found;

  for (const movie of rotateFrom(pool, week, POOL_PER_KIND)) {
    if (exclude.has(`movie:${movie.id}`)) continue;

    if (found.length >= limit || checks >= MAX_CHECKS || isCancelled()) {
      break;
    }

    checks += 1;
    bump(stats, 'checked');

    let details: MovieMetadata | null = null;

    try {
      details = await deps.movieDetails(movie.id);
    } catch {
      details = null;
    }

    // Pas de synopsis : on passe au suivant.
    if (!hasSynopsis(details?.plot)) {
      bump(stats, 'noSynopsis');
      continue;
    }

    // Lien mort : on passe au suivant (le film ne se lancerait pas).
    const extension = details?.extension || movie.extension || 'mp4';

    if (!(await deps.playable(deps.streamUrl(movie.id, extension)))) {
      bump(stats, 'deadLink');
      continue;
    }

    let image = await firstWorking(
      imageCandidates(details?.backdrop, 'w1280'),
      deps.probe
    );
    let imageKind: FeaturedSlide['imageKind'] = 'backdrop';

    if (!image) {
      image = await firstWorking(
        [
          ...imageCandidates(details?.cover, 'w500'),
          ...imageCandidates(movie.poster, 'w500'),
        ],
        deps.probe
      );
      imageKind = 'poster';
    }

    if (!image) {
      bump(stats, 'noImage');
      continue;
    }

    const slide: FeaturedSlide = {
      kind: 'movie',
      id: movie.id,
      name: movie.name,
      image,
      imageKind,
      poster: movie.poster,
      categoryId: movie.categoryId,
      extension,
      plot: details?.plot ?? '',
      genres: details?.genres ?? [],
      year: validYear(details?.year),
      duration: details?.duration ?? '',
    };

    if (imageKind === 'backdrop') {
      found.push(slide);
      onFound(slide);
    } else {
      reserve.push(slide);
    }
  }

  for (const slide of reserve) {
    if (found.length >= limit || isCancelled()) break;

    found.push(slide);
    onFound(slide);
  }

  return found;
}

export async function pickSeriesSlides(
  args: PickArgs & { series: CatalogSeries[] }
): Promise<FeaturedSlide[]> {
  const {
    series,
    isHidden,
    categoryName,
    nowSeconds,
    week,
    limit,
    exclude,
    deps,
    onFound,
    isCancelled,
    stats,
  } = args;

  const scored = series
    .filter((item) => item.name && !isHidden(item.categoryId))
    .map((item) => ({
      item,
      score: trendScore({
        rating: item.rating,
        addedSeconds: numberOf(item.lastModified),
        categoryName: categoryName(item.categoryId),
        nowSeconds,
      }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        numberOf(b.item.lastModified) - numberOf(a.item.lastModified)
    );

  const pool = scored.map((entry) => entry.item);

  const found: FeaturedSlide[] = [];
  const reserve: FeaturedSlide[] = [];
  let checks = 0;

  if (limit <= 0) return found;

  for (const item of rotateFrom(pool, week, POOL_PER_KIND)) {
    if (exclude.has(`series:${item.id}`)) continue;

    if (found.length >= limit || checks >= MAX_CHECKS || isCancelled()) {
      break;
    }

    checks += 1;
    bump(stats, 'checked');

    let info: SeriesInfo | null = null;

    try {
      info = await deps.seriesInfo(item.id);
    } catch {
      info = null;
    }

    // Pas de synopsis : on passe à la suivante.
    if (!hasSynopsis(info?.plot || item.plot)) {
      bump(stats, 'noSynopsis');
      continue;
    }

    let image = await firstWorking(
      imageCandidates(info?.backdrop, 'w1280'),
      deps.probe
    );
    let imageKind: FeaturedSlide['imageKind'] = 'backdrop';

    if (!image) {
      image = await firstWorking(
        [
          ...imageCandidates(info?.cover, 'w500'),
          ...imageCandidates(item.cover, 'w500'),
        ],
        deps.probe
      );
      imageKind = 'poster';
    }

    if (!image) {
      bump(stats, 'noImage');
      continue;
    }

    const genre = info?.genre || item.genre;

    const slide: FeaturedSlide = {
      kind: 'series',
      id: item.id,
      name: item.name,
      image,
      imageKind,
      poster: info?.cover || item.cover,
      categoryId: item.categoryId,
      extension: '',
      plot: info?.plot || item.plot,
      genres: genre
        ? genre
            .split(/[,/|]/)
            .map((part) => part.trim())
            .filter(Boolean)
        : [],
      year: validYear(info?.year || item.year),
      duration: '',
    };

    if (imageKind === 'backdrop') {
      found.push(slide);
      onFound(slide);
    } else {
      reserve.push(slide);
    }
  }

  for (const slide of reserve) {
    if (found.length >= limit || isCancelled()) break;

    found.push(slide);
    onFound(slide);
  }

  return found;
}

/* ------------------------------------------------------------------ */
/* Stockage                                                            */
/* ------------------------------------------------------------------ */

type StoredSelection = {
  slides: FeaturedSlide[];
  attemptedAt: number;
};

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}

function hiddenStorageKey(scope: string): string {
  return `${HIDDEN_PREFIX}${encodeURIComponent(scope)}`;
}

function isSlide(value: unknown): value is FeaturedSlide {
  if (typeof value !== 'object' || value === null) return false;

  const row = value as Record<string, unknown>;

  return (
    (row.kind === 'movie' || row.kind === 'series') &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.name === 'string' &&
    typeof row.image === 'string' &&
    row.image.length > 0 &&
    (row.imageKind === 'backdrop' || row.imageKind === 'poster') &&
    typeof row.poster === 'string' &&
    typeof row.categoryId === 'string' &&
    typeof row.extension === 'string' &&
    typeof row.plot === 'string' &&
    Array.isArray(row.genres) &&
    row.genres.every((genre) => typeof genre === 'string') &&
    typeof row.year === 'string' &&
    typeof row.duration === 'string'
  );
}

let oldSelectionsCleaned = false;

// Les sélections des versions précédentes ne servent plus : on les retire une fois.
export function cleanOldSelections() {
  if (oldSelectionsCleaned) return;
  oldSelectionsCleaned = true;

  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);

      if (key && /^msp_(featured_v[1-5]|weekly_film_v1):/.test(key)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Sans importance : ces clés sont minuscules.
  }
}

function readStored(scope: string, week: number): StoredSelection | null {
  if (!scope) return null;

  cleanOldSelections();

  try {
    const raw = localStorage.getItem(storageKey(scope));

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) return null;

    const row = parsed as Record<string, unknown>;

    if (row.week !== week || !Array.isArray(row.slides)) return null;

    return {
      slides: row.slides.filter(isSlide),
      attemptedAt: typeof row.attemptedAt === 'number' ? row.attemptedAt : 0,
    };
  } catch {
    return null;
  }
}

function writeStored(scope: string, week: number, selection: StoredSelection) {
  if (!scope) return;

  try {
    localStorage.setItem(
      storageKey(scope),
      JSON.stringify({ week, ...selection })
    );
  } catch {
    // Sans stockage, la sélection est simplement refaite à la prochaine ouverture.
  }
}

function readHidden(scope: string): string[] {
  if (!scope) return [];

  try {
    const raw = localStorage.getItem(hiddenStorageKey(scope));
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeHidden(scope: string, keys: string[]) {
  if (!scope) return;

  try {
    localStorage.setItem(hiddenStorageKey(scope), JSON.stringify(keys.slice(-500)));
  } catch {
    // Le masquage reste actif jusqu'à la fermeture de l'application.
  }
}

/* ------------------------------------------------------------------ */
/* Accès réseau                                                        */
/* ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value.trim()
    : typeof value === 'number'
    ? String(value)
    : '';
}

function firstString(value: unknown): string {
  const candidate = Array.isArray(value)
    ? value.find((item) => typeof item === 'string' && item.trim())
    : value;

  return typeof candidate === 'string' ? candidate.trim() : '';
}

async function fetchSeriesInfo(
  credentials: XtreamCredentials,
  seriesId: string
): Promise<SeriesInfo | null> {
  const raw = await invoke<unknown>('fetch_xtream_catalog', {
    serverUrl: credentials.serverUrl,
    username: credentials.username,
    password: credentials.password,
    action: 'get_series_info',
    itemId: seriesId,
  });

  const info = asRecord(asRecord(raw)?.info);

  if (!info) return null;

  return {
    cover: firstString(info.cover),
    backdrop: firstString(info.backdrop_path),
    plot: text(info.plot),
    genre: text(info.genre),
    year: text(info.releaseDate) || text(info.release_date) || text(info.year),
  };
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export function useFeaturedSlides(
  scope: string,
  sourceKey: string,
  credentials: XtreamCredentials | null,
  isCategoryHidden: (kind: 'movies' | 'series', categoryId: string) => boolean
) {
  const [week] = useState(() => currentWeekIndex());
  const [version, setVersion] = useState(0);
  const [ranFor, setRanFor] = useState('');
  const [refill, setRefill] = useState(false);
  const [live, setLive] = useState<{ key: string; slides: FeaturedSlide[] }>({
    key: '',
    slides: [],
  });

  const key = `${scope}:${week}`;

  const stored = useMemo(
    () => readStored(scope, week),
    // `version` force la relecture après chaque écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, week, version]
  );

  const hiddenKeys = useMemo(
    () => new Set(readHidden(scope)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, version]
  );

  // Titres encore proposables : les 5 premiers sont affichés, les suivants
  // sont la réserve qui remplace aussitôt un titre masqué.
  const available = useMemo(
    () => availableSlides(stored?.slides ?? [], hiddenKeys),
    [stored, hiddenKeys]
  );

  const visible = useMemo(
    () => available.slice(0, TARGET_SLIDES),
    [available]
  );

  const movieCount = available.filter((slide) => slide.kind === 'movie').length;
  const seriesCount = available.length - movieCount;
  const complete = poolIsComplete(available.length);

  // Une sélection incomplète n'est pas figée pour la semaine : elle est
  // retentée au bout de quelques heures, ou tout de suite si l'utilisateur
  // vient de retirer un titre.
  const stale = !stored || Date.now() - stored.attemptedAt > RETRY_AFTER_MS;
  const runKey = `${key}:${hiddenKeys.size}`;

  const needs =
    Boolean(scope && sourceKey && credentials) &&
    !complete &&
    ranFor !== runKey &&
    (stale || refill);

  // Les catalogues complets ne sont chargés que si une sélection est à faire.
  const movieCatalog = useMovieCatalog(needs ? credentials : null);
  const seriesCatalog = useSeriesCatalog(needs ? credentials : null);

  const moviesReady =
    Boolean(movieCatalog.data) || movieCatalog.status === 'error';
  const seriesReady =
    Boolean(seriesCatalog.data) || seriesCatalog.status === 'error';

  useEffect(() => {
    if (!needs || !moviesReady || !seriesReady || !credentials) return;

    let cancelled = false;

    const base = credentials.serverUrl.trim().replace(/\/+$/, '');

    const deps: SelectionDeps = {
      probe: probeImage,
      movieDetails: (id) => loadMovieMetadata(sourceKey, id, credentials),
      seriesInfo: (id) => fetchSeriesInfo(credentials, id),
      streamUrl: (id, extension) =>
        `${base}/movie/${encodeURIComponent(credentials.username)}/` +
        `${encodeURIComponent(credentials.password)}/` +
        `${encodeURIComponent(id)}.${extension}`,
      // Seul un lien franchement mort (404, page web à la place du film)
      // écarte un film : en cas de doute (limite de connexions, erreur
      // réseau), on le garde plutôt que de n'afficher aucun film.
      playable: (url) =>
        invoke<boolean>('probe_stream', { url }).catch(() => true),
    };

    const movieCategories = new Map(
      (movieCatalog.data?.categories ?? []).map((category) => [
        category.id,
        category.name,
      ])
    );
    const seriesCategories = new Map(
      (seriesCatalog.data?.categories ?? []).map((category) => [
        category.id,
        category.name,
      ])
    );

    const nowSeconds = Math.floor(Date.now() / 1000);

    const movies = available.filter((slide) => slide.kind === 'movie');
    const series = available.filter((slide) => slide.kind === 'series');

    // Les titres masqués restent dans la réserve (ils reviennent si on les
    // autorise de nouveau) mais ne sont jamais reproposés.
    const hiddenSlides = (stored?.slides ?? []).filter((slide) =>
      hiddenKeys.has(slideKey(slide))
    );

    const exclude = new Set<string>([
      ...hiddenKeys,
      ...(stored?.slides ?? []).map((slide) => slideKey(slide)),
    ]);

    const stats: PickStats = {};

    // Les titres affichés sont prioritaires : la réserve ne doit pas allonger
    // indéfiniment la recherche (et les requêtes vers le fournisseur).
    const startedAt = Date.now();
    const enough = () =>
      movies.length + series.length >= TARGET_SLIDES &&
      Date.now() - startedAt > RESERVE_BUDGET_MS;

    const publish = () => {
      if (!cancelled) {
        setLive({ key: runKey, slides: interleave(movies, series) });
      }
    };

    void (async () => {
      await Promise.all([
        pickMovieSlides({
          movies: movieCatalog.data?.movies ?? [],
          isHidden: (categoryId) => isCategoryHidden('movies', categoryId),
          categoryName: (categoryId) => movieCategories.get(categoryId) ?? '',
          nowSeconds,
          week,
          limit: POOL_PER_KIND - movieCount,
          exclude,
          deps,
          stats,
          onFound: (slide) => {
            movies.push(slide);
            publish();
          },
          isCancelled: () => cancelled || enough(),
        }),
        pickSeriesSlides({
          series: seriesCatalog.data?.series ?? [],
          isHidden: (categoryId) => isCategoryHidden('series', categoryId),
          categoryName: (categoryId) => seriesCategories.get(categoryId) ?? '',
          nowSeconds,
          week,
          limit: POOL_PER_KIND - seriesCount,
          exclude,
          deps,
          stats,
          onFound: (slide) => {
            series.push(slide);
            publish();
          },
          isCancelled: () => cancelled || enough(),
        }),
      ]);

      if (cancelled) return;

      if (import.meta.env.DEV) {
        console.info(
          `[Du moment] ${stats.checked ?? 0} titre(s) testé(s) · ` +
            `${stats.noSynopsis ?? 0} sans synopsis · ` +
            `${stats.deadLink ?? 0} lien mort · ` +
            `${stats.noImage ?? 0} sans image · ` +
            `retenus : ${movies.length} film(s), ${series.length} série(s)`
        );
      }

      // On enregistre aussi un résultat incomplet, avec l'heure de l'essai :
      // il sera retenté plus tard au lieu de bloquer toute la semaine.
      writeStored(scope, week, {
        slides: [...interleave(movies, series), ...hiddenSlides],
        attemptedAt: Date.now(),
      });

      setRanFor(runKey);
      setRefill(false);
      setVersion((value) => value + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    needs,
    moviesReady,
    seriesReady,
    credentials,
    sourceKey,
    scope,
    week,
    runKey,
    movieCatalog.data,
    seriesCatalog.data,
    isCategoryHidden,
    available,
    stored,
    hiddenKeys,
    movieCount,
    seriesCount,
  ]);

  const slides =
    needs && live.key === runKey && live.slides.length > 0
      ? live.slides.slice(0, TARGET_SLIDES)
      : visible;

  // « Ne plus recommander » : le titre disparaît tout de suite, ne revient
  // plus, et un remplaçant est cherché.
  const dismiss = useCallback(
    (slide: FeaturedSlide) => {
      writeHidden(scope, [...readHidden(scope), slideKey(slide)]);
      setRefill(true);
      setVersion((value) => value + 1);
    },
    [scope]
  );

  const restoreHidden = useCallback(() => {
    writeHidden(scope, []);
    setVersion((value) => value + 1);
  }, [scope]);

  return {
    slides,
    loading: needs && slides.length === 0,
    dismiss,
    hiddenCount: hiddenKeys.size,
    restoreHidden,
  };
}
