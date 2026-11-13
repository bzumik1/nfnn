import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { PROBE_PATH } from '../../../core/connectivity/connectivity';
import { connectivityInterceptor } from '../../../core/connectivity/connectivity-interceptor';
import { keptAnswerRefreshInterceptor } from '../../../core/connectivity/kept-answer-refresh';
import { serviceWorkerBypassInterceptor } from '../../../core/updates/service-worker-bypass';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { PublishedStories, PublishedStoriesStore } from './published-stories';

const PROJECTS = '/api/content/projects';
const NEWS = '/api/content/news';

describe('Given the published stories of the foundation', () => {
  let store: PublishedStoriesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(PublishedStoriesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function answerProjects(page: number, slugs: string[], hasMore: boolean): void {
    const request = http.expectOne((r) => r.url === PROJECTS && r.params.get('page') === `${page}`);
    expect(request.request.params.get('size')).toBe('50');
    request.flush({
      items: slugs.map((slug) => project({ id: slug, slug })),
      page,
      size: 50,
      total: 60,
      hasMore,
    });
  }

  it('when they load, then every page of projects comes in order, with the year each news article looks back on, and the store keeps them', () => {
    let received: PublishedStories | undefined;
    store.load().subscribe((stories) => (received = stories));

    http
      .expectOne((r) => r.url === NEWS && r.params.get('size') === '50')
      .flush({
        items: [
          newsArticle({ slug: 'ohlednuti-2025', lookBackYear: 2025 }),
          newsArticle({ slug: 'koncert', lookBackYear: null }),
          newsArticle({ slug: 'starsi' }),
        ],
        page: 0,
        size: 50,
        total: 3,
        hasMore: false,
      });
    answerProjects(0, ['prvni', 'druhy'], true);
    answerProjects(1, ['treti'], false);

    expect(received?.projects.map((item) => item.slug)).toEqual(['prvni', 'druhy', 'treti']);
    expect(received?.lookBacks).toEqual([{ year: 2025, slug: 'ohlednuti-2025' }]);
    expect(store.stories()).toEqual(received);
  });

  it('when an older look-back stands on a later page of news, then the news are read page by page and its year still leads to it', () => {
    let received: PublishedStories | undefined;
    store.load().subscribe((stories) => (received = stories));

    http
      .expectOne((r) => r.url === NEWS && r.params.get('page') === '0')
      .flush({
        items: [newsArticle({ slug: 'ohlednuti-2025', lookBackYear: 2025 })],
        page: 0,
        size: 50,
        total: 51,
        hasMore: true,
      });
    http
      .expectOne((r) => r.url === NEWS && r.params.get('page') === '1')
      .flush({
        items: [newsArticle({ slug: 'ohlednuti-2019', lookBackYear: 2019 })],
        page: 1,
        size: 50,
        total: 51,
        hasMore: false,
      });
    answerProjects(0, ['prvni'], false);

    expect(received?.lookBacks).toEqual([
      { year: 2025, slug: 'ohlednuti-2025' },
      { year: 2019, slug: 'ohlednuti-2019' },
    ]);
  });

  it('when the news cannot be read, then the projects still come, only without the look-backs', () => {
    let received: PublishedStories | undefined;
    store.load().subscribe((stories) => (received = stories));

    http.expectOne((r) => r.url === NEWS).flush(null, { status: 503, statusText: 'Down' });
    answerProjects(0, ['prvni'], false);

    expect(received).toEqual({
      projects: [project({ id: 'prvni', slug: 'prvni' })],
      lookBacks: [],
    });
  });

  it('when the projects cannot be read, then the load fails and the store keeps what it had', () => {
    let failed = false;
    store.load().subscribe({ error: () => (failed = true) });

    http
      .expectOne((r) => r.url === NEWS)
      .flush({ items: [], page: 0, size: 50, total: 0, hasMore: false });
    http.expectOne((r) => r.url === PROJECTS).flush(null, { status: 503, statusText: 'Down' });

    expect(failed).toBe(true);
    expect(store.stories()).toBeNull();
  });
});

describe('Given the published stories the service worker kept from an earlier visit', () => {
  let store: PublishedStoriesStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(
          withInterceptors([
            keptAnswerRefreshInterceptor,
            serviceWorkerBypassInterceptor,
            connectivityInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(PublishedStoriesStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
    http.verify();
  });

  it('when the worker answers from its copies and the network past it would hang (a phone in airplane mode), then the stories come from the copies at once and nothing waits on the network', () => {
    const kept = { headers: { Date: new Date(Date.now() - 600_000).toUTCString() } };
    let received: PublishedStories | undefined;
    store.load().subscribe((stories) => (received = stories));

    http
      .expectOne((r) => r.url === NEWS && !r.headers.has('ngsw-bypass'))
      .flush({ items: [], page: 0, size: 50, total: 0, hasMore: false }, kept);
    http
      .expectOne((r) => r.url === PROJECTS && !r.headers.has('ngsw-bypass'))
      .flush(
        {
          items: [project({ id: 'prvni', slug: 'prvni' })],
          page: 0,
          size: 50,
          total: 1,
          hasMore: false,
        },
        kept,
      );

    expect(received?.projects.map((item) => item.slug)).toEqual(['prvni']);
    http.expectNone((r) => r.url !== PROBE_PATH && r.headers.has('ngsw-bypass'));
  });
});
