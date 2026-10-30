# Add a language to LAMAYNE IPTV

The application currently offers English, French and Spanish. Adding a language does not require touching the pages'
code or knowing React.

## Steps (example: Italian, code `it`)

1. **Copy** `src/i18n/locales/en.ts` to `src/i18n/locales/it.ts`.
2. In `it.ts`, rename `export const en` to `export const it`, then **translate the texts** (right of the colons). Do not
   change the keys (left side) or the words in braces such as `{minutes}` or `{name}`: the application replaces them with values.
3. In `src/i18n/index.ts`, add **three lines**:
   - `import { it } from './locales/it';`
   - in `LANGUAGES`: `{ code: 'it', label: 'Italiano', locale: 'it-IT' },`
   - in `DICTIONARIES`: add `it`.
4. Optional: in `index.html`, add the two loading-screen texts (the `TEXTS` line).
5. **Check**: `node scripts/check-i18n.mjs` must print "Translations OK".
6. Start the application: the language appears in Settings → Appearance and language. It is also selected automatically
   on first launch if it is the system language.

## Good to know

- A phrase missing from a language is shown in English, then in French: nothing crashes.
- Dates and numbers follow the `locale` field (e.g. `it-IT`).
- The `backend.*` phrases are the error messages produced by the Rust side, written in French: the text in `fr.ts` must stay
  **identical** to the one in the Rust code (it is used to recognise the message). For a new Rust error, add the same
  phrase to `fr.ts` under `backend.*`, then translate it in the other languages.
- Displayed texts must always go through `t('key')`: do not hard-code phrases in a component.
