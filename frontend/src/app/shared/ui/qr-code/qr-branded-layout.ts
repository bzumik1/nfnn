import { alignmentCentres } from './qr-matrix';

export const QUIET_ZONE = 4;
const FINDER = 7;
const BADGE_CLEARANCE = 1.2;
const ALIGNMENT_CLEARANCE = 3;
const STAR_SHARE = 1.5;
export const STAR_ORIGIN = { x: 2128, y: 290, side: 800 };

export const STAR_BODY =
  'M2379.39 580.421C2379.39 531.861 2362.77 457.431 2389.78 414.211C2457.82 305.355 2614.6 527.981 2638.01 574.811C2673.33 567.431 2913.01 551.221 2909.09 593.411C2903.01 658.871 2793.26 715.241 2762.85 770.551C2761.22 773.511 2760.81 778.061 2761.3 782.241C2759.43 794.191 2824.52 895.001 2812.43 929.681C2765.05 1065.5 2559.1 851.461 2518.93 814.741C2518.93 874.411 2360.4 1049.49 2308.76 983.101C2260.29 920.771 2343.4 829.861 2343.4 769.241C2343.63 769.081 2152.04 670.601 2147.77 640.711C2135.39 554.031 2336.74 580.501 2379.41 580.501';
export const STAR_FACE = [
  'M2478.82 583.591C2473.93 565.471 2481.06 621.341 2485.94 639.461',
  'M2550.06 582.421C2557.72 600.221 2554.88 621.561 2557.97 640.521',
  'M2629.9 661.741C2607.11 718.931 2444.42 748.281 2407.35 694.521',
];

export interface Position {
  readonly index: number;
  readonly column: number;
  readonly row: number;
  readonly cx: number;
  readonly cy: number;
  readonly distance: number;
}

export interface Mark {
  readonly ring: string;
  readonly core: string;
}

export interface AlignmentMark extends Mark {
  readonly cx: number;
  readonly cy: number;
}

export interface Layout {
  readonly positions: readonly Position[];
  readonly finders: readonly Mark[];
  readonly alignments: readonly AlignmentMark[];
  readonly centre: number;
  readonly badgeRadius: number;
  readonly starTransform: string;
  readonly star: { readonly x: number; readonly y: number; readonly scale: number };
  readonly farthest: number;
}

export function brandedQrLayout(size: number, badgeShare: number | null): Layout {
  const centre = QUIET_ZONE + size / 2;
  const middle = (size - 1) / 2;
  const badgeRadius = badgeShare === null ? 0 : size * badgeShare;
  const badged = badgeShare !== null;
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
        (badged && fromMiddle(column, row) < badgeRadius + BADGE_CLEARANCE)
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
    .filter(
      ({ column, row }) => !badged || fromMiddle(column, row) >= badgeRadius + ALIGNMENT_CLEARANCE,
    )
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
    star: { x: centre - starSide / 2, y: centre + 0.2 - starSide / 2, scale },
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
