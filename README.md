# HTML Games

Browser games you can play in a web page. **Play them at https://toddharrison.github.io/html-games/**

| Game | Play | About |
| --- | --- | --- |
| Behemoth Protocol | [Play](https://toddharrison.github.io/html-games/behemoth-protocol/) | A roguelike where you play the boss: drive a giant cybernetic war machine up a battlefield against a combined-arms force. [More](games/behemoth-protocol/README.md) |
| Snowline | [Play](https://toddharrison.github.io/html-games/snowline/) | In development: a top-down survival game about a teenager alone in a mountain valley whose rules change with every seed. [More](games/snowline/README.md) |

## Development
Requires Node 22 or newer.

```sh
npm install                          # installs every game (npm workspaces)
npm run dev -w behemoth-protocol     # play a game locally
npm test                             # test every game
npm run build                        # build the whole site into dist/
```

Each game lives in `games/<name>/`. Every push to `main` deploys the site to GitHub Pages through [.github/workflows/deploy.yml](.github/workflows/deploy.yml).
