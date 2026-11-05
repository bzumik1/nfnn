import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { canonicalAddress } from '../../../core/seo/canonical-link';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { ShareButton } from '../../../shared/ui/share-button/share-button';
import { formatDonationDate } from '../../donations/donation-date';
import { MEDIA_WIDTHS, mediaUrl, NewsArticleResponse, SMALL_MEDIA_WIDTH } from '../news-api';

@Component({
  selector: 'app-featured-news',
  imports: [RouterLink, Avatar, ShareButton, FocalPointCrop],
  templateUrl: './featured-news.html',
  styleUrl: './featured-news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeaturedNews {
  readonly item = input.required<NewsArticleResponse>();

  protected readonly date = computed(() => {
    const publishedOn = this.item().publishedOn;
    return publishedOn ? formatDonationDate(publishedOn) : '';
  });
  protected readonly image = computed(() => {
    const cover = this.item().coverImage;
    return cover ? mediaUrl(cover.id, MEDIA_WIDTHS[1]) : null;
  });
  protected readonly imageSet = computed(() => {
    const cover = this.item().coverImage;
    return cover
      ? MEDIA_WIDTHS.map((width) => `${mediaUrl(cover.id, width)} ${width}w`).join(', ')
      : null;
  });
  protected readonly portrait = computed(() => {
    const portrait = this.item().signer?.portrait;
    return portrait ? mediaUrl(portrait.id, SMALL_MEDIA_WIDTH) : null;
  });
  protected readonly shareUrl = computed(() => canonicalAddress(`/aktuality/${this.item().slug}`));
}
