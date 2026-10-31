import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Eye,
  EyeOff,
  Film,
  Heart,
  Loader2,
  Play,
  RefreshCw,
  Check,
} from 'lucide-react';
import {
  useApp,
  type CatalogFavorite,
} from '@/context/AppContext';
import type { Channel } from '@/types';
import {
  useMovieCatalog,
  type CatalogMovie,
  type CatalogCategory,
} from '@/utils/xtreamCatalogCache';
import {
  useMovieProgress,
} from '@/utils/useMovieProgress';
import {
  formatPlaybackTime,
} from '@/utils/playbackProgress';
import { errorText } from '@/i18n/backendErrors';

type JsonRecord = Record<string, unknown>;

const PAGE_SIZE = 48;
const EMPTY_MOVIES: CatalogMovie[] = [];
const EMPTY_CATEGORIES: CatalogCategory[] = [];

function asRecord(
  value: unknown
): JsonRecord | null {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
    ? value as JsonRecord
    : null;
}

function cleanExtension(
  value: unknown
): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/^\./, '')
        .toLowerCase()
    : '';
}

function errorMessage(
  value: unknown,
  fallback: string
): string {
  return errorText(value, fallback);
}

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

export default function Movies() {
  const {
    xtreamCredentials,
    sourceKey,
    searchQuery,
    setSelectedChannel,
    navigate,
    activeMovieCategory,
    setActiveMovieCategory,
    toggleCatalogFavorite,
    isCatalogFavorite,
    activeProfile,
    t,
    isCategoryHidden,
    hiddenCategories,
    visibilitySourceKey,
  } = useApp();

  const catalog =
    useMovieCatalog(xtreamCredentials);

  const movies =
    catalog.data?.movies ?? EMPTY_MOVIES;

  const allCategories =
    catalog.data?.categories ??
    EMPTY_CATEGORIES;

  const movieProgress = useMovieProgress(
    activeProfile?.id ?? '',
    sourceKey
  );

  const [localSearch, setLocalSearch] =
    useState('');

  const [openingError, setOpeningError] =
    useState('');

  const [openingId, setOpeningId] =
    useState<string | null>(null);

  const [pagination, setPagination] =
    useState({
      key: '',
      page: 1,
    });

  const openingRef = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    openingRef.current = false;
    setOpeningId(null);
    setOpeningError('');

    return () => {
      requestRef.current += 1;
      openingRef.current = false;
    };
  }, [
    xtreamCredentials,
    activeProfile?.id,
  ]);

  useEffect(() => {
    setLocalSearch('');
    setPagination({
      key: '',
      page: 1,
    });
  }, [sourceKey]);

  const categoryNames = useMemo(
    () =>
      new Map(
        allCategories.map((category) => [
          category.id,
          category.name,
        ])
      ),
    [allCategories]
  );

  const categories = useMemo(
    () =>
      allCategories.filter(
        (category) =>
          !isCategoryHidden(
            'movies',
            category.id
          )
      ),
    [allCategories, isCategoryHidden]
  );

  const visibleCatalog = useMemo(
    () =>
      movies.filter(
        (movie) =>
          !isCategoryHidden(
            'movies',
            movie.categoryId
          )
      ),
    [movies, isCategoryHidden]
  );

  const effectiveCategory =
    activeMovieCategory &&
    !isCategoryHidden(
      'movies',
      activeMovieCategory
    )
      ? activeMovieCategory
      : '';

  const query = normalizeSearch(
    `${searchQuery} ${localSearch}`
  );

  const filtered = useMemo(() => {
    const terms = query
      .split(' ')
      .filter(Boolean);

    return visibleCatalog.filter(
      (movie) => {
        if (
          effectiveCategory &&
          movie.categoryId !==
            effectiveCategory
        ) {
          return false;
        }

        const searchable =
          normalizeSearch(
            `${movie.name} ${
              categoryNames.get(
                movie.categoryId
              ) || ''
            }`
          );

        return terms.every((term) =>
          searchable.includes(term)
        );
      }
    );
  }, [
    visibleCatalog,
    effectiveCategory,
    query,
    categoryNames,
  ]);

  const filterKey = JSON.stringify([
    activeProfile?.id,
    sourceKey,
    visibilitySourceKey,
    effectiveCategory,
    query,
    hiddenCategories.movies,
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

  const start =
    (page - 1) * PAGE_SIZE;

  const visibleMovies =
    filtered.slice(
      start,
      start + PAGE_SIZE
    );

  const firstLoading =
    catalog.data === null &&
    catalog.status !== 'error';

  const refreshing =
    catalog.status === 'loading';

  const hiddenMovieCount =
    movies.length -
    visibleCatalog.length;

  const allMoviesHidden =
    movies.length > 0 &&
    visibleCatalog.length === 0;

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

  function favoriteId(
    movie: CatalogMovie
  ): string {
    return JSON.stringify([
      'movie',
      sourceKey,
      movie.id,
    ]);
  }

  function makeFavorite(
    movie: CatalogMovie
  ): CatalogFavorite {
    return {
      id: favoriteId(movie),
      kind: 'movie',
      sourceKey,
      itemId: movie.id,
      name: movie.name,
      categoryId: movie.categoryId,
      categoryName:
        categoryNames.get(
          movie.categoryId
        ) || t('movies.noCategory'),
      poster: movie.poster,
      extension: movie.extension,
    };
  }

  async function openMovie(
    movie: CatalogMovie
  ) {
    if (
      !xtreamCredentials ||
      openingRef.current
    ) {
      return;
    }

    openingRef.current = true;

    const requestId =
      ++requestRef.current;

    const credentials =
      xtreamCredentials;

    setOpeningId(movie.id);
    setOpeningError('');

    try {
      let extension =
        cleanExtension(
          movie.extension
        );

      if (
        !/^[a-z0-9]+$/.test(
          extension
        )
      ) {
        const raw =
          await invoke<unknown>(
            'fetch_xtream_catalog',
            {
              ...credentials,
              action: 'get_vod_info',
              itemId: movie.id,
            }
          );

        if (
          requestId !==
          requestRef.current
        ) {
          return;
        }

        const root =
          asRecord(raw);

        const movieData =
          asRecord(
            root?.movie_data
          );

        extension =
          cleanExtension(
            movieData?.container_extension
          );
      }

      if (
        !/^[a-z0-9]+$/.test(
          extension
        )
      ) {
        throw new Error(
          t('movies.errorFormat')
        );
      }

      if (
        requestId !==
        requestRef.current
      ) {
        return;
      }

      const base =
        credentials.serverUrl
          .trim()
          .replace(/\/+$/, '');

      const streamUrl =
        `${base}/movie/` +
        `${encodeURIComponent(credentials.username)}/` +
        `${encodeURIComponent(credentials.password)}/` +
        `${encodeURIComponent(movie.id)}.${extension}`;

      const channel: Channel = {
        id:
          `vod-${encodeURIComponent(base)}-${movie.id}`,
        name: movie.name,
        category:
          categoryNames.get(
            movie.categoryId
          ) ||
          t('movies.noCategory'),
        description:
          t('movies.vodDescription'),
        logoColor: '#7c3aed',
        isLive: false,
        logoUrl:
          movie.poster || undefined,
        streamUrl,
        imported: true,
      };

      setSelectedChannel(channel);
      navigate('player', 'all');
    } catch (caught) {
      if (
        requestId ===
        requestRef.current
      ) {
        setOpeningError(
          errorMessage(
            caught,
            t('movies.errorPrepare')
          )
        );
      }
    } finally {
      if (
        requestId ===
        requestRef.current
      ) {
        openingRef.current = false;
        setOpeningId(null);
      }
    }
  }

  async function refreshCatalog() {
    setOpeningError('');

    try {
      await catalog.refresh();
    } catch (caught) {
      setOpeningError(
        errorMessage(
          caught,
          t('movies.catalogError')
        )
      );
    }
  }

  if (!xtreamCredentials) {
    return (
      <div className="min-h-full bg-surface-900 px-8 py-6">
        <div className="rounded-2xl border border-surface-700 bg-surface-800 p-10 text-center">
          <Film className="mx-auto mb-4 h-12 w-12 text-zinc-500" />

          <h2 className="text-lg font-semibold text-white">
            {t('movies.title')}
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            {t(
              'movies.connectHint'
            )}
          </p>

          <button
            type="button"
            onClick={() =>
              navigate(
                'settings',
                'import-playlist'
              )
            }
            className="mt-5 rounded-lg bg-accent-600 px-4 py-2 text-sm text-white hover:bg-accent-500"
          >
            {t(
              'movies.connectSource'
            )}
          </button>
        </div>
      </div>
    );
  }

  const paginationControls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-zinc-400">
        {filtered.length === 0
          ? t('movies.none')
          : `${start + 1}–${Math.min(
              start + PAGE_SIZE,
              filtered.length
            )} ${t('movies.rangeOf')} ${filtered.length} ${t('movies.moviesCount')}`}
      </span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            changePage(page - 1)
          }
          disabled={page === 1}
          className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-white hover:bg-surface-600 disabled:opacity-30"
        >
          {t(
            'movies.previous'
          )}
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
          className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-white hover:bg-surface-600 disabled:opacity-30"
        >
          {t('movies.next')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-surface-900 px-8 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-white">
            <Film className="h-5 w-5 shrink-0 text-accent-400" />

            <span className="truncate">
              {effectiveCategory
                ? categoryNames.get(
                    effectiveCategory
                  ) ||
                  t('movies.title')
                : t('movies.title')}
            </span>

            {catalog.data && (
              <span className="text-sm font-normal text-zinc-500">
                {filtered.length}
              </span>
            )}
          </h1>

          {refreshing &&
            catalog.data && (
              <p className="mt-1 text-xs text-zinc-500">
                {t(
                  'movies.refreshing'
                )}
              </p>
            )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={
              manageCategories
            }
            className="flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-800 px-3 py-2 text-xs text-zinc-400 hover:text-white"
          >
            <Eye className="h-3.5 w-3.5" />

            {t('nav.gerer_les_categories')}
          </button>

          <button
            type="button"
            onClick={() =>
              void refreshCatalog()
            }
            disabled={
              refreshing ||
              openingId !== null
            }
            className="flex items-center gap-2 rounded-lg bg-surface-700 px-3 py-2 text-xs text-zinc-200 hover:bg-surface-600 disabled:opacity-40"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                refreshing
                  ? 'animate-spin'
                  : ''
              }`}
            />

            {t(
              'movies.refresh'
            )}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="search"
          value={localSearch}
          onChange={(event) =>
            setLocalSearch(
              event.target.value
            )
          }
          aria-label={t(
            'movies.searchPlaceholder'
          )}
          placeholder={t(
            'movies.searchPlaceholder'
          )}
          className="min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-600"
        />

        <select
          aria-label={t(
            'movies.categoryLabel'
          )}
          value={
            effectiveCategory
          }
          onChange={(event) =>
            setActiveMovieCategory(
              event.target.value
            )
          }
          className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-zinc-200 sm:w-72"
        >
          <option value="">
            {t(
              'movies.allCategories'
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

      {hiddenMovieCount > 0 && (
        <button
          type="button"
          onClick={
            manageCategories
          }
          className="mb-5 flex items-center gap-2 text-xs text-zinc-500 hover:text-accent-300"
        >
          <EyeOff className="h-3.5 w-3.5" />

          {hiddenMovieCount}{' '}
          {t('movies.films_masques_par_vos_preferences')}
        </button>
      )}

      {catalog.error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-300"
        >
          <p>{catalog.error}</p>

          {catalog.data && (
            <p className="mt-2 text-xs">
              {t(
                'movies.errorKeepCatalog'
              )}
            </p>
          )}
        </div>
      )}

      {openingError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {openingError}
        </div>
      )}

      {firstLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-zinc-300">
          <Loader2 className="h-6 w-6 animate-spin" />

          {t(
            'movies.loadingCatalog'
          )}
        </div>
      ) : catalog.data ? (
        allMoviesHidden ? (
          <div className="rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-16 text-center">
            <EyeOff className="mx-auto mb-4 h-10 w-10 text-zinc-600" />

            <h2 className="text-base font-medium text-zinc-200">
              {t('movies.tous_les_films_sont_masques')}
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              {t('movies.reaffichez_une_categorie_dans_les_reglag')}
            </p>

            <button
              type="button"
              onClick={
                manageCategories
              }
              className="mt-5 rounded-xl bg-accent-600 px-4 py-2.5 text-sm text-white hover:bg-accent-500"
            >
              {t('nav.gerer_les_categories')}
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5">
              {
                paginationControls
              }
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {visibleMovies.map(
                (movie) => {
                  const favorite =
                    isCatalogFavorite(
                      favoriteId(movie)
                    );

                  const progress =
                    movieProgress.get(
                      movie.id
                    );

                  const watched =
                    Boolean(
                      progress?.completed
                    );

                  const started =
                    Boolean(
                      progress &&
                        !progress.completed &&
                        progress.position > 0
                    );

                  const percent =
                    watched
                      ? 100
                      : progress &&
                        progress.duration > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            (
                              progress.position /
                              progress.duration
                            ) * 100
                          )
                        )
                      : 0;

                  const positionLabel =
                    progress
                      ? formatPlaybackTime(
                          progress.position
                        )
                      : '';

                  const progressLabel =
                    progress &&
                    progress.duration > 0
                      ? `${positionLabel} / ${formatPlaybackTime(
                          progress.duration
                        )}`
                      : positionLabel;

                  return (
                    <article
                      key={movie.id}
                      className="relative overflow-hidden rounded-xl border border-surface-700 bg-surface-800 transition-colors hover:border-accent-500"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void openMovie(
                            movie
                          )
                        }
                        disabled={
                          openingId !==
                          null
                        }
                        aria-label={`${t('movies.open')} ${movie.name}`}
                        className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400 disabled:cursor-wait"
                      >
                        <div className="relative aspect-[2/3] overflow-hidden bg-surface-900">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="h-12 w-12 text-zinc-600" />
                          </div>

                          {movie.poster && (
                            <img
                              key={
                                movie.poster
                              }
                              src={
                                movie.poster
                              }
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(
                                event
                              ) => {
                                event.currentTarget.style.display =
                                  'none';
                              }}
                            />
                          )}

                          {watched && (
                            <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md border border-emerald-400/20 bg-black/80 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                              <Check className="h-3 w-3" />

                              {t('series.watched')}
                            </span>
                          )}

                          {started && (
                            <>
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" />

                              <span
                                title={
                                  progressLabel
                                }
                                className="absolute bottom-3 left-2 right-12 truncate text-[10px] font-medium text-white"
                              >
                                {t('movies.reprendre')}{' '}
                                {
                                  positionLabel
                                }
                              </span>
                            </>
                          )}

                          <span className="absolute bottom-3 right-2 rounded-full bg-black/75 p-2 text-white">
                            {openingId ===
                            movie.id ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Play className="h-5 w-5" />
                            )}
                          </span>

                          {started &&
                            progress &&
                            progress.duration >
                              0 && (
                              <div
                                role="progressbar"
                                aria-label={
                                  t('movies.progression_de', { name: movie.name })
                                }
                                aria-valuemin={
                                  0
                                }
                                aria-valuemax={
                                  100
                                }
                                aria-valuenow={Math.round(
                                  percent
                                )}
                                aria-valuetext={
                                  progressLabel
                                }
                                title={
                                  progressLabel
                                }
                                className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
                              >
                                <div
                                  className="h-full bg-accent-500"
                                  style={{
                                    width:
                                      `${percent}%`,
                                  }}
                                />
                              </div>
                            )}
                        </div>

                        <div className="p-3">
                          <h2
                            title={
                              movie.name
                            }
                            className="truncate text-sm font-medium text-white"
                          >
                            {movie.name}
                          </h2>

                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {categoryNames.get(
                              movie.categoryId
                            ) ||
                              t(
                                'movies.noCategory'
                              )}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleCatalogFavorite(
                            makeFavorite(
                              movie
                            )
                          )
                        }
                        aria-pressed={
                          favorite
                        }
                        aria-label={
                          favorite
                            ? `${t('movies.removeFavorite')} ${movie.name} ${t('movies.toFavorites')}`
                            : `${t('movies.addFavorite')} ${movie.name} ${t('movies.toFavorites')}`
                        }
                        className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg bg-black/75 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
                          favorite
                            ? 'text-red-500 hover:text-red-400'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            favorite
                              ? 'fill-current'
                              : ''
                          }`}
                        />
                      </button>
                    </article>
                  );
                }
              )}
            </div>

            {filtered.length ===
              0 && (
              <div className="py-16 text-center">
                <p className="text-sm text-zinc-400">
                  {t(
                    'movies.noMoviesAvailable'
                  )}
                </p>

                {hiddenMovieCount >
                  0 && (
                  <button
                    type="button"
                    onClick={
                      manageCategories
                    }
                    className="mt-4 text-xs text-accent-400 hover:text-accent-300"
                  >
                    {t('live.verifier_les_categories_masquees')}
                  </button>
                )}
              </div>
            )}

            <div className="mt-6">
              {
                paginationControls
              }
            </div>
          </>
        )
      ) : (
        <div className="rounded-xl border border-surface-700 bg-surface-800 p-6 text-center">
          <p className="text-sm text-zinc-400">
            {t(
              'movies.catalogError'
            )}
          </p>

          <button
            type="button"
            disabled={
              refreshing
            }
            onClick={() =>
              void refreshCatalog()
            }
            className="mt-4 rounded-lg bg-accent-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {t('movies.retry')}
          </button>
        </div>
      )}
    </div>
  );
}