// Assembles the GitHub Pages site: copies each game's build (games/<name>/dist)
// to dist/<name>/ and writes a landing page listing every game.
// Run after `npm run build --workspaces` (the root `build` script does both).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const gamesDir = join(root, 'games');
const outDir = join(root, 'dist');

const escape = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const games = [];
for (const name of readdirSync(gamesDir).sort()) {
  const pkgPath = join(gamesDir, name, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const built = join(gamesDir, name, 'dist');
  if (!existsSync(join(built, 'index.html'))) {
    throw new Error(`games/${name} has no build at games/${name}/dist; run its build first`);
  }
  cpSync(built, join(outDir, name), { recursive: true });
  games.push({ slug: name, title: pkg.title ?? name, description: pkg.description ?? '' });
}

const cards = games
  .map(
    (g) => `      <li>
        <a href="./${escape(g.slug)}/">
          <span class="title">${escape(g.title)}</span>
          <span class="desc">${escape(g.description)}</span>
        </a>
      </li>`,
  )
  .join('\n');

const template = readFileSync(join(root, 'site', 'index.html'), 'utf8');
if (!template.includes('<!-- GAMES -->')) throw new Error('site/index.html is missing the <!-- GAMES --> marker');
writeFileSync(join(outDir, 'index.html'), template.replace('<!-- GAMES -->', cards));
writeFileSync(join(outDir, '.nojekyll'), '');

console.log(`site: ${games.length} game(s) -> dist/ (${games.map((g) => g.slug).join(', ')})`);
