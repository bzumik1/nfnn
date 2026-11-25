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

function offsetWithin(panel: HTMLElement, head: HTMLElement): number {
  const panelBox = panel.getBoundingClientRect();
  const scale =
    panelBox.height > 0 && panel.offsetHeight > 0 ? panelBox.height / panel.offsetHeight : 1;
  return (head.getBoundingClientRect().top - panelBox.top) / scale - panel.clientTop;
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
    });
  }
}
