import { computed, Directive, input } from '@angular/core';

export interface FocalPoint {
  x: number;
  y: number;
}

export interface PhotoShape {
  readonly ratio: number;
  readonly fallback: FocalPoint;
}

export const PHOTO_SHAPES = {
  newsCard: { ratio: 360 / 156, fallback: { x: 50, y: 30 } },
  projectCard: { ratio: 360 / 196, fallback: { x: 50, y: 20 } },
  articleTop: { ratio: 8 / 5, fallback: { x: 50, y: 50 } },
  band: { ratio: 3, fallback: { x: 50, y: 30 } },
  bandPhone: { ratio: 3 / 2, fallback: { x: 50, y: 30 } },
  square: { ratio: 1, fallback: { x: 50, y: 40 } },
  newsFeatured: { ratio: 12 / 5, fallback: { x: 50, y: 40 } },
  newsFeaturedMedium: { ratio: 3 / 2, fallback: { x: 50, y: 40 } },
  newsFeaturedTall: { ratio: 4 / 5, fallback: { x: 50, y: 40 } },
  newsCardSide: { ratio: 1, fallback: { x: 50, y: 30 } },
  storyTile: { ratio: 1, fallback: { x: 50, y: 30 } },
} as const satisfies Record<string, PhotoShape>;

export type PhotoShapeName = keyof typeof PHOTO_SHAPES;

export function objectPosition(
  point: FocalPoint | null | undefined,
  shape: PhotoShapeName,
): string {
  const { x, y } = point ?? PHOTO_SHAPES[shape].fallback;
  return `${x}% ${y}%`;
}

@Directive({
  selector: 'img[appFocalPoint]',
  host: { '[style.object-position]': 'position()' },
})
export class FocalPointCrop {
  readonly appFocalPoint = input<FocalPoint | null | undefined>(null);
  readonly focalShape = input.required<PhotoShapeName>();

  protected readonly position = computed(() =>
    objectPosition(this.appFocalPoint(), this.focalShape()),
  );
}
