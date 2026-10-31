import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import type { Channel } from '@/types';
import { useApp } from '@/context/AppContext';
import { useEpg } from '@/utils/epg';
import { getChannelPresentation } from '@/utils/channelPresentation';
import { Heart, Play } from 'lucide-react';

interface Props {
  channel: Channel;
  onPlay?: () => void;
  variant?: 'default' | 'compact';
}

function ChannelCard({
  channel,
  onPlay,
  variant = 'default',
}: Props) {
  const {
    isFavorite,
    toggleFavorite,
    setSelectedChannel,
    setCurrentPage,
    xtreamCredentials,
    t,
  } = useApp();

  const cardRef = useRef<HTMLDivElement>(null);

  const [visible, setVisible] = useState(false);
  const [failedLogoUrl, setFailedLogoUrl] =
    useState<string | null>(null);

  const fav = isFavorite(channel.id);

  const presentation = useMemo(
    () =>
      getChannelPresentation(
        channel.name,
        Boolean(channel.isLive)
      ),
    [channel.name, channel.isLive]
  );

  const logoUrl = channel.logoUrl?.trim() || '';

  const showLogo =
    Boolean(logoUrl) &&
    failedLogoUrl !== logoUrl;

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      {
        rootMargin: '100px',
        threshold: 0,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const { now } = useEpg(
    channel,
    xtreamCredentials,
    visible &&
      Boolean(channel.isLive) &&
      Boolean(channel.streamUrl)
  );

  const programmeTitle = channel.isLive
    ? now?.title ?? ''
    : channel.description ?? '';

  const favoriteLabel = fav
    ? t('channel.retirer_des_favoris', { name: presentation.name })
    : t('channel.ajouter_aux_favoris', { name: presentation.name });

  const playLabel =
    `${t('player.play')} ${presentation.name}`;

  const qualityLabel = t('channel.qualite_indiquee_par_la_source');

  function handlePlay() {
    // Conserve l'objet original pour les identifiants,
    // le flux, les favoris et l'EPG.
    setSelectedChannel(channel);
    setCurrentPage('player');
    onPlay?.();
  }

  function handleFav(
    event: MouseEvent<HTMLButtonElement>
  ) {
    event.stopPropagation();
    toggleFavorite(channel);
  }

  function handleLogoError() {
    setFailedLogoUrl(logoUrl);
  }

  if (variant === 'compact') {
    return (
      <div
        ref={cardRef}
        className="group flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800 p-3 transition-colors duration-200 hover:border-surface-500"
      >
        <button
          type="button"
          onClick={handlePlay}
          aria-label={playLabel}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-white/5 bg-black/20 p-2">
            {showLogo ? (
              <img
                key={logoUrl}
                src={logoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain object-center"
                onError={handleLogoError}
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{
                  backgroundColor:
                    channel.logoColor || '#3b82f6',
                }}
              >
                {presentation.initials}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p
                title={channel.name}
                className="min-w-0 truncate text-sm font-medium text-zinc-200"
              >
                {presentation.name}
              </p>

              {presentation.quality && (
                <span
                  title={qualityLabel}
                  className="shrink-0 rounded border border-accent-400/20 bg-accent-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent-300"
                >
                  {presentation.quality}
                </span>
              )}
            </div>

            <p
              title={programmeTitle || undefined}
              className="mt-1 min-h-[1rem] truncate text-xs text-zinc-400"
            >
              {programmeTitle || '\u00A0'}
            </p>

            <p
              title={channel.category}
              className="mt-1 truncate text-[10px] text-zinc-500"
            >
              {channel.category}
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleFav}
          aria-label={favoriteLabel}
          aria-pressed={fav}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
            fav
              ? 'text-red-500'
              : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
          }`}
        >
          <Heart
            className={`h-4 w-4 ${
              fav ? 'fill-current' : ''
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className="group relative overflow-hidden rounded-2xl border border-surface-700 bg-surface-800 transition-colors duration-200 hover:border-surface-500"
    >
      <div className="relative aspect-video overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(59, 130, 246, 0.10), rgba(124, 58, 237, 0.06), #141418)',
          }}
        />

        <div className="absolute inset-0 flex items-center justify-center px-6 pb-4 pt-10">
          {showLogo ? (
            <img
              key={logoUrl}
              src={logoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full max-w-[180px] object-contain object-center"
              onError={handleLogoError}
            />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white"
              style={{
                backgroundColor:
                  channel.logoColor || '#3b82f6',
              }}
            >
              {presentation.initials}
            </div>
          )}
        </div>

        {channel.isLive && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600/90 px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />

            <span className="text-[10px] font-bold uppercase tracking-wider text-white">
              {t('player.live')}
            </span>
          </div>
        )}

        {presentation.quality && (
          <span
            title={qualityLabel}
            className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-zinc-200"
          >
            {presentation.quality}
          </span>
        )}

        <button
          type="button"
          onClick={handlePlay}
          aria-label={playLabel}
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-400"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/50 text-white">
            <Play className="h-6 w-6 fill-current" />
          </span>
        </button>
      </div>

      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={handlePlay}
            title={channel.name}
            className="min-w-0 flex-1 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            <h3 className="truncate text-sm font-semibold text-white">
              {presentation.name}
            </h3>
          </button>

          <button
            type="button"
            onClick={handleFav}
            aria-label={favoriteLabel}
            aria-pressed={fav}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
              fav
                ? 'text-red-500'
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            <Heart
              className={`h-4 w-4 ${
                fav ? 'fill-current' : ''
              }`}
            />
          </button>
        </div>

        <p
          title={programmeTitle || undefined}
          className="mb-3 min-h-[2rem] line-clamp-2 text-xs leading-4 text-zinc-400"
        >
          {programmeTitle || '\u00A0'}
        </p>

        <div className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
          {channel.category && (
            <span
              title={channel.category}
              className="truncate rounded bg-surface-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400"
            >
              {channel.category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Les cartes d'une liste ne se redessinent que si leur chaîne change : taper dans
// la recherche ne redessine plus les 60 cartes affichées pour rien.
export default memo(ChannelCard);
