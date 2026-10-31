import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Heart } from 'lucide-react';
import type { Channel } from '@/types';
import { useApp } from '@/context/AppContext';
import { useEpg } from '@/utils/epg';
import { getChannelPresentation } from '@/utils/channelPresentation';

// Carte de chaîne de l'accueil : logo, nom, programme en cours et sa
// progression. Plus courte et plus étroite que la carte de la page Live TV,
// sans la ligne de catégorie.

export default function HomeChannelCard({ channel }: { channel: Channel }) {
  const {
    isFavorite,
    toggleFavorite,
    setSelectedChannel,
    setCurrentPage,
    xtreamCredentials,
    t,
  } = useApp();

  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now() / 1000);
  const fav = isFavorite(channel.id);

  const presentation = useMemo(
    () => getChannelPresentation(channel.name, Boolean(channel.isLive)),
    [channel.name, channel.isLive]
  );

  const logoUrl = channel.logoUrl?.trim() || '';
  const showLogo = Boolean(logoUrl) && failedLogo !== logoUrl;

  // Le guide n'est demandé que pour les cartes réellement visibles à l'écran.
  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '100px', threshold: 0 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const { now } = useEpg(
    channel,
    xtreamCredentials,
    visible && Boolean(channel.isLive) && Boolean(channel.streamUrl)
  );

  // Fait avancer la barre sans redemander le guide.
  useEffect(() => {
    if (!visible || !now) return;

    setClock(Date.now() / 1000);

    const timer = window.setInterval(
      () => setClock(Date.now() / 1000),
      30_000
    );

    return () => window.clearInterval(timer);
  }, [visible, now]);

  const progress =
    now && now.end > now.start
      ? Math.max(0, Math.min(1, (clock - now.start) / (now.end - now.start)))
      : 0;

  const playLabel = `${t('player.play')} ${presentation.name}`;

  const favoriteLabel = fav
    ? t('channel.retirer_des_favoris', { name: presentation.name })
    : t('channel.ajouter_aux_favoris', { name: presentation.name });

  function handlePlay() {
    // Conserve l'objet d'origine : flux, favoris et guide en dépendent.
    setSelectedChannel(channel);
    setCurrentPage('player');
  }

  function handleFav(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    toggleFavorite(channel);
  }

  return (
    <div
      ref={ref}
      className="group flex w-[232px] shrink-0 items-center gap-1 rounded-xl border border-surface-700 bg-surface-800 py-2.5 pl-3 pr-1 transition-colors duration-200 hover:border-surface-500"
    >
      <button
        type="button"
        onClick={handlePlay}
        aria-label={playLabel}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-black/20 p-1.5">
          {showLogo ? (
            <img
              key={logoUrl}
              src={logoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-contain"
              onError={() => setFailedLogo(logoUrl)}
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: channel.logoColor || '#3b82f6' }}
            >
              {presentation.initials}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            title={channel.name}
            className="block truncate text-sm font-semibold text-zinc-100"
          >
            {presentation.name}
          </span>

          <span
            title={now?.title || undefined}
            className="mt-0.5 block min-h-[1rem] truncate text-xs text-zinc-300"
          >
            {now?.title ?? '\u00A0'}
          </span>

          <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/10">
            {now && (
              <span
                className="block h-full rounded-full bg-accent-500"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            )}
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={handleFav}
        aria-label={favoriteLabel}
        aria-pressed={fav}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 ${
          fav ? 'text-red-500' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
        }`}
      >
        <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
      </button>
    </div>
  );
}
