// Retire les étiquettes techniques que les fournisseurs IPTV placent devant
// un titre : "|FR| Le Fils de Batman", "[VF] Titre", "(4K) Titre"…
// Seules des étiquettes connues sont retirées, pour ne jamais abîmer un
// vrai titre comme "[REC]".

const TAGS = new Set([
  'FR', 'VF', 'VO', 'VOST', 'VOSTFR', 'MULTI', 'TRUEFRENCH', 'FRENCH',
  'EN', 'ES', 'DE', 'IT', 'PT', 'NL', 'PL', 'TR', 'AR', 'RU',
  'BE', 'CH', 'CA', 'UK', 'GB', 'US', 'USA', 'MA', 'DZ', 'TN',
  '4K', '8K', 'UHD', 'FHD', 'HD', 'SD', 'HDR', 'HEVC', '1080P', '720P',
]);

const LEADING_TAG =
  /^\s*(?:\[([^\]]{1,24})\]|\(([^)]{1,24})\))\s*[-–:]*\s*/;

function isTagGroup(value: string): boolean {
  const tokens = value
    .toUpperCase()
    .split(/[\s/,+|-]+/)
    .filter(Boolean);

  return tokens.length > 0 && tokens.every((token) => TAGS.has(token));
}

export function cleanMovieTitle(name: string): string {
  let cleaned = name.trim();

  // Forme "|FR|FHD| Titre" : on retire les segments reconnus, un par un.
  if (cleaned.startsWith('|')) {
    const segments = cleaned.split('|');
    let position = 1;

    while (
      position < segments.length - 1 &&
      isTagGroup(segments[position])
    ) {
      position += 1;
    }

    if (position > 1) {
      const rest = segments
        .slice(position)
        .join('|')
        .replace(/^[\s=:>_-]+/, '')
        .trim();

      if (rest) cleaned = rest;
    }
  }

  // Formes "[VF] Titre" et "(4K) Titre".
  for (let pass = 0; pass < 4; pass += 1) {
    const match = cleaned.match(LEADING_TAG);
    const inner = match?.[1] ?? match?.[2];

    if (!match || !inner || !isTagGroup(inner)) break;

    const next = cleaned.slice(match[0].length).trim();

    if (!next) break;

    cleaned = next;
  }

  return cleaned.replace(/\s+/g, ' ') || name.trim();
}
