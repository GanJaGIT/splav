import Phaser from 'phaser';
import { FieldScene } from './FieldScene';

/** Device pixels per CSS pixel, capped to keep the canvas affordable on phones (PERF-03). */
export function pixelRatio(): number {
  return Math.min(3, Math.max(1, window.devicePixelRatio || 1));
}

/**
 * TECH-02: Phaser draws only the river field, under the DOM interface. The canvas has device
 * pixels and is shown at CSS size (zoom 1/dpr), so the field stays crisp on phones.
 * Input goes through DOM Pointer Events (src/game/input.ts), Phaser input is off.
 */
export function createGame(
  parent: HTMLElement,
  onFirstFrame: () => void,
): { game: Phaser.Game; scene: FieldScene } {
  const scene = new FieldScene(onFirstFrame);
  const game = new Phaser.Game({
    // PERF-04: Phaser 4 still has the Canvas renderer, so AUTO falls back to it without WebGL.
    type: Phaser.AUTO,
    parent,
    banner: false,
    backgroundColor: '#2f6b45',
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.NONE, width: 2, height: 2 },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    // Sound is switched on only by AudioService, never by Phaser on its own (YG-05).
    audio: { noAudio: true },
    scene: [scene],
  });
  return { game, scene };
}

/** UI-15: the canvas follows the active area. */
export function resizeGame(
  game: Phaser.Game,
  scene: FieldScene,
  width: number,
  height: number,
): void {
  const dpr = pixelRatio();
  game.scale.resize(Math.round(width * dpr), Math.round(height * dpr));
  game.scale.setZoom(1 / dpr);
  scene.resize(width, height, dpr);
}
