import { describe, expect, it } from 'vitest';
import {
  computeLayout,
  fitActiveArea,
  slotRect,
  type FieldGeometry,
  type Rect,
} from '../../src/ui/layout';

/** QA-04 window sizes. */
const SIZES: [number, number][] = [
  [360, 560],
  [360, 640],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1080],
];
const PHONES = SIZES.filter(([w]) => w <= 412);

const BIG: FieldGeometry = { cols: 7, rows: 8, backwater: 5 };
const SMALL: FieldGeometry = { cols: 5, rows: 7, backwater: 5 };

const inside = (r: Rect, w: number, h: number): boolean =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout', () => {
  it('UI-13: on a computer the active area is between 1:2 and 2:1 and touches the short side', () => {
    for (const [w, h] of SIZES) {
      const a = fitActiveArea(w, h, true);
      expect(a.width / a.height).toBeLessThanOrEqual(2);
      expect(a.width / a.height).toBeGreaterThanOrEqual(0.5);
      expect(a.width === w || a.height === h).toBe(true);
    }
    expect(fitActiveArea(2560, 1080, true)).toEqual({ width: 2160, height: 1080 });
    expect(fitActiveArea(400, 900, true)).toEqual({ width: 400, height: 800 });
  });

  it('UI-13: a phone uses the whole screen', () => {
    expect(fitActiveArea(390, 844, false)).toEqual({ width: 390, height: 844 });
  });

  it('UI-10: a cell is at least 44 px on phones for the biggest field', () => {
    for (const [w, h] of PHONES) {
      const a = fitActiveArea(w, h, w > 412);
      expect(computeLayout(a.width, a.height, BIG).cell, `${w}x${h}`).toBeGreaterThanOrEqual(44);
    }
  });

  it('UI-11, UI-12: parts stay on screen and do not overlap', () => {
    for (const [w, h] of SIZES) {
      for (const g of [BIG, SMALL]) {
        const a = fitActiveArea(w, h, w > 412);
        const l = computeLayout(a.width, a.height, g);
        const parts = [l.header, l.field, l.backwater, l.boosters];
        for (const p of parts) expect(inside(p, a.width, a.height), `${w}x${h}`).toBe(true);
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            expect(overlap(parts[i]!, parts[j]!), `${w}x${h} parts ${i},${j}`).toBe(false);
          }
        }
        expect(l.orientation).toBe(a.height >= a.width ? 'portrait' : 'landscape');
      }
    }
  });

  it('backwater slots are 44 px and fit in the tray', () => {
    const l = computeLayout(360, 640, BIG);
    for (let i = 0; i < BIG.backwater; i++) {
      const s = slotRect(l, i);
      expect(s.w).toBeGreaterThanOrEqual(44);
      expect(s.x + s.w).toBeLessThanOrEqual(l.backwater.x + l.backwater.w);
    }
  });

  it('GD-52, VIL-02: 9 slots (Shed + Continue) stay on screen on every size', () => {
    const g: FieldGeometry = { ...BIG, backwater: 9 };
    for (const [w, h] of SIZES) {
      const a = fitActiveArea(w, h, w > 412);
      const l = computeLayout(a.width, a.height, g);
      expect(inside(l.backwater, a.width, a.height), `${w}x${h}`).toBe(true);
      const last = slotRect(l, 8);
      expect(last.x + last.w, `${w}x${h}`).toBeLessThanOrEqual(l.backwater.x + l.backwater.w);
      expect(l.slot, `${w}x${h}`).toBeGreaterThanOrEqual(w <= 412 ? 34 : 44);
    }
    // 6 slots (the Shed) keep the full 44 px on the narrowest phone.
    expect(computeLayout(360, 560, { ...BIG, backwater: 6 }).slot).toBe(44);
  });
});
