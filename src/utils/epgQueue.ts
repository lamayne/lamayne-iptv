import { invoke } from '@tauri-apps/api/core';

export type EpgPriority = 'foreground' | 'background';

type Options = {
  priority?: EpgPriority;
  ttlMs?: number;
};

type Job = {
  key: string;
  command: string;
  args: Record<string, unknown>;
  priority: EpgPriority;
  ttlMs: number;
  started: boolean;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type Cached = { value: unknown; expiresAt: number };

const pending: Job[] = [];
const inFlight = new Map<string, Job>();
const cache = new Map<string, Cached>();
let active = 0;
let activeBackground = 0;

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > 400) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function pump() {
  while (active < 3 && pending.length > 0) {
    let index = pending.findIndex((job) => job.priority === 'foreground');
    if (index < 0) {
      if (activeBackground >= 2) return;
      index = 0;
    }

    const [job] = pending.splice(index, 1);
    job.started = true;
    const background = job.priority === 'background';
    active += 1;
    if (background) activeBackground += 1;

    void invoke<unknown>(job.command, job.args).then(
      (value) => {
        if (job.ttlMs > 0) {
          cache.delete(job.key);
          cache.set(job.key, { value, expiresAt: Date.now() + job.ttlMs });
          pruneCache();
        }
        job.resolve(value);
      },
      (error: unknown) => job.reject(error)
    ).finally(() => {
      active -= 1;
      if (background) activeBackground -= 1;
      inFlight.delete(job.key);
      pump();
    });
  }
}

// Oublie les réponses déjà reçues : les prochains affichages interrogent de nouveau.
export function clearEpgCache() {
  cache.clear();
}

export function queuedEpgInvoke<T>(
  command: string,
  args: Record<string, unknown>,
  options: Options = {}
): Promise<T> {
  // Ces clés restent uniquement en mémoire : ni stockage disque, ni logs.
  const key = JSON.stringify([command, args]);
  const priority = options.priority ?? 'background';
  pruneCache();

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.value as T);
  }

  const existing = inFlight.get(key);
  if (existing) {
    if (!existing.started && priority === 'foreground') {
      existing.priority = 'foreground';
      pump();
    }
    return existing.promise as Promise<T>;
  }

  if (pending.length >= 300) {
    return Promise.reject(new Error('File EPG occupée ; nouvelle tentative automatique.'));
  }

  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });

  const job: Job = {
    key, command, args, priority,
    ttlMs: options.ttlMs ?? 60_000,
    started: false, promise, resolve, reject,
  };
  inFlight.set(key, job);
  pending.push(job);
  pump();
  return promise as Promise<T>;
}
