import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ContentArticle } from '../../content/detail/content-article';
import { newsPage, projectPage } from '../../content/detail/content-page';
import { ProjectCard } from '../../content/home/sections/projects/project-card';
import { NewsArticleResponse } from '../../content/news-api';
import { NewsCard } from '../../content/news-card/news-card';
import { ProjectResponse } from '../../content/projects-api';

export type PreviewContent =
  { kind: 'news'; item: NewsArticleResponse } | { kind: 'project'; item: ProjectResponse };

@Component({
  selector: 'app-content-preview',
  imports: [NewsCard, ProjectCard, ContentArticle],
  templateUrl: './content-preview.html',
  styleUrl: './content-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentPreview {
  readonly content = input.required<PreviewContent>();

  protected readonly news = computed(() => {
    const content = this.content();
    return content.kind === 'news' ? content.item : null;
  });
  protected readonly project = computed(() => {
    const content = this.content();
    return content.kind === 'project' ? content.item : null;
  });
  protected readonly page = computed(() => {
    const content = this.content();
    return content.kind === 'news' ? newsPage(content.item) : projectPage(content.item);
  });
}
