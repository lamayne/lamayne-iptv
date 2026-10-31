import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { invoke } from '@tauri-apps/api/core';
import AboutSettings from '@/components/AboutSettings';
import { useApp } from '@/context/AppContext';
import { AVATAR_COLORS, type SourceType } from '@/types';
import { LANGUAGES, isLanguage } from '@/i18n';
import type { ContentKind } from '@/utils/categoryVisibility';
import { parseM3U } from '@/utils/m3uParser';
import { downloadM3UPlaylist } from '@/utils/tauriBridge';
import {
  Check,
  Clapperboard,
  Eye,
  EyeOff,
  Film,
  Globe,
  Loader2,
  LogOut,
  Palette,
  Pencil,
  Plus,
  Search,
  Server,
  Trash2,
  Tv,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import { errorText } from '@/i18n/backendErrors';
import EpgSettings from '@/components/EpgSettings';

type SourceForm = {
  name: string;
  server: string;
  username: string;
  password: string;
  url: string;
};

type ProfileEditor = {
  id: string | null;
  name: string;
  color: string;
};

type VisibilityFilter = 'all' | 'visible' | 'hidden';

const EMPTY_FORM: SourceForm = {
  name: '',
  server: '',
  username: '',
  password: '',
  url: '',
};

const INPUT =
  'w-full rounded-xl border border-surface-600 bg-surface-900 px-3 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-accent-500 disabled:opacity-40';

const PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-40';

const SECONDARY =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-surface-600 bg-surface-800 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-surface-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40';

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function errorMessage(value: unknown, fallback: string): string {
  return errorText(value, fallback);
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function serverLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '—';
  }
}

function maskedUsername(value: string): string {
  return value.length > 4 ? `••••${value.slice(-4)}` : '••••';
}

export default function Settings() {
  const {
    profiles,
    activeProfile,
    setActiveProfile,
    addProfile,
    renameProfile,
    setProfileAvatarColor,
    deleteProfile,

    importedChannels,
    sessionSourceName,
    startSessionSource,
    disconnectSessionSource,

    activeSubPage,
    navigate,

    defaultVolume,
    setDefaultVolume,
    language,
    setLanguage,
    locale,
    t,

    savedXtreamSources,
    activeSavedSourceId,
    savedSourcesLoading,
    savedSourcesError,
    connectXtreamSource,
    connectSavedXtreamSource,
    forgetSavedXtreamSource,
    xtreamConnectionStatus,

    liveCategories,
    movieCategories,
    seriesCategories,
    hiddenCategories,
    isCategoryHidden,
    setCategoryHidden,
    setCategoriesHidden,
    showAllCategories,
    canSaveVisibility,
    visibilitySourceKey,
  } = useApp();

  const page =
    activeSubPage === 'appearance' || activeSubPage === 'player-settings'
      ? 'appearance'
      : activeSubPage === 'content-visibility'
      ? 'visibility'
      : activeSubPage === 'about'
      ? 'about'
      : 'general';

  const [profileEditor, setProfileEditor] = useState<ProfileEditor | null>(null);
  const [pendingDeleteProfileId, setPendingDeleteProfileId] = useState<string | null>(null);
  const [pendingForgetId, setPendingForgetId] = useState<string | null>(null);
  const [sourceTab, setSourceTab] = useState<SourceType>('xtream');
  const [form, setForm] = useState<SourceForm>({ ...EMPTY_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [localError, setLocalError] = useState('');
  const [localMessage, setLocalMessage] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [contentKind, setContentKind] = useState<ContentKind>('live');
  const [categorySearch, setCategorySearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');

  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const requestRef = useRef(0);

  const profileIdRef = useRef(activeProfile?.id);
  profileIdRef.current = activeProfile?.id;

  const sourceRef = useRef<HTMLElement>(null);

  const connecting = xtreamConnectionStatus === 'connecting';
  const busy = actionBusy || connecting;
  const sourceConnected = sessionSourceName !== null;
  const formDisabled = busy || sourceConnected;

  const modalOpen =
    profileEditor !== null ||
    pendingDeleteProfileId !== null ||
    pendingForgetId !== null;

  const activeSavedSource = savedXtreamSources.find(
    (source) => source.id === activeSavedSourceId
  );

  const otherSources = savedXtreamSources.filter(
    (source) => source.id !== activeSavedSourceId
  );

  const pendingDeleteProfile = profiles.find(
    (profile) => profile.id === pendingDeleteProfileId
  );

  const pendingForgetSource = savedXtreamSources.find(
    (source) => source.id === pendingForgetId
  );

  const activeProfileName = activeProfile ? t(activeProfile.name) : '';

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    busyRef.current = false;

    setActionBusy(false);
    setProfileEditor(null);
    setPendingDeleteProfileId(null);
    setPendingForgetId(null);
    setForm({ ...EMPTY_FORM });
    setShowPassword(false);
    setRemember(true);
    setLocalError('');
    setLocalMessage('');
    setCategorySearch('');
    setVisibilityFilter('all');
  }, [activeProfile?.id]);

  useEffect(() => {
    setLocalError('');
    setLocalMessage('');
    setProfileEditor(null);
    setPendingDeleteProfileId(null);
    setPendingForgetId(null);
  }, [page]);

  useEffect(() => {
    setCategorySearch('');
    setVisibilityFilter('all');
  }, [visibilitySourceKey]);

  useEffect(() => {
    if (activeSubPage !== 'import-playlist') {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      sourceRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSubPage]);

  const categoriesForKind = useMemo(() => {
    if (contentKind === 'live') {
      return liveCategories;
    }

    if (contentKind === 'movies') {
      return movieCategories;
    }

    return seriesCategories;
  }, [contentKind, liveCategories, movieCategories, seriesCategories]);

  const filteredCategories = useMemo(() => {
    const terms = normalizeSearch(categorySearch).split(' ').filter(Boolean);

    return categoriesForKind
      .filter((category) => {
        const hidden = isCategoryHidden(contentKind, category.id);

        if (visibilityFilter === 'hidden' && !hidden) {
          return false;
        }

        if (visibilityFilter === 'visible' && hidden) {
          return false;
        }

        const name = normalizeSearch(category.name);

        return terms.every((term) => name.includes(term));
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    categoriesForKind,
    categorySearch,
    contentKind,
    visibilityFilter,
    isCategoryHidden,
  ]);

  const hiddenCount = categoriesForKind.filter((category) =>
    isCategoryHidden(contentKind, category.id)
  ).length;

  function clearMessages() {
    setLocalError('');
    setLocalMessage('');
  }

  function updateForm(field: keyof SourceForm, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setShowPassword(false);
    clearMessages();
  }

  async function runAction(
    action: () => Promise<void>,
    successMessage = ''
  ): Promise<boolean> {
    if (busyRef.current || connecting) {
      return false;
    }

    busyRef.current = true;
    setActionBusy(true);
    clearMessages();

    const owner = activeProfile?.id;
    const request = ++requestRef.current;

    const isCurrent = () =>
      mountedRef.current &&
      profileIdRef.current === owner &&
      requestRef.current === request;

    try {
      await action();

      if (!isCurrent()) {
        return false;
      }

      if (successMessage) {
        setLocalMessage(successMessage);
      }

      return true;
    } catch (caught) {
      if (isCurrent()) {
        setLocalError(
          errorMessage(
            caught,
            t('settings.impossible_de_terminer_cette_action')
          )
        );
      }

      return false;
    } finally {
      if (requestRef.current === request) {
        busyRef.current = false;

        if (mountedRef.current) {
          setActionBusy(false);
        }
      }
    }
  }

  function saveProfile() {
    if (!profileEditor || busy) return;

    const name = profileEditor.name.trim();

    if (!name) return;

    if (profileEditor.id) {
      renameProfile(profileEditor.id, name);
      setProfileAvatarColor(profileEditor.id, profileEditor.color);
    } else {
      addProfile(name);
    }

    setProfileEditor(null);
  }

  async function confirmDeleteProfile() {
    const id = pendingDeleteProfileId;

    if (!id || profiles.length <= 1) {
      return;
    }

    const owner = activeProfile?.id;

    const success = await runAction(async () => {
      const result = await invoke<{
        sources: { id: string }[];
        lastUsedSourceId: string | null;
      }>('list_saved_xtream_sources', {
        profileId: id,
      });

      if (!mountedRef.current || profileIdRef.current !== owner) {
        return;
      }

      if (result.sources.length > 0) {
        throw new Error(
          t('settings.retirez_les_sources_memorisees_de_ce')
        );
      }

      deleteProfile(id);
    });

    if (success) {
      setPendingDeleteProfileId(null);
    }
  }

  async function handleConnect() {
    if (formDisabled || busyRef.current) {
      return;
    }

    clearMessages();

    const name = form.name.trim();

    if (!name) {
      setLocalError(
        t('settings.donnez_un_nom_a_votre_source')
      );
      return;
    }

    if (sourceTab === 'xtream') {
      if (!validHttpUrl(form.server)) {
        setLocalError(
          t('settings.l_adresse_du_serveur_doit_etre')
        );
        return;
      }

      if (!form.username.trim() || !form.password) {
        setLocalError(
          t('settings.renseignez_l_identifiant_et_le_mot')
        );
        return;
      }

      const serverUrl = form.server.trim().replace(/\/+$/, '');

      const existing = savedXtreamSources.find(
        (source) =>
          source.serverUrl.trim().replace(/\/+$/, '') === serverUrl &&
          source.username === form.username
      );

      const success = await runAction(() =>
        connectXtreamSource({
          name,
          serverUrl,
          username: form.username,
          password: form.password,
          remember,
          sourceId: remember ? existing?.id ?? null : null,
        })
      );

      if (success) {
        setForm({ ...EMPTY_FORM });
        setShowPassword(false);
      }

      return;
    }

    if (!validHttpUrl(form.url)) {
      setLocalError(
        t('settings.le_lien_m3u_doit_etre_une')
      );
      return;
    }

    const owner = activeProfile?.id;
    const playlistUrl = form.url.trim();

    const success = await runAction(async () => {
      const raw = await downloadM3UPlaylist(playlistUrl);

      if (!mountedRef.current || profileIdRef.current !== owner) {
        return;
      }

      const result = parseM3U(raw.replace(/^\uFEFF/, ''), name);

      if (!result.channels.length) {
        throw new Error(
          t('settings.aucune_chaine_exploitable_dans_ce_lien')
        );
      }

      startSessionSource(name, result.channels, undefined, playlistUrl);
    });

    if (success) {
      setForm({ ...EMPTY_FORM });
    }
  }

  function saveVisibility(success: boolean) {
    setLocalMessage('');

    setLocalError(
      success
        ? ''
        : t('settings.impossible_d_enregistrer_ces_preferences')
    );
  }

  const messages = (
    <>
      {localError && <Notice error>{localError}</Notice>}
      {localMessage && <Notice>{localMessage}</Notice>}
    </>
  );

  return (
    <div className="min-h-full bg-surface-900 px-5 py-8 lg:px-10">
      <div className="max-w-[1050px]">
        {page === 'general' && (
          <>
            <section className="mb-10">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-white">
                  {t('settings.profiles')}
                </h2>

                <p className="mt-1 text-xs text-zinc-500">
                  {t('settings.un_espace_personnel_pour_chaque_utilisat')}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {profiles.map((profile) => {
                  const active = activeProfile?.id === profile.id;
                  const name = t(profile.name);

                  return (
                    <article
                      key={profile.id}
                      className={`rounded-2xl border p-5 ${
                        active
                          ? 'border-accent-500/50 bg-accent-600/5'
                          : 'border-surface-700 bg-surface-800'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy || active}
                        onClick={() => {
  setActiveProfile(profile);
  window.setTimeout(() => navigate('settings', 'profiles'), 0);
}}
                        aria-label={`${t('settings.choisir_le_profil')} ${name}`}
                        className="flex w-full items-center gap-3 rounded-lg text-left disabled:cursor-default"
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white"
                          style={{ backgroundColor: profile.avatarColor }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">
                            {name}
                          </span>

                          <span className="mt-1 block text-xs text-zinc-500">
                            {active
                              ? t('profiles.active')
                              : t('settings.choisir_ce_profil')}
                          </span>
                        </span>

                        {active && (
                          <Check className="h-4 w-4 shrink-0 text-accent-400" />
                        )}
                      </button>

                      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            clearMessages();

                            setProfileEditor({
                              id: profile.id,
                              name,
                              color: profile.avatarColor,
                            });
                          }}
                          className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white disabled:opacity-40"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('settings.modifier')}
                        </button>

                        <button
                          type="button"
                          disabled={busy || profiles.length <= 1}
                          onClick={() => {
                            clearMessages();
                            setPendingDeleteProfileId(profile.id);
                          }}
                          aria-label={`${t('profiles.delete')} ${name}`}
                          className="rounded-lg p-1.5 text-zinc-600 hover:text-red-400 disabled:opacity-25"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </article>
                  );
                })}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    clearMessages();

                    setProfileEditor({
                      id: null,
                      name: '',
                      color: AVATAR_COLORS[5],
                    });
                  }}
                  className="flex min-h-[124px] items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-600 text-sm text-zinc-400 transition-colors hover:border-accent-500/60 hover:text-white disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                  {t('profiles.add')}
                </button>
              </div>
            </section>

            <section ref={sourceRef} className="scroll-mt-8">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-white">
                  {t('settings.sources_de')} {activeProfileName}
                </h2>

                <p className="mt-1 text-xs leading-6 text-zinc-500">
                  {t('settings.connectez_une_source_avec_votre_identifi')}
                </p>
              </div>

              {!modalOpen && messages}

              {savedSourcesError && <Notice error>{savedSourcesError}</Notice>}

              {sourceConnected && (
                <div className="mb-4 rounded-2xl border border-accent-500/30 bg-accent-600/5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/10">
                        <Server className="h-5 w-5 text-accent-400" />
                      </span>

                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-white">
                          {sessionSourceName}
                        </p>

                        <p className="mt-1 text-xs text-zinc-500">
                          {importedChannels.length.toLocaleString(
                            locale
                          )}{' '}
                          {t('player.channels')}

                          {activeSavedSource &&
                            ` · ${maskedUsername(activeSavedSource.username)}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-1 flex items-center gap-1.5 text-xs text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {t('settings.connectee')}
                      </span>

                      <button
                        type="button"
                        onClick={() => navigate('live', 'all')}
                        className={SECONDARY}
                      >
                        <Tv className="h-4 w-4" />
                        {t('settings.ouvrir_live_tv')}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          disconnectSessionSource();
                          clearMessages();
                        }}
                        className={SECONDARY}
                      >
                        <LogOut className="h-4 w-4" />
                        {t('settings.disconnect')}
                      </button>

                      {activeSavedSource && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            clearMessages();
                            setPendingForgetId(activeSavedSource.id);
                          }}
                          aria-label={t('settings.retirer_cette_source')}
                          className="rounded-xl p-2.5 text-zinc-500 hover:text-red-400 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {otherSources.length > 0 && (
                <div className="mb-4 space-y-3">
                  {otherSources.map((source) => (
                    <div
                      key={source.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-surface-700 bg-surface-800 p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">
                          {source.name}
                        </p>

                        <p className="mt-1 break-words text-xs text-zinc-500">
                          {serverLabel(source.serverUrl)}
                          {' · '}
                          {maskedUsername(source.username)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy || sourceConnected}
                          onClick={() =>
                            void runAction(() =>
                              connectSavedXtreamSource(source.id)
                            )
                          }
                          className={SECONDARY}
                        >
                          <Wifi className="h-4 w-4" />
                          {t('settings.connect')}
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            clearMessages();
                            setPendingForgetId(source.id);
                          }}
                          aria-label={`${t('series.removeFavorite')} ${source.name}`}
                          className="rounded-lg p-2 text-zinc-500 hover:text-red-400 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {savedSourcesLoading && savedXtreamSources.length === 0 && (
                <p className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('settings.chargement_des_sources')}
                </p>
              )}

              {sourceConnected ? (
                <p className="text-xs leading-6 text-zinc-500">
                  {t('settings.deconnectez_la_source_actuelle_pour_en')}
                </p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-surface-700 bg-surface-800">
                  <div className="flex flex-wrap gap-2 border-b border-white/5 p-4">
                    {[
                      {
                        type: 'xtream' as const,
                        label: t('settings.identifiant_et_mot_de_passe'),
                      },
                      {
                        type: 'm3u' as const,
                        label: t('settings.lien_m3u'),
                      },
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setSourceTab(item.type);
                          resetForm();
                        }}
                        aria-pressed={sourceTab === item.type}
                        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                          sourceTab === item.type
                            ? 'bg-accent-600 text-white'
                            : 'text-zinc-400 hover:bg-surface-700 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleConnect();
                    }}
                    className="p-5 sm:p-6"
                  >
                    <fieldset disabled={formDisabled} className="space-y-4">
                      {sourceTab === 'xtream' && (
                        <p className="text-xs text-zinc-500">
                          {t('settings.connexion_xtream')}
                        </p>
                      )}

                      <FormField
                        label={t('settings.sourceName')}
                        value={form.name}
                        onChange={(value) => updateForm('name', value)}
                        placeholder={t('settings.ex_ma_source')}
                      />

                      {sourceTab === 'xtream' ? (
                        <>
                          <FormField
                            label={t('settings.adresse_du_serveur')}
                            value={form.server}
                            onChange={(value) => updateForm('server', value)}
                            placeholder="https://serveur:port"
                          />

                          <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                              label={t('settings.username')}
                              value={form.username}
                              onChange={(value) => updateForm('username', value)}
                              placeholder={t('settings.votre_identifiant')}
                            />

                            <FormField
                              label={t('settings.passwordPlaceholder')}
                              value={form.password}
                              onChange={(value) => updateForm('password', value)}
                              placeholder={t('settings.votre_mot_de_passe')}
                              type={showPassword ? 'text' : 'password'}
                              trailing={
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowPassword((previous) => !previous)
                                  }
                                  aria-label={
                                    showPassword
                                      ? t('settings.hidePassword')
                                      : t('settings.showPassword')
                                  }
                                  className="text-zinc-500 hover:text-white"
                                >
                                  {showPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              }
                            />
                          </div>

                          <label className="flex cursor-pointer items-start gap-3 pt-1">
                            <input
                              type="checkbox"
                              checked={remember}
                              onChange={(event) => setRemember(event.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-accent-500"
                            />

                            <span>
                              <span className="block text-sm text-zinc-300">
                                {t('settings.conserver_cette_source_pour_ce_profil')}
                              </span>

                              <span className="mt-1 block text-xs leading-5 text-zinc-600">
                                {t('settings.les_identifiants_seront_proteges_dans_le')}
                              </span>
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          <FormField
                            label={t('settings.lien_m3u')}
                            value={form.url}
                            onChange={(value) => updateForm('url', value)}
                            placeholder="https://…/playlist.m3u"
                          />

                          <p className="text-xs leading-6 text-zinc-500">
                            {t('settings.le_lien_m3u_est_utilise_pour')}
                          </p>
                        </>
                      )}

                      {(sourceTab === 'xtream' ? form.server : form.url)
                        .trim()
                        .toLowerCase()
                        .startsWith('http://') && (
                        <p className="text-xs leading-6 text-amber-400">
                          {t('settings.connexion_http_les_echanges_ne_sont')}
                        </p>
                      )}
                    </fieldset>

                    <div className="mt-6 flex flex-wrap gap-2 border-t border-white/5 pt-5">
                      <button type="submit" disabled={formDisabled} className={PRIMARY}>
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wifi className="h-4 w-4" />
                        )}

                        {busy
                          ? t('settings.connecting')
                          : t('settings.connect')}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={resetForm}
                        className={SECONDARY}
                      >
                        {t('settings.clearFields')}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </>
        )}

        {page === 'appearance' && (
          <>
            <h2 className="mb-4 text-sm font-semibold text-white">
              {t('settings.interface')}
            </h2>

            <SettingsPanel>
              <SettingRow
                icon={Palette}
                label={t('settings.theme')}
                description={t('settings.interface_sombre_avec_des_accents_violet')}
                control={
                  <span className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-zinc-400">
                    {t('settings.dark')}
                  </span>
                }
              />

              <SettingRow
                icon={Globe}
                label={t('settings.language')}
                description={t('settings.langue_de_l_interface')}
                control={
                  <select
                    value={language}
                    onChange={(event) => {
                      if (isLanguage(event.target.value)) {
                        setLanguage(event.target.value);
                      }
                    }}
                    aria-label={t('settings.language')}
                    className="rounded-xl border border-surface-600 bg-surface-900 px-4 py-2 text-sm text-white outline-none focus:border-accent-500"
                  >
                    {LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                }
              />
            </SettingsPanel>

            <h2 className="mb-4 mt-8 text-sm font-semibold text-white">
              {t('settings.lecture')}
            </h2>

            <SettingsPanel>
              <SettingRow
                icon={Volume2}
                label={t('settings.defaultVolume')}
                description={t('settings.volume_utilise_au_demarrage_d_une')}
                control={
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={defaultVolume}
                      onChange={(event) =>
                        setDefaultVolume(Number(event.target.value))
                      }
                      aria-label={t('settings.defaultVolume')}
                      className="w-32 cursor-pointer accent-accent-500 sm:w-44"
                    />

                    <span className="w-12 text-right text-sm tabular-nums text-zinc-200">
                      {defaultVolume} %
                    </span>
                  </div>
                }
              />
            </SettingsPanel>

            <h2 className="mb-4 mt-8 text-sm font-semibold text-white">
              {t('epg.sectionTitle')}
            </h2>

            <EpgSettings />
          </>
        )}

        {page === 'visibility' && (
          <>
            <p className="mb-1 text-sm text-zinc-300">
              {t('settings.masquez_les_categories_qui_ne_vous')}
            </p>

            <p className="mb-5 text-xs text-zinc-500">
              {activeProfileName || '—'}
              {' · '}
              {sessionSourceName || t('settings.bibliotheque_locale')}
            </p>

            {!modalOpen && messages}

            <div className="mb-5 flex flex-wrap gap-2">
              {[
                { kind: 'live' as const, label: 'Live TV', icon: Tv },
                { kind: 'movies' as const, label: t('movies.title'), icon: Film },
                { kind: 'series' as const, label: t('series.categoryFallback'), icon: Clapperboard },
              ].map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => {
                      setContentKind(item.kind);
                      setCategorySearch('');
                      setVisibilityFilter('all');
                    }}
                    aria-pressed={contentKind === item.kind}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${
                      contentKind === item.kind
                        ? 'bg-accent-600 text-white'
                        : 'bg-surface-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {!canSaveVisibility ? (
              <Notice>
                {t('settings.connectez_une_source_pour_gerer_ses')}
              </Notice>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

                    <input
                      type="search"
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      placeholder={t('settings.rechercher_pt_fr_sport')}
                      aria-label={t('settings.rechercher_une_categorie')}
                      className={`${INPUT} pl-10`}
                    />
                  </div>

                  <select
                    value={visibilityFilter}
                    onChange={(event) =>
                      setVisibilityFilter(event.target.value as VisibilityFilter)
                    }
                    aria-label={t('settings.filtrer_les_categories')}
                    className={`${INPUT} sm:w-44`}
                  >
                    <option value="all">{t('settings.toutes')}</option>
                    <option value="visible">{t('settings.visibles')}</option>
                    <option value="hidden">{t('settings.masquees')}</option>
                  </select>
                </div>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {categoriesForKind.length - hiddenCount} {t('settings.visibles_2')}
                    {' · '}
                    {hiddenCount} {t('live.masquees')}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={filteredCategories.length === 0}
                      onClick={() =>
                        saveVisibility(
                          setCategoriesHidden(
                            contentKind,
                            filteredCategories.map((item) => item.id),
                            false
                          )
                        )
                      }
                      className="rounded-lg border border-surface-600 px-3 py-2 text-xs text-zinc-300 hover:bg-surface-800 disabled:opacity-30"
                    >
                      {t('settings.afficher_les_resultats')}
                    </button>

                    <button
                      type="button"
                      disabled={filteredCategories.length === 0}
                      onClick={() =>
                        saveVisibility(
                          setCategoriesHidden(
                            contentKind,
                            filteredCategories.map((item) => item.id),
                            true
                          )
                        )
                      }
                      className="rounded-lg border border-surface-600 px-3 py-2 text-xs text-zinc-300 hover:bg-surface-800 disabled:opacity-30"
                    >
                      {t('settings.masquer_les_resultats')}
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-surface-700 bg-surface-800">
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-3 text-xs text-zinc-500">
                    <span>{t('series.categoryLabel')}</span>
                    <span>{t('settings.afficher')}</span>
                  </div>

                  <div className="max-h-[520px] overflow-y-auto">
                    {filteredCategories.length > 0 ? (
                      filteredCategories.map((category) => {
                        const hidden = isCategoryHidden(contentKind, category.id);

                        return (
                          <label
                            key={category.id}
                            className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/5 px-5 py-3.5 last:border-b-0 hover:bg-white/[0.02]"
                          >
                            <span
                              className={`break-words text-sm ${
                                hidden ? 'text-zinc-600' : 'text-zinc-200'
                              }`}
                            >
                              {category.name}
                            </span>

                            <input
                              type="checkbox"
                              checked={!hidden}
                              onChange={(event) =>
                                saveVisibility(
                                  setCategoryHidden(
                                    contentKind,
                                    category.id,
                                    !event.target.checked
                                  )
                                )
                              }
                              aria-label={`${t('settings.afficher')} ${category.name}`}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-accent-500"
                            />
                          </label>
                        );
                      })
                    ) : (
                      <p className="px-5 py-12 text-center text-sm text-zinc-500">
                        {categoriesForKind.length === 0
                          ? t('settings.aucune_categorie_disponible')
                          : t('settings.aucun_resultat')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                  <p className="max-w-xl text-xs leading-6 text-zinc-500">
                    {t('settings.enregistrement_automatique_par_profil_et')}
                  </p>

                  <button
                    type="button"
                    disabled={hiddenCategories[contentKind].length === 0}
                    onClick={() => saveVisibility(showAllCategories(contentKind))}
                    className="text-xs text-accent-400 hover:text-accent-300 disabled:opacity-30"
                  >
                    {t('settings.tout_reafficher')}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {page === 'about' && <AboutSettings />}
      </div>

      {profileEditor && (
        <SettingsModal
          title={
            profileEditor.id
              ? t('settings.modifier_le_profil')
              : t('profiles.add')
          }
          closeLabel={t('common.close')}
          onClose={() => setProfileEditor(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveProfile();
            }}
          >
            <FormField
              label={t('settings.profilePlaceholder')}
              value={profileEditor.name}
              onChange={(name) =>
                setProfileEditor((previous) =>
                  previous ? { ...previous, name } : null
                )
              }
              placeholder={t('settings.nom')}
            />

            {profileEditor.id && (
              <div className="mt-5">
                <p className="mb-3 text-xs text-zinc-500">
                  {t('settings.couleur')}
                </p>

                <div className="flex flex-wrap gap-3">
                  {AVATAR_COLORS.map((color, index) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setProfileEditor((previous) =>
                          previous ? { ...previous, color } : null
                        )
                      }
                      aria-label={`${t('settings.couleur')} ${index + 1}`}
                      aria-pressed={profileEditor.color === color}
                      className={`flex h-9 w-9 items-center justify-center rounded-full ${
                        profileEditor.color === color
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-900'
                          : ''
                      }`}
                      style={{ backgroundColor: color }}
                    >
                      {profileEditor.color === color && (
                        <Check className="h-4 w-4 text-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProfileEditor(null)}
                className={SECONDARY}
              >
                {t('common.cancel')}
              </button>

              <button
                type="submit"
                disabled={!profileEditor.name.trim() || busy}
                className={PRIMARY}
              >
                {t('settings.save')}
              </button>
            </div>
          </form>
        </SettingsModal>
      )}

      {pendingDeleteProfile && (
        <SettingsModal
          title={t('settings.supprimer_le_profil')}
          closeLabel={t('common.close')}
          locked={busy}
          onClose={() => setPendingDeleteProfileId(null)}
        >
          <p className="text-sm leading-7 text-zinc-300">
            {t('settings.supprimer_le_profil')}
            {' « '}
            {t(pendingDeleteProfile.name)}
            {' » ?'}
          </p>

          <p className="mt-2 text-xs leading-6 text-zinc-500">
            {t('settings.ses_favoris_seront_retires_ses_sources')}
          </p>

          {messages}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPendingDeleteProfileId(null)}
              className={SECONDARY}
            >
              {t('common.cancel')}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmDeleteProfile()}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white hover:bg-red-500 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('profiles.delete')}
            </button>
          </div>
        </SettingsModal>
      )}

      {pendingForgetSource && (
        <SettingsModal
          title={t('settings.retirer_la_source')}
          closeLabel={t('common.close')}
          locked={busy}
          onClose={() => setPendingForgetId(null)}
        >
          <p className="text-sm leading-7 text-zinc-300">
            {t('series.removeFavorite')}
            {' « '}
            {pendingForgetSource.name}
            {' » ?'}
          </p>

          <p className="mt-2 text-xs leading-6 text-zinc-500">
            {pendingForgetSource.id === activeSavedSourceId
              ? t('settings.la_source_sera_deconnectee_et_ses')
              : t('settings.ses_identifiants_memorises_seront_suppri')}
          </p>

          {messages}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPendingForgetId(null)}
              className={SECONDARY}
            >
              {t('common.cancel')}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const id = pendingForgetSource.id;

                void runAction(() => forgetSavedXtreamSource(id)).then(
                  (success) => {
                    if (success) {
                      setPendingForgetId(null);
                    }
                  }
                );
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white hover:bg-red-500 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('series.removeFavorite')}
            </button>
          </div>
        </SettingsModal>
      )}
    </div>
  );
}

function SettingsPanel({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-surface-700 bg-surface-800">
      {children}
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  control,
}: {
  icon: typeof Volume2;
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
          <Icon className="h-4 w-4 text-zinc-500" />
        </div>

        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200">{label}</p>

          <p className="mt-1 text-xs leading-6 text-zinc-500">{description}</p>
        </div>
      </div>

      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`my-4 rounded-xl border px-4 py-3 text-sm leading-6 ${
        error
          ? 'border-red-800/60 bg-red-950/20 text-red-300'
          : 'border-surface-600 bg-surface-800 text-zinc-400'
      }`}
    >
      {children}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  trailing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-zinc-400">
        {label}
      </span>

      <span className="relative block">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={type === 'password' ? 'new-password' : 'off'}
          spellCheck={false}
          className={`${INPUT} ${trailing ? 'pr-12' : ''}`}
        />

        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {trailing}
          </span>
        )}
      </span>
    </label>
  );
}

function SettingsModal({
  title,
  closeLabel,
  onClose,
  locked = false,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const lockedRef = useRef(locked);

  onCloseRef.current = onClose;
  lockedRef.current = locked;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      const element = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), select:not([disabled]), [tabindex="0"]'
      );

      (element ?? dialogRef.current)?.focus();
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();

        if (!lockedRef.current) {
          onCloseRef.current();
        }

        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }

      const elements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]'
        )
      ).filter((element) => element.getClientRects().length > 0);

      if (elements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;

      if (
        event.shiftKey &&
        (active === first ||
          active === dialogRef.current ||
          !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;

      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-black/75 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !locked) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={locked}
        tabIndex={-1}
        className="my-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-5">
          <h2 className="text-base font-semibold text-white">{title}</h2>

          <button
            type="button"
            disabled={locked}
            onClick={onClose}
            aria-label={closeLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}