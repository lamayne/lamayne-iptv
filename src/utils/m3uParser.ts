import { Channel } from '@/types';

export interface M3UParseResult {
  channels: Channel[];
  totalEntries: number;
  validEntries: number;
}

const LOGO_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return LOGO_COLORS[Math.abs(hash) % LOGO_COLORS.length];
}

function stableId(name: string, streamUrl: string): string {
  let hash = 0;
  const key = `${name}|${streamUrl}`;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `imp-${Math.abs(hash)}`;
}

export function parseM3U(text: string, sourceLabel = 'Imported'): M3UParseResult {
  const lines = text.split(/\r?\n/);
  const channels: Channel[] = [];
  let totalEntries = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('#EXTINF')) {
      totalEntries++;

      const nameMatch = line.match(/,(.+)$/);
      const name = nameMatch ? nameMatch[1].trim() : `Channel ${totalEntries}`;

      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      const logoUrl = logoMatch ? logoMatch[1].trim() : undefined;

      const groupMatch = line.match(/group-title="([^"]*)"/);
      const groupRaw = groupMatch ? groupMatch[1].trim() : '';
      const group = groupRaw || 'Uncategorized';

      let streamUrl: string | undefined;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (next && !next.startsWith('#')) {
          streamUrl = next;
          break;
        }
        if (next.startsWith('#EXTINF')) break;
      }

      if (!streamUrl) continue;

      const id = stableId(name, streamUrl);
      channels.push({
        id,
        name,
        category: group,
        description: `Imported from ${sourceLabel} playlist`,
        logoColor: pickColor(name),
        isLive: true,
        logoUrl,
        streamUrl,
        imported: true,
      });
    }
  }

  return {
    channels,
    totalEntries,
    validEntries: channels.length,
  };
}

export async function fetchAndParseM3U(
  url: string,
  sourceLabel?: string
): Promise<M3UParseResult> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `The playlist host returned HTTP ${response.status}. The upstream server may be unavailable.`
    );
  }

  const text = await response.text();

  if (!text || text.trim().length === 0) {
    throw new Error('The playlist file is empty or could not be read.');
  }

  return parseM3U(text, sourceLabel);
}
