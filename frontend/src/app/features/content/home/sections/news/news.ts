import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NewsArticleResponse } from '../../../news-api';
import { NewsCard } from '../../../news-card/news-card';

@Component({
  selector: 'app-news',
  imports: [RouterLink, NewsCard],
  templateUrl: './news.html',
  styleUrl: './news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class News {
  readonly items = input<NewsArticleResponse[]>([]);
}
