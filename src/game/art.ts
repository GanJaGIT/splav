/**
 * ART-02: the field sprites. `npm run art` rasterises art/sprites/*.svg into one atlas
 * (src/assets/atlas.png + atlas.json) for Phaser; the DOM interface (encyclopedia, windows, cards)
 * shows the same SVG files. GD-24, ACC-01: every chain has its own silhouette and colour, items
 * grow with their level, and a level badge sits in the corner.
 */

import type Phaser from 'phaser';
import atlasBounds from '../assets/atlas-bounds.json';
import atlasJson from '../assets/atlas.json';
import atlasPng from '../assets/atlas.png';
import type { Chain } from '../sim';

/** The visible part of a frame, in shares of its width and height (measured by `npm run art`). */
export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}
const FULL: Bounds = { x: 0, y: 0, w: 1, h: 1 };
export const frameBounds = (key: string): Bounds =>
  (atlasBounds as Record<string, Bounds>)[key] ?? FULL;

/** Phaser texture key of the atlas; frames are named after the SVG files. */
export const ATLAS = 'art';

export const itemKey = (chain: Chain, level: number): string => `item-${chain}-${level}`;
export const RESIDENT_KEY = (id: string): string => `resident-${id}`;
export const badgeKey = (level: number): string => `badge-${level}`;

/** GD-24: how big an item of each level looks on the field (joker first), in shares of its frame. */
const LEVEL_SIZE = [0.84, 0.7, 0.74, 0.78, 0.82, 0.86, 0.9];

/**
 * The scale that brings an item to its level size: the pictures leave different margins in their
 * frames (a flat fish, a tall sprout), so the field sizes them by the visible part, never larger
 * than the frame.
 */
export function itemFit(chain: Chain, level: number): number {
  const b = frameBounds(itemKey(chain, level));
  const target = LEVEL_SIZE[level] ?? (LEVEL_SIZE[LEVEL_SIZE.length - 1] as number);
  return Math.min(target / Math.sqrt(b.w * b.h), 1 / Math.max(b.w, b.h));
}

/** Particle colour of each chain (FX-01). */
export const CHAIN_COLOR: Record<Chain, number> = {
  wood: 0xe0a96a,
  garden: 0xff8fb4,
  stone: 0xd9d6cf,
  fish: 0x6ccdf0,
  joker: 0xffffff,
};

/** Queues the atlas; the field scene calls it in preload(). */
export function loadArt(scene: Phaser.Scene): void {
  scene.load.atlas(ATLAS, atlasPng, atlasJson);
}

const svgs = import.meta.glob<string>('../../art/sprites/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const urlOf = (name: string): string => svgs[`../../art/sprites/${name}.svg`] ?? '';

/** The same pictures for the DOM interface. */
export function itemImage(chain: Chain, level: number): string {
  return urlOf(itemKey(chain, level));
}

export function residentImage(id: string): string {
  return urlOf(RESIDENT_KEY(id));
}

export function obstacleImage(kind: 'rock' | 'snag' | 'pier'): string {
  return urlOf(kind);
}
