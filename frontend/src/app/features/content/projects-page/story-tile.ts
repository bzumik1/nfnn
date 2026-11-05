import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { projectCategoryLabel } from '../project-category';
import { mediaUrl, ProjectResponse } from '../projects-api';

export type StoryTileSize = 'large' | 'small';

const WIDTHS: Record<StoryTileSize, readonly [number, number]> = {
  large: [960, 1440],
  small: [480, 960],
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

  protected readonly category = computed(() => projectCategoryLabel(this.item().category));

  protected readonly image = computed(() => {
    const cover = this.item().coverImage;
    if (!cover) {
      return null;
    }
    const [narrow, wide] = WIDTHS[this.size()];
    return {
      src: mediaUrl(cover.id, narrow),
      srcset: `${mediaUrl(cover.id, narrow)} ${narrow}w, ${mediaUrl(cover.id, wide)} ${wide}w`,
      alt: cover.alt ?? '',
      focalPoint: cover.focalPoint,
    };
  });
}
