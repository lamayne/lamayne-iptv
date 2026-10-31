import { describe, expect, it } from 'vitest';
import { cleanChannelName, detectCountryFromName, detectEpgCountries } from '@/utils/epg';
import type { Channel } from '@/types';

const channel = (name: string, category: string, isLive = true) =>
  ({ id: name, name, category, isLive, streamUrl: '' }) as unknown as Channel;

describe('guide des programmes', () => {
  it('nettoie le nom envoyé au guide', () => {
    expect(cleanChannelName('|FR|FHD|= FRANCE 2')).toBe('FRANCE 2');
  });

  it('détecte les pays les plus présents (3 au plus)', () => {
    const detected = detectEpgCountries([
      channel('|FR|FHD|= FRANCE 2', 'FR| TNT'),
      channel('TF1', 'FR| TNT'),
      channel('M6', 'France'),
      channel('RTBF 1', 'Belgique'),
      channel('Marca', 'ES| Sport'),
      channel('Film', 'FR', false),
    ]);

    expect(detected).toEqual(['fr', 'be', 'es']);
  });

  it('déduit le pays du nom tapé pour la vérification d’une chaîne', () => {
    expect(detectCountryFromName('france 2')).toBe('fr');
    expect(detectCountryFromName('RTBF Belgique')).toBe('be');
    expect(detectCountryFromName('TF1')).toBeNull();
  });

  it('ne renvoie rien quand aucun pays n’est reconnu', () => {
    expect(detectEpgCountries([channel('Xyz', 'Divers')])).toEqual([]);
  });
});
