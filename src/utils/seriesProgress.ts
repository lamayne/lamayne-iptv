import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { XtreamCredentials } from '@/types';

// Les épisodes regardés sont enregistrés par le lecteur dans
// `msp_episode_progress_v3` (clé : [source, série, épisode]). Ce fichier les
// relit pour l'accueil, et retrouve le nom et l'affiche de chaque série avec
// une seule requête légère par série, ensuite gardée en mémoire locale.

const EPISODE_PROGRESS_KEY = 'msp_episode_progress_v3';
const BASICS_KEY = 'msp_series_basics_v1';
const BASICS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BASICS_MAX = 80;
const FETCH_LIMIT = 12;
// Une série sans affiche est redemandée plus souvent que les autres.
const EMPTY_COVER_RETRY_MS = 6 * 60 * 60 * 1000;

export type SeriesProgress = {
  seriesId: string;
  season: number;
  episode: number;
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
};

export type SeriesBasics = {
  name: string;
  cover: string;
};

type BasicsEntry = SeriesBasics & { fetchedAt: number };
type BasicsStore = Record<string, BasicsEntry>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;

  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

// Dernier épisode regardé de chaque série, la plus récente en premier.
export function readSeriesProgress(sourceKey: string): SeriesProgress[] {
  if (!sourceKey) return [];

  try {
    const raw = localStorage.getItem(EPISODE_PROGRESS_KEY);

    if (!raw) return [];

    const store = asRecord(JSON.parse(raw));

    if (!store) return [];

    const latest = new Map<string, SeriesProgress>();

    for (const [key, value] of Object.entries(store)) {
      let ids: unknown;

      try {
        ids = JSON.parse(key);
      } catch {
        continue;
      }

      if (
        !Array.isArray(ids) ||
        ids[0] !== sourceKey ||
        typeof ids[1] !== 'string' ||
        !ids[1]
      ) {
        continue;
      }

      const row = asRecord(value);

      if (!row) continue;

      const season = finiteNumber(row.season);
      const episode = finiteNumber(row.episode);
      const position = finiteNumber(row.positionSeconds);
      const duration = finiteNumber(row.durationSeconds);
      const updatedAt = finiteNumber(row.updatedAt);

      if (
        season === null ||
        episode === null ||
        position === null ||
        duration === null ||
        updatedAt === null ||
        typeof row.completed !== 'boolean'
      ) {
        continue;
      }

      const seriesId = ids[1];
      const previous = latest.get(seriesId);

      if (!previous || previous.updatedAt < updatedAt) {
        latest.set(seriesId, {
          seriesId,
          season,
          episode,
          position: Math.max(0, position),
          duration: Math.max(0, duration),
          completed: row.completed,
          updatedAt,
        });
      }
    }

    return [...latest.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function firstImage(...values: unknown[]): string {
  for (const value of values) {
    const candidate = Array.isArray(value)
      ? value.find((item) => typeof item === 'string' && item.trim())
      : value;

    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) {
      return candidate.trim();
    }
  }

  return '';
}

function basicsKey(sourceKey: string, seriesId: string): string {
  return JSON.stringify([sourceKey, seriesId]);
}

function readBasics(): BasicsStore {
  try {
    const raw = localStorage.getItem(BASICS_KEY);

    if (!raw) return {};

    const parsed = asRecord(JSON.parse(raw));

    if (!parsed) return {};

    const result: BasicsStore = {};

    for (const [key, value] of Object.entries(parsed)) {
      const row = asRecord(value);

      if (
        row &&
        typeof row.name === 'string' &&
        typeof row.cover === 'string' &&
        typeof row.fetchedAt === 'number'
      ) {
        result[key] = {
          name: row.name,
          cover: row.cover,
          fetchedAt: row.fetchedAt,
        };
      }
    }

    return result;
  } catch {
    return {};
  }
}

function writeBasics(store: BasicsStore) {
  const kept = Object.entries(store)
    .sort(([, a], [, b]) => b.fetchedAt - a.fetchedAt)
    .slice(0, BASICS_MAX);

  try {
    localStorage.setItem(BASICS_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Les noms seront simplement redemandés.
  }
}

const inflight = new Set<string>();

export function useSeriesBasics(
  sourceKey: string,
  seriesIds: string[],
  credentials: XtreamCredentials | null
): Map<string, SeriesBasics> {
  const [store, setStore] = useState<BasicsStore>(() => readBasics());
  const storeRef = useRef(store);

  const idsKey = seriesIds.join(',');

  useEffect(() => {
    if (!credentials || !sourceKey) return;

    const now = Date.now();

    const missing = seriesIds
      .filter((id) => {
        const entry = storeRef.current[basicsKey(sourceKey, id)];

        return (
          !entry ||
          now - entry.fetchedAt > BASICS_TTL_MS ||
          (!entry.cover && now - entry.fetchedAt > EMPTY_COVER_RETRY_MS)
        );
      })
      .slice(0, FETCH_LIMIT);

    if (missing.length === 0) return;

    let cancelled = false;

    void (async () => {
      for (const id of missing) {
        if (cancelled) return;

        const key = basicsKey(sourceKey, id);

        if (inflight.has(key)) continue;

        inflight.add(key);

        try {
          const raw = await invoke<unknown>('fetch_xtream_catalog', {
            serverUrl: credentials.serverUrl,
            username: credentials.username,
            password: credentials.password,
            action: 'get_series_info',
            itemId: id,
          });

          const info = asRecord(asRecord(raw)?.info);
          const name = typeof info?.name === 'string' ? info.name.trim() : '';
          // Affiche de la série, sinon son visuel large.
          const cover = firstImage(info?.cover, info?.backdrop_path);

          if (name) {
            const next: BasicsStore = {
              ...storeRef.current,
              [key]: { name, cover, fetchedAt: Date.now() },
            };

            storeRef.current = next;
            writeBasics(next);
            setStore(next);
          }
        } catch {
          // Série injoignable : elle n'apparaît simplement pas pour l'instant.
        } finally {
          inflight.delete(key);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // `seriesIds` est représenté par `idsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, idsKey, credentials]);

  return useMemo(() => {
    const result = new Map<string, SeriesBasics>();

    for (const id of seriesIds) {
      const entry = store[basicsKey(sourceKey, id)];

      if (entry) result.set(id, { name: entry.name, cover: entry.cover });
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, sourceKey, idsKey]);
}
