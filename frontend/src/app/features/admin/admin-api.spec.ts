import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminActivitySinceResponse, AdminApi, ImportStateResponse } from './admin-api';
import { activitySince, importState } from './testing/admin-fixtures';

describe('Given the administration API', () => {
  let api: AdminApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AdminApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the import state is requested, then it asks the admin endpoint and hands the answer on', () => {
    let received: ImportStateResponse | undefined;
    api.importState().subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/donations/import-state');
    expect(request.request.method).toBe('GET');
    request.flush(importState());

    expect(received).toEqual(importState());
  });

  it('when the previous sign-in is requested, then it asks the endpoint of the signed-in administrator', () => {
    let received: string | null | undefined;
    api.previousSignIn().subscribe((response) => (received = response.previousSignInAt));

    const request = http.expectOne('/api/admin/donors/me/previous-sign-in');
    expect(request.request.method).toBe('GET');
    request.flush({ previousSignInAt: '2026-10-28T20:14:00Z' });

    expect(received).toBe('2026-10-28T20:14:00Z');
  });

  it('when what came in since a moment is requested, then the moment travels as the from parameter', () => {
    let received: AdminActivitySinceResponse | undefined;
    api.overviewSince('2026-10-28T20:14:00Z').subscribe((response) => (received = response));

    const request = http.expectOne(
      (candidate) =>
        candidate.url === '/api/admin/donations/overview/since' &&
        candidate.params.get('from') === '2026-10-28T20:14:00Z',
    );
    request.flush(activitySince());

    expect(received).toEqual(activitySince());
  });
});
