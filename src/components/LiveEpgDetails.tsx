import { useEffect, useState } from 'react';
import type { Channel } from '@/types';
import { useApp } from '@/context/AppContext';
import { useEpg } from '@/utils/epg';

type Props = {
  channel: Channel;
};

function formatClock(seconds: number, locale: string): string {
  return new Date(seconds * 1000).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default function LiveEpgDetails({ channel }: Props) {
  const { xtreamCredentials, t, locale } = useApp();

  const { now, next } = useEpg(
    channel,
    xtreamCredentials,
    Boolean(channel.streamUrl)
  );

  const [currentTime, setCurrentTime] = useState(
    () => Date.now() / 1000
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now() / 1000);
    }, 15_000);

    return () => window.clearInterval(timer);
  }, []);

  // Un programme sans durée ne doit pas produire NaN dans la barre.
  const length = now ? now.end - now.start : 0;

  const progress =
    now && length > 0
      ? Math.max(
          0,
          Math.min(100, ((currentTime - now.start) / length) * 100)
        )
      : 0;

  const remainingMinutes = now
    ? Math.max(0, Math.ceil((now.end - currentTime) / 60))
    : 0;

  return (
    <section
      aria-label={t('epgPanel.guide_des_programmes')}
      className="mt-5 rounded-2xl border border-white/10 bg-surface-800/60 p-5"
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-500" />

            <span className="text-xs font-semibold uppercase tracking-wider text-accent-400">
              {t('epgPanel.en_ce_moment')}
            </span>
          </div>

          <p className="break-words text-lg font-semibold text-white">
            {now?.title ||
              t('epgPanel.programme_non_disponible')}
          </p>

          {now && (
            <>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <span>
                  {formatClock(now.start, locale)} –{' '}
                  {formatClock(now.end, locale)}
                </span>

                <span>
                  {t('epgPanel.encore_min', { remainingMinutes })}
                </span>
              </div>

              <div
                role="progressbar"
                aria-label={t('epgPanel.progression_du_programme')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full bg-accent-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 border-t border-white/10 pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            {t('epgPanel.a_suivre')}
          </p>

          <p className="break-words text-base font-medium text-zinc-200">
            {next?.title ||
              t('epgPanel.programme_suivant_non_disponible')}
          </p>

          {next && (
            <p className="mt-3 text-xs text-zinc-400">
              {formatClock(next.start, locale)} –{' '}
              {formatClock(next.end, locale)}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
