// The determinism guard (SPEC 11.3, rule 8). The repo has no linter, so this test enforces the rules
// that keep the simulation the same on every machine: no clock, no Math.random, no engine-dependent
// maths, no browser, and no imports from outside sim/ and content/.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(import.meta.dirname, '../src');
const PURE = ['sim', 'content'].map((d) => join(src, d));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/**
 * The code with comments and quoted strings blanked, so prose can mention what code may not use.
 * Template strings are left alone: their `${...}` parts are code.
 */
function codeOnly(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, "''");
}

const BANNED: [RegExp, string][] = [
  [/\bMath\.random\b/, 'Math.random (use a stream from sim/rng.ts)'],
  [/\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|pow|exp|expm1|log|log2|log10|log1p|cbrt|hypot)\b/, 'an engine-dependent Math function (use a lookup table)'],
  [/\*\*/, 'the ** operator (engine-dependent, like Math.pow)'],
  [/\bDate\b/, 'Date (the simulation has no clock but its tick)'],
  [/\bperformance\b/, 'performance'],
  [/\b(window|document|localStorage|sessionStorage|indexedDB|navigator|requestAnimationFrame|setTimeout|setInterval)\b/, 'a browser API'],
];

describe('determinism guard', () => {
  const all = PURE.flatMap(files);

  it('finds the pure source files', () => {
    expect(all.length).toBeGreaterThan(10);
  });

  for (const file of all) {
    const name = relative(src, file);
    it(`${name} uses nothing non-deterministic`, () => {
      const text = readFileSync(file, 'utf8');
      const code = codeOnly(text);
      for (const [re, what] of BANNED) {
        expect(re.test(code), `${name} uses ${what}`).toBe(false);
      }
    });

    it(`${name} imports only from sim/ and content/`, () => {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bfrom\s+'([^']+)'|\bimport\s*\(\s*'([^']+)'\s*\)|\bimport\s+'([^']+)'/g)) {
        const spec = m[1] ?? m[2] ?? m[3]!;
        expect(spec.startsWith('.'), `${name} imports the package ${spec}`).toBe(true);
        const target = resolve(dirname(file), spec);
        expect(
          PURE.some((d) => target.startsWith(d + '/')),
          `${name} imports ${spec}, outside sim/ and content/`,
        ).toBe(true);
      }
    });
  }

  it('catches a violation', () => {
    const bad = codeOnly("const x = Math.random(); // Math.random is fine in a comment\nconst y = 'Date';");
    expect(BANNED[0]![0].test(bad)).toBe(true);
    expect(BANNED[3]![0].test(bad)).toBe(false);
    expect(BANNED[0]![0].test(codeOnly('const s = `${Math.random()}`;'))).toBe(true);
  });
});
