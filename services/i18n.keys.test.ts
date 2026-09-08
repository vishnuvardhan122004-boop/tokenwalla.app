/**
 * services/i18n.keys.test.ts
 *
 * Guards the four dictionaries against the failure mode you cannot see in
 * review: a `t('some_key')` whose key was never added, or added to English and
 * not to Telugu. Neither is a type error and neither throws — `t()` falls back
 * to English and then to the key itself, so the bug ships as a screen with a
 * raw `mb_queue_ahead` on it, or a stray `{count}` where a number should be.
 *
 * Reads the source rather than importing it: the module pulls in React,
 * AsyncStorage and expo-localization, and none of that is needed to check that
 * a set of strings lines up.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { globSync } from 'glob';

const ROOT = join(__dirname, '..');
const SRC = readFileSync(join(ROOT, 'services/i18n.tsx'), 'utf8');
const LANGS = ['en', 'hi', 'te', 'kn'] as const;

function dictOf(lang: string): Record<string, string> {
  const start = SRC.indexOf(`const ${lang}: Dict = {`);
  const end = SRC.indexOf('\n};', start);
  const out: Record<string, string> = {};
  for (const m of SRC.slice(start, end).matchAll(/^ {2}([A-Za-z0-9_]+):\s*(['"])(.*?)\2,\s*$/gm)) {
    out[m[1]] = m[3];
  }
  return out;
}

const DICTS = Object.fromEntries(LANGS.map(l => [l, dictOf(l)])) as Record<string, Record<string, string>>;
const EN = DICTS.en;
const vars = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]));

const SCREENS = globSync(['app/**/*.tsx', 'components/*.tsx'], { cwd: ROOT })
  .map(f => [f, readFileSync(join(ROOT, f), 'utf8')] as const);

describe('i18n dictionaries', () => {
  it('parses a non-trivial number of keys from each language', () => {
    for (const l of LANGS) expect(Object.keys(DICTS[l]).length).toBeGreaterThan(400);
  });

  it('has identical key sets in all four languages', () => {
    for (const l of LANGS.filter(x => x !== 'en')) {
      expect({ [l]: Object.keys(DICTS[l]).filter(k => !(k in EN)).sort() })
        .toEqual({ [l]: [] });                                    // no extras
      expect({ [l]: Object.keys(EN).filter(k => !(k in DICTS[l])).sort() })
        .toEqual({ [l]: [] });                                    // none missing
    }
  });

  it('uses the same {placeholders} for a key in every language', () => {
    const drift: string[] = [];
    for (const [k, v] of Object.entries(EN)) {
      const want = [...vars(v)].sort().join(',');
      for (const l of LANGS.filter(x => x !== 'en')) {
        const got = [...vars(DICTS[l][k] ?? '')].sort().join(',');
        if (got !== want) drift.push(`${k}: en={${want}} ${l}={${got}}`);
      }
    }
    expect(drift).toEqual([]);
  });
});

describe('t() call sites', () => {
  /** Handles both `{ name: value }` and ES6 shorthand `{ name }`. */
  function argNames(s: string): Set<string> {
    const out = new Set<string>();
    for (const part of s.split(/,(?![^{}[\]()]*[}\])])/)) {
      const m = part.trim().match(/^(\w+)\s*:/) || part.trim().match(/^(\w+)$/);
      if (m) out.add(m[1]);
    }
    return out;
  }

  const calls = SCREENS.flatMap(([file, src]) =>
    [...src.matchAll(/\bt\(\s*'([a-z0-9_]+)'\s*(?:,\s*\{([^}]*)\})?\s*\)/g)].map(m => ({
      file,
      line: src.slice(0, m.index).split('\n').length,
      key: m[1],
      args: m[2] ?? '',
    })),
  );

  it('finds the call sites at all (guards this test against silently matching nothing)', () => {
    expect(calls.length).toBeGreaterThan(200);
  });

  it('only uses keys that exist', () => {
    expect(calls.filter(c => !(c.key in EN)).map(c => `${c.file}:${c.line} t('${c.key}')`)).toEqual([]);
  });

  it('passes exactly the variables its string interpolates', () => {
    const bad = calls
      .filter(c => c.key in EN)
      .filter(c => {
        const need = [...vars(EN[c.key])].sort().join(',');
        const got = [...argNames(c.args)].sort().join(',');
        return need !== got;
      })
      .map(c => `${c.file}:${c.line} t('${c.key}') needs {${[...vars(EN[c.key])].sort()}} got {${[...argNames(c.args)].sort()}}`);
    expect(bad).toEqual([]);
  });

  // Two call sites build their key at runtime, so the checks above can't see
  // them. Both enumerate a fixed set, so the set is what gets asserted.
  it('resolves the home screen specialty chips', () => {
    const home = readFileSync(join(ROOT, 'components/HomeScreen.tsx'), 'utf8');
    const keys = [...home.matchAll(/\{ key: '(\w+)',\s*icon:/g)].map(m => `spec_${m[1]}`);
    expect(keys.length).toBeGreaterThan(10);
    expect(keys.filter(k => !(k in EN))).toEqual([]);
  });

  it('resolves the scan-centre blood/scan key pairs', () => {
    const sc = readFileSync(join(ROOT, 'app/(patient)/scan-center/[id].tsx'), 'utf8');
    const stems = [...new Set([...sc.matchAll(/tn\('([a-z0-9_]+)'/g)].map(m => m[1]))];
    expect(stems.length).toBeGreaterThan(0);
    const keys = stems.flatMap(s => [`${s}_blood`, `${s}_scan`]);
    expect(keys.filter(k => !(k in EN))).toEqual([]);
  });
});
