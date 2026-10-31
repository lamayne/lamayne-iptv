import { useEffect, useRef } from 'react';
import {
  AppProvider,
  useApp,
} from '@/context/AppContext';
import Sidebar from '@/components/Sidebar';
import ToastContainer from '@/components/ToastContainer';
import PanScrollArea from '@/components/PanScrollArea';
import Home from '@/pages/Home';
import LiveTV from '@/pages/LiveTV';
import Player from '@/pages/Player';
import MovieDetails from '@/pages/MovieDetails';
import Favorites from '@/pages/Favorites';
import Settings from '@/pages/Settings';
import Movies from '@/pages/Movies';
import Series from '@/pages/Series';
import { isOnboarded, markOnboarded } from '@/utils/onboarding';

function MainContent() {
  const {
    currentPage,
    activeSubPage,
    selectedChannel,
    sourceKey,
    setSearchQuery,
    startupReady,
    savedXtreamSources,
    savedSourcesError,
    importedChannels,
    navigate,
    showToast,
    t,
  } = useApp();

  // Prévient l'écran de chargement (main.tsx) que l'application est prête.
  useEffect(() => {
    if (!startupReady) return;

    (window as unknown as { __lamayneReady?: boolean }).__lamayneReady = true;
    window.dispatchEvent(new Event('lamayne:ready'));
  }, [startupReady]);

  // Première utilisation : sans aucune source, on ouvre une seule fois les
  // Réglages (profil et ajout d'une source Xtream ou M3U).
  const hasSource =
    savedXtreamSources.length > 0 || importedChannels.length > 0;

  useEffect(() => {
    if (!startupReady) return;

    // Lecture du coffre impossible : on ne sait pas si des comptes existent,
    // donc on ne redirige pas.
    if (savedSourcesError) return;

    if (hasSource) {
      markOnboarded();
      return;
    }

    if (isOnboarded()) return;

    markOnboarded();
    navigate('settings', 'profiles');
    showToast(t('onboarding.welcome'), 'info');
  }, [startupReady, hasSource, savedSourcesError, navigate, showToast, t]);

  // En revenant du lecteur, la page retrouve sa position de défilement.
  const previousPageRef = useRef(currentPage);
  const cameFromPlayer =
    previousPageRef.current === 'player' && currentPage !== 'player';

  useEffect(() => {
    previousPageRef.current = currentPage;
  }, [currentPage]);

  // La recherche est effacée à chaque changement de page, sauf au retour du
  // lecteur : on retrouve alors ses résultats.
  const lastPageRef = useRef(currentPage);

  useEffect(() => {
    const cameBack =
      lastPageRef.current === 'player' && currentPage !== 'player';

    lastPageRef.current = currentPage;

    if (!cameBack) setSearchQuery('');
  }, [
    currentPage,
    sourceKey,
    setSearchQuery,
  ]);

  function renderPlayer() {
    const hasSeriesContext = Boolean(
      selectedChannel &&
        (
          selectedChannel as typeof selectedChannel & {
            seriesContext?: unknown;
          }
        ).seriesContext
    );

    const isMovie = Boolean(
      selectedChannel &&
        !selectedChannel.isLive &&
        !hasSeriesContext
    );

    return isMovie ? (
      <MovieDetails
        key={JSON.stringify([
          sourceKey,
          selectedChannel?.id,
        ])}
      />
    ) : (
      <Player />
    );
  }

  function renderPage() {
    switch (currentPage) {
      case 'home':
        return <Home />;

      case 'live':
        return <LiveTV />;

      case 'player':
        return renderPlayer();

      case 'favorites':
        return <Favorites />;

      case 'settings':
        return <Settings />;

      case 'movies':
        return <Movies />;

      case 'series':
        return <Series />;

      default:
        return <Home />;
    }
  }

  return (
    <div className="app-root flex h-screen overflow-hidden bg-surface-900">
      <Sidebar />

      <div className="ml-64 flex min-w-0 flex-1 flex-col overflow-hidden">
        <PanScrollArea
          scrollKey={`${currentPage}:${activeSubPage}`}
          restore={cameFromPlayer}
          keyboard={currentPage !== 'player'}
          className="app-main min-h-0 flex-1 overflow-y-auto"
        >
          {renderPage()}
        </PanScrollArea>
      </div>

      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}