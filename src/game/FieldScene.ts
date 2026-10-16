import Phaser from 'phaser';
import {
  currentOrder,
  HOLD_MAX_TICKS,
  mergeResult,
  timeToNextStep,
  type Cell,
  type Item,
  type Ref,
  type SimEvent,
  type SimState,
} from '../sim';
import { computeLayout, slotRect, type FieldGeometry, type Layout } from '../ui/layout';
import { CHAIN_COLOR, ensureTextures, itemKey, RESIDENT_KEY } from './art';
import type { LevelSession } from './session';

/** Temporary palette (ART-01); the final art arrives in Stage 5. */
const COLORS = {
  background: 0x2f6b45,
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
  glow: 0xfff59d,
  target: 0x66ff66,
  warning: 0xff9800,
  frozen: 0xb3e5fc,
};

const RIPPLE_KEY = 'ripple';
const RIPPLE_SIZE = 128;
/** Item size relative to the cell. */
const ITEM_SCALE = 0.86;
/** Backwater items are drawn smaller (the tray is 52 px high, UI-11). */
const SLOT_ITEM_SCALE = 0.92;
const MOVE_MS = 180;

/** The item the player holds, as the input sees it (INP-01, INP-02). */
export interface HeldView {
  id: number;
  /** Stage coordinates of the drawn item. */
  x: number;
  y: number;
  /** Dragged items follow the pointer; a tapped item stays at its place, highlighted. */
  dragging: boolean;
}

interface ItemView {
  id: number;
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  t0: number;
  dur: number;
  size: number;
  phase: number;
}

interface PierView {
  dock: Phaser.GameObjects.Image;
  face: Phaser.GameObjects.Image;
  order: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Text;
}

/**
 * The river field (UI-04, TECH-02): banks, lanes, piers, obstacles, items and effects.
 * World units are CSS pixels of the active area; the camera zooms by the device pixel ratio
 * so everything is drawn crisp. Items move smoothly between the cells the simulation gives them.
 */
export class FieldScene extends Phaser.Scene {
  private layout!: Layout;
  private geometry: FieldGeometry = { cols: 7, rows: 8, backwater: 5 };
  private session: LevelSession | null = null;
  private readonly simEvents: SimEvent[] = [];
  private held: HeldView | null = null;
  private hookArmed = false;

  private under!: Phaser.GameObjects.Graphics;
  private over!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private ripples: Phaser.GameObjects.TileSprite[] = [];
  private frozen!: Phaser.GameObjects.Rectangle;
  private obstacles = new Map<number, Phaser.GameObjects.Image>();
  private piers: PierView[] = [];
  private readonly items = new Map<number, ItemView>();
  private ghost!: Phaser.GameObjects.Image;
  private ring!: Phaser.GameObjects.Graphics;
  private dpr = 1;
  private ready = false;
  /** After a relayout items jump to their new cells instead of gliding. */
  private snapItems = false;

  constructor(
    private readonly residents: readonly string[],
    private readonly onFirstFrame: () => void,
  ) {
    super('field');
  }

  create(): void {
    ensureTextures(this, this.residents);
    this.makeRippleTexture();
    this.cameras.main.setOrigin(0, 0);
    this.under = this.add.graphics().setDepth(0);
    this.ripples = [
      this.add.tileSprite(0, 0, 1, 1, RIPPLE_KEY).setOrigin(0).setAlpha(0.4).setDepth(1),
      this.add.tileSprite(0, 0, 1, 1, RIPPLE_KEY).setOrigin(0).setAlpha(0.2).setDepth(1),
    ];
    this.frozen = this.add.rectangle(0, 0, 1, 1, COLORS.frozen, 0).setOrigin(0).setDepth(2);
    this.over = this.add.graphics().setDepth(2);
    this.marks = this.add.graphics().setDepth(4);
    this.ghost = this.add
      .image(0, 0, itemKey('wood', 1))
      .setAlpha(0.3)
      .setVisible(false)
      .setDepth(4);
    this.ring = this.add.graphics().setDepth(9);
    this.ready = true;
    this.cameras.main.setZoom(this.dpr);
    this.relayout();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, () => this.onFirstFrame());
  }

  // -------------------------------------------------------------------------------------------
  // Public API for the app and the input

  /** Size of the active area in CSS pixels and the device pixel ratio. */
  resize(width: number, height: number, dpr: number): void {
    this.dpr = dpr;
    this.layout = computeLayout(width, height, this.geometry);
    if (!this.ready) return;
    this.cameras.main.setZoom(dpr);
    this.relayout();
  }

  setSession(session: LevelSession | null): void {
    this.session = session;
    this.simEvents.length = 0;
    this.held = null;
    for (const v of this.items.values()) v.sprite.destroy();
    this.items.clear();
    if (session) {
      const g: FieldGeometry = {
        cols: session.state.cols,
        rows: session.state.rows,
        backwater: session.state.backwaterCap,
      };
      this.geometry = g;
      session.onTick((events) => this.simEvents.push(...events));
    }
    if (this.layout)
      this.layout = computeLayout(this.layout.width, this.layout.height, this.geometry);
    if (this.ready) this.relayout();
  }

  /** The backwater grew (GD-52): the tray gets wider. */
  refreshGeometry(): void {
    const s = this.session?.state;
    if (!s || s.backwaterCap === this.geometry.backwater) return;
    this.geometry = { ...this.geometry, backwater: s.backwaterCap };
    this.layout = computeLayout(this.layout.width, this.layout.height, this.geometry);
    this.relayout();
  }

  getLayout(): Layout {
    return this.layout;
  }

  setHeld(held: HeldView | null): void {
    this.held = held;
  }

  /** INP-04: while the Hook waits for its target, rocks and snags are highlighted. */
  setHookArmed(on: boolean): void {
    this.hookArmed = on;
  }

  cellCenter(col: number, row: number): { x: number; y: number } {
    const { field, cell } = this.layout;
    return { x: field.x + (col + 0.5) * cell, y: field.y + (row + 0.5) * cell };
  }

  slotCenter(slot: number): { x: number; y: number } {
    const r = slotRect(this.layout, slot);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** The item drawn under a point (stage coordinates), by its drawn position. */
  itemAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestDist = Infinity;
    for (const v of this.items.values()) {
      const r = v.size * 0.6;
      const d = Math.hypot(v.x - x, v.y - y);
      if (d <= r && d < bestDist) {
        best = v.id;
        bestDist = d;
      }
    }
    return best;
  }

  /** Where a drop at this point goes: an item under it, a field cell, a backwater slot or null. */
  refAt(x: number, y: number, exceptId?: number): Ref | null {
    const s = this.session?.state;
    if (!s) return null;
    const l = this.layout;
    for (const v of this.items.values()) {
      if (v.id === exceptId) continue;
      const ref = refOfItem(s, v.id);
      // Backwater slots may be narrower than a cell (9 slots on a phone): stay inside the slot.
      const r = ref?.at === 'backwater' ? Math.min(l.cell, l.slot + l.slotGap) / 2 : l.cell * 0.45;
      if (ref && Math.hypot(v.x - x, v.y - y) <= r) return ref;
    }
    return this.cellRefAt(x, y);
  }

  /** The field cell or backwater slot under a point, ignoring items. */
  cellRefAt(x: number, y: number): Ref | null {
    const { field, cell } = this.layout;
    const col = Math.floor((x - field.x) / cell);
    const row = Math.floor((y - field.y) / cell);
    if (x >= field.x && y >= field.y && col < this.geometry.cols && row < this.geometry.rows) {
      return { at: 'cell', col, row };
    }
    for (let i = 0; i < this.geometry.backwater; i++) {
      const r = slotRect(this.layout, i);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
        return { at: 'backwater', slot: i };
    }
    return null;
  }

  // -------------------------------------------------------------------------------------------
  // Frame

  override update(time: number, delta: number): void {
    const session = this.session;
    // The ripple drifts downstream; it is decoration and runs even while the river stands.
    const speed = (this.layout.cell / 1000) * 0.5;
    const [near, far] = this.ripples;
    const frozenNow = (session?.state.freezeTicks ?? 0) > 0;
    if (near && far) {
      near.tilePositionY -= frozenNow ? 0 : delta * speed;
      far.tilePositionY -= frozenNow ? 0 : delta * speed * 1.7;
      far.tilePositionX = Math.sin(time / 1700) * 6;
    }
    if (!session) return;
    session.advance(delta);
    const s = session.state;
    this.handleEvents(s);
    this.syncObstacles(s);
    this.syncPiers(s);
    this.syncItems(s, time);
    this.drawMarks(s, time);
    this.frozen.setFillStyle(COLORS.frozen, frozenNow ? 0.18 + 0.06 * Math.sin(time / 200) : 0);
  }

  private handleEvents(s: SimState): void {
    for (const e of this.simEvents) {
      switch (e.type) {
        case 'merge': {
          const at = this.cellCenter(e.to.col, e.to.row);
          const src = this.items.get(e.fromId);
          if (src) this.flyAway(src, at.x, at.y);
          this.items.get(e.toId)?.sprite.destroy();
          this.items.delete(e.toId);
          this.burst(at.x, at.y, CHAIN_COLOR[e.chain], 10 + e.level * 2);
          this.floatText(at.x, at.y - this.layout.cell * 0.3, `+${e.coins}`, '#fff59d');
          this.pop.add(e.id);
          break;
        }
        case 'deliver': {
          const pier = s.piers[e.pierId];
          const v = this.items.get(e.id);
          if (pier) {
            const at = this.cellCenter(pier.col, pier.row);
            if (v) this.flyAway(v, at.x, at.y);
            this.floatText(at.x, at.y - this.layout.cell * 0.4, `+${e.coins}`, '#b9f6ca');
            const pv = this.piers[e.pierId];
            if (pv)
              this.tweens.add({
                targets: pv.face,
                scale: pv.face.scale * 1.3,
                yoyo: true,
                duration: 160,
              });
            this.burst(at.x, at.y, 0x66ff66, 14);
          }
          break;
        }
        case 'lost': {
          const v = this.items.get(e.id);
          const at = v
            ? { x: v.x, y: v.y }
            : e.from.at === 'cell'
              ? this.cellCenter(e.from.col, e.from.row)
              : this.slotCenter(e.from.slot);
          if (v) this.flyAway(v, at.x, at.y + this.layout.cell * 0.8);
          this.splash(at.x, this.layout.field.y + this.layout.field.h);
          break;
        }
        case 'whirlpool':
          this.whirlpool();
          break;
        default:
          break;
      }
    }
    this.simEvents.length = 0;
  }

  /** New items born from a merge get a pop (FX-01). */
  private readonly pop = new Set<number>();

  private syncItems(s: SimState, time: number): void {
    const seen = new Set<number>();
    const { cell } = this.layout;
    const place = (item: Item, x: number, y: number, size: number, instant: boolean): void => {
      seen.add(item.id);
      let v = this.items.get(item.id);
      if (!v) {
        const sprite = this.add.image(x, y, itemKey(item.chain, item.level)).setDepth(5);
        v = {
          id: item.id,
          sprite,
          x,
          y: y - cell * 0.6,
          fromX: x,
          fromY: y - cell * 0.6,
          toX: x,
          toY: y,
          t0: this.time.now,
          dur: instant ? 0 : MOVE_MS,
          size,
          phase: (item.id * 1.37) % (Math.PI * 2),
        };
        this.items.set(item.id, v);
        if (this.pop.delete(item.id)) {
          v.y = y;
          v.fromY = y;
          sprite.setScale(0.01);
          this.tweens.add({
            targets: sprite,
            scale: { from: 0.2, to: (size / sprite.width) * 1 },
            ease: 'Back.easeOut',
            duration: 260,
          });
        } else {
          sprite.setAlpha(0);
          this.tweens.add({ targets: sprite, alpha: 1, duration: 200 });
        }
      }
      if (v.toX !== x || v.toY !== y) {
        v.fromX = v.x;
        v.fromY = v.y;
        v.toX = x;
        v.toY = y;
        v.t0 = this.time.now;
        v.dur = instant || this.snapItems ? 0 : MOVE_MS;
      }
      v.size = size;
    };

    const handId = s.hand?.item.id ?? null;
    const heldId = this.held?.id ?? null;
    for (let i = 0; i < s.grid.length; i++) {
      const c = s.grid[i] as Cell;
      if (c.kind !== 'item' || c.item.id === heldId) continue;
      const p = this.cellCenter(i % s.cols, Math.floor(i / s.cols));
      place(c.item, p.x, p.y, cell * ITEM_SCALE, false);
    }
    s.backwater.forEach((item, slot) => {
      if (!item || item.id === heldId) return;
      const p = this.slotCenter(slot);
      place(item, p.x, p.y, this.layout.slot * SLOT_ITEM_SCALE, false);
    });
    // The held item: at the pointer while dragged, at its place while tapped (INP-01, INP-02).
    const holdItem = s.hand?.item ?? findItem(s, heldId);
    if (holdItem) {
      const from = s.hand?.from ?? refOfItem(s, holdItem.id);
      const origin = from ? this.refCenter(from) : { x: 0, y: 0 };
      const drag = this.held && this.held.id === holdItem.id && this.held.dragging;
      const x = drag ? (this.held as HeldView).x : origin.x;
      const y = drag ? (this.held as HeldView).y : origin.y;
      place(holdItem, x, y, cell * ITEM_SCALE * (drag ? 1.12 : 1.08), drag === true);
    }

    this.snapItems = false;
    for (const [id, v] of this.items) {
      if (!seen.has(id)) {
        this.items.delete(id);
        this.flyAway(v, v.x, v.y);
      }
    }

    const now = this.time.now;
    for (const v of this.items.values()) {
      const t = v.dur > 0 ? Math.min(1, (now - v.t0) / v.dur) : 1;
      const k = 1 - (1 - t) * (1 - t);
      v.x = v.fromX + (v.toX - v.fromX) * k;
      v.y = v.fromY + (v.toY - v.fromY) * k;
      const held = v.id === handId || v.id === heldId;
      // FX-05: items sway on the water.
      const bob = held ? 0 : Math.sin(time / 650 + v.phase) * cell * 0.025;
      v.sprite.setPosition(v.x, v.y + bob);
      v.sprite.setAngle(held ? 0 : Math.sin(time / 900 + v.phase) * 2.5);
      v.sprite.setDepth(held ? 8 : 5);
      if (!this.tweens.isTweening(v.sprite)) v.sprite.setScale(v.size / v.sprite.width);
    }
  }

  private refCenter(ref: Ref): { x: number; y: number } {
    return ref.at === 'cell' ? this.cellCenter(ref.col, ref.row) : this.slotCenter(ref.slot);
  }

  /** Highlights, the hold ring, the bottom-row warning (INP-03, FX-03). */
  private drawMarks(s: SimState, time: number): void {
    const g = this.marks;
    const ring = this.ring;
    g.clear();
    ring.clear();
    this.ghost.setVisible(false);
    const { cell } = this.layout;
    const pulse = 0.5 + 0.5 * Math.sin(time / 160);

    // FX-03: the next step is less than 0.5 s away.
    const left = timeToNextStep(s) - (this.session?.tickProgress() ?? 0);
    if (s.status === 'playing' && s.flowStarted && s.freezeTicks === 0 && left <= 5) {
      for (let col = 1; col < s.cols - 1; col++) {
        const c = s.grid[(s.rows - 1) * s.cols + col];
        if (c?.kind !== 'item' || c.item.id === s.hand?.item.id) continue;
        const p = this.cellCenter(col, s.rows - 1);
        g.fillStyle(COLORS.warning, 0.25 + 0.35 * pulse);
        g.fillCircle(p.x, p.y, cell * 0.46);
      }
    }

    if (this.hookArmed) {
      for (let i = 0; i < s.grid.length; i++) {
        const k = s.grid[i]?.kind;
        if (k !== 'rock' && k !== 'snag') continue;
        const p = this.cellCenter(i % s.cols, Math.floor(i / s.cols));
        g.lineStyle(3, COLORS.target, 0.6 + 0.4 * pulse);
        g.strokeRoundedRect(p.x - cell / 2 + 3, p.y - cell / 2 + 3, cell - 6, cell - 6, 8);
      }
    }

    const hand = s.hand?.item ?? findItem(s, this.held?.id ?? null);
    if (!hand || s.status !== 'playing') return;
    // INP-03: pairs glow, a pier waiting for this item gets a green frame.
    for (let i = 0; i < s.grid.length; i++) {
      const c = s.grid[i] as Cell;
      const p = this.cellCenter(i % s.cols, Math.floor(i / s.cols));
      if (c.kind === 'item' && c.item.id !== hand.id && mergeResult(hand, c.item)) {
        g.fillStyle(COLORS.glow, 0.35 + 0.3 * pulse);
        g.fillCircle(p.x, p.y, cell * 0.5);
      } else if (c.kind === 'pier') {
        const o = currentOrder(s, c.pierId);
        if (o && o.chain === hand.chain && o.level === hand.level) {
          g.lineStyle(4, COLORS.target, 0.7 + 0.3 * pulse);
          g.strokeRoundedRect(p.x - cell / 2 + 2, p.y - cell / 2 + 2, cell - 4, cell - 4, 10);
        }
      }
    }
    const from = s.hand?.from ?? refOfItem(s, hand.id);
    const v = this.items.get(hand.id);
    if (from && v) {
      const o = this.refCenter(from);
      const dragged = Math.hypot(v.x - o.x, v.y - o.y) > cell * 0.3;
      if (dragged) {
        this.ghost
          .setTexture(itemKey(hand.chain, hand.level))
          .setPosition(o.x, o.y)
          .setScale((cell * ITEM_SCALE) / this.ghost.width)
          .setVisible(true);
      } else {
        g.fillStyle(COLORS.glow, 0.5);
        g.fillCircle(o.x, o.y, cell * 0.52);
      }
      // GD-30: the ring shows the time left to hold the item.
      if (s.hand) {
        const left01 =
          1 -
          Math.min(1, (s.hand.heldTicks + (this.session?.tickProgress() ?? 0)) / HOLD_MAX_TICKS);
        ring.lineStyle(4, 0xffffff, 0.9);
        ring.beginPath();
        ring.arc(v.x, v.y, cell * 0.55, -Math.PI / 2, -Math.PI / 2 + left01 * Math.PI * 2);
        ring.strokePath();
      }
    }
  }

  private syncObstacles(s: SimState): void {
    const seen = new Set<number>();
    const { cell } = this.layout;
    for (let i = 0; i < s.grid.length; i++) {
      const kind = s.grid[i]?.kind;
      if (kind !== 'rock' && kind !== 'snag') continue;
      seen.add(i);
      let img = this.obstacles.get(i);
      if (!img || img.texture.key !== kind) {
        img?.destroy();
        const p = this.cellCenter(i % s.cols, Math.floor(i / s.cols));
        img = this.add.image(p.x, p.y, kind).setDepth(3);
        this.obstacles.set(i, img);
      }
      img.setScale((cell * 0.96) / img.width);
    }
    for (const [i, img] of this.obstacles) {
      if (seen.has(i)) continue;
      this.obstacles.delete(i);
      this.tweens.add({
        targets: img,
        alpha: 0,
        scale: img.scale * 0.6,
        duration: 300,
        onComplete: () => img.destroy(),
      });
    }
  }

  private syncPiers(s: SimState): void {
    const { cell } = this.layout;
    s.piers.forEach((p, i) => {
      let v = this.piers[i];
      const at = this.cellCenter(p.col, p.row);
      if (!v) {
        const dock = this.add.image(at.x, at.y, 'pier').setDepth(3);
        const face = this.add.image(0, 0, RESIDENT_KEY(p.resident)).setDepth(6);
        const order = this.add.image(0, 0, itemKey('wood', 1)).setDepth(6);
        const badge = this.add
          .text(0, 0, '', {
            fontFamily: 'system-ui, sans-serif',
            fontStyle: '800',
            fontSize: '14px',
            color: '#ffffff',
            backgroundColor: '#1f4d2e',
            padding: { x: 4, y: 1 },
            resolution: this.dpr,
          })
          .setOrigin(1, 0)
          .setDepth(7);
        v = { dock, face, order, badge };
        this.piers[i] = v;
      }
      v.dock.setPosition(at.x, at.y).setScale(cell / v.dock.width);
      v.face
        .setPosition(at.x - cell * 0.3, at.y - cell * 0.3)
        .setScale((cell * 0.42) / v.face.width);
      const order = currentOrder(s, p.id);
      v.order.setVisible(order !== null);
      if (order) {
        v.order
          .setTexture(itemKey(order.chain, order.level))
          .setPosition(at.x + cell * 0.06, at.y + cell * 0.08)
          .setScale((cell * 0.7) / v.order.width);
      }
      const left = p.orders.length - p.done;
      v.badge.setText(left > 0 ? `×${left}` : '✓');
      v.badge.setPosition(at.x + cell * 0.5, at.y - cell * 0.5);
      v.badge.setResolution(this.dpr);
    });
  }

  // -------------------------------------------------------------------------------------------
  // Effects (FX-01…FX-04), temporary look

  private flyAway(v: ItemView, x: number, y: number): void {
    this.items.delete(v.id);
    this.tweens.add({
      targets: v.sprite,
      x,
      y,
      alpha: 0,
      scale: v.sprite.scale * 0.5,
      duration: 200,
      onComplete: () => v.sprite.destroy(),
    });
  }

  private burst(x: number, y: number, color: number, count: number): void {
    const p = this.add.particles(x, y, 'dot', {
      speed: { min: 60, max: 180 },
      lifespan: 450,
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: color,
      emitting: false,
    });
    p.setDepth(7);
    p.explode(count);
    this.time.delayedCall(600, () => p.destroy());
  }

  private splash(x: number, y: number): void {
    this.burst(x, y, 0xe1f5fe, 18);
    const g = this.add.graphics().setDepth(7);
    g.lineStyle(3, 0xffffff, 1);
    g.strokeCircle(0, 0, this.layout.cell * 0.3);
    g.setPosition(x, y);
    this.tweens.add({
      targets: g,
      scale: 2.4,
      alpha: 0,
      duration: 500,
      onComplete: () => g.destroy(),
    });
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'system-ui, sans-serif',
        fontStyle: '800',
        fontSize: '18px',
        color,
        stroke: '#1f3a1f',
        strokeThickness: 4,
        resolution: this.dpr,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: t,
      y: y - this.layout.cell * 0.7,
      alpha: 0,
      duration: 800,
      onComplete: () => t.destroy(),
    });
  }

  /** FX-02: a spiral over the river while it stands. */
  private whirlpool(): void {
    const { field, cell } = this.layout;
    const g = this.add.graphics().setDepth(7);
    g.lineStyle(4, 0xffffff, 0.8);
    g.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.2) {
      const r = (a / (Math.PI * 6)) * cell * 1.6;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();
    g.setPosition(field.x + field.w / 2, field.y + field.h / 2);
    this.tweens.add({ targets: g, angle: 720, duration: 3000 });
    this.tweens.add({
      targets: g,
      alpha: 0,
      delay: 2400,
      duration: 600,
      onComplete: () => g.destroy(),
    });
  }

  // -------------------------------------------------------------------------------------------
  // Static field

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

  private relayout(): void {
    if (!this.layout) return;
    const l = this.layout;
    const { cols, rows } = this.geometry;
    const c = l.cell;
    const f = l.field;
    const river = { x: f.x + c, y: f.y, w: (cols - 2) * c, h: rows * c };

    const g = this.under;
    g.clear();
    g.fillStyle(COLORS.background, 1);
    g.fillRect(0, 0, l.width, l.height);
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
    for (let lane = 0; lane < cols - 2; lane++) {
      g.fillStyle(lane % 2 === 0 ? COLORS.water : COLORS.waterAlt, 1);
      g.fillRect(river.x + lane * c, river.y, c, river.h);
    }

    for (const [i, r] of this.ripples.entries()) {
      r.setPosition(river.x, river.y);
      r.setSize(river.w, river.h);
      r.setTileScale((c / 64) * (i === 0 ? 1 : 0.7));
    }
    this.frozen.setPosition(river.x, river.y).setSize(river.w, river.h);

    const o = this.over;
    o.clear();
    o.lineStyle(1, COLORS.laneLine, 0.35);
    for (let lane = 1; lane < cols - 2; lane++) {
      o.lineBetween(river.x + lane * c, river.y, river.x + lane * c, river.y + river.h);
    }
    o.lineStyle(3, COLORS.bankEdge, 1);
    o.lineBetween(river.x, river.y, river.x, river.y + river.h);
    o.lineBetween(river.x + river.w, river.y, river.x + river.w, river.y + river.h);
    // GD-12: sources above every lane.
    o.fillStyle(0xffffff, 0.55);
    for (let lane = 0; lane < cols - 2; lane++) {
      const x = river.x + (lane + 0.5) * c;
      o.fillTriangle(x - c * 0.12, f.y + 3, x + c * 0.12, f.y + 3, x, f.y + c * 0.14);
    }
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

    // Everything placed by cell moves to the new geometry.
    for (const img of this.obstacles.values()) img.destroy();
    this.obstacles.clear();
    for (const p of this.piers) {
      p.dock.destroy();
      p.face.destroy();
      p.order.destroy();
      p.badge.destroy();
    }
    this.piers = [];
    for (const v of this.items.values()) v.toX = Number.NaN;
    this.snapItems = true;
  }
}

/** Where an item is now: a field cell or a backwater slot. */
export function refOfItem(s: SimState, id: number | null): Ref | null {
  if (id === null) return null;
  for (let i = 0; i < s.grid.length; i++) {
    const c = s.grid[i];
    if (c?.kind === 'item' && c.item.id === id) {
      return { at: 'cell', col: i % s.cols, row: Math.floor(i / s.cols) };
    }
  }
  const slot = s.backwater.findIndex((it) => it?.id === id);
  return slot >= 0 ? { at: 'backwater', slot } : null;
}

function findItem(s: SimState, id: number | null): Item | null {
  const ref = refOfItem(s, id);
  if (!ref) return null;
  if (ref.at === 'backwater') return s.backwater[ref.slot] ?? null;
  const c = s.grid[ref.row * s.cols + ref.col];
  return c?.kind === 'item' ? c.item : null;
}
