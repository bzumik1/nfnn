import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
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
import {
  draftWorkOf,
  MemoryDraftShelf,
  memoryDraftShelfProviders,
} from '../../../core/drafts/testing/memory-draft-shelf';
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

async function setUp(
  id: string | null,
  providers: Provider[] = [],
): Promise<{
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
      ...providers,
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

async function choose(
  fixture: ComponentFixture<unknown>,
  selector: string,
  label: string,
): Promise<void> {
  const control = element<HTMLSelectElement>(fixture, selector);
  control.selectedIndex = Array.from(control.options).findIndex(
    (option) => option.textContent?.trim() === label,
  );
  control.dispatchEvent(new Event('change'));
  control.dispatchEvent(new Event('blur'));
  await settle(fixture);
}

function selected(fixture: ComponentFixture<unknown>, selector: string): string {
  const control = element<HTMLSelectElement>(fixture, selector);
  return control.options[control.selectedIndex]?.textContent?.trim() ?? '';
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
      'Příběh bude na nfnn.cz/projekty/novy-projekt-zahrada-pro-deti.',
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

  it('when they open the form, then the project is in the category Děti until they choose another', () => {
    expect(text(fixture, 'label[for="projects-category"]')).toBe('Kategorie');
    expect(selected(fixture, '#projects-category')).toBe('Děti');
    expect(
      Array.from(element<HTMLSelectElement>(fixture, '#projects-category').options).map((option) =>
        option.textContent?.trim(),
      ),
    ).toEqual(['Děti', 'Dospělí', 'Zvířata', 'Ostatní']);
    expect(text(fixture, '#projects-category-hint')).toBe(
      'Koho se příběh týká. Jak web řadí příběhy podle kategorie a roku, vyberete v seznamu příběhů.',
    );
  });

  it('when they choose animals and save, then the project is sent for animals', async () => {
    await type(fixture, '#projects-title', 'Plná miska pro útulek');
    await choose(fixture, '#projects-category', 'Zvířata');
    await type(fixture, '#projects-perex', 'Krmivo pro pejsky.');
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    const request = http.expectOne(PROJECTS_URL);
    expect(request.request.body).toMatchObject({
      title: 'Plná miska pro útulek',
      category: 'ANIMALS',
    });
    request.flush(draftProject({ category: 'ANIMALS' }));
    await settle(fixture);

    expect(selected(fixture, '#projects-category')).toBe('Zvířata');
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

  it('when they save with the title and the perex empty, then both fields say so and nothing is sent', async () => {
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    expect(element(fixture, '#projects-title').getAttribute('aria-invalid')).toBe('true');
    expect(element(fixture, '#projects-perex').getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#projects-title-error')).toBe('Vyplňte prosím titulek.');
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
      category: 'CHILDREN',
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
      'Příběh jsme uložili jako koncept. Na web ho dostanete tlačítkem Uložit a zveřejnit.',
    );
    expect(replaced).toHaveBeenCalledWith(`/sprava/projekty/${draftProject().id}`);
    expect(text(fixture, 'h1')).toBe('Úprava příběhu');
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  it('when the address is already taken, then the address field says so, takes the focus and the form stays editable', async () => {
    await type(fixture, '#projects-title', 'Zahrada pro děti');
    await type(fixture, '#projects-perex', 'Perex.');
    await type(fixture, '#projects-body', 'Text.');
    await submit(fixture);

    const refusal = problem(
      409,
      'content/slug-taken',
      'Adresa je obsazená',
      'Jinou aktualitu už najdete na této adrese.',
    );
    http.expectOne(PROJECTS_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    const slug = element<HTMLInputElement>(fixture, '#projects-slug');
    expect(slug.getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#projects-slug-error')).toBe(
      'Tuto adresu už má jiný příběh nebo aktualita. Zvolte prosím jinou.',
    );
    expect(document.activeElement).toBe(slug);
    expect(fixture.nativeElement.querySelector('.form-error')).toBeNull();
    expect(button(fixture, 'Uložit koncept').disabled).toBe(false);

    await type(fixture, '#projects-slug', 'zahrada-2');

    expect(slug.getAttribute('aria-invalid')).toBeNull();
  });

  it('when they save a complete draft, then the result shows in the action bar and the tab is named after the edit', async () => {
    const titled = vi.spyOn(TestBed.inject(Title), 'setTitle');
    await type(fixture, '#projects-title', 'Benefiční koncert');
    await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
    await type(fixture, '#projects-body', 'Text o koncertu.');
    await submit(fixture);
    http.expectOne(PROJECTS_URL).flush(draftProject());
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Příběh jsme uložili jako koncept. Na web ho dostanete tlačítkem Uložit a zveřejnit.',
    );
    expect(titled).toHaveBeenCalledWith('Úprava příběhu | Správa | Nová naděje – nadační fond');
  });

  it('when they write it and save and publish at once, then it is created and published with the chosen date', async () => {
    await type(fixture, '#projects-title', 'Benefiční koncert');
    await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
    await type(fixture, '#projects-body', 'Text o koncertu.');
    await type(fixture, '#projects-publish-date', '2026-10-30');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const create = http.expectOne(PROJECTS_URL);
    expect(create.request.method).toBe('POST');
    create.flush(draftProject());
    await settle(fixture);
    expect(button(fixture, 'Zveřejňujeme…').disabled).toBe(true);
    const publish = http.expectOne(`${PROJECTS_URL}/${draftProject().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: '2026-10-30' });
    publish.flush(draftProject({ publishedOn: '2026-10-30', live: false }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Příběh se na webu ukáže 30. 10. 2026.',
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Zveřejní se 30. 10. 2026');
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they publish without a date, then the date field says so, takes the focus and nothing is sent', async () => {
    await type(fixture, '#projects-title', 'Benefiční koncert');
    await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
    await type(fixture, '#projects-body', 'Text o koncertu.');
    await type(fixture, '#projects-publish-date', '');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    expect(text(fixture, '#projects-publish-date-error')).toBe('Vyberte prosím datum zveřejnění.');
    expect(document.activeElement).toBe(element(fixture, '#projects-publish-date'));
    http.expectNone(PROJECTS_URL);
  });

  it('when they save it as a draft with a date chosen, then the date stays for publishing later', async () => {
    await type(fixture, '#projects-title', 'Benefiční koncert');
    await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
    await type(fixture, '#projects-body', 'Text o koncertu.');
    await type(fixture, '#projects-publish-date', '2026-10-30');
    await submit(fixture);
    http.expectOne(PROJECTS_URL).flush(draftProject());
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#projects-publish-date').value).toBe('2026-10-30');
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  describe('when they switch to the preview', () => {
    beforeEach(async () => {
      await type(fixture, '#projects-title', 'Benefiční koncert');
      await type(fixture, '#projects-tag', 'Pozvánka');
      await type(fixture, '#projects-perex', 'Zveme vás na koncert.');
      await type(fixture, '#projects-body', '**Hrají** děti.');
      await type(fixture, '#projects-publish-date', '2026-10-30');
      await chooseFile(fixture, new File(['png'], 'koncert.png', { type: 'image/png' }));
      http.expectOne(MEDIA_URL).flush(uploadedImage());
      await settle(fixture);
      button(fixture, 'Náhled').click();
      await settle(fixture);
    });

    it('then the unsaved texts and the uploaded photo show as the public card and page, and the fields are hidden', () => {
      expect(button(fixture, 'Náhled').getAttribute('aria-pressed')).toBe('true');
      expect(button(fixture, 'Upravit').getAttribute('aria-pressed')).toBe('false');
      expect(element(fixture, '.ui-card[aria-labelledby="projects-content-title"]').hidden).toBe(
        true,
      );
      expect(text(fixture, 'app-content-preview .card-title')).toBe('Benefiční koncert');
      expect(text(fixture, 'app-content-preview .card-tag')).toBe('Pozvánka');
      expect(text(fixture, 'app-content-preview .card-year')).toBe('2026');
      expect(
        element<HTMLImageElement>(fixture, 'app-content-preview .card img').getAttribute('src'),
      ).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
      expect(text(fixture, 'app-content-preview h3.ui-intro__title')).toBe('Benefiční koncert');
      expect(text(fixture, 'app-content-preview .prose strong')).toBe('Hrají');
      expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
      http.expectNone(PROJECTS_URL);
    });

    it('and back to editing, then the fields keep what they typed and the changes are still unsaved', async () => {
      button(fixture, 'Upravit').click();
      await settle(fixture);

      expect(element(fixture, '.ui-card[aria-labelledby="projects-content-title"]').hidden).toBe(
        false,
      );
      expect(fixture.nativeElement.querySelector('app-content-preview')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe('Benefiční koncert');
      expect(element<HTMLTextAreaElement>(fixture, '#projects-body').value).toBe('**Hrají** děti.');
      expect(text(fixture, '.publish-state')).toContain('Máte neuložené změny.');
      expect(fixture.componentInstance.canLeave()).toBeInstanceOf(Promise);
    });

    it('and save from the bar, then the project is sent from the preview as typed', async () => {
      await submit(fixture);

      const request = http.expectOne(PROJECTS_URL);
      expect(request.request.body).toMatchObject({
        title: 'Benefiční koncert',
        tag: 'Pozvánka',
        coverImageId: IMAGE_ID,
      });
      request.flush(draftProject());
      await settle(fixture);

      expect(button(fixture, 'Náhled').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('when they save from the preview with a field missing, then the editor comes back and the field takes the focus', async () => {
    await type(fixture, '#projects-title', 'Benefiční koncert');
    button(fixture, 'Náhled').click();
    await settle(fixture);

    await submit(fixture);
    await settle(fixture);

    expect(button(fixture, 'Upravit').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(element(fixture, '#projects-perex'));
    http.expectNone(PROJECTS_URL);
  });

  describe('when they have typed something and try to leave', () => {
    beforeEach(async () => {
      await type(fixture, '#projects-title', 'Rozepsaný projekt');
    });

    it('then the page asks first with staying as the focused choice', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);

      expect(answer).toBeInstanceOf(Promise);
      expect(text(fixture, 'dialog h2')).toBe('Máte neuložené změny');
      expect(document.activeElement?.textContent?.trim()).toBe('Zůstat a uložit');
    });

    it('and the page goes away while it asks, then the question is answered with staying, so no navigation waits for ever', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);

      fixture.destroy();

      await expect(answer).resolves.toBe(false);
    });

    it('and choose to leave without saving, then the navigation goes on', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      button(fixture, 'Odejít bez uložení').click();
      await settle(fixture);

      await expect(answer).resolves.toBe(true);
      expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    });

    it('and choose to leave without saving, then a page load that follows asks the browser for no second warning', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      button(fixture, 'Odejít bez uložení').click();
      await answer;

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('and choose to stay and save, then the navigation stops and the form is checked and saved', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      button(fixture, 'Zůstat a uložit').click();
      await settle(fixture);
      await settle(fixture);

      await expect(answer).resolves.toBe(false);
      expect(document.activeElement).toBe(element(fixture, '#projects-perex'));
      http.expectNone(PROJECTS_URL);
    });

    it('and close the question, then they stay on the page', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      element<HTMLButtonElement>(fixture, '.dialog-close').click();
      await settle(fixture);

      await expect(answer).resolves.toBe(false);
    });

    it('and close the browser tab, then the browser warns them', () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  it('when they have changed nothing, then leaving needs no question', () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);

    expect(fixture.componentInstance.canLeave()).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it('when they choose a photo, then it is uploaded at once, shown as a preview and sent with the project', async () => {
    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));

    expect(text(fixture, '.field-status')).toBe('Nahráváme fotku…');
    const upload = http.expectOne(MEDIA_URL);
    expect(upload.request.method).toBe('POST');
    expect((upload.request.body as FormData).get('file')).toBeInstanceOf(File);
    upload.flush(uploadedImage());
    await settle(fixture);

    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=960`,
    );
    expect(text(fixture, '.image-field [role="status"]')).toBe(
      'Fotka je nahraná. K příběhu se připojí, až ho uložíte.',
    );
    expect(text(fixture, 'label[for="projects-image"]')).toBe('Vyměnit fotku');
    expect(fixture.componentInstance.canLeave()).toBeInstanceOf(Promise);

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
    await settle(fixture);

    expect(text(fixture, '.image-field [role="status"]')).toBe('');
    expect(fixture.componentInstance.canLeave()).toBe(true);
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
    expect(fixture.nativeElement.querySelector('.frame img')).toBeNull();
  });
});

describe('Given an administrator editing a draft project', () => {
  let fixture: ComponentFixture<AdminProjectEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(draftProject().id));
    http.expectOne(`${PROJECTS_URL}/${draftProject().id}`).flush(draftProject());
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when it arrives, then the form says whom it helped as the project says', () => {
    expect(selected(fixture, '#projects-category')).toBe('Ostatní');
  });

  it('when it arrives, then saving keeps it a draft and no link to the site is offered', () => {
    expect(button(fixture, 'Uložit koncept').type).toBe('submit');
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
    expect(text(fixture, '#projects-publish-date-hint')).toBe(
      'Příběh zatím vidíte jen vy. Tlačítko Uložit a zveřejnit ho pustí na web s tímto datem, s pozdějším datem až ten den.',
    );
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they publish it unchanged, then only the publication is sent with the date shown', async () => {
    const shown = element<HTMLInputElement>(fixture, '#projects-publish-date').value;
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const publish = http.expectOne(`${PROJECTS_URL}/${draftProject().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: shown });
    publish.flush(draftProject({ publishedOn: shown, live: true }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
  });

  it('when they edit it and publish, then the edit is saved first and then published', async () => {
    await type(fixture, '#projects-body', 'Opravený text o koncertu.');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const update = http.expectOne(`${PROJECTS_URL}/${draftProject().id}`);
    expect(update.request.body).toMatchObject({ body: 'Opravený text o koncertu.' });
    update.flush(draftProject({ body: 'Opravený text o koncertu.' }));
    await settle(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${draftProject().id}/publish`)
      .flush(
        draftProject({ body: 'Opravený text o koncertu.', publishedOn: '2026-10-24', live: true }),
      );
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Příběh je na webu s datem 24. 10. 2026.',
    );
    expect(element<HTMLAnchorElement>(fixture, '.public-link').getAttribute('href')).toBe(
      '/projekty/beneficni-koncert',
    );
  });

  describe('when someone else saved the project while they were editing it and publishing it', () => {
    const current = '7a0f3c9e5d1b2846';

    beforeEach(async () => {
      await type(fixture, '#projects-body', 'Opravený text o koncertu.');
      button(fixture, 'Uložit a zveřejnit').click();
      await settle(fixture);
      const update = http.expectOne(`${PROJECTS_URL}/${draftProject().id}`);
      expect(update.request.headers.get('If-Match')).toBe(`"${draftProject().version}"`);
      update.flush(
        {
          type: 'https://nfnn.cz/problems/content/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: current,
          current: { id: draftProject().id, updatedAt: '2026-11-05T15:20:00Z' },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(fixture);
    });

    it('then the sheet keeps the edits in the form and names when the other version was saved', () => {
      const sheet = element<HTMLDialogElement>(fixture, 'app-changed-meanwhile-dialog dialog');
      expect(sheet.textContent).toContain('zůstávají ve formuláři');
      expect(sheet.textContent).toContain('Novější verze je z 5. 11. 2026 16:20.');
      expect(element<HTMLTextAreaElement>(fixture, '#projects-body').value).toBe(
        'Opravený text o koncertu.',
      );
    });

    it('and they keep their version, then it is saved with the version in the refusal and still published', async () => {
      button(fixture, 'Uložit svou verzi místo novější').click();
      await settle(fixture);
      const update = http.expectOne(`${PROJECTS_URL}/${draftProject().id}`);
      expect(update.request.headers.get('If-Match')).toBe(`"${current}"`);
      update.flush(
        draftProject({ body: 'Opravený text o koncertu.', version: 'c3e8a1f05b9d7264' }),
      );
      await settle(fixture);
      const publish = http.expectOne(`${PROJECTS_URL}/${draftProject().id}/publish`);
      expect(publish.request.headers.get('If-Match')).toBe('"c3e8a1f05b9d7264"');
      publish.flush(
        draftProject({ body: 'Opravený text o koncertu.', publishedOn: '2026-10-24', live: true }),
      );
      await settle(fixture);

      expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    });

    it('and they discard theirs, then the project is read again and the line says so', async () => {
      button(fixture, 'Zahodit své úpravy a načíst novější verzi').click();
      await settle(fixture);
      http
        .expectOne(`${PROJECTS_URL}/${draftProject().id}`)
        .flush(draftProject({ version: current }));
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Vaše úpravy jsme zahodili a načetli novější verzi příběhu.',
      );
      expect(document.activeElement?.tagName).toBe('H1');
    });
  });

  it('when saving the edit fails while publishing, then the project is not published and the form says why', async () => {
    await type(fixture, '#projects-body', 'Opravený text.');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${draftProject().id}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    http.expectNone(`${PROJECTS_URL}/${draftProject().id}/publish`);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Příběh se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
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
    expect(element<HTMLInputElement>(fixture, '#projects-year').value).toBe('2024');
    expect(element<HTMLInputElement>(fixture, '#projects-slug').value).toBe('zahrada-pro-deti');
    expect(element<HTMLInputElement>(fixture, '#projects-tag').value).toBe('Projekt');
    expect(element<HTMLTextAreaElement>(fixture, '#projects-body').value).toBe(
      'První odstavec textu.\n\nDruhý odstavec textu.',
    );
    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=960`,
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '#projects-publish-date-hint')).toBe(
      'Příběh je na webu, změny se ukážou hned. Příběhy na stejném místě řazení ukazuje web od naposledy zveřejněného.',
    );
    expect(element<HTMLInputElement>(fixture, '#projects-publish-date').value).toBe('2026-10-20');
    expect(text(fixture, '.updated-at')).toBe('Naposledy uloženo 20. 10. 2026 9:30.');
  });

  async function tapPhoto(clientX: number, clientY: number): Promise<void> {
    const frame = element<HTMLButtonElement>(fixture, 'button.frame');
    frame.querySelector('img')!.getBoundingClientRect = () => new DOMRect(0, 0, 400, 250);
    frame.dispatchEvent(new MouseEvent('click', { clientX, clientY, detail: 1 }));
    await settle(fixture);
  }

  function placed(focalPoint: { x: number; y: number } | null) {
    return {
      id: IMAGE_ID,
      url: `/api/content/media/${IMAGE_ID}`,
      width: 1600,
      height: 1000,
      focalPoint,
    };
  }

  function leavingIsHeld(): boolean {
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    return unload.defaultPrevented;
  }

  it('when they only tap a spot on the photo and save, then only the photo gets the point and the project is not saved again', async () => {
    await loaded();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('figure.preview figcaption')).map(
        (caption) => (caption as HTMLElement).textContent?.trim(),
      ),
    ).toEqual(['Karta v Pomáháme', 'Příběh roku v Aktualitách', 'Nahoře v článku']);

    await tapPhoto(168, 45);
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 42 % zleva, 18 % shora.');
    expect(leavingIsHeld()).toBe(true);

    await submit(fixture);
    const placing = http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`);
    expect(placing.request.method).toBe('PUT');
    expect(placing.request.body).toEqual({ focalPoint: { x: 42, y: 18 } });
    placing.flush(placed({ x: 42, y: 18 }));
    await settle(fixture);

    http.expectNone(`${PROJECTS_URL}/${project().id}`);
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
    expect(leavingIsHeld()).toBe(false);
  });

  it('when they change a text and the point and the save of the project fails, then the point counts as saved and the next save sends only the project', async () => {
    await loaded();
    await type(fixture, '#projects-perex', 'Nový souhrn.');
    await tapPhoto(168, 45);
    await submit(fixture);

    http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`).flush(placed({ x: 42, y: 18 }));
    await settle(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${project().id}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Příběh se nepodařilo uložit. Zkuste to prosím znovu.',
    );

    await submit(fixture);
    http.expectNone(`${MEDIA_URL}/${IMAGE_ID}`);
    const saving = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(saving.request.body.perex).toBe('Nový souhrn.');
    const cover = project().coverImage!;
    saving.flush(
      project({ perex: 'Nový souhrn.', coverImage: { ...cover, focalPoint: { x: 42, y: 18 } } }),
    );
    await settle(fixture);

    expect(leavingIsHeld()).toBe(false);
  });

  it('when they clear a saved point, then the photo is sent without one', async () => {
    const cover = project().coverImage!;
    http
      .expectOne(`${PROJECTS_URL}/${project().id}`)
      .flush(project({ coverImage: { ...cover, focalPoint: { x: 30, y: 20 } } }));
    await settle(fixture);
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 30 % zleva, 20 % shora.');

    button(fixture, 'Zrušit bod').click();
    await settle(fixture);
    await submit(fixture);

    const placing = http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`);
    expect(placing.request.body).toEqual({ focalPoint: null });
    placing.flush(placed(null));
    await settle(fixture);
    http.expectNone(`${PROJECTS_URL}/${project().id}`);

    expect(text(fixture, '.picker-status')).toBe('Bez bodu výřezu: web fotku ořízne jako dosud.');
  });

  it('when placing the point fails, then the project is not saved and the form says why', async () => {
    await loaded();
    await tapPhoto(200, 125);
    await submit(fixture);

    http
      .expectOne(`${MEDIA_URL}/${IMAGE_ID}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    http.expectNone(`${PROJECTS_URL}/${project().id}`);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Příběh se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 50 % zleva, 50 % shora.');
  });

  it('when they remove the photo and save, then the project is updated without a cover image', async () => {
    await loaded();
    button(fixture, 'Odebrat fotku').click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.frame img')).toBeNull();

    await submit(fixture);
    const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      title: 'Zahrada pro děti',
      year: 2024,
      category: 'CHILDREN',
      slug: 'zahrada-pro-deti',
      tag: 'Projekt',
      perex: project().perex,
      body: project().body,
      coverImageId: null,
      coverImageAlt: null,
    });
    request.flush(project({ coverImage: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
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
      'Příběh jsme z webu stáhli. Zůstává tu jako koncept.',
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they change the date, then the project is saved and published again with it', async () => {
    await loaded();
    await type(fixture, '#projects-publish-date', '2026-10-01');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(project());
    await settle(fixture);
    const request = http.expectOne(`${PROJECTS_URL}/${project().id}/publish`);
    expect(request.request.body).toEqual({ publishedOn: '2026-10-01' });
    request.flush(project({ publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Příběh je na webu s datem 1. 10. 2026.',
    );
  });

  it('when they change the address of the published one, then the hint warns that the old link stops working', async () => {
    await loaded();
    await type(fixture, '#projects-slug', 'zahrada');

    expect(text(fixture, '#projects-slug-hint')).toContain(
      'Pozor: dosavadní odkaz nfnn.cz/projekty/zahrada-pro-deti po uložení přestane fungovat.',
    );

    await type(fixture, '#projects-slug', 'zahrada-pro-deti');

    expect(text(fixture, '#projects-slug-hint')).not.toContain('Pozor');
  });

  it('when its photo has no description, then a quiet line says so', async () => {
    await loaded();

    expect(text(fixture, '.alt-missing')).toBe('Fotka zatím nemá popis pro nevidomé.');
  });

  it('when the project arrives, then saving says it goes to the site at once and a link opens the project there', async () => {
    await loaded();

    expect(button(fixture, 'Uložit a ukázat na webu').type).toBe('submit');
    expect(button(fixture, 'Stáhnout z webu').type).toBe('button');
    const link = element<HTMLAnchorElement>(fixture, '.public-link');
    expect(link.getAttribute('href')).toBe('/projekty/zahrada-pro-deti');
    expect(link.target).toBe('_blank');
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Otevřít na webu (v novém okně)');
  });

  it('when they edit the text and change the date, then the edit is saved first and the project is published with it', async () => {
    await loaded();
    await type(fixture, '#projects-title', 'Zahrada pro děti a rodiče');
    await type(fixture, '#projects-publish-date', '2026-10-01');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    const update = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toMatchObject({ title: 'Zahrada pro děti a rodiče' });
    update.flush(project({ title: 'Zahrada pro děti a rodiče' }));
    await settle(fixture);

    const publish = http.expectOne(`${PROJECTS_URL}/${project().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: '2026-10-01' });
    publish.flush(project({ title: 'Zahrada pro děti a rodiče', publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Příběh je na webu s datem 1. 10. 2026.',
    );
    expect(button(fixture, 'Uložit a ukázat na webu').disabled).toBe(false);
    expect(fixture.componentInstance.canLeave()).toBe(true);
  });

  it('when they publish an edit the form refuses, then nothing is sent and the field with the problem takes the focus', async () => {
    await loaded();
    await type(fixture, '#projects-perex', '');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    expect(document.activeElement).toBe(element(fixture, '#projects-perex'));
    expect(text(fixture, '#projects-perex-error')).toBe('Napište prosím krátký souhrn.');
    http.expectNone(`${PROJECTS_URL}/${project().id}/publish`);
  });

  it('when it is published with a later date, then the editor says when it goes live and offers no link yet', async () => {
    http
      .expectOne(`${PROJECTS_URL}/${project().id}`)
      .flush(project({ publishedOn: '2026-10-30', live: false }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Zveřejní se 30. 10. 2026');
    expect(text(fixture, '#projects-publish-date-hint')).toBe(
      'Na web se příběh dostane 30. 10. 2026, do té doby ho vidíte jen vy. Příběhy na stejném místě řazení ukazuje web od naposledy zveřejněného.',
    );
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
    expect(button(fixture, 'Uložit změny').type).toBe('submit');

    await type(fixture, '#projects-title', 'Zahrada pro děti a rodiče');
    await submit(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${project().id}`)
      .flush(
        project({ title: 'Zahrada pro děti a rodiče', publishedOn: '2026-10-30', live: false }),
      );
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Změny jsme uložili. Příběh se na webu ukáže 30. 10. 2026.',
    );
    button(fixture, 'Zrušit zveřejnění').click();
    await settle(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${project().id}/unpublish`)
      .flush(project({ publishedOn: null, live: false }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  describe('when they ask to delete it', () => {
    beforeEach(async () => {
      await loaded();
      button(fixture, 'Smazat příběh').click();
      await settle(fixture);
    });

    it('then the question names the project and the focus moves to the safe choice', () => {
      expect(text(fixture, '.confirm[role="group"]')).toContain(
        'Opravdu smazat příběh „Zahrada pro děti“?',
      );
      expect(document.activeElement).toBe(button(fixture, 'Zrušit'));
    });

    it('and cancel, then the focus returns to the delete button', async () => {
      button(fixture, 'Zrušit').click();
      await settle(fixture);

      expect(document.activeElement).toBe(button(fixture, 'Smazat příběh'));
    });

    it('and confirm, then the project is deleted and the list says so', async () => {
      const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
      await settle(fixture);

      const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(fixture);

      expect(navigated).toHaveBeenCalledWith('/sprava/projekty', {
        state: { deleted: 'Zahrada pro děti' },
      });
      expect(fixture.componentInstance.canLeave()).toBe(true);
    });

    it('and the deletion fails, then the delete card says so and the focus returns to its button', async () => {
      element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
      await settle(fixture);
      http
        .expectOne(`${PROJECTS_URL}/${project().id}`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle(fixture);

      expect(text(fixture, '.delete-card [role="alert"]:not(:empty)')).toBe(
        'Příběh se nepodařilo smazat. Zkuste to prosím znovu.',
      );
      expect(document.activeElement).toBe(button(fixture, 'Smazat příběh'));
    });
  });

  it('when someone else saved the project before they deleted it with unsaved edits and they keep the edits, then the focus returns to the delete button', async () => {
    await loaded();
    await type(fixture, '#projects-title', 'Jiný titulek');
    button(fixture, 'Smazat příběh').click();
    await settle(fixture);
    element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
    await settle(fixture);
    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '7a0f3c9e5d1b2846',
        current: { id: project().id },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    button(fixture, 'Nechat úpravy ve formuláři').click();
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe('Jiný titulek');
    expect(document.activeElement).toBe(button(fixture, 'Smazat příběh'));
  });

  it('when the project no longer exists, then the page returns to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(404, 'content/project-not-found', 'Příběh nenalezen', '');
    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/projekty');
  });
});

describe('Given an administrator editing a published project on a device that keeps drafts', () => {
  const key = `projects/${project().id}`;
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<AdminProjectEditor>;
  let http: HttpTestingController;

  async function open(): Promise<void> {
    ({ fixture, http } = await setUp(project().id, memoryDraftShelfProviders(shelf)));
    http.expectOne(`${PROJECTS_URL}/${project().id}`).flush(project());
    await drafted();
  }

  async function drafted(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await settle(fixture);
    }
  }

  function keptDraft(title: string, base = `version:${project().version}`) {
    shelf.seed('administration', {
      key,
      base,
      values: {
        title,
        year: 2024,
        category: 'CHILDREN',
        slug: 'zahrada-pro-deti',
        tag: 'Projekt',
        perex: project().perex,
        body: project().body,
        coverImageAlt: '',
        publishDate: '2026-10-20',
      },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  afterEach(() => http.verify());

  it('when they type into the text and save, then the draft is kept until the save and leaves the device with it', async () => {
    await open();

    await type(fixture, '#projects-body', 'Rozepsaný odstavec.');
    await drafted();
    expect(shelf.draftOf('administration', key)).toMatchObject({
      base: `version:${project().version}`,
      values: { title: 'Zahrada pro děti', body: 'Rozepsaný odstavec.', year: 2024 },
    });

    await submit(fixture);
    http
      .expectOne(`${PROJECTS_URL}/${project().id}`)
      .flush(project({ body: 'Rozepsaný odstavec.', version: '1111111111111111' }));
    await drafted();
    expect(shelf.draftOf('administration', key)).toBeNull();
  });

  describe('when the device kept a draft of the version they open', () => {
    beforeEach(async () => {
      keptDraft('Zahrada pro všechny děti');
      await open();
    });

    it('and they continue it, then the form takes it and saves it under the version read', async () => {
      expect(text(fixture, 'app-draft-offer')).toContain('Máte tu rozepsané úpravy');
      expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe('Zahrada pro děti');

      button(fixture, 'Pokračovat v rozepsaném').click();
      await drafted();
      expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe(
        'Zahrada pro všechny děti',
      );
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Pokračujete v rozepsaných úpravách. Zůstanou jen na tomto zařízení, dokud je neuložíte.',
      );

      await submit(fixture);
      const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
      expect(request.request.headers.get('If-Match')).toBe(`"${project().version}"`);
      expect(request.request.body.title).toBe('Zahrada pro všechny děti');
      request.flush(project({ title: 'Zahrada pro všechny děti', version: '2222222222222222' }));
      await drafted();
      expect(shelf.draftOf('administration', key)).toBeNull();
    });

    it('and they discard it, then it leaves the device and the form keeps the saved text', async () => {
      button(fixture, 'Zahodit').click();
      await drafted();

      expect(shelf.draftOf('administration', key)).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#projects-title').value).toBe('Zahrada pro děti');
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Rozepsané úpravy jsme z tohoto zařízení zahodili.',
      );
    });
  });

  it('when the device kept a draft of an older version and they continue it, then the save names that version and is refused as overtaken', async () => {
    const older = '0000000000000001';
    keptDraft('Zahrada pro všechny děti', `version:${older}`);
    await open();
    expect(text(fixture, 'app-draft-offer')).toContain('Uložená verze se od té doby změnila');

    button(fixture, 'Pokračovat v rozepsaném').click();
    await drafted();
    await submit(fixture);
    const request = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(request.request.headers.get('If-Match')).toBe(`"${older}"`);
    request.flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: project().version,
        current: { id: project().id },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    expect(element(fixture, 'app-changed-meanwhile-dialog dialog').textContent).toContain(
      'Od chvíle, kdy jste na tomto zařízení začali s úpravami',
    );
    button(fixture, 'Uložit svou verzi místo novější').click();
    await settle(fixture);
    const overwrite = http.expectOne(`${PROJECTS_URL}/${project().id}`);
    expect(overwrite.request.headers.get('If-Match')).toBe(`"${project().version}"`);
    overwrite.flush(project({ title: 'Zahrada pro všechny děti', version: '3333333333333333' }));
    await drafted();
    expect(shelf.draftOf('administration', key)).toBeNull();
  });
});
