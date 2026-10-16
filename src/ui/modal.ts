import { el, ICONS } from './hud';

/** UI-05, UI-09: in-game windows over the level. Never alert/confirm/prompt. */

export interface ModalButton {
  ui: string;
  label: string;
  primary?: boolean;
  /** YG-11: the button shows a video ad; the icon makes that clear. */
  video?: boolean;
  disabled?: boolean;
  onClick(): void;
}

export interface ModalSpec {
  ui: string;
  title: string;
  /** Plain text under the title. */
  text?: string;
  content?: HTMLElement;
  buttons: ModalButton[];
}

export class Modals {
  private node: HTMLElement | null = null;
  private currentUi: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly opened: () => void,
    private readonly closed: () => void,
    private readonly click: () => void,
  ) {}

  current(): string | null {
    return this.currentUi;
  }

  open(spec: ModalSpec): void {
    const wasOpen = this.node !== null;
    this.node?.remove();
    const backdrop = el('div', 'modal-backdrop');
    backdrop.dataset.ui = spec.ui;
    const box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = el('h2', 'modal-title');
    title.textContent = spec.title;
    box.appendChild(title);
    if (spec.text) {
      const text = el('p', 'modal-text');
      text.textContent = spec.text;
      box.appendChild(text);
    }
    if (spec.content) box.appendChild(spec.content);
    const buttons = el('div', 'modal-buttons');
    for (const b of spec.buttons) {
      const btn = el(
        'button',
        `modal-button${b.primary ? ' primary' : ''}`,
        b.video ? ICONS.video : '',
      );
      btn.type = 'button';
      btn.dataset.ui = b.ui;
      btn.disabled = b.disabled === true;
      const label = el('span', 'modal-button-label');
      label.textContent = b.label;
      btn.appendChild(label);
      btn.addEventListener('click', () => {
        this.click();
        b.onClick();
      });
      buttons.appendChild(btn);
    }
    box.appendChild(buttons);
    backdrop.appendChild(box);
    this.root.appendChild(backdrop);
    this.node = backdrop;
    this.currentUi = spec.ui;
    if (!wasOpen) this.opened();
  }

  close(): void {
    if (!this.node) return;
    this.node.remove();
    this.node = null;
    this.currentUi = null;
    this.closed();
  }
}
