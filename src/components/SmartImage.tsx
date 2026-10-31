import { useState, type ImgHTMLAttributes } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { blobCache, loadImageViaRust } from '@/utils/imageLoad';

// Image distante qui se rattrape toute seule : si la webview refuse de la
// charger (contenu http, CSP, anti-hotlink du fournisseur…), elle est
// téléchargée par le backend Rust (commande `fetch_image`) puis affichée
// depuis la mémoire. Les images qui se chargent normalement ne coûtent rien.

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'adresse invalide';
  }
}

type Stage = 'direct' | 'waiting' | 'proxy' | 'failed';

type State = {
  src: string;
  shown: string;
  stage: Stage;
};

function initialState(src: string): State {
  const cached = blobCache.get(src);

  return cached
    ? { src, shown: cached, stage: 'proxy' }
    : { src, shown: src, stage: 'direct' };
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string;
  onFailed?: () => void;
};

export default function SmartImage({
  src,
  onFailed,
  className = '',
  ...rest
}: Props) {
  const [state, setState] = useState<State>(() => initialState(src));

  // Nouvelle adresse : on repart de zéro (mise à jour pendant le rendu).
  if (state.src !== src) {
    setState(initialState(src));
  }

  function handleError() {
    if (state.stage !== 'direct' || !isTauri()) {
      setState((previous) =>
        previous.src === src ? { ...previous, stage: 'failed' } : previous
      );
      onFailed?.();
      return;
    }

    console.warn(
      `[Image] Chargement direct refusé (${hostOf(src)}), essai via Rust.`
    );

    setState((previous) =>
      previous.src === src ? { ...previous, stage: 'waiting' } : previous
    );

    loadImageViaRust(src).then(
      (objectUrl) => {
        setState((previous) =>
          previous.src === src
            ? { ...previous, shown: objectUrl, stage: 'proxy' }
            : previous
        );
      },
      (error: unknown) => {
        console.warn(
          `[Image] Échec aussi via Rust (${hostOf(src)}) :`,
          error
        );

        if (/not found|not allowed|unknown command/i.test(String(error))) {
          console.error(
            '[Image] La commande fetch_image est absente : src-tauri/src/lib.rs n’a pas été mis à jour, ou l’app Rust n’a pas été relancée.'
          );
        }

        setState((previous) =>
          previous.src === src ? { ...previous, stage: 'failed' } : previous
        );
        onFailed?.();
      }
    );
  }

  if (state.stage === 'failed') return null;

  return (
    <img
      {...rest}
      // Certains fournisseurs refusent les images demandées avec un « Referer ».
      referrerPolicy="no-referrer"
      src={state.shown}
      onError={handleError}
      // L'image cassée reste invisible le temps du second essai.
      className={`${className} ${state.stage === 'waiting' ? 'invisible' : ''}`}
    />
  );
}
