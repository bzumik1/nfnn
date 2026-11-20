import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Event as RouterEvent,
  NavigationEnd,
  provideRouter,
  Router,
  Scroll,
} from '@angular/router';
import { Subject } from 'rxjs';
import { PagePlacement, pageReadsInterceptor } from './page-placement';

@Component({ template: '' })
class Blank {}

const LONGEST_MS = 3000;

describe('Given a page the router brings back and puts at its kept scroll', () => {
  let router: Router;
  let placement: PagePlacement;
  let client: HttpClient;
  let http: HttpTestingController;
  let arrived: NavigationEnd | null;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        provideHttpClient(withInterceptors([pageReadsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    router = TestBed.inject(Router);
    placement = TestBed.inject(PagePlacement);
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    arrived = null;
    router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        arrived = event;
      }
    });
    await router.navigateByUrl('/sprava');
    routerScrolls();
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  function routerScrolls(): void {
    (router.events as Subject<RouterEvent>).next(new Scroll(arrived!, [0, 160], null));
  }

  async function answeredYet(): Promise<boolean> {
    let answered = false;
    void placement.answered(window, LONGEST_MS).then(() => (answered = true));
    await Promise.resolve();
    await Promise.resolve();
    return answered;
  }

  it('when the page reads its data while it is put back, then it counts as answered only once those reads have come', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');
    client.get('/api/admin/donations/receipt-signatory').subscribe();
    client.get('/api/admin/operations/backups').subscribe({ error: () => undefined });
    routerScrolls();

    expect(placement.isAnswered()).toBe(false);
    expect(await answeredYet()).toBe(false);

    http.expectOne('/api/admin/donations/receipt-signatory').flush({});
    expect(placement.isAnswered()).toBe(false);
    http
      .expectOne('/api/admin/operations/backups')
      .flush(null, { status: 404, statusText: 'Not Found' });

    expect(placement.isAnswered()).toBe(true);
    expect(await answeredYet()).toBe(true);
  });

  it('when a read starts only after the router has put the page back, then the page counts as answered without it', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');
    routerScrolls();

    client.get('/api/admin/operations/release').subscribe();

    expect(placement.isAnswered()).toBe(true);
    http.expectOne('/api/admin/operations/release').flush({});
  });

  it('when the page gives up on a read before its answer, then it no longer waits for it', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');
    const read = client.get('/api/admin/donations/overview').subscribe();

    read.unsubscribe();

    expect(http.expectOne('/api/admin/donations/overview').cancelled).toBe(true);
    expect(placement.isAnswered()).toBe(true);
  });

  it('when a read outlasts the longest wait, then the wait ends without it', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');
    client.get('/api/admin/donations/import-state').subscribe();
    vi.useFakeTimers();
    let answered = false;

    void placement.answered(window, LONGEST_MS).then(() => (answered = true));
    await vi.advanceTimersByTimeAsync(LONGEST_MS);

    expect(answered).toBe(true);
    http.expectOne('/api/admin/donations/import-state').flush({});
  });

  it('when the next navigation starts, then the reads of the page left no longer count', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');
    client.get('/api/admin/donors/administrators').subscribe();

    await router.navigateByUrl('/sprava/platby');

    expect(placement.isAnswered()).toBe(true);
    http.expectOne('/api/admin/donors/administrators').flush([]);
  });

  it('when the page writes or asks another address, then the page counts as answered meanwhile', async () => {
    await router.navigateByUrl('/sprava/lide-fondu');

    client.post('/api/admin/content/people', {}).subscribe();
    client.get('/assets/receipt-fonts.json').subscribe();

    expect(placement.isAnswered()).toBe(true);
    http.expectOne('/api/admin/content/people').flush({});
    http.expectOne('/assets/receipt-fonts.json').flush({});
  });
});
