import { afterEach, describe, expect, it } from 'vitest';
import {
  LANGUAGES,
  detectLanguage,
  isLanguage,
  localeOf,
  setCurrentLanguage,
  translate,
  translateNow,
} from '@/i18n';
import { errorText, isBackendError, localizeBackendError } from '@/i18n/backendErrors';
import { en } from '@/i18n/locales/en';
import { es } from '@/i18n/locales/es';
import { fr } from '@/i18n/locales/fr';

afterEach(() => setCurrentLanguage('fr'));

const placeholders = (text: string) =>
  (text.match(/\{(\w+)\}/g) ?? []).sort().join(',');

describe('traduction', () => {
  it('traduit dans les trois langues', () => {
    expect(translate('fr', 'nav.home')).toBe('Accueil');
    expect(translate('en', 'nav.home')).toBe('Home');
    expect(translate('es', 'nav.home')).toBe('Inicio');
  });

  it('remplace les {paramètres}', () => {
    expect(
      translate('es', 'featured.diapositive_sur', { number: 2, count: 4 })
    ).toBe('Diapositiva 2 de 4');
  });

  it('laisse un paramètre manquant tel quel', () => {
    expect(translate('en', 'home.min_restantes', {})).toBe('{minutes} min left');
  });

  it('renvoie la clé quand elle est inconnue, sans se laisser piéger', () => {
    expect(translate('fr', 'nope.nope')).toBe('nope.nope');
    expect(translate('fr', 'constructor')).toBe('constructor');
    expect(translate('es', '__proto__')).toBe('__proto__');
  });

  it('conserve les espaces de début des phrases', () => {
    expect(translate('es', 'cast.1_piste_sur', { count: 3 })).toBe(' (1 pista de 3)');
  });
});

describe('langues', () => {
  it('choisit la langue du système, sinon l’anglais', () => {
    expect(detectLanguage(['es-MX', 'en-US'])).toBe('es');
    expect(detectLanguage(['fr-CA'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'es-ES'])).toBe('es');
    expect(detectLanguage(['de-DE', 'ja'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('reconnaît les codes valides et donne la locale', () => {
    expect(isLanguage('es')).toBe(true);
    expect(isLanguage('it')).toBe(false);
    expect(isLanguage(null)).toBe(false);
    expect(localeOf('es')).toBe('es-ES');
    expect(LANGUAGES.map((language) => language.code)).toEqual(['fr', 'en', 'es']);
  });

  it('translateNow suit la langue courante', () => {
    setCurrentLanguage('es');
    expect(translateNow('nav.live')).toBe('TV en directo');
  });
});

describe('dictionnaires', () => {
  it('ont les mêmes phrases et les mêmes {mots entre accolades}', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    expect(Object.keys(es).sort()).toEqual(Object.keys(fr).sort());

    const different = Object.keys(fr).filter(
      (key) =>
        placeholders(fr[key]) !== placeholders(en[key]) ||
        placeholders(en[key]) !== placeholders(es[key])
    );

    expect(different).toEqual([]);
  });

  it('n’ont aucune phrase vide', () => {
    const empty = Object.keys(fr).filter(
      (key) => !fr[key].trim() || !en[key].trim() || !es[key].trim()
    );

    expect(empty).toEqual([]);
  });
});

describe('messages d’erreur venant de Rust', () => {
  it('sont traduits quand ils sont connus', () => {
    setCurrentLanguage('en');
    expect(localizeBackendError('Adresse de playlist invalide.')).toBe('Invalid playlist address.');
    setCurrentLanguage('es');
    expect(localizeBackendError('Le fournisseur a répondu avec le statut HTTP 404.')).toBe(
      'El proveedor ha respondido con el estado HTTP 404.'
    );
    expect(localizeBackendError('Arrêt impossible (connexion refusée).')).toBe(
      'No se pudo detener (conexión rechazada).'
    );
  });

  it('restent tels quels en français ou quand ils sont inconnus', () => {
    expect(localizeBackendError('Le serveur doit utiliser HTTP ou HTTPS.')).toBe(
      'Le serveur doit utiliser HTTP ou HTTPS.'
    );
    expect(localizeBackendError('Quelque chose d’inattendu')).toBe('Quelque chose d’inattendu');
    expect(isBackendError("L'opération a été interrompue.")).toBe(true);
    expect(isBackendError('blabla')).toBe(false);
  });

  it('errorText gère chaînes, erreurs et valeurs vides', () => {
    setCurrentLanguage('en');
    expect(errorText('Le téléchargement a été interrompu.', 'x')).toBe('The download was interrupted.');
    expect(errorText(new Error('La playlist doit être encodée en UTF-8.'), 'x')).toBe(
      'The playlist must be UTF-8 encoded.'
    );
    expect(errorText(null, 'repli')).toBe('repli');
    expect(errorText('   ', 'repli')).toBe('repli');
  });
});
