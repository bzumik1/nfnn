import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DonateBandApi, DonateBandResponse } from './donate-band-api';
import { DONATE_BAND_PHOTO_ID, donateBandPhoto } from './testing/donate-band-fixtures';

describe('Given the API of the Přispět band', () => {
  let api: DonateBandApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DonateBandApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the band is loaded, then it asks the administration and hands the photo on', () => {
    let received: DonateBandResponse | undefined;
    api.load().subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/content/donate-band');
    expect(request.request.method).toBe('GET');
    request.flush({ photo: donateBandPhoto() });

    expect(received).toEqual({ photo: donateBandPhoto() });
  });

  it('when the band is saved, then it replaces the photo and its description in one request', () => {
    let received: DonateBandResponse | undefined;
    api
      .save({ photoId: DONATE_BAND_PHOTO_ID, photoAlt: 'Popis' })
      .subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/content/donate-band');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ photoId: DONATE_BAND_PHOTO_ID, photoAlt: 'Popis' });
    request.flush({ photo: null });

    expect(received).toEqual({ photo: null });
  });
});
