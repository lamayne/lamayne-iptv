import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, EyeOff, Pause, Play } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import { cleanMovieTitle } from '@/utils/titleClean';
import { useApp } from '@/context/AppContext';
import type { Translate } from '@/i18n';
import type { FeaturedSlide } from '@/utils/featuredSlides';

// Films et séries « du moment » : les diapositives défilent toutes les 5 s.
// Le défilement s'arrête quand la souris ou le clavier est dessus, peut être
// mis en pause avec le bouton, et ne démarre pas si le système demande de
// réduire les animations.

const ROTATE_MS = 5000;

// "01:14:10" → "1 h 14" ; une valeur déjà lisible ("74 min") est conservée.
function formatDuration(raw: string, t: Translate): string {
  if (!raw) return '';

  const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (!match) return raw.trim();

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours === 0 && minutes === 0) return '';

  if (hours === 0) return t('featured.min', { minutes });

  return t('featured.h', { hours, minutes: String(minutes).padStart(2, '0') });
}

// Beaucoup de titres IPTV finissent par l'année : « Entanglement (2021) ».
// On l'enlève du titre et on l'affiche dans la ligne d'informations.
function splitTitleYear(name: string): { title: string; year: string } {
  const match = name.match(/^(.*\S)\s*\(((?:19|20)\d{2})\)\s*$/);

  return match
    ? { title: cleanMovieTitle(match[1]), year: match[2] }
    : { title: cleanMovieTitle(name), year: '' };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function FeaturedCarousel({
  slides,
  onPlay,
  onDismiss,
}: {
  slides: FeaturedSlide[];
  onPlay: (slide: FeaturedSlide) => void;
  onDismiss: (slide: FeaturedSlide) => void;
}) {
  const { t } = useApp();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  const count = slides.length;
  const current = count > 0 ? index % count : 0;
  const rotating = count > 1 && !paused && !hovered;

  useEffect(() => {
    if (!rotating) return;

    // Une minuterie par diapositive : un clic manuel repart d'un délai complet.
    const timer = window.setTimeout(() => {
      setIndex((value) => (value + 1) % count);
    }, ROTATE_MS);

    return () => window.clearTimeout(timer);
  }, [rotating, current, count]);

  if (count === 0) return null;

  const markFailed = (src: string) =>
    setFailed((previous) =>
      previous.includes(src) ? previous : [...previous, src]
    );

  return (
    <section
      aria-roledescription="carousel"
      aria-label={
        t('featured.films_et_series_du_moment')
      }
      className="relative -mx-8 mt-6 h-[380px] overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      <div
        aria-live={rotating ? 'off' : 'polite'}
        className="absolute inset-0"
      >
        {slides.map((slide, slideIndex) => {
          const active = slideIndex === current;
          const imageOk = !failed.includes(slide.image);
          const titled = splitTitleYear(slide.name);
          const meta = [
            slide.genres.slice(0, 3).join(', '),
            titled.year || slide.year,
            formatDuration(slide.duration, t),
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <div
              key={`${slide.kind}-${slide.id}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${slideIndex + 1} / ${count}`}
              aria-hidden={!active}
              // Toute la diapositive est cliquable à la souris ; le bouton reste
              // l'accès au clavier.
              onClick={active ? () => onPlay(slide) : undefined}
              className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
                active
                  ? 'cursor-pointer opacity-100'
                  : 'pointer-events-none opacity-0'
              }`}
            >
              {imageOk &&
                (slide.imageKind === 'backdrop' ? (
                  // Largeur plafonnée : sur un grand écran, le visuel garde sa
                  // netteté au lieu d'être étiré sur toute la fenêtre.
                  <div className="absolute inset-y-0 right-0 w-[64%] max-w-[920px]">
                    <SmartImage
                      src={slide.image}
                      alt=""
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover object-[50%_25%]"
                      onFailed={() => markFailed(slide.image)}
                    />

                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-r from-surface-900 from-0% via-surface-900/50 via-30% to-transparent to-60%"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-surface-900 to-transparent"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface-900 to-transparent"
                    />
                  </div>
                ) : (
                  <div className="absolute right-12 top-6 h-[332px] w-[221px]">
                    <SmartImage
                      src={slide.image}
                      alt=""
                      decoding="async"
                      draggable={false}
                      className="h-full w-full rounded-xl object-cover shadow-card"
                      onFailed={() => markFailed(slide.image)}
                    />
                  </div>
                ))}

              <div className="relative z-10 flex h-full max-w-[560px] flex-col justify-center gap-3.5 px-8 pb-6">
                <p className="text-xs font-semibold uppercase tracking-widest text-accent-400">
                  {slide.kind === 'movie'
                    ? t('featured.film_du_moment')
                    : t('featured.serie_du_moment')}
                </p>

                <h2 className="text-4xl font-bold leading-tight tracking-tight text-white">
                  {titled.title}
                </h2>

                {meta && <p className="text-sm text-zinc-300">{meta}</p>}

                {slide.plot && (
                  <p className="line-clamp-3 max-w-md text-sm leading-6 text-zinc-300">
                    {slide.plot}
                  </p>
                )}

                <div className="pt-1.5">
                  <button
                    type="button"
                    tabIndex={active ? 0 : -1}
                    onClick={(event) => {
                      // Évite de lancer deux fois (le clic remonte à la diapositive).
                      event.stopPropagation();
                      onPlay(slide);
                    }}
                    className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent-600 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    {slide.kind === 'movie'
                      ? t('featured.regarder')
                      : t('featured.voir_la_serie')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={t('featured.ne_plus_recommander')}
        title={t('featured.ne_plus_recommander')}
        onClick={() => onDismiss(slides[current])}
        className="absolute right-6 top-6 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-zinc-100 backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <EyeOff className="h-4 w-4" aria-hidden="true" />
      </button>

      {count > 1 && (
        <button
          type="button"
          aria-label={t('featured.recommandation_suivante')}
          title={t('featured.recommandation_suivante')}
          onClick={() => setIndex((current + 1) % count)}
          className="absolute right-4 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      {count > 1 && (
        <div className="absolute bottom-3 left-8 z-20 flex items-center gap-0.5">
          <button
            type="button"
            aria-label={t('featured.recommandation_precedente')}
            onClick={() => setIndex((current - 1 + count) % count)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {slides.map((slide, slideIndex) => (
            <button
              key={`${slide.kind}-${slide.id}`}
              type="button"
              aria-label={
                t('featured.diapositive_sur', { number: slideIndex + 1, count })
              }
              aria-current={slideIndex === current}
              onClick={() => setIndex(slideIndex)}
              className="flex h-6 w-6 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
            >
              <span
                className={`h-2 rounded-full transition-all ${
                  slideIndex === current
                    ? 'w-6 bg-accent-400'
                    : 'w-2 bg-white/50'
                }`}
              />
            </button>
          ))}

          <button
            type="button"
            aria-label={t('featured.recommandation_suivante')}
            onClick={() => setIndex((current + 1) % count)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-200 hover:bg-white/15 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-label={
              paused
                ? t('featured.reprendre_le_defilement')
                : t('featured.mettre_le_defilement_en_pause')
            }
            onClick={() => setPaused((value) => !value)}
            className="ml-2 flex h-6 w-6 items-center justify-center rounded text-zinc-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
          >
            {paused ? (
              <Play className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Pause className="h-3.5 w-3.5 fill-current" />
            )}
          </button>
        </div>
      )}
    </section>
  );
}
