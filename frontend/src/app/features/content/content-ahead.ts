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
import { refreshedAfterKeptCopy } from '../../core/connectivity/kept-answer-refresh';
import { askedAhead } from '../../core/navigation/kept-public-answers';
import { LOOK_BACK_PAGE_SIZE, NEWS_PAGE_SIZE, PROJECTS_PAGE_SIZE } from './content-page-sizes';
import { HomeApi } from './home-api';
import { NewsApi } from './news-api';
import { ProjectsApi } from './projects-api';

export const CONTENT_AHEAD_AFTER_MS = 1500;
export const HOVER_INTENT_MS = 80;

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
  private hovered: {
    readonly link: HTMLAnchorElement;
    readonly timer: ReturnType<typeof setTimeout>;
  } | null = null;

  constructor() {
    const intent = (event: Event) => this.articleAhead(linkOf(event.target));
    const resting = (event: Event) => this.restOn(linkOf(event.target));
    const leaving = (event: Event) => this.leave(event as MouseEvent);
    const listeners: [string, (event: Event) => void][] = [
      ['pointerdown', intent],
      ['focusin', intent],
      ['mouseover', resting],
      ['mouseout', leaving],
    ];
    for (const [name, listener] of listeners) {
      this.document.addEventListener(name, listener, { capture: true, passive: true });
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
      this.stopResting();
      for (const [name, listener] of listeners) {
        this.document.removeEventListener(name, listener, { capture: true });
      }
    });
  }

  private tabsAhead(): void {
    this.waiting = setTimeout(() => this.askForTabs(), CONTENT_AHEAD_AFTER_MS);
  }

  private restOn(link: HTMLAnchorElement | null): void {
    if (link === null || this.hovered?.link === link) {
      return;
    }
    this.stopResting();
    this.hovered = { link, timer: setTimeout(() => this.articleAhead(link), HOVER_INTENT_MS) };
  }

  private leave(event: MouseEvent): void {
    const hovered = this.hovered;
    if (hovered === null) {
      return;
    }
    const into = event.relatedTarget;
    if (!(into instanceof Node) || !hovered.link.contains(into)) {
      this.stopResting();
    }
  }

  private stopResting(): void {
    if (this.hovered !== null) {
      clearTimeout(this.hovered.timer);
      this.hovered = null;
    }
  }

  private articleAhead(link: HTMLAnchorElement | null): void {
    if (link === null || link.origin !== this.document.location.origin) {
      return;
    }
    const article = ARTICLE_LINK.exec(link.pathname);
    if (article === null || this.savesData() || this.connectivity.offline()) {
      return;
    }
    const slug = decodeURIComponent(article[2]);
    const context = askedAhead(refreshedAfterKeptCopy());
    this.ask(
      article[1] === 'aktuality'
        ? this.newsApi.publishedBySlug(slug, context)
        : this.projectsApi.publishedBySlug(slug, context),
    );
  }

  private askForTabs(): void {
    if (this.savesData() || this.connectivity.offline()) {
      return;
    }
    this.ask(this.homeApi.load(askedAhead(refreshedAfterKeptCopy())));
    this.ask(
      this.newsApi.publishedWithLatest(0, NEWS_PAGE_SIZE, askedAhead(refreshedAfterKeptCopy())),
    );
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

function linkOf(target: EventTarget | null): HTMLAnchorElement | null {
  const link = target instanceof Element ? target.closest('a[href]') : null;
  return link instanceof HTMLAnchorElement ? link : null;
}
