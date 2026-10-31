import { describe, expect, it } from 'vitest';
import { getChannelPresentation } from '@/utils/channelPresentation';
import { cleanMovieTitle } from '@/utils/titleClean';

describe('noms de chaînes', () => {
  it('retire les étiquettes du fournisseur et garde la qualité à part', () => {
    expect(getChannelPresentation('|FR|FHD|= FRANCE 2', true)).toEqual({
      name: 'FRANCE 2',
      quality: 'FHD',
      initials: 'F2',
    });
    expect(getChannelPresentation('[FR] M6 4K', true).name).toBe('M6');
    expect(getChannelPresentation('CANAL+ FOOT', true).name).toBe('CANAL+ FOOT');
  });
});

describe('titres de films', () => {
  it('retire l’étiquette de pays', () => {
    expect(cleanMovieTitle('|FR| Shogun')).toBe('Shogun');
  });

  it('ne modifie pas un titre normal', () => {
    expect(cleanMovieTitle('La Folie des Minions : Le Jeu')).toBe('La Folie des Minions : Le Jeu');
  });
});
