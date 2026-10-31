import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Eye, FileDown, Search, Tv } from 'lucide-react';
import { useApp, type CatalogFavorite } from '@/context/AppContext';
import HomeSearch from '@/components/HomeSearch';
import HomeChannelCard from '@/components/HomeChannelCard';
import DragScrollRow from '@/components/DragScrollRow';
import { PosterCard, uniquePosters, type PosterItem } from '@/components/PosterCard';
import { useHomeHidden } from '@/utils/homeHidden';
import {
  continueWatchingKey,
  listContinueWatching,
  type PlaybackProgress,
} from '@/utils/playbackProgress';
import {
  getKnownMovieMetadata,
  loadMovieMetadata,
  useMovieMetadataIndex,
  type MovieMetadata,
} from '@/utils/movieMetadata';
import {
  readSeriesProgress,
  useSeriesBasics,
  type SeriesBasics,
  type SeriesProgress,
} from '@/utils/seriesProgress';
import FeaturedCarousel from '@/components/FeaturedCarousel';
import { useFeaturedSlides, type FeaturedSlide } from '@/utils/featuredSlides';
import { getHomeSearch, setHomeSearch } from '@/utils/homeSearchMemory';
import { cleanMovieTitle } from '@/utils/titleClean';
import type { Translate } from '@/i18n';
import type { Channel, XtreamCredentials } from '@/types';

const ROW_LIMIT = 24;

const ROW_CLASS = '-mx-1 flex gap-4 overflow-x-auto px-1 pb-2';

function continueHomeKey(item: PlaybackProgress): string {
  return `${continueWatchingKey(item)}@${item.updatedAt}`;
}

function leftLabel(position: number, duration: number, t: Translate): string {
  if (!(duration > 0)) return '';

  const minutes = Math.max(1, Math.round((duration - position) / 60));

  return t('home.min_restantes', { minutes });
}

function ratioOf(position: number, duration: number): number {
  return duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
}

function movieSubtitle(item: PlaybackProgress, t: Translate): string {
  return (
    leftLabel(item.position, item.duration, t) ||
    (t('player.movie'))
  );
}

function buildPosterRows(args: {
  continueItems: PlaybackProgress[];
  seriesProgress: SeriesProgress[];
  seriesBasics: Map<string, SeriesBasics>;
  movieMeta: Map<string, MovieMetadata>;
  catalogFavorites: CatalogFavorite[];
  sourceKey: string;
  hiddenKeys: Set<string>;
  t: Translate;
}): { series: PosterItem[]; movies: PosterItem[] } {
  const {
    continueItems,
    seriesProgress,
    seriesBasics,
    movieMeta,
    catalogFavorites,
    sourceKey,
    hiddenKeys,
    t,
  } = args;

  const series: PosterItem[] = [];
  const movies: PosterItem[] = [];
  const seen = new Set<string>();

  const favoriteByKey = new Map<string, CatalogFavorite>();

  for (const favorite of catalogFavorites) {
    if (favorite.sourceKey === sourceKey) {
      favoriteByKey.set(`${favorite.kind}:${favorite.itemId}`, favorite);
    }
  }

  const push = (item: PosterItem) => {
    const target = item.kind === 'series' ? series : movies;

    if (target.length < ROW_LIMIT) target.push(item);
  };

  // 1. Séries regardées (dernier épisode de chacune, la plus récente d'abord).
  for (const progress of seriesProgress) {
    const dedupe = `series:${progress.seriesId}`;

    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const hideKey = `series:${progress.seriesId}@${progress.updatedAt}`;

    if (hiddenKeys.has(hideKey)) continue;

    const favorite = favoriteByKey.get(dedupe);
    const basics = seriesBasics.get(progress.seriesId);
    const title = basics?.name || favorite?.name || '';

    // Le nom n'est pas encore connu : la carte apparaîtra dès qu'il arrive.
    if (!title) continue;

    const episode = `S${progress.season} · E${progress.episode}`;
    const left = progress.completed
      ? ''
      : leftLabel(progress.position, progress.duration, t);

    push({
      key: hideKey,
      orderKey: dedupe,
      hideKey,
      kind: 'series',
      itemId: progress.seriesId,
      title: cleanMovieTitle(title),
      subtitle: [episode, left].filter(Boolean).join(' · '),
      posters: uniquePosters(basics?.cover, favorite?.poster),
      ratio: progress.completed
        ? 0
        : ratioOf(progress.position, progress.duration),
      extension: '',
      categoryName: favorite?.categoryName ?? '',
    });
  }

  // 2. Films et épisodes du magasin commun (le plus récent d'abord).
  for (const progress of continueItems) {
    const kind = progress.kind === 'episode' ? 'series' : 'movie';
    const itemId =
      kind === 'series' ? progress.seriesId ?? '' : progress.itemId;

    if (!itemId) continue;

    const dedupe = `${kind}:${itemId}`;

    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const hideKey = continueHomeKey(progress);

    if (hiddenKeys.has(hideKey)) continue;

    const favorite = favoriteByKey.get(dedupe);

    push({
      key: hideKey,
      orderKey: dedupe,
      hideKey,
      kind,
      itemId,
      title: cleanMovieTitle(
        kind === 'series'
          ? progress.seriesName || progress.title
          : progress.title
      ),
      subtitle: movieSubtitle(progress, t),
      posters: uniquePosters(
        progress.poster,
        favorite?.poster,
        kind === 'movie' ? movieMeta.get(itemId)?.cover : undefined,
        kind === 'series' ? seriesBasics.get(itemId)?.cover : undefined
      ),
      ratio: ratioOf(progress.position, progress.duration),
      extension: favorite?.extension ?? '',
      categoryName: favorite?.categoryName ?? '',
    });
  }

  // 3. Puis les favoris pas encore affichés.
  for (const favorite of favoriteByKey.values()) {
    const dedupe = `${favorite.kind}:${favorite.itemId}`;

    if (seen.has(dedupe)) continue;

    const hideKey = `fav:${dedupe}`;

    if (hiddenKeys.has(hideKey)) continue;

    push({
      key: hideKey,
      orderKey: dedupe,
      hideKey,
      kind: favorite.kind,
      itemId: favorite.itemId,
      title: cleanMovieTitle(favorite.name),
      subtitle: [favorite.year, favorite.categoryName]
        .filter(Boolean)
        .join(' · '),
      posters: uniquePosters(
        favorite.kind === 'series'
          ? seriesBasics.get(favorite.itemId)?.cover
          : movieMeta.get(favorite.itemId)?.cover,
        favorite.poster
      ),
      ratio: 0,
      extension: favorite.extension ?? '',
      categoryName: favorite.categoryName,
    });
  }

  return { series, movies };
}

function buildMovieChannel(
  movie: { id: string; name: string; poster: string },
  credentials: XtreamCredentials,
  extension: string,
  categoryName: string
): Channel {
  const base = credentials.serverUrl.trim().replace(/\/+$/, '');

  return {
    id: `vod-${encodeURIComponent(base)}-${movie.id}`,
    name: movie.name,
    category: categoryName,
    description: '',
    logoColor: '#7c3aed',
    isLive: false,
    logoUrl: movie.poster || undefined,
    streamUrl:
      `${base}/movie/` +
      `${encodeURIComponent(credentials.username)}/` +
      `${encodeURIComponent(credentials.password)}/` +
      `${encodeURIComponent(movie.id)}.${extension}`,
    imported: true,
  };
}

/* ------------------------------------------------------------------ */
/* Affiches                                                            */
/* ------------------------------------------------------------------ */

function Row({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-9">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>

          {hint && (
            <span className="hidden truncate text-xs text-zinc-500 md:inline">
              {hint}
            </span>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded text-xs font-medium text-accent-400 hover:text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
    >
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const {
    importedChannels,
    visibleImportedChannels,
    visibleRecentlyWatched,
    favorites,
    catalogFavorites,
    activeProfile,
    sourceKey,
    xtreamCredentials,
    isCategoryHidden,
    startupReady,
    setCurrentPage,
    setSelectedChannel,
    setRequestedSeriesId,
    navigate,
    t,
  } = useApp();


  const profileId = activeProfile?.id ?? '';
  const hidden = useHomeHidden(profileId);
  const hiddenKeys = hidden.keys;
  const hideKey = hidden.hide;

  /* Recherche locale : taper ne re-rend que cette page. */
  const [query, setQueryState] = useState(getHomeSearch);
  const searchRef = useRef<HTMLInputElement>(null);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
    setHomeSearch(value);
  }, []);

  // « / » place le curseur dans la recherche (sauf pendant une saisie).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;

      if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
        return;
      }

      event.preventDefault();
      searchRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  /* Progression de lecture */
  const [progressVersion, setProgressVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setProgressVersion((value) => value + 1);

    window.addEventListener('msp-playback-progress-changed', refresh);

    return () =>
      window.removeEventListener('msp-playback-progress-changed', refresh);
  }, []);

  const continueItems = useMemo(
    () => listContinueWatching(profileId, sourceKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profileId, sourceKey, progressVersion]
  );

  // Séries : lues dans le magasin des épisodes, nommées à la demande.
  const seriesProgress = useMemo(
    () => readSeriesProgress(sourceKey),
    [sourceKey]
  );

  // On demande la fiche de chaque série affichée (nom et affiche) : elle sert
  // de secours quand l'affiche enregistrée avec le favori est vide ou cassée.
  const seriesIdsToName = useMemo(() => {
    const ids: string[] = [];

    for (const progress of seriesProgress) {
      if (!ids.includes(progress.seriesId)) ids.push(progress.seriesId);
    }

    for (const favorite of catalogFavorites) {
      if (
        favorite.kind === 'series' &&
        favorite.sourceKey === sourceKey &&
        !ids.includes(favorite.itemId)
      ) {
        ids.push(favorite.itemId);
      }
    }

    return ids.slice(0, 12);
  }, [seriesProgress, catalogFavorites, sourceKey]);

  const seriesBasics = useSeriesBasics(
    sourceKey,
    seriesIdsToName,
    xtreamCredentials
  );

  const movieMeta = useMovieMetadataIndex(sourceKey);

  const { series, movies } = useMemo(
    () =>
      buildPosterRows({
        continueItems,
        seriesProgress,
        seriesBasics,
        movieMeta,
        catalogFavorites,
        sourceKey,
        hiddenKeys,
        t,
      }),
    [
      continueItems,
      seriesProgress,
      seriesBasics,
      movieMeta,
      catalogFavorites,
      sourceKey,
      hiddenKeys,
      t,
    ]
  );

  // Films sans affiche : on demande leur fiche (en cache 7 jours) pour l'obtenir.
  useEffect(() => {
    if (!xtreamCredentials || !sourceKey) return;

    for (const item of movies.filter((movie) => movie.posters.length === 0).slice(0, 6)) {
      void loadMovieMetadata(sourceKey, item.itemId, xtreamCredentials).catch(
        () => undefined
      );
    }
  }, [movies, sourceKey, xtreamCredentials]);

  /* Chaînes : favoris, sinon dernières chaînes regardées */
  const favoriteChannels = useMemo(() => {
    if (favorites.length === 0) return [];

    const ids = new Set(favorites);
    const result: Channel[] = [];

    for (const channel of visibleImportedChannels) {
      if (ids.has(channel.id) && !hiddenKeys.has(`ch:${channel.id}`)) {
        result.push(channel);

        if (result.length >= ROW_LIMIT) break;
      }
    }

    return result;
  }, [favorites, visibleImportedChannels, hiddenKeys]);

  const recentChannels = useMemo(
    () =>
      visibleRecentlyWatched
        .filter((channel) => !hiddenKeys.has(`ch:${channel.id}`))
        .slice(0, 8),
    [visibleRecentlyWatched, hiddenKeys]
  );

  /* Films et séries du moment (2 + 2, en rotation) */
  const scope =
    profileId && sourceKey ? JSON.stringify([profileId, sourceKey]) : '';

  const {
    slides,
    loading: slidesLoading,
    dismiss: dismissSlide,
    hiddenCount: hiddenSlides,
    restoreHidden: restoreSlides,
  } = useFeaturedSlides(
    scope,
    sourceKey,
    xtreamCredentials,
    isCategoryHidden
  );

  // Le bandeau est « réglé » quand il affiche quelque chose, ou quand on sait
  // qu'il n'y aura rien (pas de source Xtream, rien trouvé). L'écran de
  // chargement de main.tsx attend ce signal avant de se retirer.
  const heroSettled = slides.length > 0 || !slidesLoading;

  useEffect(() => {
    if (!startupReady || !heroSettled) return;

    (window as unknown as { __lamayneHomeReady?: boolean }).__lamayneHomeReady = true;
    window.dispatchEvent(new Event('lamayne:home-ready'));
  }, [startupReady, heroSettled]);

  const playSlide = useCallback(
    (slide: FeaturedSlide) => {
      if (slide.kind === 'series') {
        setRequestedSeriesId(slide.id);
        navigate('series', 'all');
        return;
      }

      if (!xtreamCredentials) return;

      setSelectedChannel(
        buildMovieChannel(
          { id: slide.id, name: slide.name, poster: slide.poster || slide.image },
          xtreamCredentials,
          slide.extension || 'mp4',
          ''
        )
      );
      setCurrentPage('player');
    },
    [
      xtreamCredentials,
      navigate,
      setRequestedSeriesId,
      setSelectedChannel,
      setCurrentPage,
    ]
  );

  /* Ouvertures */
  const openItem = useCallback(
    (item: PosterItem) => {
      if (item.kind === 'series') {
        setRequestedSeriesId(item.itemId);
        navigate('series', 'all');
        return;
      }

      if (!xtreamCredentials) {
        navigate('movies', 'all');
        return;
      }

      const extension =
        item.extension ||
        getKnownMovieMetadata(sourceKey, item.itemId)?.extension ||
        'mp4';

      setSelectedChannel(
        buildMovieChannel(
          { id: item.itemId, name: item.title, poster: item.posters[0] ?? '' },
          xtreamCredentials,
          extension,
          item.categoryName
        )
      );
      setCurrentPage('player');
    },
    [
      xtreamCredentials,
      sourceKey,
      navigate,
      setRequestedSeriesId,
      setSelectedChannel,
      setCurrentPage,
    ]
  );

  const hideItem = useCallback((key: string) => hideKey(key), [hideKey]);

  const hideLabel = t('home.retirer_de_l_accueil');

  /* ---------------- Rendu ---------------- */

  const searchField = (
    <label className="flex h-11 w-full max-w-[420px] items-center gap-2.5 rounded-xl border border-surface-600 bg-surface-850 px-4 text-zinc-400 focus-within:border-accent-500">
      <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery('');
        }}
        placeholder={t('home.rechercher_une_chaine')}
        aria-label={t('home.rechercher_une_chaine')}
        className="min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
      />
    </label>
  );

  if (deferredQuery) {
    return (
      <HomeSearch
        query={query}
        searchField={searchField}
        onOpenItem={openItem}
      />
    );
  }

  if (importedChannels.length === 0) {
    return (
      <div className="animate-fade-in px-8 py-6">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-600 bg-surface-800/50 py-24">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-surface-700">
            <Tv className="h-10 w-10 text-zinc-600" />
          </div>

          <p className="mb-1 text-lg font-semibold text-zinc-300">
            {t('home.noChannelsImported')}
          </p>

          <p className="mb-4 text-sm text-zinc-400">{t('home.importHint')}</p>

          <button
            type="button"
            onClick={() => navigate('settings', 'import-playlist')}
            className="flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-500"
          >
            <FileDown className="h-4 w-4" />
            {t('home.goToImport')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in px-8 py-6">
      {searchField}

      {slides.length > 0 ? (
        <FeaturedCarousel
          slides={slides}
          onPlay={playSlide}
          onDismiss={dismissSlide}
        />
      ) : (
        slidesLoading && (
          <div
            role="status"
            className="-mx-8 mt-6 flex h-[380px] items-center justify-center bg-surface-800/40"
          >
            <span className="animate-pulse text-sm text-zinc-400">
              {t('home.preparation_de_vos_recommandations')}
            </span>
          </div>
        )
      )}

      <Row
        title={
          favoriteChannels.length > 0
            ? t('home.mes_chaines')
            : t('home.chaines_recentes')
        }
        action={
          <SeeAll
            label={t('home.seeAll')}
            onClick={() => navigate('live', 'all')}
          />
        }
      >
        {favoriteChannels.length > 0 ? (
          <DragScrollRow className={ROW_CLASS}>
            {favoriteChannels.map((channel) => (
              <HomeChannelCard key={channel.id} channel={channel} />
            ))}
          </DragScrollRow>
        ) : recentChannels.length > 0 ? (
          <DragScrollRow className={ROW_CLASS}>
            {recentChannels.map((channel) => (
              <HomeChannelCard key={channel.id} channel={channel} />
            ))}
          </DragScrollRow>
        ) : (
          <p className="py-2 text-sm text-zinc-400">
            {t('home.touchez_le_c_ur_d_une')}
          </p>
        )}
      </Row>

      {series.length > 0 && (
        <Row
          title={t('home.mes_series')}
          action={
            <SeeAll
              label={t('home.seeAll')}
              onClick={() => navigate('series', 'all')}
            />
          }
        >
          <DragScrollRow className={ROW_CLASS}>
            {series.map((item) => (
              <PosterCard
                key={item.orderKey}
                item={item}
                hideLabel={hideLabel}
                onOpen={openItem}
                onHide={hideItem}
              />
            ))}
          </DragScrollRow>
        </Row>
      )}

      {movies.length > 0 && (
        <Row
          title={t('home.mes_films')}
          action={
            <SeeAll
              label={t('home.seeAll')}
              onClick={() => navigate('movies', 'all')}
            />
          }
        >
          <DragScrollRow className={ROW_CLASS}>
            {movies.map((item) => (
              <PosterCard
                key={item.orderKey}
                item={item}
                hideLabel={hideLabel}
                onOpen={openItem}
                onHide={hideItem}
              />
            ))}
          </DragScrollRow>
        </Row>
      )}

      {hiddenSlides > 0 && (
        <div className="pb-2 pt-6">
          <button
            type="button"
            onClick={restoreSlides}
            className="inline-flex items-center gap-2 rounded text-xs text-zinc-400 transition-colors hover:text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            <Eye className="h-3.5 w-3.5" />
            {t('home.autoriser_a_nouveau_les_recommandations_')}{' '}
            ({hiddenSlides})
          </button>
        </div>
      )}

      {hidden.count > 0 && (
        <div className="pb-6 pt-8">
          <button
            type="button"
            onClick={hidden.restoreAll}
            className="inline-flex items-center gap-2 rounded text-xs text-zinc-400 transition-colors hover:text-accent-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            <Eye className="h-3.5 w-3.5" />
            {t('home.reafficher_les_elements_masques')} (
            {hidden.count})
          </button>
        </div>
      )}
    </div>
  );
}
