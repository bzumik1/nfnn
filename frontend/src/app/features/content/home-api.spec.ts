import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { REFRESH_AFTER_KEPT_COPY } from '../../core/connectivity/kept-answer-refresh';
import { HomeApi, HomeResponse } from './home-api';
import { newsArticle } from './testing/news-fixtures';
import { project } from './testing/project-fixtures';

describe('Given the home content API', () => {
  let api: HomeApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(HomeApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("when the home content is loaded, then it asks for the server's answer after a kept copy, as the pages that read it take a second value", () => {
    api.load().subscribe();

    const request = http.expectOne('/api/content/home');
    expect(request.request.context.get(REFRESH_AFTER_KEPT_COPY)).toBe(true);
    request.flush({ news: [], projects: [] });
  });

  it('when the home content is loaded, then it asks the public endpoint once and hands both lists on', () => {
    let received: HomeResponse | undefined;
    api.load().subscribe((response) => (received = response));

    const request = http.expectOne('/api/content/home');
    expect(request.request.method).toBe('GET');
    request.flush({ news: [newsArticle()], projects: [project()] });

    expect(received).toEqual({ news: [newsArticle()], projects: [project()] });
  });
});
