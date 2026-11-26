// The single-file build (SPEC 11.1): after `vite build`, inline the script and stylesheet into
// dist/standalone.html, so the game runs when the file is opened straight from disk. (Browsers refuse
// to load separate script modules from a page opened as a file.) The build has one script and one
// stylesheet, and the art is drawn in code, so there is nothing else to inline.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(import.meta.dirname, '../dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
let scripts = 0;
let styles = 0;

html = html.replace(/<script\b([^>]*)\bsrc="\.\/([^"]+)"([^>]*)><\/script>/g, (_, before, path) => {
  scripts++;
  const code = readFileSync(join(dist, path), 'utf8').replace(/<\/script/gi, '<\\/script');
  const type = /type="module"/.test(before) ? ' type="module"' : '';
  return `<script${type}>${code}</script>`;
});
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\.\/([^"]+)"[^>]*>/g, (_, path) => {
  styles++;
  return `<style>${readFileSync(join(dist, path), 'utf8')}</style>`;
});

const leftover = /(?:src|href)="\.\/assets\//.exec(html);
if (leftover) throw new Error(`standalone.html still refers to a separate file: ${html.slice(leftover.index, leftover.index + 80)}`);
if (scripts !== 1) throw new Error(`expected one script to inline, found ${scripts}`);

writeFileSync(join(dist, 'standalone.html'), html);
console.log(`standalone: inlined ${scripts} script and ${styles} stylesheet -> dist/standalone.html (${Math.round(html.length / 1024)} KB)`);
