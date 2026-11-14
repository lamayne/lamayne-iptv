import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  useApp,
  type CatalogFavorite,
} from '@/context/AppContext';
import type { Channel } from '@/types';
import {
  useSeriesCatalog,
  type CatalogCategory,
  type CatalogSeries,
} from '@/utils/xtreamCatalogCache';
import {
  Check,
  ChevronLeft,
  Clapperboard,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { errorText } from '@/i18n/backendErrors';

type JsonRecord = Record<string, unknown>;

type Episode = {
  id: string;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  containerExtension: string;
  plot: string;
};

type Season = {
  seasonNumber: number;
  episodes: Episode[];
};

type SeriesContext = {
  sourceKey: string;
  seriesId: string;
  seriesName: string;
  season: number;
  episode: number;
  episodeId: string;
  startPosition: number;
  previousChannel?: Channel;
  nextChannel?: Channel;
};

type SeriesChannel = Channel & {
  seriesContext?: SeriesContext;
};

type EpisodeProgressEntry = {
  season: number;
  episode: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number;
};

type EpisodeProgress = Record<
  string,
  EpisodeProgressEntry
>;

type SeriesProgressInfo = {
  entry: EpisodeProgressEntry;
  episodeId: string;
};

type SeriesDetailsState = {
  key: string;
  status: 'loading' | 'success' | 'error';
  seasons: Season[];
  error: string;
};

const PAGE_SIZE = 48;

const EMPTY_CATEGORIES:
  CatalogCategory[] = [];

const EMPTY_SERIES:
  CatalogSeries[] = [];

const EMPTY_SEASONS:
  Season[] = [];

const EPISODE_PROGRESS_KEY =
  'msp_episode_progress_v3';

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

function asArray(
  value: unknown
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function text(
  value: unknown
): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number'
    ? String(value)
    : '';
}

function numberOr(
  value: unknown,
  fallback: number
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : Number.parseInt(
          text(value),
          10
        );

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function cleanExtension(
  value: unknown
): string {
  return text(value)
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
}

function validExtension(
  value: string
): boolean {
  return /^[a-z0-9]+$/.test(value);
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

function loadProgress():
  EpisodeProgress {
  try {
    const raw =
      localStorage.getItem(
        EPISODE_PROGRESS_KEY
      );

    if (!raw) return {};

    const parsed =
      asRecord(JSON.parse(raw));

    if (!parsed) return {};

    const result:
      EpisodeProgress = {};

    for (const [key, value] of
      Object.entries(parsed)) {
      const row =
        asRecord(value);

      if (
        !row ||
        typeof row.season !==
          'number' ||
        !Number.isFinite(
          row.season
        ) ||
        typeof row.episode !==
          'number' ||
        !Number.isFinite(
          row.episode
        ) ||
        typeof row.positionSeconds !==
          'number' ||
        !Number.isFinite(
          row.positionSeconds
        ) ||
        row.positionSeconds < 0 ||
        typeof row.durationSeconds !==
          'number' ||
        !Number.isFinite(
          row.durationSeconds
        ) ||
        row.durationSeconds < 0 ||
        typeof row.completed !==
          'boolean' ||
        typeof row.updatedAt !==
          'number' ||
        !Number.isFinite(
          row.updatedAt
        )
      ) {
        continue;
      }

      result[key] = {
        season: row.season,
        episode: row.episode,
        positionSeconds:
          row.positionSeconds,
        durationSeconds:
          row.durationSeconds,
        completed: row.completed,
        updatedAt: row.updatedAt,
      };
    }

    return result;
  } catch {
    return {};
  }
}

function formatTime(
  seconds: number
): string {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return '0:00';
  }

  const total =
    Math.floor(seconds);

  const h =
    Math.floor(total / 3600);

  const m =
    Math.floor(
      (total % 3600) / 60
    );

  const s =
    total % 60;

  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function progressRatio(
  entry:
    EpisodeProgressEntry | null
): number {
  if (!entry) return 0;

  if (entry.completed) {
    return 100;
  }

  if (
    entry.durationSeconds <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      (
        entry.positionSeconds /
        entry.durationSeconds
      ) * 100
    )
  );
}

export default function Series() {
  const {
    xtreamCredentials,
    sourceKey,
    searchQuery,
    activeSeriesCategory,
    setActiveSeriesCategory,
    requestedSeriesId,
    setRequestedSeriesId,
    returnFromPlayer,
    peekReturn,
    navigate,
    toggleCatalogFavorite,
    isCatalogFavorite,
    setSelectedChannel,
    activeProfile,
    t,
    isCategoryHidden,
    hiddenCategories,
    visibilitySourceKey,
  } = useApp();

  const catalog =
    useSeriesCatalog(
      xtreamCredentials
    );

  const seriesList =
    catalog.data?.series ??
    EMPTY_SERIES;

  const allCategories =
    catalog.data?.categories ??
    EMPTY_CATEGORIES;

  const [
    localSearch,
    setLocalSearch,
  ] = useState('');

  const [
    activeSeason,
    setActiveSeason,
  ] = useState(1);

  const [
    actionError,
    setActionError,
  ] = useState('');

  const [
    openingEpisode,
    setOpeningEpisode,
  ] = useState<string | null>(null);

  const [
    progress,
    setProgress,
  ] = useState<EpisodeProgress>(
    loadProgress
  );

  const [
    detailsState,
    setDetailsState,
  ] = useState<SeriesDetailsState>({
    key: '',
    status: 'success',
    seasons: EMPTY_SEASONS,
    error: '',
  });

  const [
    detailsReload,
    setDetailsReload,
  ] = useState(0);

  const [
    pagination,
    setPagination,
  ] = useState({
    key: '',
    page: 1,
  });

  const detailsRequestRef =
    useRef(0);

  const playRequestRef =
    useRef(0);

  // Vrai quand la série a été ouverte depuis la liste de cette page.
  const openedHereRef =
    useRef(false);

  const playingRef =
    useRef(false);

  const seriesProgressMap =
    useMemo(() => {
      const map = new Map<
        string,
        SeriesProgressInfo
      >();

      for (const [key, entry] of
        Object.entries(progress)) {
        try {
          const parsed: unknown =
            JSON.parse(key);

          if (
            !Array.isArray(parsed) ||
            parsed.length !== 3 ||
            parsed[0] !== sourceKey ||
            typeof parsed[1] !==
              'string' ||
            typeof parsed[2] !==
              'string'
          ) {
            continue;
          }

          const seriesId =
            parsed[1];

          const episodeId =
            parsed[2];

          const current =
            map.get(seriesId);

          if (
            !current ||
            entry.updatedAt >
              current.entry.updatedAt
          ) {
            map.set(
              seriesId,
              {
                entry,
                episodeId,
              }
            );
          }
        } catch {
          // Une clé invalide est ignorée.
        }
      }

      return map;
    }, [
      progress,
      sourceKey,
    ]);

  const selectedSeries =
    useMemo(() => {
      if (!requestedSeriesId) {
        return null;
      }

      return (
        seriesList.find(
          (item) =>
            item.id ===
              requestedSeriesId &&
            !isCategoryHidden(
              'series',
              item.categoryId
            )
        ) ?? null
      );
    }, [
      seriesList,
      requestedSeriesId,
      isCategoryHidden,
    ]);

  const detailsKey =
    JSON.stringify([
      activeProfile?.id,
      sourceKey,
      selectedSeries?.id ?? '',
    ]);

  const seasons =
    selectedSeries &&
    detailsState.key ===
      detailsKey
      ? detailsState.seasons
      : EMPTY_SEASONS;

  const loadingDetails =
    Boolean(selectedSeries) &&
    (
      detailsState.key !==
        detailsKey ||
      detailsState.status ===
        'loading'
    );

  const detailsError =
    detailsState.key ===
    detailsKey
      ? detailsState.error
      : '';

  const currentSeason =
    seasons.find(
      (season) =>
        season.seasonNumber ===
        activeSeason
    );

  useEffect(() => {
    function update() {
      setProgress(
        loadProgress()
      );
    }

    function onStorage(
      event: StorageEvent
    ) {
      if (
        event.key === null ||
        event.key ===
          EPISODE_PROGRESS_KEY
      ) {
        update();
      }
    }

    const interval =
      window.setInterval(
        update,
        3000
      );

    window.addEventListener(
      'storage',
      onStorage
    );

    window.addEventListener(
      'focus',
      update
    );

    return () => {
      window.clearInterval(
        interval
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
  }, []);

  useEffect(() => {
    setLocalSearch('');
    setPagination({
      key: '',
      page: 1,
    });
    setActionError('');
  }, [
    sourceKey,
    activeProfile?.id,
  ]);

  useEffect(() => {
    if (
      !requestedSeriesId
    ) {
      return;
    }

    const requested =
      seriesList.find(
        (item) =>
          item.id ===
          requestedSeriesId
      );

    if (
      requested &&
      isCategoryHidden(
        'series',
        requested.categoryId
      )
    ) {
      setRequestedSeriesId(
        null
      );
    }
  }, [
    requestedSeriesId,
    seriesList,
    isCategoryHidden,
    setRequestedSeriesId,
  ]);

  useEffect(() => {
    playRequestRef.current += 1;
    playingRef.current = false;
    setOpeningEpisode(null);
    setActionError('');

    return () => {
      playRequestRef.current += 1;
      playingRef.current = false;
    };
  }, [
    detailsKey,
    xtreamCredentials,
  ]);

  useEffect(() => {
    const requestId =
      ++detailsRequestRef.current;

    if (
      !selectedSeries ||
      !xtreamCredentials
    ) {
      return;
    }

    let cancelled = false;

    const itemId =
      selectedSeries.id;

    const credentials =
      xtreamCredentials;

    setDetailsState({
      key: detailsKey,
      status: 'loading',
      seasons: EMPTY_SEASONS,
      error: '',
    });

    async function loadDetails() {
      try {
        const raw =
          await invoke<unknown>(
            'fetch_xtream_catalog',
            {
              ...credentials,
              action:
                'get_series_info',
              itemId,
            }
          );

        if (
          cancelled ||
          requestId !==
            detailsRequestRef.current
        ) {
          return;
        }

        const root =
          asRecord(raw);

        const episodesRoot =
          asRecord(
            root?.episodes
          );

        const parsedSeasons:
          Season[] = [];

        for (const [
          seasonKey,
          value,
        ] of Object.entries(
          episodesRoot ?? {}
        )) {
          const seasonNumber =
            numberOr(
              seasonKey,
              0
            );

          const episodes:
            Episode[] = [];

          for (const episodeValue of
            asArray(value)) {
            const row =
              asRecord(
                episodeValue
              );

            if (!row) {
              continue;
            }

            const id =
              text(row.id);

            if (!id) {
              continue;
            }

            const info =
              asRecord(
                row.info
              );

            const episodeNumber =
              numberOr(
                row.episode_num,
                0
              );

            episodes.push({
              id,
              title:
                text(row.title) ||
                `${t('series.episode')} ${episodeNumber}`,
              episodeNumber,
              seasonNumber,
              containerExtension:
                cleanExtension(
                  row.container_extension
                ),
              plot:
                text(info?.plot),
            });
          }

          if (
            episodes.length > 0
          ) {
            episodes.sort(
              (a, b) =>
                a.episodeNumber -
                b.episodeNumber
            );

            parsedSeasons.push({
              seasonNumber,
              episodes,
            });
          }
        }

        if (
          parsedSeasons.length ===
          0
        ) {
          throw new Error(
            t(
              'series.errorNoEpisodes'
            )
          );
        }

        parsedSeasons.sort(
          (a, b) =>
            a.seasonNumber -
            b.seasonNumber
        );

        if (
          cancelled ||
          requestId !==
            detailsRequestRef.current
        ) {
          return;
        }

        const latest =
          seriesProgressMap.get(
            itemId
          );

        const latestEpisode =
          latest
            ? parsedSeasons
                .flatMap(
                  (season) =>
                    season.episodes
                )
                .find(
                  (episode) =>
                    episode.id ===
                    latest.episodeId
                )
            : undefined;

        setActiveSeason(
          latestEpisode?.seasonNumber ??
            parsedSeasons[0]
              .seasonNumber
        );

        setDetailsState({
          key: detailsKey,
          status: 'success',
          seasons:
            parsedSeasons,
          error: '',
        });
      } catch (caught) {
        if (
          cancelled ||
          requestId !==
            detailsRequestRef.current
        ) {
          return;
        }

        setDetailsState({
          key: detailsKey,
          status: 'error',
          seasons:
            EMPTY_SEASONS,
          error:
            errorMessage(
              caught,
              t(
                'series.errorLoadEpisodes'
              )
            ),
        });
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };

    // La progression ne doit pas relancer le téléchargement
    // des épisodes à chaque mise à jour de la sauvegarde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detailsKey,
    xtreamCredentials,
    detailsReload,
    t,
  ]);

  const categoryNames =
    useMemo(
      () =>
        new Map(
          allCategories.map(
            (category) => [
              category.id,
              category.name,
            ]
          )
        ),
      [allCategories]
    );

  const categories =
    useMemo(
      () =>
        allCategories.filter(
          (category) =>
            !isCategoryHidden(
              'series',
              category.id
            )
        ),
      [
        allCategories,
        isCategoryHidden,
      ]
    );

  const visibleCatalog =
    useMemo(
      () =>
        seriesList.filter(
          (item) =>
            !isCategoryHidden(
              'series',
              item.categoryId
            )
        ),
      [
        seriesList,
        isCategoryHidden,
      ]
    );

  const effectiveCategory =
    activeSeriesCategory &&
    !isCategoryHidden(
      'series',
      activeSeriesCategory
    )
      ? activeSeriesCategory
      : '';

  const query =
    normalizeSearch(
      `${searchQuery} ${localSearch}`
    );

  const filtered =
    useMemo(() => {
      const terms =
        query
          .split(' ')
          .filter(Boolean);

      return visibleCatalog.filter(
        (item) => {
          if (
            effectiveCategory &&
            item.categoryId !==
              effectiveCategory
          ) {
            return false;
          }

          const searchable =
            normalizeSearch(
              `${item.name} ${
                categoryNames.get(
                  item.categoryId
                ) || ''
              }`
            );

          return terms.every(
            (term) =>
              searchable.includes(
                term
              )
          );
        }
      );
    }, [
      visibleCatalog,
      effectiveCategory,
      query,
      categoryNames,
    ]);

  const filterKey =
    JSON.stringify([
      activeProfile?.id,
      sourceKey,
      visibilitySourceKey,
      effectiveCategory,
      query,
      hiddenCategories.series,
    ]);

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
          PAGE_SIZE
      )
    );

  const page =
    pagination.key ===
    filterKey
      ? Math.min(
          pagination.page,
          pageCount
        )
      : 1;

  const start =
    (page - 1) *
    PAGE_SIZE;

  const visibleSeries =
    filtered.slice(
      start,
      start + PAGE_SIZE
    );

  const firstLoading =
    catalog.data === null &&
    catalog.status !==
      'error';

  const refreshing =
    catalog.status ===
    'loading';

  const hiddenSeriesCount =
    seriesList.length -
    visibleCatalog.length;

  const allSeriesHidden =
    seriesList.length > 0 &&
    visibleCatalog.length === 0;

  const latestSeriesProgress =
    selectedSeries
      ? seriesProgressMap.get(
          selectedSeries.id
        )
      : undefined;

  const resumeEpisode =
    latestSeriesProgress &&
    !latestSeriesProgress.entry
      .completed &&
    latestSeriesProgress.entry
      .positionSeconds > 0
      ? seasons
          .flatMap(
            (season) =>
              season.episodes
          )
          .find(
            (episode) =>
              episode.id ===
              latestSeriesProgress
                .episodeId
          ) ?? null
      : null;

  function episodeProgress(
    episode: Episode
  ): EpisodeProgressEntry | null {
    if (!selectedSeries) {
      return null;
    }

    const key =
      JSON.stringify([
        sourceKey,
        selectedSeries.id,
        episode.id,
      ]);

    return (
      progress[key] ?? null
    );
  }

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
    item: CatalogSeries
  ): string {
    return JSON.stringify([
      'series',
      sourceKey,
      item.id,
    ]);
  }

  function makeFavorite(
    item: CatalogSeries
  ): CatalogFavorite {
    return {
      id: favoriteId(item),
      kind: 'series',
      sourceKey,
      itemId: item.id,
      name: item.name,
      categoryId:
        item.categoryId,
      categoryName:
        categoryNames.get(
          item.categoryId
        ) ||
        t('series.noCategory'),
      poster: item.cover,
      plot: item.plot,
      year: item.year,
      rating: item.rating,
    };
  }

  function openSeries(
    item: CatalogSeries
  ) {
    if (
      isCategoryHidden(
        'series',
        item.categoryId
      )
    ) {
      return;
    }

    setActionError('');
    openedHereRef.current = true;
    setRequestedSeriesId(
      item.id
    );
  }

  function closeDetails() {
    detailsRequestRef.current += 1;
    playRequestRef.current += 1;
    playingRef.current = false;

    // Série ouverte depuis une autre page (accueil, recherche, favoris) :
    // « Retour » y ramène, avec la recherche conservée.
    const cameFromElsewhere =
      !openedHereRef.current && peekReturn() !== null;

    openedHereRef.current = false;

    setRequestedSeriesId(null);
    setOpeningEpisode(null);
    setActiveSeason(1);
    setActionError('');

    if (cameFromElsewhere) returnFromPlayer('series', 'all');
  }

  async function playEpisode(
    episode: Episode,
    startPosition = 0
  ) {
    if (
      !xtreamCredentials ||
      !selectedSeries ||
      playingRef.current
    ) {
      return;
    }

    playingRef.current = true;

    const requestId =
      ++playRequestRef.current;

    const credentials =
      xtreamCredentials;

    const series =
      selectedSeries;

    setOpeningEpisode(
      episode.id
    );
    setActionError('');

    try {
      let extension =
        episode.containerExtension;

      if (
        !validExtension(
          extension
        )
      ) {
        const raw =
          await invoke<unknown>(
            'fetch_xtream_catalog',
            {
              ...credentials,
              action:
                'get_vod_info',
              itemId:
                episode.id,
            }
          );

        if (
          requestId !==
          playRequestRef.current
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
        !validExtension(
          extension
        )
      ) {
        throw new Error(
          t(
            'series.errorFormat'
          )
        );
      }

      if (
        requestId !==
        playRequestRef.current
      ) {
        return;
      }

      const base =
        credentials.serverUrl
          .trim()
          .replace(/\/+$/, '');

      const episodes =
        seasons.find(
          (season) =>
            season.seasonNumber ===
            episode.seasonNumber
        )?.episodes ?? [
          episode,
        ];

      const channelByEpisodeId =
        new Map<
          string,
          SeriesChannel
        >();

      for (const target of
        episodes) {
        const targetExtension =
          target.id ===
          episode.id
            ? extension
            : target
                .containerExtension;

        if (
          !validExtension(
            targetExtension
          )
        ) {
          continue;
        }

        const channel:
          SeriesChannel = {
          id:
            `series-${encodeURIComponent(base)}-${target.id}`,
          name:
            `${series.name} — S${target.seasonNumber}E${target.episodeNumber}`,
          category:
            categoryNames.get(
              series.categoryId
            ) ||
            t(
              'series.categoryFallback'
            ),
          description:
            target.plot ||
            series.plot ||
            t(
              'series.episodeDescription'
            ),
          logoColor:
            '#7c3aed',
          isLive: false,
          logoUrl:
            series.cover ||
            undefined,
          streamUrl:
            `${base}/series/` +
            `${encodeURIComponent(credentials.username)}/` +
            `${encodeURIComponent(credentials.password)}/` +
            `${encodeURIComponent(target.id)}.${targetExtension}`,
          imported: true,
        };

        channelByEpisodeId.set(
          target.id,
          channel
        );
      }

      for (
        let index = 0;
        index < episodes.length;
        index++
      ) {
        const target =
          episodes[index];

        const channel =
          channelByEpisodeId.get(
            target.id
          );

        if (!channel) {
          continue;
        }

        channel.seriesContext = {
          sourceKey,
          seriesId:
            series.id,
          seriesName:
            series.name,
          season:
            target.seasonNumber,
          episode:
            target.episodeNumber,
          episodeId:
            target.id,
          startPosition:
            target.id ===
            episode.id
              ? startPosition
              : 0,
          previousChannel:
            index > 0
              ? channelByEpisodeId.get(
                  episodes[
                    index - 1
                  ].id
                )
              : undefined,
          nextChannel:
            index <
            episodes.length - 1
              ? channelByEpisodeId.get(
                  episodes[
                    index + 1
                  ].id
                )
              : undefined,
        };
      }

      const channel =
        channelByEpisodeId.get(
          episode.id
        );

      if (!channel) {
        throw new Error(
          t(
            'series.errorPlay'
          )
        );
      }

      if (
        requestId !==
        playRequestRef.current
      ) {
        return;
      }

      setSelectedChannel(
        channel
      );
      navigate(
        'player',
        'all'
      );
    } catch (caught) {
      if (
        requestId ===
        playRequestRef.current
      ) {
        setActionError(
          errorMessage(
            caught,
            t(
              'series.errorPlay'
            )
          )
        );
      }
    } finally {
      if (
        requestId ===
        playRequestRef.current
      ) {
        playingRef.current =
          false;

        setOpeningEpisode(
          null
        );
      }
    }
  }

  async function refreshCatalog() {
    setActionError('');

    try {
      await catalog.refresh();
    } catch (caught) {
      setActionError(
        errorMessage(
          caught,
          t(
            'series.catalogError'
          )
        )
      );
    }
  }

  if (!xtreamCredentials) {
    return (
      <div className="min-h-full bg-surface-900 px-8 py-6">
        <div className="rounded-2xl border border-surface-700 bg-surface-800 p-10 text-center">
          <Clapperboard className="mx-auto mb-4 h-12 w-12 text-zinc-500" />

          <h2 className="text-lg font-semibold text-white">
            {t(
              'series.title'
            )}
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            {t(
              'series.connectHint'
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
              'series.connectSource'
            )}
          </button>
        </div>
      </div>
    );
  }

  if (selectedSeries) {
    const favorite =
      isCatalogFavorite(
        favoriteId(
          selectedSeries
        )
      );

    return (
      <div className="min-h-full bg-surface-900 px-8 py-6">
        <button
          type="button"
          onClick={
            closeDetails
          }
          data-nav-back
          className="mb-5 flex items-center gap-2 rounded-lg bg-surface-800 px-3 py-2 text-sm text-zinc-300 hover:bg-surface-700"
        >
          <ChevronLeft className="h-4 w-4" />

          {t(
            'series.back'
          )}
        </button>

        <div className="mb-6 flex flex-col gap-6 md:flex-row">
          <div className="w-full max-w-56 shrink-0 overflow-hidden rounded-xl bg-surface-800">
            <div className="relative aspect-[2/3]">
              <div className="absolute inset-0 flex items-center justify-center">
                <Clapperboard className="h-12 w-12 text-zinc-600" />
              </div>

              {selectedSeries.cover && (
                <img
                  key={
                    selectedSeries.cover
                  }
                  src={
                    selectedSeries.cover
                  }
                  alt=""
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
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-white">
              {
                selectedSeries.name
              }
            </h1>

            <p className="mt-1 text-sm text-zinc-500">
              {categoryNames.get(
                selectedSeries.categoryId
              ) ||
                t(
                  'series.noCategory'
                )}

              {selectedSeries.year
                ? ` · ${selectedSeries.year}`
                : ''}

              {selectedSeries.rating
                ? ` · ${t('series.rating')} ${selectedSeries.rating}`
                : ''}
            </p>

            {selectedSeries.plot && (
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300">
                {
                  selectedSeries.plot
                }
              </p>
            )}

            {(detailsError ||
              actionError) && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-red-800 bg-red-950/30 p-4 text-sm text-red-300"
              >
                <p>
                  {actionError ||
                    detailsError}
                </p>

                {detailsError && (
                  <button
                    type="button"
                    onClick={() =>
                      setDetailsReload(
                        (value) =>
                          value + 1
                      )
                    }
                    className="mt-3 rounded-lg bg-surface-700 px-3 py-2 text-xs text-white"
                  >
                    {t(
                      'series.retry'
                    )}
                  </button>
                )}
              </div>
            )}

            {loadingDetails ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />

                {t(
                  'series.loadingEpisodes'
                )}
              </p>
            ) : seasons.length >
              0 ? (
              <>
                {resumeEpisode &&
                  latestSeriesProgress && (
                    <button
                      type="button"
                      disabled={
                        openingEpisode !==
                        null
                      }
                      onClick={() =>
                        void playEpisode(
                          resumeEpisode,
                          latestSeriesProgress
                            .entry
                            .positionSeconds
                        )
                      }
                      className="mt-5 flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-3 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-40"
                    >
                      {openingEpisode ===
                      resumeEpisode.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}

                      {t('movies.reprendre')}{' '}
                      S
                      {
                        resumeEpisode.seasonNumber
                      }
                      E
                      {
                        resumeEpisode.episodeNumber
                      }
                      {' · '}
                      {formatTime(
                        latestSeriesProgress
                          .entry
                          .positionSeconds
                      )}
                    </button>
                  )}

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {seasons.map(
                    (season) => (
                      <button
                        key={
                          season.seasonNumber
                        }
                        type="button"
                        onClick={() =>
                          setActiveSeason(
                            season.seasonNumber
                          )
                        }
                        aria-pressed={
                          activeSeason ===
                          season.seasonNumber
                        }
                        className={`rounded-lg px-3 py-2 text-sm ${
                          activeSeason ===
                          season.seasonNumber
                            ? 'bg-accent-600 text-white'
                            : 'bg-surface-800 text-zinc-300 hover:bg-surface-700'
                        }`}
                      >
                        {t(
                          'series.season'
                        )}{' '}
                        {
                          season.seasonNumber
                        }
                      </button>
                    )
                  )}
                </div>

                <div className="mt-5 grid gap-3">
                  {currentSeason?.episodes.map(
                    (episode) => {
                      const entry =
                        episodeProgress(
                          episode
                        );

                      const ratio =
                        progressRatio(
                          entry
                        );

                      const watched =
                        Boolean(
                          entry?.completed
                        );

                      const started =
                        Boolean(
                          entry &&
                            !entry.completed &&
                            entry.positionSeconds >
                              0
                        );

                      const isResume =
                        resumeEpisode?.id ===
                        episode.id;

                      return (
                        <button
                          key={
                            episode.id
                          }
                          type="button"
                          onClick={() =>
                            void playEpisode(
                              episode,
                              started
                                ? entry?.positionSeconds ??
                                    0
                                : 0
                            )
                          }
                          disabled={
                            openingEpisode !==
                            null
                          }
                          className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 disabled:opacity-60 ${
                            isResume
                              ? 'border-accent-500 bg-accent-600/10'
                              : 'border-surface-700 bg-surface-800 hover:border-accent-500'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-white">
                                E
                                {
                                  episode.episodeNumber
                                }
                                {' · '}
                                {
                                  episode.title
                                }
                              </span>

                              {watched && (
                                <span className="mt-1 flex items-center gap-1 text-xs text-emerald-400">
                                  <Check className="h-3 w-3" />

                                  {t(
                                    'series.watched'
                                  )}
                                </span>
                              )}

                              {started && (
                                <span className="mt-1 block text-xs text-accent-300">
                                  {t(
                                    'series.resumeAt'
                                  )}{' '}
                                  {formatTime(
                                    entry?.positionSeconds ??
                                      0
                                  )}
                                </span>
                              )}
                            </span>

                            <span className="shrink-0 text-white">
                              {openingEpisode ===
                              episode.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <Play className="h-5 w-5" />
                              )}
                            </span>
                          </div>

                          {entry &&
                            entry.durationSeconds >
                              0 &&
                            ratio > 0 && (
                              <div className="mt-3">
                                <div
                                  role="progressbar"
                                  aria-label={
                                    t('series.progression_de_l_episode')
                                  }
                                  aria-valuemin={
                                    0
                                  }
                                  aria-valuemax={
                                    100
                                  }
                                  aria-valuenow={Math.round(
                                    ratio
                                  )}
                                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface-700"
                                >
                                  <div
                                    className={`h-full rounded-full ${
                                      watched
                                        ? 'bg-emerald-500'
                                        : 'bg-accent-500'
                                    }`}
                                    style={{
                                      width:
                                        `${ratio}%`,
                                    }}
                                  />
                                </div>

                                <p className="mt-1 text-[11px] text-zinc-500">
                                  {formatTime(
                                    entry.positionSeconds
                                  )}
                                  {' / '}
                                  {formatTime(
                                    entry.durationSeconds
                                  )}
                                  {' · '}
                                  {Math.round(
                                    ratio
                                  )}
                                  {' %'}
                                </p>
                              </div>
                            )}
                        </button>
                      );
                    }
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm text-zinc-400">
                {t(
                  'series.noEpisodes'
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              toggleCatalogFavorite(
                makeFavorite(
                  selectedSeries
                )
              )
            }
            aria-pressed={
              favorite
            }
            aria-label={
              favorite
                ? `${t('series.removeFavorite')} ${selectedSeries.name}`
                : `${t('series.addFavorite')} ${selectedSeries.name}`
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-800 text-zinc-300 hover:text-white"
          >
            <Heart
              className={`h-5 w-5 ${
                favorite
                  ? 'fill-red-500 text-red-500'
                  : ''
              }`}
            />
          </button>
        </div>
      </div>
    );
  }

  const paginationControls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-zinc-400">
        {filtered.length === 0
          ? t('series.none')
          : `${start + 1}–${Math.min(
              start + PAGE_SIZE,
              filtered.length
            )} ${t('series.rangeOf')} ${filtered.length} ${t('series.seriesCount')}`}
      </span>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            changePage(page - 1)
          }
          disabled={
            page === 1
          }
          className="rounded-lg bg-surface-700 px-3 py-2 text-xs text-white hover:bg-surface-600 disabled:opacity-30"
        >
          {t(
            'series.previous'
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
          {t(
            'series.next'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-surface-900 px-8 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-white">
            <Clapperboard className="h-5 w-5 shrink-0 text-accent-400" />

            <span className="truncate">
              {effectiveCategory
                ? categoryNames.get(
                    effectiveCategory
                  ) ||
                  t(
                    'series.categoryFallback'
                  )
                : t(
                    'series.categoryFallback'
                  )}
            </span>

            {catalog.data && (
              <span className="text-sm font-normal text-zinc-500">
                {
                  filtered.length
                }
              </span>
            )}
          </h1>

          {refreshing &&
            catalog.data && (
              <p className="mt-1 text-xs text-zinc-500">
                {t(
                  'series.refreshing'
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
              refreshing
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
              'series.refresh'
            )}
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="search"
          value={
            localSearch
          }
          onChange={(event) =>
            setLocalSearch(
              event.target.value
            )
          }
          aria-label={t(
            'series.searchPlaceholder'
          )}
          placeholder={t(
            'series.searchPlaceholder'
          )}
          className="min-w-0 flex-1 rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white outline-none focus:border-accent-600"
        />

        <select
          aria-label={t(
            'series.categoryLabel'
          )}
          value={
            effectiveCategory
          }
          onChange={(event) =>
            setActiveSeriesCategory(
              event.target.value
            )
          }
          className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-zinc-200 sm:w-72"
        >
          <option value="">
            {t(
              'series.allCategories'
            )}
          </option>

          {categories.map(
            (category) => (
              <option
                key={
                  category.id
                }
                value={
                  category.id
                }
              >
                {
                  category.name
                }
              </option>
            )
          )}
        </select>
      </div>

      {hiddenSeriesCount >
        0 && (
        <button
          type="button"
          onClick={
            manageCategories
          }
          className="mb-5 flex items-center gap-2 text-xs text-zinc-500 hover:text-accent-300"
        >
          <EyeOff className="h-3.5 w-3.5" />

          {hiddenSeriesCount}{' '}
          {t('series.series_masquees_par_vos_preferences')}
        </button>
      )}

      {catalog.error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-300"
        >
          <p>
            {
              catalog.error
            }
          </p>

          {catalog.data && (
            <p className="mt-2 text-xs">
              {t(
                'series.errorKeepCatalog'
              )}
            </p>
          )}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-800 bg-red-950/20 p-4 text-sm text-red-300"
        >
          {actionError}
        </div>
      )}

      {firstLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-zinc-300">
          <Loader2 className="h-6 w-6 animate-spin" />

          {t(
            'series.loadingCatalog'
          )}
        </div>
      ) : catalog.data ? (
        allSeriesHidden ? (
          <div className="rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-16 text-center">
            <EyeOff className="mx-auto mb-4 h-10 w-10 text-zinc-600" />

            <h2 className="text-base font-medium text-zinc-200">
              {t('series.toutes_les_series_sont_masquees')}
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
              {visibleSeries.map(
                (item) => {
                  const favorite =
                    isCatalogFavorite(
                      favoriteId(
                        item
                      )
                    );

                  const seriesProgress =
                    seriesProgressMap.get(
                      item.id
                    );

                  const entry =
                    seriesProgress?.entry ??
                    null;

                  const watched =
                    Boolean(
                      entry?.completed
                    );

                  const started =
                    Boolean(
                      entry &&
                        !entry.completed &&
                        entry.positionSeconds >
                          0
                    );

                  const ratio =
                    progressRatio(
                      entry
                    );

                  return (
                    <article
                      key={item.id}
                      className="relative overflow-hidden rounded-xl border border-surface-700 bg-surface-800 transition-colors hover:border-accent-500"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          openSeries(
                            item
                          )
                        }
                        aria-label={`${t('series.open')} ${item.name}`}
                        className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400"
                      >
                        <div className="relative aspect-[2/3] overflow-hidden bg-surface-900">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Clapperboard className="h-12 w-12 text-zinc-600" />
                          </div>

                          {item.cover && (
                            <img
                              key={
                                item.cover
                              }
                              src={
                                item.cover
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

                          {(started ||
                            watched) && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/95 to-transparent" />
                          )}

                          {entry &&
                            watched && (
                              <span className="absolute bottom-3 left-2 right-11 flex items-center gap-1 text-[10px] font-medium text-emerald-300">
                                <Check className="h-3 w-3 shrink-0" />

                                <span className="truncate">
                                  S
                                  {
                                    entry.season
                                  }
                                  E
                                  {
                                    entry.episode
                                  }
                                  {' · '}
                                  {t(
                                    'series.watched'
                                  )}
                                </span>
                              </span>
                            )}

                          {entry &&
                            started && (
                              <span className="absolute bottom-3 left-2 right-11 truncate text-[10px] font-medium text-white">
                                {t('movies.reprendre')}{' '}
                                S
                                {
                                  entry.season
                                }
                                E
                                {
                                  entry.episode
                                }
                                {' · '}
                                {formatTime(
                                  entry.positionSeconds
                                )}
                              </span>
                            )}

                          <span className="absolute bottom-3 right-2 rounded-full bg-black/70 p-2 text-white">
                            <Play className="h-5 w-5" />
                          </span>

                          {entry &&
                            started &&
                            entry.durationSeconds >
                              0 && (
                              <div
                                role="progressbar"
                                aria-label={
                                  t('series.progression_du_dernier_episode_de', { name: item.name })
                                }
                                aria-valuemin={
                                  0
                                }
                                aria-valuemax={
                                  100
                                }
                                aria-valuenow={Math.round(
                                  ratio
                                )}
                                className="absolute inset-x-0 bottom-0 h-1 bg-white/20"
                              >
                                <div
                                  className="h-full bg-accent-500"
                                  style={{
                                    width:
                                      `${ratio}%`,
                                  }}
                                />
                              </div>
                            )}
                        </div>

                        <div className="p-3">
                          <h2
                            title={
                              item.name
                            }
                            className="truncate text-sm font-medium text-white"
                          >
                            {
                              item.name
                            }
                          </h2>

                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {categoryNames.get(
                              item.categoryId
                            ) ||
                              t(
                                'series.noCategory'
                              )}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          toggleCatalogFavorite(
                            makeFavorite(
                              item
                            )
                          )
                        }
                        aria-pressed={
                          favorite
                        }
                        aria-label={
                          favorite
                            ? `${t('series.removeFavorite')} ${item.name} ${t('series.toFavorites')}`
                            : `${t('series.addFavorite')} ${item.name} ${t('series.toFavorites')}`
                        }
                        className={`absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
                          favorite
                            ? 'text-red-500'
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
                    'series.noSeriesAvailable'
                  )}
                </p>

                {hiddenSeriesCount >
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
              'series.catalogError'
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
            {t(
              'series.retry'
            )}
          </button>
        </div>
      )}
    </div>
  );
}