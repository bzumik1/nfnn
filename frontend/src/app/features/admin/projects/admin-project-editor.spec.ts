import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  draftProject,
  IMAGE_ID,
  project,
  uploadedImage,
} from '../../content/testing/project-fixtures';
import { AdminProjectEditor } from './admin-project-editor';

const PROJECTS_URL = '/api/admin/content/projects';
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
  fixture: ComponentFixture<AdminProjectEditor>;
  http: HttpTestingController;
}> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [AdminProjectEditor],
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
  const fixture = TestBed.createComponent(AdminProjectEditor);
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
  element<HTMLFormElement>(fixture, 'form.project-form').dispatchEvent(new Event('submit'));
  await settle(fixture);
}

async function chooseFile(fixture: ComponentFixture<unknown>, file: File): Promise<void> {
  const input = element<HTMLInputElement>(fixture, '#projects-image');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

describe('Given an administrator writing a new project', () => {
  let fixture: ComponentFixture<AdminProjectEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(null));
  });

  afterEach(() => http.verify());

  it('when they type the title, then the address is made from it until they change it themselves', async () => {
    await type(fixture, '#projects-title', 'Nový projekt: Zahrada pro děti');

    expect(element<HTMLInputElement>(fixture, '#projects-slug').value).toBe(
      'novy-projekt-zahrada-pro-deti',
    );
    expect(text(fixture, '#projects-slug-hint')).toContain(
      'Projekt bude na nfnn.cz/projekty/novy-projekt-zahrada-pro-deti.',
    );

    await type(fixture, '#projects-slug', 'zahrada');
    await type(fixture, '#projects-title', 'Jiný titulek');

    expect(element<HTMLInputElement>(fixture, '#projects-slug').value).toBe('zahrada');
  });

  it('when they open the form, then the year is this year', () => {
    expect(element<HTMLInputElement>(fixture, '#projects-year').value).toBe(
      String(new Date().getFullYear()),
    );
  });

  it('when they save with the title and the perex empty, then both fields say so and nothing is sent', async () => {
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    expect(element(fixture, '#projects-title').getAttribute('aria-invalid')).toBe('true');
    expect(element(fixture, '#projects-perex').getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#projects-title-error')).toBe('Vyplňte prosím titulek.');
    http.expectNone(PROJECTS_URL);
  });

  it('when the year is before the fund was founded, then the field says so and nothing is sent', async () => {
    await type(fixture, '#projects-title', 'Starý projekt');
    await type(fixture, '#projects-year', '2004');
    await type(fixture, '#projects-perex', 'Perex.');
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    expect(element(fixture, '#projects-year').getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#projects-year-error')).toBe(
      'Rok nemůže být před založením fondu, tedy před 2005.',
    );
    http.expectNone(PROJECTS_URL);
  });

  it('when they save a complete draft, then it is created, the address changes to the project and publishing becomes possible', async () => {
    const replaced = vi.spyOn(TestBed.inject(Location), 'replaceState');
    await type(fixture, '#projects-title', 'Benefiční koncert');
    await type(fixture, '#projects-year', '2026');
    await type(fixture, '#projects-tag', '  ');
    await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
    await type(fixture, '#projects-body', 'Text o koncertu.');
    await submit(fixture);

    const request = http.expectOne(PROJECTS_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      title: 'Benefiční koncert',
      year: 2026,
      slug: 'beneficni-koncert',
      tag: null,
      perex: 'Zveme vás na koncert.',
      body: 'Text o koncertu.',
      coverImageId: null,
      coverImageAlt: null,
    });
    request.flush(draftProject());
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Projekt jsme uložili jako koncept. Na web ho dostanete tlačítkem Zveřejnit.',
    );
    expect(replaced).toHaveBeenCalledWith(`/sprava/projekty/${draftProject().id}`);
    expect(text(fixture, 'h1')).toBe('Úprava projektu');
    expect(button(fixture, 'Zveřejnit').disabled).toBe(false);
    expect(text(fixture, '.publish-state')).toContain('Koncept');
  });

  it('when the address is already taken, then the form shows the backend words and stays editable', async () => {
    await type(fixture, '#projects-title', 'Zahrada pro děti');
    await type(fixture, '#projects-perex', 'Perex.');
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    const refusal = problem(
      409,
      'content/slug-taken',
      'Adresa je obsazená',
      'Jiná aktualita nebo projekt už tuto adresu používá; zvolte jinou.',
    );
    http.expectOne(PROJECTS_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.form-error')).toBe(
      'Adresa je obsazená. Jiná aktualita nebo projekt už tuto adresu používá; zvolte jinou.',
    );
    expect(button(fixture, 'Uložit koncept').disabled).toBe(false);
  });

  it('when they choose a photo, then it is uploaded at once, shown as a preview and sent with the project', async () => {
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

    await type(fixture, '#projects-title', 'S fotkou');
    await type(fixture, '#projects-perex', 'Perex.');
    await type(fixture, '#projects-body', 'Text.');
    await type(fixture, '#projects-image-alt', '  Děti sázejí stromek ');
    await submit(fixture);

    const request = http.expectOne(PROJECTS_URL);
    expect(request.request.body).toMatchObject({
      coverImageId: IMAGE_ID,
      coverImageAlt: 'Děti sázejí stromek',
    });
    request.flush(project());
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

describe('Given an administrator editing a published project', () => {
  let fixture: ComponentFixture<AdminProjectEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(project().id));
  });

  afterEach(() => http.verify());

  async function loaded(): Promise<void> {
    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(project());
    await settle(fixture);
  }

  it('when the project arrives, then the form carries its texts, the photo preview and the published state', async () => {
    await loaded();

    expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe('Zahrada pro děti');
    expect(element<HTMLInputElement>(fixture, '#projects-slug').value).toBe('zahrada-pro-deti');
    expect(element<HTMLInputElement>(fixture, '#projects-year').value).toBe('2024');
    expect(element<HTMLInputElement>(fixture, '#projects-tag').value).toBe('Projekt');
    expect(element<HTMLTextAreaElement>(fixture, '#projects-body').value).toBe(
      'První odstavec textu.\n\nDruhý odstavec textu.',
    );
    expect(element<HTMLImageElement>(fixture, '.image-preview').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '.publish-state')).toContain(
      'Zveřejněno s datem 20. 10. 2026. Web řadí projekty podle roku a pak podle tohoto data.',
    );
    expect(element<HTMLInputElement>(fixture, '#projects-publish-date').value).toBe('2026-10-20');
    expect(text(fixture, '.updated-at')).toBe('Naposledy uloženo 20. 10. 2026 09:30.');
  });

  it('when they remove the photo and save, then the project is updated without a cover image', async () => {
    await loaded();
    button(fixture, 'Odebrat fotku').click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();

    await submit(fixture);
    const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      title: 'Zahrada pro děti',
      year: 2024,
      slug: 'zahrada-pro-deti',
      tag: 'Projekt',
      perex: project().perex,
      body: project().body,
      coverImageId: null,
      coverImageAlt: null,
    });
    request.flush(project({ coverImage: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe('Změny jsme uložili.');
  });

  it('when they take the project off the site, then it becomes a draft and the page says so', async () => {
    await loaded();
    button(fixture, 'Stáhnout z webu').click();
    await settle(fixture);

    const request = http.expectOne(`${PROJECTS_URL}/${project().id}/unpublish`);
    expect(request.request.method).toBe('POST');
    request.flush(project({ publishedOn: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Projekt jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    expect(text(fixture, '.publish-state')).toContain('Koncept');
    expect(button(fixture, 'Zveřejnit').disabled).toBe(false);
  });

  it('when they change the date, then the project is published again with it', async () => {
    await loaded();
    const date = element<HTMLInputElement>(fixture, '#projects-publish-date');
    date.value = '2026-10-01';
    date.dispatchEvent(new Event('input'));
    await settle(fixture);
    button(fixture, 'Změnit datum').click();
    await settle(fixture);

    const request = http.expectOne(`${PROJECTS_URL}/${project().id}/publish`);
    expect(request.request.body).toEqual({ publishedOn: '2026-10-01' });
    request.flush(project({ publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Projekt je na webu s datem 01. 10. 2026.',
    );
  });

  it('when they confirm the deletion, then the project is deleted and they return to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await loaded();
    button(fixture, 'Smazat projekt').click();
    await settle(fixture);

    expect(text(fixture, '.confirm[role="group"]')).toContain(
      'Opravdu smazat projekt „Zahrada pro děti“?',
    );
    button(fixture, 'Ano, smazat').click();
    await settle(fixture);

    const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/projekty');
  });

  it('when the project no longer exists, then the page returns to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(404, 'content/project-not-found', 'Projekt nenalezen', '');
    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/projekty');
  });
});
