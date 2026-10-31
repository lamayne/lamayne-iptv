import { beforeEach } from 'vitest';

// Les tests tournent dans Node, qui n'a pas de stockage local : on en fournit
// un en mémoire, vidé avant chaque test.
class MemoryStorage {
  private data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }

  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});

beforeEach(() => {
  localStorage.clear();
});
