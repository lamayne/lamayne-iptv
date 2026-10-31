import { useEffect, useRef, useState } from 'react';
import { Cast, Loader2, RefreshCw, Tv, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  castPlay,
  castStop,
  castSupported,
  castTarget,
  discoverCastDevices,
  audioSupport,
  type CastAudio,
  type CastDevice,
} from '@/utils/cast';

// Bouton « Diffuser » du lecteur : liste les appareils Google du réseau local
// et leur envoie le flux en cours. Caché tant que le moteur Rust n'est pas
// activé (voir src-tauri/src/cast.rs).

type Props = {
  streamUrl: string;
  isLive: boolean;
  // Piste audio que l'appareil jouera (films et séries seulement).
  audio?: CastAudio | null;
  // Appelé quand la diffusion démarre : le lecteur local se met en pause
  // (la plupart des fournisseurs limitent le nombre de connexions).
  onStarted: () => void;
};

type Phase = 'idle' | 'searching' | 'sending';

export default function CastMenu({ streamUrl, isLive, audio, onStarted }: Props) {
  const { t } = useApp();

  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [devices, setDevices] = useState<CastDevice[]>([]);
  const [casting, setCasting] = useState<CastDevice | null>(null);
  const [message, setMessage] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    void castSupported().then((value) => {
      if (!cancelled) setSupported(value);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Ferme le menu en cliquant ailleurs ou avec Échap.
  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  async function search() {
    setPhase('searching');
    setMessage('');

    try {
      setDevices(await discoverCastDevices());
    } catch (error) {
      setDevices([]);
      setMessage(typeof error === 'string' ? error : t('cast.recherche_impossible'));
    } finally {
      setPhase('idle');
    }
  }

  function toggle() {
    const next = !open;

    setOpen(next);

    if (next && !casting) void search();
  }

  async function sendTo(device: CastDevice) {
    setPhase('sending');
    setMessage('');

    try {
      await castPlay(device, castTarget(streamUrl, isLive));
      setCasting(device);
      onStarted();
    } catch (error) {
      setMessage(
        typeof error === 'string'
          ? error
          : t('cast.la_diffusion_a_echoue')
      );
    } finally {
      setPhase('idle');
    }
  }

  async function stop() {
    if (!casting) return;

    setPhase('sending');
    setMessage('');

    try {
      await castStop(casting);
      setCasting(null);
      setOpen(false);
    } catch (error) {
      setMessage(
        typeof error === 'string' ? error : t('cast.arret_impossible')
      );
    } finally {
      setPhase('idle');
    }
  }

  if (!supported) return null;

  const label = casting
    ? t('cast.diffuse_sur', { name: casting.name })
    : t('cast.diffuser_sur_un_appareil_google');

  const warning = castTarget(streamUrl, isLive).warning;
  const sound = audio ? audioSupport(audio.codec) : 'unknown';
  const soundLabel = audio
    ? [audio.language, audio.codec.toUpperCase(), audio.title]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
        className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition-all duration-200 ${
          casting
            ? 'border-accent-400/60 bg-accent-500/25 text-white shadow-accent-glow'
            : 'border-white/10 bg-white/5 text-surface-100 hover:border-accent-400/40 hover:bg-accent-500/15 hover:text-white'
        }`}
      >
        <Cast className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('cast.diffuser')}
          className="absolute bottom-full right-0 z-40 mb-3 w-72 rounded-2xl border border-white/10 bg-surface-900/95 p-3 text-sm text-zinc-200 shadow-card backdrop-blur-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-semibold text-white">
              {casting ? t('cast.diffusion_en_cours') : t('cast.diffuser_sur')}
            </p>

            {!casting && (
              <button
                type="button"
                onClick={() => void search()}
                disabled={phase !== 'idle'}
                aria-label={t('cast.relancer_la_recherche')}
                title={t('cast.relancer_la_recherche')}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 disabled:opacity-40"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${phase === 'searching' ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {casting ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-zinc-300">
                <Tv className="h-4 w-4 shrink-0 text-accent-400" />
                <span className="truncate">{casting.name}</span>
              </p>

              <button
                type="button"
                onClick={() => void stop()}
                disabled={phase !== 'idle'}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 font-medium text-white hover:bg-white/15 disabled:opacity-50"
              >
                {phase === 'sending' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                {t('cast.arreter_la_diffusion')}
              </button>
            </div>
          ) : phase === 'searching' && devices.length === 0 ? (
            <p className="flex items-center gap-2 py-3 text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('cast.recherche_des_appareils')}
            </p>
          ) : devices.length > 0 ? (
            <ul className="space-y-1">
              {devices.map((device) => (
                <li key={device.id}>
                  <button
                    type="button"
                    onClick={() => void sendTo(device)}
                    disabled={phase !== 'idle'}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/10 disabled:opacity-50"
                  >
                    <Tv className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-white">{device.name}</span>
                      {device.model && (
                        <span className="block truncate text-xs text-zinc-400">{device.model}</span>
                      )}
                    </span>
                    {phase === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-xs leading-5 text-zinc-400">
              {t('cast.aucun_appareil_google_trouve_verifiez_qu')}
            </p>
          )}

          {message && (
            <p role="alert" className="mt-2 text-xs leading-5 text-amber-300">
              {message}
            </p>
          )}

          {warning && !casting && (
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              {t('cast.ce_format_n_est_pas_lu')}
            </p>
          )}

          {audio && !casting && (
            <p
              className={`mt-2 text-xs leading-5 ${
                sound === 'no'
                  ? 'text-amber-300'
                  : sound === 'maybe'
                  ? 'text-amber-200'
                  : 'text-zinc-300'
              }`}
            >
              {t('cast.son_envoye_a_l_appareil')}
              <span className="font-medium">{soundLabel || t('cast.inconnu')}</span>
              {audio.count > 1 &&
                t('cast.1_piste_sur', { count: audio.count })}
              {sound === 'no' &&
                t('cast.ce_format_n_est_pas_lu_2')}
              {sound === 'maybe' &&
                t('cast.selon_le_modele_le_son_dolby')}
            </p>
          )}

          <p className="mt-2 text-xs leading-5 text-zinc-400">
            {t('cast.la_piste_audio_et_les_sous')}
          </p>

          <p className="mt-2 border-t border-white/10 pt-2 text-[11px] leading-4 text-zinc-500">
            {t('cast.l_adresse_du_flux_qui_contient')}
          </p>
        </div>
      )}
    </div>
  );
}
