import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { heldRecordOf } from '../../core/version/row-version';
import {
  NewsApi,
  NewsArticleResponse,
  slugFromText,
  storedNewsArticleOf,
  UploadedImageResponse,
} from './news-api';
import { newsArticle, uploadedImage } from './testing/news-fixtures';

describe('Given the news API', () => {
  let api: NewsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(NewsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when an article is published, then it posts the date with the version read to the publish endpoint and hands the article on', () => {
    let received: NewsArticleResponse | undefined;
    api
      .publish(
        newsArticle().id,
        '2026-10-20',
        '9d4b2e7a1c0f5836',
        storedNewsArticleOf(newsArticle()),
      )
      .subscribe((response) => (received = response));

    const request = http.expectOne(`/api/admin/content/news/${newsArticle().id}/publish`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ publishedOn: '2026-10-20' });
    expect(request.request.headers.get('If-Match')).toBe('"9d4b2e7a1c0f5836"');
    expect(heldRecordOf(request.request.context)).toEqual({
      id: newsArticle().id,
      slug: newsArticle().slug,
      title: newsArticle().title,
      tag: newsArticle().tag,
      perex: newsArticle().perex,
      body: newsArticle().body,
      coverImage: newsArticle().coverImage?.id ?? null,
      coverImageAlt: newsArticle().coverImage?.alt ?? null,
      signer: newsArticle().signer?.id ?? null,
      publishedOn: newsArticle().publishedOn,
    });
    request.flush(newsArticle());

    expect(received).toEqual(newsArticle());
  });

  it('when the year an article looks back on is set, then it puts only the year with the version read to its own endpoint, so an older tab saving the article never clears it', () => {
    let received: NewsArticleResponse | undefined;
    api
      .setLookBackYear(newsArticle().id, 2025, '9d4b2e7a1c0f5836')
      .subscribe((response) => (received = response));

    const request = http.expectOne(`/api/admin/content/news/${newsArticle().id}/look-back-year`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ year: 2025 });
    expect(request.request.headers.get('If-Match')).toBe('"9d4b2e7a1c0f5836"');
    request.flush(newsArticle({ lookBackYear: 2025 }));

    expect(received?.lookBackYear).toBe(2025);
  });

  it('when an image is uploaded, then it sends the file as the "file" part of a multipart request', () => {
    let received: UploadedImageResponse | undefined;
    const file = new File(['fake'], 'zahrada.png', { type: 'image/png' });
    api.uploadImage(file).subscribe((response) => (received = response));

    const request = http.expectOne('/api/admin/content/media');
    expect(request.request.method).toBe('POST');
    const body = request.request.body as FormData;
    expect(body.get('file')).toBeInstanceOf(File);
    expect((body.get('file') as File).name).toBe('zahrada.png');
    request.flush(uploadedImage());

    expect(received).toEqual(uploadedImage());
  });

  it('when the public list is requested, then it asks for the page and size without a token', () => {
    api.published(1, 10).subscribe();

    const request = http.expectOne('/api/content/news?page=1&size=10');
    expect(request.request.method).toBe('GET');
    request.flush({ items: [], page: 1, size: 10, total: 0, hasMore: false });
  });
});

describe('Given a title typed by an administrator', () => {
  it('when the address is made from it, then diacritics, case and punctuation turn into lowercase words joined by hyphens', () => {
    expect(slugFromText('Nový projekt: Zahrada pro děti!')).toBe('novy-projekt-zahrada-pro-deti');
    expect(slugFromText('  Příliš   žluťoučký kůň  ')).toBe('prilis-zlutoucky-kun');
    expect(slugFromText('---')).toBe('');
  });

  it('when the title is very long, then the address is cut to 80 characters without a trailing hyphen', () => {
    const slug = slugFromText('a'.repeat(79) + ' b');
    expect(slug).toBe('a'.repeat(79));
  });
});
