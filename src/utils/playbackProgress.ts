export type PlaybackKind = 'movie' | 'episode';

export type PlaybackIdentity = {
  profileId: string;
  sourceKey: string;
  kind: PlaybackKind;
  itemId: string;
  title: string;
  seriesId?: string;
  seriesName?: string;
  season?: string;
  episodeNumber?: number;
  poster?: string;
};

export type PlaybackProgress = PlaybackIdentity & {
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
};

type ProgressStore = Record<string, PlaybackProgress>;

const STORAGE_PREFIX = 'msp_playback_progress_v1:';
const MAX_RECORDS_PER_PROFILE = 500;

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`;
}

function recordKey(
  identity: Pick<PlaybackIdentity, 'sourceKey' | 'kind' | 'itemId'>
): string {
  return JSON.stringify([
    identity.sourceKey,
    identity.kind,
    identity.itemId,
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validIdentity(identity: PlaybackIdentity): boolean {
  return (
    typeof identity.profileId === 'string' &&
    identity.profileId.length > 0 &&
    typeof identity.sourceKey === 'string' &&
    identity.sourceKey.length > 0 &&
    typeof identity.itemId === 'string' &&
    identity.itemId.length > 0 &&
    (identity.kind === 'movie' || identity.kind === 'episode')
  );
}

// Évite de re-parser et re-valider tout le magasin quand rien n'a changé
// (la sauvegarde de progression est appelée très souvent pendant la lecture).
let parsedCache: {
  profileId: string;
  raw: string;
  store: ProgressStore;
} | null = null;

function readStore(profileId: string): ProgressStore {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return {};

    if (
      parsedCache &&
      parsedCache.profileId === profileId &&
      parsedCache.raw === raw
    ) {
      return { ...parsedCache.store };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    const store: ProgressStore = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (!isRecord(value)) continue;

      if (
        value.profileId !== profileId ||
        typeof value.sourceKey !== 'string' ||
        typeof value.itemId !== 'string' ||
        typeof value.title !== 'string' ||
        (value.kind !== 'movie' && value.kind !== 'episode') ||
        typeof value.position !== 'number' ||
        !Number.isFinite(value.position) ||
        value.position < 0 ||
        typeof value.duration !== 'number' ||
        !Number.isFinite(value.duration) ||
        value.duration < 0 ||
        typeof value.completed !== 'boolean' ||
        typeof value.updatedAt !== 'number' ||
        !Number.isFinite(value.updatedAt)
      ) {
        continue;
      }

      const progress: PlaybackProgress = {
        profileId,
        sourceKey: value.sourceKey,
        kind: value.kind,
        itemId: value.itemId,
        title: value.title,
        position: value.position,
        duration: value.duration,
        completed: value.completed,
        updatedAt: value.updatedAt,
      };

      if (typeof value.seriesId === 'string') {
        progress.seriesId = value.seriesId;
      }

      if (typeof value.seriesName === 'string') {
        progress.seriesName = value.seriesName;
      }

      if (typeof value.season === 'string') {
        progress.season = value.season;
      }

      if (
        typeof value.episodeNumber === 'number' &&
        Number.isFinite(value.episodeNumber)
      ) {
        progress.episodeNumber = value.episodeNumber;
      }

      if (typeof value.poster === 'string' && value.poster) {
        progress.poster = value.poster.slice(0, 600);
      }

      if (key === recordKey(progress)) {
        store[key] = progress;
      }
    }

    parsedCache = { profileId, raw, store: { ...store } };

    return store;
  } catch {
    return {};
  }
}

function writeStore(
  profileId: string,
  store: ProgressStore
): boolean {
  try {
    const recentEntries = Object.entries(store)
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECORDS_PER_PROFILE);

    localStorage.setItem(
      storageKey(profileId),
      JSON.stringify(Object.fromEntries(recentEntries))
    );

    window.dispatchEvent(
      new CustomEvent('msp-playback-progress-changed', {
        detail: { profileId },
      })
    );

    return true;
  } catch {
    return false;
  }
}

export function getPlaybackProgress(
  identity: PlaybackIdentity
): PlaybackProgress | null {
  if (!validIdentity(identity)) return null;

  return readStore(identity.profileId)[recordKey(identity)] ?? null;
}

export function savePlaybackProgress(
  identity: PlaybackIdentity,
  position: number,
  duration: number,
  completed = false
): boolean {
  if (
    !validIdentity(identity) ||
    !Number.isFinite(position) ||
    !Number.isFinite(duration) ||
    position < 0 ||
    duration < 0
  ) {
    return false;
  }

  const store = readStore(identity.profileId);

  const progress: PlaybackProgress = {
    profileId: identity.profileId,
    sourceKey: identity.sourceKey,
    kind: identity.kind,
    itemId: identity.itemId,
    title: identity.title,
    position: duration > 0
      ? Math.min(position, duration)
      : position,
    duration,
    completed,
    updatedAt: Date.now(),
  };

  if (identity.seriesId !== undefined) {
    progress.seriesId = identity.seriesId;
  }

  if (identity.seriesName !== undefined) {
    progress.seriesName = identity.seriesName;
  }

  if (identity.season !== undefined) {
    progress.season = identity.season;
  }

  if (
    identity.episodeNumber !== undefined &&
    Number.isFinite(identity.episodeNumber)
  ) {
    progress.episodeNumber = identity.episodeNumber;
  }

  const poster =
    identity.poster || store[recordKey(identity)]?.poster;

  if (poster) {
    progress.poster = poster.slice(0, 600);
  }

  store[recordKey(identity)] = progress;

  return writeStore(identity.profileId, store);
}

export function clearPlaybackProgress(
  identity: PlaybackIdentity
): boolean {
  if (!validIdentity(identity)) return false;

  const store = readStore(identity.profileId);
  delete store[recordKey(identity)];

  return writeStore(identity.profileId, store);
}

export function canResumePlayback(
  progress: PlaybackProgress | null
): progress is PlaybackProgress {
  if (!progress || progress.completed || progress.position < 10) {
    return false;
  }

  // Évite de proposer une reprise sur les toutes dernières secondes.
  return (
    progress.duration <= 0 ||
    progress.position < progress.duration - 3
  );
}

export function getLastSeriesProgress(
  profileId: string,
  sourceKey: string,
  seriesId: string
): PlaybackProgress | null {
  const records = Object.values(readStore(profileId))
    .filter(
      (item) =>
        item.kind === 'episode' &&
        item.sourceKey === sourceKey &&
        item.seriesId === seriesId
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return records[0] ?? null;
}

export function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds
    ).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}
export function continueWatchingKey(item: PlaybackProgress): string {
  return item.kind === 'episode' && item.seriesId
    ? `series:${item.seriesId}`
    : `${item.kind}:${item.itemId}`;
}

// Le lecteur enregistre les épisodes comme des « films » dont le titre est de
// la forme « Série — S1E2 » : on les reconnaît pour ne pas les mélanger aux
// films (la série a déjà sa propre carte).
const EPISODE_TITLE = /\s[—–-]\s*S\d{1,3}\s?E\d{1,4}\s*$/i;

export function isEpisodeRecordedAsMovie(item: PlaybackProgress): boolean {
  return item.kind === 'movie' && EPISODE_TITLE.test(item.title.trim());
}

export function listContinueWatching(
  profileId: string,
  sourceKey: string,
  limit = 24
): PlaybackProgress[] {
  if (!profileId || !sourceKey) return [];

  const records = Object.values(readStore(profileId))
    .filter(
      (item) =>
        item.sourceKey === sourceKey && !isEpisodeRecordedAsMovie(item)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const seen = new Set<string>();
  const result: PlaybackProgress[] = [];

  for (const item of records) {
    const key = continueWatchingKey(item);

    if (seen.has(key)) continue;
    seen.add(key);

    if (!canResumePlayback(item)) continue;

    if (item.duration > 0 && item.position / item.duration >= 0.95) {
      continue;
    }

    result.push(item);

    if (result.length >= limit) break;
  }

  return result;
}