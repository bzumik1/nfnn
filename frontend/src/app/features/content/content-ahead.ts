import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  DestroyRef,
  EnvironmentProviders,
  inject,
  Injectable,
  InjectionToken,
  Injector,
  provideAppInitializer,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Observable, take } from 'rxjs';
import { Connectivity } from '../../core/connectivity/connectivity';
import { pathOf, tabOf } from '../../core/navigation/app-tabs';
import { askedAhead } from '../../core/navigation/kept-public-answers';
import { LOOK_BACK_PAGE_SIZE, NEWS_PAGE_SIZE, PROJECTS_PAGE_SIZE } from './content-page-sizes';
import { HomeApi } from './home-api';
import { NewsApi } from './news-api';
import { ProjectsApi } from './projects-api';

export const CONTENT_AHEAD_AFTER_MS = 1500;

export const SAVES_DATA = new InjectionToken<() => boolean>('SAVES_DATA', {
  providedIn: 'root',
  factory: () => {
    const navigator = inject(DOCUMENT).defaultView?.navigator as
      (Navigator & { connection?: { saveData?: boolean } }) | undefined;
    return () => navigator?.connection?.saveData === true;
  },
});

const ARTICLE_LINK = /^\/(aktuality|projekty)\/([^/]+)$/;

@Injectable({ providedIn: 'root' })
export class ContentAhead {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly newsApi = inject(NewsApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly homeApi = inject(HomeApi);
  private readonly connectivity = inject(Connectivity);
  private readonly savesData = inject(SAVES_DATA);
  private waiting: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const intent = (event: Event) => this.articleAhead(event.target);
    for (const name of ['pointerdown', 'focusin', 'mouseover']) {
      this.document.addEventListener(name, intent, { capture: true, passive: true });
    }
    const firstPage = inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        take(1),
      )
      .subscribe((event) => {
        if (opensATab(event.urlAfterRedirects)) {
          afterNextRender(() => this.tabsAhead(), { injector: this.injector });
        }
      });
    inject(DestroyRef).onDestroy(() => {
      firstPage.unsubscribe();
      if (this.waiting !== null) {
        clearTimeout(this.waiting);
      }
      for (const name of ['pointerdown', 'focusin', 'mouseover']) {
        this.document.removeEventListener(name, intent, { capture: true });
      }
    });
  }

  private tabsAhead(): void {
    this.waiting = setTimeout(() => this.askForTabs(), CONTENT_AHEAD_AFTER_MS);
  }

  private articleAhead(target: EventTarget | null): void {
    const link = target instanceof Element ? target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.origin !== this.document.location.origin) {
      return;
    }
    const article = ARTICLE_LINK.exec(link.pathname);
    if (article === null || this.connectivity.offline()) {
      return;
    }
    const slug = decodeURIComponent(article[2]);
    this.ask(
      article[1] === 'aktuality'
        ? this.newsApi.publishedBySlug(slug, askedAhead())
        : this.projectsApi.publishedBySlug(slug, askedAhead()),
    );
  }

  private askForTabs(): void {
    if (this.savesData() || this.connectivity.offline()) {
      return;
    }
    this.ask(this.homeApi.load(askedAhead()));
    this.ask(this.newsApi.published(0, NEWS_PAGE_SIZE, askedAhead()));
    this.ask(this.projectsApi.published(0, PROJECTS_PAGE_SIZE, askedAhead()));
    this.ask(this.newsApi.published(0, LOOK_BACK_PAGE_SIZE, askedAhead()));
  }

  private ask(answer: Observable<unknown>): void {
    answer.subscribe({ error: () => undefined });
  }
}

export const contentAheadAtStart: EnvironmentProviders = provideAppInitializer(() => {
  inject(ContentAhead);
});

function opensATab(url: string): boolean {
  return pathOf(url) === '/' || tabOf(url) !== null;
}
