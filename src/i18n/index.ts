import { fr } from './locales/fr';
import { en } from './locales/en';
import { es } from './locales/es';

// ---------------------------------------------------------------------------
// Langues de l'application
//
// Pour AJOUTER UNE LANGUE (ex. l'italien) :
//   1. copier src/i18n/locales/en.ts en it.ts, puis traduire les valeurs
//      (ne pas toucher aux clés, ni aux mots entre accolades comme {minutes}) ;
//   2. importer le fichier ci-dessus ;
//   3. ajouter une ligne dans LANGUAGES et dans DICTIONARIES ci-dessous.
// Le sélecteur des Réglages, les dates et les nombres suivent automatiquement.
// Une phrase manquante dans une langue s'affiche en anglais, puis en français.
// ---------------------------------------------------------------------------

export type Dictionary = Record<string, string>;

export type TranslateParams = Record<string, string | number>;

export type Translate = (key: string, params?: TranslateParams) => string;

export const LANGUAGES = [
  { code: 'fr', label: 'Français', locale: 'fr-FR' },
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'es', label: 'Español', locale: 'es-ES' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

const DICTIONARIES: Record<Language, Dictionary> = { fr, en, es };

// Langue des systèmes dont la langue n'est pas prise en charge.
const DEFAULT_LANGUAGE: Language = 'en';
const FALLBACK_ORDER: readonly Language[] = ['en', 'fr'];

export const LANGUAGE_STORAGE_KEY = 'msp_language';

export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language.code === value);
}

// Code régional pour les dates et les nombres (ex. « es-ES »).
export function localeOf(language: Language): string {
  return (
    LANGUAGES.find((item) => item.code === language)?.locale ?? 'en-US'
  );
}

// Choisit la première langue du système prise en charge : « es-MX » donne
// « es ». Sans correspondance, l'anglais.
export function detectLanguage(candidates: readonly string[]): Language {
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split('-')[0];

    if (isLanguage(base)) return base;
  }

  return DEFAULT_LANGUAGE;
}

function lookup(language: Language, key: string): string | undefined {
  const dictionary = DICTIONARIES[language];

  return Object.prototype.hasOwnProperty.call(dictionary, key)
    ? dictionary[key]
    : undefined;
}

// Remplace {nom} par la valeur correspondante ; un nom inconnu reste tel quel.
function format(template: string, params?: TranslateParams): string {
  if (!params) return template;

  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match
  );
}

export function translate(
  language: Language,
  key: string,
  params?: TranslateParams
): string {
  const own = lookup(language, key);

  if (own !== undefined) return format(own, params);

  for (const fallback of FALLBACK_ORDER) {
    const value = lookup(fallback, key);

    if (value !== undefined) return format(value, params);
  }

  return key;
}

// Langue à utiliser avant le démarrage de React (écran de chargement) :
// celle enregistrée dans les réglages, sinon celle du système.
export function bootLanguage(): Language {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : null;

    if (isLanguage(stored)) return stored;
  } catch {
    // Réglage illisible : on se rabat sur la langue du système.
  }

  return detectLanguage(
    typeof navigator === 'undefined'
      ? []
      : navigator.languages ?? [navigator.language]
  );
}

// Langue courante pour le code qui n'est pas un composant (messages d'erreur
// des utilitaires). Mise à jour par l'application à chaque changement de langue.
let currentLanguage: Language = bootLanguage();

export function setCurrentLanguage(language: Language) {
  currentLanguage = language;
}

export const translateNow: Translate = (key, params) =>
  translate(currentLanguage, key, params);
