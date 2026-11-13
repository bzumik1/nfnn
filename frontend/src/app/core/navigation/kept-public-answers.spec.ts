import {
  HttpClient,
  HttpContext,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ShownAnswers } from '../connectivity/shown-answers';
import { mayComeFromServiceWorker } from '../updates/service-worker-bypass';
import {
  ASKED_AHEAD,
  isKeptPublicAnswer,
  KEPT_ANSWER_MAX_AGE_MS,
  KEPT_ANSWERS_LIMIT,
  keptPublicAnswersInterceptor,
} from './kept-public-answers';

const HOME = '/api/content/home';
const NEWS = '/api/content/news?page=0&size=10';

describe('Given the public answers the app keeps in memory', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([keptPublicAnswersInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  function get<T>(url: string): Promise<T> {
    return firstValueFrom(http.get<T>(url));
  }

  async function seen(
    url: string,
    body: object,
    headers: Record<string, string> = {},
  ): Promise<void> {
    const answer = get(url);
    backend.expectOne(url).flush(body, { headers });
    await answer;
  }

  it('when a page asks for an answer for the first time, then it waits for the server', async () => {
    const answer = get(HOME);

    backend.expectOne(HOME).flush({ news: [] });

    expect(await answer).toEqual({ news: [] });
  });

  describe('when the app asks for an answer ahead of the page that shows it', () => {
    function ahead(url: string): Promise<unknown> {
      return new Promise((done) =>
        http
          .get(url, { context: new HttpContext().set(ASKED_AHEAD, true) })
          .subscribe({ complete: () => done('done'), error: () => done('failed') }),
      );
    }

    it('then an answer not kept yet is asked for and kept for the page', async () => {
      const asked = ahead(HOME);
      backend.expectOne(HOME).flush({ news: ['ahead'] });
      await asked;

      expect(await get(HOME)).toEqual({ news: ['ahead'] });
      backend.expectOne(HOME).flush({ news: ['ahead'] });
    });

    it('then an answer already kept or on its way is not asked for again', async () => {
      await seen(HOME, { news: [] });
      const onItsWay = get(NEWS);

      expect(await ahead(HOME)).toBe('done');
      expect(await ahead(NEWS)).toBe('done');

      backend.expectOne(NEWS).flush({ items: [] });
      await onItsWay;
    });
  });

  it('when a page asks for an answer that is already on its way, then both wait for that one request', async () => {
    const ahead = get(HOME);
    const page = get(HOME);

    backend.expectOne(HOME).flush({ news: ['first'] });

    expect(await ahead).toEqual({ news: ['first'] });
    expect(await page).toEqual({ news: ['first'] });
  });

  it('when the request on its way fails, then the next asking goes to the server again', async () => {
    const ahead = get(HOME).catch(() => 'failed');
    const page = get(HOME).catch(() => 'failed');
    backend.expectOne(HOME).flush(null, { status: 503, statusText: 'Unavailable' });
    expect(await ahead).toBe('failed');
    expect(await page).toBe('failed');

    const again = get(HOME);
    backend.expectOne(HOME).flush({ news: [] });

    expect(await again).toEqual({ news: [] });
  });

  describe('when a page asks again for an answer it already had', () => {
    beforeEach(async () => {
      await seen(HOME, { news: ['first'] });
    });

    it('then it gets the kept answer at once and the server is asked again in the background', async () => {
      expect(await get(HOME)).toEqual({ news: ['first'] });

      backend.expectOne(HOME).flush({ news: ['second'] });

      expect(await get(HOME)).toEqual({ news: ['second'] });
      backend.expectOne(HOME).flush({ news: ['second'] });
    });

    it('then the page shows the data as old as the server dated the kept answer', async () => {
      const servedAt = 'Thu, 05 Nov 2026 12:00:00 GMT';
      await seen(NEWS, { items: [] }, { Date: servedAt });

      await get(NEWS);
      backend.expectOne(NEWS).flush({ items: [] });

      expect(TestBed.inject(ShownAnswers).fetchedAtOf(NEWS)).toBe(Date.parse(servedAt));
    });

    it('and the page changes what it got, then the kept answer stays as the server sent it', async () => {
      const answer = await get<{ news: string[] }>(HOME);
      answer.news.push('changed');
      backend.expectOne(HOME).flush(null, { status: 503, statusText: 'Unavailable' });

      expect(await get(HOME)).toEqual({ news: ['first'] });
      backend.expectOne(HOME).flush({ news: ['first'] });
    });

    it('and two pages ask while the background request runs, then the server is asked once', async () => {
      await get(HOME);
      await get(HOME);

      backend.expectOne(HOME).flush({ news: ['first'] });
    });

    it('and the background request fails, then the kept answer stays', async () => {
      await get(HOME);
      backend.expectOne(HOME).flush(null, { status: 503, statusText: 'Unavailable' });

      expect(await get(HOME)).toEqual({ news: ['first'] });
      backend.expectOne(HOME).flush({ news: ['first'] });
    });

    it('and the background request finds the answer gone, then the next page waits for the server', async () => {
      await get(HOME);
      backend.expectOne(HOME).flush(null, { status: 404, statusText: 'Not Found' });

      const answer = get(HOME);
      backend.expectOne(HOME).flush({ news: [] });
      expect(await answer).toEqual({ news: [] });
    });

    it('and it was kept longer than the limit, then the page waits for the server', async () => {
      vi.advanceTimersByTime(KEPT_ANSWER_MAX_AGE_MS + 1);

      const answer = get(HOME);
      backend.expectOne(HOME).flush({ news: ['fresh'] });

      expect(await answer).toEqual({ news: ['fresh'] });
    });

    it('and an administrator changed the content, then the next page waits for the server', async () => {
      const write = firstValueFrom(http.put('/api/admin/content/about', {}));
      backend.expectOne('/api/admin/content/about').flush({});
      await write;

      const answer = get(HOME);
      backend.expectOne(HOME).flush({ news: ['changed'] });
      expect(await answer).toEqual({ news: ['changed'] });
    });
  });

  it('when another page of a list is asked for, then it is an answer of its own', async () => {
    await seen(NEWS, { items: ['page 1'] });

    const answer = get('/api/content/news?page=1&size=10');
    backend.expectOne('/api/content/news?page=1&size=10').flush({ items: ['page 2'] });

    expect(await answer).toEqual({ items: ['page 2'] });
  });

  it('when more answers were kept than the limit, then the oldest is forgotten first', async () => {
    for (let page = 0; page <= KEPT_ANSWERS_LIMIT; page++) {
      await seen(`/api/content/news?page=${page}&size=10`, { page });
    }

    const newest = `/api/content/news?page=${KEPT_ANSWERS_LIMIT}&size=10`;
    expect(await get(newest)).toEqual({ page: KEPT_ANSWERS_LIMIT });
    backend.expectOne(newest).flush({ page: KEPT_ANSWERS_LIMIT });

    const oldest = get(NEWS);
    backend.expectOne(NEWS).flush({ page: 0 });
    expect(await oldest).toEqual({ page: 0 });
  });

  it('when an answer is not public content, then it is never kept', async () => {
    await seen('/api/donations/me/summary', { total: 1 });

    const answer = get('/api/donations/me/summary');
    backend.expectOne('/api/donations/me/summary').flush({ total: 2 });

    expect(await answer).toEqual({ total: 2 });
  });

  it('when the app keeps an answer, then it is one the service worker may keep too, the same for everyone', () => {
    const kept = [
      HOME,
      NEWS,
      '/api/content/projects?page=2&size=50',
      '/api/content/news/ohlednuti-za-rokem-2025',
      '/api/content/projects/sofinka',
    ];
    const notKept = [
      '/api/content/media/abc?w=480',
      '/api/donations/payment-details',
      '/api/admin/content/news',
      '/api/content/people/me',
      '/api/donors/me',
    ];

    for (const url of kept) {
      const request = new HttpRequest('GET', url);
      expect(isKeptPublicAnswer(request)).toBe(true);
      expect(mayComeFromServiceWorker(request)).toBe(true);
    }
    for (const url of notKept) {
      expect(isKeptPublicAnswer(new HttpRequest('GET', url))).toBe(false);
    }
    expect(isKeptPublicAnswer(new HttpRequest('POST', HOME, null))).toBe(false);
  });
});
