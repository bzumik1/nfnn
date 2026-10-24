import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDonationDate } from '../../donations/donation-date';
import { mediaUrl, NewsArticleResponse } from '../news-api';

export type NewsPlaceholder = 'dominik' | 'report' | 'autism';

const CARD_WIDTH = 480;
const CARD_WIDTH_SHARP = 960;
const PLACEHOLDER_IMAGES: Record<NewsPlaceholder, string> = {
  dominik: '/images/news-1.webp',
  report: '/images/news-2.webp',
  autism: '/images/news-2.webp',
};

@Component({
  selector: 'app-news-card',
  imports: [RouterLink],
  templateUrl: './news-card.html',
  styleUrl: './news-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsCard {
  readonly item = input<NewsArticleResponse | null>(null);
  readonly placeholder = input<NewsPlaceholder | null>(null);

  protected readonly placeholderImage = computed(() => {
    const key = this.placeholder();
    return key ? PLACEHOLDER_IMAGES[key] : '';
  });

  protected readonly date = computed(() => {
    const publishedOn = this.item()?.publishedOn;
    return publishedOn ? formatDonationDate(publishedOn) : '';
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
