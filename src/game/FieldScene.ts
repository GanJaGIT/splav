import Phaser from 'phaser';
import { computeLayout, slotRect, type FieldGeometry, type Layout } from '../ui/layout';

/** Temporary palette (ART-01); the final art arrives in Stage 5. */
const COLORS = {
  grass: 0x8ccf68,
  grassCell: 0x9fdc7a,
  bankEdge: 0x5f9e45,
  water: 0x3f9fd6,
  waterAlt: 0x3b97cd,
  laneLine: 0xbfe8fb,
  outline: 0x2b5a33,
  pond: 0x2f80b3,
  slot: 0x58b0e0,
  ripple: 0xffffff,
};

const RIPPLE_KEY = 'ripple';
const RIPPLE_SIZE = 128;

/**
 * Field of the river (UI-04): banks, lanes, backwater and the constantly moving ripple (FX-05).
 * Stage 0 draws an empty field; items, input and the simulation arrive in Stages 1–2.
 */
export class FieldScene extends Phaser.Scene {
  private layout!: Layout;
  private under!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private ripples: Phaser.GameObjects.TileSprite[] = [];

  constructor(
    private readonly geometry: FieldGeometry,
    private readonly onFirstFrame: () => void,
  ) {
    super('field');
  }

  create(): void {
    this.makeRippleTexture();
    this.under = this.add.graphics();
    this.ripples = [
      this.add.tileSprite(0, 0, 1, 1, RIPPLE_KEY).setOrigin(0).setAlpha(0.4),
      this.add.tileSprite(0, 0, 1, 1, RIPPLE_KEY).setOrigin(0).setAlpha(0.2),
    ];
    this.over = this.add.graphics();

    this.relayout(this.scale.gameSize.width, this.scale.gameSize.height);
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) =>
      this.relayout(size.width, size.height),
    );
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.onFirstFrame());
  }

  override update(time: number, delta: number): void {
    // The ripple drifts downstream; it is decoration and runs even while the river is frozen.
    const speed = (this.layout.cell / 1000) * 0.5;
    const [near, far] = this.ripples;
    if (near && far) {
      near.tilePositionY -= delta * speed;
      far.tilePositionY -= delta * speed * 1.7;
      far.tilePositionX = Math.sin(time / 1700) * 6;
    }
  }

  private makeRippleTexture(): void {
    if (this.textures.exists(RIPPLE_KEY)) return;
    const g = this.make.graphics({}, false);
    g.lineStyle(3, COLORS.ripple, 1);
    // Fixed crest positions keep the texture seamless when tiled.
    const crests: [number, number, number][] = [
      [24, 20, 10],
      [86, 34, 12],
      [50, 66, 9],
      [108, 86, 10],
      [20, 100, 12],
      [70, 114, 8],
    ];
    for (const [x, y, r] of crests) {
      g.beginPath();
      g.arc(x, y, r, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
    }
    g.generateTexture(RIPPLE_KEY, RIPPLE_SIZE, RIPPLE_SIZE);
    g.destroy();
  }

  private relayout(width: number, height: number): void {
    const l = computeLayout(width, height, this.geometry);
    this.layout = l;
    const { cols, rows } = this.geometry;
    const c = l.cell;
    const f = l.field;
    const river = { x: f.x + c, y: f.y, w: (cols - 2) * c, h: rows * c };

    const g = this.under;
    g.clear();
    // Banks with spots for items (GD-03).
    g.fillStyle(COLORS.grass, 1);
    g.fillRect(f.x, f.y, c, f.h);
    g.fillRect(f.x + f.w - c, f.y, c, f.h);
    g.fillStyle(COLORS.grassCell, 1);
    const inset = Math.max(2, Math.round(c * 0.06));
    for (let row = 0; row < rows; row++) {
      for (const col of [0, cols - 1]) {
        g.fillRoundedRect(
          f.x + col * c + inset,
          f.y + row * c + inset,
          c - 2 * inset,
          c - 2 * inset,
          c * 0.18,
        );
      }
    }
    // Lanes.
    for (let lane = 0; lane < cols - 2; lane++) {
      g.fillStyle(lane % 2 === 0 ? COLORS.water : COLORS.waterAlt, 1);
      g.fillRect(river.x + lane * c, river.y, c, river.h);
    }

    for (const [i, r] of this.ripples.entries()) {
      r.setPosition(river.x, river.y);
      r.setSize(river.w, river.h);
      r.setTileScale((c / 64) * (i === 0 ? 1 : 0.7));
    }

    const o = this.over;
    o.clear();
    // Lane separators and bank edges.
    o.lineStyle(1, COLORS.laneLine, 0.35);
    for (let lane = 1; lane < cols - 2; lane++) {
      o.lineBetween(river.x + lane * c, river.y, river.x + lane * c, river.y + river.h);
    }
    o.lineStyle(3, COLORS.bankEdge, 1);
    o.lineBetween(river.x, river.y, river.x, river.y + river.h);
    o.lineBetween(river.x + river.w, river.y, river.x + river.w, river.y + river.h);
    // Contour of the field (ART-01).
    o.lineStyle(3, COLORS.outline, 1);
    o.strokeRect(f.x, f.y, f.w, f.h);

    // Backwater (GD-12).
    const b = l.backwater;
    o.fillStyle(COLORS.pond, 1);
    o.fillRoundedRect(b.x, b.y, b.w, b.h, 12);
    o.lineStyle(3, COLORS.outline, 1);
    o.strokeRoundedRect(b.x, b.y, b.w, b.h, 12);
    o.fillStyle(COLORS.slot, 0.6);
    for (let i = 0; i < this.geometry.backwater; i++) {
      const s = slotRect(l, i);
      o.fillRoundedRect(s.x, s.y, s.w, s.h, 10);
    }
  }
}
