import { invoke, isTauri } from '@tauri-apps/api/core';
import { translateNow } from '@/i18n';
import { isBackendError, localizeBackendError } from '@/i18n/backendErrors';

export async function downloadM3UPlaylist(url: string): Promise<string> {
  if (!isTauri()) {
    throw new Error(translateNow('errors.desktopRequired'));
  }

  try {
    return await invoke<string>('fetch_m3u_playlist', {
      url: url.trim(),
    });
  } catch (error: unknown) {
    const message = typeof error === 'string' ? error : '';

    // Seuls les messages connus de la partie Rust sont affichés ; les autres
    // sont remplacés par une phrase générique (pas de détail technique).
    if (message && isBackendError(message)) {
      throw new Error(localizeBackendError(message));
    }

    throw new Error(translateNow('errors.playlistDownloadFailed'));
  }
}
