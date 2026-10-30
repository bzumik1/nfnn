import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { ABOUT_PHOTO_ID, aboutPhoto } from '../../content/testing/about-fixtures';
import { IMAGE_ID, uploadedImage } from '../../content/testing/news-fixtures';
import { AdminAbout } from './admin-about';

const ABOUT_URL = '/api/admin/content/about';
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

async function setUp(): Promise<{
  fixture: ComponentFixture<AdminAbout>;
  http: HttpTestingController;
}> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [AdminAbout],
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
  http
    .expectOne('/api/donors/auth/login')
    .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  const fixture = TestBed.createComponent(AdminAbout);
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

function findButton(fixture: ComponentFixture<unknown>, name: string): HTMLButtonElement | null {
  return (
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name) ?? null
  );
}

function button(fixture: ComponentFixture<unknown>, name: string): HTMLButtonElement {
  const found = findButton(fixture, name);
  if (found === null) {
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
  const control = element<HTMLInputElement>(fixture, selector);
  control.value = value;
  control.dispatchEvent(new Event('input'));
  control.dispatchEvent(new Event('blur'));
  await settle(fixture);
}

async function submit(fixture: ComponentFixture<unknown>): Promise<void> {
  element<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
  await settle(fixture);
}

async function chooseFile(fixture: ComponentFixture<unknown>, file: File): Promise<void> {
  const input = element<HTMLInputElement>(fixture, '#about-photo');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function click(fixture: ComponentFixture<unknown>, name: string): Promise<void> {
  button(fixture, name).click();
  await settle(fixture);
}

describe('Given an administrator and an About section without a photo', () => {
  let fixture: ComponentFixture<AdminAbout>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(ABOUT_URL).flush({ photo: null });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then it says the placeholder shows and offers only to upload a photo', () => {
    expect(text(fixture, 'h1')).toBe('Fotka v sekci O nás');
    expect(document.activeElement).toBe(element(fixture, 'h1'));
    expect(text(fixture, '.photo-state')).toBe(
      'Fotka zatím není nahraná, web ukazuje ilustrační fotku.',
    );
    expect(text(fixture, 'label[for="about-photo"]')).toBe('Nahrát fotku');
    expect(fixture.nativeElement.querySelector('#about-photo-alt')).toBeNull();
    expect(findButton(fixture, 'Odebrat fotku z webu')).toBeNull();
  });

  it('when they upload a photo and save it with its texts, then the trimmed texts go with it and the page says it is on the site', async () => {
    await chooseFile(fixture, new File(['png'], 'zakladatele.png', { type: 'image/png' }));
    const upload = http.expectOne(MEDIA_URL);
    expect(upload.request.method).toBe('POST');
    expect((upload.request.body as FormData).get('file')).toBeInstanceOf(File);
    upload.flush(uploadedImage({ width: 1413, height: 1884 }));
    await settle(fixture);

    expect(element<HTMLImageElement>(fixture, '.photo-preview').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Fotka je nahraná. Na web se dostane, až ji uložíte.',
    );
    expect(text(fixture, 'label[for="about-photo"]')).toBe('Vyměnit fotku');

    await type(fixture, '#about-photo-alt', '  Malý chlapec v náručí dvou dospělých  ');
    await type(fixture, '#about-photo-caption', 'Kde to všechno začalo ');
    await submit(fixture);

    const save = http.expectOne(ABOUT_URL);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({
      photoId: IMAGE_ID,
      photoAlt: 'Malý chlapec v náručí dvou dospělých',
      caption: 'Kde to všechno začalo',
    });
    expect(text(fixture, 'button[type="submit"]')).toBe('Ukládáme…');
    save.flush({ photo: aboutPhoto({ id: IMAGE_ID }) });
    await settle(fixture);

    expect(text(fixture, '.ui-notice--status')).toBe('Uloženo. Fotka je na webu v sekci O nás.');
    expect(button(fixture, 'Odebrat fotku z webu')).toBeTruthy();
  });

  it('when they save a photo without texts, then the texts go as empty', async () => {
    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));
    http.expectOne(MEDIA_URL).flush(uploadedImage());
    await settle(fixture);
    await type(fixture, '#about-photo-alt', '   ');
    await submit(fixture);

    expect(http.expectOne(ABOUT_URL).request.body).toEqual({
      photoId: IMAGE_ID,
      photoAlt: null,
      caption: null,
    });
  });

  it('when the chosen file is not a photo, then the page says so and nothing is uploaded', async () => {
    await chooseFile(fixture, new File(['text'], 'poznamky.txt', { type: 'text/plain' }));

    expect(text(fixture, '.field-error[role="alert"]')).toBe(
      'Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.',
    );
    http.expectNone(MEDIA_URL);
  });

  it('when the server refuses the photo, then the page carries its words and shows no preview', async () => {
    await chooseFile(fixture, new File(['png'], 'velky.png', { type: 'image/png' }));
    const refusal = problem(
      413,
      'upload-too-large',
      'Soubor je příliš velký',
      'Nahrát jde soubor nejvýš 10 MB.',
    );
    http.expectOne(MEDIA_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.field-error[role="alert"]')).toBe(
      'Soubor je příliš velký. Nahrát jde soubor nejvýš 10 MB.',
    );
    expect(fixture.nativeElement.querySelector('.photo-preview')).toBeNull();
  });
});

describe('Given an administrator and an About section with a saved photo', () => {
  let fixture: ComponentFixture<AdminAbout>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(ABOUT_URL).flush({ photo: aboutPhoto() });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then it shows the photo with its texts and offers to replace and remove it', () => {
    const preview = element<HTMLImageElement>(fixture, '.photo-preview');
    expect(preview.getAttribute('src')).toBe(`/api/content/media/${ABOUT_PHOTO_ID}?w=480`);
    expect(preview.getAttribute('width')).toBe('1413');
    expect(preview.getAttribute('height')).toBe('1884');
    expect(element<HTMLInputElement>(fixture, '#about-photo-alt').value).toBe(
      'Malý chlapec v náručí dvou dospělých',
    );
    expect(element<HTMLInputElement>(fixture, '#about-photo-caption').value).toBe(
      'Kde to všechno začalo',
    );
    expect(text(fixture, 'label[for="about-photo"]')).toBe('Vyměnit fotku');
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe('');
  });

  it('when they change only the caption, then the same photo is saved with the new caption', async () => {
    await type(fixture, '#about-photo-caption', 'Jiný popisek');
    await submit(fixture);

    expect(http.expectOne(ABOUT_URL).request.body).toEqual({
      photoId: ABOUT_PHOTO_ID,
      photoAlt: 'Malý chlapec v náručí dvou dospělých',
      caption: 'Jiný popisek',
    });
  });

  it('when the server refuses the save, then the page carries its words', async () => {
    await submit(fixture);
    const refusal = problem(
      404,
      'content/media-not-found',
      'Fotka nenalezena',
      'Nahrajte ji znovu.',
    );
    http.expectOne(ABOUT_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.ui-notice--alert')).toBe('Fotka nenalezena. Nahrajte ji znovu.');
    expect(button(fixture, 'Uložit a ukázat na webu').disabled).toBe(false);
  });

  it('when they start removing and cancel, then nothing is sent and focus returns to the button', async () => {
    await click(fixture, 'Odebrat fotku z webu');

    expect(text(fixture, '[role="group"]')).toContain('Opravdu fotku odebrat z webu a smazat?');
    expect(document.activeElement).toBe(button(fixture, 'Zrušit'));

    await click(fixture, 'Zrušit');

    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button(fixture, 'Odebrat fotku z webu'));
  });

  it('when they confirm the removal, then the photo goes and the page says the placeholder shows again', async () => {
    await click(fixture, 'Odebrat fotku z webu');
    await click(fixture, 'Odebrat a smazat');

    const removal = http.expectOne(ABOUT_URL);
    expect(removal.request.method).toBe('PUT');
    expect(removal.request.body).toEqual({ photoId: null, photoAlt: null, caption: null });
    removal.flush({ photo: null });
    await settle(fixture);

    expect(text(fixture, '.ui-notice--status')).toBe(
      'Fotku jsme z webu odebrali a smazali. Sekce O nás ukazuje zase ilustrační fotku.',
    );
    expect(fixture.nativeElement.querySelector('.photo-preview')).toBeNull();
    expect(findButton(fixture, 'Odebrat fotku z webu')).toBeNull();
    expect(document.activeElement).toBe(element(fixture, '#about-photo'));
  });

  it('when the removal fails, then the removal card carries the reason and keeps the photo', async () => {
    await click(fixture, 'Odebrat fotku z webu');
    await click(fixture, 'Odebrat a smazat');
    const refusal = problem(500, 'internal', 'Chyba serveru', 'Zkuste to později.');
    http.expectOne(ABOUT_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.remove-card .ui-notice--alert')).toBe(
      'Chyba serveru. Zkuste to později.',
    );
    expect(fixture.nativeElement.querySelector('.photo-preview')).not.toBeNull();
    expect(document.activeElement).toBe(button(fixture, 'Odebrat fotku z webu'));
  });
});

describe('Given an administrator whose About section does not load', () => {
  let fixture: ComponentFixture<AdminAbout>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
  });

  afterEach(() => http.verify());

  it('when the server fails, then the page offers to try again, and trying again loads it', async () => {
    http.expectOne(ABOUT_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(fixture, '[role="alert"]')).toContain('Fotku se nepodařilo načíst.');

    await click(fixture, 'Zkusit znovu');
    http.expectOne(ABOUT_URL).flush({ photo: null });
    await settle(fixture);

    expect(text(fixture, '.photo-state')).toBe(
      'Fotka zatím není nahraná, web ukazuje ilustrační fotku.',
    );
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(ABOUT_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
