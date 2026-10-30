import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AboutPhotoResponse } from '../../../about-api';
import { mediaUrl } from '../../../news-api';

const PHOTO_WIDTHS = [480, 960, 1440];
const LARGEST_WIDTH = PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];

@Component({
  selector: 'app-about',
  imports: [RouterLink, NgTemplateOutlet],
  templateUrl: './about.html',
  styleUrl: './about.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  readonly photo = input<AboutPhotoResponse | null>(null);

  protected readonly photoSource = computed(() => {
    const photo = this.photo();
    return photo ? mediaUrl(photo.id, PHOTO_WIDTHS[0]) : null;
  });

  protected readonly photoSet = computed(() => {
    const photo = this.photo();
    if (!photo) {
      return null;
    }
    const largest = Math.min(photo.width, LARGEST_WIDTH);
    return [
      ...PHOTO_WIDTHS.filter((width) => width < largest).map(
        (width) => `${mediaUrl(photo.id, width)} ${width}w`,
      ),
      `${mediaUrl(photo.id, LARGEST_WIDTH)} ${largest}w`,
    ].join(', ');
  });
}
