import Phaser from 'phaser';
import type { FieldGeometry } from '../ui/layout';
import { FieldScene } from './FieldScene';

/** TECH-02: Phaser draws only the river field; it fills the active area under the DOM interface. */
export function createGame(
  parent: HTMLElement,
  geometry: FieldGeometry,
  onFirstFrame: () => void,
): Phaser.Game {
  return new Phaser.Game({
    // PERF-04: Phaser 4 still has the Canvas renderer, so AUTO falls back to it without WebGL.
    type: Phaser.AUTO,
    parent,
    banner: false,
    backgroundColor: '#2f6b45',
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
      autoRound: true,
    },
    // INP-07: only the first finger counts.
    input: { activePointers: 1 },
    // Sound is switched on only by AudioService (Stage 2+), never by Phaser on its own.
    audio: { noAudio: true },
    scene: [new FieldScene(geometry, onFirstFrame)],
  });
}
