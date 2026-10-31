const KEY = 'msp_onboarded_v1';

// Le parcours de première utilisation ne s'ouvre qu'une seule fois.
export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // stockage indisponible : on ne force rien
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Sans importance.
  }
}
