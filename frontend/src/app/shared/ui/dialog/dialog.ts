import {
  afterNextRender,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  ElementRef,
  Injector,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { DialogAnnouncer } from './dialog-announcer';
import { DialogHistory, DialogHistoryListener } from './dialog-history';
import { DIALOG_PRESENTATION, DialogPresentation } from './dialog-presentation';
import { SheetDrag } from './sheet-drag';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog implements AfterViewInit, OnDestroy {
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly wide = input(false);
  readonly presentation = input<DialogPresentation>('auto');
  readonly pushesHistory = input(true);
  readonly dismissible = input(true);
  readonly dismissed = output<void>();
  protected readonly announcer = inject(DialogAnnouncer);

  private readonly areaPresentation = inject(DIALOG_PRESENTATION);
  protected readonly look = computed(() => {
    const chosen = this.presentation();
    return chosen === 'auto' ? this.areaPresentation : chosen;
  });

  private readonly element = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly drag = new SheetDrag();
  private readonly dragOffset = signal(0);
  protected readonly dragging = signal(false);
  protected readonly dragTranslate = computed(() => {
    const offset = this.dragOffset();
    return offset > 0 ? `0 ${offset}px` : null;
  });
  private readonly opener = inject(DOCUMENT).activeElement;
  private readonly history = inject(DialogHistory);
  private readonly injector = inject(Injector);
  private readonly historyEntry: DialogHistoryListener = {
    stepBack: () => undefined,
    close: () => this.closedByBack(),
  };
  private pressStartedOnBackdrop = false;
  private destroyed = false;

  ngAfterViewInit(): void {
    this.element().nativeElement.showModal();
    if (this.pushesHistory()) {
      this.history.open(this.historyEntry);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.pushesHistory()) {
      this.history.close(this.historyEntry);
    }
    const dialog = this.element().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    if (this.opener instanceof HTMLElement && this.opener.isConnected) {
      this.opener.focus();
    }
  }

  protected dismiss(): void {
    if (this.dismissible()) {
      this.dismissed.emit();
    }
  }

  protected onClose(): void {
    if (this.dismissible()) {
      this.dismissed.emit();
    } else if (!this.destroyed) {
      this.element().nativeElement.showModal();
    }
  }

  protected onCancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
    }
  }

  protected onPointerDown(event: Event): void {
    this.pressStartedOnBackdrop = event.target === this.element().nativeElement;
  }

  protected onClick(event: Event): void {
    if (this.pressStartedOnBackdrop && event.target === this.element().nativeElement) {
      this.dismiss();
    }
    this.pressStartedOnBackdrop = false;
  }

  protected startDrag(event: PointerEvent): void {
    if (!this.dismissible() || !event.isPrimary) {
      return;
    }
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.drag.start(event.clientY, event.timeStamp);
    this.dragging.set(true);
  }

  protected followDrag(event: PointerEvent): void {
    if (this.dragging()) {
      this.dragOffset.set(this.drag.move(event.clientY, event.timeStamp));
    }
  }

  protected endDrag(): void {
    if (!this.dragging()) {
      return;
    }
    const release = this.drag.end(this.panel().nativeElement.getBoundingClientRect().height);
    this.dragging.set(false);
    this.dragOffset.set(0);
    if (release === 'dismiss') {
      this.dismiss();
    }
  }

  protected cancelDrag(): void {
    this.drag.end(Number.POSITIVE_INFINITY);
    this.dragging.set(false);
    this.dragOffset.set(0);
  }

  private closedByBack(): void {
    this.dismiss();
    afterNextRender(
      () => {
        if (!this.destroyed) {
          this.history.open(this.historyEntry);
        }
      },
      { injector: this.injector },
    );
  }
}
