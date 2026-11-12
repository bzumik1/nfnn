import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { DONATE_BAND_PHOTO_ID, donateBandPhoto } from '../../content/testing/donate-band-fixtures';
import { IMAGE_ID, uploadedImage } from '../../content/testing/news-fixtures';
import { AdminDonateBand } from './admin-donate-band';
import { contentCopy, openOfflineFromCopy } from '../device-copy/testing/opened-copy';
import { donateBandPhoto as heldPhoto } from '../../content/testing/donate-band-fixtures';

const BAND_URL = '/api/admin/content/donate-band';
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
  fixture: ComponentFixture<AdminDonateBand>;
  http: HttpTestingController;
}> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [AdminDonateBand],
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
  const fixture = TestBed.createComponent(AdminDonateBand);
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
  const input = element<HTMLInputElement>(fixture, '#donate-band-photo');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function click(fixture: ComponentFixture<unknown>, name: string): Promise<void> {
  button(fixture, name).click();
  await settle(fixture);
}

describe('Given an administrator and a Přispět band without a photo', () => {
  let fixture: ComponentFixture<AdminDonateBand>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(BAND_URL).flush({ photo: null });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then it says the placeholder shows and offers only to upload a photo', () => {
    expect(text(fixture, 'h1')).toBe('Fotka v pruhu Přispět');
    expect(document.activeElement).toBe(element(fixture, 'h1'));
    expect(text(fixture, '.photo-state')).toBe(
      'Fotka zatím není nahraná, web ukazuje ilustrační fotku.',
    );
    expect(text(fixture, 'label[for="donate-band-photo"]')).toBe('Nahrát fotku');
    expect(fixture.nativeElement.querySelector('#donate-band-photo-alt')).toBeNull();
    expect(findButton(fixture, 'Odebrat fotku z webu')).toBeNull();
  });

  it('when they upload a photo and save it with its description, then the trimmed description goes with it and the previews show both cuts of the band', async () => {
    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));
    const upload = http.expectOne(MEDIA_URL);
    expect(upload.request.method).toBe('POST');
    upload.flush(uploadedImage({ width: 1600, height: 1067 }));
    await settle(fixture);

    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=960`,
    );
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('figure.preview figcaption')).map(
        (caption) => (caption as HTMLElement).textContent?.trim(),
      ),
    ).toEqual(['Na počítači', 'Na telefonu']);
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Fotka je nahraná. Na web se dostane, až ji uložíte.',
    );
    expect(fixture.nativeElement.querySelector('#donate-band-photo-caption')).toBeNull();

    await type(fixture, '#donate-band-photo-alt', '  Usměvavá dívka na zahradě  ');
    await submit(fixture);

    const save = http.expectOne(BAND_URL);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ photoId: IMAGE_ID, photoAlt: 'Usměvavá dívka na zahradě' });
    save.flush({ photo: donateBandPhoto({ id: IMAGE_ID }) });
    await settle(fixture);

    expect(text(fixture, '.ui-notice--status')).toBe('Uloženo. Fotka je na webu v pruhu Přispět.');
    expect(button(fixture, 'Odebrat fotku z webu')).toBeTruthy();
  });

  it('when they save a photo without a description, then it goes as empty', async () => {
    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));
    http.expectOne(MEDIA_URL).flush(uploadedImage());
    await settle(fixture);
    await type(fixture, '#donate-band-photo-alt', '   ');
    await submit(fixture);

    expect(http.expectOne(BAND_URL).request.body).toEqual({ photoId: IMAGE_ID, photoAlt: null });
  });

  it('when the chosen file is not a photo, then the page says so and nothing is uploaded', async () => {
    await chooseFile(fixture, new File(['text'], 'poznamky.txt', { type: 'text/plain' }));

    expect(text(fixture, '.field-error[role="alert"]')).toBe(
      'Vyberte prosím fotku ve formátu JPEG, PNG nebo WebP.',
    );
    http.expectNone(MEDIA_URL);
  });
});

describe('Given an administrator and a Přispět band with a saved photo', () => {
  let fixture: ComponentFixture<AdminDonateBand>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(BAND_URL).flush({ photo: donateBandPhoto() });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then it shows the photo with its description and point and offers to replace and remove it', () => {
    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${DONATE_BAND_PHOTO_ID}?w=960`,
    );
    expect(element<HTMLInputElement>(fixture, '#donate-band-photo-alt').value).toBe(
      'Usměvavá dívka na zahradě',
    );
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 62 % zleva, 28 % shora.');
    expect(text(fixture, 'label[for="donate-band-photo"]')).toBe('Vyměnit fotku');
  });

  it('when they only tap a spot on the photo and save, then only the photo gets the point and the band is not saved again', async () => {
    const frame = element<HTMLButtonElement>(fixture, 'button.frame');
    frame.querySelector('img')!.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
    frame.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 60, detail: 1 }));
    await settle(fixture);
    await submit(fixture);

    const placing = http.expectOne(`${MEDIA_URL}/${DONATE_BAND_PHOTO_ID}`);
    expect(placing.request.body).toEqual({ focalPoint: { x: 50, y: 20 } });
    placing.flush({
      id: DONATE_BAND_PHOTO_ID,
      url: `/api/content/media/${DONATE_BAND_PHOTO_ID}`,
      width: 1600,
      height: 1067,
      focalPoint: { x: 50, y: 20 },
    });
    await settle(fixture);
    http.expectNone(BAND_URL);

    expect(text(fixture, '.ui-notice--status')).toBe('Uloženo. Fotka je na webu v pruhu Přispět.');
  });

  it('when they confirm the removal, then the photo goes and the page says the placeholder shows again', async () => {
    await click(fixture, 'Odebrat fotku z webu');
    expect(document.activeElement).toBe(button(fixture, 'Zrušit'));
    await click(fixture, 'Odebrat a smazat');

    const removal = http.expectOne(BAND_URL);
    expect(removal.request.method).toBe('PUT');
    expect(removal.request.body).toEqual({ photoId: null, photoAlt: null });
    removal.flush({ photo: null });
    await settle(fixture);

    expect(text(fixture, '.ui-notice--status')).toBe(
      'Fotku jsme z webu odebrali a smazali. Pruh Přispět ukazuje zase ilustrační fotku.',
    );
    expect(findButton(fixture, 'Odebrat fotku z webu')).toBeNull();
    expect(document.activeElement).toBe(element(fixture, '#donate-band-photo'));
  });

  it('when the removal fails, then the removal card carries the reason and keeps the photo', async () => {
    await click(fixture, 'Odebrat fotku z webu');
    await click(fixture, 'Odebrat a smazat');
    const refusal = problem(500, 'internal', 'Chyba serveru', 'Zkuste to později.');
    http.expectOne(BAND_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '.remove-card .ui-notice--alert')).toBe(
      'Chyba serveru. Zkuste to později.',
    );
    expect(fixture.nativeElement.querySelector('.frame img')).not.toBeNull();
  });
});

describe('Given an administrator whose Přispět band does not load', () => {
  let fixture: ComponentFixture<AdminDonateBand>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
  });

  afterEach(() => http.verify());

  it('when the server fails, then the page offers to try again, and trying again loads it', async () => {
    http.expectOne(BAND_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(fixture, '[role="alert"]')).toContain('Fotku se nepodařilo načíst.');

    await click(fixture, 'Zkusit znovu');
    http.expectOne(BAND_URL).flush({ photo: null });
    await settle(fixture);

    expect(text(fixture, '.photo-state')).toBe(
      'Fotka zatím není nahraná, web ukazuje ilustrační fotku.',
    );
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(BAND_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});

describe('Given an administrator offline whose device keeps the administration copy', () => {
  it('when the Přispět band opens, then its photo comes from the copy', async () => {
    const photo = heldPhoto();
    const { page, http } = await openOfflineFromCopy(
      AdminDonateBand,
      contentCopy({ 'content/donate-band': [{ photo }] }),
    );

    expect(page.querySelector(`img[src*="${photo.id}"]`)).not.toBeNull();
    http.verify();
  });
});
