import Phaser from 'phaser';
import { RESOLUTION, renderScale } from './config';
import { BootScene } from './scenes/BootScene';
import { DepotScene } from './scenes/DepotScene';
import { MapScene } from './scenes/MapScene';
import { SummaryScene } from './scenes/SummaryScene';
import { EventScene } from './scenes/EventScene';
import { TitleScene } from './scenes/TitleScene';
import { TerrainPreviewScene } from './scenes/TerrainPreviewScene';
import { DemoBattleScene, TopDownBattleScene } from './scenes/TopDownBattleScene';
import { DevConsole, devEnabled } from './dev/console';
import { exposeTextAudit } from './dev/textAudit';

// Before the game is made: it puts saved tuning tweaks back first.
const dev = devEnabled() ? new DevConsole() : null;

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
  scene: [BootScene, TitleScene, MapScene, TopDownBattleScene, DepotScene, EventScene, SummaryScene, DemoBattleScene, TerrainPreviewScene],
});
dev?.attach(game);
if (dev) exposeTextAudit(game);

// Scenes listen for the scale manager's resize event and re-apply the camera zoom.
window.addEventListener('resize', () => {
  const next = renderScale(RESOLUTION);
  game.scale.setZoom(next.cssZoom);
  if (next.width !== game.scale.width || next.height !== game.scale.height) game.scale.resize(next.width, next.height);
});
