import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mediaUrl, ProjectResponse } from '../../../projects-api';

export type ProjectKey = 'dominik' | 'anicka' | 'tomas' | 'eliska' | 'martin';

const CARD_WIDTH = 480;
const CARD_WIDTH_SHARP = 960;

@Component({
  selector: 'app-project-card',
  imports: [RouterLink],
  templateUrl: './project-card.html',
  styleUrl: './project-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectCard {
  readonly project = input<ProjectKey | null>(null);
  readonly item = input<ProjectResponse | null>(null);

  protected readonly imageSrc = computed(() => {
    const map: Record<ProjectKey, string> = {
      dominik: '/images/project-1.webp',
      anicka: '/images/project-2.webp',
      tomas: '/images/project-3.webp',
      eliska: '/images/project-4.webp',
      martin: '/images/project-5.webp',
    };
    const key = this.project();
    return key ? map[key] : '';
  });

  protected readonly image = computed(() => {
    const cover = this.item()?.coverImage;
    return cover ? mediaUrl(cover.id, CARD_WIDTH) : null;
  });

  protected readonly imageSet = computed(() => {
    const cover = this.item()?.coverImage;
    return cover
      ? `${mediaUrl(cover.id, CARD_WIDTH)} ${CARD_WIDTH}w, ${mediaUrl(cover.id, CARD_WIDTH_SHARP)} ${CARD_WIDTH_SHARP}w`
      : null;
  });
}
