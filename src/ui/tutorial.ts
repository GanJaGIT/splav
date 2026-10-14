import { el } from './hud';

/**
 * TUT-01, TUT-03: an animated hand that drags from one cell to another, and a short hint.
 * It never takes touches: the player acts on the field under it.
 */
export class TutorialHand {
  private readonly hand: HTMLElement;
  private readonly hint: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.hand = el(
      'div',
      'tut-hand',
      '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 44c-4-3-9-10-11-14-1-2 1-4 3-3l5 4V8a3 3 0 0 1 6 0v14h1V5a3 3 0 0 1 6 0v17h1V8a3 3 0 0 1 6 0v15h1v-9a3 3 0 0 1 6 0v16c0 8-4 14-9 14z"/></svg>',
    );
    this.hand.dataset.ui = 'tutorial-hand';
    this.hint = el('div', 'tut-text');
    this.hint.dataset.ui = 'tutorial-text';
    this.hand.hidden = true;
    this.hint.hidden = true;
    root.append(this.hand, this.hint);
  }

  /** Shows the drag from `from` to `to` (stage coordinates) and the hint above `top`. */
  show(
    from: { x: number; y: number } | null,
    to: { x: number; y: number } | null,
    text: string,
    top: number,
  ): void {
    window.clearTimeout(this.timer);
    this.hint.textContent = text;
    this.hint.style.top = `${Math.max(48, top)}px`;
    this.hint.hidden = false;
    if (from && to) {
      this.hand.style.setProperty('--fx', `${from.x}px`);
      this.hand.style.setProperty('--fy', `${from.y}px`);
      this.hand.style.setProperty('--tx', `${to.x}px`);
      this.hand.style.setProperty('--ty', `${to.y}px`);
      this.hand.hidden = false;
    } else {
      this.hand.hidden = true;
    }
  }

  /** Hides after a while (a hint shown again from the Pause menu). */
  hideAfter(ms: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.hand.hidden = true;
    this.hint.hidden = true;
  }

  visible(): boolean {
    return !this.hint.hidden;
  }
}
