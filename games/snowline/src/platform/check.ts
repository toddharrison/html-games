// The replay check page (`?check=1`, SPEC 11.4): runs the golden replays in this browser and shows
// whether each one matched. `npm run check:browser` opens it headless in Chromium and reads the result
// from `window.__snowlineCheck`; for Firefox and Safari, open the page and read it.

import { GOLDENS, runGolden, type GoldenResult } from '../tools/goldens.ts';
import { VERSION } from './version.ts';

declare global {
  interface Window {
    __snowlineCheck?: { ok: boolean; version: string; results: GoldenResult[]; error?: string };
  }
}

export function runCheckPage(root: HTMLElement): void {
  root.innerHTML = `<div class="check"><h1>Snowline replay check</h1><p>${VERSION} · ${navigator.userAgent}</p><p>Running…</p></div>`;
  setTimeout(() => {
    const box = root.querySelector('.check')!;
    try {
      const results = GOLDENS.map(runGolden);
      const ok = results.every((r) => r.ok);
      window.__snowlineCheck = { ok, version: VERSION, results };
      document.title = `Snowline check: ${ok ? 'PASS' : 'FAIL'}`;
      box.querySelector('p:last-child')!.remove();
      const rows = results
        .map(
          (r) =>
            `<tr class="${r.ok ? 'pass' : 'fail'}"><td>${r.name}</td><td>${r.ok ? 'pass' : 'FAIL'}</td>` +
            `<td>world ${r.worldHash} (want ${r.expectedWorld})<br>state ${r.stateHash} (want ${r.expectedState})</td></tr>`,
        )
        .join('');
      box.insertAdjacentHTML('beforeend', `<h2>${ok ? 'All replays match' : 'A replay does not match'}</h2><table>${rows}</table>`);
    } catch (e) {
      window.__snowlineCheck = { ok: false, version: VERSION, results: [], error: String(e) };
      document.title = 'Snowline check: ERROR';
      box.insertAdjacentHTML('beforeend', `<pre>${String(e)}</pre>`);
    }
  }, 30);
}
