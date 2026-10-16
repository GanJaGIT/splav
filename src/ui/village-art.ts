/**
 * VIL-04: the village as SVG — the map with the river and six buildings, each abandoned or
 * restored. Temporary art; the final drawings come from art/ in Stage 5 (ART-02).
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

export function mapSvg(): string {
  const [a, b, c] = RUNS as [number, number, number];
  const river = `M-20 ${a} L320 ${a} Q352 ${a} 352 ${(a + b) / 2} Q352 ${b} 320 ${b} L40 ${b} Q8 ${b} 8 ${(b + c) / 2} Q8 ${c} 40 ${c} L380 ${c}`;
  const trees = [
    [130, 45],
    [205, 35],
    [165, 80],
    [130, 196],
    [210, 190],
    [175, 225],
    [125, 352],
    [215, 358],
    [170, 385],
    [345, 30],
    [345, 475],
    [20, 475],
  ]
    .map(
      ([x, y]) =>
        `<g transform="translate(${x} ${y})"><rect x="-3" y="4" width="6" height="12" rx="2" fill="#7b5a36"/><circle r="13" fill="#5fa84a" stroke="#2e6b3a" stroke-width="2.5"/></g>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
<rect width="${MAP_W}" height="${MAP_H}" fill="#9ed978"/>
<path d="${river}" fill="none" stroke="#2f80b3" stroke-width="44" stroke-linecap="round"/>
<path d="${river}" fill="none" stroke="#4fa9dc" stroke-width="36" stroke-linecap="round"/>
<path d="${river}" fill="none" stroke="#bfe8fb" stroke-width="2" stroke-dasharray="6 18" opacity="0.8"/>
${trees}
</svg>`;
}

interface Paint {
  wall: string;
  roof: string;
  wood: string;
  accent: string;
  line: string;
}

const RESTORED: Paint = {
  wall: '#f2d29b',
  roof: '#c0563f',
  wood: '#b0773f',
  accent: '#ffd54f',
  line: '#5a3a1e',
};
const ABANDONED: Paint = {
  wall: '#b9b2a4',
  roof: '#8a8178',
  wood: '#8d8378',
  accent: '#a39e94',
  line: '#4e4a44',
};

function house(p: Paint, broken: boolean, body: string): string {
  const roof = broken
    ? `<path d="M10 30 L36 10 L44 16 L40 22 L52 18 L74 30 Z" fill="${p.roof}" stroke="${p.line}" stroke-width="2.5"/>`
    : `<path d="M8 30 L42 8 L76 30 Z" fill="${p.roof}" stroke="${p.line}" stroke-width="2.5"/>`;
  return `${body}${roof}`;
}

function boards(p: Paint): string {
  return `<path d="M30 44 L54 60 M54 44 L30 60" stroke="${p.line}" stroke-width="3" stroke-linecap="round"/>`;
}

/** One building, restored or abandoned (VIL-04). viewBox 0 0 84 64. */
export function buildingSvg(id: string, restored: boolean): string {
  const p = restored ? RESTORED : ABANDONED;
  const broken = !restored;
  let inner: string;
  switch (id) {
    case 'pier':
      inner = `<rect x="0" y="44" width="84" height="20" fill="#4fa9dc"/>
<rect x="6" y="34" width="72" height="12" rx="2" fill="${p.wood}" stroke="${p.line}" stroke-width="2.5"/>
${[12, 30, 48, 66].map((x) => `<rect x="${x}" y="44" width="5" height="18" fill="${p.wood}" stroke="${p.line}" stroke-width="2"/>`).join('')}
${broken ? `<rect x="34" y="33" width="14" height="14" fill="#4fa9dc"/>` : `<path d="M62 34 L62 10 L78 16 L62 22" fill="${p.accent}" stroke="${p.line}" stroke-width="2"/>`}`;
      break;
    case 'shed':
      inner = house(
        p,
        broken,
        `<rect x="14" y="28" width="56" height="34" fill="${p.wood}" stroke="${p.line}" stroke-width="2.5"/>
<rect x="32" y="40" width="20" height="22" fill="${p.wall}" stroke="${p.line}" stroke-width="2.5"/>
${broken ? boards(p) : `<path d="M32 40 L52 62 M52 40 L32 62" stroke="${p.line}" stroke-width="2"/>`}`,
      );
      break;
    case 'mill':
      inner = house(
        p,
        broken,
        `<rect x="18" y="26" width="44" height="36" fill="${p.wall}" stroke="${p.line}" stroke-width="2.5"/>
<circle cx="66" cy="46" r="15" fill="none" stroke="${p.wood}" stroke-width="5"/>
${[0, 45, 90, 135].map((a) => `<rect x="64" y="31" width="4" height="30" fill="${p.wood}" transform="rotate(${a} 66 46)"/>`).join('')}
<rect x="30" y="40" width="14" height="22" fill="${p.wood}" stroke="${p.line}" stroke-width="2"/>
${broken ? boards(p) : ''}`,
      );
      break;
    case 'flowerbed': {
      const flowers = broken
        ? [16, 30, 44, 58, 70]
            .map(
              (x) =>
                `<path d="M${x} 50 L${x - 3} 38 M${x} 50 L${x + 3} 40" stroke="${p.line}" stroke-width="2"/>`,
            )
            .join('')
        : [16, 30, 44, 58, 70]
            .map(
              (x, i) =>
                `<path d="M${x} 52 L${x} 40" stroke="#2e6b3a" stroke-width="2.5"/><circle cx="${x}" cy="36" r="6" fill="${['#f48fb1', '#ffffff', '#ffd54f', '#ce93d8', '#ff8a65'][i]}" stroke="#2e6b3a" stroke-width="2"/>`,
            )
            .join('');
      inner = `<rect x="6" y="48" width="72" height="12" rx="3" fill="#8d6e4b" stroke="${p.line}" stroke-width="2.5"/>${flowers}
${[6, 24, 42, 60, 76].map((x) => `<rect x="${x}" y="42" width="4" height="20" fill="${p.wood}" stroke="${p.line}" stroke-width="1.5"/>`).join('')}`;
      break;
    }
    case 'bathhouse':
      inner = house(
        p,
        broken,
        `<rect x="14" y="28" width="56" height="34" fill="${p.wood}" stroke="${p.line}" stroke-width="2.5"/>
${[34, 42, 50, 58].map((y) => `<path d="M14 ${y} L70 ${y}" stroke="${p.line}" stroke-width="1.5"/>`).join('')}
<rect x="54" y="6" width="8" height="16" fill="${p.accent}" stroke="${p.line}" stroke-width="2"/>
${broken ? boards(p) : `<circle cx="60" cy="2" r="4" fill="#ffffff" opacity="0.8"/><circle cx="66" cy="-3" r="3" fill="#ffffff" opacity="0.6"/>`}`,
      );
      break;
    default:
      inner = `<rect x="0" y="40" width="84" height="24" fill="#4fa9dc"/>
${broken ? `<path d="M2 36 Q20 14 34 26" fill="none" stroke="${p.wood}" stroke-width="9"/><path d="M50 26 Q64 14 82 36" fill="none" stroke="${p.wood}" stroke-width="9"/>` : `<path d="M2 38 Q42 0 82 38" fill="none" stroke="${p.wood}" stroke-width="9"/><path d="M2 38 Q42 0 82 38" fill="none" stroke="${p.line}" stroke-width="2" transform="translate(0 6)"/>`}
${[12, 72].map((x) => `<rect x="${x - 3}" y="34" width="6" height="28" fill="${p.wood}" stroke="${p.line}" stroke-width="2"/>`).join('')}`;
  }
  return `<svg viewBox="0 -8 84 72" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${inner}</svg>`;
}
