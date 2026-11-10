import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { project } from '../testing/project-fixtures';
import { ContentList } from './content-list';

async function setUp(
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
        useValue: { queryParamMap: of(convertToParamMap(query)) },
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

describe('Given a visitor opening the list of projects', () => {
  let fixture: ComponentFixture<ContentList>;
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('when the projects arrive, then each project card links to its page', async () => {
    ({ fixture, http } = await setUp());
    http.expectOne('/api/content/projects?page=0&size=10').flush(page([project()], 0, 11));
    await settle(fixture);

    expect(text(fixture, 'h1')).toBe('Kde pomáháme');
    expect(fixture.nativeElement.querySelector('app-project-card a').getAttribute('href')).toBe(
      '/projekty/zahrada-pro-deti',
    );
    expect(fixture.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe(
      'Stránky projektů',
    );
    expect(link(fixture, 'Starší')?.getAttribute('href')).toBe('/projekty?strana=2');
  });

  it('when a middle page is asked for, then both directions are offered in words with a chevron icon hidden from screen readers', async () => {
    ({ fixture, http } = await setUp({ strana: '2' }));
    http.expectOne('/api/content/projects?page=1&size=10').flush(page([project()], 1, 25));
    await settle(fixture);

    expect(text(fixture, '.pages-position')).toBe('Strana 2 z 3');
    const newer = link(fixture, 'Novější');
    const older = link(fixture, 'Starší');
    expect(newer?.getAttribute('href')).toBe('/projekty');
    expect(older?.getAttribute('href')).toBe('/projekty?strana=3');
    for (const direction of [newer, older]) {
      expect(direction?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('when nothing is published yet, then the page says so', async () => {
    ({ fixture, http } = await setUp());
    http.expectOne('/api/content/projects?page=0&size=10').flush(page([], 0, 0));
    await settle(fixture);

    expect(text(fixture, '.list-state')).toBe('Zatím tu žádný projekt není.');
  });
});
