import { el } from './hud';

/** A short note at the top of the screen (a new encyclopedia item). Never blocks touches. */
export class Toast {
  private readonly node: HTMLElement;
  private timer = 0;

  constructor(root: HTMLElement) {
    this.node = el('div', 'toast');
    this.node.dataset.ui = 'toast';
    this.node.hidden = true;
    root.appendChild(this.node);
  }

  show(text: string, image: string | null = null, ms = 2200): void {
    window.clearTimeout(this.timer);
    this.node.replaceChildren();
    if (image) {
      const img = el('img', 'toast-image');
      img.src = image;
      img.alt = '';
      this.node.appendChild(img);
    }
    const span = el('span');
    span.textContent = text;
    this.node.appendChild(span);
    this.node.hidden = false;
    this.timer = window.setTimeout(() => (this.node.hidden = true), ms);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.node.hidden = true;
  }
}
