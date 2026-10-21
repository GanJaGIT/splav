/**
 * VIL-01, VIL-04: the village map — the painted landscape (art/village/map.svg) with the level
 * circles along the river and six buildings, each abandoned or restored (art/village/building-*).
 * This file holds the geometry everything is placed by.
 */

/** Map coordinates (viewBox 0 0 360 490). */
export const MAP_W = 360;
export const MAP_H = 490;
const RUNS = [124, 280, 436];

/** VIL-01: level circles along the river, 4 per run, snaking down. */
export function nodePosition(index: number): { x: number; y: number } {
  const run = Math.floor(index / 4);
  const k = index % 4;
  const xs = [60, 140, 220, 300];
  const x = (run % 2 === 0 ? xs[k] : xs[3 - k]) as number;
  return { x, y: nodeY(run) };
}

function nodeY(run: number): number {
  return (RUNS[run] ?? 0) - 2;
}

/** Each building stands right above the level row `row`, at `x` on the map. */
const BUILDINGS: Record<string, { x: number; row: number }> = {
  mill: { x: 14, row: 0 },
  flowerbed: { x: 254, row: 0 },
  shed: { x: 14, row: 1 },
  bathhouse: { x: 254, row: 1 },
  pier: { x: 14, row: 2 },
  bridge: { x: 254, row: 2 },
};
const BUILDING_W = 92;
// The level circles and their stars keep their size in CSS pixels times --s (styles.css:
// .level-node is 46 px, .level-stars start 25 px below its centre and are at least 14 px tall),
// so the building box is what shrinks on small maps.
const NODE_UP = 25;
/** The stars' text and a 2 px gap; never smaller (ACC-02: text at least 14 px). */
const STARS = 16;

const pc = (v: number, total: number): string => `${((v / total) * 100).toFixed(3)}%`;

/** A building's box on the map (CSS): the picture and the price under it, clear of the levels. */
export function buildingBox(id: string): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const b = BUILDINGS[id] ?? { x: 0, row: 0 };
  const band = (RUNS[1] ?? 0) - (RUNS[0] ?? 0);
  // Between two level rows, and for the top row between the map edge and the first row.
  const height = `min(${pc(band, MAP_H)} - ${2 * NODE_UP}px * var(--s, 1) - ${STARS}px, ${pc(nodeY(0) - 4, MAP_H)} - ${NODE_UP}px * var(--s, 1))`;
  return {
    left: pc(b.x, MAP_W),
    width: pc(BUILDING_W, MAP_W),
    height,
    top: `calc(${pc(nodeY(b.row), MAP_H)} - ${NODE_UP}px * var(--s, 1) - ${height})`,
  };
}

const mapFiles = import.meta.glob<string>('../../art/village/map.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const buildingFiles = import.meta.glob<string>('../../art/village/building-*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** VIL-04: the painted village map (art/village/map.svg). */
export function mapHtml(): string {
  const url = mapFiles['../../art/village/map.svg'];
  if (!url) throw new Error('art/village/map.svg is missing');
  return `<img class="village-scene" src="${url}" alt="" draggable="false">`;
}

/** VIL-04: a building, abandoned or restored (art/village/building-<id>-<state>.svg). */
export function buildingHtml(id: string, restored: boolean): string {
  const state = restored ? 'restored' : 'ruin';
  const url = buildingFiles[`../../art/village/building-${id}-${state}.svg`];
  if (!url) throw new Error(`art/village/building-${id}-${state}.svg is missing`);
  return `<img src="${url}" alt="" draggable="false">`;
}
