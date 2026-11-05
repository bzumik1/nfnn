import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { ProjectResponse } from '../projects-api';
import { donateBandPhoto, DONATE_BAND_PHOTO_ID } from '../testing/donate-band-fixtures';
import { newsArticle } from '../testing/news-fixtures';
import { project } from '../testing/project-fixtures';
import { ProjectsPage } from './projects-page';

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
        provideHttpClientTesting(),
        provideRouter([
          { path: 'projekty', component: ProjectsPage },
          { path: 'projekty/:slug', component: Elsewhere },
          { path: 'aktuality/:slug', component: Elsewhere },
          { path: 'prispet', component: Elsewhere },
        ]),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
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
      chip.textContent!.trim(),
      chip.getAttribute('aria-current') ?? '',
    ]);
  }

  function text(element: Element | null): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
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
      ['Všechny 3 z roku 2025 →', '/projekty?rok=2025'],
      ['Všechny 2 z roku 2024 →', '/projekty?rok=2024'],
      ['Celý rok 2023 →', '/projekty?rok=2023'],
    ]);
    expect(page.querySelector('.grid')).toBeNull();
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
    expect([...band.querySelectorAll('a')].map(text)).toEqual(['Přispět']);
    expect(band.querySelector('img')?.getAttribute('src')).toBe(
      `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=480`,
    );
  });

  it('when there is no story yet, then it says so, leads home and offers no years', async () => {
    const page = await open('/projekty', []);

    expect(text(page.querySelector('.stories-empty'))).toBe('Zatím tu žádný projekt není.');
    expect(text(page.querySelector('.stories-body a[href="/"]'))).toBe('Zpět na úvodní stránku');
    expect(page.querySelector('nav')).toBeNull();
    expect(page.querySelector('.summary')).toBeNull();
  });

  it('when the stories cannot be read, then it says what to do and loads again on request', async () => {
    const page = await open('/projekty', STORIES, false);
    http.match('/api/content/home').forEach((request) => request.flush({ news: [], projects: [] }));
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush(null, {
        status: 503,
        statusText: 'Down',
      });
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush(null, {
        status: 503,
        statusText: 'Down',
      });
    await harness.fixture.whenStable();

    expect(text(page.querySelector('[role="alert"]'))).toContain('nepodařilo načíst');
    (page.querySelector('.stories-error + button') as HTMLButtonElement).click();
    http
      .expectOne((request) => request.url === '/api/content/news')
      .flush({
        items: [],
        page: 0,
        size: 50,
        total: 0,
        hasMore: false,
      });
    http
      .expectOne((request) => request.url === '/api/content/projects')
      .flush({
        items: STORIES,
        page: 0,
        size: 50,
        total: 6,
        hasMore: false,
      });
    await harness.fixture.whenStable();

    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelectorAll('app-story-tile').length).toBe(3);
  });

  it('when the visitor comes back from a story, then the stories show at once from what the tab already read, so the link to that story can take the focus', async () => {
    await open('/projekty');
    await harness.navigateByUrl('/projekty/sofinka');

    await harness.navigateByUrl('/projekty');
    const page = harness.routeNativeElement!;

    expect(page.querySelector('a[href="/projekty/sofinka"]')).not.toBeNull();
    answerAll(STORIES);
  });

  it('when it shows on a phone, then the eyebrow above the title is left out, as the tab bar names the tab', async () => {
    compact.set(true);
    const page = await open('/projekty');

    expect(page.querySelector('.ui-eyebrow')?.closest('app-donate-band')).not.toBeNull();
    expect(page.querySelector('.stories-intro .ui-eyebrow')).toBeNull();
  });
});
