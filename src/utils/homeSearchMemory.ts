// Mémorise la recherche de l'accueil le temps de la session : après avoir
// ouvert un titre puis être revenu en arrière, on retrouve ses résultats.
// Un clic sur « Accueil » dans le menu repart d'une recherche vide.

export type HomeSearchScope = 'all' | 'live' | 'movies' | 'series';

let remembered = '';
let rememberedScope: HomeSearchScope = 'all';

export function getHomeSearch(): string {
  return remembered;
}

export function setHomeSearch(value: string): void {
  remembered = value;
}

export function getHomeSearchScope(): HomeSearchScope {
  return rememberedScope;
}

export function setHomeSearchScope(value: HomeSearchScope): void {
  rememberedScope = value;
}

export function clearHomeSearch(): void {
  remembered = '';
  rememberedScope = 'all';
}
