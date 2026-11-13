import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CONTENT_AHEAD_AFTER_MS, ContentAhead, SAVES_DATA } from './content-ahead';

@Component({ template: '<h1>Stránka</h1>' })
class Page {}

const TAB_LISTS = [
  '/api/content/home',
  '/api/content/news?page=0&size=10',
  '/api/content/projects?page=0&size=50',
  '/api/content/news?page=0&size=50',
];

describe('Given the public content the app gets ready ahead', () => {
  let http: HttpTestingController;
  let savesData: boolean;
  let links: HTMLAnchorElement[];

  beforeEach(() => {
    savesData = false;
    links = [];
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'o-nas', component: Page },
          { path: 'sprava', component: Page },
          { path: 'overit', component: Page },
          { path: '', component: Page },
        ]),
        { provide: SAVES_DATA, useValue: () => savesData },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(ContentAhead);
  });

  afterEach(() => {
    links.forEach((link) => link.remove());
    http.verify();
    vi.useRealTimers();
  });

  function link(href: string): HTMLAnchorElement {
    const anchor = document.createElement('a');
    anchor.href = href;
    const text = document.createElement('span');
    text.textContent = 'Zpráva';
    anchor.appendChild(text);
    document.body.appendChild(anchor);
    links.push(anchor);
    return anchor;
  }

  function touch(anchor: HTMLAnchorElement): void {
    anchor.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }

  async function firstPage(url: string): Promise<RouterTestingHarness> {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    TestBed.tick();
    return harness;
  }

  function tabLists(): string[] {
    return TAB_LISTS.filter((url) => http.match(url).length > 0);
  }

  it('when a finger touches a link to an article, then the article is asked for before its page opens', () => {
    touch(link('/aktuality/zahrada-pro-deti'));

    http.expectOne('/api/content/news/zahrada-pro-deti').flush({});
  });

  it('when a finger touches a link to a story, then the story is asked for before its page opens', () => {
    touch(link('/projekty/nova-zahrada'));

    http.expectOne('/api/content/projects/nova-zahrada').flush({});
  });

  it('when the keyboard reaches a link to an article, then the article is asked for too', () => {
    link('/aktuality/zahrada-pro-deti').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    http.expectOne('/api/content/news/zahrada-pro-deti').flush({});
  });

  it('when a finger touches a link to a list or another page, then nothing is asked ahead', () => {
    touch(link('/aktuality'));
    touch(link('/o-nas'));
    touch(link('https://example.org/aktuality/cizi'));

    http.expectNone(() => true);
  });

  it('when the first public page is drawn, then the lists of the tabs are asked for once, a moment later', async () => {
    const harness = await firstPage('/o-nas');
    expect(tabLists()).toEqual([]);

    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);

    expect(tabLists()).toEqual(TAB_LISTS);
    await harness.navigateByUrl('/sprava');
    await harness.navigateByUrl('/o-nas');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);
    expect(tabLists()).toEqual([]);
  });

  it('when the visitor asked the device to save data, then the tabs are not asked for ahead', async () => {
    savesData = true;
    await firstPage('/o-nas');
    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);

    expect(tabLists()).toEqual([]);
  });

  it('when the first page is the home page, then the tabs are asked for ahead too', async () => {
    await firstPage('/');
    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);

    expect(tabLists()).toEqual(TAB_LISTS);
  });

  it('when the first page is a tool of its own, such as the verification of a receipt, then the tabs are not asked for ahead', async () => {
    await firstPage('/overit');
    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);

    expect(tabLists()).toEqual([]);
  });

  it('when the first page is the administration, then the tabs are not asked for ahead', async () => {
    await firstPage('/sprava');
    await vi.advanceTimersByTimeAsync(CONTENT_AHEAD_AFTER_MS);

    expect(tabLists()).toEqual([]);
  });
});
