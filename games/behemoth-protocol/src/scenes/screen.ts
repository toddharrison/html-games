import Phaser from 'phaser';
import { RESOLUTION, renderScale } from '../config';

/**
 * Keeps a scene's main camera at the integer render scale (config.ts `renderScale`), zooming around
 * the top-left corner so world units map straight to game pixels, and again after every resize.
 */
export function fitCamera(scene: Phaser.Scene): void {
  const apply = () => {
    const rs = renderScale(RESOLUTION);
    scene.cameras.main.setOrigin(0, 0).setZoom(rs.scale).setSize(rs.width, rs.height);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}
