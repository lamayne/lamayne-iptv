import { describe, expect, it } from 'vitest';
import {
  REFILL_BELOW,
  TARGET_SLIDES,
  availableSlides,
  cleanOldSelections,
  displaySlides,
  interleave,
  poolIsComplete,
  slideKey,
  type FeaturedSlide,
} from '@/utils/featuredSlides';

const slide = (kind: 'movie' | 'series', n: number): FeaturedSlide => ({
  kind,
  id: `${kind[0]}${n}`,
  name: `${kind}${n}`,
  image: 'i',
  imageKind: 'backdrop',
  poster: '',
  categoryId: '',
  extension: 'mp4',
  plot: 'x'.repeat(80),
  genres: [],
  year: '',
  duration: '',
});

const films = [1, 2, 3, 4, 5].map((n) => slide('movie', n));
const series = [1, 2, 3, 4, 5].map((n) => slide('series', n));
const pool = interleave(films, series);
const names = (list: FeaturedSlide[]) => list.map((item) => item.name).join(' ');
const hidden = (...keys: string[]) => new Set(keys);

describe('recommandations de l’accueil', () => {
  it('prépare 5 films et 5 séries en alternance', () => {
    expect(names(pool)).toBe(
      'movie1 series1 movie2 series2 movie3 series3 movie4 series4 movie5 series5'
    );
  });

  it('affiche 5 titres : 3 films et 2 séries', () => {
    expect(names(displaySlides(pool, new Set()))).toBe(
      'movie1 series1 movie2 series2 movie3'
    );
    expect(TARGET_SLIDES).toBe(5);
  });

  it('remplace aussitôt un titre masqué', () => {
    const shown = displaySlides(pool, hidden('movie:m1'));

    expect(names(shown)).toBe('series1 movie2 series2 movie3 series3');
    expect(shown).toHaveLength(5);
    expect(poolIsComplete(availableSlides(pool, hidden('movie:m1')).length)).toBe(true);
  });

  it('continue d’afficher 5 titres et demande à compléter la réserve en dessous de 6', () => {
    const many = hidden('movie:m1', 'series:s1', 'movie:m2', 'series:s2', 'movie:m3');

    expect(displaySlides(pool, many)).toHaveLength(5);
    expect(poolIsComplete(availableSlides(pool, many).length)).toBe(false);
    expect(REFILL_BELOW).toBe(6);
  });

  it('ne reproduit jamais un titre masqué', () => {
    const shown = displaySlides(pool, hidden('movie:m1', 'series:s1'));

    expect(shown.some((item) => ['m1', 's1'].includes(item.id))).toBe(false);
  });

  it('gère une liste vide ou plus courte que 5', () => {
    expect(displaySlides(pool, new Set(pool.map(slideKey)))).toHaveLength(0);
    expect(displaySlides(pool.slice(0, 3), new Set())).toHaveLength(3);
  });

  it('retire une fois les anciennes sélections et garde le reste', () => {
    for (const key of [
      'msp_featured_v5:scopeA',
      'msp_featured_v4:scopeA',
      'msp_weekly_film_v1:scopeA',
      'msp_featured_v6:keep',
      'msp_featured_hidden_v1:keep',
      'autre',
    ]) {
      localStorage.setItem(key, '1');
    }

    cleanOldSelections();

    const kept = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).sort();

    expect(kept).toEqual(['autre', 'msp_featured_hidden_v1:keep', 'msp_featured_v6:keep']);
  });
});
