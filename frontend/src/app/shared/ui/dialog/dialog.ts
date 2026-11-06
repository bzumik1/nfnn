import {
  afterNextRender,
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  Injector,
  OnDestroy,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { DialogAnnouncer } from './dialog-announcer';
import { DialogHistory, DialogHistoryListener } from './dialog-history';
import { DIALOG_PRESENTATION, DialogPresentation } from './dialog-presentation';
import { DIALOG_SUSPENSION } from './dialog-suspension';
import { SheetDrag } from './sheet-drag';

const ROOM_ABOVE_STICKY_ACTIONS_PX = 16;

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
  private readonly document = inject(DOCUMENT);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly drag = new SheetDrag();
  private readonly dragOffset = signal(0);
  protected readonly dragging = signal(false);
  protected readonly dragTranslate = computed(() => {
    const offset = this.dragOffset();
    return offset > 0 ? `0 ${offset}px` : null;
  });
  private readonly opener = this.document.activeElement;
  private readonly history = inject(DialogHistory);
  private readonly injector = inject(Injector);
  private readonly historyEntry: DialogHistoryListener = {
    stepBack: () => undefined,
    close: () => this.closedByBack(),
  };
  private readonly suspension = inject(DIALOG_SUSPENSION);
  private dragPointer: number | null = null;
  private pressStartedOnBackdrop = false;
  private destroyed = false;
  private viewReady = false;
  private steppedAside = false;

  constructor() {
    effect(() => {
      const suspended = this.suspension();
      untracked(() => this.follow(suspended));
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    if (this.suspension()) {
      this.steppedAside = true;
    } else {
      this.element().nativeElement.showModal();
    }
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
    } else {
      this.document.querySelector<HTMLElement>('main#obsah')?.focus({ preventScroll: true });
    }
  }

  protected dismiss(): void {
    if (this.dismissible()) {
      this.dismissed.emit();
    }
  }

  protected onClose(): void {
    if (this.steppedAside) {
      return;
    }
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
    if (!this.dismissible() || !event.isPrimary || event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragPointer = event.pointerId;
    this.drag.start(event.clientY, event.timeStamp);
    this.dragging.set(true);
  }

  protected followDrag(event: PointerEvent): void {
    if (this.dragging() && event.pointerId === this.dragPointer) {
      this.dragOffset.set(this.drag.move(event.clientY, event.timeStamp));
    }
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.dragging() || event.pointerId !== this.dragPointer) {
      return;
    }
    const height = this.panel().nativeElement.getBoundingClientRect().height;
    const release = this.drag.end(height, event.timeStamp);
    this.stopDrag();
    if (release === 'dismiss') {
      this.dismiss();
    }
  }

  protected cancelDrag(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) {
      return;
    }
    this.drag.cancel();
    this.stopDrag();
  }

  protected keepFocusAboveActions(event: FocusEvent): void {
    const target = event.target;
    const panel = this.panel().nativeElement;
    const actions = panel.querySelector<HTMLElement>('.ui-dialog__actions');
    if (!(target instanceof HTMLElement) || actions === null || actions.contains(target)) {
      return;
    }
    if (getComputedStyle(actions).position !== 'sticky') {
      return;
    }
    const covered = target.getBoundingClientRect().bottom - actions.getBoundingClientRect().top;
    if (covered > 0) {
      panel.scrollBy({ top: covered + ROOM_ABOVE_STICKY_ACTIONS_PX });
    }
  }

  private follow(suspended: boolean): void {
    if (!this.viewReady || this.destroyed) {
      return;
    }
    const dialog = this.element().nativeElement;
    if (suspended && !this.steppedAside) {
      this.steppedAside = true;
      if (dialog.open) {
        dialog.close();
      }
    } else if (!suspended && this.steppedAside) {
      this.steppedAside = false;
      if (!dialog.open) {
        dialog.showModal();
      }
    }
  }

  private stopDrag(): void {
    this.dragPointer = null;
    this.dragging.set(false);
    this.dragOffset.set(0);
  }

  private closedByBack(): void {
    if (!this.steppedAside) {
      this.dismiss();
    }
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
