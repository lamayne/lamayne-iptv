import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ContentKind =
  | 'live'
  | 'movies'
  | 'series';

type HiddenCategories = Record<
  ContentKind,
  string[]
>;

type Snapshot = {
  storageKey: string;
  hidden: HiddenCategories;
};

type VisibilityChangeDetail = {
  storageKey: string;
};

const STORAGE_PREFIX =
  'msp_category_visibility_v1:';

const CHANGE_EVENT =
  'msp-category-visibility-changed';

function emptyHidden(): HiddenCategories {
  return {
    live: [],
    movies: [],
    series: [],
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value.filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.length > 0
      )
    )
  );
}

function makeStorageKey(
  profileId: string,
  sourceIdentity: string
): string {
  if (!profileId || !sourceIdentity) {
    return '';
  }

  return (
    STORAGE_PREFIX +
    encodeURIComponent(
      JSON.stringify([
        profileId,
        sourceIdentity,
      ])
    )
  );
}

function readHidden(
  storageKey: string
): HiddenCategories {
  if (!storageKey) return emptyHidden();

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyHidden();

    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      return emptyHidden();
    }

    return {
      live: validIds(parsed.live),
      movies: validIds(parsed.movies),
      series: validIds(parsed.series),
    };
  } catch {
    return emptyHidden();
  }
}

function writeHidden(
  storageKey: string,
  hidden: HiddenCategories
): boolean {
  if (!storageKey) return false;

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(hidden)
    );
  } catch {
    return false;
  }

  window.dispatchEvent(
    new CustomEvent<VisibilityChangeDetail>(
      CHANGE_EVENT,
      {
        detail: { storageKey },
      }
    )
  );

  return true;
}

export function useCategoryVisibility(
  profileId: string,
  sourceIdentity: string
) {
  const storageKey = makeStorageKey(
    profileId,
    sourceIdentity
  );

  const [snapshot, setSnapshot] =
    useState<Snapshot>(() => ({
      storageKey,
      hidden: readHidden(storageKey),
    }));

  useEffect(() => {
    function update() {
      setSnapshot({
        storageKey,
        hidden: readHidden(storageKey),
      });
    }

    function onChange(event: Event) {
      const detail = (
        event as CustomEvent<VisibilityChangeDetail>
      ).detail;

      if (detail?.storageKey === storageKey) {
        update();
      }
    }

    function onStorage(event: StorageEvent) {
      if (
        event.key === null ||
        event.key === storageKey
      ) {
        update();
      }
    }

    update();

    window.addEventListener(
      CHANGE_EVENT,
      onChange
    );
    window.addEventListener(
      'storage',
      onStorage
    );
    window.addEventListener('focus', update);

    return () => {
      window.removeEventListener(
        CHANGE_EVENT,
        onChange
      );
      window.removeEventListener(
        'storage',
        onStorage
      );
      window.removeEventListener(
        'focus',
        update
      );
    };
  }, [storageKey]);

  const hidden = useMemo(
    () =>
      snapshot.storageKey === storageKey
        ? snapshot.hidden
        : readHidden(storageKey),
    [snapshot, storageKey]
  );

  const hiddenSets = useMemo(
    () => ({
      live: new Set(hidden.live),
      movies: new Set(hidden.movies),
      series: new Set(hidden.series),
    }),
    [hidden]
  );

  const isCategoryHidden = useCallback(
    (
      kind: ContentKind,
      categoryId: string
    ): boolean =>
      hiddenSets[kind].has(categoryId),
    [hiddenSets]
  );

  const setCategoriesHidden = useCallback(
    (
      kind: ContentKind,
      categoryIds: string[],
      shouldHide: boolean
    ): boolean => {
      if (!storageKey) return false;

      const current = readHidden(storageKey);
      const nextIds = new Set(current[kind]);

      for (const categoryId of categoryIds) {
        if (!categoryId) continue;

        if (shouldHide) {
          nextIds.add(categoryId);
        } else {
          nextIds.delete(categoryId);
        }
      }

      const next: HiddenCategories = {
        ...current,
        [kind]: Array.from(nextIds),
      };

      const saved = writeHidden(
        storageKey,
        next
      );

      if (saved) {
        setSnapshot({
          storageKey,
          hidden: next,
        });
      }

      return saved;
    },
    [storageKey]
  );

  const setCategoryHidden = useCallback(
    (
      kind: ContentKind,
      categoryId: string,
      shouldHide: boolean
    ): boolean =>
      setCategoriesHidden(
        kind,
        [categoryId],
        shouldHide
      ),
    [setCategoriesHidden]
  );

  const showAllCategories = useCallback(
    (kind: ContentKind): boolean => {
      if (!storageKey) return false;

      const current = readHidden(storageKey);

      const next: HiddenCategories = {
        ...current,
        [kind]: [],
      };

      const saved = writeHidden(
        storageKey,
        next
      );

      if (saved) {
        setSnapshot({
          storageKey,
          hidden: next,
        });
      }

      return saved;
    },
    [storageKey]
  );

  return {
    hiddenCategories: hidden,
    isCategoryHidden,
    setCategoryHidden,
    setCategoriesHidden,
    showAllCategories,
    canSaveVisibility: Boolean(storageKey),
  };
}