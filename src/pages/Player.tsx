import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import { backLabelFor } from '@/utils/backLabel';
import { useApp } from '@/context/AppContext';
import LiveEpgDetails from '@/components/LiveEpgDetails';
import VideoPlayer from '@/components/VideoPlayer';
import MpvPlayer from '@/components/MpvPlayer';
import type { PlaybackIdentity } from '@/utils/playbackProgress';
import type { Channel } from '@/types';
import {
  ArrowLeft,
  Clapperboard,
  Film,
  Loader2,
  Play,
  SkipBack,
  SkipForward,
  Tv,
} from 'lucide-react';

type JsonRecord = Record<string, unknown>;

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

type MovieDetails = {
  plot: string;
  duration: string;
  year: string;
  rating: string;
  cast: string;
  director: string;
  genre: string;
};

const EPISODE_PROGRESS_KEY = 'msp_episode_progress_v3';
const PROGRESS_SAVE_INTERVAL_MS = 3000;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function getMediaId(
  streamUrl: string | undefined,
  kind: 'movie' | 'series'
): string | null {
  if (!streamUrl) return null;

  try {
    const url = new URL(streamUrl);

    if (!url.pathname.includes(`/${kind}/`)) {
      return null;
    }

    const filename =
      url.pathname.split('/').pop() || '';

    const match =
      filename.match(/^(\d+)\.[a-z0-9]+$/i);

    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function loadEpisodeProgress(): EpisodeProgress {
  try {
    const raw = localStorage.getItem(
      EPISODE_PROGRESS_KEY
    );

    return raw
      ? (JSON.parse(raw) as EpisodeProgress)
      : {};
  } catch {
    return {};
  }
}

function saveEpisodeProgressStore(
  progress: EpisodeProgress
) {
  try {
    localStorage.setItem(
      EPISODE_PROGRESS_KEY,
      JSON.stringify(progress)
    );
  } catch {
    // Stockage indisponible.
  }
}

export default function Player() {
  const {
    selectedChannel,
    setSelectedChannel,
    navigate,
    returnFromPlayer,
    peekReturn,
    xtreamCredentials,
    activeProfile,
    sourceKey,
    t,
  } = useApp();

  const [playingId, setPlayingId] =
    useState<string | null>(null);

  const [detailsState, setDetailsState] = useState<{
    channelId: string;
    loading: boolean;
    details: MovieDetails | null;
    error: string;
  }>({
    channelId: '',
    loading: false,
    details: null,
    error: '',
  });

  const channel = selectedChannel;
  const streamUrl = channel?.streamUrl;
  const isLive = channel?.isLive ?? true;

  const showVideo = Boolean(
    channel &&
      (channel.isLive || playingId === channel.id)
  );

  const seriesContext = useMemo<
    SeriesContext | undefined
  >(() => {
    if (!channel) return undefined;
    return (channel as SeriesChannel).seriesContext;
  }, [channel]);

  const isEpisode = Boolean(
    seriesContext && !isLive
  );

  const movieId = useMemo(
    () => getMediaId(streamUrl, 'movie'),
    [streamUrl]
  );

  const episodeId = useMemo(
    () => getMediaId(streamUrl, 'series'),
    [streamUrl]
  );

  const playback = useMemo<
    PlaybackIdentity | undefined
  >(() => {
    if (
      isLive ||
      !activeProfile?.id ||
      !sourceKey
    ) {
      return undefined;
    }

    if (isEpisode && episodeId) {
      return {
        profileId: activeProfile.id,
        sourceKey,
        kind: 'movie',
        itemId: episodeId,
        title: seriesContext?.seriesName
          ? `${seriesContext.seriesName} — S${seriesContext.season}E${seriesContext.episode}`
          : channel?.name || t('player.episode'),
      };
    }

    if (movieId) {
      return {
        profileId: activeProfile.id,
        sourceKey,
        kind: 'movie',
        itemId: movieId,
        title: channel?.name || t('player.movie'),
      };
    }

    return undefined;
  }, [
    isLive,
    isEpisode,
    episodeId,
    movieId,
    activeProfile?.id,
    sourceKey,
    seriesContext,
    channel?.name,
    t,
  ]);

  const lastSavedAtRef = useRef(0);
  const lastPositionRef = useRef(0);

  useEffect(() => {
    if (
      isEpisode &&
      channel?.streamUrl &&
      playingId !== channel.id
    ) {
      setPlayingId(channel.id);
    }
  }, [
    isEpisode,
    channel?.id,
    channel?.streamUrl,
    playingId,
  ]);

  useEffect(() => {
    const currentChannel = channel;

    if (
      !currentChannel ||
      currentChannel.isLive ||
      !xtreamCredentials ||
      isEpisode
    ) {
      return;
    }

    const currentChannelId = currentChannel.id;

    if (!movieId) {
      setDetailsState({
        channelId: currentChannelId,
        loading: false,
        details: null,
        error: t('player.movieIdUnavailable'),
      });

      return;
    }

    let cancelled = false;

    setDetailsState({
      channelId: currentChannelId,
      loading: true,
      details: null,
      error: '',
    });

    async function loadDetails() {
      try {
        const raw = await invoke<unknown>(
          'fetch_xtream_catalog',
          {
            ...xtreamCredentials,
            action: 'get_vod_info',
            itemId: movieId,
          }
        );

        if (cancelled) return;

        const root = asRecord(raw);
        const info = asRecord(root?.info);
        const movieData = asRecord(
          root?.movie_data
        );

        setDetailsState({
          channelId: currentChannelId,
          loading: false,
          details: {
            plot:
              text(info?.plot) ||
              text(info?.description),
            duration: text(info?.duration),
            year:
              text(info?.releasedate) ||
              text(info?.release_date) ||
              text(info?.year) ||
              text(movieData?.year),
            rating: text(info?.rating),
            cast:
              text(info?.cast) ||
              text(info?.actors),
            director: text(info?.director),
            genre: text(info?.genre),
          },
          error: '',
        });
      } catch {
        if (cancelled) return;

        setDetailsState({
          channelId: currentChannelId,
          loading: false,
          details: null,
          error: t('player.detailsUnavailable'),
        });
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [
    channel,
    movieId,
    isLive,
    isEpisode,
    xtreamCredentials,
    t,
  ]);

  function episodeProgressKey(
    context: SeriesContext
  ): string {
    return JSON.stringify([
      context.sourceKey,
      context.seriesId,
      context.episodeId,
    ]);
  }

  function saveCurrentEpisodeProgress(
    positionSeconds: number,
    durationSeconds: number,
    completed = false
  ) {
    if (!seriesContext) return;

    const key = episodeProgressKey(
      seriesContext
    );

    const current = loadEpisodeProgress();
    const previous = current[key];

    const nextPosition = Math.max(
      0,
      positionSeconds
    );

    const nextDuration = Math.max(
      durationSeconds,
      previous?.durationSeconds ?? 0
    );

    const ratio =
      nextDuration > 0
        ? nextPosition / nextDuration
        : 0;

    const remaining =
      nextDuration > 0
        ? nextDuration - nextPosition
        : Number.POSITIVE_INFINITY;

    const isFinished =
      completed ||
      (nextDuration > 0 &&
        (remaining <= 30 || ratio >= 0.95));

    current[key] = {
      season: seriesContext.season,
      episode: seriesContext.episode,
      positionSeconds: nextPosition,
      durationSeconds: nextDuration,
      completed: isFinished,
      updatedAt: Date.now(),
    };

    saveEpisodeProgressStore(current);
  }

  function handleProgress(
    position: number,
    duration: number
  ) {
    if (!isEpisode || !seriesContext) return;

    const now = Date.now();

    if (
      now - lastSavedAtRef.current <
      PROGRESS_SAVE_INTERVAL_MS
    ) {
      return;
    }

    lastSavedAtRef.current = now;
    lastPositionRef.current = position;

    saveCurrentEpisodeProgress(
      position,
      duration
    );
  }

  function handleBack() {
    if (!channel) return;

    // Le retour ramène là où la lecture a été lancée (accueil, résultats de
    // recherche, favoris…) ; sinon, à la liste correspondante.
    if (channel.isLive) {
      returnFromPlayer('live', 'all');
      return;
    }

    if (isEpisode) {
      returnFromPlayer('series', 'all');
      return;
    }

    if (showVideo) {
      setPlayingId(null);
      return;
    }

    returnFromPlayer('movies', 'all');
  }

  function playPreviousEpisode() {
    const previous =
      seriesContext?.previousChannel;

    if (!previous) return;

    saveCurrentEpisodeProgress(
      lastPositionRef.current,
      0,
      false
    );

    lastSavedAtRef.current = 0;
    lastPositionRef.current = 0;

    setSelectedChannel(previous);
    setPlayingId(previous.id);
  }

  function playNextEpisode() {
    const next = seriesContext?.nextChannel;

    if (!next) return;

    saveCurrentEpisodeProgress(
      lastPositionRef.current,
      0,
      false
    );

    lastSavedAtRef.current = 0;
    lastPositionRef.current = 0;

    setSelectedChannel(next);
    setPlayingId(next.id);
  }

  function handleEpisodeEnded() {
    saveCurrentEpisodeProgress(
      lastPositionRef.current,
      0,
      true
    );

    if (seriesContext?.nextChannel) {
      const next = seriesContext.nextChannel;

      lastSavedAtRef.current = 0;
      lastPositionRef.current = 0;

      setSelectedChannel(next);
      setPlayingId(next.id);
      return;
    }

    navigate('series', 'all');
  }

  if (!channel) {
    return (
      <div className="min-h-full bg-surface-900 px-8 py-12 text-center">
        <p className="text-lg font-semibold text-white">
          {t('player.noContent')}
        </p>

        <button
          type="button"
          onClick={() => navigate('home', 'all')}
          className="mt-5 rounded-lg bg-accent-600 px-4 py-2 text-sm text-white hover:bg-accent-500"
        >
          {t('nav.backHome')}
        </button>
      </div>
    );
  }

  const details =
    detailsState.channelId === channel.id
      ? detailsState.details
      : null;

  const loadingDetails =
    detailsState.channelId === channel.id &&
    detailsState.loading;

  // « Retour à la recherche », « … à l'accueil », « … à Live TV » : selon
  // la page d'où la lecture a été lancée.
  const backFallback = channel.isLive
    ? t('player.backLiveTv')
    : isEpisode
    ? t('player.backSeries')
    : showVideo
    ? t('player.backMovieDetails')
    : t('player.backMovies');

  const backText =
    !channel.isLive && !isEpisode && showVideo
      ? backFallback
      : backLabelFor(peekReturn(), t, backFallback);

  const detailsError =
    detailsState.channelId === channel.id
      ? detailsState.error
      : '';

  return (
    <div
      className={
        showVideo
          ? 'min-h-full px-8 py-5'
          : 'min-h-full bg-surface-900 px-8 py-6'
      }
    >
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />

        {backText}
      </button>

      <div
        className={`mx-auto ${
          showVideo ? 'max-w-none' : 'max-w-5xl'
        }`}
      >
        {showVideo ? (
          <>
            {channel.streamUrl ? (
              channel.isLive ? (
                <VideoPlayer channel={channel} />
              ) : (
                <div className="h-[calc(100vh-220px)] min-h-[280px] rounded-2xl bg-transparent">
                  <MpvPlayer
                    key={channel.id}
                    url={channel.streamUrl}
                    playback={playback}
                    title={channel.name}
                    onEnded={
                      isEpisode
                        ? handleEpisodeEnded
                        : undefined
                    }
                    onProgress={
                      isEpisode
                        ? handleProgress
                        : undefined
                    }
                  />
                </div>
              )
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-2xl bg-surface-800 px-6 text-center text-zinc-400">
                <Tv className="mr-3 h-6 w-6 shrink-0" />
                {t('player.noStreamUrl')}
              </div>
            )}

            {channel.isLive ? (
              <LiveEpgDetails
                key={channel.id}
                channel={channel}
              />
            ) : (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-semibold text-white">
                    {channel.name}
                  </h1>

                  <p className="mt-1 text-sm text-zinc-400">
                    {channel.category}
                  </p>
                </div>

                {isEpisode && (
                  <div className="flex shrink-0 items-center gap-2">
                    {seriesContext?.previousChannel && (
                      <button
                        type="button"
                        onClick={playPreviousEpisode}
                        className="flex items-center gap-2 rounded-xl bg-surface-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-surface-600"
                      >
                        <SkipBack className="h-4 w-4" />
                        {t('player.previousEpisode')}
                      </button>
                    )}

                    {seriesContext?.nextChannel && (
                      <button
                        type="button"
                        onClick={playNextEpisode}
                        className="flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
                      >
                        <SkipForward className="h-4 w-4" />
                        {t('player.nextEpisode')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="grid gap-7 md:grid-cols-[240px_1fr]">
            <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-800">
              <div className="absolute inset-0 flex items-center justify-center">
                {isEpisode ? (
                  <Clapperboard className="h-16 w-16 text-zinc-600" />
                ) : (
                  <Film className="h-16 w-16 text-zinc-600" />
                )}
              </div>

              {channel.logoUrl && (
                <img
                  key={channel.logoUrl}
                  src={channel.logoUrl}
                  alt={channel.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display =
                      'none';
                  }}
                />
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-accent-400">
                {isEpisode
                  ? t('player.series')
                  : t('player.vod')}
              </p>

              <h1 className="text-2xl font-bold text-white">
                {isEpisode
                  ? seriesContext?.seriesName ||
                    channel.name
                  : channel.name}
              </h1>

              <p className="mt-2 text-sm text-zinc-400">
                {isEpisode
                  ? `${t('player.season')} ${seriesContext?.season} · ${t('player.episode')} ${seriesContext?.episode}`
                  : channel.category}
              </p>

              {!isEpisode && (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[
                      details?.year,
                      details?.duration,
                      details?.rating
                        ? `${t('player.rating')} : ${details.rating}`
                        : '',
                    ]
                      .filter(Boolean)
                      .map((value, index) => (
                        <span
                          key={index}
                          className="rounded-lg bg-surface-700 px-3 py-1 text-xs text-zinc-300"
                        >
                          {value}
                        </span>
                      ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setPlayingId(channel.id)
                    }
                    disabled={!channel.streamUrl}
                    className="mt-6 flex items-center gap-2 rounded-xl bg-accent-600 px-6 py-3 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-40"
                  >
                    <Play className="h-5 w-5" />
                    {t('player.playMovie')}
                  </button>

                  {playback && (
                    <p className="mt-3 text-xs leading-5 text-zinc-500">
                      {t('player.progressSavedFor')}{' '}
                      {activeProfile?.name}.
                    </p>
                  )}

                  {loadingDetails && (
                    <p className="mt-6 flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('player.loadingDetails')}
                    </p>
                  )}

                  {detailsError && (
                    <p className="mt-6 text-sm text-amber-300">
                      {detailsError}
                    </p>
                  )}

                  <h2 className="mt-7 text-sm font-semibold text-white">
                    {t('player.synopsis')}
                  </h2>

                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-400">
                    {details?.plot ||
                      (loadingDetails
                        ? t('settings.loading')
                        : t('player.noSynopsis'))}
                  </p>

                  <div className="mt-6 space-y-3 text-sm">
                    {details?.genre && (
                      <p className="text-zinc-400">
                        <span className="text-zinc-200">
                          {t('player.genre')} :{' '}
                        </span>
                        {details.genre}
                      </p>
                    )}

                    {details?.director && (
                      <p className="text-zinc-400">
                        <span className="text-zinc-200">
                          {t('player.director')} :{' '}
                        </span>
                        {details.director}
                      </p>
                    )}

                    {details?.cast && (
                      <p className="text-zinc-400">
                        <span className="text-zinc-200">
                          {t('player.cast')} :{' '}
                        </span>
                        {details.cast}
                      </p>
                    )}
                  </div>
                </>
              )}

              {isEpisode && channel.description && (
                <>
                  <h2 className="mt-7 text-sm font-semibold text-white">
                    {t('player.synopsis')}
                  </h2>

                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-zinc-400">
                    {channel.description}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}