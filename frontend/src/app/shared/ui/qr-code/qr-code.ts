import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { brandedQrLayout, Position, QUIET_ZONE, STAR_BODY, STAR_FACE } from './qr-branded-layout';
import { isDark, QrMatrix } from './qr-matrix';

export type QrVariant = 'branded' | 'plain';

const BADGE_SHARE = 0.17;

interface Dot extends Position {
  readonly dark: boolean;
}

const WAVE_START_MS = 180;
const WAVE_MS_PER_MODULE = 45;
const WAVE_JITTER_MS = 60;
const STAY_MS = 1140;
const LEAVE_MS = 720;
const LEAVE_LEAD_MS = 150;
const ENTER_MS = 1260;
const ENTER_LAG_MS = 90;
const SETTLE_MS = 1950;
const SETTLE_LAG_MS = 1350;
const STAR_MS = 1860;
const BADGE_MS = 1560;

@Component({
  selector: 'app-qr-code',
  templateUrl: './qr-code.html',
  styleUrl: './qr-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrCode {
  readonly matrix = input.required<QrMatrix>();
  readonly variant = input<QrVariant>('branded');
  readonly label = input.required<string>();

  protected readonly starBody = STAR_BODY;
  protected readonly starFace = STAR_FACE;

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly dotElements = viewChildren<ElementRef<SVGCircleElement>>('dot');
  private readonly size = computed(() => this.matrix().size);

  protected readonly side = computed(() => this.size() + 2 * QUIET_ZONE);
  protected readonly viewBox = computed(() => `0 0 ${this.side()} ${this.side()}`);
  protected readonly layout = computed(() => brandedQrLayout(this.size(), BADGE_SHARE));
  protected readonly origin = computed(() => `${this.layout().centre}px ${this.layout().centre}px`);
  protected readonly dots = computed<readonly Dot[]>(() => {
    const matrix = this.matrix();
    return this.layout().positions.map((position) => ({
      ...position,
      dark: isDark(matrix, position.column, position.row),
    }));
  });
  protected readonly plainPath = computed(() => {
    const matrix = this.matrix();
    let path = '';
    for (let row = 0; row < matrix.size; row++) {
      for (let column = 0; column < matrix.size; column++) {
        if (isDark(matrix, column, row)) {
          path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
        }
      }
    }
    return path;
  });

  private shown: QrMatrix | null = null;
  private running: Animation[] = [];

  constructor() {
    afterRenderEffect(() => {
      const matrix = this.matrix();
      const elements = this.dotElements();
      untracked(() => this.animateFrom(this.shown, matrix, elements));
      this.shown = matrix;
    });
  }

  async pngDataUrl(sidePx: number): Promise<string> {
    const source = this.svg().nativeElement;
    const copy = source.cloneNode(true) as SVGSVGElement;
    copy.querySelectorAll('.is-off, .qr-ring').forEach((element) => element.remove());
    const styles = getComputedStyle(source);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const paint = (selector: string, attributes: Record<string, string>) =>
      copy.querySelectorAll(selector).forEach((element) => {
        for (const [name, value] of Object.entries(attributes)) {
          element.setAttribute(name, value);
        }
      });
    paint('.qr-ground', { fill: token('--color-qr-ground') });
    paint('.qr-dot, .qr-plain', { fill: token('--color-qr-module') });
    paint('.qr-finder, .qr-alignment, .qr-badge-disc', { fill: token('--color-qr-mark') });
    paint('.qr-badge-line', { fill: 'none', stroke: token('--color-qr-ground') });
    paint('.qr-star-body', { fill: token('--color-logo-fill'), stroke: token('--color-logo') });
    paint('.qr-star-face', { fill: 'none', stroke: token('--color-logo') });
    copy.setAttribute('width', `${sidePx}`);
    copy.setAttribute('height', `${sidePx}`);
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = sidePx;
    canvas.height = sidePx;
    canvas.getContext('2d')?.drawImage(image, 0, 0, sidePx, sidePx);
    return canvas.toDataURL('image/png');
  }

  private animateFrom(
    previous: QrMatrix | null,
    next: QrMatrix,
    elements: readonly ElementRef<SVGCircleElement>[],
  ): void {
    this.running.forEach((animation) => animation.cancel());
    this.running = [];
    if (
      previous === null ||
      previous.size !== next.size ||
      previous.modules === next.modules ||
      this.variant() !== 'branded' ||
      !canAnimate(this.svg().nativeElement)
    ) {
      return;
    }
    const styles = getComputedStyle(this.svg().nativeElement);
    const module = styles.getPropertyValue('--color-qr-module').trim();
    const mark = styles.getPropertyValue('--color-qr-mark').trim();
    const positions = this.layout().positions;
    elements.forEach((element, order) => {
      const position = positions[order];
      const was = isDark(previous, position.column, position.row);
      const now = isDark(next, position.column, position.row);
      if (!was && !now) {
        return;
      }
      const delay = WAVE_START_MS + position.distance * WAVE_MS_PER_MODULE + jitter(position.index);
      const dot = element.nativeElement;
      if (was && now) {
        this.play(
          dot,
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.22)', offset: 0.35 },
            { transform: 'scale(1)' },
          ],
          STAY_MS,
          delay,
          'ease-out',
        );
      } else if (was) {
        this.play(
          dot,
          [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(1.15)', opacity: 1, offset: 0.25 },
            { transform: 'scale(0)', opacity: 0 },
          ],
          LEAVE_MS,
          delay - LEAVE_LEAD_MS,
          'cubic-bezier(.5,0,.75,0)',
        );
      } else {
        this.play(
          dot,
          [
            { transform: 'scale(0)', opacity: 0, fill: mark },
            { transform: 'scale(1.3)', opacity: 1, fill: mark, offset: 0.45 },
            { transform: 'scale(0.92)', fill: mark, offset: 0.7 },
            { transform: 'scale(1)', opacity: 1, fill: mark, offset: 0.85 },
          ],
          ENTER_MS,
          delay + ENTER_LAG_MS,
          'ease-out',
        );
        this.play(
          dot,
          [{ fill: mark }, { fill: module }],
          SETTLE_MS,
          delay + SETTLE_LAG_MS,
          'ease-in-out',
        );
      }
    });
    const layout = this.layout();
    const svg = this.svg().nativeElement;
    const ring = svg.querySelector('.qr-ring');
    const star = svg.querySelector('.qr-star');
    const badge = svg.querySelector('.qr-badge');
    if (ring) {
      const reach = WAVE_START_MS + layout.farthest * WAVE_MS_PER_MODULE;
      const scale = (layout.farthest + layout.badgeRadius) / (layout.badgeRadius + 1);
      this.play(
        ring,
        [
          { transform: 'scale(1)', opacity: 0.45 },
          { transform: `scale(${scale})`, opacity: 0 },
        ],
        reach,
        0,
        'cubic-bezier(.25,.6,.4,1)',
      );
    }
    if (star) {
      this.play(
        star,
        [
          { transform: 'rotate(0) scale(1)' },
          { transform: 'rotate(-9deg) scale(1.1)', offset: 0.3 },
          { transform: 'rotate(6deg) scale(1.04)', offset: 0.6 },
          { transform: 'rotate(0) scale(1)' },
        ],
        STAR_MS,
        0,
        'ease-in-out',
      );
    }
    if (badge) {
      this.play(
        badge,
        [
          { transform: 'scale(1)' },
          { transform: 'scale(0.94)', offset: 0.25 },
          { transform: 'scale(1.03)', offset: 0.6 },
          { transform: 'scale(1)' },
        ],
        BADGE_MS,
        0,
        'ease-out',
      );
    }
  }

  private play(
    element: Element,
    keyframes: Keyframe[],
    duration: number,
    delay: number,
    easing: string,
  ): void {
    this.running.push(
      element.animate(keyframes, {
        duration,
        delay: Math.max(0, delay),
        easing,
        fill: 'backwards',
      }),
    );
  }
}

function canAnimate(element: Element): boolean {
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !reduced && typeof element.animate === 'function';
}

function jitter(index: number): number {
  return (
    (((Math.imul(index, 2654435761) >>> 0) % 1000) / 1000) * WAVE_JITTER_MS * 2 - WAVE_JITTER_MS
  );
}
