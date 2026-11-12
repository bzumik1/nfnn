import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
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
): Promise<{ fixture: ComponentFixture<ContentDetail>; http: HttpTestingController }> {
  await TestBed.configureTestingModule({
    imports: [ContentDetail],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
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
  return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Given a visitor opening a news article', () => {
  let fixture: ComponentFixture<ContentDetail>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp('news', 'zahrada-pro-deti'));
  });

  afterEach(() => http.verify());

  it('when the article arrives, then the page shows its tag and date, title, perex, photo and paragraphs and names the tab after it', async () => {
    http.expectOne('/api/content/news/zahrada-pro-deti').flush(newsArticle());
    await settle(fixture);

    expect(text(fixture, '.ui-intro__meta')).toBe('Projekt · 20. 10. 2026');
    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(text(fixture, '.ui-intro__lead')).toBe(newsArticle().perex);
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.prose p') as NodeListOf<Element>).map(
        (paragraph) => paragraph.textContent,
      ),
    ).toEqual(['První odstavec textu.', 'Druhý odstavec textu.']);
    const image = fixture.nativeElement.querySelector('.photo img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(`/api/content/media/${IMAGE_ID}?w=960`);
    expect(image.getAttribute('srcset')).toContain(`/api/content/media/${IMAGE_ID}?w=1440 1440w`);
    expect(image.getAttribute('alt')).toBe('');
    expect(TestBed.inject(Title).getTitle()).toBe('Zahrada pro děti | Nová naděje – nadační fond');
    expect(text(fixture, '.crumbs a')).toBe('← Všechny aktuality');
    expect(fixture.nativeElement.querySelector('.crumbs a').getAttribute('href')).toBe(
      '/aktuality',
    );
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
    expect(text(fixture, '.ui-intro__lead')).toBe('Tato aktualita už na webu není.');
    expect(TestBed.inject(Title).getTitle()).toBe(
      'Stránka nenalezena | Nová naděje – nadační fond',
    );
  });

  it('when the server fails, then an alert offers a retry that asks again', async () => {
    http
      .expectOne('/api/content/news/zahrada-pro-deti')
      .flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(fixture, '[role="alert"]')).toBe('Stránku se nepodařilo načíst.');
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
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

  afterEach(() => http.verify());

  it('when the project arrives, then the page shows its tag and year and leads back to the projects', async () => {
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(project());
    await settle(fixture);

    expect(text(fixture, '.ui-intro__meta')).toBe('Projekt · 2024');
    expect(text(fixture, 'h1')).toBe('Zahrada pro děti');
    expect(text(fixture, '.crumbs a')).toBe('← Kde pomáháme');
    expect(fixture.nativeElement.querySelector('.crumbs a').getAttribute('href')).toBe('/projekty');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.actions a') as NodeListOf<Element>).map(
        (link) => [link.getAttribute('href'), link.textContent?.trim()],
      ),
    ).toEqual([
      ['/prispet', 'Přispět'],
      ['/projekty', 'Kde všude pomáháme'],
    ]);
    expect(text(fixture, '.actions-lead')).toBe(
      'Chcete pomoct dalším dětem? Přispějte na jejich pomůcky.',
    );
  });

  it('when the project is unknown, then the page says it was not found', async () => {
    const { body, options } = problem(404, 'content/project-not-found');
    http.expectOne('/api/content/projects/zahrada-pro-deti').flush(body, options);
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('app-not-found')).not.toBeNull();
    expect(text(fixture, 'app-not-found a')).toBe('Kde všude pomáháme');
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

  afterEach(() => http.verify());

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
    expect((await shown()).querySelector('h1')?.textContent?.trim()).toBe('Zahrada pro děti');

    asked.flush(newsArticle({ title: 'Zahrada pro děti je hotová' }));
    expect((await shown()).querySelector('h1')?.textContent?.trim()).toBe(
      'Zahrada pro děti je hotová',
    );
  });

  it('when the article cannot be asked for again, then the article they saw stays shown', async () => {
    await readAndLeave();

    await harness.navigateByUrl('/aktuality/zahrada-pro-deti');
    http.expectOne(ARTICLE).flush(null, { status: 0, statusText: 'Unknown Error' });

    const page = await shown();
    expect(page.querySelector('h1')?.textContent?.trim()).toBe('Zahrada pro děti');
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
    expect((await shown()).querySelector('h1')?.textContent?.trim()).toBe('Zahrada pro děti');
  });
});
