import { invoke, isTauri } from '@tauri-apps/api/core';

// Diffusion vers les appareils Google (Chromecast, Google TV, Android TV…).
// Le moteur est dans le backend Rust, activé avec `--features cast` : tant
// qu'il ne l'est pas, `castSupported()` répond non et le bouton reste caché.

export type CastDevice = {
  id: string;
  name: string;
  model: string;
  host: string;
  port: number;
};

export type CastTarget = {
  url: string;
  contentType: string;
  live: boolean;
  // Avertissement à montrer avant d'envoyer (format souvent mal lu).
  warning: 'format' | null;
};

let supportPromise: Promise<boolean> | null = null;

export function castSupported(): Promise<boolean> {
  if (!isTauri()) return Promise.resolve(false);

  supportPromise ??= invoke<boolean>('cast_supported').catch(() => false);

  return supportPromise;
}

export function discoverCastDevices(): Promise<CastDevice[]> {
  return invoke<CastDevice[]>('cast_discover');
}

export function castPlay(device: CastDevice, target: CastTarget): Promise<void> {
  return invoke<void>('cast_play', {
    host: device.host,
    port: device.port,
    url: target.url,
    contentType: target.contentType,
    live: target.live,
  });
}

export function castStop(device: CastDevice): Promise<void> {
  return invoke<void>('cast_stop', { host: device.host, port: device.port });
}

const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
  ts: 'video/mp2t',
};

// Les appareils Google lisent bien le HLS (.m3u8) et le MP4, mais pas les
// flux bruts « .ts » des fournisseurs IPTV. Pour une chaîne en direct, on
// demande donc la version HLS du même flux (les serveurs Xtream la proposent).
export function castTarget(streamUrl: string, isLive: boolean): CastTarget {
  let url = streamUrl.trim();

  const match = url.match(/^(.*)\.([a-z0-9]{2,5})(\?.*)?$/i);
  const extension = match?.[2]?.toLowerCase() ?? '';

  if (isLive) {
    if (extension === 'ts') {
      url = `${match?.[1] ?? url}.m3u8${match?.[3] ?? ''}`;
    }

    const hls = /\.m3u8(\?.*)?$/i.test(url);

    return {
      url,
      contentType: hls ? 'application/x-mpegURL' : 'video/mp2t',
      live: true,
      warning: hls ? null : 'format',
    };
  }

  if (extension === 'm3u8') {
    return { url, contentType: 'application/x-mpegURL', live: false, warning: null };
  }

  const contentType = VIDEO_TYPES[extension] ?? 'video/mp4';

  return {
    url,
    contentType,
    live: false,
    warning: extension === 'mp4' || extension === 'm4v' || extension === 'webm' ? null : 'format',
  };
}

export type CastAudio = {
  // Nom du codec donné par mpv (ac3, eac3, dts, aac…).
  codec: string;
  language: string;
  title: string;
  // Nombre de pistes audio du fichier.
  count: number;
};

export type AudioSupport = 'ok' | 'maybe' | 'no' | 'unknown';

// Les appareils Google lisent AAC, MP3, Opus, Vorbis et FLAC. Le Dolby
// (AC-3, E-AC-3) dépend du modèle et du téléviseur. Le DTS et le TrueHD ne
// sont pas lus : le film s'affiche alors sans son.
export function audioSupport(codec: string): AudioSupport {
  const name = codec.trim().toLowerCase();

  if (!name) return 'unknown';
  if (/^(aac|mp3|opus|vorbis|flac|pcm)/.test(name)) return 'ok';
  if (/^(ac3|eac3|ac-3|e-ac-3)/.test(name)) return 'maybe';
  if (/^(dts|truehd|mlp)/.test(name)) return 'no';

  return 'unknown';
}
