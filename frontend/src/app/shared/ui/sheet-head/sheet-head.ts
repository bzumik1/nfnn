import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  InjectionToken,
  Injector,
  input,
  linkedSignal,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { InputModality } from '../../../core/input/input-modality';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { isTextEntry } from '../../../core/layout/soft-keyboard';
import { motionAllowed, PageTransitions } from '../../../core/navigation/page-transitions';

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
    if (pressedByPointer() && wasPressed(focused) && !takesText(focused)) {
      if (focused.getBoundingClientRect().bottom > head.getBoundingClientRect().bottom) {
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

const FADE_DURATION = '--duration-fast';
const FADE_EASE = '--ease-standard';

@Component({
  selector: 'app-sheet-head',
  templateUrl: './sheet-head.html',
  styleUrl: './sheet-head.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetHead {
  readonly title = input.required<string>();
  readonly lateTitle = input<string | null>(null);
  readonly titleId = input<string | null>(null);
  readonly backPressed = output<void>();
  readonly closePressed = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly stepping = inject(PageTransitions).stepping;
  private readonly compact = inject(CompactLayout).isCompact;
  private readonly shownTitle = viewChild<ElementRef<HTMLElement>>('shownTitle');
  protected readonly shown = linkedSignal(() => this.title());
  private fades: Animation[] = [];
  private fadingTo: string | null = null;
  private lettingGo: number | null = null;

  constructor() {
    effect(() => {
      this.title();
      untracked(() => this.letFadeGo());
    });
    effect(() => {
      const late = this.lateTitle();
      const stepping = this.stepping();
      const compact = this.compact();
      untracked(() => this.follow(late, stepping, compact));
    });
    const head = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.stopLettingGo());
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

  private follow(late: string | null, stepping: boolean, compact: boolean): void {
    this.stopLettingGo();
    if (late === null) {
      if (!stepping) {
        this.letGoNextFrame();
      }
      return;
    }
    if (!compact) {
      this.letFadeGo();
      this.shown.set(late);
      return;
    }
    if (stepping || late === this.shown() || late === this.fadingTo) {
      return;
    }
    this.fadeTo(late);
  }

  private fadeTo(late: string): void {
    const element = this.shownTitle()?.nativeElement;
    const view = this.document.defaultView;
    if (
      element === undefined ||
      view === null ||
      typeof element.animate !== 'function' ||
      !motionAllowed(view)
    ) {
      this.letFadeGo();
      this.shown.set(late);
      return;
    }
    this.letFadeGo();
    const timing = this.fadeTiming(view);
    const out = element.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    this.fades = [out];
    this.fadingTo = late;
    out.finished
      .then(() => {
        if (this.fadingTo !== late) {
          return;
        }
        this.shown.set(late);
        afterNextRender(
          () => {
            if (this.fadingTo !== late) {
              return;
            }
            const into = element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
            out.cancel();
            this.fades = [into];
            void into.finished.then(
              () => this.fadeEnded(late),
              () => this.fadeEnded(late),
            );
          },
          { injector: this.injector },
        );
      })
      .catch(() => this.fadeEnded(late));
  }

  private fadeTiming(view: Window): KeyframeAnimationOptions {
    const root = view.getComputedStyle(this.document.documentElement);
    const token = root.getPropertyValue(FADE_DURATION).trim();
    const value = Number.parseFloat(token);
    const duration = Number.isFinite(value) ? (token.endsWith('ms') ? value : value * 1000) : 0;
    const easing = root.getPropertyValue(FADE_EASE).trim();
    return { duration: duration / 2, ...(easing === '' ? {} : { easing }) };
  }

  private fadeEnded(late: string): void {
    if (this.fadingTo === late) {
      this.fadingTo = null;
      this.fades = [];
    }
  }

  private letGoNextFrame(): void {
    const view = this.document.defaultView;
    if (view === null) {
      this.showOwnTitle();
      return;
    }
    this.lettingGo = view.requestAnimationFrame(() => {
      this.lettingGo = null;
      if (this.lateTitle() === null && !this.stepping()) {
        this.showOwnTitle();
      }
    });
  }

  private stopLettingGo(): void {
    if (this.lettingGo !== null) {
      this.document.defaultView?.cancelAnimationFrame(this.lettingGo);
      this.lettingGo = null;
    }
  }

  private showOwnTitle(): void {
    this.letFadeGo();
    this.shown.set(this.title());
  }

  private letFadeGo(): void {
    this.fadingTo = null;
    this.fades.splice(0).forEach((fade) => fade.cancel());
  }
}
