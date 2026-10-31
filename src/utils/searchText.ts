// Recherche tolérante : sans accents ni majuscules, et tous les mots tapés
// doivent se retrouver dans le nom (dans n'importe quel ordre).

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchTokens(query: string): string[] {
  const text = normalizeSearch(query);

  return text ? text.split(' ') : [];
}

export type Indexed<T> = {
  item: T;
  // Texte dans lequel on cherche (normalisé).
  text: string;
  // Nom propre servant à classer les résultats (normalisé).
  name: string;
};

export function buildIndex<T>(
  items: readonly T[],
  textOf: (item: T) => string,
  nameOf: (item: T) => string
): Indexed<T>[] {
  return items.map((item) => ({
    item,
    text: normalizeSearch(textOf(item)),
    name: normalizeSearch(nameOf(item)),
  }));
}

// Plus petit = meilleur : nom exact, nom qui commence par la recherche, mot
// entier, puis le reste.
function rankOf(name: string, query: string): number {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(` ${query}`)) return 2;

  return 3;
}

export function searchIndex<T>(
  index: readonly Indexed<T>[],
  query: string,
  limit: number
): { results: T[]; total: number } {
  const tokens = searchTokens(query);

  if (!tokens.length) return { results: [], total: 0 };

  const joined = tokens.join(' ');
  const hits: Array<{ item: T; rank: number; length: number }> = [];

  for (const entry of index) {
    if (tokens.every((token) => entry.text.includes(token))) {
      hits.push({
        item: entry.item,
        rank: rankOf(entry.name, joined),
        length: entry.name.length,
      });
    }
  }

  hits.sort((a, b) => a.rank - b.rank || a.length - b.length);

  return {
    results: hits.slice(0, limit).map((hit) => hit.item),
    total: hits.length,
  };
}
