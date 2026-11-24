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

const SHEET_PANEL = '.dialog-panel';
const HEIGHT = '--sheet-head-height';

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
    afterNextRender(() => {
      const panel = head.closest<HTMLElement>(SHEET_PANEL);
      if (panel === null) {
        return;
      }
      const publish = () => panel.style.setProperty(HEIGHT, `${head.offsetHeight}px`);
      publish();
      if (Observer !== null) {
        const observer = new Observer(publish);
        observer.observe(head);
        destroyRef.onDestroy(() => observer.disconnect());
      }
      destroyRef.onDestroy(() => panel.style.removeProperty(HEIGHT));
    });
  }
}
