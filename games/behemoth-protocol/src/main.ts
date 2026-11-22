import Phaser from 'phaser';
import { RESOLUTION, renderScale } from './config';
import { BootScene } from './scenes/BootScene';
import { DepotScene } from './scenes/DepotScene';
import { MapScene } from './scenes/MapScene';
import { TitleScene } from './scenes/TitleScene';
import { DemoBattleScene, TopDownBattleScene } from './scenes/TopDownBattleScene';

const rs = renderScale(RESOLUTION);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: rs.width,
  height: rs.height,
  backgroundColor: '#0d0f0c',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: rs.cssZoom,
  },
  scene: [BootScene, TitleScene, MapScene, TopDownBattleScene, DepotScene, DemoBattleScene],
});

// Scenes listen for the scale manager's resize event and re-apply the camera zoom.
window.addEventListener('resize', () => {
  const next = renderScale(RESOLUTION);
  game.scale.setZoom(next.cssZoom);
  if (next.width !== game.scale.width || next.height !== game.scale.height) game.scale.resize(next.width, next.height);
});
