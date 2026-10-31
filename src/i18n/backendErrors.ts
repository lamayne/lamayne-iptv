import { fr } from './locales/fr';
import { translateNow } from './index';

// La partie Rust renvoie ses erreurs en français. Les phrases « backend.* » du
// dictionnaire français sont la référence : tout message qui leur correspond
// est affiché dans la langue choisie ; les autres restent tels quels.

type Matcher = { key: string; pattern: RegExp; names: string[] };

const exact = new Map<string, string>();
const patterns: Matcher[] = [];

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const [key, text] of Object.entries(fr)) {
  if (!key.startsWith('backend.')) continue;

  const names = Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1]);

  if (!names.length) {
    exact.set(text, key);
    continue;
  }

  patterns.push({
    key,
    names,
    pattern: new RegExp(
      '^' + text.split(/\{\w+\}/).map(escapeRegExp).join('(.+?)') + '$'
    ),
  });
}

export function isBackendError(message: string): boolean {
  const text = message.trim();

  return (
    exact.has(text) || patterns.some((matcher) => matcher.pattern.test(text))
  );
}

export function localizeBackendError(message: string): string {
  const text = message.trim();
  const key = exact.get(text);

  if (key) return translateNow(key);

  for (const matcher of patterns) {
    const found = matcher.pattern.exec(text);

    if (!found) continue;

    const params: Record<string, string> = {};

    matcher.names.forEach((name, index) => {
      params[name] = localizeBackendError(found[index + 1]);
    });

    return translateNow(matcher.key, params);
  }

  return message;
}

// Texte d'une erreur quelconque pour l'affichage.
export function errorText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return localizeBackendError(value);
  }

  if (value instanceof Error && value.message) {
    return localizeBackendError(value.message);
  }

  return fallback;
}
