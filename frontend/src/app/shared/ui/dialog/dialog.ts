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
  viewChild,
} from '@angular/core';

import { DialogAnnouncer } from './dialog-announcer';
import { DialogHistory, DialogHistoryListener } from './dialog-history';
import { DIALOG_PRESENTATION, DialogPresentation } from './dialog-presentation';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog implements AfterViewInit, OnDestroy {
  readonly labelledBy = input.required<string>();
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
  private readonly opener = this.document.activeElement;
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
