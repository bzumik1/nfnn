import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { canonicalAddress } from '../../../core/seo/canonical-link';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { FocalPointCrop } from '../../../shared/ui/focal-point/focal-point';
import { ShareButton } from '../../../shared/ui/share-button/share-button';
import { formatDonationDate } from '../../donations/donation-date';
import { mediaUrl, NewsArticleResponse, SMALL_MEDIA_WIDTH } from '../news-api';

const CARD_WIDTH = 480;
const CARD_WIDTH_SHARP = 960;

@Component({
  selector: 'app-news-card',
  imports: [RouterLink, FocalPointCrop, Avatar, ShareButton],
  templateUrl: './news-card.html',
  styleUrl: './news-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsCard {
  readonly item = input.required<NewsArticleResponse>();
  readonly linked = input(true);

  protected readonly date = computed(() => {
    const publishedOn = this.item().publishedOn;
    return publishedOn ? formatDonationDate(publishedOn) : '';
  });

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

  protected readonly signerPortrait = computed(() => {
    const portrait = this.item().signer?.portrait;
    return portrait ? mediaUrl(portrait.id, SMALL_MEDIA_WIDTH) : null;
  });

  protected readonly shareUrl = computed(() => canonicalAddress(`/aktuality/${this.item().slug}`));
}
