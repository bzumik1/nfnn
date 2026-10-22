import {
  AfterViewInit,
  Component,
  DOCUMENT,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-dialog',
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
})
export class Dialog implements AfterViewInit, OnDestroy {
  readonly labelledBy = input.required<string>();
  readonly wide = input(false);
  readonly dismissed = output<void>();

  private readonly element = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly opener = inject(DOCUMENT).activeElement;
  private pressStartedOnBackdrop = false;

  ngAfterViewInit(): void {
    this.element().nativeElement.showModal();
  }

  ngOnDestroy(): void {
    const dialog = this.element().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    if (this.opener instanceof HTMLElement && this.opener.isConnected) {
      this.opener.focus();
    }
  }

  protected dismiss(): void {
    this.dismissed.emit();
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
}
