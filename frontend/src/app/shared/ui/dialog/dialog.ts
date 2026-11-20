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
import { Appearance } from '../../../core/appearance/appearance';
import { InputModality } from '../../../core/input/input-modality';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { EDGE_SWIPE_DRAGGING_CLASS } from '../../../core/navigation/edge-swipe-back';

const ROOM_ABOVE_STICKY_ACTIONS_PX = 16;
const LESS_MOTION = '(prefers-reduced-motion: reduce)';
const CLOSING_GRACE_MS = 300;
const SHEET_DURATION = '--duration-sheet';
const REPAINTING = 'dialog--repainting';

type Exit = 'open' | 'leaving' | 'gone';

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
  readonly depth = input(0);
  readonly showsClose = input(true);
  readonly dismissed = output<void>();
  readonly steppedBack = output<void>();
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
  private readonly exit = signal<Exit>('open');
  protected readonly settleEasing = signal<string | null>(null);
  protected readonly leaving = computed(() => this.exit() !== 'open');
  protected readonly askingToDiscard = signal(false);
  protected readonly discardTitleId = `dialog-discard-title-${++nextDialog}`;
  protected readonly pull = computed(() => Math.max(this.pulledAway(), this.sheetPull()));
  protected readonly dragTranslate = computed(() => {
    if (this.leaving()) {
      return null;
    }
    const offset = this.dragOffset();
    return offset > 0 ? `0 ${offset}px` : null;
  });
  private readonly opener = this.document.activeElement;
  private readonly history = inject(DialogHistory);
  private readonly injector = inject(Injector);
  private readonly historyEntry: DialogHistoryListener = {
    stepBack: () => this.steppedBackByHistory(),
    close: () => this.closedByBack(),
  };
  private readonly suspension = inject(DIALOG_SUSPENSION);
  private readonly layout = inject(CompactLayout);
  private readonly modality = inject(InputModality);
  private readonly appearance = inject(Appearance);
  private dragPointer: number | null = null;
  private touchOrigin: TouchOrigin | null = null;
  private touchIntent: PullIntent = 'content';
  private pressStartedOnBackdrop = false;
  private pressTarget: EventTarget | null = null;
  private focusingItself = false;
  private destroyed = false;
  private viewReady = false;
  private steppedAside = false;
  private entryTakenBackWhileLeaving = false;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const suspended = this.suspension();
      untracked(() => this.follow(suspended));
    });
    effect(() => {
      const depth = this.depth();
      untracked(() => this.showDepth(depth));
    });
    let shownAppearance: boolean | null = null;
    effect(() => {
      const dark = this.appearance.dark();
      if (shownAppearance !== null && shownAppearance !== dark) {
        untracked(() => this.repaintStatusBar());
      }
      shownAppearance = dark;
    });
  }

  private repaintStatusBar(): void {
    const dialog = this.element().nativeElement;
    const view = this.document.defaultView;
    if (!this.viewReady || !dialog.open || view === null || dialog.classList.contains(REPAINTING)) {
      return;
    }
    const focused = this.document.activeElement;
    dialog.classList.add(REPAINTING);
    view.requestAnimationFrame(() =>
      view.requestAnimationFrame(() => {
        dialog.classList.remove(REPAINTING);
        if (focused instanceof HTMLElement && dialog.contains(focused)) {
          focused.focus({ preventScroll: true });
        }
      }),
    );
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
      this.showDepth(this.depth());
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.leaveTimer);
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

  dismiss(): void {
    if (!this.dismissible() || this.leaving()) {
      return;
    }
    if (this.closesWithMotion()) {
      this.startLeaving();
    } else {
      this.dismissed.emit();
    }
  }

  protected onClose(): void {
    if (this.steppedAside) {
      return;
    }
    if (this.leaving()) {
      this.finishLeaving();
    } else if (this.dismissible()) {
      this.dismissed.emit();
    } else if (!this.destroyed) {
      this.element().nativeElement.showModal();
    }
  }

  protected onCancel(event: Event): void {
    if (!this.dismissible()) {
      event.preventDefault();
    } else if (event.cancelable && !this.leaving() && this.closesWithMotion()) {
      event.preventDefault();
      this.startLeaving();
    }
  }

  protected onPointerDown(event: Event): void {
    this.pressStartedOnBackdrop = event.target === this.element().nativeElement;
    this.pressTarget = event.target;
  }

  protected onClick(event: Event): void {
    if (this.pressStartedOnBackdrop && event.target === this.element().nativeElement) {
      this.dismiss();
    }
    this.forgetPress();
  }

  protected forgetPress(): void {
    this.pressStartedOnBackdrop = false;
    this.pressTarget = null;
  }

  protected keepFocusOnPressedControl(event: FocusEvent): void {
    const dialog = this.element().nativeElement;
    const control = event.relatedTarget;
    if (
      event.target !== dialog ||
      this.focusingItself ||
      !(control instanceof HTMLElement) ||
      control === dialog ||
      !control.isConnected ||
      !dialog.contains(control) ||
      control.matches(':disabled') ||
      control.closest('[inert]') !== null ||
      this.pressLandedOutside(control)
    ) {
      return;
    }
    control.focus({ preventScroll: true });
  }

  private pressLandedOutside(control: HTMLElement): boolean {
    const pressed = this.pressTarget;
    return pressed instanceof Node && !control.contains(pressed);
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
    if (this.document.documentElement.classList.contains(EDGE_SWIPE_DRAGGING_CLASS)) {
      this.forgetPress();
    }
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

  protected settled(event: TransitionEvent): void {
    if (event.target === this.panel().nativeElement && event.propertyName === 'translate') {
      this.settleEasing.set(null);
    }
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
    if (this.modality.lastPressByPointer()) {
      this.focusTitle(dialog);
    }
  }

  private focusTitle(dialog: HTMLDialogElement): void {
    const [titleId] = this.labelledBy().split(/\s+/);
    const title = this.document.getElementById(titleId);
    if (title === null || !dialog.contains(title)) {
      this.focusItself(dialog);
      return;
    }
    if (!title.hasAttribute('tabindex')) {
      title.setAttribute('tabindex', '-1');
    }
    title.focus({ preventScroll: true });
  }

  private focusItself(dialog: HTMLDialogElement): void {
    this.focusingItself = true;
    try {
      dialog.focus({ preventScroll: true });
    } finally {
      this.focusingItself = false;
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
    this.settleEasing.set(null);
    this.dragging.set(true);
  }

  private pullTo(y: number, time: number): void {
    this.forgetPress();
    const offset = this.drag.move(y, time);
    this.dragOffset.set(offset);
    this.sheetPull.set(Math.min(1, offset / Math.max(1, this.panelHeight())));
  }

  private letGo(time: number): void {
    const height = this.panelHeight();
    const wayDown = this.wayBelowTheWindow();
    const wayBack = this.dragOffset();
    const release = this.drag.end(height, time);
    this.stopDrag();
    const way = release === 'dismiss' ? wayDown : wayBack;
    this.settleEasing.set(this.drag.settleEasing(way, this.sheetDurationMs()));
    if (release !== 'dismiss' || !this.dismissible()) {
      return;
    }
    if (this.unsavedInput()) {
      this.askingToDiscard.set(true);
    } else {
      this.dismiss();
    }
  }

  private closesWithMotion(): boolean {
    const view = this.document.defaultView;
    return (
      !this.steppedAside &&
      this.element().nativeElement.open &&
      view?.matchMedia?.(LESS_MOTION).matches === false
    );
  }

  private startLeaving(): void {
    this.exit.set('leaving');
    if (this.look() === 'sheet') {
      this.sheetPull.set(1);
    }
    const dialog = this.element().nativeElement;
    this.focusItself(dialog);
    afterNextRender(
      () => {
        const panel = this.panel().nativeElement;
        const longest = Math.max(
          longestTransitionMs(getComputedStyle(dialog).transitionDuration),
          longestTransitionMs(getComputedStyle(panel).transitionDuration),
        );
        const leaving = dialog.getAnimations?.({ subtree: true }).filter(endsLeaving) ?? [];
        const left = (): void => this.finishLeaving();
        Promise.all(leaving.map((transition) => transition.finished)).then(left, left);
        this.leaveTimer = setTimeout(left, longest + CLOSING_GRACE_MS);
      },
      { injector: this.injector },
    );
  }

  private finishLeaving(): void {
    if (this.exit() !== 'leaving' || this.destroyed) {
      return;
    }
    clearTimeout(this.leaveTimer);
    this.exit.set('gone');
    this.dismissed.emit();
    afterNextRender(() => this.comeBackUp(), { injector: this.injector });
  }

  private comeBackUp(): void {
    if (this.destroyed) {
      return;
    }
    this.exit.set('open');
    this.sheetPull.set(0);
    this.settleEasing.set(null);
    if (!this.steppedAside && !this.element().nativeElement.open) {
      this.showModal();
    }
    if (this.entryTakenBackWhileLeaving) {
      this.entryTakenBackWhileLeaving = false;
      this.history.open(this.historyEntry);
    }
  }

  private wayBelowTheWindow(): number {
    const windowHeight = this.document.defaultView?.innerHeight ?? 0;
    return windowHeight - this.panel().nativeElement.getBoundingClientRect().top;
  }

  private sheetDurationMs(): number {
    const root = this.document.documentElement;
    return longestTransitionMs(getComputedStyle(root).getPropertyValue(SHEET_DURATION));
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

  private showDepth(depth: number): void {
    if (this.viewReady && !this.destroyed && this.pushesHistory()) {
      this.history.showStep(depth, this.historyEntry);
    }
  }

  private steppedBackByHistory(): void {
    this.steppedBack.emit();
    afterNextRender(() => this.showDepth(this.depth()), { injector: this.injector });
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

function endsLeaving(animation: Animation): boolean {
  return (
    'transitionProperty' in animation &&
    (animation.transitionProperty === 'translate' || animation.transitionProperty === 'opacity')
  );
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
