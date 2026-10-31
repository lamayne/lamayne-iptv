import { useMemo, useState, type ReactNode } from 'react';
import { Clapperboard, Film, Loader2, Tv } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import ChannelCard from '@/components/ChannelCard';
import {
  PosterCard,
  uniquePosters,
  type PosterItem,
} from '@/components/PosterCard';
import {
  useMovieCatalog,
  useSeriesCatalog,
  type CatalogMovie,
  type CatalogSeries,
} from '@/utils/xtreamCatalogCache';
import { getChannelPresentation } from '@/utils/channelPresentation';
import { cleanMovieTitle } from '@/utils/titleClean';
import { buildIndex, searchIndex } from '@/utils/searchText';
import {
  getHomeSearchScope,
  setHomeSearchScope,
  type HomeSearchScope,
} from '@/utils/homeSearchMemory';
import type { Channel } from '@/types';

const PAGE = 24;

type SectionKey = 'live' | 'movies' | 'series';

function Section({
  icon: Icon,
  title,
  count,
  shown,
  onMore,
  moreLabel,
  children,
}: {
  icon: typeof Tv;
  title: string;
  count: number;
  shown: number;
  onMore: () => void;
  moreLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
        <Icon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        {title}
        <span className="text-sm font-normal text-zinc-500">{count}</span>
      </h2>

      {children}

      {count > shown && (
        <button
          type="button"
          onClick={onMore}
          className="mt-5 rounded-lg border border-surface-600 px-4 py-2 text-sm text-zinc-200 transition-colors hover:border-accent-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          {moreLabel}
        </button>
      )}
    </section>
  );
}

// Recherche globale de l'accueil : chaînes, films et séries.
export default function HomeSearch({
  query,
  searchField,
  onOpenItem,
}: {
  query: string;
  searchField: ReactNode;
  onOpenItem: (item: PosterItem) => void;
}) {
  const { t, visibleImportedChannels, xtreamCredentials, isCategoryHidden } =
    useApp();

  const [scope, setScopeState] = useState<HomeSearchScope>(getHomeSearchScope);
  const [limits, setLimits] = useState<Record<SectionKey, number>>({
    live: PAGE * 2,
    movies: PAGE,
    series: PAGE,
  });

  const setScope = (value: HomeSearchScope) => {
    setScopeState(value);
    setHomeSearchScope(value);
  };

  const more = (key: SectionKey) =>
    setLimits((previous) => ({ ...previous, [key]: previous[key] + PAGE }));

  // Les catalogues complets ne sont chargés que lorsqu'on cherche (et mis en
  // cache ensuite), pour ne pas ralentir le démarrage.
  const hasCatalogs = Boolean(xtreamCredentials);
  const wantCatalogs = hasCatalogs && scope !== 'live';
  const movieCatalog = useMovieCatalog(wantCatalogs ? xtreamCredentials : null);
  const seriesCatalog = useSeriesCatalog(wantCatalogs ? xtreamCredentials : null);

  const channelIndex = useMemo(
    () =>
      buildIndex<Channel>(
        visibleImportedChannels,
        (channel) => `${getChannelPresentation(channel.name, true).name} ${channel.name} ${channel.category}`,
        (channel) => getChannelPresentation(channel.name, true).name
      ),
    [visibleImportedChannels]
  );

  const movieIndex = useMemo(
    () =>
      buildIndex<CatalogMovie>(
        (movieCatalog.data?.movies ?? []).filter(
          (movie) => movie.name && !isCategoryHidden('movies', movie.categoryId)
        ),
        (movie) => movie.name,
        (movie) => cleanMovieTitle(movie.name)
      ),
    [movieCatalog.data, isCategoryHidden]
  );

  const seriesIndex = useMemo(
    () =>
      buildIndex<CatalogSeries>(
        (seriesCatalog.data?.series ?? []).filter(
          (series) => series.name && !isCategoryHidden('series', series.categoryId)
        ),
        (series) => series.name,
        (series) => cleanMovieTitle(series.name)
      ),
    [seriesCatalog.data, isCategoryHidden]
  );

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();

    for (const category of movieCatalog.data?.categories ?? []) {
      map.set(`movie:${category.id}`, category.name);
    }

    return map;
  }, [movieCatalog.data]);

  const live = useMemo(
    () => searchIndex(channelIndex, query, limits.live),
    [channelIndex, query, limits.live]
  );
  const movies = useMemo(
    () => searchIndex(movieIndex, query, limits.movies),
    [movieIndex, query, limits.movies]
  );
  const series = useMemo(
    () => searchIndex(seriesIndex, query, limits.series),
    [seriesIndex, query, limits.series]
  );

  const moviePosters = useMemo<PosterItem[]>(
    () =>
      movies.results.map((movie) => ({
        key: `search:movie:${movie.id}`,
        orderKey: `movie:${movie.id}`,
        hideKey: '',
        kind: 'movie',
        itemId: movie.id,
        title: cleanMovieTitle(movie.name),
        subtitle: movie.rating && Number(movie.rating) > 0 ? `★ ${movie.rating}` : '',
        posters: uniquePosters(movie.poster),
        ratio: 0,
        extension: movie.extension,
        categoryName: categoryNames.get(`movie:${movie.categoryId}`) ?? '',
      })),
    [movies.results, categoryNames]
  );

  const seriesPosters = useMemo<PosterItem[]>(
    () =>
      series.results.map((item) => ({
        key: `search:series:${item.id}`,
        orderKey: `series:${item.id}`,
        hideKey: '',
        kind: 'series',
        itemId: item.id,
        title: cleanMovieTitle(item.name),
        subtitle: [item.year, item.genre].filter(Boolean).join(' · '),
        posters: uniquePosters(item.cover),
        ratio: 0,
        extension: '',
        categoryName: '',
      })),
    [series.results]
  );

  const loadingCatalogs =
    wantCatalogs &&
    (movieCatalog.status === 'loading' ||
      seriesCatalog.status === 'loading' ||
      (movieCatalog.status === 'idle' && seriesCatalog.status === 'idle'));
  const catalogError =
    wantCatalogs &&
    (movieCatalog.status === 'error' || seriesCatalog.status === 'error');

  const showLive = scope === 'all' || scope === 'live';
  const showMovies = hasCatalogs && (scope === 'all' || scope === 'movies');
  const showSeries = hasCatalogs && (scope === 'all' || scope === 'series');

  const shownTotal =
    (showLive ? live.total : 0) +
    (showMovies ? movies.total : 0) +
    (showSeries ? series.total : 0);

  const chips: Array<{ key: HomeSearchScope; label: string; count: number | null }> = [
    { key: 'all', label: t('home.searchAll'), count: null },
    { key: 'live', label: t('home.searchChannels'), count: live.total },
    ...(hasCatalogs
      ? [
          { key: 'movies' as const, label: t('home.searchMovies'), count: movies.total },
          { key: 'series' as const, label: t('home.searchSeries'), count: series.total },
        ]
      : []),
  ];

  return (
    <div className="animate-fade-in px-8 py-6">
      {searchField}

      <div
        role="group"
        aria-label={t('home.searchResults')}
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={scope === chip.key}
            onClick={() => setScope(chip.key)}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
              scope === chip.key
                ? 'border-accent-500 bg-accent-600/20 text-white'
                : 'border-surface-600 text-zinc-300 hover:border-zinc-500 hover:text-white'
            }`}
          >
            {chip.label}
            {chip.count !== null && chip.count > 0 && (
              <span className="ml-2 text-xs text-zinc-400">{chip.count}</span>
            )}
          </button>
        ))}

        {loadingCatalogs && (
          <span
            role="status"
            className="ml-2 flex items-center gap-2 text-xs text-zinc-400"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('home.searchLoadingCatalog')}
          </span>
        )}
      </div>

      {catalogError && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t('home.searchCatalogError')}
        </p>
      )}

      {showLive && live.total > 0 && (
        <Section
          icon={Tv}
          title={t('home.searchChannels')}
          count={live.total}
          shown={live.results.length}
          onMore={() => more('live')}
          moreLabel={t('home.searchMore')}
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.results.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        </Section>
      )}

      {showMovies && movies.total > 0 && (
        <Section
          icon={Film}
          title={t('home.searchMovies')}
          count={movies.total}
          shown={moviePosters.length}
          onMore={() => more('movies')}
          moreLabel={t('home.searchMore')}
        >
          <div className="flex flex-wrap gap-4">
            {moviePosters.map((item) => (
              <PosterCard key={item.key} item={item} onOpen={onOpenItem} />
            ))}
          </div>
        </Section>
      )}

      {showSeries && series.total > 0 && (
        <Section
          icon={Clapperboard}
          title={t('home.searchSeries')}
          count={series.total}
          shown={seriesPosters.length}
          onMore={() => more('series')}
          moreLabel={t('home.searchMore')}
        >
          <div className="flex flex-wrap gap-4">
            {seriesPosters.map((item) => (
              <PosterCard key={item.key} item={item} onOpen={onOpenItem} />
            ))}
          </div>
        </Section>
      )}

      {shownTotal === 0 && !loadingCatalogs && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 py-16">
          <Tv className="mb-3 h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p className="text-sm text-zinc-400">{t('home.searchNothing')}</p>
        </div>
      )}
    </div>
  );
}
