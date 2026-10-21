/**
 * ART-01: the river field as one picture, drawn with Canvas 2D for the current layout — a meadow,
 * grassy banks with spots for items, the river with depth, sandy edges and foam, springs at the top,
 * and the backwater pond with lily pads. Redrawn only when the layout changes (UI-15).
 */

import { slotRect, type FieldGeometry, type Layout } from '../ui/layout';

type Ctx = CanvasRenderingContext2D;

/** A small seeded generator: the decoration stays the same for the same layout. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rounded(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function tuft(ctx: Ctx, x: number, y: number, s: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.18);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y);
  ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.6, x - s * 0.8, y - s * 0.9);
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + s * 0.05, y - s * 0.7, x - s * 0.1, y - s * 1.15);
  ctx.moveTo(x + s * 0.5, y);
  ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.6, x + s * 0.85, y - s * 0.85);
  ctx.stroke();
}

function flower(ctx: Ctx, x: number, y: number, r: number, petal: string): void {
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffcf3d';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
}

function lilyPad(ctx: Ctx, x: number, y: number, r: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(16, 60, 80, 0.25)';
  ctx.beginPath();
  ctx.ellipse(r * 0.12, r * 0.18, r, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6cc24a';
  ctx.strokeStyle = '#24432c';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, 0.35, Math.PI * 2 - 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(36, 67, 44, 0.45)';
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.7, -r * 0.3);
  ctx.moveTo(0, 0);
  ctx.lineTo(-r * 0.4, r * 0.65);
  ctx.stroke();
  ctx.restore();
}

/** A wavy line along a vertical edge (sand and foam at the banks). */
function wavyEdge(
  ctx: Ctx,
  x: number,
  y0: number,
  y1: number,
  amp: number,
  step: number,
  phase: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y0);
  for (let y = y0; y <= y1; y += step / 2) {
    ctx.lineTo(x + Math.sin((y + phase) / step) * amp, y);
  }
  ctx.stroke();
}

/** The whole active area: meadow, field and backwater, in device pixels. */
export function drawFieldBackground(l: Layout, g: FieldGeometry, dpr: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(l.width * dpr));
  canvas.height = Math.max(1, Math.round(l.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  const rand = rng(l.width * 73856093 + l.height * 19349663 + g.cols * 83492791);
  const c = l.cell;
  const f = l.field;
  const river = { x: f.x + c, y: f.y, w: (g.cols - 2) * c, h: g.rows * c };

  // Meadow around the field.
  const meadow = ctx.createLinearGradient(0, 0, 0, l.height);
  meadow.addColorStop(0, '#5fa848');
  meadow.addColorStop(1, '#3f7f37');
  ctx.fillStyle = meadow;
  ctx.fillRect(0, 0, l.width, l.height);
  const glow = ctx.createRadialGradient(
    l.width / 2,
    l.height * 0.35,
    0,
    l.width / 2,
    l.height * 0.35,
    Math.max(l.width, l.height) * 0.7,
  );
  glow.addColorStop(0, 'rgba(255, 244, 190, 0.22)');
  glow.addColorStop(1, 'rgba(255, 244, 190, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, l.width, l.height);
  for (let i = 0; i < (l.width * l.height) / 900; i++) {
    tuft(
      ctx,
      rand() * l.width,
      rand() * l.height,
      4 + rand() * 4,
      rand() < 0.5 ? 'rgba(36, 80, 40, 0.35)' : 'rgba(170, 220, 120, 0.3)',
    );
  }

  // The field's shadow and frame.
  const radius = c * 0.3;
  ctx.fillStyle = 'rgba(20, 45, 20, 0.35)';
  rounded(ctx, f.x - 2, f.y + 4, f.w + 4, f.h + 4, radius);
  ctx.fill();

  ctx.save();
  rounded(ctx, f.x, f.y, f.w, f.h, radius);
  ctx.clip();

  // Banks: grass, a little darker towards the water.
  for (const side of [0, 1]) {
    const x0 = side === 0 ? f.x : f.x + f.w - c;
    const grad = ctx.createLinearGradient(x0, 0, x0 + c, 0);
    const outer = '#9ad86f';
    const inner = '#6fbe50';
    grad.addColorStop(0, side === 0 ? outer : inner);
    grad.addColorStop(1, side === 0 ? inner : outer);
    ctx.fillStyle = grad;
    ctx.fillRect(x0, f.y, c, f.h);
    // GD-03: a soft mat for every spot an item can wait on.
    for (let row = 0; row < g.rows; row++) {
      const inset = c * 0.08;
      const x = x0 + inset;
      const y = f.y + row * c + inset;
      ctx.fillStyle = 'rgba(255, 255, 220, 0.16)';
      rounded(ctx, x, y, c - inset * 2, c - inset * 2, c * 0.22);
      ctx.fill();
      ctx.strokeStyle = 'rgba(52, 110, 40, 0.35)';
      ctx.lineWidth = Math.max(1, c * 0.03);
      ctx.stroke();
    }
    // Tufts and flowers along the outer edge and between the spots.
    for (let row = 0; row <= g.rows; row++) {
      const y = f.y + row * c;
      const xs = side === 0 ? x0 + c * 0.12 : x0 + c * 0.88;
      tuft(ctx, xs, y + c * 0.04, c * 0.12, 'rgba(36, 90, 40, 0.55)');
      if (rand() < 0.55) {
        const petals = ['#ffffff', '#ff9fc0', '#ffe066', '#c7a8ff'];
        flower(
          ctx,
          x0 + c * (0.3 + rand() * 0.4),
          y + (rand() - 0.5) * c * 0.1,
          c * 0.045,
          petals[Math.floor(rand() * petals.length)] ?? '#ffffff',
        );
      }
    }
  }

  // The river: deeper in the middle, lighter at the banks, foam at the springs.
  const across = ctx.createLinearGradient(river.x, 0, river.x + river.w, 0);
  across.addColorStop(0, '#6fd0f2');
  across.addColorStop(0.18, '#44b2e3');
  across.addColorStop(0.5, '#3299d2');
  across.addColorStop(0.82, '#44b2e3');
  across.addColorStop(1, '#6fd0f2');
  ctx.fillStyle = across;
  ctx.fillRect(river.x, river.y, river.w, river.h);
  const along = ctx.createLinearGradient(0, river.y, 0, river.y + river.h);
  along.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  along.addColorStop(0.15, 'rgba(255, 255, 255, 0)');
  along.addColorStop(0.85, 'rgba(10, 60, 100, 0)');
  along.addColorStop(1, 'rgba(10, 60, 100, 0.22)');
  ctx.fillStyle = along;
  ctx.fillRect(river.x, river.y, river.w, river.h);
  // Lanes: faint dashed lines.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = Math.max(1, c * 0.025);
  ctx.setLineDash([c * 0.18, c * 0.22]);
  for (let lane = 1; lane < g.cols - 2; lane++) {
    const x = river.x + lane * c;
    ctx.beginPath();
    ctx.moveTo(x, river.y);
    ctx.lineTo(x, river.y + river.h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // GD-12: springs above every lane — foam and a soft chevron.
  for (let lane = 0; lane < g.cols - 2; lane++) {
    const x = river.x + (lane + 0.5) * c;
    const foam = ctx.createRadialGradient(x, river.y, 0, x, river.y, c * 0.5);
    foam.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    foam.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = foam;
    ctx.fillRect(x - c * 0.5, river.y, c, c * 0.5);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = Math.max(1.5, c * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - c * 0.11, river.y + c * 0.06);
    ctx.lineTo(x, river.y + c * 0.15);
    ctx.lineTo(x + c * 0.11, river.y + c * 0.06);
    ctx.stroke();
  }
  // Sandy edges with foam on the water side.
  for (const x of [river.x, river.x + river.w]) {
    ctx.strokeStyle = '#d7b06c';
    ctx.lineWidth = Math.max(3, c * 0.13);
    wavyEdge(ctx, x, f.y - 4, f.y + f.h + 4, c * 0.03, c * 0.35, x);
    ctx.strokeStyle = '#f2dba6';
    ctx.lineWidth = Math.max(2, c * 0.08);
    wavyEdge(ctx, x, f.y - 4, f.y + f.h + 4, c * 0.03, c * 0.35, x);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = Math.max(1, c * 0.035);
    const off = x === river.x ? c * 0.1 : -c * 0.1;
    wavyEdge(ctx, x + off, f.y, f.y + f.h, c * 0.04, c * 0.22, x * 3);
  }
  ctx.restore();

  // Frame of the field.
  ctx.strokeStyle = '#24432c';
  ctx.lineWidth = 3;
  rounded(ctx, f.x, f.y, f.w, f.h, radius);
  ctx.stroke();

  // GD-12: the backwater pond.
  const b = l.backwater;
  ctx.fillStyle = 'rgba(20, 45, 20, 0.3)';
  rounded(ctx, b.x - 1, b.y + 3, b.w + 2, b.h + 2, b.h / 2);
  ctx.fill();
  const pond = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  pond.addColorStop(0, '#2f9bd4');
  pond.addColorStop(1, '#1d6f9f');
  ctx.fillStyle = pond;
  rounded(ctx, b.x, b.y, b.w, b.h, b.h / 2);
  ctx.fill();
  ctx.strokeStyle = '#e9c98a';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = '#4a2f1b';
  ctx.lineWidth = 2;
  rounded(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, b.h / 2 + 2);
  ctx.stroke();
  for (let i = 0; i < g.backwater; i++) {
    const s = slotRect(l, i);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    rounded(ctx, s.x, s.y, s.w, s.h, s.w * 0.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 236, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Lily pads on the pond's rim, outside the slots.
  lilyPad(ctx, b.x + 4, b.y + b.h - 6, Math.min(9, b.h * 0.18), -0.4);
  lilyPad(ctx, b.x + b.w - 5, b.y + 7, Math.min(8, b.h * 0.16), 2.2);
  return canvas;
}

/** FX-05: soft wave crests that tile seamlessly; they drift down the river. */
export function drawRipple(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const crests: [number, number, number, number][] = [
    [22, 18, 11, 0.9],
    [84, 30, 13, 0.7],
    [48, 62, 9, 0.8],
    [106, 82, 11, 0.9],
    [18, 98, 13, 0.7],
    [68, 112, 8, 0.8],
    [100, 8, 7, 0.5],
    [40, 120, 6, 0.5],
  ];
  const k = size / 128;
  ctx.lineCap = 'round';
  for (const [x, y, r, a] of crests) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.arc(x * k, y * k, r * k, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.45})`;
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.arc((x + r * 0.9) * k, (y + r * 0.5) * k, r * 0.6 * k, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
  }
  return canvas;
}
