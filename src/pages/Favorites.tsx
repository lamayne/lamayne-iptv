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
import ChannelCard from '@/components/ChannelCard';
import SmartImage from '@/components/SmartImage';
import { useSeriesBasics } from '@/utils/seriesProgress';
import {
  useMovieCatalog,
  useSeriesCatalog,
} from '@/utils/xtreamCatalogCache';
import {
  Heart,
  Tv,
  Film,
  Clapperboard,
  Play,
  Loader2,
  RefreshCw,
} from 'lucide-react';


const TABS = [
  {
    sub: 'channels' as const,
    labelKey: 'favorites.channels',
    icon: Tv,
  },
  {
    sub: 'movies' as const,
    labelKey: 'favorites.movies',
    icon: Film,
  },
  {
    sub: 'series' as const,
    labelKey: 'favorites.series',
    icon: Clapperboard,
  },
];


function asRecord(
  value: unknown
): Record<string, unknown> | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}


function cleanExtension(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/^\./, '').toLowerCase()
    : '';
}


function FavoritePoster({
  src,
  title,
  kind,
  loadingCatalog,
  eager,
  t,
}: {
  src: string;
  title: string;
  kind: 'movie' | 'series';
  loadingCatalog: boolean;
  eager: boolean;
  t: (key: string) => string;
}) {
  const [failedSrc, setFailedSrc] = useState('');
  const [loadedSrc, setLoadedSrc] = useState('');


  const Icon = kind === 'series' ? Clapperboard : Film;
  const failed = Boolean(src) && failedSrc === src;
  const loadingImage =
    Boolean(src) && !failed && loadedSrc !== src;


  return (
    <div className="relative aspect-[2/3] overflow-hidden bg-surface-900">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
        {loadingCatalog || loadingImage ? (
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
        ) : (
          <Icon className="h-12 w-12 text-zinc-600" />
        )}


        {!src && !loadingCatalog && (
          <span className="line-clamp-3 text-center text-xs text-zinc-500">
            {title}
          </span>
        )}


        {failed && (
          <span className="text-center text-xs text-zinc-500">
            {t('favorites.posterUnavailable')}
          </span>
        )}
      </div>


      {src && !failed && (
        <SmartImage
          key={src}
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          className="absolute inset-0 h-full w-full object-cover"
          onLoad={() => setLoadedSrc(src)}
          onFailed={() => setFailedSrc(src)}
        />
      )}
    </div>
  );
}


export default function Favorites() {
  const {
    favorites,
    importedChannels,
    activeSubPage,
    activeProfile,
    navigate,
    catalogFavorites,
    toggleCatalogFavorite,
    sourceKey,
    xtreamCredentials,
    xtreamConnectionStatus,
    setRequestedSeriesId,
    setActiveSeriesCategory,
    setSelectedChannel,
    showToast,
    t,
  } = useApp();


  const movieCatalog = useMovieCatalog(xtreamCredentials);
  const seriesCatalog = useSeriesCatalog(xtreamCredentials);


  const [openingId, setOpeningId] =
    useState<string | null>(null);


  const openingRef = useRef(false);
  const requestRef = useRef(0);


  useEffect(() => {
    requestRef.current += 1;
    openingRef.current = false;
    setOpeningId(null);


    return () => {
      requestRef.current += 1;
      openingRef.current = false;
    };
  }, [xtreamCredentials, activeProfile?.id]);


  const activeTab =
    activeSubPage === 'movies'
      ? 'movies'
      : activeSubPage === 'series'
      ? 'series'
      : 'channels';


  const connecting =
    xtreamConnectionStatus === 'connecting';


  const favoriteChannels = useMemo(
    () =>
      importedChannels.filter((channel) =>
        favorites.includes(channel.id)
      ),
    [importedChannels, favorites]
  );


  const movieById = useMemo(
    () =>
      new Map(
        (movieCatalog.data?.movies ?? []).map(
          (movie) => [movie.id, movie]
        )
      ),
    [movieCatalog.data]
  );


  const seriesById = useMemo(
    () =>
      new Map(
        (seriesCatalog.data?.series ?? []).map(
          (series) => [series.id, series]
        )
      ),
    [seriesCatalog.data]
  );


  const movieCategoryNames = useMemo(
    () =>
      new Map(
        (movieCatalog.data?.categories ?? []).map(
          (category) => [category.id, category.name]
        )
      ),
    [movieCatalog.data]
  );


  const seriesCategoryNames = useMemo(
    () =>
      new Map(
        (seriesCatalog.data?.categories ?? []).map(
          (category) => [category.id, category.name]
        )
      ),
    [seriesCatalog.data]
  );


  const favoriteItems = useMemo(() => {
    const kind =
      activeTab === 'series' ? 'series' : 'movie';


    return catalogFavorites
      .filter((item) => item.kind === kind)
      .map((item): CatalogFavorite => {
        if (
          !xtreamCredentials ||
          item.sourceKey !== sourceKey
        ) {
          return item;
        }


        if (item.kind === 'movie') {
          const movie = movieById.get(item.itemId);
          if (!movie) return item;


          return {
            ...item,
            name: movie.name || item.name,
            poster: movie.poster || item.poster,
            extension:
              movie.extension || item.extension,
            categoryId: movie.categoryId,
            categoryName:
              movieCategoryNames.get(movie.categoryId) ||
              item.categoryName,
          };
        }


        const series = seriesById.get(item.itemId);
        if (!series) return item;


        return {
          ...item,
          name: series.name || item.name,
          poster: series.cover || item.poster,
          categoryId: series.categoryId,
          categoryName:
            seriesCategoryNames.get(series.categoryId) ||
            item.categoryName,
          plot: series.plot || item.plot,
          year: series.year || item.year,
          rating: series.rating || item.rating,
        };
      });
  }, [
    activeTab,
    catalogFavorites,
    xtreamCredentials,
    sourceKey,
    movieById,
    seriesById,
    movieCategoryNames,
    seriesCategoryNames,
  ]);


  // Une série sans affiche dans le catalogue : on la demande à sa fiche.
  const seriesIdsMissingPoster = useMemo(
    () =>
      activeTab === 'series'
        ? favoriteItems
            .filter((item) => !item.poster && item.sourceKey === sourceKey)
            .map((item) => item.itemId)
            .slice(0, 12)
        : [],
    [activeTab, favoriteItems, sourceKey]
  );

  const seriesBasics = useSeriesBasics(
    sourceKey,
    seriesIdsMissingPoster,
    xtreamCredentials
  );

  const displayItems = useMemo(
    () =>
      favoriteItems.map((item) =>
        item.kind === 'series' && !item.poster
          ? { ...item, poster: seriesBasics.get(item.itemId)?.cover ?? '' }
          : item
      ),
    [favoriteItems, seriesBasics]
  );

  const displayedCount =
    activeTab === 'channels'
      ? favoriteChannels.length
      : favoriteItems.length;


  const currentCatalog =
    activeTab === 'series'
      ? seriesCatalog
      : movieCatalog;


  const catalogPending =
    Boolean(xtreamCredentials) &&
    currentCatalog.data === null &&
    (
      currentCatalog.status === 'idle' ||
      currentCatalog.status === 'loading'
    );


  const EmptyIcon =
    activeTab === 'channels'
      ? Tv
      : activeTab === 'movies'
      ? Film
      : Clapperboard;


  function browseCatalog() {
    if (activeTab === 'channels') {
      navigate('live', 'all');
    } else if (activeTab === 'movies') {
      navigate('movies', 'all');
    } else {
      setActiveSeriesCategory('');
      setRequestedSeriesId(null);
      navigate('series', 'all');
    }
  }


  async function openFavorite(item: CatalogFavorite) {
    if (openingRef.current || connecting) return;


    if (!xtreamCredentials) {
      showToast(
        t('favorites.connectSourceToOpen'),
        'info'
      );
      return;
    }


    if (item.sourceKey !== sourceKey) {
      showToast(
        t('favorites.otherSource'),
        'info'
      );
      return;
    }


    if (item.kind === 'series') {
      setActiveSeriesCategory('');
      setRequestedSeriesId(item.itemId);
      navigate('series', 'all');
      return;
    }


    openingRef.current = true;
    const requestId = ++requestRef.current;
    const credentials = xtreamCredentials;


    setOpeningId(item.id);


    try {
      let extension = cleanExtension(item.extension);


      if (!/^[a-z0-9]+$/.test(extension)) {
        const raw = await invoke<unknown>(
          'fetch_xtream_catalog',
          {
            ...credentials,
            action: 'get_vod_info',
            itemId: item.itemId,
          }
        );


        if (requestId !== requestRef.current) return;


        const root = asRecord(raw);
        const movieData = asRecord(root?.movie_data);


        extension = cleanExtension(
          movieData?.container_extension
        );
      }


      if (!/^[a-z0-9]+$/.test(extension)) {
        throw new Error(
          t('series.errorFormat')
        );
      }


      if (requestId !== requestRef.current) return;


      const base = credentials.serverUrl
        .trim()
        .replace(/\/+$/, '');


      const streamUrl =
        `${base}/movie/` +
        `${encodeURIComponent(credentials.username)}/` +
        `${encodeURIComponent(credentials.password)}/` +
        `${encodeURIComponent(item.itemId)}.${extension}`;


      const channel: Channel = {
        id:
          `vod-${encodeURIComponent(base)}-${item.itemId}`,
        name: item.name,
        category:
          item.categoryName || t('favorites.noCategory'),
        description:
          item.plot || t('movies.vodDescription'),
        logoColor: '#7c3aed',
        isLive: false,
        logoUrl: item.poster || undefined,
        streamUrl,
        imported: true,
      };


      setSelectedChannel(channel);
      navigate('player', 'all');
    } catch {
      if (requestId === requestRef.current) {
        showToast(
          t('favorites.openMovieError'),
          'error'
        );
      }
    } finally {
      if (requestId === requestRef.current) {
        openingRef.current = false;
        setOpeningId(null);
      }
    }
  }


  return (
    <div className="min-h-full bg-surface-900 px-8 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600/15">
            <Heart className="h-5 w-5 fill-red-500 text-red-500" />
          </div>


          <div>
            <h1 className="text-lg font-semibold text-white">
              {t('favorites.title')}
            </h1>


            <p className="text-sm text-zinc-500">
{activeProfile ? t(activeProfile.name) : t('settings.activeProfile')}
              {' · '}
              {displayedCount}{' '}
              {displayedCount > 1
                ? t('favorites.countPlural')
                : t('favorites.count')}
            </p>
          </div>
        </div>


        {activeTab !== 'channels' &&
          xtreamCredentials && (
            <button
              type="button"
              disabled={
                currentCatalog.status === 'loading' ||
                openingId !== null
              }
              onClick={() =>
                void currentCatalog.refresh()
              }
              className="flex items-center gap-2 rounded-lg bg-surface-700 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  currentCatalog.status === 'loading'
                    ? 'animate-spin'
                    : ''
                }`}
              />
              {t('series.refresh')}
            </button>
          )}
      </div>


      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.sub;


          return (
            <button
              key={tab.sub}
              type="button"
              onClick={() =>
                navigate('favorites', tab.sub)
              }
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface-800 text-zinc-400 hover:bg-surface-700 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(tab.labelKey)}
            </button>
          );
        })}
      </div>


      {connecting && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 text-sm text-accent-300"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('favorites.connecting')}
        </p>
      )}


      {activeTab !== 'channels' && catalogPending && (
        <p
          role="status"
          className="mb-4 flex items-center gap-2 text-xs text-zinc-400"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('favorites.loadingPosters')}
        </p>
      )}


      {activeTab !== 'channels' &&
        currentCatalog.error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-300"
          >
            <p>{currentCatalog.error}</p>
            <p className="mt-2 text-xs">
              {t('favorites.catalogErrorNote')}
            </p>
          </div>
        )}


      {displayedCount === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 px-6 py-20 text-center">
          <EmptyIcon className="mb-4 h-10 w-10 text-zinc-600" />


          <h2 className="text-base font-medium text-zinc-300">
            {t('favorites.emptyTitle')}
          </h2>


          <p className="mt-2 max-w-md text-sm text-zinc-500">
            {activeTab === 'channels'
              ? t('favorites.emptyChannels')
              : t('favorites.emptyCatalog')}
          </p>


          <button
            type="button"
            onClick={browseCatalog}
            className="mt-5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            {activeTab === 'channels'
              ? t('favorites.browseChannels')
              : activeTab === 'movies'
              ? t('favorites.browseMovies')
              : t('favorites.browseSeries')}
          </button>
        </div>
      ) : activeTab === 'channels' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favoriteChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
            />
          ))}
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-zinc-500">
            {t('favorites.postersNote')}
          </p>


          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {displayItems.map((item, index) => {
              const matchingSource =
                Boolean(xtreamCredentials) &&
                item.sourceKey === sourceKey;


              const opening = openingId === item.id;


              return (
                <article
                  key={item.id}
                  className="relative overflow-hidden rounded-xl border border-surface-700 bg-surface-800 transition-colors hover:border-accent-500"
                >
                  <button
                    type="button"
                    onClick={() =>
                      void openFavorite(item)
                    }
                    disabled={
                      openingId !== null ||
                      connecting
                    }
                    aria-label={`${t('series.open')} ${item.name}`}
                    className="block w-full text-left disabled:opacity-60"
                  >
                    <div className="relative">
                      <FavoritePoster
                        src={item.poster || ''}
                        title={item.name}
                        kind={item.kind}
                        loadingCatalog={
                          matchingSource &&
                          catalogPending &&
                          !item.poster
                        }
                        eager={index < 6}
                        t={t}
                      />


                      <div className="absolute bottom-2 right-2 rounded-full bg-black/75 p-2 text-white">
                        {opening ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Play className="h-5 w-5" />
                        )}
                      </div>
                    </div>


                    <div className="p-3">
                      <h2
                        title={item.name}
                        className="truncate text-sm font-medium text-white"
                      >
                        {item.name}
                      </h2>


                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {item.categoryName ||
                          t('favorites.noCategory')}
                      </p>


                      {!matchingSource && (
                        <p className="mt-2 text-xs text-amber-400">
                          {t('favorites.sourceToConnect')}
                        </p>
                      )}
                    </div>
                  </button>


                  <button
                    type="button"
                    onClick={() =>
                      toggleCatalogFavorite(item)
                    }
                    aria-label={`${t('series.removeFavorite')} ${item.name} ${t('series.toFavorites')}`}
                    title={t('movies.removeFavoriteTitle')}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg bg-black/75 text-red-500 transition-colors hover:bg-red-950 hover:text-red-400"
                  >
                    <Heart className="h-4 w-4 fill-current" />
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}