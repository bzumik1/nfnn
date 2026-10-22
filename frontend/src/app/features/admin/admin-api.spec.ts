import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminApi, ImportStateResponse } from './admin-api';
import { importState } from './testing/admin-fixtures';

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
});
