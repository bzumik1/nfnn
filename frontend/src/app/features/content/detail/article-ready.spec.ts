import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { Connectivity } from '../../../core/connectivity/connectivity';
import { keptPublicAnswersInterceptor } from '../../../core/navigation/kept-public-answers';
import { ARTICLE_WAIT_MS, articleReady } from './article-ready';

describe('Given an article or a story about to open', () => {
  let http: HttpTestingController;
  let offline: boolean;

  beforeEach(() => {
    offline = false;
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([keptPublicAnswersInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: Connectivity, useValue: { offline: () => offline } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function ready(kind: 'news' | 'project', slug: string): Promise<unknown> {
    const route = {
      paramMap: convertToParamMap({ slug }),
      data: { kind },
    } as unknown as ActivatedRouteSnapshot;
    const answer = TestBed.runInInjectionContext(() => articleReady(route, null!));
    return firstValueFrom(answer as Observable<unknown>).then(() => 'opened');
  }

  it('when its answer arrives within the wait, then the page opens as soon as it is there', async () => {
    let opened = false;
    const opening = ready('news', 'zahrada-pro-deti').then(() => (opened = true));
    await vi.advanceTimersByTimeAsync(ARTICLE_WAIT_MS / 2);
    expect(opened).toBe(false);

    http.expectOne('/api/content/news/zahrada-pro-deti').flush({ slug: 'zahrada-pro-deti' });
    await opening;

    expect(opened).toBe(true);
  });

  it('when its answer is slower, then the page opens after the longest wait and the request goes on for the page', async () => {
    const opening = ready('project', 'nova-zahrada');
    const request = http.expectOne('/api/content/projects/nova-zahrada');

    await vi.advanceTimersByTimeAsync(ARTICLE_WAIT_MS);

    expect(await opening).toBe('opened');
    expect(request.cancelled).toBe(false);
    request.flush({ slug: 'nova-zahrada' });
  });

  it('when its answer is already kept, then the page opens at once and the server is not asked again', async () => {
    const first = ready('news', 'zahrada-pro-deti');
    http.expectOne('/api/content/news/zahrada-pro-deti').flush({ slug: 'zahrada-pro-deti' });
    await first;

    expect(await ready('news', 'zahrada-pro-deti')).toBe('opened');
    http.expectNone('/api/content/news/zahrada-pro-deti');
  });

  it('when the server cannot find it, then the page opens at once to say so', async () => {
    const opening = ready('news', 'neznama');

    http
      .expectOne('/api/content/news/neznama')
      .flush(null, { status: 404, statusText: 'Not Found' });

    expect(await opening).toBe('opened');
  });

  it('when the device is offline, then the page opens at once without waiting for an answer', async () => {
    offline = true;

    expect(await ready('news', 'zahrada-pro-deti')).toBe('opened');
    http.match('/api/content/news/zahrada-pro-deti').forEach((request) => request.flush({}));
  });
});
