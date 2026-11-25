import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  InjectionToken,
  input,
  output,
} from '@angular/core';
import { InputModality } from '../../../core/input/input-modality';
import { isTextEntry } from '../../../core/layout/soft-keyboard';

const SHEET_PANEL = '.dialog-panel';
const HEIGHT = '--sheet-head-height';
const PADDING_TOP = 'scroll-padding-top';

function offsetWithin(panel: HTMLElement, head: HTMLElement): number {
  const panelBox = panel.getBoundingClientRect();
  const scale =
    panelBox.height > 0 && panel.offsetHeight > 0 ? panelBox.height / panel.offsetHeight : 1;
  return (head.getBoundingClientRect().top - panelBox.top) / scale - panel.clientTop;
}

function takesText(element: Element): boolean {
  return isTextEntry(element);
}

function keepFocusClearOfHead(
  panel: HTMLElement,
  head: HTMLElement,
  view: Window,
  pressedByPointer: () => boolean,
): () => void {
  let pending = 0;
  let restoring = 0;
  const uncover = (focused: HTMLElement) => {
    if (focused.ownerDocument.activeElement !== focused) {
      return;
    }
    const margin = parseFloat(view.getComputedStyle(focused).scrollMarginTop) || 0;
    const covered =
      head.getBoundingClientRect().bottom - (focused.getBoundingClientRect().top - margin);
    if (covered > 0) {
      panel.scrollBy({ top: -covered, behavior: 'instant' });
    }
  };
  const holdStillForTwoFrames = (focused: HTMLElement) => {
    panel.style.setProperty(PADDING_TOP, '0px');
    view.cancelAnimationFrame(restoring);
    restoring = view.requestAnimationFrame(() => {
      restoring = view.requestAnimationFrame(() => {
        if (!head.contains(focused.ownerDocument.activeElement)) {
          panel.style.removeProperty(PADDING_TOP);
        }
      });
    });
  };
  let lastPressed: Node | null = null;
  const pressed = (event: Event) => {
    lastPressed = event.target instanceof Node ? event.target : null;
  };
  const wasPressed = (focused: HTMLElement) =>
    lastPressed !== null && (focused === lastPressed || focused.contains(lastPressed));
  const ofItsOwnPanel = (focused: HTMLElement) =>
    focused.closest(SHEET_PANEL) === panel && focused.closest('dialog') === panel.closest('dialog');
  const focusEntered = (event: FocusEvent) => {
    const focused = event.target;
    if (!(focused instanceof HTMLElement) || focused === panel) {
      return;
    }
    if (head.contains(focused)) {
      panel.style.setProperty(PADDING_TOP, '0px');
      return;
    }
    if (!ofItsOwnPanel(focused)) {
      return;
    }
    if (pressedByPointer() && wasPressed(focused)) {
      if (
        !takesText(focused) &&
        focused.getBoundingClientRect().bottom > head.getBoundingClientRect().bottom
      ) {
        holdStillForTwoFrames(focused);
      }
      return;
    }
    view.cancelAnimationFrame(pending);
    pending = view.requestAnimationFrame(() => uncover(focused));
  };
  const focusLeft = (event: FocusEvent) => {
    if (!(event.relatedTarget instanceof Node && head.contains(event.relatedTarget))) {
      panel.style.removeProperty(PADDING_TOP);
    }
  };
  panel.addEventListener('pointerdown', pressed, { capture: true, passive: true });
  panel.addEventListener('focusin', focusEntered);
  panel.addEventListener('focusout', focusLeft);
  return () => {
    view.cancelAnimationFrame(pending);
    view.cancelAnimationFrame(restoring);
    panel.removeEventListener('pointerdown', pressed, { capture: true });
    panel.removeEventListener('focusin', focusEntered);
    panel.removeEventListener('focusout', focusLeft);
    panel.style.removeProperty(PADDING_TOP);
  };
}

export const SHEET_HEAD_RESIZE_OBSERVER = new InjectionToken<typeof ResizeObserver | null>(
  'SHEET_HEAD_RESIZE_OBSERVER',
  { providedIn: 'root', factory: () => inject(DOCUMENT).defaultView?.ResizeObserver ?? null },
);

@Component({
  selector: 'app-sheet-head',
  templateUrl: './sheet-head.html',
  styleUrl: './sheet-head.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetHead {
  readonly title = input.required<string>();
  readonly titleId = input<string | null>(null);
  readonly backPressed = output<void>();
  readonly closePressed = output<void>();

  constructor() {
    const head = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    const Observer = inject(SHEET_HEAD_RESIZE_OBSERVER);
    const view = inject(DOCUMENT).defaultView;
    const modality = inject(InputModality);
    afterNextRender(() => {
      const panel = head.closest<HTMLElement>(SHEET_PANEL);
      if (panel === null) {
        return;
      }
      let headHeight = head.offsetHeight;
      const publish = () =>
        panel.style.setProperty(HEIGHT, `${Math.ceil(offsetWithin(panel, head) + headHeight)}px`);
      if (Observer === null) {
        publish();
      } else {
        const observer = new Observer((entries) => {
          const measured = entries.filter((entry) => entry.target === head).at(-1)
            ?.borderBoxSize?.[0];
          if (measured !== undefined) {
            headHeight = measured.blockSize;
          }
          publish();
        });
        observer.observe(head);
        observer.observe(panel);
        destroyRef.onDestroy(() => observer.disconnect());
      }
      destroyRef.onDestroy(() => panel.style.removeProperty(HEIGHT));
      if (view !== null) {
        destroyRef.onDestroy(
          keepFocusClearOfHead(panel, head, view, () => modality.lastPressByPointer()),
        );
      }
    });
  }
}
