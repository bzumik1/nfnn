import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  draftArticle,
  IMAGE_ID,
  newsArticle,
  uploadedImage,
} from '../../content/testing/news-fixtures';
import { AdminNewsEditor } from './admin-news-editor';

const NEWS_URL = '/api/admin/content/news';
const MEDIA_URL = '/api/admin/content/media';

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

async function setUp(id: string | null): Promise<{
  fixture: ComponentFixture<AdminNewsEditor>;
  http: HttpTestingController;
}> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [AdminNewsEditor],
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(id === null ? {} : { id }) } },
      },
    ],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
  http
    .expectOne('/api/donors/auth/login')
    .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  const fixture = TestBed.createComponent(AdminNewsEditor);
  fixture.detectChanges();
  return { fixture, http };
}

function element<T extends HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T {
  const found = fixture.nativeElement.querySelector(selector) as T | null;
  if (found === null) {
    throw new Error(`No element matches ${selector}`);
  }
  return found;
}

function text(fixture: ComponentFixture<unknown>, selector: string): string {
  return (fixture.nativeElement.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function button(fixture: ComponentFixture<unknown>, name: string): HTMLButtonElement {
  const found = Array.from(
    fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
  ).find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name);
  if (found === undefined) {
    throw new Error(`No button ${name}`);
  }
  return found;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

async function type(
  fixture: ComponentFixture<unknown>,
  selector: string,
  value: string,
): Promise<void> {
  const control = element<HTMLInputElement | HTMLTextAreaElement>(fixture, selector);
  control.value = value;
  control.dispatchEvent(new Event('input'));
  control.dispatchEvent(new Event('blur'));
  await settle(fixture);
}

async function submit(fixture: ComponentFixture<unknown>): Promise<void> {
  element<HTMLFormElement>(fixture, 'form.article-form').dispatchEvent(new Event('submit'));
  await settle(fixture);
}

async function chooseFile(fixture: ComponentFixture<unknown>, file: File): Promise<void> {
  const input = element<HTMLInputElement>(fixture, '#news-image');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

describe('Given an administrator writing a new news article', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(null));
  });

  afterEach(() => http.verify());

  it('when they type the title, then the address is made from it until they change it themselves', async () => {
    await type(fixture, '#news-title', 'Nový projekt: Zahrada pro děti');

    expect(element<HTMLInputElement>(fixture, '#news-slug').value).toBe(
      'novy-projekt-zahrada-pro-deti',
    );
    expect(text(fixture, '.field-hint')).toContain(
      'Aktualita bude na nfnn.cz/aktuality/novy-projekt-zahrada-pro-deti.',
    );

    await type(fixture, '#news-slug', 'zahrada');
    await type(fixture, '#news-title', 'Jiný titulek');

    expect(element<HTMLInputElement>(fixture, '#news-slug').value).toBe('zahrada');
  });

  it('when they save with the title and the perex empty, then both fields say so and nothing is sent', async () => {
    await type(fixture, '#news-body', 'Text.');
    await submit(fixture);

    expect(element(fixture, '#news-title').getAttribute('aria-invalid')).toBe('true');
    expect(element(fixture, '#news-perex').getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#news-title-error')).toBe('Vyplňte prosím titulek.');
    http.expectNone(NEWS_URL);
  });

  it('when they save a complete draft, then it is created, the address changes to the article and publishing becomes possible', async () => {
    const replaced = vi.spyOn(TestBed.inject(Location), 'replaceState');
    await type(fixture, '#news-title', 'Benefiční koncert');
    await type(fixture, '#news-tag', '  ');
    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await submit(fixture);

    const request = http.expectOne(NEWS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Benefiční koncert',
      slug: 'beneficni-koncert',
      tag: null,
      perex: 'Zveme vás na koncert.',
      body: 'Text o koncertu.',
      coverImageId: null,
      coverImageAlt: null,
    });
    request.flush(draftArticle());
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Zveřejnit.',
    );
    expect(replaced).toHaveBeenCalledWith(`/sprava/aktuality/${draftArticle().id}`);
    expect(text(fixture, 'h1')).toBe('Úprava aktuality');
    expect(button(fixture, 'Zveřejnit').disabled).toBe(false);
    expect(text(fixture, '.publish-state')).toContain('Koncept');
  });

  it('when the address is already taken, then the form shows the backend words and stays editable', async () => {
    await type(fixture, '#news-title', 'Zahrada pro děti');
    await type(fixture, '#news-perex', 'Perex.');
    await type(fixture, '#news-body', 'Text.');
    await submit(fixture);

    const refusal = problem(
      409,
      'content/slug-taken',
      'Adresa je obsazená',
      'Jinou aktualitu už najdete na této adrese.',
    );
    http.expectOne(NEWS_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.form-error')).toBe(
      'Adresa je obsazená. Jinou aktualitu už najdete na této adrese.',
    );
    expect(button(fixture, 'Uložit koncept').disabled).toBe(false);
  });

  it('when they choose a photo, then it is uploaded at once, shown as a preview and sent with the article', async () => {
    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));

    expect(text(fixture, '.field-status')).toBe('Nahráváme fotku…');
    const upload = http.expectOne(MEDIA_URL);
    expect(upload.request.method).toBe('POST');
    expect((upload.request.body as FormData).get('file')).toBeInstanceOf(File);
    upload.flush(uploadedImage());
    await settle(fixture);

    expect(element<HTMLImageElement>(fixture, '.image-preview').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );

    await type(fixture, '#news-title', 'S fotkou');
    await type(fixture, '#news-perex', 'Perex.');
    await type(fixture, '#news-body', 'Text.');
    await type(fixture, '#news-image-alt', '  Děti sázejí stromek ');
    await submit(fixture);

    const request = http.expectOne(NEWS_URL);
    expect(request.request.body).toMatchObject({
      coverImageId: IMAGE_ID,
      coverImageAlt: 'Děti sázejí stromek',
    });
    request.flush(newsArticle());
  });

  it('when the chosen file is not a photo, then the field says so and nothing is uploaded', async () => {
    await chooseFile(fixture, new File(['text'], 'poznamky.txt', { type: 'text/plain' }));

    expect(text(fixture, '.image-field [role="alert"]:not(:empty)')).toBe(
      'Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.',
    );
    http.expectNone(MEDIA_URL);
  });

  it('when the server refuses the photo, then the field carries its words', async () => {
    await chooseFile(fixture, new File(['png'], 'velky.png', { type: 'image/png' }));
    const refusal = problem(
      413,
      'upload-too-large',
      'Soubor je příliš velký',
      'Nahrát jde soubor nejvýš 10 MB.',
    );
    http.expectOne(MEDIA_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.image-field [role="alert"]:not(:empty)')).toBe(
      'Soubor je příliš velký. Nahrát jde soubor nejvýš 10 MB.',
    );
    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();
  });
});

describe('Given an administrator editing a published news article', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(newsArticle().id));
  });

  afterEach(() => http.verify());

  async function loaded(): Promise<void> {
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await settle(fixture);
  }

  it('when the article arrives, then the form carries its texts, the photo preview and the published state', async () => {
    await loaded();

    expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Zahrada pro děti');
    expect(element<HTMLInputElement>(fixture, '#news-slug').value).toBe('zahrada-pro-deti');
    expect(element<HTMLInputElement>(fixture, '#news-tag').value).toBe('Projekt');
    expect(element<HTMLTextAreaElement>(fixture, '#news-body').value).toBe(
      'První odstavec textu.\n\nDruhý odstavec textu.',
    );
    expect(element<HTMLImageElement>(fixture, '.image-preview').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '.publish-state')).toContain(
      'Zveřejněno s datem 20. 10. 2026. Web řadí aktuality podle tohoto data.',
    );
    expect(element<HTMLInputElement>(fixture, '#news-publish-date').value).toBe('2026-10-20');
    expect(text(fixture, '.updated-at')).toBe('Naposledy uloženo 20. 10. 2026 09:30.');
  });

  it('when they remove the photo and save, then the article is updated without a cover image', async () => {
    await loaded();
    button(fixture, 'Odebrat fotku').click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();

    await submit(fixture);
    const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      title: 'Zahrada pro děti',
      slug: 'zahrada-pro-deti',
      tag: 'Projekt',
      perex: newsArticle().perex,
      body: newsArticle().body,
      coverImageId: null,
      coverImageAlt: null,
    });
    request.flush(newsArticle({ coverImage: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe('Změny jsme uložili.');
  });

  it('when they take the article off the site, then it becomes a draft and the page says so', async () => {
    await loaded();
    button(fixture, 'Stáhnout z webu').click();
    await settle(fixture);

    const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}/unpublish`);
    expect(request.request.method).toBe('POST');
    request.flush(newsArticle({ publishedOn: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Aktualitu jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    expect(text(fixture, '.publish-state')).toContain('Koncept');
    expect(button(fixture, 'Zveřejnit').disabled).toBe(false);
  });

  it('when they change the date, then the article is published again with it', async () => {
    await loaded();
    const date = element<HTMLInputElement>(fixture, '#news-publish-date');
    date.value = '2026-10-01';
    date.dispatchEvent(new Event('input'));
    await settle(fixture);
    button(fixture, 'Změnit datum').click();
    await settle(fixture);

    const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}/publish`);
    expect(request.request.body).toEqual({ publishedOn: '2026-10-01' });
    request.flush(newsArticle({ publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Aktualita je na webu s datem 01. 10. 2026.',
    );
  });

  it('when they confirm the deletion, then the article is deleted and they return to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await loaded();
    button(fixture, 'Smazat aktualitu').click();
    await settle(fixture);

    expect(text(fixture, '.confirm[role="group"]')).toContain(
      'Opravdu smazat aktualitu „Zahrada pro děti“?',
    );
    button(fixture, 'Ano, smazat').click();
    await settle(fixture);

    const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/aktuality');
  });

  it('when the article no longer exists, then the page returns to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(404, 'content/news-not-found', 'Aktualita nenalezena', '');
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/aktuality');
  });
});
