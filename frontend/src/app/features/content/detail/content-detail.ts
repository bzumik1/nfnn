import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { problemTypeEndsWith } from '../../../core/auth/api-problem';
import { formatDonationDate } from '../../donations/donation-date';
import { mediaUrl, NewsApi, NewsArticleResponse } from '../news-api';
import { NotFound } from '../not-found/not-found';
import { ProjectResponse, ProjectsApi } from '../projects-api';

export type ContentKind = 'news' | 'project';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

interface Page {
  title: string;
  eyebrow: string;
  perex: string;
  paragraphs: string[];
  imageId: string | null;
  backFragment: string;
}

const IMAGE_WIDTH = 960;
const IMAGE_WIDTHS = [480, 960, 1440];
const SITE_NAME = $localize`:@@content.detail.siteName:Nová naděje – nadační fond`;

@Component({
  selector: 'app-content-detail',
  imports: [RouterLink, NotFound],
  templateUrl: './content-detail.html',
  styleUrl: './content-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  protected readonly kind: ContentKind = this.route.snapshot.data['kind'] as ContentKind;
  protected readonly state = signal<LoadState>('loading');
  protected readonly page = signal<Page | null>(null);
  protected readonly image = computed(() => {
    const id = this.page()?.imageId;
    return id ? mediaUrl(id, IMAGE_WIDTH) : null;
  });
  protected readonly imageSet = computed(() => {
    const id = this.page()?.imageId;
    return id ? IMAGE_WIDTHS.map((width) => `${mediaUrl(id, width)} ${width}w`).join(', ') : null;
  });

  constructor() {
    this.load();
    effect(() => {
      if (this.state() === 'ready') {
        afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
      }
    });
  }

  protected retry(): void {
    this.load();
  }

  private load(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.state.set('loading');
    this.fetch(slug)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.titleService.setTitle(`${page.title} | ${SITE_NAME}`);
          this.state.set('ready');
        },
        error: (failure: unknown) => {
          this.state.set(
            problemTypeEndsWith(failure, 'content/news-not-found') ||
              problemTypeEndsWith(failure, 'content/project-not-found')
              ? 'missing'
              : 'error',
          );
        },
      });
  }

  private fetch(slug: string): Observable<Page> {
    if (this.kind === 'news') {
      return new Observable((subscriber) =>
        this.newsApi.publishedBySlug(slug).subscribe({
          next: (article) => {
            subscriber.next(newsPage(article));
            subscriber.complete();
          },
          error: (failure: unknown) => subscriber.error(failure),
        }),
      );
    }
    return new Observable((subscriber) =>
      this.projectsApi.publishedBySlug(slug).subscribe({
        next: (project) => {
          subscriber.next(projectPage(project));
          subscriber.complete();
        },
        error: (failure: unknown) => subscriber.error(failure),
      }),
    );
  }
}

function newsPage(article: NewsArticleResponse): Page {
  const date = article.publishedOn ? formatDonationDate(article.publishedOn) : '';
  return {
    title: article.title,
    eyebrow: article.tag ? `${article.tag} · ${date}` : date,
    perex: article.perex,
    paragraphs: paragraphs(article.body),
    imageId: article.coverImage?.id ?? null,
    backFragment: 'aktuality',
  };
}

function projectPage(project: ProjectResponse): Page {
  return {
    title: project.title,
    eyebrow: project.tag ? `${project.tag} · ${project.year}` : String(project.year),
    perex: project.perex,
    paragraphs: paragraphs(project.body),
    imageId: project.coverImage?.id ?? null,
    backFragment: 'projekty',
  };
}

export function paragraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}
