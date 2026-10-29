import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
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
      'Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Uložit a zveřejnit.',
    );
    expect(replaced).toHaveBeenCalledWith(`/sprava/aktuality/${draftArticle().id}`);
    expect(text(fixture, 'h1')).toBe('Úprava aktuality');
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  it('when the address is already taken, then the address field says so, takes the focus and the form stays editable', async () => {
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

    const slug = element<HTMLInputElement>(fixture, '#news-slug');
    expect(slug.getAttribute('aria-invalid')).toBe('true');
    expect(text(fixture, '#news-slug-error')).toBe(
      'Tuto adresu už má jiná aktualita nebo projekt. Zvolte prosím jinou.',
    );
    expect(document.activeElement).toBe(slug);
    expect(fixture.nativeElement.querySelector('.form-error')).toBeNull();
    expect(button(fixture, 'Uložit koncept').disabled).toBe(false);

    await type(fixture, '#news-slug', 'zahrada-2');

    expect(slug.getAttribute('aria-invalid')).toBeNull();
  });

  it('when they save a complete draft, then the result shows in the action bar and the tab is named after the edit', async () => {
    const titled = vi.spyOn(TestBed.inject(Title), 'setTitle');
    await type(fixture, '#news-title', 'Benefiční koncert');
    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await submit(fixture);
    http.expectOne(NEWS_URL).flush(draftArticle());
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Aktualitu jsme uložili jako koncept. Na web ji dostanete tlačítkem Uložit a zveřejnit.',
    );
    expect(titled).toHaveBeenCalledWith('Úprava aktuality | Správa | Nová naděje – nadační fond');
  });

  it('when they write it and save and publish at once, then it is created and published with the chosen date', async () => {
    await type(fixture, '#news-title', 'Benefiční koncert');
    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await type(fixture, '#news-publish-date', '2026-10-30');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const create = http.expectOne(NEWS_URL);
    expect(create.request.method).toBe('POST');
    create.flush(draftArticle());
    await settle(fixture);
    expect(button(fixture, 'Zveřejňujeme…').disabled).toBe(true);
    const publish = http.expectOne(`${NEWS_URL}/${draftArticle().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: '2026-10-30' });
    publish.flush(draftArticle({ publishedOn: '2026-10-30', live: false }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Aktualita se na webu ukáže 30. 10. 2026.',
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Zveřejní se 30. 10. 2026');
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they publish without a date, then the date field says so, takes the focus and nothing is sent', async () => {
    await type(fixture, '#news-title', 'Benefiční koncert');
    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await type(fixture, '#news-publish-date', '');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    expect(text(fixture, '#news-publish-date-error')).toBe('Vyberte prosím datum zveřejnění.');
    expect(document.activeElement).toBe(element(fixture, '#news-publish-date'));
    http.expectNone(NEWS_URL);
  });

  it('when they save it as a draft with a date chosen, then the date stays for publishing later', async () => {
    await type(fixture, '#news-title', 'Benefiční koncert');
    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await type(fixture, '#news-publish-date', '2026-10-30');
    await submit(fixture);
    http.expectOne(NEWS_URL).flush(draftArticle());
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#news-publish-date').value).toBe('2026-10-30');
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  describe('when they switch to the preview', () => {
    beforeEach(async () => {
      await type(fixture, '#news-title', 'Benefiční koncert');
      await type(fixture, '#news-tag', 'Pozvánka');
      await type(fixture, '#news-perex', 'Zveme vás na koncert.');
      await type(fixture, '#news-body', '**Hrají** děti.');
      await type(fixture, '#news-publish-date', '2026-10-30');
      await chooseFile(fixture, new File(['png'], 'koncert.png', { type: 'image/png' }));
      http.expectOne(MEDIA_URL).flush(uploadedImage());
      await settle(fixture);
      button(fixture, 'Náhled').click();
      await settle(fixture);
    });

    it('then the unsaved texts and the uploaded photo show as the public card and page, and the fields are hidden', () => {
      expect(button(fixture, 'Náhled').getAttribute('aria-pressed')).toBe('true');
      expect(button(fixture, 'Upravit').getAttribute('aria-pressed')).toBe('false');
      expect(element(fixture, '.ui-card[aria-labelledby="news-content-title"]').hidden).toBe(true);
      expect(text(fixture, 'app-content-preview .news-title')).toBe('Benefiční koncert');
      expect(text(fixture, 'app-content-preview .news-tag')).toBe('Pozvánka');
      expect(text(fixture, 'app-content-preview .news-date')).toBe('30. 10. 2026');
      expect(
        element<HTMLImageElement>(fixture, 'app-content-preview .news-card img').getAttribute(
          'src',
        ),
      ).toBe(`/api/content/media/${IMAGE_ID}?w=480`);
      expect(text(fixture, 'app-content-preview h3.ui-intro__title')).toBe('Benefiční koncert');
      expect(text(fixture, 'app-content-preview .prose strong')).toBe('Hrají');
      expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
      http.expectNone(NEWS_URL);
    });

    it('and back to editing, then the fields keep what they typed and the changes are still unsaved', async () => {
      button(fixture, 'Upravit').click();
      await settle(fixture);

      expect(element(fixture, '.ui-card[aria-labelledby="news-content-title"]').hidden).toBe(false);
      expect(fixture.nativeElement.querySelector('app-content-preview')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Benefiční koncert');
      expect(element<HTMLTextAreaElement>(fixture, '#news-body').value).toBe('**Hrají** děti.');
      expect(text(fixture, '.publish-state')).toContain('Máte neuložené změny.');
      expect(fixture.componentInstance.canLeave()).toBeInstanceOf(Promise);
    });

    it('and save from the bar, then the article is sent from the preview as typed', async () => {
      await submit(fixture);

      const request = http.expectOne(NEWS_URL);
      expect(request.request.body).toMatchObject({
        title: 'Benefiční koncert',
        tag: 'Pozvánka',
        coverImageId: IMAGE_ID,
      });
      request.flush(draftArticle());
      await settle(fixture);

      expect(button(fixture, 'Náhled').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('when they save from the preview with a field missing, then the editor comes back and the field takes the focus', async () => {
    await type(fixture, '#news-title', 'Benefiční koncert');
    button(fixture, 'Náhled').click();
    await settle(fixture);

    await submit(fixture);
    await settle(fixture);

    expect(button(fixture, 'Upravit').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(element(fixture, '#news-perex'));
    http.expectNone(NEWS_URL);
  });

  describe('when they have typed something and try to leave', () => {
    beforeEach(async () => {
      await type(fixture, '#news-title', 'Rozepsaná aktualita');
    });

    it('then the page asks first with staying as the focused choice', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);

      expect(answer).toBeInstanceOf(Promise);
      expect(text(fixture, 'dialog h2')).toBe('Máte neuložené změny');
      expect(document.activeElement?.textContent?.trim()).toBe('Zůstat a uložit');
    });

    it('and choose to leave without saving, then the navigation goes on', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      button(fixture, 'Odejít bez uložení').click();
      await settle(fixture);

      await expect(answer).resolves.toBe(true);
      expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    });

    it('and choose to stay and save, then the navigation stops and the form is checked and saved', async () => {
      const answer = fixture.componentInstance.canLeave();
      await settle(fixture);
      button(fixture, 'Zůstat a uložit').click();
      await settle(fixture);
      await settle(fixture);

      await expect(answer).resolves.toBe(false);
      expect(document.activeElement).toBe(element(fixture, '#news-perex'));
      http.expectNone(NEWS_URL);
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
    expect(text(fixture, '.image-field [role="status"]')).toBe(
      'Fotka je nahraná. K aktualitě se připojí, až ji uložíte.',
    );
    expect(text(fixture, 'label[for="news-image"]')).toBe('Vyměnit fotku');
    expect(fixture.componentInstance.canLeave()).toBeInstanceOf(Promise);

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
    expect(fixture.nativeElement.querySelector('.image-preview')).toBeNull();
  });
});

describe('Given an administrator editing a draft', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(draftArticle().id));
    http.expectOne(`${NEWS_URL}/${draftArticle().id}`).flush(draftArticle());
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when it arrives, then saving keeps it a draft and no link to the site is offered', () => {
    expect(button(fixture, 'Uložit koncept').type).toBe('submit');
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
    expect(text(fixture, '#news-publish-date-hint')).toBe(
      'Aktualitu zatím vidíte jen vy. Tlačítko Uložit a zveřejnit ji pustí na web s tímto datem, s pozdějším datem až ten den.',
    );
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they publish it unchanged, then only the publication is sent with the date shown', async () => {
    const shown = element<HTMLInputElement>(fixture, '#news-publish-date').value;
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const publish = http.expectOne(`${NEWS_URL}/${draftArticle().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: shown });
    publish.flush(draftArticle({ publishedOn: shown, live: true }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
  });

  it('when they edit it and publish, then the edit is saved first and then published', async () => {
    await type(fixture, '#news-body', 'Opravený text o koncertu.');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);

    const update = http.expectOne(`${NEWS_URL}/${draftArticle().id}`);
    expect(update.request.body).toMatchObject({ body: 'Opravený text o koncertu.' });
    update.flush(draftArticle({ body: 'Opravený text o koncertu.' }));
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${draftArticle().id}/publish`)
      .flush(
        draftArticle({ body: 'Opravený text o koncertu.', publishedOn: '2026-10-24', live: true }),
      );
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Aktualita je na webu s datem 24. 10. 2026.',
    );
    expect(element<HTMLAnchorElement>(fixture, '.public-link').getAttribute('href')).toBe(
      '/aktuality/beneficni-koncert',
    );
  });

  it('when saving the edit fails while publishing, then the article is not published and the form says why', async () => {
    await type(fixture, '#news-body', 'Opravený text.');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${draftArticle().id}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${draftArticle().id}/publish`);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Aktualitu se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
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
    expect(text(fixture, '#news-publish-date-hint')).toBe(
      'Aktualita je na webu, změny se ukážou hned. Web řadí aktuality podle data zveřejnění.',
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

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
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
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
    expect(button(fixture, 'Uložit a zveřejnit').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
  });

  it('when they change the date, then the article is saved and published again with it', async () => {
    await loaded();
    await type(fixture, '#news-publish-date', '2026-10-01');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await settle(fixture);
    const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}/publish`);
    expect(request.request.body).toEqual({ publishedOn: '2026-10-01' });
    request.flush(newsArticle({ publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Aktualita je na webu s datem 01. 10. 2026.',
    );
  });

  it('when they change the address of the published one, then the hint warns that the old link stops working', async () => {
    await loaded();
    await type(fixture, '#news-slug', 'zahrada');

    expect(text(fixture, '#news-slug-hint')).toContain(
      'Pozor: dosavadní odkaz nfnn.cz/aktuality/zahrada-pro-deti po uložení přestane fungovat.',
    );

    await type(fixture, '#news-slug', 'zahrada-pro-deti');

    expect(text(fixture, '#news-slug-hint')).not.toContain('Pozor');
  });

  it('when its photo has no description, then a quiet line says so', async () => {
    await loaded();

    expect(text(fixture, '.alt-missing')).toBe('Fotka zatím nemá popis pro nevidomé.');
  });

  it('when the article arrives, then saving says it goes to the site at once and a link opens the article there', async () => {
    await loaded();

    expect(button(fixture, 'Uložit a ukázat na webu').type).toBe('submit');
    expect(button(fixture, 'Stáhnout z webu').type).toBe('button');
    const link = element<HTMLAnchorElement>(fixture, '.public-link');
    expect(link.getAttribute('href')).toBe('/aktuality/zahrada-pro-deti');
    expect(link.target).toBe('_blank');
    expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe('Otevřít na webu (v novém okně)');
  });

  it('when they edit the text and change the date, then the edit is saved first and the article is published with it', async () => {
    await loaded();
    await type(fixture, '#news-title', 'Zahrada pro děti a rodiče');
    await type(fixture, '#news-publish-date', '2026-10-01');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    const update = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toMatchObject({ title: 'Zahrada pro děti a rodiče' });
    update.flush(newsArticle({ title: 'Zahrada pro děti a rodiče' }));
    await settle(fixture);

    const publish = http.expectOne(`${NEWS_URL}/${newsArticle().id}/publish`);
    expect(publish.request.body).toEqual({ publishedOn: '2026-10-01' });
    publish.flush(newsArticle({ title: 'Zahrada pro děti a rodiče', publishedOn: '2026-10-01' }));
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Aktualita je na webu s datem 01. 10. 2026.',
    );
    expect(button(fixture, 'Uložit a ukázat na webu').disabled).toBe(false);
    expect(fixture.componentInstance.canLeave()).toBe(true);
  });

  it('when they publish an edit the form refuses, then nothing is sent and the field with the problem takes the focus', async () => {
    await loaded();
    await type(fixture, '#news-perex', '');
    button(fixture, 'Uložit a ukázat na webu').click();
    await settle(fixture);

    expect(document.activeElement).toBe(element(fixture, '#news-perex'));
    expect(text(fixture, '#news-perex-error')).toBe('Napište prosím krátký souhrn.');
    http.expectNone(`${NEWS_URL}/${newsArticle().id}/publish`);
  });

  it('when it is published with a later date, then the editor says when it goes live and offers no link yet', async () => {
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}`)
      .flush(newsArticle({ publishedOn: '2026-10-30', live: false }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Zveřejní se 30. 10. 2026');
    expect(text(fixture, '#news-publish-date-hint')).toBe(
      'Na web se aktualita dostane 30. 10. 2026, do té doby ji vidíte jen vy. Web řadí aktuality podle data zveřejnění.',
    );
    expect(fixture.nativeElement.querySelector('.public-link')).toBeNull();
    expect(button(fixture, 'Uložit změny').type).toBe('submit');

    await type(fixture, '#news-title', 'Zahrada pro děti a rodiče');
    await submit(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}`)
      .flush(
        newsArticle({ title: 'Zahrada pro děti a rodiče', publishedOn: '2026-10-30', live: false }),
      );
    await settle(fixture);

    expect(text(fixture, '.ui-action-bar [role="status"]')).toBe(
      'Změny jsme uložili. Aktualita se na webu ukáže 30. 10. 2026.',
    );
    button(fixture, 'Zrušit zveřejnění').click();
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}/unpublish`)
      .flush(newsArticle({ publishedOn: null, live: false }));
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
  });

  describe('when they ask to delete it', () => {
    beforeEach(async () => {
      await loaded();
      button(fixture, 'Smazat aktualitu').click();
      await settle(fixture);
    });

    it('then the question names the article and the focus moves to the safe choice', () => {
      expect(text(fixture, '.confirm[role="group"]')).toContain(
        'Opravdu smazat aktualitu „Zahrada pro děti“?',
      );
      expect(document.activeElement).toBe(button(fixture, 'Zrušit'));
    });

    it('and cancel, then the focus returns to the delete button', async () => {
      button(fixture, 'Zrušit').click();
      await settle(fixture);

      expect(document.activeElement).toBe(button(fixture, 'Smazat aktualitu'));
    });

    it('and confirm, then the article is deleted and the list says so', async () => {
      const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
      await settle(fixture);

      const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle(fixture);

      expect(navigated).toHaveBeenCalledWith('/sprava/aktuality', {
        state: { deleted: 'Zahrada pro děti' },
      });
      expect(fixture.componentInstance.canLeave()).toBe(true);
    });

    it('and the deletion fails, then the delete card says so and the focus returns to its button', async () => {
      element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
      await settle(fixture);
      http
        .expectOne(`${NEWS_URL}/${newsArticle().id}`)
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle(fixture);

      expect(text(fixture, '.delete-card [role="alert"]:not(:empty)')).toBe(
        'Aktualitu se nepodařilo smazat. Zkuste to prosím znovu.',
      );
      expect(document.activeElement).toBe(button(fixture, 'Smazat aktualitu'));
    });
  });

  it('when the article no longer exists, then the page returns to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(404, 'content/news-not-found', 'Aktualita nenalezena', '');
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/aktuality');
  });
});
