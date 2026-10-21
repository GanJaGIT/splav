import { fitActiveArea } from './layout';

/** INP-06: no context menu, selection, drag of images, pinch or double-tap zoom. */
export function installInputGuards(): void {
  const prevent = (e: Event): void => e.preventDefault();
  window.addEventListener('contextmenu', prevent, { capture: true });
  document.addEventListener('selectstart', prevent);
  document.addEventListener('dragstart', prevent);
  // iOS Safari pinch gestures; double-tap zoom is off through touch-action in index.html.
  document.addEventListener('gesturestart', prevent);
  // A window taller than a short screen (encyclopedia, building) scrolls with the finger.
  document.addEventListener(
    'touchmove',
    (e) => {
      const box = e.target instanceof Element ? e.target.closest('.modal') : null;
      if (box && box.scrollHeight > box.clientHeight + 1) return;
      e.preventDefault();
    },
    { passive: false },
  );
}

/**
 * UI-13, UI-14: sizes the active area inside the safe-area viewport and reports its size.
 * Pausing on resize (UI-15) arrives with the level screen in Stage 2.
 */
export class Stage {
  private readonly listeners: ((w: number, h: number) => void)[] = [];
  // -1: the first fit always tells the listeners, even when the page has no size yet.
  width = -1;
  height = -1;

  constructor(
    private readonly viewport: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly desktop: boolean,
  ) {
    window.addEventListener('resize', () => this.fit());
    window.addEventListener('orientationchange', () => this.fit());
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.listeners.push(cb);
  }

  fit(): void {
    // The viewport padding holds the safe-area insets (UI-14).
    const css = getComputedStyle(this.viewport);
    const vw =
      this.viewport.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    const vh =
      this.viewport.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
    const { width, height } = fitActiveArea(vw, vh, this.desktop);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.stage.style.width = `${width}px`;
    this.stage.style.height = `${height}px`;
    for (const cb of this.listeners) cb(width, height);
  }
}
