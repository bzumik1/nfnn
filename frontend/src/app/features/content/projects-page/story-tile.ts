import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { FocalPointCrop, PhotoShapeName } from '../../../shared/ui/focal-point/focal-point';
import { projectCategoryLabel } from '../project-category';
import { mediaUrl, ProjectResponse } from '../projects-api';

export type StoryTileSize = 'split' | 'large' | 'small';

interface TilePhoto {
  readonly widths: readonly [number, number];
  readonly sizes: string;
  readonly shape: PhotoShapeName;
}

const PHOTOS: Record<StoryTileSize, TilePhoto> = {
  split: { widths: [960, 1440], sizes: '(min-width: 1600px) 840px, 60vw', shape: 'storySplit' },
  large: { widths: [960, 1440], sizes: '(max-width: 768px) 100vw, 600px', shape: 'square' },
  small: { widths: [480, 960], sizes: '(max-width: 768px) 85vw, 300px', shape: 'projectCard' },
};

@Component({
  selector: 'app-story-tile',
  imports: [RouterLink, FocalPointCrop],
  templateUrl: './story-tile.html',
  styleUrl: './story-tile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-large]': "size() === 'large'" },
})
export class StoryTile {
  readonly item = input.required<ProjectResponse>();
  readonly size = input<StoryTileSize>('small');

  private readonly compact = inject(CompactLayout).isCompact;

  protected readonly showsPerex = computed(() => this.size() !== 'small' || !this.compact());

  protected readonly category = computed(() => projectCategoryLabel(this.item().category));

  protected readonly image = computed(() => {
    const cover = this.item().coverImage;
    if (!cover) {
      return null;
    }
    const photo = PHOTOS[this.size()];
    const [narrow, wide] = photo.widths;
    return {
      src: mediaUrl(cover.id, narrow),
      srcset: `${mediaUrl(cover.id, narrow)} ${narrow}w, ${mediaUrl(cover.id, wide)} ${wide}w`,
      sizes: photo.sizes,
      shape: photo.shape,
      alt: cover.alt ?? '',
      focalPoint: cover.focalPoint,
    };
  });
}
