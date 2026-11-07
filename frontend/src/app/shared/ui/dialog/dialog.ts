import { KeyboardAvoidance } from './keyboard-avoidance';
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
import { canPullSheetFrom, PullIntent, pullIntent, SheetDrag, TouchOrigin } from './sheet-drag';
import { InputModality } from '../../../core/input/input-modality';
import { CompactLayout } from '../../../core/layout/compact-layout';

const ROOM_ABOVE_STICKY_ACTIONS_PX = 16;
const LESS_MOTION = '(prefers-reduced-motion: reduce)';

type SheetExit = 'open' | 'sliding' | 'down';

let nextDialog = 0;

@Component({
  selector: 'app-dialog',
  imports: [KeyboardAvoidance],
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog implements AfterViewInit, OnDestroy {
  readonly labelledBy = input.required<string>();
  readonly describedBy = input<string | null>(null);
  readonly wide = input(false);
  readonly tall = input(false);
  readonly grouped = input(false);
  readonly presentation = input<DialogPresentation>('auto');
  readonly pushesHistory = input(true);
  readonly dismissible = input(true);
  readonly unsavedInput = input(false);
  readonly alert = input(false);
  readonly pulledAway = input(0);
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
  private readonly sheetPull = signal(0);
  protected readonly dragging = signal(false);
  private readonly exit = signal<SheetExit>('open');
  protected readonly leaving = computed(() => this.exit() !== 'open');
  protected readonly askingToDiscard = signal(false);
  protected readonly discardTitleId = `dialog-discard-title-${++nextDialog}`;
  protected readonly pull = computed(() => Math.max(this.pulledAway(), this.sheetPull()));
  protected readonly dragTranslate = computed(() => {
    if (this.leaving()) {
      return '0 100%';
    }
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
  private readonly layout = inject(CompactLayout);
  private readonly modality = inject(InputModality);
  private dragPointer: number | null = null;
  private touchOrigin: TouchOrigin | null = null;
  private touchIntent: PullIntent = 'content';
  private pressStartedOnBackdrop = false;
  private destroyed = false;
  private viewReady = false;
  private steppedAside = false;
  private entryTakenBackWhileLeaving = false;
  private slideTimer: ReturnType<typeof setTimeout> | undefined;

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
      this.showModal();
    }
    if (this.pushesHistory()) {
      this.history.open(this.historyEntry);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.slideTimer);
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
    if (!this.dismissible() || this.leaving()) {
      return;
    }
    if (this.slidesAway()) {
      this.slideAway();
    } else {
      this.dismissed.emit();
    }
  }

  protected onClose(): void {
    if (this.steppedAside) {
      return;
    }
    if (this.leaving()) {
      this.slidDown();
    } else if (this.dismissible()) {
      this.dismissed.emit();
    } else if (!this.destroyed) {
      this.element().nativeElement.showModal();
    }
  }

  protected onCancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
    } else if (event.cancelable && !this.leaving() && this.slidesAway()) {
      event.preventDefault();
      this.slideAway();
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
    if (!event.isPrimary || event.button !== 0 || this.leaving()) {
      return;
    }
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragPointer = event.pointerId;
    this.beginPull(event.clientY, event.timeStamp);
  }

  protected followDrag(event: PointerEvent): void {
    if (this.dragging() && event.pointerId === this.dragPointer) {
      this.pullTo(event.clientY, event.timeStamp);
    }
  }

  protected endDrag(event: PointerEvent): void {
    if (!this.dragging() || event.pointerId !== this.dragPointer) {
      return;
    }
    this.letGo(event.timeStamp);
  }

  protected cancelDrag(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointer) {
      return;
    }
    this.drag.cancel();
    this.stopDrag();
  }

  protected touchStarted(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      this.abandonTouch();
      return;
    }
    const target = event.target as Element;
    const panel = this.panel().nativeElement;
    const pullable =
      this.look() === 'sheet' &&
      this.layout.isCompact() &&
      !this.leaving() &&
      target.closest('.dialog-grabber') === null &&
      target.closest('.dialog-panel') === panel &&
      canPullSheetFrom(target, panel);
    if (!pullable) {
      this.abandonTouch();
      return;
    }
    const finger = event.touches[0];
    this.touchOrigin = { x: finger.clientX, y: finger.clientY, time: event.timeStamp };
    this.touchIntent = 'undecided';
  }

  protected touchMoved(event: TouchEvent): void {
    const origin = this.touchOrigin;
    if (origin === null || this.touchIntent === 'content' || event.touches.length !== 1) {
      return;
    }
    const finger = event.touches[0];
    if (this.touchIntent === 'undecided') {
      const intent = pullIntent(origin, finger.clientX, finger.clientY, event.timeStamp);
      if (intent === 'undecided') {
        if (finger.clientY >= origin.y) {
          event.preventDefault();
        }
        return;
      }
      this.touchIntent = intent;
      if (intent === 'content') {
        return;
      }
      this.beginPull(origin.y, origin.time);
    }
    event.preventDefault();
    this.pullTo(finger.clientY, event.timeStamp);
  }

  protected touchEnded(event: TouchEvent): void {
    if (event.touches.length > 0) {
      return;
    }
    const pulled = this.touchIntent === 'sheet' && this.dragging();
    this.touchOrigin = null;
    this.touchIntent = 'content';
    if (pulled) {
      this.letGo(event.timeStamp);
    }
  }

  protected abandonTouch(): void {
    if (this.touchIntent === 'sheet') {
      this.drag.cancel();
      this.stopDrag();
    }
    this.touchOrigin = null;
    this.touchIntent = 'content';
  }

  protected keepWriting(): void {
    this.askingToDiscard.set(false);
  }

  protected discard(): void {
    this.askingToDiscard.set(false);
    this.dismiss();
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

  private showModal(): void {
    const dialog = this.element().nativeElement;
    dialog.showModal();
    if (this.modality.lastPressByPointer() && dialog.querySelector('[autofocus]') === null) {
      dialog.focus({ preventScroll: true });
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
        this.showModal();
      }
    }
  }

  private beginPull(y: number, time: number): void {
    this.drag.start(y, time, !this.dismissible() || this.unsavedInput());
    this.dragging.set(true);
  }

  private pullTo(y: number, time: number): void {
    const offset = this.drag.move(y, time);
    this.dragOffset.set(offset);
    this.sheetPull.set(Math.min(1, offset / Math.max(1, this.panelHeight())));
  }

  private letGo(time: number): void {
    const height = this.panelHeight();
    const release = this.drag.end(height, time);
    this.stopDrag();
    if (release !== 'dismiss' || !this.dismissible()) {
      return;
    }
    if (this.unsavedInput()) {
      this.askingToDiscard.set(true);
    } else {
      this.dismiss();
    }
  }

  private slidesAway(): boolean {
    const view = this.document.defaultView;
    return (
      this.look() === 'sheet' &&
      this.layout.isCompact() &&
      !this.steppedAside &&
      this.element().nativeElement.open &&
      view?.matchMedia?.(LESS_MOTION).matches === false
    );
  }

  private slideAway(): void {
    this.exit.set('sliding');
    this.sheetPull.set(1);
    this.element().nativeElement.focus({ preventScroll: true });
    afterNextRender(
      () => {
        const panel = this.panel().nativeElement;
        const slide = longestTransitionMs(getComputedStyle(panel).transitionDuration);
        this.slideTimer = setTimeout(() => this.slidDown(), slide);
      },
      { injector: this.injector },
    );
  }

  private slidDown(): void {
    if (this.exit() !== 'sliding' || this.destroyed) {
      return;
    }
    clearTimeout(this.slideTimer);
    this.exit.set('down');
    this.dismissed.emit();
    afterNextRender(() => this.comeBackUp(), { injector: this.injector });
  }

  private comeBackUp(): void {
    if (this.destroyed) {
      return;
    }
    this.exit.set('open');
    this.sheetPull.set(0);
    if (!this.steppedAside && !this.element().nativeElement.open) {
      this.showModal();
    }
    if (this.entryTakenBackWhileLeaving) {
      this.entryTakenBackWhileLeaving = false;
      this.history.open(this.historyEntry);
    }
  }

  private panelHeight(): number {
    return this.panel().nativeElement.getBoundingClientRect().height;
  }

  private stopDrag(): void {
    this.dragPointer = null;
    this.dragging.set(false);
    this.dragOffset.set(0);
    this.sheetPull.set(0);
  }

  private closedByBack(): void {
    if (!this.steppedAside) {
      this.dismiss();
    }
    if (this.leaving()) {
      this.entryTakenBackWhileLeaving = true;
      return;
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

function longestTransitionMs(durations: string): number {
  return Math.max(
    0,
    ...durations
      .split(',')
      .map((duration) => duration.trim())
      .filter((duration) => duration !== '')
      .map((duration) =>
        duration.endsWith('ms') ? parseFloat(duration) : parseFloat(duration) * 1000,
      )
      .filter((milliseconds) => Number.isFinite(milliseconds)),
  );
}
