import { describe, expect, it } from 'vitest';
import {
  fingerprint,
  readRecentEntries,
  rememberRecent,
  restoreRecents,
} from '@/utils/recentChannels';
import type { Channel } from '@/types';

const channel = (id: string) =>
  ({
    id,
    name: id,
    streamUrl: `http://srv/user/SECRETPASS/${id}`,
    isLive: true,
  }) as unknown as Channel;

const channels = Array.from({ length: 300 }, (_, k) => channel(`xtream-http%3A%2F%2Fsrv-${k}`));
const numberOf = (c: Channel) => c.id.split('-').pop();

describe('chaînes récentes', () => {
  it('l’empreinte est stable et courte', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(fingerprint('xtream-x')).toHaveLength(16);
  });

  it('remet la plus récente en tête, sans doublon', () => {
    rememberRecent('p1', 'xtream:A', channels[5].id, 1000);
    rememberRecent('p1', 'xtream:A', channels[9].id, 2000);
    rememberRecent('p1', 'xtream:A', channels[5].id, 3000);

    const restored = restoreRecents(readRecentEntries('p1', 'xtream:A'), channels);

    expect(restored.map((c) => [numberOf(c), c.watchedAt])).toEqual([
      ['5', 3000],
      ['9', 2000],
    ]);
  });

  it('sépare les profils et les sources', () => {
    rememberRecent('p1', 'xtream:A', channels[1].id, 1);

    expect(restoreRecents(readRecentEntries('p2', 'xtream:A'), channels)).toEqual([]);
    expect(restoreRecents(readRecentEntries('p1', 'xtream:B'), channels)).toEqual([]);
  });

  it('n’écrit jamais d’adresse, de mot de passe ni d’identifiant de chaîne', () => {
    rememberRecent('p1', 'xtream:A', channels[7].id, 1);

    const stored = JSON.stringify(
      Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, i) => {
          const key = localStorage.key(i) as string;
          return [key, localStorage.getItem(key)];
        })
      )
    );

    for (const secret of ['SECRETPASS', 'http', 'srv', 'xtream-']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('ignore une chaîne qui a disparu de la source', () => {
    rememberRecent('p1', 'xtream:A', channels[5].id, 1);
    rememberRecent('p1', 'xtream:A', channels[9].id, 2);

    const without5 = channels.filter((c) => !c.id.endsWith('-5'));

    expect(
      restoreRecents(readRecentEntries('p1', 'xtream:A'), without5).map(numberOf)
    ).toEqual(['9']);
  });

  it('garde 20 chaînes par source et 40 sources', () => {
    for (let k = 0; k < 40; k += 1) {
      rememberRecent('p1', 'xtream:A', channels[100 + k].id, 5000 + k);
    }

    expect(readRecentEntries('p1', 'xtream:A')).toHaveLength(20);

    for (let k = 0; k < 60; k += 1) {
      rememberRecent(`p${k}`, 'src', channels[1].id, 100 + k);
    }

    const stored = JSON.parse(localStorage.getItem('msp_recent_channels_v2') ?? '{}');

    expect(Object.keys(stored).length).toBeLessThanOrEqual(40);
  });

  it('n’écrit rien pour une source sans identité', () => {
    rememberRecent('p1', '', channels[1].id, 1);

    expect(readRecentEntries('p1', '')).toEqual([]);
  });

  it('supporte un stockage corrompu', () => {
    localStorage.setItem('msp_recent_channels_v2', '{cassé');

    expect(readRecentEntries('p1', 'xtream:A')).toEqual([]);
  });
});
