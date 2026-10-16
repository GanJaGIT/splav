/** §4.2: level screen layout in CSS pixels of the active area. Pure, shared by DOM and Phaser. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldGeometry {
  /** Lanes plus two bank columns. */
  cols: number;
  rows: number;
  /** Backwater slots (GD-12). */
  backwater: number;
}

export interface Layout {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  header: Rect;
  /** The grid itself: cols × rows cells of `cell` px. */
  field: Rect;
  cell: number;
  backwater: Rect;
  slot: number;
  slotGap: number;
  boosters: Rect;
}

/** UI-11 */
export const HEADER_H = 44;
export const BACKWATER_H = 52;
export const BOOSTERS_H = 48;
/** UI-12: booster column on the right in landscape. */
export const BOOSTERS_COL_W = 64;
export const GAP = 4;
export const MAX_CELL = 96;
/** UI-10: touch targets are at least 44 px. */
const SLOT = 44;
const SLOT_GAP = 6;
const MIN_SLOT_GAP = 3;
const TRAY_PAD = 6;

/**
 * UI-13: on a computer the active area is never wider than 2:1 nor narrower than 1:2.
 * A phone always uses the whole screen.
 */
export function fitActiveArea(
  vw: number,
  vh: number,
  desktop: boolean,
): { width: number; height: number } {
  if (!desktop) return { width: Math.floor(vw), height: Math.floor(vh) };
  return {
    width: Math.floor(Math.min(vw, vh * 2)),
    height: Math.floor(Math.min(vh, vw * 2)),
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function computeLayout(width: number, height: number, g: FieldGeometry): Layout {
  const portrait = height >= width;
  const header: Rect = { x: 0, y: 0, w: width, h: HEADER_H };
  const boosters: Rect = portrait
    ? { x: 0, y: height - BOOSTERS_H, w: width, h: BOOSTERS_H }
    : { x: width - BOOSTERS_COL_W, y: HEADER_H, w: BOOSTERS_COL_W, h: height - HEADER_H };

  // Space for the field and the backwater under it.
  const right = portrait ? width : boosters.x;
  const top = HEADER_H + GAP;
  const bottom = portrait ? boosters.y - GAP : height - GAP;
  const areaW = right - 2 * GAP;
  const areaH = bottom - top - BACKWATER_H - GAP;

  const cell = Math.max(
    1,
    Math.min(MAX_CELL, Math.floor(Math.min(areaW / g.cols, areaH / g.rows))),
  );
  const fw = cell * g.cols;
  const fh = cell * g.rows;
  const groupH = fh + GAP + BACKWATER_H;
  // UI-12: centred on the screen when the booster column leaves room for it.
  const fx = clamp(Math.floor((width - fw) / 2), GAP, right - GAP - fw);
  const fy = top + Math.max(0, Math.floor((bottom - top - groupH) / 2));
  const field: Rect = { x: fx, y: fy, w: fw, h: fh };

  // GD-52 with the Shed: up to 9 slots. When they do not fit the width, the gaps and then the
  // slots get smaller (only after Continue on a narrow phone).
  const n = Math.max(1, g.backwater);
  const fits = (sl: number, gap: number): boolean => n * sl + (n - 1) * gap + 2 * TRAY_PAD <= areaW;
  const slotGap = fits(SLOT, SLOT_GAP) ? SLOT_GAP : MIN_SLOT_GAP;
  const slot = fits(SLOT, slotGap)
    ? SLOT
    : Math.max(1, Math.floor((areaW - 2 * TRAY_PAD - (n - 1) * slotGap) / n));
  const trayW = n * slot + (n - 1) * slotGap + 2 * TRAY_PAD;
  const backwater: Rect = {
    x: clamp(fx + Math.floor((fw - trayW) / 2), GAP, right - GAP - trayW),
    y: fy + fh + GAP,
    w: trayW,
    h: BACKWATER_H,
  };

  return {
    width,
    height,
    orientation: portrait ? 'portrait' : 'landscape',
    header,
    field,
    cell,
    backwater,
    slot,
    slotGap,
    boosters,
  };
}

/** Top-left of backwater slot `i` inside the tray. */
export function slotRect(l: Layout, i: number): Rect {
  const y = l.backwater.y + Math.floor((l.backwater.h - l.slot) / 2);
  return { x: l.backwater.x + TRAY_PAD + i * (l.slot + l.slotGap), y, w: l.slot, h: l.slot };
}
