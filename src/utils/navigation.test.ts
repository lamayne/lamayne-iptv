import { describe, expect, it } from 'vitest';
import { backLabelFor } from '@/utils/backLabel';
import {
  clearHomeSearch,
  getHomeSearch,
  getHomeSearchScope,
  setHomeSearch,
  setHomeSearchScope,
} from '@/utils/homeSearchMemory';

const t = (key: string) => key;

describe('mémoire de la recherche d’accueil', () => {
  it('conserve la recherche et le filtre, puis repart de zéro', () => {
    setHomeSearch('tetris');
    setHomeSearchScope('movies');

    expect([getHomeSearch(), getHomeSearchScope()]).toEqual(['tetris', 'movies']);

    clearHomeSearch();

    expect([getHomeSearch(), getHomeSearchScope()]).toEqual(['', 'all']);
  });
});

describe('texte du bouton Retour', () => {
  it('dépend de la page d’origine', () => {
    clearHomeSearch();
    expect(backLabelFor({ page: 'home', sub: 'all' }, t, 'x')).toBe('nav.backHome');

    setHomeSearch('piaf');
    expect(backLabelFor({ page: 'home', sub: 'all' }, t, 'x')).toBe('player.backSearch');

    expect(
      (['live', 'movies', 'series', 'favorites'] as const).map((page) =>
        backLabelFor({ page, sub: 'all' }, t, 'x')
      )
    ).toEqual(['player.backLiveTv', 'player.backMovies', 'player.backSeries', 'player.backFavorites']);

    expect(backLabelFor(null, t, 'défaut')).toBe('défaut');
  });
});
