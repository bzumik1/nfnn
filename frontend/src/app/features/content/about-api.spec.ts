import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AboutApi, AboutResponse } from './about-api';
import { aboutPhoto, ABOUT_PHOTO_ID } from './testing/about-fixtures';

describe('Given the API of the About section', () => {
  let api: AboutApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AboutApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the section is loaded, then it asks the administration and hands the photo on', () => {
    let received: AboutResponse | undefined;
    api.load().subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/content/about');
    expect(request.request.method).toBe('GET');
    request.flush({ photo: aboutPhoto() });

    expect(received).toEqual({ photo: aboutPhoto() });
  });

  it('when the section is saved, then it replaces the photo and its texts in one request', () => {
    let received: AboutResponse | undefined;
    api
      .save({ photoId: ABOUT_PHOTO_ID, photoAlt: 'Popis', caption: null })
      .subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/content/about');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      photoId: ABOUT_PHOTO_ID,
      photoAlt: 'Popis',
      caption: null,
    });
    request.flush({ photo: null });

    expect(received).toEqual({ photo: null });
  });
});
