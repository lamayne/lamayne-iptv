// Checks the translations: run it before every release, and after adding or
// changing a language.   node scripts/check-i18n.mjs
//
// Checks: same phrases in every language, same {words in braces}, no empty
// phrase, and every t('key') in the code exists with the right parameters.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const index = read('src/i18n/index.ts');
const codes = [...index.matchAll(/code:\s*'([a-z-]+)'/g)].map((m) => m[1]);
const dictionaries = {};

for (const code of codes) {
  const source = read(`src/i18n/locales/${code}.ts`);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', js)(module, module.exports);
  dictionaries[code] = module.exports[code];
  if (!dictionaries[code]) throw new Error(`src/i18n/locales/${code}.ts must export "${code}".`);
}

const problems = [];
const reference = dictionaries.fr;
const placeholders = (text) => (text.match(/\{(\w+)\}/g) ?? []).sort().join(',');

for (const code of codes) {
  const dictionary = dictionaries[code];
  for (const key of Object.keys(reference)) {
    if (!(key in dictionary)) problems.push(`[${code}] missing phrase: ${key}`);
    else if (!dictionary[key].trim()) problems.push(`[${code}] empty phrase: ${key}`);
    else if (placeholders(dictionary[key]) !== placeholders(reference[key]))
      problems.push(`[${code}] {words in braces} differ from fr: ${key}`);
  }
  for (const key of Object.keys(dictionary)) {
    if (!(key in reference)) problems.push(`[${code}] extra phrase (not in fr): ${key}`);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!relative.includes(`i18n`)) walk(relative); }
    else if (/\.tsx?$/.test(entry.name)) scan(relative);
  }
}

function scan(file) {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  (function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't'
        && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0])) {
      const key = node.arguments[0].text;
      if (!(key in reference)) problems.push(`${file}: unknown key "${key}"`);
      else {
        const wanted = placeholders(reference[key]).replace(/[{}]/g, '');
        const given = node.arguments[1] && ts.isObjectLiteralExpression(node.arguments[1])
          ? node.arguments[1].properties.map((p) => p.name.getText(sf)).sort().join(',') : '';
        if (wanted !== given) problems.push(`${file}: "${key}" expects [${wanted}] and receives [${given}]`);
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}

walk('src');

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}

console.log(`Translations OK: ${Object.keys(reference).length} phrases × ${codes.length} languages (${codes.join(', ')}).`);
