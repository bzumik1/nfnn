import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProjectsApi, ProjectResponse, slugFromText, UploadedImageResponse } from './projects-api';
import { project, uploadedImage } from './testing/project-fixtures';

describe('Given the projects API', () => {
  let api: ProjectsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProjectsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when an project is published, then it posts the date to the publish endpoint and hands the project on', () => {
    let received: ProjectResponse | undefined;
    api.publish(project().id, '2026-10-20').subscribe((response) => (received = response));

    const request = http.expectOne(`/api/admin/content/projects/${project().id}/publish`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ publishedOn: '2026-10-20' });
    request.flush(project());

    expect(received).toEqual(project());
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

    const request = http.expectOne('/api/content/projects?page=1&size=10');
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
