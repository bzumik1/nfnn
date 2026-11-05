/// <reference types="@angular/localize" />

import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  FocalPoint,
  FocalPointCrop,
  PHOTO_SHAPES,
  PhotoShapeName,
} from '../../../shared/ui/focal-point/focal-point';
import { mediaUrl } from '../../content/news-api';

export interface PreviewShape {
  readonly shape: PhotoShapeName;
  readonly label: string;
}

const PHOTO_WIDTH = 960;
const PREVIEW_WIDTH = 480;
const CENTRE: FocalPoint = { x: 50, y: 50 };
const KEY_STEP = 5;
const KEY_MOVES: Readonly<Record<string, FocalPoint>> = {
  ArrowLeft: { x: -KEY_STEP, y: 0 },
  ArrowRight: { x: KEY_STEP, y: 0 },
  ArrowUp: { x: 0, y: -KEY_STEP },
  ArrowDown: { x: 0, y: KEY_STEP },
};

@Component({
  selector: 'app-focal-point-picker',
  imports: [FocalPointCrop],
  templateUrl: './focal-point-picker.html',
  styleUrl: './focal-point-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FocalPointPicker {
  readonly inputId = input.required<string>();
  readonly imageId = input.required<string>();
  readonly shapes = input<readonly PreviewShape[]>([]);
  readonly hint = input<string | null>(null);
  readonly point = model<FocalPoint | null>(null);

  protected readonly photoUrl = computed(() => mediaUrl(this.imageId(), PHOTO_WIDTH));
  protected readonly previewUrl = computed(() => mediaUrl(this.imageId(), PREVIEW_WIDTH));
  protected readonly hintId = computed(() => `${this.inputId()}-hint`);
  protected readonly previews = computed(() =>
    this.shapes().map((preview) => ({ ...preview, ratio: PHOTO_SHAPES[preview.shape].ratio })),
  );
  protected readonly summary = computed(() => {
    const point = this.point();
    return point
      ? $localize`:@@admin.focalPoint.summary.set:Bod výřezu: ${point.x}:x: % zleva, ${point.y}:y: % shora.`
      : $localize`:@@admin.focalPoint.summary.none:Bez bodu výřezu: web fotku ořízne jako dosud.`;
  });

  protected choose(event: MouseEvent, photo: HTMLImageElement): void {
    if (event.detail === 0) {
      return;
    }
    const box = photo.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      return;
    }
    this.point.set({
      x: percent((event.clientX - box.left) / box.width),
      y: percent((event.clientY - box.top) / box.height),
    });
  }

  protected move(event: KeyboardEvent): void {
    const step = KEY_MOVES[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const from = this.point() ?? CENTRE;
    this.point.set({ x: clamp(from.x + step.x), y: clamp(from.y + step.y) });
  }

  protected clear(): void {
    this.point.set(null);
  }
}

function percent(share: number): number {
  return clamp(Math.round(share * 100));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
