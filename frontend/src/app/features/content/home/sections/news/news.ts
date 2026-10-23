import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDonationDate } from '../../../../donations/donation-date';
import { mediaUrl, NewsArticleResponse } from '../../../news-api';

const CARD_WIDTH = 480;
const CARD_WIDTH_SHARP = 960;

@Component({
  selector: 'app-news',
  imports: [RouterLink],
  templateUrl: './news.html',
  styleUrl: './news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class News {
  readonly items = input<NewsArticleResponse[]>([]);

  protected date(item: NewsArticleResponse): string {
    return item.publishedOn ? formatDonationDate(item.publishedOn) : '';
  }

  protected image(item: NewsArticleResponse): string | null {
    return item.coverImage ? mediaUrl(item.coverImage.id, CARD_WIDTH) : null;
  }

  protected imageSet(item: NewsArticleResponse): string | null {
    if (!item.coverImage) {
      return null;
    }
    const id = item.coverImage.id;
    return `${mediaUrl(id, CARD_WIDTH)} ${CARD_WIDTH}w, ${mediaUrl(id, CARD_WIDTH_SHARP)} ${CARD_WIDTH_SHARP}w`;
  }
}
