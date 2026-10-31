import { useEffect, useState, type ReactNode } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Bug,
  Check,
  ClipboardCopy,
  Coffee,
  ExternalLink,
  Keyboard,
  Loader2,
  Shield,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';

const SUPPORT_URL = 'https://buymeacoffee.com/lamayne';
// Page de contact utilisée pour « Signaler un bug ». Remplacez-la par un
// formulaire ou une adresse (mailto:) quand vous en aurez un dédié.
const CONTACT_URL =
  'https://github.com/lamayne/lamayne-iptv/issues/new?template=bug_report.md';

type LinkKind = 'support' | 'contact';

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-surface-600 bg-surface-900 px-1.5 py-0.5 text-[11px] font-medium text-zinc-200">
      {children}
    </kbd>
  );
}

function Shortcut({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-zinc-300">{label}</span>
      <span className="flex shrink-0 items-center gap-1">{keys}</span>
    </li>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-700 bg-surface-800 p-6">
      <h3 className="mb-4 flex items-center gap-2.5 text-sm font-semibold text-white">
        <span className="text-accent-400">{icon}</span>
        {title}
      </h3>

      {children}
    </section>
  );
}

function systemSummary(): string {
  const agent = navigator.userAgent;
  const windows = agent.match(/Windows NT ([\d.]+)/)?.[1];
  const edge = agent.match(/Edg\/([\d.]+)/)?.[1];

  return [
    windows ? `Windows NT ${windows}` : agent.slice(0, 60),
    edge ? `WebView2 ${edge}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export default function AboutSettings() {
  const { language, xtreamCredentials, importedChannels,
    t } = useApp();

  const [version, setVersion] = useState('');
  const [opening, setOpening] = useState<LinkKind | null>(null);
  const [failedUrl, setFailedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [diagnosticText, setDiagnosticText] = useState('');

  useEffect(() => {
    let cancelled = false;

    void getVersion()
      .then((value) => {
        if (!cancelled) setVersion(value);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function openLink(kind: LinkKind) {
    if (opening) return;

    const url = kind === 'support' ? SUPPORT_URL : CONTACT_URL;

    setOpening(kind);
    setFailedUrl('');

    try {
      await openUrl(url);
    } catch {
      setFailedUrl(url);
    } finally {
      setOpening(null);
    }
  }

  // Aucune information personnelle : ni adresse de serveur, ni identifiant,
  // ni mot de passe.
  function buildDiagnostic(): string {
    const source = xtreamCredentials
      ? `Xtream (${importedChannels.length} ${t('player.channels')})`
      : importedChannels.length > 0
      ? `M3U (${importedChannels.length} ${t('player.channels')})`
      : t('about.aucune');

    return [
      `LAMAYNE IPTV ${version || '?'}`,
      `${t('about.systeme')} : ${systemSummary()}`,
      `${t('settings.language')} : ${language}`,
      `${t('about.source')} : ${source}`,
    ].join('\n');
  }

  async function copyDiagnostic() {
    const text = buildDiagnostic();

    setDiagnosticText(text);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Copie refusée : le texte reste affiché pour être copié à la main.
      setCopied(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-surface-700 bg-surface-800">
        <div className="flex flex-wrap items-center gap-5 p-6 sm:p-8">
          <img
            src="/brand/lamayne-emblem.png"
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-2xl object-contain"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold tracking-wide text-white">
                LAMAYNE IPTV
              </h2>

              {version && (
                <span className="rounded-full border border-surface-600 bg-surface-900 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                  v{version}
                </span>
              )}
            </div>

            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {t('about.un_lecteur_personnel_pour_vos_chaines')}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title={t('about.raccourcis_du_lecteur')}
          icon={<Keyboard className="h-4 w-4" />}
        >
          <ul className="divide-y divide-white/5">
            <Shortcut
              label={t('about.lecture_pause')}
              keys={
                <>
                  <Kbd>{t('about.espace')}</Kbd>
                  <Kbd>K</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.reculer_avancer_de_10_s')}
              keys={
                <>
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.reculer_avancer_de_60_s')}
              keys={
                <>
                  <Kbd>{t('about.maj')}</Kbd>
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('player.volume')}
              keys={
                <>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                </>
              }
            />
            <Shortcut label={t('about.muet')} keys={<Kbd>M</Kbd>} />
            <Shortcut label={t('player.fullscreen')} keys={<Kbd>F</Kbd>} />
            <Shortcut
              label={t('about.image_dans_l_image')}
              keys={<Kbd>P</Kbd>}
            />
            <Shortcut
              label={t('about.chaine_precedente_suivante')}
              keys={
                <>
                  <Kbd>{t('about.page')}</Kbd>
                  <Kbd>{t('about.page_2')}</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.quitter_plein_ecran_pip')}
              keys={<Kbd>{t('about.echap')}</Kbd>}
            />
          </ul>
        </Card>

        <Card
          title={t('about.navigation')}
          icon={<Keyboard className="h-4 w-4" />}
        >
          <ul className="divide-y divide-white/5">
            <Shortcut
              label={t('about.faire_defiler_la_page')}
              keys={
                <>
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <Kbd>{t('about.page')}</Kbd>
                  <Kbd>{t('about.page_2')}</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.debut_fin_de_la_page')}
              keys={
                <>
                  <Kbd>{t('about.debut')}</Kbd>
                  <Kbd>{t('about.fin')}</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.defiler_dans_une_rangee')}
              keys={
                <>
                  <Kbd>←</Kbd>
                  <Kbd>→</Kbd>
                </>
              }
            />
            <Shortcut
              label={t('about.rechercher_accueil')}
              keys={<Kbd>/</Kbd>}
            />
            <Shortcut
              label={t('about.effacer_la_recherche')}
              keys={<Kbd>{t('about.echap')}</Kbd>}
            />
          </ul>

          <p className="mt-4 text-xs leading-5 text-zinc-400">
            {t('about.a_la_souris_cliquez_sur_le')}
          </p>
        </Card>
      </div>

      <Card
        title={t('about.un_probleme_ou_une_idee')}
        icon={<Bug className="h-4 w-4" />}
      >
        <p className="max-w-2xl text-sm leading-7 text-zinc-300">
          {t('about.si_quelque_chose_ne_fonctionne_pas')}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void copyDiagnostic()}
            className="inline-flex items-center gap-2 rounded-xl border border-surface-600 bg-surface-900 px-4 py-3 text-sm font-medium text-zinc-200 transition-colors hover:bg-surface-700 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <ClipboardCopy className="h-4 w-4" />
            )}

            {copied
              ? t('about.copie')
              : t('about.copier_les_infos_de_diagnostic')}
          </button>

          <button
            type="button"
            onClick={() => void openLink('contact')}
            disabled={opening !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400 disabled:opacity-50"
          >
            {opening === 'contact' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bug className="h-4 w-4" />
            )}

            {t('about.signaler_un_bug')}

            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>

        {diagnosticText && (
          <pre className="mt-4 select-all whitespace-pre-wrap rounded-xl border border-surface-700 bg-surface-900 p-3 text-xs leading-5 text-zinc-300">
            {diagnosticText}
          </pre>
        )}
      </Card>

      <Card
        title={t('about.soutenir_le_projet')}
        icon={<Coffee className="h-4 w-4" />}
      >
        <p className="max-w-2xl text-sm leading-7 text-zinc-300">
          {t('about.si_l_application_vous_est_utile')}
        </p>

        <button
          type="button"
          onClick={() => void openLink('support')}
          disabled={opening !== null}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:opacity-50"
        >
          {opening === 'support' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Coffee className="h-4 w-4" />
          )}

          {t('about.soutenir_le_projet')}

          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </Card>

      {failedUrl && (
        <div role="alert" className="text-xs leading-6 text-amber-300">
          <p>
            {t('about.impossible_d_ouvrir_le_navigateur_vous')}
          </p>

          <p className="mt-1 select-all break-all text-zinc-400">{failedUrl}</p>
        </div>
      )}

      <section className="rounded-2xl border border-surface-700 bg-surface-800 p-6">
        <p className="max-w-3xl text-xs leading-6 text-zinc-400">
          {t('about.lamayne_iptv_ne_fournit_aucun_contenu')}
        </p>

        <div className="mt-4 flex items-start gap-3 border-t border-white/5 pt-4">
          <Shield
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
          />

          <p className="text-xs leading-6 text-zinc-400">
            {t('about.les_reglages_et_les_favoris_sont')}
          </p>
        </div>
      </section>
    </div>
  );
}
