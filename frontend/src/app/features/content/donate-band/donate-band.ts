import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { DonateBandPhotoResponse } from '../donate-band-api';
import { mediaUrl } from '../news-api';

const PHOTO_WIDTHS = [480, 960, 1440];
const LARGEST_WIDTH = PHOTO_WIDTHS[PHOTO_WIDTHS.length - 1];
const STANDARD_SET = '/images/donate-720.webp 720w, /images/donate-1440.webp 1440w';

@Component({
  selector: 'app-donate-band',
  imports: [RouterLink, FocalPointCrop],
  templateUrl: './donate-band.html',
  styleUrl: './donate-band.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonateBand {
  readonly heading = input.required<string>();
  readonly lead = input.required<string>();
  readonly photo = input<DonateBandPhotoResponse | null>(null);
  readonly showsProjects = input(true);

  protected readonly source = computed(() => {
    const photo = this.photo();
    return photo ? mediaUrl(photo.id, PHOTO_WIDTHS[0]) : '/images/donate-720.webp';
  });

  protected readonly sourceSet = computed(() => {
    const photo = this.photo();
    if (!photo) {
      return STANDARD_SET;
    }
    const largest = Math.min(photo.width, LARGEST_WIDTH);
    return [
      ...PHOTO_WIDTHS.filter((width) => width < largest).map(
        (width) => `${mediaUrl(photo.id, width)} ${width}w`,
      ),
      `${mediaUrl(photo.id, LARGEST_WIDTH)} ${largest}w`,
    ].join(', ');
  });

  protected readonly alt = computed(() => this.photo()?.alt ?? '');
  protected readonly focalPoint = computed(() => this.photo()?.focalPoint ?? null);
}
