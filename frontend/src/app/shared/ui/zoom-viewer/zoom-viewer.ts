import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { Dialog } from '../dialog/dialog';
import { DialogAnnouncer } from '../dialog/dialog-announcer';
import { SheetDrag } from '../dialog/sheet-drag';
import { QrCode } from '../qr-code/qr-code';
import { ZoomContent } from './zoom-content';
import {
  clampView,
  panBy,
  RESTING_VIEW,
  ZoomBounds,
  ZoomPoint,
  zoomAround,
  zoomStep,
  ZoomView,
} from './zoom-geometry';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_REACH = 30;
const TAP_SLOP = 10;
const WHEEL_RATE = 0.002;
const TRACKPAD_PINCH_RATE = 0.01;
const WHEEL_LINE = 16;
const ARROW_SHARE = 0.1;

interface Pinch {
  readonly distance: number;
  readonly middle: ZoomPoint;
  readonly view: ZoomView;
}

interface Tap {
  readonly at: number;
  readonly point: ZoomPoint;
}

let nextViewer = 0;

@Component({
  selector: 'app-zoom-viewer',
  imports: [Dialog, QrCode],
  templateUrl: './zoom-viewer.html',
  styleUrl: './zoom-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'fit()' },
})
export class ZoomViewer {
  readonly content = input.required<ZoomContent>();
  readonly closed = output<void>();

  protected readonly titleId = `zoom-viewer-title-${++nextViewer}`;
  protected readonly hintId = `zoom-viewer-hint-${nextViewer}`;
  protected readonly photo = computed(() => {
    const content = this.content();
    return content.kind === 'photo' ? content : null;
  });
  protected readonly qr = computed(() => {
    const content = this.content();
    return content.kind === 'qr' ? content : null;
  });
  protected readonly view = signal<ZoomView>(RESTING_VIEW);
  protected readonly easing = signal(false);
  protected readonly transform = computed(() => {
    const { scale, x, y } = this.view();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  });
  protected readonly level = computed(() => percent(this.view().scale));
  protected readonly resetLabel = computed(
    () => $localize`:@@ui.zoomViewer.reset:${this.level()}:level:, vrátit původní velikost`,
  );
  protected readonly atRest = computed(() => this.view().scale <= 1);
  protected readonly swipeOffset = signal<ZoomPoint | null>(null);
  protected readonly swipeTranslate = computed(() => {
    const offset = this.swipeOffset();
    return offset === null ? null : `${offset.x}px ${offset.y}px`;
  });
  protected readonly swipeProgress = computed(() => {
    const offset = this.swipeOffset();
    const height = this.stage().nativeElement.clientHeight;
    return offset === null ? 0 : Math.min(1, offset.y / Math.max(1, height));
  });
  protected readonly atLimit = computed(() => this.view().scale >= MAX_SCALE);

  private readonly announcer = inject(DialogAnnouncer);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly shown = viewChild.required<ElementRef<HTMLElement>>('shown');
  private readonly pointers = new Map<number, ZoomPoint>();
  private pinch: Pinch | null = null;
  private pressedAt: ZoomPoint | null = null;
  private moved = false;
  private lastTap: Tap | null = null;
  private readonly swipe = new SheetDrag();
  private swipeFrom: ZoomPoint | null = null;
  private silence: () => void = () => undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.silence());
  }

  protected close(): void {
    this.closed.emit();
  }

  protected step(direction: 'in' | 'out'): void {
    const scale = zoomStep(this.view().scale, direction, MAX_SCALE);
    if (scale === this.view().scale) {
      return;
    }
    this.ease(zoomAround(this.view(), scale, { x: 0, y: 0 }, this.bounds()));
    const level = this.level();
    this.announce(
      direction === 'in'
        ? $localize`:@@ui.zoomViewer.zoomedIn:Přiblíženo na ${level}:level:`
        : $localize`:@@ui.zoomViewer.zoomedOut:Oddáleno na ${level}:level:`,
    );
  }

  protected reset(): void {
    this.ease(RESTING_VIEW);
    this.announce($localize`:@@ui.zoomViewer.resetDone:Původní velikost`);
  }

  private announce(text: string): void {
    this.silence();
    this.silence = this.announcer.announce(text);
  }

  protected fit(): void {
    this.view.set(clampView(this.view(), this.bounds()));
  }

  protected press(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (event.pointerType === 'mouse') {
      this.stage().nativeElement.setPointerCapture(event.pointerId);
    }
    this.easing.set(false);
    const point = this.pointOf(event);
    this.pointers.set(event.pointerId, point);
    if (this.pointers.size === 1) {
      this.pressedAt = point;
      this.moved = false;
      if (event.pointerType === 'touch' && this.atRest()) {
        this.swipeFrom = point;
        this.swipe.start(point.y, event.timeStamp);
      }
    } else {
      this.moved = true;
      this.endSwipe();
      this.pinch = this.pinchStart();
    }
  }

  protected drag(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) {
      return;
    }
    const point = this.pointOf(event);
    this.pointers.set(event.pointerId, point);
    if (this.pinch) {
      this.pinchTo(this.pinch);
      return;
    }
    if (this.pressedAt && distance(this.pressedAt, point) > TAP_SLOP) {
      this.moved = true;
    }
    if (this.swipeFrom) {
      const down = this.swipe.move(point.y, event.timeStamp);
      this.swipeOffset.set({ x: point.x - this.swipeFrom.x, y: down });
      return;
    }
    this.view.set(panBy(this.view(), point.x - previous.x, point.y - previous.y, this.bounds()));
  }

  protected release(event: PointerEvent): void {
    if (!this.pointers.delete(event.pointerId)) {
      return;
    }
    this.pinch = this.pointers.size >= 2 ? this.pinchStart() : null;
    if (this.swipeFrom && this.pointers.size === 0) {
      const release = this.swipe.end(this.stage().nativeElement.clientHeight, event.timeStamp);
      this.endSwipe();
      if (release === 'dismiss') {
        this.close();
        return;
      }
    }
    if (this.pointers.size === 0 && !this.moved) {
      this.tapped({ at: event.timeStamp, point: this.pointOf(event) });
    }
  }

  protected abandon(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    this.endSwipe();
    this.pinch = this.pointers.size >= 2 ? this.pinchStart() : null;
    this.moved = true;
  }

  protected turn(event: WheelEvent): void {
    event.preventDefault();
    this.easing.set(false);
    const delta =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE : event.deltaY;
    const rate = event.ctrlKey ? TRACKPAD_PINCH_RATE : WHEEL_RATE;
    const scale = this.view().scale * Math.exp(-delta * rate);
    this.view.set(zoomAround(this.view(), scale, this.pointOf(event), this.bounds()));
  }

  protected key(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    const stage = this.stage().nativeElement;
    const reachX = stage.clientWidth * ARROW_SHARE;
    const reachY = stage.clientHeight * ARROW_SHARE;
    switch (event.key) {
      case '+':
      case '=':
        this.step('in');
        break;
      case '-':
        this.step('out');
        break;
      case '0':
        this.reset();
        break;
      case 'ArrowLeft':
        this.ease(panBy(this.view(), reachX, 0, this.bounds()));
        break;
      case 'ArrowRight':
        this.ease(panBy(this.view(), -reachX, 0, this.bounds()));
        break;
      case 'ArrowUp':
        this.ease(panBy(this.view(), 0, reachY, this.bounds()));
        break;
      case 'ArrowDown':
        this.ease(panBy(this.view(), 0, -reachY, this.bounds()));
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private tapped(tap: Tap): void {
    const last = this.lastTap;
    if (
      last &&
      tap.at - last.at <= DOUBLE_TAP_MS &&
      distance(last.point, tap.point) <= DOUBLE_TAP_REACH
    ) {
      this.lastTap = null;
      this.ease(
        this.view().scale > 1
          ? RESTING_VIEW
          : zoomAround(this.view(), DOUBLE_TAP_SCALE, tap.point, this.bounds()),
      );
      return;
    }
    this.lastTap = tap;
  }

  private endSwipe(): void {
    if (this.swipeFrom === null) {
      return;
    }
    this.swipe.cancel();
    this.swipeFrom = null;
    this.easing.set(true);
    this.swipeOffset.set(null);
  }

  private pinchStart(): Pinch {
    const [first, second] = [...this.pointers.values()];
    return { distance: distance(first, second), middle: middle(first, second), view: this.view() };
  }

  private pinchTo(pinch: Pinch): void {
    const [first, second] = [...this.pointers.values()];
    const now = middle(first, second);
    const scale =
      pinch.distance > 0
        ? (pinch.view.scale * distance(first, second)) / pinch.distance
        : pinch.view.scale;
    const bounds = this.bounds();
    const zoomed = zoomAround(pinch.view, scale, pinch.middle, bounds);
    this.view.set(panBy(zoomed, now.x - pinch.middle.x, now.y - pinch.middle.y, bounds));
  }

  private ease(view: ZoomView): void {
    this.easing.set(true);
    this.view.set(view);
  }

  private pointOf(event: MouseEvent): ZoomPoint {
    const box = this.stage().nativeElement.getBoundingClientRect();
    return {
      x: event.clientX - box.left - box.width / 2,
      y: event.clientY - box.top - box.height / 2,
    };
  }

  private bounds(): ZoomBounds {
    const stage = this.stage().nativeElement;
    const shown = this.shown().nativeElement;
    return {
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      contentWidth: shown.offsetWidth,
      contentHeight: shown.offsetHeight,
      maxScale: MAX_SCALE,
    };
  }
}

function distance(first: ZoomPoint, second: ZoomPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function middle(first: ZoomPoint, second: ZoomPoint): ZoomPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}\u00a0%`;
}
