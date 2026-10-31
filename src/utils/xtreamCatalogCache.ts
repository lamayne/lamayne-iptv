import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { XtreamCredentials } from '@/types';
import { errorText } from '@/i18n/backendErrors';
import { translateNow } from '@/i18n';

export type CatalogCategory = {
  id: string;
  name: string;
};

export type CatalogMovie = {
  id: string;
  name: string;
  categoryId: string;
  poster: string;
  extension: string;
  rating: string;
  // Date d'ajout chez le fournisseur (secondes Unix, en texte).
  added: string;
};

export type CatalogSeries = {
  id: string;
  name: string;
  categoryId: string;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  year: string;
  rating: string;
  lastModified: string;
};

export type MovieCatalogData = {
  categories: CatalogCategory[];
  movies: CatalogMovie[];
};

export type SeriesCatalogData = {
  categories: CatalogCategory[];
  series: CatalogSeries[];
};

export type CatalogStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error';

type CatalogState<T> = {
  data: T | null;
  status: CatalogStatus;
  error: string;
};

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

type CacheListeners<T> = Set<
  (state: CatalogState<T>) => void
>;

type CatalogCache<T> = {
  states: Map<string, CatalogState<T>>;
  cache: Map<string, CacheEntry<T>>;
  inflight: Map<string, Promise<T>>;
  listeners: Map<string, CacheListeners<T>>;
  failedAt: Map<string, number>;
};

const CATALOG_TTL_MS = 10 * 60 * 1000;

// Après un échec, pas de nouvelle tentative automatique pendant ce délai.
const RETRY_AFTER_ERROR_MS = 60 * 1000;

const movieCache: CatalogCache<MovieCatalogData> = {
  states: new Map(),
  cache: new Map(),
  inflight: new Map(),
  listeners: new Map(),
  failedAt: new Map(),
};

const seriesCache: CatalogCache<SeriesCatalogData> = {
  states: new Map(),
  cache: new Map(),
  inflight: new Map(),
  listeners: new Map(),
  failedAt: new Map(),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
    ? String(value)
    : '';
}

function categoryKey(value: unknown): string {
  return text(value) || '0';
}

function errorMessage(value: unknown, fallback: string): string {
  return errorText(value, fallback);
}

function sourceKeyOf(credentials: XtreamCredentials | null): string {
  if (!credentials) return '';

  return JSON.stringify([
    credentials.serverUrl.trim().replace(/\/+$/, ''),
    credentials.username,
  ]);
}

function getState<T>(
  cache: CatalogCache<T>,
  key: string
): CatalogState<T> {
  return (
    cache.states.get(key) ?? {
      data: null,
      status: 'idle',
      error: '',
    }
  );
}

function setState<T>(
  cache: CatalogCache<T>,
  key: string,
  next: CatalogState<T>
) {
  cache.states.set(key, next);

  const listeners = cache.listeners.get(key);

  if (listeners) {
    for (const listener of listeners) {
      listener(next);
    }
  }
}

function subscribe<T>(
  cache: CatalogCache<T>,
  key: string,
  listener: (state: CatalogState<T>) => void
): () => void {
  let listeners = cache.listeners.get(key);

  if (!listeners) {
    listeners = new Set();
    cache.listeners.set(key, listeners);
  }

  listeners.add(listener);

  return () => {
    const current = cache.listeners.get(key);
    current?.delete(listener);

    if (current && current.size === 0) {
      cache.listeners.delete(key);
    }
  };
}

async function requestCatalog<T>(
  cache: CatalogCache<T>,
  key: string,
  credentials: XtreamCredentials,
  load: (credentials: XtreamCredentials) => Promise<T>
): Promise<T> {
  const existing = cache.inflight.get(key);

  if (existing) return existing;

  setState(cache, key, {
    data: getState(cache, key).data,
    status: 'loading',
    error: '',
  });

  const promise = (async () => {
    try {
      const data = await load(credentials);

      cache.failedAt.delete(key);

      cache.cache.set(key, {
        data,
        fetchedAt: Date.now(),
      });

      setState(cache, key, {
        data,
        status: 'success',
        error: '',
      });

      return data;
    } catch (caught) {
      cache.failedAt.set(key, Date.now());

      const previous = getState(cache, key);

      setState(cache, key, {
        data: previous.data,
        status: 'error',
        error: errorMessage(
          caught,
          translateNow('errors.catalogLoad')
        ),
      });

      throw caught;
    } finally {
      cache.inflight.delete(key);
    }
  })();

  cache.inflight.set(key, promise);
  return promise;
}

function parseCategories(value: unknown): CatalogCategory[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item);

    if (!row) return [];

    const id = categoryKey(row.category_id);
    const name = text(row.category_name);

    if (!id || !name) return [];

    return [{ id, name }];
  });
}

function parseMovieCatalog(raw: unknown): MovieCatalogData {
  const root = asRecord(raw);

  const categories = parseCategories(root?.categories);

  const movies = asArray(root?.movies).flatMap((item) => {
    const row = asRecord(item);

    if (!row) return [];

    const id = text(row.stream_id);
    const name = text(row.name);

    if (!id || !name) return [];

    return [
      {
        id,
        name,
        categoryId: categoryKey(row.category_id),
        poster: text(row.stream_icon),
        extension: text(row.container_extension),
        rating: text(row.rating),
        added: text(row.added),
      },
    ];
  });

  if (!movies.length) {
    throw new Error(translateNow('errors.noUsableMovies'));
  }

  return { categories, movies };
}

function parseSeriesCatalog(raw: unknown): SeriesCatalogData {
  const root = asRecord(raw);

  const categories = parseCategories(root?.categories);

  const series = asArray(root?.series).flatMap((item) => {
    const row = asRecord(item);

    if (!row) return [];

    const id = text(row.series_id);
    const name = text(row.name);

    if (!id || !name) return [];

    return [
      {
        id,
        name,
        categoryId: categoryKey(row.category_id),
        cover: text(row.cover),
        plot: text(row.plot),
        cast: text(row.cast),
        director: text(row.director),
        genre: text(row.genre),
        year: text(row.year),
        rating: text(row.rating),
        lastModified: text(row.last_modified),
      },
    ];
  });

  if (!series.length) {
    throw new Error(translateNow('errors.noUsableSeries'));
  }

  return { categories, series };
}

async function loadMovieCatalog(
  credentials: XtreamCredentials
): Promise<MovieCatalogData> {
  const [categories, movies] = await Promise.all([
    invoke<unknown>('fetch_xtream_catalog', {
      ...credentials,
      action: 'get_vod_categories',
    }),
    invoke<unknown>('fetch_xtream_catalog', {
      ...credentials,
      action: 'get_vod_streams',
    }),
  ]);

  return parseMovieCatalog({ categories, movies });
}

async function loadSeriesCatalog(
  credentials: XtreamCredentials
): Promise<SeriesCatalogData> {
  const [categories, series] = await Promise.all([
    invoke<unknown>('fetch_xtream_catalog', {
      ...credentials,
      action: 'get_series_categories',
    }),
    invoke<unknown>('fetch_xtream_catalog', {
      ...credentials,
      action: 'get_series',
    }),
  ]);

  return parseSeriesCatalog({ categories, series });
}

function useSharedCatalog<T>(
  cache: CatalogCache<T>,
  credentials: XtreamCredentials | null,
  loader: (credentials: XtreamCredentials) => Promise<T>
) {
  const key = sourceKeyOf(credentials);

  const [state, setStateLocal] = useState<CatalogState<T>>(() =>
    getState(cache, key)
  );

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  // Les identifiants passent par une ref : l'effet ne dépend que de la clé de
  // source. Un simple changement d'identité de l'objet ne relance donc plus
  // de requête (et ne boucle plus après une erreur).
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  const secret = credentials?.password ?? '';
  const lastSecretRef = useRef(secret);

  useEffect(() => {
    const current = credentialsRef.current;

    if (!key || !current) {
      setStateLocal({
        data: null,
        status: 'idle',
        error: '',
      });

      return;
    }

    const unsubscribe = subscribe(cache, key, setStateLocal);

    setStateLocal(getState(cache, key));

    const secretChanged = lastSecretRef.current !== secret;
    lastSecretRef.current = secret;

    const entry = cache.cache.get(key);
    const fresh =
      entry && Date.now() - entry.fetchedAt < CATALOG_TTL_MS;

    const failedAt = cache.failedAt.get(key);
    const recentlyFailed =
      !secretChanged &&
      failedAt !== undefined &&
      Date.now() - failedAt < RETRY_AFTER_ERROR_MS;

    if (!fresh && !recentlyFailed) {
      void requestCatalog(cache, key, current, loaderRef.current).catch(
        () => {
          // L'erreur est déjà exposée dans l'état partagé.
        }
      );
    }

    return unsubscribe;
  }, [cache, key, secret]);

  const refresh = useCallback(async () => {
    const current = credentialsRef.current;

    if (!current) {
      throw new Error(translateNow('errors.noXtreamSource'));
    }

    return requestCatalog(
      cache,
      sourceKeyOf(current),
      current,
      loaderRef.current
    );
  }, [cache]);

  return {
    data: state.data,
    status: state.status,
    error: state.error,
    refresh,
  };
}

export function useMovieCatalog(
  credentials: XtreamCredentials | null
) {
  return useSharedCatalog(movieCache, credentials, loadMovieCatalog);
}

export function useSeriesCatalog(
  credentials: XtreamCredentials | null
) {
  return useSharedCatalog(seriesCache, credentials, loadSeriesCatalog);
}

export function clearCatalogCaches() {
  movieCache.cache.clear();
  movieCache.inflight.clear();
  movieCache.states.clear();
  movieCache.failedAt.clear();

  seriesCache.cache.clear();
  seriesCache.inflight.clear();
  seriesCache.states.clear();
  seriesCache.failedAt.clear();
}