import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'msp_home_hidden_v1:';
const MAX_HIDDEN = 2000;

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(profileId)}`;
}

function readHidden(profileId: string): Set<string> {
  if (!profileId) return new Set();

  try {
    const raw = localStorage.getItem(storageKey(profileId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

function writeHidden(profileId: string, keys: Set<string>): void {
  if (!profileId) return;

  try {
    localStorage.setItem(
      storageKey(profileId),
      JSON.stringify(Array.from(keys).slice(-MAX_HIDDEN))
    );
  } catch {
    // Le masquage reste actif pendant la session si le stockage est plein.
  }
}

export function useHomeHidden(profileId: string) {
  const [keys, setKeys] = useState<Set<string>>(() => readHidden(profileId));

  useEffect(() => {
    setKeys(readHidden(profileId));
  }, [profileId]);

  const hide = useCallback(
    (key: string) => {
      setKeys((previous) => {
        if (previous.has(key)) return previous;

        const next = new Set(previous);
        next.add(key);
        writeHidden(profileId, next);

        return next;
      });
    },
    [profileId]
  );

  const restoreAll = useCallback(() => {
    const next = new Set<string>();
    writeHidden(profileId, next);
    setKeys(next);
  }, [profileId]);

  return {
    keys,
    hide,
    restoreAll,
    count: keys.size,
  };
}