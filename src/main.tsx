import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import '@fontsource-variable/inter';
import App from './App.tsx';
import { bootLanguage, translate } from './i18n';
import './index.css';

const MIN_SPLASH_MS = 900;
const SAFETY_SHOW_MS = 5000;
const FADE_MS = 320;
// Filet de sécurité : si le démarrage traîne, l'écran disparaît quand même.
const READY_TIMEOUT_MS = 20_000;
// Attente maximale du bandeau de l'accueil, une fois l'application prête.
const HOME_READY_TIMEOUT_MS = 12_000;
const startedAt = performance.now();

let windowShown = false;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function appReady() {
  return new Promise<void>((resolve) => {
    if ((window as unknown as { __lamayneReady?: boolean }).__lamayneReady) {
      resolve();
      return;
    }

    window.addEventListener('lamayne:ready', () => resolve(), { once: true });
  });
}

function homeReady() {
  return new Promise<void>((resolve) => {
    if ((window as unknown as { __lamayneHomeReady?: boolean }).__lamayneHomeReady) {
      resolve();
      return;
    }

    window.addEventListener('lamayne:home-ready', () => resolve(), { once: true });
  });
}

function setBootStatus(key: string) {
  const status = document.getElementById('boot-status');

  if (status) {
    status.textContent = translate(bootLanguage(), key);
  }
}

let appIsReady = false;

// Rassure si la connexion au fournisseur prend du temps.
function scheduleSlowMessage() {
  window.setTimeout(() => {
    if (appIsReady) return;

    setBootStatus('boot.connecting');
  }, 3500);
}

async function showWindow() {
  if (windowShown) return;
  windowShown = true;

  if (!('__TAURI_INTERNALS__' in window)) return;

  try {
    await getCurrentWindow().show();
  } catch (error) {
    console.error('Impossible d’afficher la fenêtre.', error);
  }
}

async function revealApp() {
  try {
    await nextPaint();

    const logo = document.getElementById(
      'boot-logo'
    ) as HTMLImageElement | null;

    await logo?.decode().catch(() => undefined);
    await document.fonts?.ready.catch(() => undefined);
    await nextPaint();
  } finally {
    await showWindow();
  }

  const remaining = Math.max(
    0,
    MIN_SPLASH_MS - (performance.now() - startedAt)
  );

  await sleep(remaining);

  // L'écran reste affiché jusqu'à ce que l'application ait fini de charger
  // vos comptes et vos chaînes : plus d'accueil vide qui se remplit ensuite.
  scheduleSlowMessage();
  await Promise.race([appReady(), sleep(READY_TIMEOUT_MS)]);
  appIsReady = true;

  // Puis jusqu'à ce que le bandeau de l'accueil soit affichable : plus de
  // grand rectangle vide qui se remplit après coup.
  setBootStatus('boot.preparing');
  await Promise.race([homeReady(), sleep(HOME_READY_TIMEOUT_MS)]);
  await nextPaint();

  const splash = document.getElementById('boot-splash');

  if (!splash) return;

  splash.classList.add('boot-hidden');
  await sleep(FADE_MS);
  splash.remove();
}

window.setTimeout(() => {
  void showWindow();
}, SAFETY_SHOW_MS);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

void revealApp();