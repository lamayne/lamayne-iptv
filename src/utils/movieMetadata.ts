import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { XtreamCredentials } from '@/types';
import { translateNow } from '@/i18n';

export type MovieMetadata = {
  plot: string;
  duration: string;
  year: string;
  rating: string;
  cast: string[];
  directors: string[];
  genres: string[];
  extension: string;
  // Visuel large du film (get_vod_info → backdrop_path). Vide si absent.
  backdrop?: string;
  // Affiche (movie_image / cover_big), souvent plus nette que stream_icon.
  cover?: string;
};

type Entry = {
  sourceKey: string;
  movieId: string;
  fetchedAt: number;
  details: MovieMetadata;
};

type StoredCache = {
  version: number;
  entries: Entry[];
};

const STORAGE_KEY = 'msp_movie_metadata_v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_STORAGE_CHARS = 800_000;

const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<MovieMetadata>>();
const listeners = new Set<() => void>();

let loaded = false;
let revision = 0;
let activeRequests = 0;

const waiting: Array<() => void> = [];

function recordKey(sourceKey: string, movieId: string): string {
  return JSON.stringify([sourceKey, movieId]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

export function normalizeMovieText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = normalizeMovieText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function names(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value.map((item) => {
        const row = asRecord(item);
        return row ? text(row.name) : text(item);
      })
    : text(value).split(/[,;|]/);

  return uniqueNames(
    values
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 150))
  ).slice(0, 40);
}

function genres(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value.map((item) => {
        const row = asRecord(item);
        return row ? text(row.name) : text(item);
      })
    : text(value).split(/[,;|/]/);

  return uniqueNames(
    values.map((item) => item.trim()).filter(Boolean)
  ).slice(0, 20);
}

function imageUrl(value: unknown): string {
  const candidate = Array.isArray(value)
    ? value.find((item) => typeof item === 'string' && item.trim())
    : value;

  if (typeof candidate !== 'string') return '';

  const trimmed = candidate.trim();

  return /^https?:\/\//i.test(trimmed) && trimmed.length <= 600
    ? trimmed
    : '';
}

function parseDetails(raw: unknown): MovieMetadata {
  const root = asRecord(raw);
  const info = asRecord(root?.info);
  const movieData = asRecord(root?.movie_data);

  if (!info && !movieData) {
    throw new Error('Le fournisseur ne renvoie pas de fiche exploitable.');
  }

  const releaseDate =
    text(info?.releasedate) ||
    text(info?.release_date) ||
    text(info?.year) ||
    text(movieData?.year);

  const year =
    releaseDate.match(/\b(?:19|20)\d{2}\b/)?.[0] ||
    '';

  return {
    plot: (
      text(info?.plot) ||
      text(info?.description)
    ).slice(0, 6000),
    duration: text(info?.duration).slice(0, 100),
    year: year.slice(0, 30),
    rating: text(info?.rating).slice(0, 30),
    cast: names(info?.cast || info?.actors),
    directors: names(info?.director),
    genres: genres(info?.genre),
    extension: (
      text(movieData?.container_extension) ||
      text(info?.container_extension)
    )
      .replace(/^\./, '')
      .toLowerCase(),
    backdrop: imageUrl(info?.backdrop_path),
    cover: imageUrl(info?.movie_image) || imageUrl(info?.cover_big),
  };
}

function validDetails(value: unknown): value is MovieMetadata {
  const row = asRecord(value);
  if (!row) return false;

  return (
    (row.backdrop === undefined || typeof row.backdrop === 'string') &&
    (row.cover === undefined || typeof row.cover === 'string') &&
    ['plot', 'duration', 'year', 'rating', 'extension'].every(
      (key) => typeof row[key] === 'string'
    ) &&
    ['cast', 'directors', 'genres'].every(
      (key) =>
        Array.isArray(row[key]) &&
        (row[key] as unknown[]).every(
          (item) => typeof item === 'string'
        )
    )
  );
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw.length > MAX_STORAGE_CHARS) return;

    const parsed = asRecord(JSON.parse(raw));
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return;
    }

    const now = Date.now();

    for (const value of parsed.entries.slice(0, MAX_ENTRIES)) {
      const row = asRecord(value);

      if (
        !row ||
        typeof row.sourceKey !== 'string' ||
        typeof row.movieId !== 'string' ||
        typeof row.fetchedAt !== 'number' ||
        !Number.isFinite(row.fetchedAt) ||
        row.fetchedAt > now + 60_000 ||
        now - row.fetchedAt > TTL_MS ||
        !validDetails(row.details) ||
        row.details.backdrop === undefined ||
        row.details.cover === undefined
      ) {
        continue;
      }

      const entry: Entry = {
        sourceKey: row.sourceKey,
        movieId: row.movieId,
        fetchedAt: row.fetchedAt,
        details: row.details,
      };

      entries.set(
        recordKey(entry.sourceKey, entry.movieId),
        entry
      );
    }
  } catch {
    // Un cache absent ou endommagé ne bloque pas la fiche.
  }
}

function prune() {
  const now = Date.now();

  for (const [key, entry] of entries) {
    if (now - entry.fetchedAt > TTL_MS) {
      entries.delete(key);
    }
  }

  const ordered = [...entries.entries()].sort(
    ([, a], [, b]) => b.fetchedAt - a.fetchedAt
  );

  for (const [key] of ordered.slice(MAX_ENTRIES)) {
    entries.delete(key);
  }
}

function persist() {
  prune();

  const values = [...entries.values()].sort(
    (a, b) => b.fetchedAt - a.fetchedAt
  );

  let payload = JSON.stringify({
    version: 1,
    entries: values,
  } satisfies StoredCache);

  while (
    payload.length > MAX_STORAGE_CHARS &&
    values.length > 0
  ) {
    const removed = values.pop();

    if (removed) {
      entries.delete(
        recordKey(removed.sourceKey, removed.movieId)
      );
    }

    payload = JSON.stringify({
      version: 1,
      entries: values,
    } satisfies StoredCache);
  }

  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Le cache mémoire reste utilisable si le stockage est plein.
  }
}

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot() {
  ensureLoaded();
  return revision;
}

function pump() {
  while (activeRequests < 2 && waiting.length > 0) {
    waiting.shift()?.();
  }
}

function limitedRequest<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      activeRequests += 1;

      void task()
        .then(resolve, reject)
        .finally(() => {
          activeRequests -= 1;
          pump();
        });
    });

    pump();
  });
}

export function getKnownMovieMetadata(
  sourceKey: string,
  movieId: string
): MovieMetadata | null {
  ensureLoaded();

  const entry = entries.get(recordKey(sourceKey, movieId));

  if (!entry || Date.now() - entry.fetchedAt > TTL_MS) {
    return null;
  }

  return entry.details;
}

export async function loadMovieMetadata(
  sourceKey: string,
  movieId: string,
  credentials: XtreamCredentials,
  force = false
): Promise<MovieMetadata> {
  ensureLoaded();

  const key = recordKey(sourceKey, movieId);
  const existing = inflight.get(key);
  if (existing) return existing;

  const cached = getKnownMovieMetadata(sourceKey, movieId);
  if (cached && !force) return cached;

  const request = limitedRequest(async () => {
    const raw = await invoke<unknown>(
      'fetch_xtream_catalog',
      {
        serverUrl: credentials.serverUrl,
        username: credentials.username,
        password: credentials.password,
        action: 'get_vod_info',
        itemId: movieId,
      }
    );

    const details = parseDetails(raw);

    entries.set(key, {
      sourceKey,
      movieId,
      fetchedAt: Date.now(),
      details,
    });

    persist();
    notify();

    return details;
  });

  inflight.set(key, request);

  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

export function useMovieMetadataIndex(
  sourceKey: string
): Map<string, MovieMetadata> {
  const version = useSyncExternalStore(
    subscribe,
    snapshot,
    snapshot
  );

  return useMemo(() => {
    const result = new Map<string, MovieMetadata>();
    const now = Date.now();

    for (const entry of entries.values()) {
      if (
        entry.sourceKey === sourceKey &&
        now - entry.fetchedAt <= TTL_MS
      ) {
        result.set(entry.movieId, entry.details);
      }
    }

    return result;
    // `version` change à chaque mise à jour du cache : il force la relecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, version]);
}

export function useMovieMetadata(
  sourceKey: string,
  movieId: string | null,
  credentials: XtreamCredentials | null
) {
  const index = useMovieMetadataIndex(sourceKey);
  const details = movieId ? index.get(movieId) ?? null : null;

  const [status, setStatus] = useState({
    key: '',
    loading: false,
    error: '',
  });

  const requestKey = JSON.stringify([
    sourceKey,
    movieId,
    credentials?.password,
  ]);

  useEffect(() => {
    if (!movieId || !credentials || !sourceKey) return;

    let cancelled = false;

    setStatus({
      key: requestKey,
      loading: !getKnownMovieMetadata(sourceKey, movieId),
      error: '',
    });

    void loadMovieMetadata(
      sourceKey,
      movieId,
      credentials
    ).then(
      () => {
        if (!cancelled) {
          setStatus({
            key: requestKey,
            loading: false,
            error: '',
          });
        }
      },
      () => {
        if (!cancelled) {
          setStatus({
            key: requestKey,
            loading: false,
            error: translateNow('errors.movieDetailsLoad'),
          });
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [
    sourceKey,
    movieId,
    credentials,
    requestKey,
  ]);

  return {
    details,
    loading:
      !details &&
      (status.key !== requestKey || status.loading),
    error: status.key === requestKey ? status.error : '',
  };
}