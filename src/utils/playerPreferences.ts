export type TrackPreference = {
  language: string;
  title: string;
};

export type PlayerPreferences = {
  audio: TrackPreference | null;
  subtitlesMode: 'off' | 'auto' | 'preferred';
  subtitles: TrackPreference | null;
};

const STORAGE_PREFIX = 'msp_player_preferences_v1:';

function defaultPreferences(): PlayerPreferences {
  return {
    audio: null,
    subtitlesMode: 'off',
    subtitles: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readTrackPreference(value: unknown): TrackPreference | null {
  if (!isRecord(value)) return null;

  const language =
    typeof value.language === 'string'
      ? value.language.trim().toLowerCase().slice(0, 64)
      : '';

  const title =
    typeof value.title === 'string'
      ? value.title.trim().slice(0, 250)
      : '';

  if (!language && !title) return null;

  return { language, title };
}

export function getPlayerPreferences(
  profileId: string
): PlayerPreferences {
  if (!profileId) return defaultPreferences();

  try {
    const raw = localStorage.getItem(
      `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`
    );

    if (!raw) return defaultPreferences();

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return defaultPreferences();

    const audio = readTrackPreference(parsed.audio);
    const subtitles = readTrackPreference(parsed.subtitles);

    const subtitlesMode =
      parsed.subtitlesMode === 'auto'
        ? 'auto'
        : parsed.subtitlesMode === 'preferred' && subtitles
        ? 'preferred'
        : 'off';

    return {
      audio,
      subtitlesMode,
      subtitles,
    };
  } catch {
    return defaultPreferences();
  }
}

export function savePlayerPreferences(
  profileId: string,
  preferences: PlayerPreferences
): boolean {
  if (!profileId) return false;

  const audio = readTrackPreference(preferences.audio);
  const subtitles = readTrackPreference(preferences.subtitles);

  const subtitlesMode =
    preferences.subtitlesMode === 'auto'
      ? 'auto'
      : preferences.subtitlesMode === 'preferred' && subtitles
      ? 'preferred'
      : 'off';

  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`,
      JSON.stringify({
        audio,
        subtitlesMode,
        subtitles,
      })
    );

    return true;
  } catch {
    return false;
  }
}