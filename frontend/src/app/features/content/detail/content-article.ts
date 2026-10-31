import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Markdown } from '../../../shared/ui/markdown/markdown';
import { mediaUrl } from '../news-api';
import { ContentKind, ContentPage } from './content-page';

const IMAGE_WIDTH = 960;
const IMAGE_WIDTHS = [480, 960, 1440];
const PORTRAIT_WIDTH = 480;

@Component({
  selector: 'app-content-article',
  imports: [RouterLink, Markdown, Avatar],
  templateUrl: './content-article.html',
  styleUrl: './content-article.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentArticle {
  readonly page = input.required<ContentPage>();
  readonly kind = input.required<ContentKind>();
  readonly preview = input(false);

  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly image = computed(() => {
    const id = this.page().imageId;
    return id ? mediaUrl(id, IMAGE_WIDTH) : null;
  });
  protected readonly imageSet = computed(() => {
    const id = this.page().imageId;
    return id ? IMAGE_WIDTHS.map((width) => `${mediaUrl(id, width)} ${width}w`).join(', ') : null;
  });

  protected readonly signerPortrait = computed(() => {
    const id = this.page().signer?.portraitId;
    return id ? mediaUrl(id, PORTRAIT_WIDTH) : null;
  });

  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }
}
