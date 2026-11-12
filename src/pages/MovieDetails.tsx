import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeft,
  Check,
  Film,
  Loader2,
  Play,
  RotateCcw,
  UserRound,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import MpvPlayer from '@/components/MpvPlayer';
import type { Channel } from '@/types';
import {
  useMovieCatalog,
  type CatalogMovie,
} from '@/utils/xtreamCatalogCache';
import {
  loadMovieMetadata,
  normalizeMovieText,
  useMovieMetadata,
  useMovieMetadataIndex,
} from '@/utils/movieMetadata';
import {
  canResumePlayback,
  clearPlaybackProgress,
  formatPlaybackTime,
  getPlaybackProgress,
  type PlaybackIdentity,
  type PlaybackProgress,
} from '@/utils/playbackProgress';
import { errorText } from '@/i18n/backendErrors';
import { backLabelFor } from '@/utils/backLabel';

import {
  buildTitleIndex,
  loadFilmography,
  matchFilmography,
  type FilmographyEntry,
} from '@/utils/filmography';

type Recommendation = {
  movie: CatalogMovie;
  score: number;
  reason: string;
};

const EMPTY_MOVIES: CatalogMovie[] = [];
const ACTOR_PAGE_SIZE = 24;

function getMovieId(
  streamUrl: string | undefined
): string | null {
  if (!streamUrl) return null;

  try {
    const url = new URL(streamUrl);

    if (
      !url.pathname.includes('/movie/')
    ) {
      return null;
    }

    return (
      url.pathname
        .split('/')
        .pop()
        ?.match(/^(\d+)\.[a-z0-9]+$/i)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function cleanExtension(
  value: string
): string {
  return value
    .trim()
    .replace(/^\./, '')
    .toLowerCase();
}

function commonNames(
  first: string[],
  second: string[]
): number {
  const names = new Set(
    first.map(normalizeMovieText)
  );

  return second.filter((name) =>
    names.has(
      normalizeMovieText(name)
    )
  ).length;
}

// Le résultat exprime une condition de reprise,
// pas l'absence de tout objet PlaybackProgress.
function hasResumePosition(
  progress: PlaybackProgress | null
): boolean {
  return canResumePlayback(progress);
}

function useCurrentProgress(
  identity: PlaybackIdentity | undefined
): PlaybackProgress | null {
  const [progress, setProgress] =
    useState<PlaybackProgress | null>(null);

  useEffect(() => {
    function update() {
      setProgress(
        identity
          ? getPlaybackProgress(identity)
          : null
      );
    }

    function onProgressChanged(
      event: Event
    ) {
      const detail = (
        event as CustomEvent<{
          profileId?: string;
        }>
      ).detail;

      if (
        detail?.profileId &&
        detail.profileId !==
          identity?.profileId
      ) {
        return;
      }

      update();
    }

    update();

    window.addEventListener(
      'msp-playback-progress-changed',
      onProgressChanged
    );

    window.addEventListener(
      'storage',
      update
    );

    window.addEventListener(
      'focus',
      update
    );

    return () => {
      window.removeEventListener(
        'msp-playback-progress-changed',
        onProgressChanged
      );

      window.removeEventListener(
        'storage',
        update
      );

      window.removeEventListener(
        'focus',
        update
      );
    };
  }, [identity]);

  if (!identity || !progress) {
    return null;
  }

  if (
    progress.profileId !==
      identity.profileId ||
    progress.sourceKey !==
      identity.sourceKey ||
    progress.itemId !==
      identity.itemId ||
    progress.kind !==
      identity.kind
  ) {
    return null;
  }

  return progress;
}

function MovieTile({
  movie,
  reason,
  disabled,
  onOpen,
}: {
  movie: CatalogMovie;
  reason?: string;
  disabled: boolean;
  onOpen: (movie: CatalogMovie) => void;
}) {
  const [failedPoster, setFailedPoster] =
    useState<string | null>(null);

  const showPoster =
    Boolean(movie.poster) &&
    failedPoster !== movie.poster;

  return (
    <button
      type="button"
      onClick={() => onOpen(movie)}
      disabled={disabled}
      className="group min-w-0 overflow-hidden rounded-xl border border-surface-700 bg-surface-800 text-left transition-colors hover:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 disabled:cursor-wait disabled:opacity-60"
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-surface-900">
        {showPoster ? (
          <img
            src={movie.poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() =>
              setFailedPoster(
                movie.poster
              )
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="h-10 w-10 text-zinc-600" />
          </div>
        )}

        <span className="absolute bottom-2 right-2 rounded-full bg-black/75 p-2 text-white">
          <Play className="h-4 w-4" />
        </span>
      </div>

      <div className="p-3">
        <p
          title={movie.name}
          className="truncate text-sm font-medium text-white"
        >
          {movie.name}
        </p>

        {reason && (
          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
            {reason}
          </p>
        )}
      </div>
    </button>
  );
}

function MovieProgressCard({
  progress,
  percent,
  watchedLabel,
}: {
  progress: PlaybackProgress;
  percent: number;
  watchedLabel: string;
}) {
  const { t } = useApp();

  return (
    <div className="mt-5 rounded-xl border border-white/10 bg-surface-800/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {progress.completed ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Check className="h-4 w-4" />
            {watchedLabel}
          </span>
        ) : (
          <span className="text-zinc-300">
            {formatPlaybackTime(
              progress.position
            )}

            {progress.duration > 0 &&
              ` / ${formatPlaybackTime(
                progress.duration
              )}`}
          </span>
        )}

        {progress.duration > 0 && (
          <span className="text-zinc-500">
            {Math.round(percent)} %
          </span>
        )}
      </div>

      {progress.duration > 0 && (
        <div
          role="progressbar"
          aria-label={
            t('movie.progression_du_film')
          }
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            percent
          )}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <div
            className={`h-full rounded-full ${
              progress.completed
                ? 'bg-emerald-500'
                : 'bg-accent-500'
            }`}
            style={{
              width: `${percent}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function MovieDetails() {
  const {
    selectedChannel,
    setSelectedChannel,
    xtreamCredentials,
    sourceKey,
    activeProfile,
    returnFromPlayer,
    peekReturn,
    t,
    isCategoryHidden,
    hiddenCategories,
  } = useApp();

  const labels = {
    details: t('movie.fiche_du_film'),
    resume: t('player.resume'),
    restart: t('player.restart'),
    watched: t('series.watched'),
    cast: t('movie.distribution'),
    director: t('player.director'),
    similar: t('movie.a_decouvrir_aussi'),
    sameGenre: t('movie.genres_en_commun'),
    sameDirector: t('movie.meme_realisateur'),
    sameCast: t('movie.acteurs_en_commun'),
    sameCategory: t('movie.dans_la_meme_categorie'),
    actorMovies: t('movie.films_disponibles_avec'),
    partial: t('movie.base_sur_les_fiches_deja_consultees'),
    actorLoading: t('movie.actor_loading'),
    actorSource: t('movie.actor_source'),
    actorError: t('movie.actor_error'),
    noMatches: t('movie.aucun_autre_film_identifie_dans_vos'),
    close: t('common.close'),
    loading: t('settings.loading'),
    noPlot: t('movie.aucun_resume_disponible'),
    noRecommendations: t('movie.pas_encore_de_recommandation_pertinente_'),
    recommendationInfo: t('movie.uniquement_des_films_de_votre_source'),
    storageError: t('movie.impossible_de_reinitialiser_la_progressi'),
    openError: t('movie.impossible_de_preparer_ce_film'),
    invalidFormat: t('movie.le_fournisseur_ne_donne_pas_de'),
  };

  const channel =
    selectedChannel;

  const movieId =
    getMovieId(
      channel?.streamUrl
    );

  const movieKey =
    JSON.stringify([
      sourceKey,
      channel?.id,
    ]);

  const [playingKey, setPlayingKey] =
    useState<string | null>(null);

  const [actor, setActor] =
    useState('');

  const [actorPage, setActorPage] =
    useState(1);

  const [openingId, setOpeningId] =
    useState<string | null>(null);

  const [actionError, setActionError] =
    useState('');

  const openingRef =
    useRef(false);

  const openingRequestRef =
    useRef(0);

  const actorDialogRef =
    useRef<HTMLElement>(null);

  const catalog =
    useMovieCatalog(
      xtreamCredentials
    );

  const allMovies =
    catalog.data?.movies ??
    EMPTY_MOVIES;

  const visibleMovies =
    useMemo(
      () =>
        allMovies.filter(
          (movie) =>
            !isCategoryHidden(
              'movies',
              movie.categoryId
            )
        ),
      [
        allMovies,
        isCategoryHidden,
      ]
    );

  const index =
    useMovieMetadataIndex(
      sourceKey
    );

  const {
    details,
    loading,
    error,
  } = useMovieMetadata(
    sourceKey,
    movieId,
    xtreamCredentials
  );

  // Une fiche déjà ouverte ou issue des favoris
  // reste accessible même si sa catégorie est masquée.
  const currentMovie =
    useMemo(
      () =>
        allMovies.find(
          (movie) =>
            movie.id === movieId
        ) ?? null,
      [allMovies, movieId]
    );

  const identity =
    useMemo<
      PlaybackIdentity | undefined
    >(() => {
      if (
        !activeProfile?.id ||
        !sourceKey ||
        !movieId
      ) {
        return undefined;
      }

      return {
        profileId:
          activeProfile.id,
        sourceKey,
        kind: 'movie',
        itemId: movieId,
        title:
          channel?.name || '',
        poster:
          channel?.logoUrl || undefined,
      };
    }, [
      activeProfile?.id,
      sourceKey,
      movieId,
      channel?.name,
      channel?.logoUrl,
    ]);

  const progress =
    useCurrentProgress(
      identity
    );

  const resumable =
    hasResumePosition(
      progress
    );

  const completed =
    progress?.completed ?? false;

  const playing =
    playingKey === movieKey;

  const progressPercent =
    completed
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

  const playbackLabel =
    completed
      ? labels.restart
      : resumable && progress
      ? `${labels.resume} ${formatPlaybackTime(
          progress.position
        )}`
      : t('player.playMovie');

  useEffect(() => {
    openingRequestRef.current += 1;
    openingRef.current = false;

    setOpeningId(null);
    setActor('');
    setActorPage(1);
    setActionError('');
    setPlayingKey(null);

    return () => {
      openingRequestRef.current += 1;
      openingRef.current = false;
    };
  }, [
    movieKey,
    activeProfile?.id,
    xtreamCredentials,
  ]);

  useEffect(() => {
    setActorPage(1);
  }, [
    actor,
    hiddenCategories.movies,
  ]);

  useEffect(() => {
    if (!actor) return;

    const previousFocus =
      document.activeElement instanceof
      HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const frame =
      window.requestAnimationFrame(() => {
        actorDialogRef.current
          ?.querySelector<HTMLElement>(
            'button:not([disabled])'
          )
          ?.focus();
      });

    function onKey(
      event: KeyboardEvent
    ) {
      if (
        event.key === 'Escape'
      ) {
        event.preventDefault();
        setActor('');
        return;
      }

      if (
        event.key !== 'Tab' ||
        !actorDialogRef.current
      ) {
        return;
      }

      const elements =
        Array.from(
          actorDialogRef.current
            .querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]'
            )
        ).filter(
          (element) =>
            element
              .getClientRects()
              .length > 0
        );

      if (
        elements.length === 0
      ) {
        event.preventDefault();
        actorDialogRef.current.focus();
        return;
      }

      const first =
        elements[0];

      const last =
        elements[
          elements.length - 1
        ];

      const active =
        document.activeElement;

      if (
        event.shiftKey &&
        (
          active === first ||
          active ===
            actorDialogRef.current ||
          !actorDialogRef.current
            .contains(active)
        )
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (
          active === last ||
          !actorDialogRef.current
            .contains(active)
        )
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener(
      'keydown',
      onKey
    );

    return () => {
      window.cancelAnimationFrame(
        frame
      );

      document.removeEventListener(
        'keydown',
        onKey
      );

      document.body.style.overflow =
        previousOverflow;

      if (
        previousFocus?.isConnected
      ) {
        previousFocus.focus();
      }
    };
  }, [actor]);

  // Filmographie de l'acteur (Wikidata), rapprochée du catalogue : tous les films
  // disponibles, pas seulement ceux dont la fiche a déjà été ouverte.
  const [filmography, setFilmography] = useState<{
    actor: string;
    status: 'idle' | 'loading' | 'ready' | 'error';
    entries: FilmographyEntry[];
  }>({ actor: '', status: 'idle', entries: [] });

  useEffect(() => {
    if (!actor) {
      setFilmography({ actor: '', status: 'idle', entries: [] });

      return;
    }

    let cancelled = false;

    setFilmography({ actor, status: 'loading', entries: [] });

    loadFilmography(actor)
      .then((entries) => {
        if (!cancelled) setFilmography({ actor, status: 'ready', entries });
      })
      .catch(() => {
        if (!cancelled) setFilmography({ actor, status: 'error', entries: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [actor]);

  const titleIndex = useMemo(
    () => (actor ? buildTitleIndex(visibleMovies) : null),
    [actor, visibleMovies]
  );

  const filmographyMovies = useMemo(
    () =>
      titleIndex && filmography.actor === actor
        ? matchFilmography(filmography.entries, titleIndex)
        : EMPTY_MOVIES,
    [titleIndex, filmography, actor]
  );

  const actorMovies =
    useMemo(() => {
      if (!actor) return [];

      const wanted =
        normalizeMovieText(
          actor
        );

      const fromCache = visibleMovies
        .filter((movie) => {
          const metadata =
            index.get(movie.id);

          return Boolean(
            metadata?.cast.some(
              (name) =>
                normalizeMovieText(
                  name
                ) === wanted
            )
          );
        })
        ;

      // Fiches déjà ouvertes + filmographie : on fusionne sans doublon.
      const merged = new Map<string, CatalogMovie>();

      for (const movie of fromCache) merged.set(movie.id, movie);
      for (const movie of filmographyMovies) merged.set(movie.id, movie);

      return [...merged.values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }, [
      actor,
      visibleMovies,
      index,
      filmographyMovies,
    ]);

  const actorPageCount =
    Math.max(
      1,
      Math.ceil(
        actorMovies.length /
          ACTOR_PAGE_SIZE
      )
    );

  const effectiveActorPage =
    Math.min(
      actorPage,
      actorPageCount
    );

  const visibleActorMovies =
    actorMovies.slice(
      (
        effectiveActorPage - 1
      ) * ACTOR_PAGE_SIZE,
      effectiveActorPage *
        ACTOR_PAGE_SIZE
    );

  const recommendations =
    useMemo(() => {
      const result:
        Recommendation[] = [];

      for (const movie of
        visibleMovies) {
        if (
          movie.id === movieId
        ) {
          continue;
        }

        const metadata =
          index.get(movie.id);

        let score = 0;
        let reason = '';

        if (
          details &&
          metadata
        ) {
          const genreMatches =
            commonNames(
              details.genres,
              metadata.genres
            );

          const directorMatches =
            commonNames(
              details.directors,
              metadata.directors
            );

          const castMatches =
            commonNames(
              details.cast,
              metadata.cast
            );

          if (
            genreMatches > 0
          ) {
            score +=
              genreMatches * 100;

            reason =
              labels.sameGenre;
          }

          if (
            directorMatches > 0
          ) {
            score += 80;

            if (!reason) {
              reason =
                labels.sameDirector;
            }
          }

          if (
            castMatches > 0
          ) {
            score +=
              Math.min(
                castMatches,
                4
              ) * 20;

            if (!reason) {
              reason =
                labels.sameCast;
            }
          }

          const firstYear =
            Number(
              details.year
            );

          const secondYear =
            Number(
              metadata.year
            );

          if (
            score > 0 &&
            Number.isFinite(
              firstYear
            ) &&
            Number.isFinite(
              secondYear
            ) &&
            firstYear > 0 &&
            secondYear > 0 &&
            Math.abs(
              firstYear -
                secondYear
            ) <= 5
          ) {
            score += 3;
          }
        }

        if (
          currentMovie &&
          currentMovie.categoryId !==
            '0' &&
          movie.categoryId ===
            currentMovie.categoryId
        ) {
          score += 5;

          if (!reason) {
            reason =
              labels.sameCategory;
          }
        }

        if (score > 0) {
          result.push({
            movie,
            score,
            reason,
          });
        }
      }

      return result
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.movie.name
              .localeCompare(
                b.movie.name
              )
        )
        .slice(0, 12);
    }, [
      visibleMovies,
      movieId,
      currentMovie,
      details,
      index,
      labels.sameGenre,
      labels.sameDirector,
      labels.sameCast,
      labels.sameCategory,
    ]);

  async function openMovie(
    movie: CatalogMovie
  ) {
    if (
      !xtreamCredentials ||
      openingRef.current ||
      isCategoryHidden(
        'movies',
        movie.categoryId
      )
    ) {
      return;
    }

    openingRef.current = true;

    const request =
      ++openingRequestRef.current;

    const credentials =
      xtreamCredentials;

    setOpeningId(movie.id);
    setActionError('');

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
        const metadata =
          await loadMovieMetadata(
            sourceKey,
            movie.id,
            credentials
          );

        if (
          request !==
          openingRequestRef.current
        ) {
          return;
        }

        extension =
          cleanExtension(
            metadata.extension
          );
      }

      if (
        !/^[a-z0-9]+$/.test(
          extension
        )
      ) {
        throw new Error(
          labels.invalidFormat
        );
      }

      if (
        request !==
        openingRequestRef.current
      ) {
        return;
      }

      const base =
        credentials.serverUrl
          .trim()
          .replace(/\/+$/, '');

      const nextChannel:
        Channel = {
        id:
          `vod-${encodeURIComponent(base)}-${movie.id}`,
        name: movie.name,
        category:
          catalog.data
            ?.categories.find(
              (category) =>
                category.id ===
                movie.categoryId
            )?.name || '',
        description: '',
        logoColor: '#7c3aed',
        isLive: false,
        logoUrl:
          movie.poster ||
          undefined,
        streamUrl:
          `${base}/movie/` +
          `${encodeURIComponent(credentials.username)}/` +
          `${encodeURIComponent(credentials.password)}/` +
          `${encodeURIComponent(movie.id)}.${extension}`,
        imported: true,
      };

      setActor('');
      setPlayingKey(null);
      setSelectedChannel(
        nextChannel
      );
    } catch (caught) {
      if (
        request ===
        openingRequestRef.current
      ) {
        setActionError(
          errorText(caught, labels.openError)
        );
      }
    } finally {
      if (
        request ===
        openingRequestRef.current
      ) {
        openingRef.current =
          false;

        setOpeningId(null);
      }
    }
  }

  function startPlayback(
    restart = false
  ) {
    if (
      !channel?.streamUrl
    ) {
      return;
    }

    setActionError('');

    if (
      restart &&
      identity &&
      !clearPlaybackProgress(
        identity
      )
    ) {
      setActionError(
        labels.storageError
      );
      return;
    }

    setPlayingKey(
      movieKey
    );
  }

  function openActor(
    name: string
  ) {
    setActor(name);
    setActorPage(1);
  }

  if (!channel) {
    return (
      <div className="px-8 py-10 text-center">
        <p className="text-zinc-300">
          {t(
            'player.noContent'
          )}
        </p>

        <button
          type="button"
          onClick={() =>
            returnFromPlayer(
              'movies',
              'all'
            )
          }
          className="mt-4 rounded-lg bg-accent-600 px-4 py-2 text-sm text-white"
        >
          {t(
            'player.backMovies'
          )}
        </button>
      </div>
    );
  }

  if (playing) {
    return (
      <div className="min-h-full px-8 py-5">
        <button
          type="button"
          onClick={() =>
            setPlayingKey(null)
          }
          className="mb-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />

          {labels.details}
        </button>

        {channel.streamUrl ? (
          <div className="h-[calc(100vh-150px)] min-h-[280px] rounded-2xl bg-transparent">
            <MpvPlayer
              key={movieKey}
              url={
                channel.streamUrl
              }
              title={
                channel.name
              }
              playback={
                identity
              }
            />
          </div>
        ) : (
          <p className="text-zinc-400">
            {t(
              'player.noStreamUrl'
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface-900 px-8 py-6">
      <button
        type="button"
        onClick={() =>
          returnFromPlayer(
            'movies',
            'all'
          )
        }
        className="mb-5 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />

        {backLabelFor(peekReturn(), t, t('player.backMovies'))}
      </button>

      <div className="mx-auto max-w-6xl">
        <div className="grid items-start gap-7 md:grid-cols-[240px_1fr]">
          <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-surface-800">
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="h-16 w-16 text-zinc-600" />
            </div>

            {channel.logoUrl && (
              <img
                key={
                  channel.logoUrl
                }
                src={
                  channel.logoUrl
                }
                alt={
                  channel.name
                }
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

          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-400">
              {t(
                'player.movie'
              )}
            </p>

            <h1 className="text-2xl font-bold text-white lg:text-3xl">
              {channel.name}
            </h1>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                details?.year,
                details?.duration,
                details?.rating
                  ? `${t('player.rating')} : ${details.rating}`
                  : '',
                ...(
                  details?.genres ??
                  []
                ),
              ]
                .filter(Boolean)
                .map(
                  (
                    value,
                    position
                  ) => (
                    <span
                      key={`${value}-${position}`}
                      className="rounded-lg border border-white/5 bg-surface-800 px-3 py-1 text-xs text-zinc-300"
                    >
                      {value}
                    </span>
                  )
                )}
            </div>

            {progress && (
              <MovieProgressCard
                progress={
                  progress
                }
                percent={
                  progressPercent
                }
                watchedLabel={
                  labels.watched
                }
              />
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={
                  !channel.streamUrl
                }
                onClick={() =>
                  startPlayback(
                    completed
                  )
                }
                className="flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-3 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-40"
              >
                <Play className="h-5 w-5" />

                {
                  playbackLabel
                }
              </button>

              {resumable && (
                <button
                  type="button"
                  onClick={() =>
                    startPlayback(
                      true
                    )
                  }
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-800 px-4 py-3 text-sm text-zinc-200 hover:bg-surface-700"
                >
                  <RotateCcw className="h-4 w-4" />

                  {
                    labels.restart
                  }
                </button>
              )}
            </div>

            {(error ||
              actionError) && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300"
              >
                {actionError ||
                  error}
              </p>
            )}

            {loading && (
              <p className="mt-5 flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />

                {
                  labels.loading
                }
              </p>
            )}

            <h2 className="mt-7 text-sm font-semibold text-white">
              {t(
                'player.synopsis'
              )}
            </h2>

            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-400">
              {details?.plot ||
                (
                  loading
                    ? labels.loading
                    : labels.noPlot
                )}
            </p>

            {Boolean(
              details?.directors
                .length
            ) && (
              <p className="mt-5 text-sm text-zinc-400">
                <span className="text-zinc-200">
                  {
                    labels.director
                  }{' '}
                  :{' '}
                </span>

                {details?.directors.join(
                  ', '
                )}
              </p>
            )}

            {Boolean(
              details?.cast.length
            ) && (
              <section className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-white">
                  {labels.cast}
                </h2>

                <div className="flex flex-wrap gap-2">
                  {details?.cast.map(
                    (name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          openActor(
                            name
                          )
                        }
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-surface-800 px-3 py-2 text-xs text-zinc-300 transition-colors hover:border-accent-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
                      >
                        <UserRound className="h-3.5 w-3.5 text-accent-400" />

                        {name}
                      </button>
                    )
                  )}
                </div>
              </section>
            )}
          </div>
        </div>

        <section className="mt-10 border-t border-white/10 pt-6">
          <h2 className="text-lg font-semibold text-white">
            {labels.similar}
          </h2>

          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {
              labels.recommendationInfo
            }
          </p>

          {recommendations.length >
          0 ? (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {recommendations.map(
                ({
                  movie,
                  reason,
                }) => (
                  <MovieTile
                    key={
                      movie.id
                    }
                    movie={
                      movie
                    }
                    reason={
                      reason
                    }
                    disabled={
                      openingId !==
                      null
                    }
                    onOpen={(
                      item
                    ) => {
                      void openMovie(
                        item
                      );
                    }}
                  />
                )
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-white/5 bg-surface-800/50 p-5 text-sm text-zinc-500">
              {
                labels.noRecommendations
              }
            </p>
          )}
        </section>
      </div>

      {actor && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
          onClick={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setActor('');
            }
          }}
        >
          <section
            ref={
              actorDialogRef
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="actor-movies-title"
            tabIndex={-1}
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-900 shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div>
                <h2
                  id="actor-movies-title"
                  className="text-lg font-semibold text-white"
                >
                  {
                    labels.actorMovies
                  }{' '}
                  {actor}
                </h2>

                <p className="mt-1 flex items-center gap-2 text-xs leading-5 text-zinc-500">
                  {filmography.status === 'loading' && (
                    <Loader2
                      className="h-3 w-3 animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {filmography.status === 'loading'
                    ? labels.actorLoading
                    : filmography.status === 'ready'
                    ? labels.actorSource
                    : filmography.status === 'error'
                    ? labels.actorError
                    : labels.partial}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setActor('')
                }
                aria-label={
                  labels.close
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-zinc-300 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {visibleActorMovies.length >
              0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {visibleActorMovies.map(
                    (movie) => (
                      <MovieTile
                        key={
                          movie.id
                        }
                        movie={
                          movie
                        }
                        disabled={
                          openingId !==
                          null
                        }
                        onOpen={(
                          item
                        ) => {
                          void openMovie(
                            item
                          );
                        }}
                      />
                    )
                  )}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-zinc-400">
                  {filmography.status === 'loading'
                    ? labels.actorLoading
                    : labels.noMatches}
                </p>
              )}

              {actionError && (
                <p
                  role="alert"
                  className="mt-4 text-sm text-amber-300"
                >
                  {
                    actionError
                  }
                </p>
              )}

              {actorPageCount >
                1 && (
                <div className="mt-5 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    disabled={
                      effectiveActorPage <=
                      1
                    }
                    onClick={() =>
                      setActorPage(
                        effectiveActorPage -
                          1
                      )
                    }
                    aria-label={
                      t('movie.page_precedente')
                    }
                    className="rounded-lg bg-surface-700 px-3 py-2 text-sm text-white disabled:opacity-30"
                  >
                    ←
                  </button>

                  <span className="text-xs tabular-nums text-zinc-400">
                    {
                      effectiveActorPage
                    }{' '}
                    /{' '}
                    {
                      actorPageCount
                    }
                  </span>

                  <button
                    type="button"
                    disabled={
                      effectiveActorPage >=
                      actorPageCount
                    }
                    onClick={() =>
                      setActorPage(
                        effectiveActorPage +
                          1
                      )
                    }
                    aria-label={
                      t('movie.page_suivante')
                    }
                    className="rounded-lg bg-surface-700 px-3 py-2 text-sm text-white disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
