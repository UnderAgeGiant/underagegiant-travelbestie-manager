import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXAMPLE = join(ROOT, 'local.env.example');

function sourceFiles(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts'))
    .map((f) => join(dir, f));
}

function usedEnvKeys(): Set<string> {
  const keys = new Set<string>();
  const re = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g;
  for (const file of [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'api'))]) {
    for (const m of readFileSync(file, 'utf8').matchAll(re)) keys.add(m[1] ?? m[2]);
  }
  return keys;
}

const lines = readFileSync(EXAMPLE, 'utf8').split(/\r?\n/).map((l) => l.trim());
const entries = lines
  .map((l) => /^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(l))
  .filter((m): m is RegExpExecArray => m !== null)
  .map((m) => ({ commented: Boolean(m[1]), key: m[2], value: m[3].trim() }));

describe('local.env.example', () => {
  it('lists every env var the API reads', () => {
    const listed = new Set(entries.map((e) => e.key));
    const missing = [...usedEnvKeys()].filter((k) => !listed.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it('has no uncommented blank values (blank overrides ?? defaults with "")', () => {
    const blank = entries.filter((e) => !e.commented && e.value === '').map((e) => e.key);
    expect(blank).toEqual([]);
  });

  it('carries no value for any secret-named key', () => {
    const leaked = entries.filter((e) => /SECRET|KEY|TOKEN|PASS/.test(e.key) && e.value !== '').map((e) => e.key);
    expect(leaked).toEqual([]);
  });
});
