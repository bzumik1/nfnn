import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocalPointCrop } from '../../../../../shared/ui/focal-point/focal-point';
import { mediaUrl, ProjectResponse } from '../../../projects-api';

const CARD_WIDTH = 480;
const CARD_WIDTH_SHARP = 960;

@Component({
  selector: 'app-project-card',
  imports: [RouterLink, FocalPointCrop],
  templateUrl: './project-card.html',
  styleUrl: './project-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCard {
  readonly item = input.required<ProjectResponse>();
  readonly linked = input(true);

  protected readonly image = computed(() => {
    const cover = this.item().coverImage;
    return cover ? mediaUrl(cover.id, CARD_WIDTH) : null;
  });

  protected readonly imageSet = computed(() => {
    const cover = this.item().coverImage;
    return cover
      ? `${mediaUrl(cover.id, CARD_WIDTH)} ${CARD_WIDTH}w, ${mediaUrl(cover.id, CARD_WIDTH_SHARP)} ${CARD_WIDTH_SHARP}w`
      : null;
  });
}
