import { memo, useState } from 'react';
import { Clapperboard, Film, X } from 'lucide-react';
import SmartImage from '@/components/SmartImage';
import { sharpenImage } from '@/utils/imageUrl';

export type PosterItem = {
  key: string;
  orderKey: string;
  hideKey: string;
  kind: 'movie' | 'series';
  itemId: string;
  title: string;
  subtitle: string;
  // Affiches possibles, essayées dans l'ordre : si l'une ne se charge pas, la suivante prend le relais.
  posters: string[];
  ratio: number;
  extension: string;
  categoryName: string;
};

export function uniquePosters(...values: Array<string | undefined>): string[] {
  const result: string[] = [];

  for (const value of values) {
    const url = value?.trim();

    if (url && !result.includes(url)) result.push(url);
  }

  return result;
}

export const PosterCard = memo(function PosterCard({
  item,
  hideLabel,
  onOpen,
  onHide,
}: {
  item: PosterItem;
  // Sans bouton « retirer » (résultats de recherche), ces deux champs sont omis.
  hideLabel?: string;
  onOpen: (item: PosterItem) => void;
  onHide?: (hideKey: string) => void;
}) {
  const [failedPosters, setFailedPosters] = useState<string[]>([]);
  const Icon = item.kind === 'movie' ? Film : Clapperboard;
  const poster = item.posters.find((url) => !failedPosters.includes(url)) ?? '';
  const showPoster = Boolean(poster);

  return (
    <article className="group relative w-[164px] shrink-0">
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400"
      >
        <span className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-surface-700 bg-surface-750">
          {showPoster ? (
            <SmartImage
              key={poster}
              src={sharpenImage(poster, 'w342')}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
              onFailed={() =>
                setFailedPosters((previous) => [...previous, poster])
              }
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Icon className="h-9 w-9 text-zinc-500" />
            </span>
          )}

          {item.ratio > 0 && (
            <span className="absolute inset-x-0 bottom-0 block h-1 bg-white/15">
              <span
                className="block h-full bg-accent-500"
                style={{ width: `${Math.round(item.ratio * 100)}%` }}
              />
            </span>
          )}
        </span>

        <span className="mt-2 block truncate text-sm font-medium text-zinc-100">
          {item.title}
        </span>

        <span className="block truncate text-xs text-zinc-400">
          {item.subtitle || '\u00A0'}
        </span>
      </button>

      {onHide && (
        <button
          type="button"
          data-no-drag
          aria-label={hideLabel}
          title={hideLabel}
          onClick={() => onHide(item.hideKey)}
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-400 group-hover:opacity-100"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-200">
            <X className="h-3.5 w-3.5" />
          </span>
        </button>
      )}
    </article>
  );
});
