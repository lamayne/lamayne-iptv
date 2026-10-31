import type { Channel } from '@/types';

// Historique des chaînes regardées, conservé d'un lancement à l'autre.
//
// Par confidentialité, on n'écrit JAMAIS l'adresse du flux (elle peut contenir
// l'identifiant et le mot de passe) : seulement une empreinte de l'identifiant
// de la chaîne et l'heure. Au retour de la source, on retrouve les chaînes
// dans la liste fraîchement chargée.

const STORAGE_KEY = 'msp_recent_channels_v2';
const MAX_PER_SOURCE = 20;
const MAX_SOURCES = 40;

type Entry = { h: string; t: number };
type Store = Record<string, Entry[]>;

export type RecentEntry = Entry;

// Empreinte courte (cyrb53) : pas de lien lisible avec l'adresse du serveur.
export function fingerprint(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }

  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Store)
      : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Stockage indisponible : l'historique reste valable pour cette session.
  }
}

const keyOf = (profileId: string, sourceKey: string) =>
  `${profileId}|${sourceKey}`;

export function readRecentEntries(
  profileId: string,
  sourceKey: string
): RecentEntry[] {
  const list = readStore()[keyOf(profileId, sourceKey)];

  return Array.isArray(list)
    ? list.filter(
        (entry) =>
          entry &&
          typeof entry.h === 'string' &&
          typeof entry.t === 'number'
      )
    : [];
}

export function rememberRecent(
  profileId: string,
  sourceKey: string,
  channelId: string,
  watchedAt: number
) {
  if (!sourceKey) return;

  const store = readStore();
  const key = keyOf(profileId, sourceKey);
  const hash = fingerprint(channelId);

  store[key] = [
    { h: hash, t: watchedAt },
    ...(store[key] ?? []).filter((entry) => entry.h !== hash),
  ].slice(0, MAX_PER_SOURCE);

  // Évite que la liste des sources s'allonge sans fin.
  const keys = Object.keys(store);

  if (keys.length > MAX_SOURCES) {
    keys
      .sort((a, b) => (store[b][0]?.t ?? 0) - (store[a][0]?.t ?? 0))
      .slice(MAX_SOURCES)
      .forEach((old) => delete store[old]);
  }

  writeStore(store);
}

// Retrouve les chaînes mémorisées dans la liste actuelle de la source.
export function restoreRecents(
  entries: readonly RecentEntry[],
  channels: readonly Channel[]
): Channel[] {
  if (!entries.length) return [];

  const wanted = new Set(entries.map((entry) => entry.h));
  const byHash = new Map<string, Channel>();

  for (const channel of channels) {
    const hash = fingerprint(channel.id);

    if (wanted.has(hash)) byHash.set(hash, channel);
  }

  const restored: Channel[] = [];

  for (const entry of entries) {
    const channel = byHash.get(entry.h);

    if (channel) restored.push({ ...channel, watchedAt: entry.t });
  }

  return restored;
}
