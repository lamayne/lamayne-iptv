import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PlaybackProgress } from '@/utils/playbackProgress';

const STORAGE_PREFIX = 'msp_playback_progress_v1:';

type Snapshot = {
  profileId: string;
  raw: string | null;
};

function readSnapshot(profileId: string): Snapshot {
  if (!profileId) {
    return {
      profileId,
      raw: null,
    };
  }

  try {
    return {
      profileId,
      raw: localStorage.getItem(
        `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`
      ),
    };
  } catch {
    return {
      profileId,
      raw: null,
    };
  }
}

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function useMovieProgress(
  profileId: string,
  sourceKey: string
): Map<string, PlaybackProgress> {
  const [snapshot, setSnapshot] =
    useState<Snapshot>(() =>
      readSnapshot(profileId)
    );

  useEffect(() => {
    function update() {
      const next = readSnapshot(profileId);

      setSnapshot((previous) =>
        previous.profileId === next.profileId &&
        previous.raw === next.raw
          ? previous
          : next
      );
    }

    function onProgressChanged(event: Event) {
      const detail = (
        event as CustomEvent<{
          profileId?: string;
        }>
      ).detail;

      if (
        detail?.profileId &&
        detail.profileId !== profileId
      ) {
        return;
      }

      update();
    }

    function onStorage(event: StorageEvent) {
      const key =
        `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`;

      if (event.key === null || event.key === key) {
        update();
      }
    }

    update();

    window.addEventListener(
      'msp-playback-progress-changed',
      onProgressChanged
    );
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', update);

    return () => {
      window.removeEventListener(
        'msp-playback-progress-changed',
        onProgressChanged
      );
      window.removeEventListener(
        'storage',
        onStorage
      );
      window.removeEventListener('focus', update);
    };
  }, [profileId]);

  return useMemo(() => {
    const result =
      new Map<string, PlaybackProgress>();

    if (
      !profileId ||
      !sourceKey ||
      snapshot.profileId !== profileId ||
      !snapshot.raw
    ) {
      return result;
    }

    try {
      const store = asRecord(
        JSON.parse(snapshot.raw)
      );

      if (!store) return result;

      for (const [key, value] of Object.entries(store)) {
        const row = asRecord(value);

        if (
          !row ||
          row.profileId !== profileId ||
          row.sourceKey !== sourceKey ||
          row.kind !== 'movie' ||
          typeof row.itemId !== 'string' ||
          !row.itemId ||
          typeof row.title !== 'string' ||
          typeof row.position !== 'number' ||
          !Number.isFinite(row.position) ||
          row.position < 0 ||
          typeof row.duration !== 'number' ||
          !Number.isFinite(row.duration) ||
          row.duration < 0 ||
          typeof row.completed !== 'boolean' ||
          typeof row.updatedAt !== 'number' ||
          !Number.isFinite(row.updatedAt)
        ) {
          continue;
        }

        const expectedKey = JSON.stringify([
          sourceKey,
          'movie',
          row.itemId,
        ]);

        if (key !== expectedKey) continue;

        result.set(row.itemId, {
          profileId,
          sourceKey,
          kind: 'movie',
          itemId: row.itemId,
          title: row.title,
          position: row.position,
          duration: row.duration,
          completed: row.completed,
          updatedAt: row.updatedAt,
        });
      }
    } catch {
      // Une sauvegarde illisible ne bloque pas le catalogue.
    }

    return result;
  }, [
    profileId,
    sourceKey,
    snapshot,
  ]);
}