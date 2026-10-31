import { useState, type ReactNode } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { CalendarClock, Loader2, RefreshCw, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { errorText } from '@/i18n/backendErrors';
import {
  EPG_COUNTRIES,
  cleanChannelName,
  detectCountryFromName,
  detectEpgCountries,
  reloadEpg,
} from '@/utils/epg';

type RefreshItem = {
  country: string;
  ok: boolean;
  fetchedAt: number;
  channels: number;
  error: string;
};

type Diagnosis = {
  country: string;
  wanted: string;
  guideAgeMinutes: number;
  guideChannels: number;
  matches: string[];
  similar: string[];
  chosen: string;
  hasCurrent: boolean;
  currentTitle: string;
  upcoming: number;
};

const STORAGE_KEY = 'msp_epg_refreshed_at';
// Un guide téléchargé il y a moins de 10 minutes compte comme « tout juste mis à jour ».
const FRESH_SECONDS = 600;

function readLastUpdate(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));

    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
            <CalendarClock className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">{title}</p>
            <p className="mt-1 text-xs leading-6 text-zinc-500">{description}</p>
          </div>
        </div>
      </div>

      {children}
    </div>
  );
}

// Réglages du guide des programmes : mise à jour manuelle et vérification
// d'une chaîne.
export default function EpgSettings() {
  const { t, importedChannels, locale } = useApp();
  const desktop = isTauri();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [lastUpdate, setLastUpdate] = useState(readLastUpdate);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('auto');
  const [checking, setChecking] = useState(false);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [checkError, setCheckError] = useState('');

  async function refresh() {
    setBusy(true);
    setMessage(null);

    try {
      const countries = detectEpgCountries(importedChannels);
      const report = countries.length
        ? await invoke<RefreshItem[]>('refresh_public_epg', { countries })
        : [];

      reloadEpg();

      const now = Math.floor(Date.now() / 1000);
      const fresh = report.filter((item) => item.ok && now - item.fetchedAt < FRESH_SECONDS);
      const kept = report.filter((item) => !fresh.includes(item));
      const list = (items: RefreshItem[]) =>
        items.map((item) => item.country.toUpperCase()).join(', ');

      if (fresh.length) {
        try {
          localStorage.setItem(STORAGE_KEY, String(now));
        } catch {
          // Simple confort d'affichage.
        }

        setLastUpdate(now);
      }

      if (kept.length) {
        const failed = kept
          .map((item) =>
            item.error
              ? `${item.country.toUpperCase()} (${errorText(item.error, '')})`
              : item.country.toUpperCase()
          )
          .join(' ; ');

        setMessage({
          error: fresh.length === 0,
          text: fresh.length
            ? t('epg.refreshedSome', { ok: list(fresh), failed })
            : t('epg.refreshedKept', { countries: failed }),
        });
      } else {
        setMessage({
          error: false,
          text: fresh.length
            ? t('epg.refreshed', { countries: list(fresh) })
            : t('epg.refreshedProviderOnly'),
        });
      }
    } catch (caught) {
      setMessage({
        error: true,
        text: t('epg.refreshFailed', { error: errorText(caught, '') }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    const wanted = cleanChannelName(name);

    if (!wanted) return;

    setChecking(true);
    setDiagnosis(null);
    setCheckError('');

    try {
      setDiagnosis(
        await invoke<Diagnosis>('epg_diagnose', {
          // « Auto » : le pays cité dans le nom tapé (France 2 → FR), sinon le
          // pays le plus présent parmi vos chaînes.
          countryCode:
            country !== 'auto'
              ? country
              : detectCountryFromName(name) ??
                detectEpgCountries(importedChannels)[0] ??
                'fr',
          channelName: wanted,
        })
      );
    } catch (caught) {
      setCheckError(errorText(caught, ''));
    } finally {
      setChecking(false);
    }
  }

  const button =
    'inline-flex h-10 items-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400';

  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-surface-700 bg-surface-800">
      <Row title={t('epg.refreshLabel')} description={t('epg.refreshHint')}>
        <div className="mt-4 flex flex-wrap items-center gap-4 pl-[52px]">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!desktop || busy}
            className={button}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? t('epg.refreshing') : t('epg.refreshButton')}
          </button>

          {!desktop && (
            <span className="text-xs text-zinc-500">{t('epg.desktopOnly')}</span>
          )}

          {lastUpdate > 0 && (
            <span className="text-xs text-zinc-500">
              {t('epg.lastUpdate', {
                date: new Date(lastUpdate * 1000).toLocaleString(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </span>
          )}
        </div>

        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            className={`mt-3 pl-[52px] text-sm ${
              message.error ? 'text-red-300' : 'text-emerald-300'
            }`}
          >
            {message.text}
          </p>
        )}
      </Row>

      <Row title={t('epg.checkLabel')} description={t('epg.checkHint')}>
        <form
          className="mt-4 flex flex-wrap items-center gap-3 pl-[52px]"
          onSubmit={(event) => {
            event.preventDefault();
            void check();
          }}
        >
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('epg.checkPlaceholder')}
            aria-label={t('epg.checkLabel')}
            className="h-10 w-64 rounded-xl border border-surface-600 bg-surface-900 px-4 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-accent-500"
          />

          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            aria-label={t('epg.checkCountryLabel')}
            title={t('epg.checkCountryLabel')}
            className="h-10 rounded-xl border border-surface-600 bg-surface-900 px-3 text-sm text-white outline-none focus:border-accent-500"
          >
            <option value="auto">{t('epg.countryAuto')}</option>
            {EPG_COUNTRIES.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>

          <button type="submit" disabled={!desktop || checking || !name.trim()} className={button}>
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {checking ? t('epg.checking') : t('epg.checkButton')}
          </button>
        </form>

        {checkError && (
          <p role="alert" className="mt-3 pl-[52px] text-sm text-red-300">
            {checkError}
          </p>
        )}

        {diagnosis && (
          <div className="mt-3 space-y-1 pl-[52px] text-sm text-zinc-300" role="status">
            <p className="text-xs text-zinc-500">
              {t('epg.checkCountry', { country: diagnosis.country.toUpperCase() })} ·{' '}
              {t('epg.checkSummary', {
                country: diagnosis.country.toUpperCase(),
                channels: diagnosis.guideChannels,
                minutes: diagnosis.guideAgeMinutes,
              })}
            </p>

            {diagnosis.matches.length === 0 ? (
              <>
                <p>{t('epg.checkNotFound')}</p>

                {diagnosis.similar.length > 0 && (
                  <p className="text-zinc-400">
                    {t('epg.checkSimilar', { names: diagnosis.similar.join(', ') })}
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  {t('epg.checkFound', {
                    id: diagnosis.chosen || diagnosis.matches[0],
                    upcoming: diagnosis.upcoming,
                  })}
                </p>

                <p className="text-zinc-400">
                  {diagnosis.hasCurrent
                    ? t('epg.checkNow', { title: diagnosis.currentTitle })
                    : t('epg.checkNoCurrent')}
                </p>
              </>
            )}
          </div>
        )}
      </Row>
    </div>
  );
}
