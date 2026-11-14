import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  detectLanguage,
  isLanguage,
  localeOf,
  setCurrentLanguage,
  translate,
  type Language,
  type Translate,
} from '../i18n';
import { invoke } from '@tauri-apps/api/core';
import {
  type Channel,
  type Profile,
  type Page,
  type SubPage,
  type Toast,
  type XtreamCredentials,
  AVATAR_COLORS,
} from '@/types';
import {
  useMovieCatalog,
  useSeriesCatalog,
} from '@/utils/xtreamCatalogCache';
import {
  useCategoryVisibility,
} from '@/utils/categoryVisibility';
import {
  readRecentEntries,
  rememberRecent,
  restoreRecents,
} from '@/utils/recentChannels';
import { errorText } from '@/i18n/backendErrors';

export type MovieCategory = {
  id: string;
  name: string;
};

export type SeriesCategory = {
  id: string;
  name: string;
};

export type CatalogFavorite = {
  id: string;
  kind: 'movie' | 'series';
  sourceKey: string;
  itemId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  poster: string;
  extension?: string;
  plot?: string;
  year?: string;
  rating?: string;
};

export type SavedXtreamSourceSummary = {
  id: string;
  name: string;
  serverUrl: string;
  username: string;
  createdAt: number;
};

type SavedXtreamSource =
  SavedXtreamSourceSummary & {
    password: string;
  };

type SavedXtreamSourcesResponse = {
  sources: SavedXtreamSourceSummary[];
  lastUsedSourceId: string | null;
};

export type XtreamConnectionInput = {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
  remember: boolean;
  sourceId?: string | null;
};

type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'success'
  | 'error';

type ProfileFavorites = {
  channelIds: string[];
  catalog: CatalogFavorite[];
};

type FavoritesByProfile =
  Record<string, ProfileFavorites>;

type SessionSource = {
  name: string;
  channels: Channel[];
  credentials: XtreamCredentials | null;
  visibilitySourceKey: string;
};

type CategoryVisibilityValue =
  ReturnType<typeof useCategoryVisibility>;

interface AppContextValue
  extends CategoryVisibilityValue {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  activeSubPage: SubPage;
  setActiveSubPage: (sub: SubPage) => void;
  navigate: (page: Page, sub?: SubPage) => void;
  // Retour depuis le lecteur : revient à la page (et à la rubrique) d'où la
  // lecture a été lancée ; à défaut, à la page de secours indiquée.
  returnFromPlayer: (fallbackPage: Page, fallbackSub?: SubPage) => void;
  // Page où ramènera le prochain retour (pour afficher « Retour à… »).
  peekReturn: () => { page: Page; sub: SubPage } | null;
  // Boutons latéraux de la souris : page précédente / suivante (historique des pages).
  // Renvoient false quand il n'y a nulle part où aller.
  goBack: () => boolean;
  goForward: () => boolean;

  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
  // Code régional de la langue (ex. « fr-FR ») pour les dates et les nombres.
  locale: string;

  activeLiveCategory: string;
  setActiveLiveCategory: (category: string) => void;

  movieCategories: MovieCategory[];
  setMovieCategories: (
    categories: MovieCategory[]
  ) => void;
  visibleMovieCategories: MovieCategory[];
  activeMovieCategory: string;
  setActiveMovieCategory: (
    categoryId: string
  ) => void;

  seriesCategories: SeriesCategory[];
  setSeriesCategories: (
    categories: SeriesCategory[]
  ) => void;
  visibleSeriesCategories: SeriesCategory[];
  activeSeriesCategory: string;
  setActiveSeriesCategory: (
    categoryId: string
  ) => void;

  liveCategories: {
    id: string;
    name: string;
  }[];
  visibleLiveCategories: {
    id: string;
    name: string;
  }[];

  requestedSeriesId: string | null;
  setRequestedSeriesId: (
    id: string | null
  ) => void;

  selectedChannel: Channel | null;
  setSelectedChannel: (
    channel: Channel | null
  ) => void;

  favorites: string[];
  toggleFavorite: (channel: Channel) => void;
  isFavorite: (channelId: string) => boolean;

  catalogFavorites: CatalogFavorite[];
  toggleCatalogFavorite: (
    item: CatalogFavorite
  ) => void;
  isCatalogFavorite: (id: string) => boolean;

  defaultVolume: number;
  setDefaultVolume: (volume: number) => void;

  profiles: Profile[];
  activeProfile: Profile | null;
  setActiveProfile: (profile: Profile) => void;
  addProfile: (name: string) => void;
  renameProfile: (
    id: string,
    name: string
  ) => void;
  setProfileAvatarColor: (
    id: string,
    color: string
  ) => void;
  deleteProfile: (id: string) => void;

  importedChannels: Channel[];
  visibleImportedChannels: Channel[];
  setImportedChannels: (
    channels: Channel[]
  ) => void;
  clearImportedChannels: () => void;

  sessionSourceName: string | null;
  xtreamCredentials: XtreamCredentials | null;
  sourceKey: string;
  visibilitySourceKey: string;

  startSessionSource: (
    name: string,
    channels: Channel[],
    credentials?: XtreamCredentials,
    playlistIdentity?: string
  ) => void;
  disconnectSessionSource: () => void;

  savedXtreamSources:
    SavedXtreamSourceSummary[];
  activeSavedSourceId: string | null;
  savedSourcesLoading: boolean;
  // Vrai quand le démarrage est terminé : comptes enregistrés lus et, s'il y en a un, chaînes chargées.
  startupReady: boolean;
  savedSourcesError: string;

  refreshSavedXtreamSources:
    () => Promise<void>;
  connectXtreamSource: (
    input: XtreamConnectionInput
  ) => Promise<void>;
  connectSavedXtreamSource: (
    sourceId: string
  ) => Promise<void>;
  forgetSavedXtreamSource: (
    sourceId: string
  ) => Promise<void>;

  recentlyWatched: Channel[];
  visibleRecentlyWatched: Channel[];
  addToRecentlyWatched: (
    channel: Channel
  ) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;

  toasts: Toast[];
  showToast: (
    message: string,
    type?: Toast['type']
  ) => void;
  dismissToast: (id: string) => void;

  xtreamConnectionStatus: ConnectionStatus;
  setXtreamConnectionStatus: (
    status: ConnectionStatus
  ) => void;
  xtreamConnectMessage: string;
  setXtreamConnectMessage: (
    message: string
  ) => void;
}

const AppContext =
  createContext<AppContextValue | undefined>(
    undefined
  );

const STORAGE_KEYS = {
  language: 'msp_language',
  legacyFavorites: 'msp_favorites',
  profileFavorites: 'msp_profile_favorites_v1',
  profiles: 'msp_profiles',
  activeProfile: 'msp_active_profile',
  importedChannels: 'msp_imported_channels',
  recentlyWatched: 'msp_recently_watched',
  defaultVolume: 'msp_default_volume',
};

const EMPTY_IDS: string[] = [];
const EMPTY_CATALOG: CatalogFavorite[] = [];

function loadFromStorage<T>(
  key: string,
  fallback: T
): T {
  try {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(
  key: string,
  value: unknown
): boolean {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(value)
    );
    return true;
  } catch {
    return false;
  }
}

function errorMessage(
  value: unknown,
  fallback: string
): string {
  return errorText(value, fallback);
}

function createDefaultProfile(): Profile {
  return {
    id: 'profile-default',
    name: 'profiles.mainProfile',
    avatarColor: AVATAR_COLORS[5],
    createdAt: Date.now(),
  };
}

function loadProfiles(): Profile[] {
  const stored = loadFromStorage<Profile[]>(
    STORAGE_KEYS.profiles,
    []
  );

  if (!Array.isArray(stored)) {
    return [createDefaultProfile()];
  }

  const valid = stored.filter(
    (profile) =>
      profile &&
      typeof profile.id === 'string' &&
      typeof profile.name === 'string'
  );

  return valid.length
    ? valid
    : [createDefaultProfile()];
}

function loadInitialFavorites(
  profileId: string
): FavoritesByProfile {
  const stored =
    loadFromStorage<FavoritesByProfile | null>(
      STORAGE_KEYS.profileFavorites,
      null
    );

  if (
    stored &&
    typeof stored === 'object' &&
    !Array.isArray(stored)
  ) {
    return stored;
  }

  const legacy = loadFromStorage<unknown>(
    STORAGE_KEYS.legacyFavorites,
    []
  );

  return {
    [profileId]: {
      channelIds: Array.isArray(legacy)
        ? legacy.filter(
            (id): id is string =>
              typeof id === 'string'
          )
        : [],
      catalog: [],
    },
  };
}

function copyCatalogFavorite(
  item: CatalogFavorite,
  keepPoster: boolean
): CatalogFavorite {
  return {
    id: item.id,
    kind: item.kind,
    sourceKey: item.sourceKey,
    itemId: item.itemId,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    poster: keepPoster ? item.poster : '',
    extension: item.extension,
    plot: item.plot,
    year: item.year,
    rating: item.rating,
  };
}

function xtreamIdentity(
  credentials: XtreamCredentials
): string {
  return JSON.stringify([
    credentials.serverUrl
      .trim()
      .replace(/\/+$/, ''),
    credentials.username,
  ]);
}

// Empreinte locale, pas un mécanisme de chiffrement.
function playlistFingerprint(
  identity: string
): string {
  const value = identity.trim();

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);

    first = Math.imul(
      first ^ code,
      0x01000193
    );

    second = Math.imul(
      second ^ code,
      0x85ebca6b
    );
  }

  return [
    'm3u-v1',
    value.length,
    (first >>> 0).toString(16),
    (second >>> 0).toString(16),
  ].join(':');
}

async function fetchXtreamChannels(
  credentials: XtreamCredentials,
  sourceName: string,
  t: (key: string) => string
): Promise<Channel[]> {
  const raw = await invoke<unknown>(
    'connect_xtream',
    {
      serverUrl: credentials.serverUrl,
      username: credentials.username,
      password: credentials.password,
    }
  );

  if (!Array.isArray(raw)) {
    throw new Error(
      t('errors.unexpectedXtreamResponse')
    );
  }

  const channels: Channel[] = [];
  const ids = new Set<string>();

  const base = credentials.serverUrl
    .trim()
    .replace(/\/+$/, '');

  for (const value of raw) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      continue;
    }

    const row =
      value as Record<string, unknown>;

    const streamId =
      typeof row.stream_id === 'number' ||
      typeof row.stream_id === 'string'
        ? String(row.stream_id)
        : '';

    if (
      !streamId ||
      typeof row.name !== 'string' ||
      typeof row.stream_url !== 'string' ||
      !row.stream_url
    ) {
      continue;
    }

    const id =
      `xtream-${encodeURIComponent(base)}-${streamId}`;

    if (ids.has(id)) continue;
    ids.add(id);

    channels.push({
      id,
      name: row.name,
      category:
        typeof row.group === 'string' &&
        row.group &&
        row.group !== 'Sans catégorie'
          ? row.group
          : t('common.uncategorized'),
      description:
        `${t('player.xtreamSource')} : ${sourceName}`,
      logoColor: '#3b82f6',
      isLive: true,
      logoUrl:
        typeof row.logo === 'string' &&
        row.logo
          ? row.logo
          : undefined,
      streamUrl: row.stream_url,
      imported: true,
    });
  }

  if (!channels.length) {
    throw new Error(
      t('errors.noPlayableChannels')
    );
  }

  return channels;
}

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [currentPage, setCurrentPageState] =
    useState<Page>('home');

  const [activeSubPage, setActiveSubPage] =
    useState<SubPage>('all');

  // Langue enregistrée ; à défaut, celle du système si elle est disponible.
  const [language, setLanguageState] =
    useState<Language>(() => {
      const stored = loadFromStorage<unknown>(
        STORAGE_KEYS.language,
        null
      );

      return isLanguage(stored)
        ? stored
        : detectLanguage(
            typeof navigator === 'undefined'
              ? []
              : navigator.languages ?? [navigator.language]
          );
    });

  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
    },
    []
  );

  const t = useCallback<Translate>(
    (key, params) => translate(language, key, params),
    [language]
  );

  const locale = localeOf(language);

  // Langue de la page : lecteurs d'écran, césure et correction orthographique.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Les utilitaires hors composants (messages d'erreur) suivent la langue.
  setCurrentLanguage(language);

  const [
    activeLiveCategory,
    setActiveLiveCategory,
  ] = useState('');

  const [movieCategories, setMovieCategories] =
    useState<MovieCategory[]>([]);

  const [
    activeMovieCategory,
    setActiveMovieCategory,
  ] = useState('');

  const [
    seriesCategories,
    setSeriesCategories,
  ] = useState<SeriesCategory[]>([]);

  const [
    activeSeriesCategory,
    setActiveSeriesCategory,
  ] = useState('');

  const [
    requestedSeriesId,
    setRequestedSeriesIdState,
  ] = useState<string | null>(null);

  const [
    selectedChannel,
    setSelectedChannel,
  ] = useState<Channel | null>(null);

  const [profiles, setProfiles] =
    useState<Profile[]>(loadProfiles);

  const [
    activeProfileId,
    setActiveProfileId,
  ] = useState<string>(() => {
    const stored =
      loadFromStorage<Profile | null>(
        STORAGE_KEYS.activeProfile,
        null
      );

    return (
      profiles.find(
        (profile) =>
          profile.id === stored?.id
      )?.id ?? profiles[0].id
    );
  });

  const activeProfile =
    profiles.find(
      (profile) =>
        profile.id === activeProfileId
    ) ??
    profiles[0] ??
    null;

  const profileId =
    activeProfile?.id ?? 'profile-default';

  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;

  const [
    favoritesByProfile,
    setFavoritesByProfile,
  ] = useState<FavoritesByProfile>(() =>
    loadInitialFavorites(activeProfileId)
  );

  const profileFavorites =
    favoritesByProfile[profileId];

  const favorites =
    Array.isArray(
      profileFavorites?.channelIds
    )
      ? profileFavorites.channelIds
      : EMPTY_IDS;

  const catalogFavorites =
    Array.isArray(profileFavorites?.catalog)
      ? profileFavorites.catalog
      : EMPTY_CATALOG;

  const [
    savedChannels,
    setSavedChannels,
  ] = useState<Channel[]>(() => {
    const stored =
      loadFromStorage<Channel[]>(
        STORAGE_KEYS.importedChannels,
        []
      );

    return Array.isArray(stored)
      ? stored
      : [];
  });

  const [
    savedRecentlyWatched,
    setSavedRecentlyWatched,
  ] = useState<Channel[]>(() => {
    const stored =
      loadFromStorage<Channel[]>(
        STORAGE_KEYS.recentlyWatched,
        []
      );

    return Array.isArray(stored)
      ? stored
      : [];
  });

  const [
    sessionSource,
    setSessionSource,
  ] = useState<SessionSource | null>(null);

  const [
    sessionRecentlyWatched,
    setSessionRecentlyWatched,
  ] = useState<Channel[]>([]);

  const sessionActiveRef = useRef(false);
  const sessionKeyRef = useRef('');

  sessionKeyRef.current = sessionSource?.visibilitySourceKey ?? '';
  const connectionRequestRef = useRef(0);
  const savedListRequestRef = useRef(0);

  const [
    savedXtreamSources,
    setSavedXtreamSources,
  ] = useState<SavedXtreamSourceSummary[]>([]);

  const [
    activeSavedSourceId,
    setActiveSavedSourceId,
  ] = useState<string | null>(null);

  const activeSavedSourceIdRef =
    useRef<string | null>(null);

  const [
    savedSourcesLoading,
    setSavedSourcesLoading,
  ] = useState(false);

  const [startupReady, setStartupReady] = useState(false);

  const [
    savedSourcesError,
    setSavedSourcesError,
  ] = useState('');

  const [searchQuery, setSearchQuery] =
    useState('');

  const [toasts, setToasts] =
    useState<Toast[]>([]);

  const toastIdRef = useRef(0);

  const [
    xtreamConnectionStatus,
    setXtreamConnectionStatus,
  ] = useState<ConnectionStatus>('idle');

  const [
    xtreamConnectMessage,
    setXtreamConnectMessage,
  ] = useState('');

  const [
    defaultVolume,
    setDefaultVolumeState,
  ] = useState<number>(() =>
    loadFromStorage(
      STORAGE_KEYS.defaultVolume,
      75
    )
  );

  const sessionSourceName =
    sessionSource?.name ?? null;

  const xtreamCredentials =
    sessionSource?.credentials ?? null;

  // Format existant conservé pour favoris et progression.
  const sourceKey = xtreamCredentials
    ? xtreamIdentity(xtreamCredentials)
    : '';

  const importedChannels = sessionSource
    ? sessionSource.channels
    : savedChannels;

  const recentlyWatched = sessionSource
    ? sessionRecentlyWatched
    : savedRecentlyWatched;

  const visibilitySourceKey = sessionSource
    ? sessionSource.visibilitySourceKey
    : savedChannels.length > 0
    ? 'legacy-local-library-v1'
    : '';

  const visibility = useCategoryVisibility(
    profileId,
    visibilitySourceKey
  );

  const { isCategoryHidden } = visibility;

  const movieCatalog =
    useMovieCatalog(xtreamCredentials);

  const seriesCatalog =
    useSeriesCatalog(xtreamCredentials);

  const liveCategories = useMemo(() => {
    const names = new Set<string>();

    for (const channel of importedChannels) {
      const category =
        channel.category?.trim() || '';

      names.add(category);
    }

return Array.from(names)
  .map((name) => ({
            id: name || '__uncategorized__',
        name:
          name ||
          t('common.uncategorized'),
      }));
  }, [importedChannels, t]);

  const visibleLiveCategories = useMemo(
    () =>
      liveCategories.filter(
        (category) =>
          !isCategoryHidden(
            'live',
            category.id
          )
      ),
    [liveCategories, isCategoryHidden]
  );

  const visibleMovieCategories = useMemo(
    () =>
      movieCategories.filter(
        (category) =>
          !isCategoryHidden(
            'movies',
            category.id
          )
      ),
    [movieCategories, isCategoryHidden]
  );

  const visibleSeriesCategories = useMemo(
    () =>
      seriesCategories.filter(
        (category) =>
          !isCategoryHidden(
            'series',
            category.id
          )
      ),
    [seriesCategories, isCategoryHidden]
  );

  const visibleImportedChannels = useMemo(
    () =>
      importedChannels.filter(
        (channel) =>
          !isCategoryHidden(
            'live',
            channel.category?.trim() ||
              '__uncategorized__'
          )
      ),
    [importedChannels, isCategoryHidden]
  );

  const visibleRecentlyWatched = useMemo(
    () =>
      recentlyWatched.filter(
        (channel) =>
          !isCategoryHidden(
            'live',
            channel.category?.trim() ||
              '__uncategorized__'
          )
      ),
    [recentlyWatched, isCategoryHidden]
  );

  useEffect(() => {
    if (
      activeLiveCategory &&
      isCategoryHidden(
        'live',
        activeLiveCategory
      )
    ) {
      setActiveLiveCategory('');
    }

    if (
      activeMovieCategory &&
      isCategoryHidden(
        'movies',
        activeMovieCategory
      )
    ) {
      setActiveMovieCategory('');
    }

    if (
      activeSeriesCategory &&
      isCategoryHidden(
        'series',
        activeSeriesCategory
      )
    ) {
      setActiveSeriesCategory('');
    }
  }, [
    activeLiveCategory,
    activeMovieCategory,
    activeSeriesCategory,
    isCategoryHidden,
  ]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.language,
      language
    );
  }, [language]);

  useEffect(() => {
    setMovieCategories(
      movieCatalog.data?.categories ?? []
    );
  }, [
    movieCatalog.data,
    xtreamCredentials,
  ]);

  useEffect(() => {
    setSeriesCategories(
      seriesCatalog.data?.categories ?? []
    );
  }, [
    seriesCatalog.data,
    xtreamCredentials,
  ]);

  useEffect(() => {
    const safeFavorites:
      FavoritesByProfile = {};

    for (const [id, entry] of Object.entries(
      favoritesByProfile
    )) {
      safeFavorites[id] = {
        channelIds:
          Array.isArray(entry?.channelIds)
            ? entry.channelIds
            : [],
        catalog: Array.isArray(entry?.catalog)
          ? entry.catalog.map((item) =>
              copyCatalogFavorite(
                item,
                false
              )
            )
          : [],
      };
    }

    if (
      saveToStorage(
        STORAGE_KEYS.profileFavorites,
        safeFavorites
      )
    ) {
      try {
        localStorage.removeItem(
          STORAGE_KEYS.legacyFavorites
        );
      } catch {
        // La migration reste utilisable.
      }
    }
  }, [favoritesByProfile]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.profiles,
      profiles
    );
  }, [profiles]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.activeProfile,
      activeProfile
    );
  }, [activeProfile]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.importedChannels,
      savedChannels
    );
  }, [savedChannels]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.recentlyWatched,
      savedRecentlyWatched
    );
  }, [savedRecentlyWatched]);

  useEffect(() => {
    saveToStorage(
      STORAGE_KEYS.defaultVolume,
      defaultVolume
    );
  }, [defaultVolume]);

  // Positions à retrouver au retour : la page (et la rubrique) d'où l'on est
  // parti, de la plus ancienne à la plus récente. Un film ouvert depuis une
  // recherche, puis « Retour », ramène à cette recherche.
  const currentPageRef = useRef(currentPage);
  const activeSubPageRef = useRef(activeSubPage);

  currentPageRef.current = currentPage;
  activeSubPageRef.current = activeSubPage;

  const returnStackRef = useRef<Array<{ page: Page; sub: SubPage }>>([]);

  const pushReturn = useCallback(() => {
    returnStackRef.current = [
      ...returnStackRef.current.slice(-9),
      { page: currentPageRef.current, sub: activeSubPageRef.current },
    ];
  }, []);

  const rememberReturn = useCallback(
    (page: Page) => {
      if (page === 'player') {
        if (currentPageRef.current !== 'player') pushReturn();
      } else if (page !== 'series') {
        // Navigation ordinaire (menu, liens) : on repart d'un historique vide.
        returnStackRef.current = [];
      }
    },
    [pushReturn]
  );

  const setCurrentPage = useCallback(
    (page: Page) => {
      rememberReturn(page);
      setCurrentPageState(page);
    },
    [rememberReturn]
  );

  const navigate = useCallback(
    (page: Page, sub?: SubPage) => {
      rememberReturn(page);
      setCurrentPageState(page);

      if (sub) {
        setActiveSubPage(sub);
      }
    },
    [rememberReturn]
  );

  // Ouvrir une série depuis une autre page (accueil, favoris…) : « Retour »
  // reviendra à cette page.
  const setRequestedSeriesId = useCallback(
    (id: string | null) => {
      if (id && currentPageRef.current !== 'series') pushReturn();

      setRequestedSeriesIdState(id);
    },
    [pushReturn]
  );

  const returnFromPlayer = useCallback(
    (fallbackPage: Page, fallbackSub: SubPage = 'all') => {
      const stack = returnStackRef.current;
      const target = stack[stack.length - 1];

      returnStackRef.current = stack.slice(0, -1);

      setCurrentPageState(target ? target.page : fallbackPage);
      setActiveSubPage(target ? target.sub : fallbackSub);
    },
    []
  );

  const peekReturn = useCallback(() => {
    const stack = returnStackRef.current;

    return stack.length ? stack[stack.length - 1] : null;
  }, []);

  // Historique des pages pour les boutons latéraux de la souris, comme dans un navigateur.
  // Le lecteur n'y figure pas : son bouton « Retour » sait où revenir.
  const pageHistoryRef = useRef<{
    entries: Array<{ page: Page; sub: SubPage }>;
    index: number;
  }>({ entries: [{ page: currentPage, sub: activeSubPage }], index: 0 });

  useEffect(() => {
    if (currentPage === 'player') return;

    const history = pageHistoryRef.current;
    const current = history.entries[history.index];

    if (current && current.page === currentPage && current.sub === activeSubPage) {
      return;
    }

    history.entries = [
      ...history.entries.slice(0, history.index + 1),
      { page: currentPage, sub: activeSubPage },
    ].slice(-30);
    history.index = history.entries.length - 1;
  }, [currentPage, activeSubPage]);

  const walkHistory = useCallback((direction: -1 | 1) => {
    const history = pageHistoryRef.current;

    // Depuis le lecteur, « précédent » ramène à la page d'où la lecture est partie
    // (la dernière page enregistrée), pas à celle d'avant.
    let index =
      currentPageRef.current === 'player' && direction === -1
        ? history.index
        : history.index + direction;

    // Une entrée identique à la page affichée ne changerait rien : on la saute.
    while (index >= 0 && index < history.entries.length) {
      const entry = history.entries[index];

      if (
        entry.page !== currentPageRef.current ||
        entry.sub !== activeSubPageRef.current
      ) {
        history.index = index;
        returnStackRef.current = [];
        setCurrentPageState(entry.page);
        setActiveSubPage(entry.sub);

        return true;
      }

      index += direction;
    }

    return false;
  }, []);

  const goBack = useCallback(() => walkHistory(-1), [walkHistory]);
  const goForward = useCallback(() => walkHistory(1), [walkHistory]);

  const showToast = useCallback(
    (
      message: string,
      type: Toast['type'] = 'info'
    ) => {
      const id =
        `toast-${++toastIdRef.current}`;

      setToasts((previous) => [
        ...previous,
        { id, message, type },
      ]);
    },
    []
  );

  const dismissToast = useCallback(
    (id: string) => {
      setToasts((previous) =>
        previous.filter(
          (toast) => toast.id !== id
        )
      );
    },
    []
  );

  const resetCatalogSelection =
    useCallback(() => {
      setActiveLiveCategory('');
      setActiveMovieCategory('');
      setMovieCategories([]);
      setActiveSeriesCategory('');
      setSeriesCategories([]);
      setRequestedSeriesIdState(null);
      setSelectedChannel(null);
      setSessionRecentlyWatched([]);
      setSearchQuery('');
    }, []);

  const clearSession = useCallback(() => {
    sessionActiveRef.current = false;
    setSessionSource(null);
    setActiveSavedSourceId(null);
    activeSavedSourceIdRef.current = null;
    resetCatalogSelection();
  }, [resetCatalogSelection]);

  const applySessionSource = useCallback(
    (
      name: string,
      channels: Channel[],
      credentials?: XtreamCredentials,
      savedSourceId: string | null = null,
      playlistIdentity?: string
    ) => {
      if (!channels.length) {
        throw new Error(
          t('errors.sourceHasNoChannels')
        );
      }

      const normalizedCredentials =
        credentials
          ? {
              serverUrl:
                credentials.serverUrl
                  .trim()
                  .replace(/\/+$/, ''),
              username:
                credentials.username,
              password:
                credentials.password,
            }
          : null;

      const nextVisibilitySourceKey =
        normalizedCredentials
          ? `xtream:${xtreamIdentity(
              normalizedCredentials
            )}`
          : playlistIdentity?.trim()
          ? playlistFingerprint(
              playlistIdentity
            )
          : '';

      sessionActiveRef.current = true;
      resetCatalogSelection();

      // Chaînes récentes : on retrouve celles de ce profil pour cette source
      // (seulement des empreintes sont enregistrées, jamais les adresses).
      sessionKeyRef.current = nextVisibilitySourceKey;
      setSessionRecentlyWatched(
        nextVisibilitySourceKey
          ? restoreRecents(
              readRecentEntries(
                profileIdRef.current,
                nextVisibilitySourceKey
              ),
              channels
            )
          : []
      );

      setSessionSource({
        name:
          name.trim() ||
          t('player.temporarySource'),
        channels,
        credentials:
          normalizedCredentials,
        visibilitySourceKey:
          nextVisibilitySourceKey,
      });

      setActiveSavedSourceId(
        savedSourceId
      );

      activeSavedSourceIdRef.current =
        savedSourceId;
    },
    [resetCatalogSelection, t]
  );

  const startSessionSource = useCallback(
    (
      name: string,
      channels: Channel[],
      credentials?: XtreamCredentials,
      playlistIdentity?: string
    ) => {
      connectionRequestRef.current += 1;

      applySessionSource(
        name,
        channels,
        credentials,
        null,
        playlistIdentity
      );

      setXtreamConnectionStatus('idle');
      setXtreamConnectMessage('');
    },
    [applySessionSource]
  );

  const disconnectSessionSource =
    useCallback(() => {
      connectionRequestRef.current += 1;
      clearSession();

      setXtreamConnectionStatus('idle');
      setXtreamConnectMessage(
        t('player.sourceDisconnected')
      );
    }, [clearSession, t]);

  const refreshSavedXtreamSources =
    useCallback(async () => {
      const owner = profileId;
      const request =
        ++savedListRequestRef.current;

      setSavedSourcesLoading(true);
      setSavedSourcesError('');

      try {
        const result =
          await invoke<SavedXtreamSourcesResponse>(
            'list_saved_xtream_sources',
            { profileId: owner }
          );

        if (
          profileIdRef.current !== owner ||
          request !==
            savedListRequestRef.current
        ) {
          return;
        }

        setSavedXtreamSources(
          result.sources
        );
      } catch (caught) {
        if (
          profileIdRef.current === owner &&
          request ===
            savedListRequestRef.current
        ) {
          setSavedSourcesError(
            errorMessage(
              caught,
              t('errors.cannotReadSavedAccounts')
            )
          );
        }
      } finally {
        if (
          profileIdRef.current === owner &&
          request ===
            savedListRequestRef.current
        ) {
          setSavedSourcesLoading(false);
        }
      }
    }, [profileId, t]);

  const connectXtreamSource = useCallback(
    async (input: XtreamConnectionInput) => {
      const name = input.name.trim();

      const serverUrl = input.serverUrl
        .trim()
        .replace(/\/+$/, '');

      if (
        !name ||
        !serverUrl ||
        !input.username.trim() ||
        !input.password
      ) {
        throw new Error(
          t('errors.completeConnectionFields')
        );
      }

      const owner = profileId;
      const request =
        ++connectionRequestRef.current;

      const isCurrent = () =>
        profileIdRef.current === owner &&
        connectionRequestRef.current ===
          request;

      setXtreamConnectionStatus(
        'connecting'
      );
      setXtreamConnectMessage(
        t('player.connectingXtream')
      );

      try {
        const credentials:
          XtreamCredentials = {
          serverUrl,
          username: input.username,
          password: input.password,
        };

        const channels =
          await fetchXtreamChannels(
            credentials,
            name,
            t
          );

        if (!isCurrent()) return;

        let savedId: string | null = null;
        let savingWarning = '';

        if (input.remember) {
          try {
            const saved =
              await invoke<SavedXtreamSourceSummary>(
                'save_xtream_source',
                {
                  profileId: owner,
                  sourceId:
                    input.sourceId ??
                    null,
                  name,
                  serverUrl:
                    credentials.serverUrl,
                  username:
                    credentials.username,
                  password:
                    credentials.password,
                }
              );

            savedId = saved.id;
          } catch (caught) {
            savingWarning =
              errorMessage(
                caught,
                t('errors.cannotSaveAccount')
              );
          }
        }

        if (!isCurrent()) return;

        applySessionSource(
          name,
          channels,
          credentials,
          savedId
        );

        setXtreamConnectionStatus(
          'success'
        );

        setXtreamConnectMessage(
          savingWarning
            ? `${channels.length} ${t('player.channelsLoaded')}. ${t('player.accountNotSaved')} : ${savingWarning}`
            : `${channels.length} ${t('player.channelsLoaded')}. ${
                savedId
                  ? t('player.accountSaved')
                  : t('player.temporaryConnection')
              }`
        );

        if (savingWarning) {
          showToast(
            t('player.connectedButSaveFailed'),
            'error'
          );
        }

        if (input.remember) {
          await refreshSavedXtreamSources();
        }
      } catch (caught) {
        if (!isCurrent()) return;

        const message = errorMessage(
          caught,
          t('errors.xtreamConnectionFailed')
        );

        setXtreamConnectionStatus('error');
        setXtreamConnectMessage(message);

        throw new Error(message);
      }
    },
    [
      profileId,
      applySessionSource,
      refreshSavedXtreamSources,
      showToast,
      t,
    ]
  );

  const connectSavedXtreamSource =
    useCallback(
      async (sourceId: string) => {
        const owner = profileId;
        const request =
          ++connectionRequestRef.current;

        const isCurrent = () =>
          profileIdRef.current === owner &&
          connectionRequestRef.current ===
            request;

        setXtreamConnectionStatus(
          'connecting'
        );
        setXtreamConnectMessage(
          t('player.connectingSavedAccount')
        );

        try {
          const saved =
            await invoke<SavedXtreamSource | null>(
              'load_saved_xtream_source',
              {
                profileId: owner,
                sourceId,
              }
            );

          if (!isCurrent()) return;

          if (!saved) {
            throw new Error(
              t('errors.savedAccountNotFound')
            );
          }

          const credentials:
            XtreamCredentials = {
            serverUrl: saved.serverUrl,
            username: saved.username,
            password: saved.password,
          };

          const channels =
            await fetchXtreamChannels(
              credentials,
              saved.name,
              t
            );

          if (!isCurrent()) return;

          applySessionSource(
            saved.name,
            channels,
            credentials,
            saved.id
          );

          setXtreamConnectionStatus(
            'success'
          );
          setXtreamConnectMessage(
            `${channels.length} ${t('player.channelsLoaded')} ${t('player.fromSource')} « ${saved.name} ».`
          );
        } catch (caught) {
          if (!isCurrent()) return;

          const message =
            errorMessage(
              caught,
              t('errors.cannotReconnectAccount')
            );

          setXtreamConnectionStatus(
            'error'
          );
          setXtreamConnectMessage(message);

          throw new Error(message);
        }
      },
      [profileId, applySessionSource, t]
    );

  const forgetSavedXtreamSource =
    useCallback(
      async (sourceId: string) => {
        const owner = profileId;

        try {
          await invoke(
            'forget_xtream_source',
            {
              profileId: owner,
              sourceId,
            }
          );

          if (
            profileIdRef.current !==
            owner
          ) {
            return;
          }

          if (
            activeSavedSourceIdRef.current ===
            sourceId
          ) {
            connectionRequestRef.current += 1;
            clearSession();

            setXtreamConnectionStatus(
              'idle'
            );
            setXtreamConnectMessage(
              t('player.accountForgotten')
            );
          }

          setSavedXtreamSources(
            (previous) =>
              previous.filter(
                (source) =>
                  source.id !== sourceId
              )
          );

          showToast(
            t('player.accountDeletedFromVault'),
            'success'
          );

          await refreshSavedXtreamSources();
        } catch (caught) {
          if (
            profileIdRef.current !==
            owner
          ) {
            return;
          }

          const message =
            errorMessage(
              caught,
              t('errors.cannotDeleteAccount')
            );

          setSavedSourcesError(message);
          throw new Error(message);
        }
      },
      [
        profileId,
        clearSession,
        refreshSavedXtreamSources,
        showToast,
        t,
      ]
    );

  useEffect(() => {
    let cancelled = false;

    const owner = profileId;
    const request =
      ++connectionRequestRef.current;
    const listRequest =
      ++savedListRequestRef.current;

    const isCurrent = () =>
      !cancelled &&
      profileIdRef.current === owner &&
      connectionRequestRef.current ===
        request;

    clearSession();
    setSavedXtreamSources([]);
    setSavedSourcesError('');
    setSavedSourcesLoading(true);
    setXtreamConnectionStatus('idle');
    setXtreamConnectMessage('');

    async function restore() {
      let list:
        SavedXtreamSourcesResponse;

      try {
        list =
          await invoke<SavedXtreamSourcesResponse>(
            'list_saved_xtream_sources',
            { profileId: owner }
          );
      } catch (caught) {
        if (
          !cancelled &&
          profileIdRef.current === owner &&
          savedListRequestRef.current ===
            listRequest
        ) {
          setSavedSourcesError(
            errorMessage(
              caught,
              t('errors.cannotReadWindowsVault')
            )
          );
        }

        return;
      } finally {
        if (
          !cancelled &&
          profileIdRef.current === owner &&
          savedListRequestRef.current ===
            listRequest
        ) {
          setSavedSourcesLoading(false);
        }
      }

      if (
        !cancelled &&
        profileIdRef.current === owner &&
        savedListRequestRef.current ===
          listRequest
      ) {
        setSavedXtreamSources(
          list.sources
        );
      }

      if (
        !isCurrent() ||
        !list.lastUsedSourceId
      ) {
        return;
      }

      setXtreamConnectionStatus(
        'connecting'
      );
      setXtreamConnectMessage(
        t('player.restoringLastAccount')
      );

      try {
        const saved =
          await invoke<SavedXtreamSource | null>(
            'load_saved_xtream_source',
            {
              profileId: owner,
              sourceId:
                list.lastUsedSourceId,
            }
          );

        if (!isCurrent()) return;

        if (!saved) {
          setXtreamConnectionStatus('idle');
          setXtreamConnectMessage('');
          return;
        }

        const credentials:
          XtreamCredentials = {
          serverUrl: saved.serverUrl,
          username: saved.username,
          password: saved.password,
        };

        const channels =
          await fetchXtreamChannels(
            credentials,
            saved.name,
            t
          );

        if (!isCurrent()) return;

        applySessionSource(
          saved.name,
          channels,
          credentials,
          saved.id
        );

        setXtreamConnectionStatus(
          'success'
        );
        setXtreamConnectMessage(
          `${t('player.accountRestored')} « ${saved.name} » : ${channels.length} ${t('player.channels')}.`
        );
      } catch (caught) {
        if (!isCurrent()) return;

        setXtreamConnectionStatus('error');
        setXtreamConnectMessage(
          errorMessage(
            caught,
            t('errors.autoReconnectFailed')
          )
        );
      }
    }

    void restore()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setStartupReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    profileId,
    clearSession,
    applySessionSource,
    t,
  ]);

  const toggleFavorite = useCallback(
    (channel: Channel) => {
      const wasFavorite =
        favorites.includes(channel.id);

      setFavoritesByProfile(
        (previous) => {
          const entry =
            previous[profileId] ?? {
              channelIds: [],
              catalog: [],
            };

          const ids = Array.isArray(
            entry.channelIds
          )
            ? entry.channelIds
            : [];

          return {
            ...previous,
            [profileId]: {
              ...entry,
              channelIds:
                ids.includes(channel.id)
                  ? ids.filter(
                      (id) =>
                        id !== channel.id
                    )
                  : [...ids, channel.id],
            },
          };
        }
      );

      showToast(
        wasFavorite
          ? `"${channel.name}" ${t('favorites.removed')}`
          : `"${channel.name}" ${t('favorites.added')}`,
        wasFavorite
          ? 'info'
          : 'success'
      );
    },
    [
      favorites,
      profileId,
      showToast,
      t,
    ]
  );

  const isFavorite = useCallback(
    (channelId: string) =>
      favorites.includes(channelId),
    [favorites]
  );

  const toggleCatalogFavorite =
    useCallback(
      (item: CatalogFavorite) => {
        const wasFavorite =
          catalogFavorites.some(
            (favorite) =>
              favorite.id === item.id
          );

        setFavoritesByProfile(
          (previous) => {
            const entry =
              previous[profileId] ?? {
                channelIds: [],
                catalog: [],
              };

            const catalog =
              Array.isArray(
                entry.catalog
              )
                ? entry.catalog
                : [];

            return {
              ...previous,
              [profileId]: {
                ...entry,
                catalog:
                  catalog.some(
                    (favorite) =>
                      favorite.id ===
                      item.id
                  )
                    ? catalog.filter(
                        (favorite) =>
                          favorite.id !==
                          item.id
                      )
                    : [
                        ...catalog,
                        copyCatalogFavorite(
                          item,
                          true
                        ),
                      ],
              },
            };
          }
        );

        showToast(
          wasFavorite
            ? `"${item.name}" ${t('favorites.removed')}`
            : `"${item.name}" ${t('favorites.added')}`,
          wasFavorite
            ? 'info'
            : 'success'
        );
      },
      [
        catalogFavorites,
        profileId,
        showToast,
        t,
      ]
    );

  const isCatalogFavorite = useCallback(
    (id: string) =>
      catalogFavorites.some(
        (item) => item.id === id
      ),
    [catalogFavorites]
  );

  const setDefaultVolume = useCallback(
    (volume: number) => {
      if (Number.isFinite(volume)) {
        setDefaultVolumeState(
          Math.max(
            0,
            Math.min(100, volume)
          )
        );
      }
    },
    []
  );

  const setActiveProfile = useCallback(
    (profile: Profile) => {
      if (
        profile.id ===
        profileIdRef.current
      ) {
        return;
      }

      connectionRequestRef.current += 1;
      savedListRequestRef.current += 1;
      profileIdRef.current = profile.id;

      clearSession();
      setSavedXtreamSources([]);
      setActiveProfileId(profile.id);
      setCurrentPageState('home');
      setActiveSubPage('all');
    },
    [clearSession]
  );

  const addProfile = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setProfiles((previous) => [
        ...previous,
        {
          id:
            `profile-${crypto.randomUUID()}`,
          name: trimmed,
          avatarColor:
            AVATAR_COLORS[
              Math.floor(
                Math.random() *
                  AVATAR_COLORS.length
              )
            ],
          createdAt: Date.now(),
        },
      ]);
    },
    []
  );

  const renameProfile = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setProfiles((previous) =>
        previous.map((profile) =>
          profile.id === id
            ? {
                ...profile,
                name: trimmed,
              }
            : profile
        )
      );
    },
    []
  );

  const setProfileAvatarColor =
    useCallback(
      (id: string, color: string) => {
        if (
          !AVATAR_COLORS.includes(color)
        ) {
          return;
        }

        setProfiles((previous) =>
          previous.map((profile) =>
            profile.id === id
              ? {
                  ...profile,
                  avatarColor: color,
                }
              : profile
          )
        );
      },
      []
    );

  const deleteProfile = useCallback(
    (id: string) => {
      if (profiles.length <= 1) {
        return;
      }

      const remaining =
        profiles.filter(
          (profile) =>
            profile.id !== id
        );

      if (
        remaining.length ===
        profiles.length
      ) {
        return;
      }

      if (
        id === profileIdRef.current
      ) {
        connectionRequestRef.current += 1;
        savedListRequestRef.current += 1;

        profileIdRef.current =
          remaining[0].id;

        clearSession();

        setActiveProfileId(
          remaining[0].id
        );
        setCurrentPageState('home');
        setActiveSubPage('all');
      }

      setProfiles(remaining);

      setFavoritesByProfile(
        (previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        }
      );

      showToast(
        t('profiles.deletedWarning'),
        'info'
      );
    },
    [
      profiles,
      clearSession,
      showToast,
      t,
    ]
  );

  const setImportedChannels =
    useCallback(
      (channels: Channel[]) => {
        if (
          !sessionActiveRef.current
        ) {
          setSavedChannels(channels);
        }
      },
      []
    );

  const clearImportedChannels =
    useCallback(() => {
      if (
        !sessionActiveRef.current
      ) {
        setSavedChannels([]);
      }
    }, []);

  const addToRecentlyWatched =
    useCallback(
      (channel: Channel) => {
        const stamped: Channel = {
          ...channel,
          watchedAt: Date.now(),
        };

        const updateHistory = (
          previous: Channel[]
        ): Channel[] =>
          [
            stamped,
            ...previous.filter(
              (item) =>
                item.id !== channel.id
            ),
          ].slice(0, 20);

        if (
          sessionActiveRef.current
        ) {
          setSessionRecentlyWatched(
            updateHistory
          );

          rememberRecent(
            profileIdRef.current,
            sessionKeyRef.current,
            channel.id,
            stamped.watchedAt ?? Date.now()
          );
        } else {
          setSavedRecentlyWatched(
            updateHistory
          );
        }
      },
      []
    );

  const value: AppContextValue = {
    currentPage,
    setCurrentPage,
    activeSubPage,
    setActiveSubPage,
    navigate,
    returnFromPlayer,
    peekReturn,
    goBack,
    goForward,

    language,
    setLanguage,
    t,
    locale,

    activeLiveCategory,
    setActiveLiveCategory,

    movieCategories,
    setMovieCategories,
    visibleMovieCategories,
    activeMovieCategory,
    setActiveMovieCategory,

    seriesCategories,
    setSeriesCategories,
    visibleSeriesCategories,
    activeSeriesCategory,
    setActiveSeriesCategory,

    liveCategories,
    visibleLiveCategories,

    requestedSeriesId,
    setRequestedSeriesId,

    selectedChannel,
    setSelectedChannel,

    favorites,
    toggleFavorite,
    isFavorite,

    catalogFavorites,
    toggleCatalogFavorite,
    isCatalogFavorite,

    defaultVolume,
    setDefaultVolume,

    profiles,
    activeProfile,
    setActiveProfile,
    addProfile,
    renameProfile,
    setProfileAvatarColor,
    deleteProfile,

    importedChannels,
    visibleImportedChannels,
    setImportedChannels,
    clearImportedChannels,

    sessionSourceName,
    xtreamCredentials,
    sourceKey,
    visibilitySourceKey,
    startSessionSource,
    disconnectSessionSource,

    savedXtreamSources,
    activeSavedSourceId,
    savedSourcesLoading,
    startupReady,
    savedSourcesError,
    refreshSavedXtreamSources,
    connectXtreamSource,
    connectSavedXtreamSource,
    forgetSavedXtreamSource,

    recentlyWatched,
    visibleRecentlyWatched,
    addToRecentlyWatched,

    searchQuery,
    setSearchQuery,

    toasts,
    showToast,
    dismissToast,

    xtreamConnectionStatus,
    setXtreamConnectionStatus,
    xtreamConnectMessage,
    setXtreamConnectMessage,

    ...visibility,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp must be used within AppProvider'
    );
  }

  return context;
}