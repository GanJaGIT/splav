/**
 * INP-01, INP-02, INP-07, GD-30…GD-33: the player's hands on the field, through Pointer Events
 * (mouse, touch and pen alike). Pressing an item grabs it. Moving it more than 8 px drags it;
 * releasing without moving selects it, and the next touch drops it there (tap-tap). Only the first
 * finger counts; interface elements sit above the field, so their touches never reach it.
 */

import type { Ref, SimState } from '../sim';
import { refOfItem, type FieldScene } from './FieldScene';
import type { LevelSession } from './session';

const TAP_SLOP = 8;
/** INP-01: a dragged item is drawn this far above the finger so it stays visible. */
export const FINGER_OFFSET = 28;

export interface InputDeps {
  session(): LevelSession | null;
  /** A window covers the field or the game is paused. */
  blocked(): boolean;
  /** The first user gesture unlocks sound (SND-03). */
  gesture(): void;
  /** INP-04: the Hook waits for a rock or a snag. */
  hookArmed(): boolean;
  hookTarget(ref: Ref | null): void;
  /** A drop was made by the player (LD-08 tempo counter). */
  dropped(): void;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'press'; id: number; sx: number; sy: number; touch: boolean }
  | { kind: 'drag'; id: number; touch: boolean }
  | { kind: 'selected'; id: number }
  | { kind: 'second'; id: number; sx: number; sy: number; touch: boolean; moved: boolean }
  | { kind: 'releasing'; id: number };

export class FieldInput {
  private pointerId: number | null = null;
  private mode: Mode = { kind: 'idle' };

  constructor(
    private readonly el: HTMLElement,
    private readonly scene: FieldScene,
    private readonly deps: InputDeps,
  ) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.cancel(e));
  }

  /** Forgets the gesture in progress (pause, level change). The held item is returned elsewhere. */
  reset(): void {
    if (this.pointerId !== null) this.capture(this.pointerId, false);
    this.pointerId = null;
    this.mode = { kind: 'idle' };
    this.scene.setHeld(null);
  }

  /** After every tick: the grab was refused, the hand timed out or the drop was applied. */
  onTick(s: SimState): void {
    if (this.mode.kind === 'idle') return;
    const handId = s.hand?.item.id ?? null;
    if (this.mode.kind === 'releasing' || handId !== this.mode.id) {
      if (this.pointerId !== null) this.capture(this.pointerId, false);
      this.pointerId = null;
      this.mode = { kind: 'idle' };
      this.scene.setHeld(null);
    }
  }

  private point(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private capture(id: number, on: boolean): void {
    try {
      if (on) this.el.setPointerCapture(id);
      else if (this.el.hasPointerCapture(id)) this.el.releasePointerCapture(id);
    } catch {
      // Synthetic pointers (tests) cannot be captured; the field's own events still arrive.
    }
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.pointerId !== null) return; // INP-07: the first finger only
    this.deps.gesture();
    const session = this.deps.session();
    if (!session || this.deps.blocked() || session.state.status !== 'playing') return;
    const p = this.point(e);
    if (this.deps.hookArmed()) {
      this.deps.hookTarget(this.scene.cellRefAt(p.x, p.y));
      return;
    }
    const touch = e.pointerType !== 'mouse';
    if (this.mode.kind === 'selected') {
      this.pointerId = e.pointerId;
      this.capture(e.pointerId, true);
      this.mode = { kind: 'second', id: this.mode.id, sx: p.x, sy: p.y, touch, moved: false };
      return;
    }
    if (this.mode.kind !== 'idle') return;
    const id = this.scene.itemAt(p.x, p.y);
    const ref = refOfItem(session.state, id);
    if (id === null || !ref) return;
    this.pointerId = e.pointerId;
    this.capture(e.pointerId, true);
    session.queue({ type: 'grab', ref });
    this.mode = { kind: 'press', id, sx: p.x, sy: p.y, touch };
    this.scene.setHeld({ id, x: p.x, y: p.y, dragging: false });
  }

  private move(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    const p = this.point(e);
    const m = this.mode;
    if (m.kind === 'press' && Math.hypot(p.x - m.sx, p.y - m.sy) > TAP_SLOP) {
      this.mode = { kind: 'drag', id: m.id, touch: m.touch };
    } else if (m.kind === 'second' && !m.moved && Math.hypot(p.x - m.sx, p.y - m.sy) > TAP_SLOP) {
      m.moved = true;
    }
    const n = this.mode;
    if (n.kind === 'drag' || (n.kind === 'second' && n.moved)) {
      this.scene.setHeld({
        id: n.id,
        x: p.x,
        y: p.y - (n.touch ? FINGER_OFFSET : 0),
        dragging: true,
      });
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.capture(e.pointerId, false);
    const session = this.deps.session();
    const m = this.mode;
    if (!session) return this.reset();
    if (m.kind === 'press') {
      // GD-33: a tap selects; the item waits in the hand at its place.
      this.mode = { kind: 'selected', id: m.id };
      this.scene.setHeld({ id: m.id, x: m.sx, y: m.sy, dragging: false });
      return;
    }
    if (m.kind !== 'drag' && m.kind !== 'second') return;
    const p = this.point(e);
    const dragging = m.kind === 'drag' || m.moved;
    const at = { x: p.x, y: p.y - (dragging && m.touch ? FINGER_OFFSET : 0) };
    const ref = this.scene.refAt(at.x, at.y, m.id);
    session.queue({ type: 'drop', ref });
    this.deps.dropped();
    this.mode = { kind: 'releasing', id: m.id };
    this.scene.setHeld({ id: m.id, x: at.x, y: at.y, dragging });
  }

  private cancel(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    const m = this.mode;
    if (m.kind === 'press' || m.kind === 'drag' || m.kind === 'second') {
      this.deps.session()?.queue({ type: 'cancel' });
      this.mode = { kind: 'releasing', id: m.id };
    }
  }
}
