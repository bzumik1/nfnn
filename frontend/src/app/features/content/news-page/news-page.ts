import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-news-page',
  templateUrl: './news-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewsPage {}
