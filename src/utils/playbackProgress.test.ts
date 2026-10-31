import { describe, expect, it } from 'vitest';
import {
  getPlaybackProgress,
  isEpisodeRecordedAsMovie,
  listContinueWatching,
  savePlaybackProgress,
  type PlaybackIdentity,
  type PlaybackProgress,
} from '@/utils/playbackProgress';

const identity = (itemId: string, title: string): PlaybackIdentity => ({
  profileId: 'p1',
  sourceKey: 'xtream:A',
  kind: 'movie',
  itemId,
  title,
});

const asMovie = (title: string) => ({ kind: 'movie', title }) as PlaybackProgress;

describe('épisodes enregistrés comme des films', () => {
  it('reconnaît « Série — S1E2 » sous toutes ses formes', () => {
    expect(isEpisodeRecordedAsMovie(asMovie('24 heures chrono — S1E2'))).toBe(true);
    expect(isEpisodeRecordedAsMovie(asMovie('Shogun - S01E10'))).toBe(true);
    expect(isEpisodeRecordedAsMovie(asMovie('Danse avec les stars d’internet — S1E1 '))).toBe(true);
    expect(isEpisodeRecordedAsMovie(asMovie('Grey’s Anatomy : Station 19 – s2 e14'))).toBe(true);
  });

  it('ne touche pas aux vrais films', () => {
    for (const title of [
      '4K Tetris',
      'Fast & Furious X',
      'La Folie des Minions : Le Jeu',
      'Star Wars — Épisode IV',
      'Alien — Partie 2',
      'Se7en',
      'S1m0ne',
    ]) {
      expect(isEpisodeRecordedAsMovie(asMovie(title))).toBe(false);
    }
  });

  it('ne concerne pas un vrai épisode', () => {
    expect(
      isEpisodeRecordedAsMovie({ kind: 'episode', title: 'X — S1E1' } as PlaybackProgress)
    ).toBe(false);
  });
});

describe('continuer à regarder', () => {
  it('ne liste que les films, mais la reprise d’un épisode reste possible', () => {
    savePlaybackProgress(identity('111', '4K Tetris'), 600, 7000);
    savePlaybackProgress(identity('222', '24 heures chrono — S1E2'), 300, 2800);
    savePlaybackProgress(identity('333', 'Grey’s Anatomy : Station 19 — S1E1'), 900, 3400);
    savePlaybackProgress(identity('444', 'Folichonneries'), 100, 6000);

    const titles = listContinueWatching('p1', 'xtream:A').map((item) => item.title).sort();

    expect(titles).toEqual(['4K Tetris', 'Folichonneries']);
    expect(getPlaybackProgress(identity('222', '24 heures chrono — S1E2'))?.position).toBe(300);
  });
});
