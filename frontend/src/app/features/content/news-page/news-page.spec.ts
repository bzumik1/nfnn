import {
  HttpInterceptorFn,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  RouteReuseStrategy,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { ProjectResponse } from '../projects-api';
import { donateBandPhoto, DONATE_BAND_PHOTO_ID } from '../testing/donate-band-fixtures';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import {
  gridColumnsOf,
  MAX_PROJECT_PAGES,
  NewsPage,
  revealStepInRow,
  STORIES_WAIT_MS,
} from './news-page';
import { PROBE_PATH } from '../../../core/connectivity/connectivity';
import { connectivityInterceptor } from '../../../core/connectivity/connectivity-interceptor';
import { keptAnswerRefreshInterceptor } from '../../../core/connectivity/kept-answer-refresh';
import { serviceWorkerBypassInterceptor } from '../../../core/updates/service-worker-bypass';
import { KeptTabPages } from '../../../core/navigation/kept-tab-pages';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({ template: '' })
class OtherTab {}

const NEWS = (page: number) => `/api/content/news?page=${page}&size=10`;
const PROJECTS = (page: number) => `/api/content/projects?page=${page}&size=50`;

class FakeResizeObserver {
  static latest: FakeResizeObserver | null = null;
  disconnected = false;

  constructor(readonly callback: () => void) {
    FakeResizeObserver.latest = this;
  }

  observe(): void {
    return;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

async function setUp(
  query: Record<string, string> | Observable<ParamMap> = {},
  interceptors: HttpInterceptorFn[] = [],
): Promise<{ fixture: ComponentFixture<NewsPage>; http: HttpTestingController }> {
  await TestBed.configureTestingModule({
    imports: [NewsPage],
    providers: [
      provideHttpClient(withInterceptors(interceptors)),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: query instanceof Observable ? query : of(convertToParamMap(query)),
        },
      },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(NewsPage);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function text(root: ParentNode | null | undefined, selector: string): string {
  return (withOrdinarySpaces(root?.querySelector(selector)?.textContent) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function texts(root: ParentNode, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector)).map((element) =>
    (withOrdinarySpaces(element.textContent) ?? '').replace(/\s+/g, ' ').trim(),
  );
}

function link(root: ParentNode, name: string): HTMLAnchorElement | undefined {
  return Array.from(root.querySelectorAll('a')).find(
    (anchor) => withOrdinarySpaces(anchor.textContent)?.replace(/\s+/g, ' ').trim() === name,
  );
}

function revealOrder(element: Element | null): string {
  return (element as HTMLElement | null)?.style.getPropertyValue('--reveal-order') ?? '';
}

function buttonNames(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('button')).map((button) =>
    (withOrdinarySpaces(button.textContent) ?? '').replace(/\s+/g, ' ').trim(),
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

function answerHome(http: HttpTestingController): void {
  http
    .match((request) => request.url === '/api/content/home')
    .forEach((request) =>
      request.flush({ news: [], projects: [], donateBand: { photo: donateBandPhoto() } }),
    );
}

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
    answerHome(http);
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
      expect(withOrdinarySpaces(root.querySelector('.ui-intro__lead')?.textContent)?.trim()).toBe(
        'Píšeme o tom, komu jsme pomohli, co chystáme a jak naložíme s vašimi dary.',
      );
      const featured = root.querySelector('.featured') as HTMLElement;
      expect(text(featured, 'h2')).toBe('Ohlédnutí za rokem 2025');
      expect(link(featured, 'Číst celé Ohlédnutí za rokem 2025')?.getAttribute('href')).toBe(
        '/aktuality/ohlednuti-za-rokem-2025',
      );
      expect(text(featured, '.featured-meta')).toBe('Výroční ohlédnutí 15. 2. 2026');
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

    it('then the lead photo beside the text on a wide screen asks for a 600 px wide 3:2 picture', () => {
      const photo = root.querySelector('.featured img') as HTMLImageElement;
      expect(photo.getAttribute('sizes')).toBe('(max-width: 768px) 100vw, 600px');
      expect([photo.getAttribute('width'), photo.getAttribute('height')]).toEqual(['600', '400']);
    });

    it('then the stories of the newest year with a project follow in the order the site keeps, each linking to its page', () => {
      const stories = root.querySelector('.stories') as HTMLElement;
      expect(text(stories, 'h2')).toBe('Příběhy z roku 2025');
      expect(texts(stories, 'h3')).toEqual(['Sofinka', 'Miki a jeho první krůčky', 'Nelinka']);
      expect(stories.querySelector('h3 a')?.getAttribute('href')).toBe('/projekty/sofinka');
      const all = link(stories, 'Všechny 3 příběhy');
      expect(all?.getAttribute('href')).toBe('/projekty?rok=2025');
      expect(stories.querySelector('ul')?.hasAttribute('aria-label')).toBe(false);
    });

    it('then the older news follow as cards in a section of their own', () => {
      const older = root.querySelector('.older') as HTMLElement;
      expect(text(older, 'h2')).toBe('Starší aktuality');
      expect(texts(older, 'h3')).toEqual(['Ohlédnutí za rokem 2024', 'Ohlédnutí za rokem 2023']);
    });

    it('then the leading news and the stories do not move in with the older news', () => {
      const lead = root.querySelector('.lead') as HTMLElement;
      expect(lead.querySelector('.featured')).not.toBeNull();
      expect(lead.querySelector('.stories')).not.toBeNull();
      expect(lead.querySelector('[style*="--reveal-order"]')).toBeNull();
      expect(lead.closest('[style*="--reveal-order"]')).toBeNull();
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

  describe('when the older news fill the grid', () => {
    let tracks: string;

    beforeEach(async () => {
      tracks = '400px 400px 400px';
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      const computedStyle = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
        const style = computedStyle(element, pseudo);
        return element.matches('.older .grid')
          ? new Proxy(style, {
              get: (target, key) =>
                key === 'gridTemplateColumns' ? tracks : Reflect.get(target, key),
            })
          : style;
      });
      ({ fixture, http } = await setUp());
      root = fixture.nativeElement;
      const older = [2, 3, 4, 5, 6, 7, 8, 9].map((index) =>
        newsArticle({ id: `n${index}`, slug: `zprava-${index}`, title: `Zpráva ${index}` }),
      );
      http.expectOne(NEWS(0)).flush(page([lookBack2025, ...older], 0, 9));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await settle(fixture);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    function cardOrders(): string[] {
      return Array.from(root.querySelectorAll('.older .grid-item')).map((card) =>
        revealOrder(card),
      );
    }

    it('then the heading moves in first and the cards of each row one column after another', () => {
      expect(revealOrder(root.querySelector('.older h2'))).toBe('0');
      expect(cardOrders()).toEqual(['1', '2', '3', '1', '2', '3', '1', '2']);
    });

    it('and the grid narrows to two columns, then the cards step by their new column', async () => {
      tracks = '400px 400px';
      FakeResizeObserver.latest?.callback();
      await settle(fixture);

      expect(cardOrders()).toEqual(['1', '2', '1', '2', '1', '2', '1', '2']);
    });

    it('and the grid narrows to one column, then no card waits for another', async () => {
      tracks = '343px';
      FakeResizeObserver.latest?.callback();
      await settle(fixture);

      expect(cardOrders()).toEqual(['0', '0', '0', '0', '0', '0', '0', '0']);
    });

    it('and the visitor leaves, then the grid is no longer watched', () => {
      answerHome(http);
      fixture.destroy();

      expect(FakeResizeObserver.latest?.disconnected).toBe(true);
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

    expect(link(root, 'Všech 8 příběhů')).toBeDefined();
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

  it('when the projects never answer, then the news show without the stories once the wait is over', async () => {
    vi.useFakeTimers();
    try {
      ({ fixture, http } = await setUp());
      root = fixture.nativeElement;
      http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 2));
      const projects = http.expectOne(PROJECTS(0));
      await vi.advanceTimersByTimeAsync(STORIES_WAIT_MS - 1);
      fixture.detectChanges();

      expect(text(root, '.list-state')).toBe('Načítáme aktuality…');

      await vi.advanceTimersByTimeAsync(1);
      fixture.detectChanges();

      expect(projects.cancelled).toBe(true);
      expect(text(root, '.list-state')).toBe('');
      expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
      expect(root.querySelector('.stories')).toBeNull();
      expect(root.querySelector('[role="alert"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('when the news and projects come from copies the service worker kept, then the page shows them at once and takes the newer news when the server answers', async () => {
    ({ fixture, http } = await setUp({}, [
      keptAnswerRefreshInterceptor,
      serviceWorkerBypassInterceptor,
      connectivityInterceptor,
    ]));
    root = fixture.nativeElement;
    const kept = { headers: { Date: new Date(Date.now() - 600_000).toUTCString() } };
    const fromWorker = (url: string) => (request: HttpRequest<unknown>) =>
      request.urlWithParams === url && !request.headers.has('ngsw-bypass');
    const fromServer = (url: string) => (request: HttpRequest<unknown>) =>
      request.urlWithParams === url && request.headers.has('ngsw-bypass');

    http.expectOne(fromWorker(NEWS(0))).flush(page([lookBack2024], 0, 1), kept);
    http
      .expectOne(fromWorker(PROJECTS(0)))
      .flush(page([story('sofinka', 2025, 'Sofinka')], 0, 1, 50), kept);
    await settle(fixture);

    expect(text(root, '.list-state')).toBe('');
    expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2024');
    expect(http.match(fromServer(PROJECTS(0)))).toHaveLength(0);

    http.expectOne(fromServer(NEWS(0))).flush(page([lookBack2025, lookBack2024], 0, 2));
    await settle(fixture);

    expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    http.match(PROBE_PATH).forEach((probe) => probe.flush({}));
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
    expect(link(root, `Všech ${MAX_PROJECT_PAGES} příběhů`)).toBeDefined();
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
      expect(revealOrder(nav)).toBe('0');
      expect(text(nav, '.pages-position')).toBe('Strana 1 z 3');
      expect(link(nav, 'Starší')?.getAttribute('href')).toBe('/aktuality?strana=2');
      expect(link(nav, 'Novější')).toBeUndefined();
    });

    it('and the home content arrives, then the Přispět band closes the page after the paging, with the band photo and the way to the projects', async () => {
      answerHome(http);
      await settle(fixture);

      const band = root.querySelector('app-donate-band')!;
      expect(root.querySelector('.news-page')!.lastElementChild).toBe(band);
      expect(
        root.querySelector('nav.pages')!.compareDocumentPosition(band) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(text(band, 'h2')).toBe('O další pomoci napíšeme i díky vám');
      expect(band.querySelector('.band-container--wide')).not.toBeNull();
      expect(text(band, '.band-lead')).toBe(
        'Pravidelný příspěvek nám pomáhá plánovat pomoc na celý rok.',
      );
      expect(texts(band, 'a')).toEqual(['Přispět', 'Kde pomáháme']);
      expect(band.querySelector('img')?.getAttribute('src')).toBe(
        `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480`,
      );
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
      expect(text(root, '.older h2')).toBe('Aktuality na straně 2');
      expect(root.querySelector('.featured')).toBeNull();
      expect(text(root, '.older h2.visually-hidden')).toBe('Aktuality na straně 2');
      expect(root.querySelector('.stories')).toBeNull();
      expect(texts(root, '.older h3')).toEqual([
        'Ohlédnutí za rokem 2024',
        'Ohlédnutí za rokem 2023',
      ]);
    });

    it('then both directions are offered', () => {
      expect(text(root, '.pages-position')).toBe('Strana 2 z 3');
      expect(link(root, 'Novější')?.getAttribute('href')).toBe('/aktuality');
      expect(link(root, 'Starší')?.getAttribute('href')).toBe('/aktuality?strana=3');
    });

    it('then the cards come as one list that does not move in card by card', () => {
      expect(
        Array.from(root.querySelectorAll('.older app-news-card')).map((card) => revealOrder(card)),
      ).toEqual(['', '']);
    });

    it('then each direction carries a chevron icon hidden from screen readers', () => {
      for (const name of ['Novější', 'Starší']) {
        expect(link(root, name)?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      }
    });
  });

  it('when the page number is not a page, then the first page loads', async () => {
    ({ fixture, http } = await setUp({ strana: 'nula' }));
    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('nav.pages')).toBeNull();
  });

  it('when nothing is published yet, then a card in place of the leading news says so and leads home', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(page([], 0, 0));
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    const notice = root.querySelector('.news-notice.ui-notice') as HTMLElement;
    expect(text(notice, '.ui-notice__text')).toBe('Zatím tu žádná aktualita není.');
    expect(link(notice, 'Zpět na úvodní stránku')?.getAttribute('href')).toBe('/');
  });

  it('when a page past the last one is asked for, then a card says the page does not exist and leads to the first one', async () => {
    ({ fixture, http } = await setUp({ strana: '99' }));
    root = fixture.nativeElement;
    http.expectOne(NEWS(98)).flush(page([], 98, 12));
    await settle(fixture);

    const notice = root.querySelector('.news-notice.ui-notice') as HTMLElement;
    expect(text(notice, '.ui-notice__text')).toBe('Tato strana neexistuje.');
    expect(link(notice, 'Na první stranu')?.getAttribute('href')).toBe('/aktuality');
  });

  describe.each([
    ['with motion', false],
    ['with reduced motion', true],
  ])('while the news are on their way %s', (_, reduced) => {
    beforeEach(async () => {
      vi.useFakeTimers();
      document.documentElement.style.setProperty('--delay-loading', '0.3s');
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: reduced && query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      document.documentElement.style.removeProperty('--delay-loading');
      vi.useRealTimers();
    });

    async function openNews(query: Record<string, string> = {}): Promise<void> {
      ({ fixture, http } = await setUp(query));
      root = fixture.nativeElement;
    }

    async function wait(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    }

    it('then the status line is there from the start and stays empty until the loading delay is over', async () => {
      await openNews();
      const status = root.querySelector('[role="status"]') as HTMLElement;
      expect(status.classList).toContain('list-state');
      expect(text(status, '.list-state')).toBe('');

      await wait(299);

      expect(root.querySelector('.list-state-loading')).toBeNull();

      await wait(1);

      expect(text(status, '.list-state-loading')).toBe('Načítáme aktuality…');
      http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    });

    it('and they arrive before the loading delay is over, then no loading text shows and the news stand at once without moving in', async () => {
      await openNews();
      await wait(100);
      http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await wait(0);

      expect(root.querySelector('.list-state-loading')).toBeNull();
      expect(root.querySelector('.lead')?.classList).not.toContain('lead--appears');

      await wait(1000);

      expect(root.querySelector('.list-state-loading')).toBeNull();
      expect(root.querySelector('.lead')?.classList).not.toContain('lead--appears');
    });

    it('and they arrive after the loading text showed, then the news move in in its place', async () => {
      await openNews();
      await wait(300);
      expect(text(root, '.list-state')).toBe('Načítáme aktuality…');

      http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await wait(0);

      expect(root.querySelector('.list-state-loading')).toBeNull();
      expect(root.querySelector('.lead')?.classList).toContain('lead--appears');
    });

    it('and a later page arrives after the loading text showed, then its list moves in in its place', async () => {
      await openNews({ strana: '2' });
      await wait(300);
      http.expectOne(NEWS(1)).flush(page([lookBack2024], 1, 25));
      await wait(0);

      expect(root.querySelector('.older')?.classList).toContain('older--appears');
    });

    it('and nothing is published, then the empty state is not held back like the loading text', async () => {
      await openNews();
      http.expectOne(NEWS(0)).flush(page([], 0, 0));
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await wait(0);

      expect(root.querySelector('.list-state-loading')).toBeNull();
      expect(text(root, '.news-notice .ui-notice__text')).toBe('Zatím tu žádná aktualita není.');
    });

    it('and they fail, then the alert is not held back like the loading text', async () => {
      await openNews();
      http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
      http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
      await wait(0);

      expect(text(root, '[role="alert"] .ui-notice__text')).toBe('Aktuality se nepodařilo načíst.');
      await wait(1000);
      expect(root.querySelector('.list-state-loading')).toBeNull();
    });

    it('and the visitor leaves, then the loading delay is cancelled', async () => {
      await openNews({ strana: '2' });
      answerHome(http);
      const news = http.expectOne(NEWS(1));
      const pending = vi.getTimerCount();

      fixture.destroy();

      expect(vi.getTimerCount()).toBe(pending - 1);
      expect(news.cancelled).toBe(true);
    });
  });

  it('when the news fail, then an alert card offers to try again and the retry loads them and says so', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    document.body.appendChild(root);
    expect(text(root, '.list-state')).toBe('Načítáme aktuality…');
    http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    const alert = root.querySelector('.news-notice.ui-notice--alert[role="alert"]') as HTMLElement;
    expect(text(alert, '.ui-notice__text')).toBe('Aktuality se nepodařilo načíst.');
    const retry = alert.querySelector('button.retry') as HTMLButtonElement;
    expect(text(alert, 'button')).toBe('Zkusit znovu');
    retry.focus();
    expect(document.activeElement).toBe(retry);
    retry.click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(root.querySelector('.list-state'));

    http.expectOne(NEWS(0)).flush(page([lookBack2025], 0, 1));
    await settle(fixture);

    http.expectNone(PROJECTS(0));
    expect(root.querySelector('[role="alert"]')).toBeNull();
    expect(text(root, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(text(root, '.list-state[role="status"]')).toBe('Aktuality jsou načtené.');
    expect(document.activeElement).toBe(link(root, 'Číst celé Ohlédnutí za rokem 2025'));
    root.remove();
  });

  it('when the retry on a later page loads it, then the focus goes to its first card', async () => {
    ({ fixture, http } = await setUp({ strana: '2' }));
    root = fixture.nativeElement;
    document.body.appendChild(root);
    http.expectOne(NEWS(1)).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    (root.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(NEWS(1)).flush(page([lookBack2024, lookBack2023], 1, 25));
    await settle(fixture);

    expect(document.activeElement).toBe(link(root, 'Ohlédnutí za rokem 2024'));
    root.remove();
  });

  it('when the retry finds nothing published, then the focus stays on the status line that says so', async () => {
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    document.body.appendChild(root);
    http.expectOne(NEWS(0)).flush(null, { status: 500, statusText: 'Error' });
    http.expectOne(PROJECTS(0)).flush(page([], 0, 0, 50));
    await settle(fixture);

    (root.querySelector('.retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectOne(NEWS(0)).flush(page([], 0, 0));
    await settle(fixture);

    expect(document.activeElement).toBe(root.querySelector('.list-state'));
    expect(text(root, '.list-state')).toBe('Zatím tu žádná aktualita není.');
    expect(root.querySelector('.list-state span')?.classList).toContain('visually-hidden');
    expect(text(root, '.news-notice .ui-notice__text')).toBe('Zatím tu žádná aktualita není.');
    root.remove();
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
    ({ fixture, http } = await setUp());
    root = fixture.nativeElement;
    http.expectOne(NEWS(0)).flush(null, { status: 0, statusText: 'Unknown Error' });
    http.expectOne(PROJECTS(0)).flush(null, { status: 0, statusText: 'Unknown Error' });
    await settle(fixture);

    const alert = root.querySelector('.news-notice.ui-notice--alert[role="alert"]') as HTMLElement;
    expect(text(alert, '.ui-notice__text')).toBe(
      'Bez připojení se aktuality nenačetly. Až budete online, zkuste to znovu.',
    );
    expect(text(alert, 'button')).toBe('Zkusit znovu');
  });
});

describe('Given Aktuality kept while the visitor is on another tab', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  async function openAndLeave(stories: (request: TestRequest) => void): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'aktuality', component: NewsPage },
          { path: 'o-nas', component: OtherTab },
        ]),
        { provide: RouteReuseStrategy, useExisting: KeptTabPages },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/aktuality');
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 2));
    stories(http.expectOne(PROJECTS(0)));
    await harness.fixture.whenStable();
    await harness.navigateByUrl('/o-nas');
  }

  function storiesArrive(request: TestRequest): void {
    request.flush(page([sofinka], 0, 1, 50));
  }

  async function returned(): Promise<HTMLElement> {
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness.routeNativeElement!;
  }

  afterEach(() => {
    answerHome(http);
    http.verify();
  });

  it('when the visitor returns, then the news they saw stay shown while the news are asked for again', async () => {
    await openAndLeave(storiesArrive);

    await harness.navigateByUrl('/aktuality');
    const asked = http.expectOne(NEWS(0));
    const shown = await returned();

    expect(text(shown, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(withOrdinarySpaces(shown.textContent)).not.toContain('Načítáme aktuality');

    asked.flush(page([lookBack2023, lookBack2025, lookBack2024], 0, 3));
    expect(text(await returned(), '.featured h2')).toBe('Ohlédnutí za rokem 2023');
  });

  it('when the stories failed before, then the news stay shown while the stories are asked for again', async () => {
    await openAndLeave((request) => request.flush(null, { status: 500, statusText: 'Error' }));

    await harness.navigateByUrl('/aktuality');
    http.expectOne(NEWS(0)).flush(page([lookBack2025, lookBack2024], 0, 2));
    const stories = http.expectOne(PROJECTS(0));
    const shown = await returned();

    expect(text(shown, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(withOrdinarySpaces(shown.textContent)).not.toContain('Načítáme aktuality');

    stories.flush(page([sofinka], 0, 1, 50));
    expect(text(await returned(), 'app-year-stories h2')).toBe('Příběhy z roku 2025');
  });

  it('when the news cannot be asked for again, then the news they saw stay shown', async () => {
    await openAndLeave(storiesArrive);

    await harness.navigateByUrl('/aktuality');
    http.expectOne(NEWS(0)).flush(null, { status: 0, statusText: 'Unknown Error' });
    const shown = await returned();

    expect(text(shown, '.featured h2')).toBe('Ohlédnutí za rokem 2025');
    expect(shown.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('Given the columns the older news grid lays out', () => {
  function steps(trackList: string, cards: number): number[] {
    const columns = gridColumnsOf(trackList);
    return Array.from({ length: cards }, (_, index) => revealStepInRow(index, columns));
  }

  it('when the grid holds one column, then no card waits for another', () => {
    expect(steps('343px', 6)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('when the grid is not laid out as columns, then it counts as one column', () => {
    expect(gridColumnsOf('none')).toBe(1);
    expect(gridColumnsOf('')).toBe(1);
  });

  it('when the grid holds two columns, then each row steps by its column', () => {
    expect(steps('416px 416px', 5)).toEqual([1, 2, 1, 2, 1]);
  });

  it('when the grid holds three columns, then each row steps by its column', () => {
    expect(steps('405.333px 405.333px 405.333px', 7)).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });

  it('when the grid names its lines, then only the tracks count as columns', () => {
    expect(gridColumnsOf('[start] 300px [middle] 300px [end]')).toBe(2);
  });

  it('when the grid holds more than three columns, then no card waits more than three steps', () => {
    expect(steps('200px 200px 200px 200px 200px', 6)).toEqual([1, 2, 3, 3, 3, 1]);
  });
});
