import { useEffect, useState } from 'react';
import type { Channel } from '@/types';
import { useApp } from '@/context/AppContext';
import { clearEpgCache, queuedEpgInvoke } from '@/utils/epgQueue';

export type EpgProgramme = {
  title: string;
  start: number;
  end: number;
};

type EpgCredentials = {
  serverUrl: string;
  username: string;
  password: string;
};

type EpgState = {
  key: string;
  now: EpgProgramme | null;
  next: EpgProgramme | null;
};

const COUNTRY_KEYWORDS: Array<[RegExp, string]> = [
  [/\bfrance\b|\bfrench\b|\bfr\b/i, 'fr'],
  [/\bbelgium\b|\bbelgique\b|\bbelge\b|\bbe\b/i, 'be'],
  [/\bswitzerland\b|\bsuisse\b|\bschweiz\b|\bch\b/i, 'ch'],
  [/\bcanada\b|\bquébec\b|\bquebec\b|\bca\b/i, 'ca'],
  [/\buk\b|\bunited kingdom\b|\bengland\b|\bbritish\b/i, 'uk'],
  [/\busa\b|\bunited states\b|\bamerica\b|\bus\b/i, 'us'],
  [/\bgermany\b|\bdeutschland\b|\ballemand\b|\bde\b/i, 'de'],
  [/\bspain\b|\bespaña\b|\bespagne\b|\bes\b/i, 'es'],
  [/\bitaly\b|\bitalia\b|\bitalien\b|\bit\b/i, 'it'],
  [/\bportugal\b|\bportugais\b|\bpt\b/i, 'pt'],
  [/\bnetherlands\b|\bnederland\b|\bholland\b|\bnéerlandais\b|\bnl\b/i, 'nl'],
  [/\bpoland\b|\bpolska\b|\bpolonais\b|\bpl\b/i, 'pl'],
  [/\bromania\b|\bromânia\b|\broumain\b|\bro\b/i, 'ro'],
  [/\bgreece\b|\bhellas\b|\bgrec\b|\bgr\b/i, 'gr'],
  [/\bturkey\b|\btürkiye\b|\bturc\b|\btr\b/i, 'tr'],
  [/\bbrazil\b|\bbrasil\b|\bbrésil\b|\bbr\b/i, 'br'],
  [/\bmexico\b|\bmexique\b|\bmx\b/i, 'mx'],
  [/\bargentina\b|\bargentine\b|\bar\b/i, 'ar'],
];

function detectCountry(channel: Channel): string | null {
  for (const value of [channel.category ?? '', channel.name]) {
    for (const [pattern, code] of COUNTRY_KEYWORDS) {
      if (pattern.test(value)) return code;
    }
  }
  return null;
}

export function cleanChannelName(name: string): string {
  let cleaned = name.trim();
  if (cleaned.startsWith('|')) {
    const lastPipe = cleaned.lastIndexOf('|');
    if (lastPipe > 0) {
      const remainder = cleaned.slice(lastPipe + 1).trim();
      if (remainder) cleaned = remainder;
    }
  }
  return cleaned
    .replace(/^\s*(?:\[[^\]]+\]\s*)+/, '')
    .replace(/\b(?:4K|UHD|FHD|HD|SD|HEVC|H265|H264)\b/gi, ' ')
    .replace(/^[\s|=:>_-]+|[\s|=:>_-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Pays d'après le nom tapé (« France 2 » → fr), s'il en contient un.
export function detectCountryFromName(name: string): string | null {
  return detectCountry({ name, category: '' } as Channel);
}

// Pays proposés pour la vérification d'une chaîne.
export const EPG_COUNTRIES: string[] = COUNTRY_KEYWORDS.map(([, code]) => code);

// Pays les plus présents dans les chaînes (3 au plus), pour savoir quels guides
// publics mettre à jour.
export function detectEpgCountries(channels: readonly Channel[]): string[] {
  const counts = new Map<string, number>();

  for (const channel of channels) {
    if (!channel.isLive) continue;

    const code = detectCountry(channel);

    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code);
}

// Les affichages ouverts se rechargent quand le guide est mis à jour à la main.
const reloadListeners = new Set<() => void>();

export function reloadEpg() {
  clearEpgCache();
  reloadListeners.forEach((listener) => listener());
}

function getStreamId(channel: Channel): string | null {
  if (!channel.streamUrl) return null;
  return channel.streamUrl.match(
    /\/live\/[^/]+\/[^/]+\/(\d+)\.(?:ts|m3u8|php)(?:[?#]|$)/i
  )?.[1] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function decodeTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  const original = value.trim();
  if (!original) return '';
  try {
    const bytes = Uint8Array.from(atob(original), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/[\u0000-\u0008\u000E-\u001F]/.test(decoded)) return original;
    return decoded.trim() || original;
  } catch {
    return original;
  }
}

function isProgramme(value: unknown): value is EpgProgramme {
  const item = asRecord(value);
  return Boolean(item && typeof item.title === 'string' && item.title.trim()
    && typeof item.start === 'number' && Number.isFinite(item.start)
    && typeof item.end === 'number' && Number.isFinite(item.end)
    && item.end > item.start);
}

export function useEpg(
  channel: Channel,
  credentials: EpgCredentials | null,
  enabled: boolean
) {
  const { selectedChannel } = useApp();
  const priority = selectedChannel?.id === channel.id ? 'foreground' : 'background';
  const streamId = getStreamId(channel);
  const country = detectCountry(channel);
  const cleanedName = cleanChannelName(channel.name);
  const serverUrl = credentials?.serverUrl;
  const username = credentials?.username;
  const password = credentials?.password;
  const key = JSON.stringify([
    channel.id, channel.streamUrl, country, cleanedName,
    serverUrl, username, password,
  ]);

  const [state, setState] = useState<EpgState>({ key: '', now: null, next: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let loading = false;
    let programmes: EpgProgramme[] = [];
    let lastAttempt = 0;

    function updateDisplayedProgrammes() {
      if (cancelled) return;
      const currentTime = Date.now() / 1000;
      const now = programmes.find((p) => p.start <= currentTime && p.end > currentTime) ?? null;
      const next = programmes.find((p) => p.start > currentTime) ?? null;
      setState((previous) => previous.key === key && previous.now === now && previous.next === next
        ? previous : { key, now, next });
    }

    async function loadProvider(): Promise<EpgProgramme[]> {
      if (!serverUrl || !username || !password || !streamId) return [];
      const raw = await queuedEpgInvoke<unknown>('fetch_xtream_catalog', {
        serverUrl, username, password, action: 'get_short_epg', itemId: streamId,
      }, { priority, ttlMs: 60_000 });
      const listings = asRecord(raw)?.epg_listings;
      if (!Array.isArray(listings)) return [];
      return listings.map((value): EpgProgramme | null => {
        const item = asRecord(value);
        if (!item) return null;
        const start = toNumber(item.start_timestamp);
        const end = toNumber(item.stop_timestamp);
        const title = decodeTitle(item.title);
        return start !== null && end !== null && end > start && title
          ? { title, start, end } : null;
      }).filter((p): p is EpgProgramme => p !== null)
        .sort((a, b) => a.start - b.start);
    }

    async function loadPublic(): Promise<EpgProgramme[]> {
      if (!country || !cleanedName) return [];
      const raw = await queuedEpgInvoke<unknown>('fetch_public_epg', {
        countryCode: country, channelName: cleanedName,
      }, { priority, ttlMs: 120_000 });
      return Array.isArray(raw)
        ? raw.filter(isProgramme).sort((a, b) => a.start - b.start)
        : [];
    }

    async function load() {
      if (loading || cancelled) return;
      loading = true;
      lastAttempt = Date.now();
      try {
        let received: EpgProgramme[] = [];
        try { received = await loadProvider(); }
        catch { /* Le guide public reste disponible comme repli. */ }
        if (cancelled) return;
        const currentTime = Date.now() / 1000;
        const hasCurrent = received.some((p) => p.start <= currentTime && p.end > currentTime);
        if (!hasCurrent) {
          try {
            const publicItems = await loadPublic();
            if (cancelled) return;
            const publicHasCurrent = publicItems.some((p) => p.start <= currentTime && p.end > currentTime);
            if (publicHasCurrent || !received.some((p) => p.end > currentTime)) {
              received = publicItems;
            }
          } catch {
            // Conserve les programmes déjà chargés en cas de panne réseau.
          }
        }
        if (cancelled) return;
        if (received.some((p) => p.end > Date.now() / 1000)) programmes = received;
        updateDisplayedProgrammes();
      } finally {
        loading = false;
      }
    }

    void load();
    const timer = window.setInterval(() => {
      updateDisplayedProgrammes();
      const now = Date.now() / 1000;
      const hasCurrent = programmes.some((p) => p.start <= now && p.end > now);
      const refreshAfter = hasCurrent ? 5 * 60_000 : 60_000;
      if (Date.now() - lastAttempt >= refreshAfter) void load();
    }, 15_000);

    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        updateDisplayedProgrammes();
        if (Date.now() - lastAttempt >= 60_000) void load();
      }
    };
    document.addEventListener('visibilitychange', refreshOnReturn);
    window.addEventListener('online', refreshOnReturn);

    const onReload = () => {
      lastAttempt = 0;
      void load();
    };
    reloadListeners.add(onReload);

    return () => {
      reloadListeners.delete(onReload);
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshOnReturn);
      window.removeEventListener('online', refreshOnReturn);
    };
  }, [key, enabled, priority, streamId, country, cleanedName, serverUrl, username, password]);

  return enabled && state.key === key
    ? { now: state.now, next: state.next }
    : { now: null, next: null };
}
