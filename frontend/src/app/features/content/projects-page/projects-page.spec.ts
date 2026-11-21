import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouteReuseStrategy } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { KeptTabPages } from '../../../core/navigation/kept-tab-pages';
import { ProjectResponse } from '../projects-api';
import { donateBandPhoto, DONATE_BAND_PHOTO_ID } from '../testing/donate-band-fixtures';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { ProjectsPage } from './projects-page';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({ template: '<h1>Jinde</h1>' })
class Elsewhere {}

const STORIES: ProjectResponse[] = [
  project({ id: 'a', slug: 'deti-s-rakovinou', title: 'Děti s rakovinou', year: 2025 }),
  project({ id: 'b', slug: 'sofinka', title: 'Sofinka', year: 2025 }),
  project({
    id: 'c',
    slug: 'michal',
    title: 'Michal, profesionální hasič',
    year: 2025,
    category: 'ADULTS',
    coverImage: null,
  }),
  project({ id: 'd', slug: 'natalka', title: 'Natálka, malá bojovnice', year: 2024 }),
  project({ id: 'e', slug: 'belinka', title: 'Fenka Belinka', year: 2024, category: 'ANIMALS' }),
  project({ id: 'f', slug: 'luccina-rodina', title: 'Luččina rodina', year: 2023 }),
];

describe('Given the Pomáháme tab', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const compact = signal(false);

  beforeEach(async () => {
    compact.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        {
          provide: CompactLayout,
          useValue: { isCompact: compact.asReadonly(), listsAsRows: compact.asReadonly() },
        },
        provideHttpClientTesting(),
        provideRouter([
          { path: 'projekty', component: ProjectsPage },
          { path: 'projekty/:slug', component: Elsewhere },
          { path: 'aktuality/:slug', component: Elsewhere },
          { path: 'prispet', component: Elsewhere },
        ]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  async function open(url: string, stories = STORIES, answer = true): Promise<HTMLElement> {
    await harness.navigateByUrl(url);
    if (answer) {
      answerAll(stories);
    }
    await harness.fixture.whenStable();
    return harness.routeNativeElement!;
  }

  function answerAll(stories: ProjectResponse[]): void {
    http
      .match((request) => request.url === '/api/content/home')
      .forEach((request) =>
        request.flush({ news: [], projects: [], donateBand: { photo: donateBandPhoto() } }),
      );
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush({
        items: [newsArticle({ slug: 'ohlednuti-2025', lookBackYear: 2025 })],
        page: 0,
        size: 50,
        total: 1,
        hasMore: false,
      });
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush({
        items: stories,
        page: 0,
        size: 50,
        total: stories.length,
        hasMore: false,
      });
  }

  function chips(page: HTMLElement): string[][] {
    return [...page.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Roky"] a')].map((chip) => [
      withOrdinarySpaces(chip.textContent)!.trim(),
      chip.getAttribute('aria-current') ?? '',
    ]);
  }

  function text(element: Element | null): string {
    return (withOrdinarySpaces(element?.textContent) ?? '').replace(/\s+/g, ' ').trim();
  }

  it('when it opens, then it names whom the foundation helped and sums every published story by kind, as plain figures', async () => {
    const page = await open('/projekty');

    expect(text(page.querySelector('h1'))).toBe('Komu jsme pomohli');
    const tiles = [...page.querySelectorAll('.summary-tile')].map(text);
    expect(tiles).toEqual([
      '6 příběhů zveřejněných od roku 2023',
      '4 děti',
      '1 dospělý',
      '1 zvíře',
    ]);
    expect(page.querySelector('.summary a, .summary button')).toBeNull();
  });

  it('when no story names its kind, then the summary is the one tile of the total, without an empty column beside it', async () => {
    const unsorted = STORIES.map((story) => ({
      ...story,
      category: undefined as unknown as ProjectResponse['category'],
    }));
    const page = await open('/projekty', unsorted);

    expect([...page.querySelectorAll('.summary-tile')].map(text)).toEqual([
      '6 příběhů zveřejněných od roku 2023',
    ]);
    expect(page.querySelector('.summary-categories')).toBeNull();
    expect(page.querySelector('.summary-grid')?.classList).toContain('summary-grid--total');
  });

  it('when it opens without a year asked, then the newest year with a story is chosen and shown with its first story large', async () => {
    const page = await open('/projekty');

    expect(chips(page)).toEqual([
      ['Vše', ''],
      ['2025', 'true'],
      ['2024', ''],
      ['2023', ''],
    ]);
    const years = [...page.querySelectorAll('h2.year-title')].map(text);
    expect(years).toEqual(['2025 3 příběhy']);
    const tiles = [...page.querySelectorAll('.grid app-story-tile')];
    expect(tiles.map((tile) => text(tile.querySelector('h3')))).toEqual([
      'Děti s rakovinou',
      'Sofinka',
      'Michal, profesionální hasič',
    ]);
    expect(tiles[0].classList).toContain('is-large');
    expect(tiles[1].classList).not.toContain('is-large');
  });

  it('when a year has a look-back, then the year links to it, and a year without one links nowhere', async () => {
    const page = await open('/projekty?rok=vse');

    const lookBacks = [...page.querySelectorAll<HTMLAnchorElement>('.year-look-back')];
    expect(lookBacks.map((link) => [text(link), link.getAttribute('href')])).toEqual([
      ['Ohlédnutí za rokem 2025 →', '/aktuality/ohlednuti-2025'],
    ]);
  });

  it('when a link ends with its arrow, then the arrow never wraps to a line of its own', async () => {
    const page = await open('/projekty?rok=vse');

    const arrows = [...page.querySelectorAll('.year-look-back, .year-all')].map((link) =>
      withOrdinarySpaces(link.querySelector('span[aria-hidden="true"]:last-child')?.textContent),
    );
    expect(arrows.length).toBeGreaterThan(0);
    expect(new Set(arrows)).toEqual(new Set([' →']));
  });

  it('when a link asks for a year, then that chip is chosen, which the Aktuality tab relies on', async () => {
    const page = await open('/projekty?rok=2024');

    expect(chips(page).find(([, current]) => current)).toEqual(['2024', 'true']);
    expect([...page.querySelectorAll('h2.year-title')].map(text)).toEqual(['2024 2 příběhy']);
  });

  it('when everything is asked for, then each year is a sideways strip ending with the way to that year alone', async () => {
    const page = await open('/projekty?rok=vse');

    expect(chips(page)[0]).toEqual(['Vše', 'true']);
    expect([...page.querySelectorAll('h2.year-title')].map(text)).toEqual([
      '2025 3 příběhy',
      '2024 2 příběhy',
      '2023 1 příběh',
    ]);
    const ends = [...page.querySelectorAll<HTMLAnchorElement>('.strip-all')];
    expect(ends.map((link) => [text(link), link.getAttribute('href')])).toEqual([
      ['Všechny 3 příběhy z roku 2025 →', '/projekty?rok=2025'],
      ['Všechny 2 příběhy z roku 2024 →', '/projekty?rok=2024'],
      ['Celý rok 2023 →', '/projekty?rok=2023'],
    ]);
    expect(page.querySelector('.grid')).toBeNull();
  });

  it('when a year has five stories or more, then its strip link counts them with the noun for many', async () => {
    const many = Array.from({ length: 5 }, (_, index) =>
      project({ id: `m${index}`, slug: `m${index}`, title: `M ${index}`, year: 2022 }),
    );
    const page = await open('/projekty?rok=vse', [...STORIES, ...many]);

    expect(text(page.querySelectorAll('.strip-all')[3])).toBe('Všech 5 příběhů z roku 2022 →');
  });

  it('when only one year has stories, then no year filter and no way to every year is offered', async () => {
    const page = await open('/projekty', STORIES.slice(0, 3));

    expect(page.querySelector('nav[aria-label="Roky"]')).toBeNull();
    expect(page.querySelector('a[href="/projekty?rok=vse"]')).toBeNull();
    expect([...page.querySelectorAll('h2.year-title')].map(text)).toEqual(['2025 3 příběhy']);
  });

  it('when one year is shown out of more, then a link under its stories leads to every year and names what it shows', async () => {
    const page = await open('/projekty');

    const every = page.querySelector<HTMLAnchorElement>('.grid + .year-all');
    expect(text(every)).toBe('Všechny roky: všechny příběhy →');
    expect(every?.getAttribute('href')).toBe('/projekty?rok=vse');
    expect(withOrdinarySpaces(page.querySelector('.year-title')?.textContent)).toContain('2025');
  });

  it('when every year is shown, then no link to every year is offered again', async () => {
    const page = await open('/projekty?rok=vse');

    expect(page.querySelector('.year-all')).toBeNull();
  });

  it('when a computer shows a year, then its small tiles carry their perex too, and a phone keeps them short', async () => {
    const page = await open('/projekty');

    const small = [...page.querySelectorAll('app-story-tile:not(.is-large)')];
    expect(small.map((tile) => tile.querySelector('.tile-perex') !== null)).toEqual([true, true]);

    compact.set(true);
    await harness.fixture.whenStable();
    expect(page.querySelector('app-story-tile:not(.is-large) .tile-perex')).toBeNull();
  });

  it('when a computer shows a year of one story, then the story is a split card of photo and text, and a phone keeps it large', async () => {
    const page = await open('/projekty?rok=2023');

    const tile = page.querySelector('app-story-tile')!;
    expect(tile.querySelector('.tile--split')).not.toBeNull();
    expect(tile.querySelector('.tile-perex')).not.toBeNull();
    expect(page.querySelector('.grid-item--split')).not.toBeNull();

    compact.set(true);
    await harness.fixture.whenStable();
    expect(tile.querySelector('.tile--split')).toBeNull();
    expect(tile.classList).toContain('is-large');
  });

  it('when a computer shows a year of two stories, then both are large, and a phone keeps the second small', async () => {
    const page = await open('/projekty?rok=2024');

    const large = () =>
      [...page.querySelectorAll('.grid-item')].map((item) =>
        item.classList.contains('grid-item--large'),
      );
    expect(large()).toEqual([true, true]);

    compact.set(true);
    await harness.fixture.whenStable();
    expect(large()).toEqual([true, false]);
  });

  it('when a computer shows a year of three stories, then the two small ones share the rest of the rows in the order the site keeps', async () => {
    const page = await open('/projekty');

    expect(page.querySelector('.grid')?.classList).toContain('grid--trio');
    expect(
      [...page.querySelectorAll('.grid-item')].map((item) => text(item.querySelector('h3'))),
    ).toEqual(['Děti s rakovinou', 'Sofinka', 'Michal, profesionální hasič']);
  });

  it('when a computer shows a year of four stories, then all four are small and fill one row, and a phone keeps the first large', async () => {
    const four = Array.from({ length: 4 }, (_, index) =>
      project({ id: `q${index}`, slug: `q${index}`, title: `Q ${index}`, year: 2022 }),
    );
    const page = await open('/projekty?rok=2022', [...STORIES, ...four]);

    const large = () =>
      [...page.querySelectorAll('.grid-item')].map((item) =>
        item.classList.contains('grid-item--large'),
      );
    expect(large()).toEqual([false, false, false, false]);

    compact.set(true);
    await harness.fixture.whenStable();
    expect(large()).toEqual([true, false, false, false]);
  });

  it('when a chip is chosen, then the address names the year without moving the page, and the new count is announced', async () => {
    const page = await open('/projekty');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');

    const chip = [...page.querySelectorAll<HTMLAnchorElement>('nav a')].find(
      (link) => text(link) === '2024',
    )!;
    expect(chip.getAttribute('href')).toBe('/projekty?rok=2024');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    chip.dispatchEvent(click);
    await harness.fixture.whenStable();

    expect(click.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/projekty?rok=2024', { scroll: 'manual' });
    expect(router.url).toBe('/projekty?rok=2024');
    expect(text(page.querySelector('[role="status"]'))).toBe('Rok 2024: 2 příběhy');
    expect([...page.querySelectorAll('h2.year-title')].map(text)).toEqual(['2024 2 příběhy']);
  });

  it('when the year changes by the strip link or by going back, then the line under the chips names the year shown, and a first opening announces nothing', async () => {
    const page = await open('/projekty?rok=vse');
    expect(text(page.querySelector('[role="status"]'))).toBe('');

    await harness.navigateByUrl('/projekty?rok=2024');
    await harness.fixture.whenStable();
    expect(text(page.querySelector('[role="status"]'))).toBe('Rok 2024: 2 příběhy');

    await harness.navigateByUrl('/projekty?rok=vse');
    await harness.fixture.whenStable();
    expect(text(page.querySelector('[role="status"]'))).toBe('Všechny roky: 6 příběhů');
  });

  it('when a chip is opened in a new tab, then the page leaves the click to the browser', async () => {
    const page = await open('/projekty');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    page.querySelector('nav a')!.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('when a story has no photo, then its tile shows a heart instead', async () => {
    const page = await open('/projekty');

    const michal = [...page.querySelectorAll('app-story-tile')].find((tile) =>
      text(tile).includes('Michal'),
    )!;
    expect(michal.querySelector('img')).toBeNull();
    expect(michal.querySelector('svg.tile-heart')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('when it ends, then the Přispět band closes it with the band photo, without the way back to these projects', async () => {
    const page = await open('/projekty');

    const band = page.querySelector('app-donate-band')!;
    expect(text(band.querySelector('h2'))).toBe('Pomozte s dalším příběhem');
    expect(withOrdinarySpaces(band.querySelector('h2')?.textContent)).toContain('s dalším');
    expect([...band.querySelectorAll('a')].map(text)).toEqual(['Přispět']);
    expect(band.querySelector('.ui-container')?.classList).toContain('band-container--wide');
    expect(band.querySelector('img')?.getAttribute('src')).toBe(
      `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480`,
    );
  });

  it('when there is no story yet, then a card in place of the stories says so, leads home and offers no years', async () => {
    const page = await open('/projekty', []);

    const notice = page.querySelector('.stories-notice.ui-notice');
    expect(text(notice?.querySelector('.ui-notice__text') ?? null)).toBe(
      'Zatím tu žádný příběh není.',
    );
    expect(text(notice?.querySelector('a[href="/"]') ?? null)).toBe('Zpět na úvodní stránku');
    expect(notice?.getAttribute('role')).toBeNull();
    expect(page.querySelector('nav')).toBeNull();
    expect(page.querySelector('.summary')).toBeNull();
  });

  function failStories(status: number): void {
    http.match('/api/content/home').forEach((request) => request.flush({ news: [], projects: [] }));
    http
      .match((request) => request.url === '/api/content/news')
      .forEach((request) => request.flush(null, { status, statusText: 'Down' }));
    http
      .match((request) => request.url === '/api/content/projects')
      .forEach((request) => request.flush(null, { status, statusText: 'Down' }));
  }

  function retryButton(page: HTMLElement): HTMLButtonElement {
    return page.querySelector<HTMLButtonElement>('.stories-notice[role="alert"] button')!;
  }

  it('when the stories cannot be read, then one alert card says so and offers to try again', async () => {
    const page = await open('/projekty', STORIES, false);
    failStories(503);
    await harness.fixture.whenStable();

    const notice = page.querySelector('.stories-notice.ui-notice[role="alert"]');
    expect(text(notice?.querySelector('.ui-notice__text') ?? null)).toBe(
      'Příběhy se nepodařilo načíst. Zkuste to znovu.',
    );
    expect(text(retryButton(page))).toBe('Zkusit znovu');
    expect(page.querySelectorAll('[role="alert"]').length).toBe(1);
  });

  it('when the stories cannot be read while the device is offline, then the card says the connection is missing', async () => {
    const page = await open('/projekty', STORIES, false);
    failStories(0);
    await harness.fixture.whenStable();

    expect(text(page.querySelector('.stories-notice[role="alert"] .ui-notice__text'))).toBe(
      'Bez připojení se příběhy nenačetly. Až budete online, zkuste to znovu.',
    );
    expect(text(retryButton(page))).toBe('Zkusit znovu');
  });

  it('when the retry loads the stories, then the year shown is announced and the focus goes to the title', async () => {
    const page = await open('/projekty', STORIES, false);
    document.body.appendChild(page);
    failStories(503);
    await harness.fixture.whenStable();

    retryButton(page).click();
    await harness.fixture.whenStable();
    expect(text(page.querySelector('[role="status"]'))).toBe('Načítáme příběhy…');
    answerAll(STORIES);
    await harness.fixture.whenStable();

    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelectorAll('app-story-tile').length).toBe(3);
    expect(text(page.querySelector('[role="status"]'))).toBe('Rok 2025: 3 příběhy');
    expect(document.activeElement).toBe(page.querySelector('h1'));
    page.remove();
  });

  it('when the retry fails again, then the alert comes back and the focus returns to Zkusit znovu', async () => {
    const page = await open('/projekty', STORIES, false);
    document.body.appendChild(page);
    failStories(503);
    await harness.fixture.whenStable();

    retryButton(page).click();
    await harness.fixture.whenStable();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    failStories(503);
    await harness.fixture.whenStable();

    expect(text(page.querySelector('[role="alert"] .ui-notice__text'))).toBe(
      'Příběhy se nepodařilo načíst. Zkuste to znovu.',
    );
    expect(document.activeElement).toBe(retryButton(page));
    page.remove();
  });

  it('when the visitor comes back from a story, then the stories show at once from what the tab already read, so the link to that story can take the focus', async () => {
    await open('/projekty');
    await harness.navigateByUrl('/projekty/sofinka');

    await harness.navigateByUrl('/projekty');
    const page = harness.routeNativeElement!;

    expect(page.querySelector('a[href="/projekty/sofinka"]')).not.toBeNull();
    answerAll(STORIES);
  });

  it('when it shows at any width, then the shared header names it with no label above the title, as the tab bar names the tab', async () => {
    const page = await open('/projekty');

    expect(
      withOrdinarySpaces(page.querySelector('.ui-intro h1.ui-intro__title')?.textContent)?.trim(),
    ).toBe('Komu jsme pomohli');
    expect(page.querySelector('.ui-intro .ui-eyebrow')).toBeNull();
  });
});

describe('Given Pomáháme kept while the visitor is on another tab', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'projekty', component: ProjectsPage },
          { path: 'o-nas', component: Elsewhere },
        ]),
        { provide: RouteReuseStrategy, useExisting: KeptTabPages },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/projekty');
    answerStories([STORIES[0]]);
    await harness.fixture.whenStable();
    await harness.navigateByUrl('/o-nas');
  });

  afterEach(() => http.verify());

  function answerStories(stories: ProjectResponse[]): void {
    http
      .match((request) => request.url === '/api/content/home')
      .forEach((request) => request.flush({ news: [], projects: [] }));
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush({ items: [], page: 0, size: 50, total: 0, hasMore: false });
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush({ items: stories, page: 0, size: 50, total: stories.length, hasMore: false });
  }

  async function titles(): Promise<string[]> {
    await harness.fixture.whenStable();
    harness.detectChanges();
    return [...harness.routeNativeElement!.querySelectorAll('.tile-title')].map((title) =>
      (withOrdinarySpaces(title.textContent) ?? '').trim(),
    );
  }

  it('when the visitor returns, then the stories they saw stay shown while the stories are asked for again', async () => {
    await harness.navigateByUrl('/projekty');

    expect(await titles()).toEqual(['Děti s rakovinou']);
    expect(withOrdinarySpaces(harness.routeNativeElement!.textContent)).not.toContain('Načítáme');

    answerStories([STORIES[1], STORIES[0]]);
    expect(await titles()).toEqual(['Sofinka', 'Děti s rakovinou']);
  });

  it('when the stories cannot be asked for again, then the stories they saw stay shown', async () => {
    await harness.navigateByUrl('/projekty');
    http
      .match((request) => request.url === '/api/content/home')
      .forEach((request) => request.flush({ news: [], projects: [] }));
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush({ items: [], page: 0, size: 50, total: 0, hasMore: false });
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush(null, { status: 500, statusText: 'Error' });

    expect(await titles()).toEqual(['Děti s rakovinou']);
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
  });
});
