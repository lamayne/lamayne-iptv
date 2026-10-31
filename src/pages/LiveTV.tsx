import {
  useMemo,
  useState,
  useDeferredValue,
} from 'react';
import ChannelCard from '@/components/ChannelCard';
import { useApp } from '@/context/AppContext';
import {
  Clock,
  Eye,
  EyeOff,
  FileDown,
  Radio,
  Search,
  Tv,
  X,
} from 'lucide-react';

const PAGE_SIZE = 60;

function normalizeSearch(
  value: string
): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function categoryId(
  value: string | undefined
): string {
  return (
    value?.trim() ||
    '__uncategorized__'
  );
}

export default function LiveTV() {
  const {
    importedChannels,
    visibleImportedChannels,
    visibleRecentlyWatched,
    visibleLiveCategories,

    activeLiveCategory,
    setActiveLiveCategory,

    favorites,
    activeSubPage,

    searchQuery,
    setSearchQuery,

    navigate,
    activeProfile,
    visibilitySourceKey,
    hiddenCategories,
    t,
  } = useApp();

  const [pagination, setPagination] =
    useState({
      key: '',
      page: 1,
    });

  const isRecent =
    activeSubPage ===
    'recently-watched';

  const baseChannels = isRecent
    ? visibleRecentlyWatched
    : visibleImportedChannels;

  const categories =
    visibleLiveCategories;

  const effectiveCategory =
    !isRecent &&
    categories.some(
      (category) =>
        category.id ===
        activeLiveCategory
    )
      ? activeLiveCategory
      : '';

  // La saisie reste fluide : la liste se filtre sur une valeur légèrement
  // différée, pas à chaque lettre.
  const deferredSearch = useDeferredValue(searchQuery);

  const query =
    normalizeSearch(deferredSearch);

  const filtered = useMemo(() => {
    const terms = query
      .split(' ')
      .filter(Boolean);

    const result =
      baseChannels.filter(
        (channel) => {
          if (
            effectiveCategory &&
            categoryId(
              channel.category
            ) !== effectiveCategory
          ) {
            return false;
          }

          const searchable =
            normalizeSearch(
              `${channel.name} ${
                channel.category ?? ''
              }`
            );

          return terms.every(
            (term) =>
              searchable.includes(term)
          );
        }
      );

    return result;
  }, [
    baseChannels,
    effectiveCategory,
    query,
    isRecent,
  ]);

  const filterKey = JSON.stringify([
    activeProfile?.id,
    visibilitySourceKey,
    activeSubPage,
    effectiveCategory,
    query,
    hiddenCategories.live,
  ]);

  const pageCount = Math.max(
    1,
    Math.ceil(
      filtered.length / PAGE_SIZE
    )
  );

  const page =
    pagination.key === filterKey
      ? Math.min(
          pagination.page,
          pageCount
        )
      : 1;

  const startIndex =
    (page - 1) * PAGE_SIZE;

  const visibleChannels =
    filtered.slice(
      startIndex,
      startIndex + PAGE_SIZE
    );

  const hiddenChannelCount =
    Math.max(
      0,
      importedChannels.length -
        visibleImportedChannels.length
    );

  const allChannelsHidden =
    importedChannels.length > 0 &&
    visibleImportedChannels.length === 0;

  const selectedCategoryName =
    categories.find(
      (category) =>
        category.id ===
        effectiveCategory
    )?.name;

  function changePage(
    nextPage: number
  ) {
    setPagination({
      key: filterKey,
      page: Math.max(
        1,
        Math.min(
          nextPage,
          pageCount
        )
      ),
    });
  }

  function manageCategories() {
    navigate(
      'settings',
      'content-visibility'
    );
  }

  if (
    importedChannels.length === 0
  ) {
    return (
      <div className="px-8 py-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-20 text-center">
          <Tv className="mb-4 h-12 w-12 text-zinc-600" />

          <h2 className="text-lg font-semibold text-zinc-300">
            {t(
              'live.noChannelsAvailable'
            )}
          </h2>

          <p className="mt-2 text-sm text-zinc-500">
            {t('live.connectHint')}
          </p>

          <button
            type="button"
            onClick={() =>
              navigate(
                'settings',
                'import-playlist'
              )
            }
            className="mt-5 flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            <FileDown className="h-4 w-4" />

            {t(
              'live.connectSource'
            )}
          </button>
        </div>
      </div>
    );
  }

  const paginationControls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-zinc-400">
        {filtered.length === 0
          ? t('live.noChannels')
          : `${startIndex + 1}–${Math.min(
              startIndex +
                PAGE_SIZE,
              filtered.length
            )} ${t('live.rangeOf')} ${filtered.length} ${t('live.channels')}`}
      </p>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            changePage(page - 1)
          }
          disabled={page === 1}
          className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-white hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('live.previous')}
        </button>

        <span className="text-xs tabular-nums text-zinc-400">
          {page} / {pageCount}
        </span>

        <button
          type="button"
          onClick={() =>
            changePage(page + 1)
          }
          disabled={
            page >= pageCount
          }
          className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-white hover:bg-surface-600 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {t('live.next')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="px-8 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {isRecent ? (
            <Clock className="h-5 w-5 shrink-0 text-accent-400" />
          ) : (
            <Radio className="h-5 w-5 shrink-0 text-accent-400" />
          )}

          <h1 className="text-lg font-semibold text-white">
            {isRecent
              ? t(
                  'live.recentlyWatched'
                )
              : selectedCategoryName ||
                t('nav.live')}
          </h1>

          <span className="rounded bg-accent-600/15 px-2 py-1 text-xs text-accent-400">
            {filtered.length}{' '}
            {t('live.channels')}
          </span>
        </div>

        <button
          type="button"
          onClick={
            manageCategories
          }
          className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-surface-500 hover:text-white"
        >
          <Eye className="h-3.5 w-3.5" />

          {t('nav.gerer_les_categories')}
        </button>
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <div
          role="search"
          className="relative min-w-0 flex-1"
        >
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          />

          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(
                event.target.value
              )
            }
            aria-label={
              t('live.rechercher_une_chaine')
            }
            placeholder={
              t('live.rechercher_une_chaine_ou_une_categorie')
            }
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-surface-600 bg-surface-800 py-3 pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-accent-500"
          />

          {searchQuery.length >
            0 && (
            <button
              type="button"
              onClick={() =>
                setSearchQuery('')
              }
              aria-label={
                t('live.effacer_la_recherche')
              }
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!isRecent && (
          <div className="w-full lg:w-80">
            <label
              htmlFor="live-category"
              className="sr-only"
            >
              {t('live.category')}
            </label>

            <select
              id="live-category"
              value={
                effectiveCategory
              }
              onChange={(event) =>
                setActiveLiveCategory(
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-surface-600 bg-surface-800 px-3 py-3 text-sm text-zinc-200 outline-none focus:border-accent-500"
            >
              <option value="">
                {t(
                  'live.allCategories'
                )}
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name}
                  </option>
                )
              )}
            </select>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-500">
        <p>
          {
            visibleImportedChannels.length
          }{' '}
          {t('live.chaines_visibles')}

          {favorites.length >
            0 &&
            ` · ${favorites.length} ${t('live.favorites')}`}
        </p>

        {hiddenChannelCount > 0 && (
          <button
            type="button"
            onClick={
              manageCategories
            }
            className="flex items-center gap-1.5 text-zinc-500 hover:text-accent-300"
          >
            <EyeOff className="h-3 w-3" />

            {hiddenChannelCount}{' '}
            {t('live.masquees')}
          </button>
        )}
      </div>

      {!allChannelsHidden && (
        <div className="mb-5">
          {paginationControls}
        </div>
      )}

      {allChannelsHidden ? (
        <div className="rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-16 text-center">
          <EyeOff className="mx-auto mb-4 h-10 w-10 text-zinc-600" />

          <h2 className="text-base font-medium text-zinc-200">
            {t('live.toutes_les_categories_sont_masquees')}
          </h2>

          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
            {t('live.vos_chaines_sont_toujours_disponibles_da')}
          </p>

          <button
            type="button"
            onClick={
              manageCategories
            }
            className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-500"
          >
            <Eye className="h-4 w-4" />

            {t('nav.gerer_les_categories')}
          </button>
        </div>
      ) : visibleChannels.length >
        0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleChannels.map(
            (channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
              />
            )
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-16 text-center">
          <Tv className="mx-auto mb-3 h-8 w-8 text-zinc-600" />

          <p className="text-sm text-zinc-400">
            {query
              ? t(
                  'live.noSearchResults'
                )
              : isRecent
              ? t(
                  'live.noWatchedChannels'
                )
              : t(
                  'live.noSearchResults'
                )}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {query && (
              <button
                type="button"
                onClick={() =>
                  setSearchQuery('')
                }
                className="rounded-lg bg-surface-700 px-4 py-2 text-xs text-zinc-200 hover:bg-surface-600"
              >
                {t('live.effacer_la_recherche')}
              </button>
            )}

            {hiddenChannelCount >
              0 && (
              <button
                type="button"
                onClick={
                  manageCategories
                }
                className="rounded-lg border border-surface-600 px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                {t('live.verifier_les_categories_masquees')}
              </button>
            )}
          </div>
        </div>
      )}

      {visibleChannels.length >
        0 && (
        <div className="mt-6">
          {paginationControls}
        </div>
      )}
    </div>
  );
}