import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdministrationWrites, administrationWritesInterceptor } from './administration-writes';

describe('Given the administration writes counted for the device copy', () => {
  let http: HttpClient;
  let server: HttpTestingController;
  let writes: AdministrationWrites;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([administrationWritesInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
    writes = TestBed.inject(AdministrationWrites);
  });

  afterEach(() => server.verify());

  it('when an administration write succeeds, then it counts, and a refused one does not', () => {
    http.post('/api/admin/donations/symbol-claims/c1/reversal', {}).subscribe();
    server.expectOne('/api/admin/donations/symbol-claims/c1/reversal').flush(null);
    http.delete('/api/admin/donors/d1/administrator').subscribe({ error: () => undefined });
    server
      .expectOne('/api/admin/donors/d1/administrator')
      .flush(null, { status: 409, statusText: 'Conflict' });

    expect(writes.made()).toBe(1);
  });

  it('when the request reads, unlocks the device or is no administration call, then nothing counts', () => {
    http.get('/api/admin/donations/payments').subscribe();
    server.expectOne('/api/admin/donations/payments').flush({});
    http.post('/api/admin/donors/devices/current/unlock', {}).subscribe();
    server.expectOne('/api/admin/donors/devices/current/unlock').flush(null);
    http.post('/api/contact/messages', {}).subscribe();
    server.expectOne('/api/contact/messages').flush(null);

    expect(writes.made()).toBe(0);
  });
});
