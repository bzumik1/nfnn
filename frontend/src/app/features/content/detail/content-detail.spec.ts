import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  RouteReuseStrategy,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { IMAGE_ID, newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { ContentDetail } from './content-detail';
import { NOT_FOUND_TITLE } from '../not-found/not-found';
import { ContentKind } from './content-page';
import { PROBE_PATH } from '../../../core/connectivity/connectivity';
import { connectivityInterceptor } from '../../../core/connectivity/connectivity-interceptor';
import { keptAnswerRefreshInterceptor } from '../../../core/connectivity/kept-answer-refresh';
import { serviceWorkerBypassInterceptor } from '../../../core/updates/service-worker-bypass';
import { KeptTabPages } from '../../../core/navigation/kept-tab-pages';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({ template: '' })
class OtherTab {}

function problem(status: number, type: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title: 'Nenalezeno', detail: '', status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

async function setUp(
  kind: ContentKind,
  slug: string,
  compact = false,
): Promise<{ fixture: ComponentFixture<ContentDetail>; http: HttpTestingController }> {
  await TestBed.configureTestingModule({
    imports: [ContentDetail],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: CompactLayout, useValue: { isCompact: signal(compact).asReadonly() } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ slug }), data: { kind } } },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ContentDetail);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return (withOrdinarySpaces(fixture.nativeElement.querySelector(selector)?.textContent) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function isList(request: { url: string }): boolean {
  return request.url === '/api/content/news' || request.url === '/api/content/projects';
}

function leaveListsUnanswered(http: HttpTestingController): void {
  for (const request of http.match(isList)) {
    if (!request.cancelled) {
      request.flush(null, { status: 500, statusText: 'Error' });
    }
  }
}

function listPage<T>(items: T[]) {
  return { items, page: 0, size: items.length, total: items.length, hasMore: false };
}

function onward(fixture: ComponentFixture<unknown>): HTMLElement | null {
  return fixture.nativeElement.querySelector('aside');
}

function onwardTitles(fixture: ComponentFixture<unknown>): string[] {
  return Array.from((onward(fixture)?.querySelectorAll('h3') ?? []) as NodeListOf<Element>).map(
    (title) => withOrdinarySpaces(title.textContent)?.trim() ?? '',
  );
}

function headingOf(region: HTMLElement): string {
  const id = region.getAttribute('aria-labelledby') ?? '';
  return withOrdinarySpaces(region.ownerDocument.getElementById(id)?.textContent)?.trim() ?? '';
}

function follows(earlier: Element, later: Element): boolean {
  return Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('Given a visitor opening a news article', () => {
  let fixture: ComponentFixture<ContentDetail>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp('news', 'zahrada-pro-deti'));
  });

  afterEach(() => {
    leaveListsUnanswered(http);
    http.verify();
  });

  it('when the article arrives, then the page shows its tag and date, title, perex, photo and paragraphs and names the tab after it', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);

    expect(text(fixture, '.ui-intro__meta')).toBe('Projekt · 20. 10. 2026');
    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(text(fixture, '.ui-intro__lead')).toBe(newsArticle().perex);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.prose p') as NodeListOf<Element>).map(
        (paragraph) => withOrdinarySpaces(paragraph.textContent),
      ),
    ).toEqual(['První odstavec textu.', 'Druhý odstavec textu.']);
    const image = fixture.nativeElement.querySelector('.photo img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=960`);
    expect(image.getAttribute('srcset')).toContain(`/api/content/media/${IMAGE_ID}?w=1440 1440w`);
    expect(image.getAttribute('alt')).toBe('');
    expect(TestBed.inject(Title).getTitle()).toBe('Zahrada pro děti | Nová naděje – nadační fond');
  });

  it('when the article and the newest news arrive, then a side region after the article offers the newest other news under its own heading', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);
    http
      .expectOne(
        (request) =>
          request.url === '/api/content/news' &&
          request.params.get('page') === '0' &&
          request.params.get('size') === '4',
      )
      .flush(
        listPage([
          newsArticle({ id: 'n1', slug: 'letni-tabor', title: 'Letní tábor' }),
          newsArticle(),
          newsArticle({ id: 'n2', slug: 'novy-vozik', title: 'Nový vozík' }),
          newsArticle({ id: 'n3', slug: 'koncert', title: 'Koncert' }),
        ]),
      );
    await settle(fixture);

    const region = onward(fixture)!;
    expect(region).not.toBeNull();
    expect(headingOf(region)).toBe('Další aktuality');
    expect(onwardTitles(fixture)).toEqual(['Letní tábor', 'Nový vozík', 'Koncert']);
    expect(follows(fixture.nativeElement.querySelector('article.detail'), region)).toBe(true);
    expect(fixture.nativeElement.querySelector('article.detail').contains(region)).toBe(false);
  });

  it('when no other news is published, then no side region is shown', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush(listPage([newsArticle()]));
    await settle(fixture);

    expect(onward(fixture)).toBeNull();
  });

  it('when the newest news cannot be loaded, then the article stays and no side region is shown', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);
    leaveListsUnanswered(http);
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(onward(fixture)).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('when the article answers under its newer address, then the address bar shows the newer one', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    http
      .expectOne('/api/content/news/zahrada-pro-deti')
      .flush(newsArticle({ slug: 'nova-zahrada' }));
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(navigate).toHaveBeenCalledWith(['/aktuality', 'nova-zahrada'], { replaceUrl: true });
  });

  it('when the article answers under the address it was asked for, then the address stays', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);

    expect(navigate).not.toHaveBeenCalled();
  });

  it('when the body uses Markdown and the photo has a description, then the text is formatted and the photo is described', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(
      newsArticle({
        body: '## Co jsme koupili\n\nDíky vám **nový vozík**.\n\n- vozík\n- lůžko',
        coverImage: {
          id: IMAGE_ID,
          url: `/api/content/media/${IMAGE_ID}`,
          alt: 'Děti sázejí stromek',
          focalPoint: null,
        },
      }),
    );
    await settle(fixture);

    expect(text(fixture, '.prose h2')).toBe('Co jsme koupili');
    expect(text(fixture, '.prose strong')).toBe('nový vozík');
    expect(fixture.nativeElement.querySelectorAll('.prose li')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.photo img').getAttribute('alt')).toBe(
      'Děti sázejí stromek',
    );
  });

  it('when the article has no photo and no tag, then the page shows the date alone and no figure', async () => {
    http
      .expectOne('/api/content/news/zahrada-pro-deti')
      .flush(newsArticle({ tag: null, coverImage: null }));
    await settle(fixture);

    expect(text(fixture, '.ui-intro__meta')).toBe('20. 10. 2026');
    expect(fixture.nativeElement.querySelector('.photo')).toBeNull();
  });

  it('when the article is unknown, then the page says it was not found', async () => {
    const { body, options } = problem(404, 'content/news-not-found');
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(body, options);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-not-found')).not.toBeNull();
    expect(text(fixture, 'h1')).toBe('Tuhle stránku jsme nenašli');
    expect(text(fixture, '.ui-intro__lead')).toBe('Tahle aktualita už na webu není.');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Stránka nenalezena | Nová naděje – nadační fond',
    );
  });

  it('when the server fails, then an alert offers a retry that asks again', async () => {
    http
      .expectOne('/api/content/news/zahrada-pro-deti')
      .flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    const notice = fixture.nativeElement.querySelector('.ui-notice[role="alert"]');
    expect(withOrdinarySpaces(notice?.textContent)?.trim()).toBe(
      'Aktualitu se nepodařilo načíst. Zkuste to znovu.',
    );
    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(withOrdinarySpaces(retry.textContent)?.trim()).toBe('Zkusit znovu');
    retry.click();
    await settle(fixture);
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
  });
});

describe('Given a visitor opening a project', () => {
  let fixture: ComponentFixture<ContentDetail>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp('project', 'zahrada-pro-deti'));
  });

  afterEach(() => {
    leaveListsUnanswered(http);
    http.verify();
  });

  it('when the project arrives, then the page shows its tag and year and leads back to the projects', async () => {
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(project());
    await settle(fixture);

    expect(text(fixture, '.ui-intro__meta')).toBe('Projekt · 2024');
    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(fixture.nativeElement.querySelector('.crumbs')).toBeNull();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.actions a') as NodeListOf<Element>).map(
        (link) => [link.getAttribute('href'), withOrdinarySpaces(link.textContent)?.trim()],
      ),
    ).toEqual([
      ['/prispet', 'Přispět'],
      ['/projekty', 'Kde pomáháme'],
    ]);
    expect(text(fixture, '.actions-lead')).toBe(
      'Chcete pomoct dalším dětem? Přispějte na jejich pomůcky.',
    );
  });

  it('when the published stories arrive, then a side region after the article offers the other stories of the same year under its own heading', async () => {
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(project());
    await settle(fixture);
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush(
        listPage([
          project({ id: 'p1', slug: 'eliska', title: 'Eliška, 5 let' }),
          project(),
          project({ id: 'p2', slug: 'jan', title: 'Jan, 9 let', year: 2023 }),
          project({ id: 'p3', slug: 'adam', title: 'Adam, 12 let' }),
        ]),
      );
    leaveListsUnanswered(http);
    await settle(fixture);

    const region = onward(fixture)!;
    expect(region).not.toBeNull();
    expect(headingOf(region)).toBe('Další příběhy z roku 2024');
    expect(onwardTitles(fixture)).toEqual(['Eliška, 5 let', 'Adam, 12 let']);
    expect(follows(fixture.nativeElement.querySelector('article.detail'), region)).toBe(true);
  });

  it('when the server fails, then an alert names the story and offers a retry', async () => {
    http
      .expectOne('/api/content/projects/zahrada-pro-deti')
      .flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    const notice = fixture.nativeElement.querySelector('.ui-notice[role="alert"]');
    expect(withOrdinarySpaces(notice?.textContent)?.trim()).toBe(
      'Příběh se nepodařilo načíst. Zkuste to znovu.',
    );
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await settle(fixture);
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(project());
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
  });

  it('when the project is unknown, then the page says it was not found', async () => {
    const { body, options } = problem(404, 'content/project-not-found');
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(body, options);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-not-found')).not.toBeNull();
    expect(text(fixture, 'app-not-found a')).toBe('Kde pomáháme');
  });
});

describe('Given a visitor on a phone opening a news article and then a project', () => {
  it('when each arrives, then a text link above the title and the last button lead back to its list', async () => {
    const { fixture, http } = await setUp('news', 'zahrada-pro-deti', true);
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);

    expect(text(fixture, '.crumbs a')).toBe('← Všechny aktuality');
    expect(fixture.nativeElement.querySelector('.crumbs a').getAttribute('href')).toBe(
      '/aktuality',
    );
    expect(text(fixture, '.actions a.ui-cta--ghost')).toBe('Zpět na aktuality');
    leaveListsUnanswered(http);
    http.verify();
  });

  it('when a project arrives, then the text link above the title leads back to the stories', async () => {
    const { fixture, http } = await setUp('project', 'zahrada-pro-deti', true);
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(project());
    await settle(fixture);

    expect(text(fixture, '.crumbs a')).toBe('← Kde pomáháme');
    expect(fixture.nativeElement.querySelector('.crumbs a').getAttribute('href')).toBe('/projekty');
    expect(text(fixture, '.actions a.ui-cta--ghost')).toBe('Kde všude pomáháme');
    leaveListsUnanswered(http);
    http.verify();
  });
});

describe('Given a visitor opening a news article the service worker kept from an earlier visit', () => {
  const ARTICLE = '/api/content/news/zahrada-pro-deti';
  let fixture: ComponentFixture<ContentDetail>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContentDetail],
      providers: [
        provideHttpClient(
          withInterceptors([
            keptAnswerRefreshInterceptor,
            serviceWorkerBypassInterceptor,
            connectivityInterceptor,
          ]),
        ),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ slug: 'zahrada-pro-deti' }),
              data: { kind: 'news' },
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ContentDetail);
    fixture.detectChanges();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
    leaveListsUnanswered(http);
    http.verify();
  });

  it('when the kept copy and then the server answer arrive, then the page shows the copy at once and then what the server says', async () => {
    http
      .expectOne((request) => request.url === ARTICLE && !request.headers.has('ngsw-bypass'))
      .flush(newsArticle(), { headers: { Date: new Date(Date.now() - 600_000).toUTCString() } });
    await settle(fixture);
    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');

    http
      .expectOne((request) => request.url === ARTICLE && request.headers.has('ngsw-bypass'))
      .flush(newsArticle({ title: 'Zahrada pro děti je hotová' }), {
        headers: { Date: new Date().toUTCString() },
      });
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Zahrada pro děti je hotová');
  });
});

describe('Given an article kept while the visitor is on another tab', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  const ARTICLE = '/api/content/news/zahrada-pro-deti';

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'aktuality/:slug',
            title: 'Aktualita | Nová naděje – nadační fond',
            data: { kind: 'news' },
            component: ContentDetail,
          },
          { path: 'o-nas', title: 'O nás | Nová naděje – nadační fond', component: OtherTab },
        ]),
        { provide: RouteReuseStrategy, useExisting: KeptTabPages },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
  });

  afterEach(() => {
    leaveListsUnanswered(http);
    http.verify();
  });

  async function shown(): Promise<HTMLElement> {
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement!;
  }

  async function readAndLeave(): Promise<void> {
    http.expectOne(ARTICLE).flush(newsArticle());
    await harness.fixture.whenStable();
    await harness.navigateByUrl('/o-nas');
  }

  it('when the visitor returns, then the tab is named after the article at once and the article is asked for again behind it', async () => {
    await readAndLeave();

    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
    const asked = http.expectOne(ARTICLE);

    expect(TestBed.inject(Title).getTitle()).toBe('Zahrada pro děti | Nová naděje – nadační fond');
    expect(withOrdinarySpaces((await shown()).querySelector('h1')?.textContent)?.trim()).toBe(
      'Zahrada pro děti',
    );

    asked.flush(newsArticle({ title: 'Zahrada pro děti je hotová' }));
    expect(withOrdinarySpaces((await shown()).querySelector('h1')?.textContent)?.trim()).toBe(
      'Zahrada pro děti je hotová',
    );
  });

  it('when the article cannot be asked for again, then the article they saw stays shown', async () => {
    await readAndLeave();

    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
    http.expectOne(ARTICLE).flush(null, { status: 0, statusText: 'Unknown Error' });

    const page = await shown();
    expect(withOrdinarySpaces(page.querySelector('h1')?.textContent)?.trim()).toBe(
      'Zahrada pro děti',
    );
    expect(page.querySelector('[role="alert"]')).toBeNull();
  });

  it('when a missing article is left for another tab, then that page is not kept from search engines, and on return the article is again named as missing', async () => {
    const gone = problem(404, 'content/news-not-found');
    http.expectOne(ARTICLE).flush(gone.body, gone.options);
    await harness.fixture.whenStable();
    const robots = () => document.head.querySelector('meta[name="robots"]');
    expect(robots()).not.toBeNull();

    await harness.navigateByUrl('/o-nas');
    expect(robots()).toBeNull();

    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
    await Promise.resolve();
    expect(TestBed.inject(Title).getTitle()).toBe(NOT_FOUND_TITLE);
    expect(robots()).not.toBeNull();

    http.expectOne(ARTICLE).flush(gone.body, gone.options);
    await shown();
    expect(TestBed.inject(Title).getTitle()).toBe(NOT_FOUND_TITLE);
  });

  it('when the visitor leaves before the article arrives, then its answer neither names the tab nor leads anywhere, and it is asked for again on return', async () => {
    const pending = http.expectOne(ARTICLE);
    await harness.navigateByUrl('/o-nas');

    expect(pending.cancelled).toBe(true);
    expect(TestBed.inject(Title).getTitle()).toBe('O nás | Nová naděje – nadační fond');

    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
    http.expectOne(ARTICLE).flush(newsArticle());
    expect(withOrdinarySpaces((await shown()).querySelector('h1')?.textContent)?.trim()).toBe(
      'Zahrada pro děti',
    );
  });
});
