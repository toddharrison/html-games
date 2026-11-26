// The map screen (M): the explored valley as a sketch, where the survivor is, and the viewpoints they
// have stood on. In debug, it can show everything and teleport on a click.

import { sketchMap } from '../render/mapSketch.ts';
import type { GameState } from '../sim/state.ts';
import type { World } from '../sim/world.ts';
import { h } from './dom.ts';

const SCALE = 3;

export interface MapOptions {
  revealAll: boolean;
  /** In debug, a click teleports there. */
  onPick?: (x: number, y: number) => void;
}

export class MapScreen {
  readonly el = h('div', { class: 'screen map' });
  private readonly sketch = document.createElement('canvas');
  private readonly view = document.createElement('canvas');

  constructor() {
    this.el.append(this.view, h('p', { class: 'keys' }, 'M or Esc to close'));
  }

  draw(state: GameState, world: World, opts: MapOptions): void {
    const n = world.size;
    this.sketch.width = this.sketch.height = n;
    const sg = this.sketch.getContext('2d')!;
    const img = sg.createImageData(n, n);
    sketchMap(img, state, world, opts.revealAll);
    sg.putImageData(img, 0, 0);
    this.view.width = this.view.height = n * SCALE;
    const g = this.view.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.sketch, 0, 0, n * SCALE, n * SCALE);
    const at = (x: number) => x * SCALE + SCALE / 2;

    // Viewpoints stood on: a small triangle, like a summit on a hand-drawn map.
    world.viewpoints.forEach((v, i) => {
      if (!state.viewpoints[i] && !opts.revealAll) return;
      g.fillStyle = state.viewpoints[i] ? '#4a4032' : 'rgba(74,64,50,0.4)';
      g.beginPath();
      g.moveTo(at(v.x), at(v.y) - 6);
      g.lineTo(at(v.x) + 5, at(v.y) + 4);
      g.lineTo(at(v.x) - 5, at(v.y) + 4);
      g.fill();
    });
    if (opts.revealAll) {
      const mark = (x: number, y: number, c: string, label: string) => {
        g.fillStyle = c;
        g.fillRect(at(x) - 3, at(y) - 3, 6, 6);
        g.font = '11px system-ui, sans-serif';
        g.fillText(label, at(x) + 5, at(y) + 4);
      };
      mark(world.overhang.shelter.x, world.overhang.shelter.y, '#b5662f', 'overhang');
      mark(world.wreck.x, world.wreck.y, '#ffffff', 'tail wreckage');
      mark(world.knoll.x, world.knoll.y, '#8a2f1c', 'signal knoll');
      mark(world.midden.x, world.midden.y, '#5a4634', 'midden');
      for (const t of world.territories) mark(t.x, t.y, '#3f5f8a', t.animal);
    }
    const p = state.player;
    g.fillStyle = '#9a3a32';
    g.strokeStyle = '#f4efe0';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(at(p.x), at(p.y), 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();

    this.view.onclick = opts.onPick
      ? (e) => {
          const r = this.view.getBoundingClientRect();
          const x = Math.floor(((e.clientX - r.left) / r.width) * n);
          const y = Math.floor(((e.clientY - r.top) / r.height) * n);
          opts.onPick!(x, y);
        }
      : null;
    this.view.style.cursor = opts.onPick ? 'crosshair' : 'default';
  }
}
