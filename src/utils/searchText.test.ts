import { describe, expect, it } from 'vitest';
import { buildIndex, normalizeSearch, searchIndex } from '@/utils/searchText';

const index = (items: string[]) =>
  buildIndex(items, (item) => item, (item) => item);

describe('normalizeSearch', () => {
  it('ignore accents, majuscules et ponctuation', () => {
    expect(normalizeSearch('Édith Piaf : La Môme !')).toBe('edith piaf la mome');
  });

  it('conserve les autres alphabets sans casser les mots', () => {
    expect(normalizeSearch('Дом 2')).toBe('дом 2');
    expect(normalizeSearch('أفلام عربية')).toBe('افلام عربية');
  });
});

describe('searchIndex', () => {
  const movies = index([
    'La Môme',
    'Edith Piaf — documentaire',
    'Mômes en folie',
    'Piaf',
    'Le Chant du loup',
    'Tetris',
    '4K Tetris',
  ]);

  it('accepte les mots dans le désordre', () => {
    expect(searchIndex(movies, 'piaf edith', 10).results).toEqual([
      'Edith Piaf — documentaire',
    ]);
  });

  it('ignore accents et majuscules', () => {
    expect(searchIndex(movies, 'LA MOME', 10).results).toEqual(['La Môme']);
  });

  it('classe : nom exact, début du nom, puis le reste', () => {
    expect(searchIndex(movies, 'piaf', 10).results).toEqual([
      'Piaf',
      'Edith Piaf — documentaire',
    ]);
  });

  it('compte le total et respecte la limite', () => {
    const found = searchIndex(movies, 'e', 2);

    expect(found.results).toHaveLength(2);
    expect(found.total).toBeGreaterThan(2);
  });

  it('ne trouve rien pour une requête vide ou sans résultat', () => {
    expect(searchIndex(movies, '   ', 10)).toEqual({ results: [], total: 0 });
    expect(searchIndex(movies, 'zzzzz', 10)).toEqual({ results: [], total: 0 });
  });

  it('reste rapide sur 30 000 titres', () => {
    const big = index(
      Array.from({ length: 30000 }, (_, k) => `Film numéro ${k}${k % 7 ? '' : ' Tetris'}`)
    );
    const start = Date.now();
    const found = searchIndex(big, 'tetris', 24);

    expect(Date.now() - start).toBeLessThan(500);
    expect(found.total).toBe(Math.ceil(30000 / 7));
  });
});
