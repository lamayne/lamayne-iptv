import { invoke, isTauri } from '@tauri-apps/api/core';

// Chargement d'images distantes avec repli sur le backend Rust.
// Partagé par <SmartImage> (affichage) et par la sélection « du moment »
// (qui vérifie qu'une image se charge vraiment avant de la mettre en avant).

const MAX_BLOBS = 120;

export const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function sniffType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

export function loadImageViaRust(url: string): Promise<string> {
  const cached = blobCache.get(url);

  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(url);

  if (existing) return existing;

  const request = invoke<ArrayBuffer>('fetch_image', { url })
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);

      const objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: sniffType(bytes) })
      );

      blobCache.set(url, objectUrl);

      if (blobCache.size > MAX_BLOBS) {
        const oldest = blobCache.keys().next().value;

        if (oldest !== undefined) {
          const stale = blobCache.get(oldest);

          if (stale) URL.revokeObjectURL(stale);

          blobCache.delete(oldest);
        }
      }

      return objectUrl;
    })
    .finally(() => {
      inflight.delete(url);
    });

  inflight.set(url, request);

  return request;
}

const MIN_SIDE = 120;
const PROBE_TIMEOUT_MS = 9000;

function tryLoad(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();

    image.referrerPolicy = 'no-referrer';

    const timer = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, PROBE_TIMEOUT_MS);

    image.onload = () => {
      window.clearTimeout(timer);

      // Les fournisseurs renvoient parfois une image 1×1 à la place d'une affiche.
      resolve(
        image.naturalWidth >= MIN_SIDE && image.naturalHeight >= MIN_SIDE
      );
    };

    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };

    image.src = src;
  });
}

// L'image se charge-t-elle vraiment, et est-ce une vraie image (pas un pixel) ?
export async function probeImage(url: string): Promise<boolean> {
  if (await tryLoad(url)) return true;

  if (!isTauri()) return false;

  try {
    return await tryLoad(await loadImageViaRust(url));
  } catch {
    return false;
  }
}
