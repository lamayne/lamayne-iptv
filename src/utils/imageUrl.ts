// Les fournisseurs renvoient souvent des images TMDB en très petite taille
// (w92, w185, w300…). TMDB sert la même image dans n'importe quelle taille :
// on demande celle qui convient à l'affichage, ce qui évite le flou.

const TMDB = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|h\d+)(\/)/i;

export function sharpenImage(
  url: string,
  size: 'w342' | 'w500' | 'w1280'
): string {
  return url.replace(TMDB, `$1${size}$2`);
}
