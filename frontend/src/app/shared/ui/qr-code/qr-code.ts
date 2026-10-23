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
import { alignmentCentres, isDark, QrMatrix } from './qr-matrix';

export type QrVariant = 'branded' | 'plain';

const QUIET_ZONE = 4;
const FINDER = 7;
const BADGE_SHARE = 0.17;
const BADGE_CLEARANCE = 1.2;
const ALIGNMENT_CLEARANCE = 3;
const STAR_SHARE = 1.5;
const STAR_ORIGIN = { x: 2128, y: 290, side: 800 };

const STAR_BODY =
  'M2379.39 580.421C2379.39 531.861 2362.77 457.431 2389.78 414.211C2457.82 305.355 2614.6 527.981 2638.01 574.811C2673.33 567.431 2913.01 551.221 2909.09 593.411C2903.01 658.871 2793.26 715.241 2762.85 770.551C2761.22 773.511 2760.81 778.061 2761.3 782.241C2759.43 794.191 2824.52 895.001 2812.43 929.681C2765.05 1065.5 2559.1 851.461 2518.93 814.741C2518.93 874.411 2360.4 1049.49 2308.76 983.101C2260.29 920.771 2343.4 829.861 2343.4 769.241C2343.63 769.081 2152.04 670.601 2147.77 640.711C2135.39 554.031 2336.74 580.501 2379.41 580.501';
const STAR_FACE = [
  'M2478.82 583.591C2473.93 565.471 2481.06 621.341 2485.94 639.461',
  'M2550.06 582.421C2557.72 600.221 2554.88 621.561 2557.97 640.521',
  'M2629.9 661.741C2607.11 718.931 2444.42 748.281 2407.35 694.521',
];

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

interface Position {
  readonly index: number;
  readonly column: number;
  readonly row: number;
  readonly cx: number;
  readonly cy: number;
  readonly distance: number;
}

interface Dot extends Position {
  readonly dark: boolean;
}

interface Mark {
  readonly ring: string;
  readonly core: string;
}

interface AlignmentMark extends Mark {
  readonly cx: number;
  readonly cy: number;
}

interface Layout {
  readonly positions: readonly Position[];
  readonly finders: readonly Mark[];
  readonly alignments: readonly AlignmentMark[];
  readonly centre: number;
  readonly badgeRadius: number;
  readonly starTransform: string;
  readonly farthest: number;
}

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
  protected readonly layout = computed(() => layoutFor(this.size()));
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

function layoutFor(size: number): Layout {
  const centre = QUIET_ZONE + size / 2;
  const middle = (size - 1) / 2;
  const badgeRadius = size * BADGE_SHARE;
  const isFinder = (column: number, row: number) =>
    (column < FINDER && row < FINDER) ||
    (column >= size - FINDER && row < FINDER) ||
    (column < FINDER && row >= size - FINDER);
  const centres = alignmentCentres(size);
  const alignmentCentrePoints = centres
    .flatMap((row) => centres.map((column) => ({ column, row })))
    .filter(({ column, row }) => !isFinder(column, row));
  const inAlignment = (column: number, row: number) =>
    alignmentCentrePoints.some(
      (point) => Math.abs(point.column - column) <= 2 && Math.abs(point.row - row) <= 2,
    );
  const fromMiddle = (column: number, row: number) => Math.hypot(column - middle, row - middle);
  const positions: Position[] = [];
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (
        isFinder(column, row) ||
        inAlignment(column, row) ||
        fromMiddle(column, row) < badgeRadius + BADGE_CLEARANCE
      ) {
        continue;
      }
      positions.push({
        index: row * size + column,
        column,
        row,
        cx: column + QUIET_ZONE + 0.5,
        cy: row + QUIET_ZONE + 0.5,
        distance: Math.max(0, fromMiddle(column, row) - badgeRadius),
      });
    }
  }
  const finders = [
    [0, 0],
    [size - FINDER, 0],
    [0, size - FINDER],
  ].map(([column, row]) => {
    const x = column + QUIET_ZONE;
    const y = row + QUIET_ZONE;
    return {
      ring: roundedSquare(x, y, 7, 2.3) + roundedSquare(x + 1, y + 1, 5, 1.3),
      core: roundedSquare(x + 2, y + 2, 3, 0.9),
    };
  });
  const alignments = alignmentCentrePoints
    .filter(({ column, row }) => fromMiddle(column, row) >= badgeRadius + ALIGNMENT_CLEARANCE)
    .map(({ column, row }) => {
      const x = column - 2 + QUIET_ZONE;
      const y = row - 2 + QUIET_ZONE;
      return {
        ring: roundedSquare(x, y, 5, 1.6) + roundedSquare(x + 1, y + 1, 3, 0.8),
        core: '',
        cx: column + QUIET_ZONE + 0.5,
        cy: row + QUIET_ZONE + 0.5,
      };
    });
  const starSide = badgeRadius * STAR_SHARE;
  const scale = starSide / STAR_ORIGIN.side;
  return {
    positions,
    finders,
    alignments,
    centre,
    badgeRadius,
    starTransform: `translate(${centre - starSide / 2} ${centre + 0.2 - starSide / 2}) scale(${scale}) translate(${-STAR_ORIGIN.x} ${-STAR_ORIGIN.y})`,
    farthest: Math.hypot(middle, middle) - badgeRadius,
  };
}

function roundedSquare(x: number, y: number, side: number, radius: number): string {
  const far = side - radius;
  return (
    `M${x + radius} ${y}H${x + far}A${radius} ${radius} 0 0 1 ${x + side} ${y + radius}` +
    `V${y + far}A${radius} ${radius} 0 0 1 ${x + far} ${y + side}` +
    `H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y + far}` +
    `V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`
  );
}
