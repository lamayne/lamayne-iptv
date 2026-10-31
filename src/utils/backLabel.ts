import type { Translate } from '@/i18n';
import type { Page, SubPage } from '@/types';
import { getHomeSearch } from '@/utils/homeSearchMemory';

// Texte du bouton « Retour » selon la page où il ramène.
export function backLabelFor(
  target: { page: Page; sub: SubPage } | null,
  t: Translate,
  fallback: string
): string {
  if (!target) return fallback;

  switch (target.page) {
    case 'home':
      return getHomeSearch().trim()
        ? t('player.backSearch')
        : t('nav.backHome');
    case 'live':
      return t('player.backLiveTv');
    case 'movies':
      return t('player.backMovies');
    case 'series':
      return t('player.backSeries');
    case 'favorites':
      return t('player.backFavorites');
    default:
      return fallback;
  }
}
