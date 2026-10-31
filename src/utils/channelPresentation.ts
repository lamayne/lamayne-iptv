// Nettoyage des noms de chaînes IPTV (« |FR|FHD| TF1 » → « TF1 », qualité extraite).
// Partagé par ChannelCard et par la carte compacte de l'accueil.

export type ChannelPresentation = {
  name: string;
  quality: string;
  initials: string;
};

const PREFIX_TOKENS = new Set([
  'FR',
  'BE',
  'CH',
  'CA',
  'UK',
  'GB',
  'US',
  'USA',
  'DE',
  'ES',
  'IT',
  'PT',
  'NL',
  'PL',
  'RO',
  'GR',
  'TR',
  'BR',
  'MX',
  'AR',
  'MA',
  'DZ',
  'TN',
  'AL',
  'AT',
  'AU',
  'BG',
  'CZ',
  'DK',
  'FI',
  'HR',
  'HU',
  'IE',
  'IN',
  'JP',
  'KR',
  'NO',
  'NZ',
  'RS',
  'RU',
  'SE',
  'SI',
  'SK',
  'UA',
  'ZA',
  'SD',
  'HD',
  'FHD',
  'FULL HD',
  'UHD',
  '4K',
  '8K',
  'HEVC',
  'H264',
  'H265',
]);

function normalizePrefix(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function isTechnicalPrefix(value: string): boolean {
  const tokens = normalizePrefix(value)
    .split(/[\s:/_-]+/)
    .filter(Boolean);

  return (
    PREFIX_TOKENS.has(normalizePrefix(value)) ||
    (
      tokens.length > 0 &&
      tokens.every((token) =>
        PREFIX_TOKENS.has(token)
      )
    )
  );
}

export function getChannelPresentation(
  originalName: string,
  isLive: boolean
): ChannelPresentation {
  let name = originalName.trim();
  let quality = '';

  if (isLive) {
    // La qualité est extraite du nom, pas de l'URL du flux.
    if (/\b8K\b/i.test(name)) {
      quality = '8K';
    } else if (/\b4K\b/i.test(name)) {
      quality = '4K';
    } else if (/\bUHD\b/i.test(name)) {
      quality = 'UHD';
    } else if (/\bFHD\b|\bFULL\s+HD\b/i.test(name)) {
      quality = 'FHD';
    } else if (/\bHD\b/i.test(name)) {
      quality = 'HD';
    } else if (/\bSD\b/i.test(name)) {
      quality = 'SD';
    }

    // Exemple : |FR|FHD|= TF1 → = TF1
    // On retire uniquement les segments reconnus.
    if (name.startsWith('|')) {
      const segments = name.split('|');
      let position = 1;
      let removed = false;

      while (
        position < segments.length - 1 &&
        isTechnicalPrefix(segments[position])
      ) {
        position += 1;
        removed = true;
      }

      if (removed) {
        name = segments.slice(position).join('|');
      }
    }

    // Exemples : [FR] [FHD] TF1 ou (FR) TF1.
    // Un préfixe inconnu est conservé.
    let changed = true;

    while (changed) {
      changed = false;

      const match = name
        .trimStart()
        .match(/^(?:\[([^\]]+)\]|\(([^)]+)\))\s*/);

      const token = match?.[1] ?? match?.[2];

      if (
        match &&
        token &&
        isTechnicalPrefix(token)
      ) {
        name = name.trimStart().slice(match[0].length);
        changed = true;
      }
    }

    name = name
      .replace(
        /\b(?:FULL\s+HD|8K|4K|UHD|FHD|HD|SD|HEVC|H264|H265)\b/gi,
        ' '
      )
      .replace(/\[\s*\]|\(\s*\)/g, ' ')
      .replace(/^[\s|=:>_-]+|[\s|=:>_-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Ne jamais remplacer le nom par une chaîne vide.
  name = name || originalName.trim() || 'TV';

  const words = name
    .split(/[\s|:/_-]+/)
    .filter(Boolean);

  const initials =
    (
      words.length > 1
        ? `${words[0].charAt(0)}${words[1].charAt(0)}`
        : name.slice(0, 2)
    ).toLocaleUpperCase() || 'TV';

  return {
    name,
    quality,
    initials,
  };
}
