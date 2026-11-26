import { computed, DestroyRef, DOCUMENT, inject, Injectable, signal } from '@angular/core';

export const KEYBOARD_OPEN_CLASS = 'keyboard-open';

const VIEW_TOP = '--visual-viewport-top';
const VIEW_HEIGHT = '--visual-viewport-height';
const SMALLEST_KEYBOARD_PX = 150;
const UNZOOMED_SCALE_SLACK = 0.01;

export interface VisibleArea {
  readonly top: number;
  readonly height: number;
}

export function isTextEntry(element: Element | null): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }
  if (element instanceof HTMLInputElement) {
    return !NOT_TYPED_INTO.has(element.type) && !element.readOnly && !element.disabled;
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

const NOT_TYPED_INTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

@Injectable({ providedIn: 'root' })
export class SoftKeyboard {
  private readonly document = inject(DOCUMENT);
  private readonly visible = signal<VisibleArea | null>(null);

  readonly visibleArea = this.visible.asReadonly();
  readonly isOpen = computed(() => this.visible() !== null);

  constructor() {
    const view = this.document.defaultView;
    const viewport = view?.visualViewport;
    if (!view || !viewport) {
      return;
    }
    const update = () => this.update(view, viewport);
    const updateAfterFocusMoves = () => queueMicrotask(update);
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    this.document.addEventListener('focusin', update);
    this.document.addEventListener('focusout', updateAfterFocusMoves);
    update();
    inject(DestroyRef).onDestroy(() => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      this.document.removeEventListener('focusin', update);
      this.document.removeEventListener('focusout', updateAfterFocusMoves);
      this.document.documentElement.style.removeProperty(VIEW_TOP);
      this.document.documentElement.style.removeProperty(VIEW_HEIGHT);
      this.show(null);
    });
  }

  private update(view: Window, viewport: VisualViewport): void {
    this.follow(view, viewport);
    const typing = isTextEntry(this.document.activeElement);
    const keyboardHeight = view.innerHeight - viewport.height;
    if (typing && keyboardHeight >= SMALLEST_KEYBOARD_PX) {
      this.show({ top: viewport.offsetTop, height: viewport.height });
    } else {
      this.show(null);
    }
  }

  private follow(view: Window, viewport: VisualViewport): void {
    const style = this.document.documentElement.style;
    const unzoomed = Math.abs(viewport.scale - 1) <= UNZOOMED_SCALE_SLACK;
    const panned = viewport.offsetTop !== 0 || viewport.height !== view.innerHeight;
    if (!unzoomed || !panned) {
      style.removeProperty(VIEW_TOP);
      style.removeProperty(VIEW_HEIGHT);
      return;
    }
    const top = `${viewport.offsetTop}px`;
    const height = `${viewport.height}px`;
    if (style.getPropertyValue(VIEW_TOP) !== top) {
      style.setProperty(VIEW_TOP, top);
    }
    if (style.getPropertyValue(VIEW_HEIGHT) !== height) {
      style.setProperty(VIEW_HEIGHT, height);
    }
  }

  private show(area: VisibleArea | null): void {
    const current = this.visible();
    if (current?.top === area?.top && current?.height === area?.height) {
      return;
    }
    this.document.documentElement.classList.toggle(KEYBOARD_OPEN_CLASS, area !== null);
    this.visible.set(area);
  }
}
