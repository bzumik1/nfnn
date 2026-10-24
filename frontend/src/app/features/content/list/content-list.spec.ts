import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContentKind } from '../detail/content-detail';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { ContentList } from './content-list';

async function setUp(
  kind: ContentKind,
  query: Record<string, string> = {},
): Promise<{ fixture: ComponentFixture<ContentList>; http: HttpTestingController }> {
  await TestBed.configureTestingModule({
    imports: [ContentList],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { kind } }, queryParamMap: of(convertToParamMap(query)) },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ContentList);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function link(fixture: ComponentFixture<unknown>, name: string): HTMLAnchorElement | undefined {
  return Array.from(
    fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
  ).find((anchor) => anchor.textContent?.replace(/\s+/g, ' ').trim() === name);
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function page<T>(items: T[], pageIndex: number, total: number) {
  return { items, page: pageIndex, size: 10, total, hasMore: (pageIndex + 1) * 10 < total };
}

describe('Given a visitor opening the list of news', () => {
  let fixture: ComponentFixture<ContentList>;
  let http: HttpTestingController;

  afterEach(() => http.verify());

  describe('when the first page arrives', () => {
    beforeEach(async () => {
      ({ fixture, http } = await setUp('news'));
      http
        .expectOne('/api/content/news?page=0&size=10')
        .flush(
          page([newsArticle(), newsArticle({ id: 'b', slug: 'koncert', title: 'Koncert' })], 0, 25),
        );
      await settle(fixture);
    });

    it('then the page is named, each article links to itself and the count of pages shows', () => {
      expect(text(fixture, 'h1')).toBe('Aktuality');
      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll('.news-title a') as NodeListOf<Element>,
        ).map((anchor) => [anchor.getAttribute('href'), anchor.textContent?.trim()]),
      ).toEqual([
        ['/aktuality/zahrada-pro-deti', 'Zahrada pro děti'],
        ['/aktuality/koncert', 'Koncert'],
      ]);
      expect(text(fixture, '.pages-position')).toBe('Strana 1 z 3');
    });

    it('then only older articles are offered, in a named navigation', () => {
      const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
      expect(nav.getAttribute('aria-label')).toBe('Stránky aktualit');
      expect(link(fixture, 'Starší →')?.getAttribute('href')).toBe('/aktuality?strana=2');
      expect(link(fixture, '← Novější')).toBeUndefined();
    });
  });

  it('when a middle page is asked for, then it loads that page and offers both directions', async () => {
    ({ fixture, http } = await setUp('news', { strana: '2' }));
    http.expectOne('/api/content/news?page=1&size=10').flush(page([newsArticle()], 1, 25));
    await settle(fixture);

    expect(text(fixture, '.pages-position')).toBe('Strana 2 z 3');
    expect(link(fixture, '← Novější')?.getAttribute('href')).toBe('/aktuality');
    expect(link(fixture, 'Starší →')?.getAttribute('href')).toBe('/aktuality?strana=3');
  });

  it('when the page number is not a page, then the first page loads', async () => {
    ({ fixture, http } = await setUp('news', { strana: 'nula' }));
    http.expectOne('/api/content/news?page=0&size=10').flush(page([newsArticle()], 0, 1));
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('nav.pages')).toBeNull();
  });

  it('when nothing is published yet, then the page says so', async () => {
    ({ fixture, http } = await setUp('news'));
    http.expectOne('/api/content/news?page=0&size=10').flush(page([], 0, 0));
    await settle(fixture);

    expect(text(fixture, '.list-state')).toBe('Zatím tu žádná aktualita není.');
    expect(fixture.nativeElement.querySelector('nav.pages')).toBeNull();
  });

  it('when the list fails, then an alert offers to try again and the retry loads it', async () => {
    ({ fixture, http } = await setUp('news'));
    expect(text(fixture, '.list-state')).toBe('Načítáme aktuality…');
    http
      .expectOne('/api/content/news?page=0&size=10')
      .flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(fixture, '[role="alert"]')).toBe('Seznam se nepodařilo načíst.');
    (fixture.nativeElement.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne('/api/content/news?page=0&size=10').flush(page([newsArticle()], 0, 1));
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.news-card')).toHaveLength(1);
  });
});

describe('Given a visitor opening the list of projects', () => {
  let fixture: ComponentFixture<ContentList>;
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('when the projects arrive, then each project card links to its page', async () => {
    ({ fixture, http } = await setUp('project'));
    http.expectOne('/api/content/projects?page=0&size=10').flush(page([project()], 0, 11));
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Projekty');
    expect(fixture.nativeElement.querySelector('app-project-card a').getAttribute('href')).toBe(
      '/projekty/zahrada-pro-deti',
    );
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Stránky projektů',
    );
    expect(link(fixture, 'Starší →')?.getAttribute('href')).toBe('/projekty?strana=2');
  });

  it('when nothing is published yet, then the page says so', async () => {
    ({ fixture, http } = await setUp('project'));
    http.expectOne('/api/content/projects?page=0&size=10').flush(page([], 0, 0));
    await settle(fixture);

    expect(text(fixture, '.list-state')).toBe('Zatím tu žádný projekt není.');
  });
});
