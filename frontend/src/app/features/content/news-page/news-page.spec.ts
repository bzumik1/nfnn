import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Connectivity } from '../../../core/navigation/connectivity';
import { ProjectResponse } from '../projects-api';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { MAX_PROJECT_PAGES, NewsPage } from './news-page';

const NEWS = (page: number) => `/api/content/news?page=${page}&size=10`;
const PROJECTS = (page: number) => `/api/content/projects?page=${page}&size=50`;

async function setUp(
  query: Record<string, string> | Observable<ParamMap> = {},
  offline = false,
): Promise<{ fixture: ComponentFixture<NewsPage>; http: HttpTestingController }> {
  await TestBed.configureTestingModule({
    imports: [NewsPage],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: query instanceof Observable ? query : of(convertToParamMap(query)),
        },
      },
      { provide: Connectivity, useValue: { isOffline: () => offline } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(NewsPage);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function text(root: ParentNode | null | undefined, selector: string): string {
  return (root?.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function texts(root: ParentNode, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector)).map((element) =>
    (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function link(root: ParentNode, name: string): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll('a')).find(
    (anchor) => anchor.textContent?.replace(/\s+/g, ' ').trim() === name,
  );
}

function buttonNames(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('button')).map((button) =>
    (button.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

function page<T>(items: T[], pageIndex: number, total: number, size = 10) {
  return { items, page: pageIndex, size, total, hasMore: (pageIndex + 1) * size < total };
}

const lookBack2025 = newsArticle({
  id: 'n1',
  slug: 'ohlednuti-za-rokem-2025',
  title: 'Ohlédnutí za rokem 2025',
  tag: 'Výroční ohlédnutí',
  perex: 'I v roce 2025 jsme díky vám mohli přinášet naději.',
  publishedOn: '2026-02-15',
  signer: {
    id: 'p1',
    name: 'Pavel Vzorový',
    role: 'Předseda správní rady',
    portrait: { id: 'portrait-1', url: '/api/content/media/portrait-1', width: 600, height: 600 },
  },
});
const lookBack2024 = newsArticle({
  id: 'n2',
  slug: 'ohlednuti-za-rokem-2024',
  title: 'Ohlédnutí za rokem 2024',
  publishedOn: '2025-02-15',
});
const lookBack2023 = newsArticle({
  id: 'n3',
  slug: 'ohlednuti-za-rokem-2023',
  title: 'Ohlédnutí za rokem 2023',
  publishedOn: '2024-01-15',
  coverImage: null,
});

function story(slug: string, year: number, title: string): ProjectResponse {
  return project({ id: slug, slug, year, title, tag: 'Rehabilitace' });
}

const sofinka = story('sofinka', 2025, 'Sofinka');
const miki = story('miki', 2025, 'Miki a jeho první krůčky');
const nelinka = story('nelinka', 2025, 'Nelinka');

describe('Given a visitor opening Aktuality', () => {
  let fixture: ComponentFixture<NewsPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  beforeEach(() => {
    Object.defineProperty(navigator, 'share', {
      value: () => Promise.resolve(),
      configurable: true,
    });
  });

  afterEach(() => {
    http.verify();
    Reflect.deleteProperty(navigator, 'share');
  });

  describe('when the first page of news and the projects arrive', () => {
    beforeEach(async () => {
      ({ fixture, http } = await setUp());
      root = fixture.nativeElement;
      http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024, lookBack2023], 0, 3));
      http
        .expectOne(PROJECTS(0))
        .flush(page([sofinka, miki, story('zahrada', 2024, 'Zahrada'), nelinka], 0, 4, 50));
      await settle(fixture);
    });

    it('then the page is named and the newest news leads it, large, with its signer', () => {
      expect(text(root, 'h1')).toBe('Co je u nás nového');
      const featured = root.querySelector('.featured') as HTMLElement;
      expect(text(featured, 'h2')).toBe('Ohlédnutí za rokem 2025');
      expect(link(featured, 'Číst celé Ohlédnutí za rokem 2025')?.getAttribute('href')).toBe(
        '/aktuality/ohlednuti-za-rokem-2025',
      );
      expect(text(featured, '.featured-meta')).toBe('Výroční ohlédnutí 15. 02. 2026');
      expect(text(featured, '.featured-perex')).toBe(
        'I v roce 2025 jsme díky vám mohli přinášet naději.',
      );
      expect(text(featured, '.signer-name')).toBe('Pavel Vzorový');
      expect(text(featured, '.signer-role')).toBe('Předseda správní rady');
    });

    it('then the photos are asked for only in the widths the server keeps', () => {
      const cover = `/api/content/media/${lookBack2025.coverImage!.id}`;
      const photo = root.querySelector('.featured img') as HTMLImageElement;
      expect(photo.getAttribute('srcset')).toBe(
        `${cover}?w=480 480w, ${cover}?w=960 960w, ${cover}?w=1440 1440w`,
      );
      expect(root.querySelector('.featured .signer-photo img')?.getAttribute('src')).toBe(
        '/api/content/media/portrait-1?w=480',
      );
      expect(
        Array.from(root.querySelectorAll('.story img')).map((image) => image.getAttribute('src')),
      ).toEqual(
        [sofinka, miki, nelinka].map((item) => `/api/content/media/${item.coverImage!.id}?w=480`),
      );
    });

    it('then the stories of the newest year with a project follow in the order the site keeps, each linking to its page', () => {
      const stories = root.querySelector('.stories') as HTMLElement;
      expect(text(stories, 'h2')).toBe('Příběhy z roku 2025');
      expect(texts(stories, 'h3')).toEqual(['Sofinka', 'Miki a jeho první krůčky', 'Nelinka']);
      expect(stories.querySelector('h3 a')?.getAttribute('href')).toBe('/projekty/sofinka');
      const all = link(stories, 'Všechny 3 v Pomáháme');
      expect(all?.getAttribute('href')).toBe('/projekty?rok=2025');
      expect(stories.querySelector('ul')?.hasAttribute('aria-label')).toBe(false);
    });

    it('then the older news follow as cards in a section of their own', () => {
      const older = root.querySelector('.older') as HTMLElement;
      expect(text(older, 'h2')).toBe('Starší zprávy');
      expect(texts(older, 'h3')).toEqual(['Ohlédnutí za rokem 2024', 'Ohlédnutí za rokem 2023']);
    });

    it('then every Sdílet button names the article it shares', () => {
      expect(buttonNames(root).filter((name) => name.startsWith('Sdílet'))).toEqual([
        'Sdílet Ohlédnutí za rokem 2025',
        'Sdílet Ohlédnutí za rokem 2024',
        'Sdílet Ohlédnutí za rokem 2023',
      ]);
    });

    it('then a single page offers no paging', () => {
      expect(root.querySelector('nav.pages')).toBeNull();
    });
  });

  it('when the projects come on more pages, then the stories count every project of the newest year', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    const first = Array.from({ length: 50 }, (_, index) => story(`a${index}`, 2024, `A ${index}`));
    http.expectOne(PROJECTS(0)).flush(page(first, 0, 52, 50));
    http
      .expectOne(PROJECTS(1))
      .flush(page([story('b1', 2025, 'B 1'), story('b2', 2026, 'B 2')], 1, 52, 50));
    await settle(fixture);

    expect(text(root, '.stories h2')).toBe('Příběhy z roku 2026');
    expect(link(root, 'Zobrazit v Pomáháme')?.getAttribute('href')).toBe('/projekty?rok=2026');
  });

  it('when five or more stories belong to the year, then the link counts them in the plural for many', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    http.expectOne(PROJECTS(0)).flush(
      page(
        Array.from({ length: 8 }, (_, index) => story(`s${index}`, 2025, `S ${index}`)),
        0,
        8,
        50,
      ),
    );
    await settle(fixture);

    expect(link(root, 'Všech 8 v Pomáháme')).toBeDefined();
  });

  it('when the news come before the projects, then the page waits for both, so nothing moves under the visitor', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 2));
    await settle(fixture);

    expect(text(root, '.list-state')).toBe('Načítáme aktuality…');
    expect(root.querySelector('.featured')).toBeNull();

    http.expectOne(PROJECTS(0)).flush(page([story('sofinka', 2025, 'Sofinka')], 0, 1, 50));
    await settle(fixture);

    expect(text(root, '.list-state')).toBe('');
    expect(root.querySelector('.featured')).not.toBeNull();
    expect(root.querySelector('.stories')).not.toBeNull();
  });

  it('when the projects run on past the pages it reads, then it stops asking', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    for (let index = 0; index < MAX_PROJECT_PAGES; index++) {
      http
        .expectOne(PROJECTS(index))
        .flush(page([story(`p${index}`, 2025, `P ${index}`)], index, 5000, 50));
    }
    await settle(fixture);

    http.expectNone(PROJECTS(MAX_PROJECT_PAGES));
    expect(text(root, '.stories h2')).toBe('Příběhy z roku 2025');
    expect(link(root, `Všech ${MAX_PROJECT_PAGES} v Pomáháme`)).toBeDefined();
  });

  it('when a project moves to the next page while the pages load, then its story shows once', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    const first = Array.from({ length: 50 }, (_, index) => story(`a${index}`, 2025, `A ${index}`));
    http.expectOne(PROJECTS(0)).flush(page(first, 0, 52, 50));
    http
      .expectOne(PROJECTS(1))
      .flush(page([story('a49', 2025, 'A 49'), story('b1', 2025, 'B 1')], 1, 52, 50));
    await settle(fixture);

    expect(texts(root, '.story h3').filter((title) => title === 'A 49')).toEqual(['A 49']);
    expect(root.querySelectorAll('.story').length).toBe(51);
  });

  it('when the visitor goes to an older page and back, then the projects are asked for once', async () => {
    const query = new BehaviorSubject(convertToParamMap({}));
    ({ fixture, http } = await setUp(query));
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 25));
    http.expectOne(PROJECTS(0)).flush(page([story('sofinka', 2025, 'Sofinka')], 0, 1, 50));
    await settle(fixture);

    query.next(convertToParamMap({ strana: '2' }));
    http.expectOne(NEWS(1)).flush(page([lookBack2023], 1, 25));
    await settle(fixture);
    expect(root.querySelector('.stories')).toBeNull();

    query.next(convertToParamMap({}));
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 25));
    await settle(fixture);

    http.expectNone(PROJECTS(0));
    expect(texts(root, '.story h3')).toEqual(['Sofinka']);
  });

  it('when the page changes before the news arrive, then the earlier answer is dropped', async () => {
    const query = new BehaviorSubject(convertToParamMap({ strana: '2' }));
    ({ fixture, http } = await setUp(query));
    root = fixture.nativeElement;
    const stale = http.expectOne(NEWS(1));

    query.next(convertToParamMap({ strana: '3' }));
    http.expectOne(NEWS(2)).flush(page([lookBack2023], 2, 25));
    await settle(fixture);

    expect(stale.cancelled).toBe(true);
    expect(texts(root, '.older h3')).toEqual(['Ohlédnutí za rokem 2023']);
    expect(text(root, '.pages-position')).toBe('Strana 3 z 3');
  });

  it('when no project is published, then there are no stories and the news stand alone', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 2));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(root.querySelector('.stories')).toBeNull();
    expect(texts(root, '.older h3')).toEqual(['Ohlédnutí za rokem 2024']);
  });

  it('when the projects fail, then the news still show and the stories are left out', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    http.expectOne(PROJECTS(0)).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(root.querySelector('.stories')).toBeNull();
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('when only one article is published, then it leads alone without an empty older section', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(root.querySelector('.older')).toBeNull();
  });

  describe('when there are more news than one page holds', () => {
    beforeEach(async () => {
      ({ fixture, http } = await setUp());
      root = fixture.nativeElement;
      http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 25));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await settle(fixture);
    });

    it('then older pages are offered in a named navigation', () => {
      const nav = root.querySelector('nav.pages') as HTMLElement;
      expect(nav.getAttribute('aria-label')).toBe('Stránky aktualit');
      expect(text(nav, '.pages-position')).toBe('Strana 1 z 3');
      expect(link(nav, 'Starší →')?.getAttribute('href')).toBe('/aktuality?strana=2');
      expect(link(nav, '← Novější')).toBeUndefined();
    });
  });

  describe('when a later page is asked for', () => {
    beforeEach(async () => {
      ({ fixture, http } = await setUp({ strana: '2' }));
      root = fixture.nativeElement;
      http.expectOne(NEWS(1)).flush(page([lookBack2024, lookBack2023], 1, 25));
      await settle(fixture);
    });

    it('then it shows only that page as cards, without a leading article or stories', () => {
      expect(root.querySelector('.featured')).toBeNull();
      expect(root.querySelector('.stories')).toBeNull();
      expect(texts(root, '.older h3')).toEqual([
        'Ohlédnutí za rokem 2024',
        'Ohlédnutí za rokem 2023',
      ]);
    });

    it('then both directions are offered', () => {
      expect(text(root, '.pages-position')).toBe('Strana 2 z 3');
      expect(link(root, '← Novější')?.getAttribute('href')).toBe('/aktuality');
      expect(link(root, 'Starší →')?.getAttribute('href')).toBe('/aktuality?strana=3');
    });
  });

  it('when the page number is not a page, then the first page loads', async () => {
    ({ fixture, http } = await setUp({ strana: 'nula' }));
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('nav.pages')).toBeNull();
  });

  it('when nothing is published yet, then the page says so and leads home', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([], 0, 0));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(text(root, '.list-state')).toBe('Zatím tu žádná aktualita není.');
    expect(link(root, 'Zpět na úvodní stránku')?.getAttribute('href')).toBe('/');
  });

  it('when a page past the last one is asked for, then the page says it does not exist and leads to the first one', async () => {
    ({ fixture, http } = await setUp({ strana: '99' }));
    root = fixture.nativeElement;
    http.expectOne(NEWS(98)).flush(page([], 98, 12));
    await settle(fixture);

    expect(text(root, '.list-state')).toBe('Tato strana neexistuje.');
    expect(link(root, 'Na první stranu')?.getAttribute('href')).toBe('/aktuality');
  });

  it('when the news fail, then an alert offers to try again and the retry loads them', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    expect(text(root, '.list-state')).toBe('Načítáme aktuality…');
    http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(text(root, '[role="alert"]')).toBe('Aktuality se nepodařilo načíst.');
    (root.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    await settle(fixture);

    http.expectNone(PROJECTS(0));
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });

  it('when the retry fails again, then the focus returns to Zkusit znovu', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    document.body.appendChild(root);
    http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(PROJECTS(0)).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    (root.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(PROJECTS(0)).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(document.activeElement).toBe(root.querySelector('.retry'));
    root.remove();
  });

  it('when the news fail while the device is offline, then the alert says the connection is missing', async () => {
    ({ fixture, http } = await setUp({}, true));
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(null, { status: 0, statusText: 'Unknown Error' });
    http.expectOne(PROJECTS(0)).flush(null, { status: 0, statusText: 'Unknown Error' });
    await settle(fixture);

    expect(text(root, '[role="alert"]')).toBe(
      'Bez připojení se aktuality nenačetly. Až budete online, zkuste to znovu.',
    );
  });
});
