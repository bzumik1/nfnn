import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Markdown } from '../../../shared/ui/markdown/markdown';
import { mediaUrl } from '../news-api';
import { ContentKind, ContentPage } from './content-page';

const IMAGE_WIDTH = 960;
const IMAGE_WIDTHS = [480, 960, 1440];

@Component({
  selector: 'app-content-article',
  imports: [RouterLink, Markdown],
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

  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }
}
