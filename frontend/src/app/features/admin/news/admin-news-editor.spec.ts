import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { heldRecordOf } from '../../../core/version/row-version';
import { storedNewsArticleOf } from '../../content/news-api';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import {
  draftArticle,
  IMAGE_ID,
  newsArticle,
  uploadedImage,
} from '../../content/testing/news-fixtures';
import { OTHER_PERSON_ID, person, PERSON_ID } from '../../content/testing/people-fixtures';
import { PersonResponse } from '../../content/people-api';
import {
  draftWorkOf,
  MemoryDraftShelf,
  memoryDraftShelfProviders,
} from '../../../core/drafts/testing/memory-draft-shelf';
import { AdminNewsEditor } from './admin-news-editor';
import {
  COPY_STORED_AT,
  contentCopy,
  openOfflineFromCopy,
  waitsForConnection,
  textOf,
} from '../device-copy/testing/opened-copy';
import { ShownAnswers } from '../../../core/connectivity/shown-answers';
import { newsArticle as heldArticle } from '../../content/testing/news-fixtures';
import { person as heldPerson } from '../../content/testing/people-fixtures';

const NEWS_URL = '/api/admin/content/news';
const MEDIA_URL = '/api/admin/content/media';
const PEOPLE_URL = '/api/admin/content/people';
const PAVEL = person({ id: PERSON_ID, name: 'Pavel Vzorový', role: 'Předseda správní rady' });
const EVA = person({ id: OTHER_PERSON_ID, name: 'Eva Vzorová', role: null, portrait: null });

interface Signers {
  members?: PersonResponse[] | 'fails';
  own?: PersonResponse | null;
  later?: boolean;
}

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
  signers: Signers = {},
  providers: Provider[] = [],
): Promise<{
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
      ...providers,
    ],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
  http
    .expectOne('/api/donors/auth/login')
    .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
  const fixture = TestBed.createComponent(AdminNewsEditor);
  fixture.detectChanges();
  if (signers.later) {
    await fixture.whenStable();
    return { fixture, http };
  }
  const members = signers.members ?? [PAVEL, EVA];
  const people = http.expectOne(PEOPLE_URL);
  if (members === 'fails') {
    const failure = problem(500, 'internal', 'Chyba', 'Chyba');
    people.flush(failure.body, failure.options);
  } else {
    people.flush({ members, note: null, footnote: null });
  }
  if (id === null) {
    http.expectOne(`${PEOPLE_URL}/me`).flush({ member: signers.own ?? null });
  }
  await fixture.whenStable();
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
      signerId: null,
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
      'Tuto adresu už má jiná aktualita nebo příběh. Zvolte prosím jinou.',
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

  it('when they save and publish a draft whose year another article already looks back on, then the alert says the draft is saved but not published, and nothing is published', async () => {
    await type(fixture, '#news-title', 'Ohlédnutí za rokem 2025');
    await type(fixture, '#news-perex', 'Co se nám podařilo.');
    await type(fixture, '#news-body', 'Text.');
    await type(fixture, '#news-publish-date', '2026-10-30');
    const select = element<HTMLSelectElement>(fixture, '#news-look-back-year');
    select.selectedIndex = Array.from(select.options).findIndex(
      (option) => option.textContent?.trim() === '2025',
    );
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);
    http.expectOne(NEWS_URL).flush(draftArticle());
    await settle(fixture);

    const taken = problem(
      409,
      'content/look-back-year-taken',
      'Rok už má ohlédnutí',
      'Za rokem 2025 se už ohlíží jiná aktualita.',
    );
    http
      .expectOne(`${NEWS_URL}/${draftArticle().id}/look-back-year`)
      .flush(taken.body, taken.options);
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${draftArticle().id}/publish`);
    expect(text(fixture, '[role="alert"]:not(:empty)')).toBe(
      'Aktualitu jsme uložili jako koncept, ale nezveřejnili, protože rok ohlédnutí se uložit nepodařilo. Rok už má ohlédnutí. Za rokem 2025 se už ohlíží jiná aktualita.',
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Koncept');
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

    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=960`,
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
      signerId: null,
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
    expect(fixture.nativeElement.querySelector('.frame img')).toBeNull();
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

  it('when someone else saved it meanwhile and they keep their version, then it is saved and still published', async () => {
    await type(fixture, '#news-body', 'Opravený text o koncertu.');
    button(fixture, 'Uložit a zveřejnit').click();
    await settle(fixture);
    http.expectOne(`${NEWS_URL}/${draftArticle().id}`).flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '7a0f3c9e5d1b2846',
        current: { id: draftArticle().id },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    button(fixture, 'Uložit svou verzi místo novější').click();
    await settle(fixture);
    const update = http.expectOne(`${NEWS_URL}/${draftArticle().id}`);
    expect(update.request.headers.get('If-Match')).toBe('"7a0f3c9e5d1b2846"');
    update.flush(draftArticle({ body: 'Opravený text o koncertu.', version: 'c3e8a1f05b9d7264' }));
    await settle(fixture);
    const publish = http.expectOne(`${NEWS_URL}/${draftArticle().id}/publish`);
    expect(publish.request.headers.get('If-Match')).toBe('"c3e8a1f05b9d7264"');
    publish.flush(
      draftArticle({ body: 'Opravený text o koncertu.', publishedOn: '2026-10-24', live: true }),
    );
    await settle(fixture);

    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
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
    expect(element<HTMLImageElement>(fixture, '.frame img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=960`,
    );
    expect(text(fixture, '.publish-state .ui-badge')).toBe('Na webu');
    expect(text(fixture, '#news-publish-date-hint')).toBe(
      'Aktualita je na webu, změny se ukážou hned. Web řadí aktuality podle data zveřejnění.',
    );
    expect(element<HTMLInputElement>(fixture, '#news-publish-date').value).toBe('2026-10-20');
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

  it('when they only tap a spot on the photo and save, then only the photo gets the point and the article is not saved again', async () => {
    await loaded();
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('figure.preview figcaption')).map(
        (caption) => (caption as HTMLElement).textContent?.trim(),
      ),
    ).toEqual([
      'Velká zpráva, široká',
      'Velká zpráva, středně široká',
      'Velká zpráva, na výšku',
      'Starší zpráva, fotka vedle textu',
      'Karta v Aktualitách',
      'Nahoře v článku',
    ]);

    await tapPhoto(168, 45);
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 42 % zleva, 18 % shora.');
    expect(leavingIsHeld()).toBe(true);

    await submit(fixture);
    const placing = http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`);
    expect(placing.request.method).toBe('PUT');
    expect(placing.request.body).toEqual({ focalPoint: { x: 42, y: 18 } });
    placing.flush(placed({ x: 42, y: 18 }));
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${newsArticle().id}`);
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
    expect(leavingIsHeld()).toBe(false);
  });

  it('when they change a text and the point and the save of the article fails, then the point counts as saved and the next save sends only the article', async () => {
    await loaded();
    await type(fixture, '#news-perex', 'Nový souhrn.');
    await tapPhoto(168, 45);
    await submit(fixture);

    http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`).flush(placed({ x: 42, y: 18 }));
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Aktualitu se nepodařilo uložit. Zkuste to prosím znovu.',
    );

    await submit(fixture);
    http.expectNone(`${MEDIA_URL}/${IMAGE_ID}`);
    const saving = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
    expect(saving.request.body.perex).toBe('Nový souhrn.');
    const cover = newsArticle().coverImage!;
    saving.flush(
      newsArticle({
        perex: 'Nový souhrn.',
        coverImage: { ...cover, focalPoint: { x: 42, y: 18 } },
      }),
    );
    await settle(fixture);

    expect(leavingIsHeld()).toBe(false);
  });

  it('when they clear a saved point, then the photo is sent without one', async () => {
    const cover = newsArticle().coverImage!;
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}`)
      .flush(newsArticle({ coverImage: { ...cover, focalPoint: { x: 30, y: 20 } } }));
    await settle(fixture);
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 30 % zleva, 20 % shora.');

    button(fixture, 'Zrušit bod').click();
    await settle(fixture);
    await submit(fixture);

    const placing = http.expectOne(`${MEDIA_URL}/${IMAGE_ID}`);
    expect(placing.request.body).toEqual({ focalPoint: null });
    placing.flush(placed(null));
    await settle(fixture);
    http.expectNone(`${NEWS_URL}/${newsArticle().id}`);

    expect(text(fixture, '.picker-status')).toBe('Bez bodu výřezu: web fotku ořízne jako dosud.');
  });

  it('when placing the point fails, then the article is not saved and the form says why', async () => {
    await loaded();
    await tapPhoto(200, 125);
    await submit(fixture);

    http
      .expectOne(`${MEDIA_URL}/${IMAGE_ID}`)
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${newsArticle().id}`);
    expect(text(fixture, '.ui-action-bar [role="alert"]')).toBe(
      'Aktualitu se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(text(fixture, '.picker-status')).toBe('Bod výřezu: 50 % zleva, 50 % shora.');
  });

  it('when they remove the photo and save, then the article is updated without a cover image', async () => {
    await loaded();
    button(fixture, 'Odebrat fotku').click();
    await settle(fixture);

    expect(fixture.nativeElement.querySelector('.frame img')).toBeNull();

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
      signerId: null,
    });
    request.flush(newsArticle({ coverImage: null }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
  });

  describe('when someone else saved the article while they were editing it', () => {
    const current = '7a0f3c9e5d1b2846';

    beforeEach(async () => {
      await loaded();
      const title = element<HTMLInputElement>(fixture, '#news-title');
      title.value = 'Zahrada pro všechny děti';
      title.dispatchEvent(new Event('input'));
      await settle(fixture);
      await submit(fixture);
      const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(request.request.headers.get('If-Match')).toBe(`"${newsArticle().version}"`);
      expect(heldRecordOf(request.request.context)).toEqual(storedNewsArticleOf(newsArticle()));
      request.flush(
        {
          type: 'https://nfnn.cz/problems/content/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: current,
          current: { id: newsArticle().id, title: 'Zahrada pro děti a rodiče' },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(fixture);
    });

    it('then the sheet says their edits stay in the form, which still holds them', () => {
      const sheet = fixture.nativeElement.querySelector('app-changed-meanwhile-dialog dialog');
      expect(sheet?.querySelector('h2')?.textContent?.trim()).toBe('Mezitím se to změnilo');
      expect(sheet?.textContent).toContain('zůstávají ve formuláři');
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
        'Zahrada pro všechny děti',
      );
    });

    it('and they keep their version, then it is saved over the other one with the version in the refusal', async () => {
      button(fixture, 'Uložit svou verzi místo novější').click();
      await settle(fixture);

      const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.headers.get('If-Match')).toBe(`"${current}"`);
      expect(heldRecordOf(request.request.context)).toBeNull();
      expect(request.request.body.title).toBe('Zahrada pro všechny děti');
      request.flush(
        newsArticle({ title: 'Zahrada pro všechny děti', version: 'c3e8a1f05b9d7264' }),
      );
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Změny jsme uložili a na webu už jsou.',
      );
    });

    it('and they discard theirs, then the article is read again and the form shows the other version', async () => {
      button(fixture, 'Zahodit své úpravy a načíst novější verzi').click();
      await settle(fixture);

      http
        .expectOne(`${NEWS_URL}/${newsArticle().id}`)
        .flush(newsArticle({ title: 'Zahrada pro děti a rodiče', version: current }));
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
        'Zahrada pro děti a rodiče',
      );
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Vaše úpravy jsme zahodili a načetli novější verzi aktuality.',
      );
      expect(document.activeElement?.tagName).toBe('H1');
    });

    it('and they close the sheet, then their edits stay in the form and nothing is sent', async () => {
      const sheet = element<HTMLDialogElement>(fixture, 'app-changed-meanwhile-dialog dialog');
      sheet.dispatchEvent(new Event('close'));
      await settle(fixture);

      http.expectNone(`${NEWS_URL}/${newsArticle().id}`);
      expect(fixture.nativeElement.querySelector('app-changed-meanwhile-dialog')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
        'Zahrada pro všechny děti',
      );
    });
  });

  it('when someone else saved the article before they took it off the site with unsaved edits, then the edits stay and nothing can overwrite', async () => {
    await loaded();
    await type(fixture, '#news-body', 'Rozepsaný text.');
    button(fixture, 'Stáhnout z webu').click();
    await settle(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}/unpublish`).flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '7a0f3c9e5d1b2846',
        current: { id: newsArticle().id, updatedAt: '2026-11-05T15:20:00Z' },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    const sheet = element<HTMLDialogElement>(fixture, 'app-changed-meanwhile-dialog dialog');
    expect(sheet.textContent).toContain('vaše úpravy zůstávají ve formuláři');
    expect(sheet.textContent).toContain('Novější verze je z 5. 11. 2026 16:20.');
    expect(sheet.textContent).not.toContain('Uložit svou verzi místo novější');
    button(fixture, 'Nechat úpravy ve formuláři').click();
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${newsArticle().id}`);
    expect(element<HTMLTextAreaElement>(fixture, '#news-body').value).toBe('Rozepsaný text.');
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
      'Aktualita je na webu s datem 1. 10. 2026.',
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
      'Aktualita je na webu s datem 1. 10. 2026.',
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

  it('when someone else saved the article before they deleted it with unsaved edits and they keep the edits, then the focus returns to the delete button', async () => {
    await loaded();
    await type(fixture, '#news-title', 'Jiný titulek');
    button(fixture, 'Smazat aktualitu').click();
    await settle(fixture);
    element<HTMLButtonElement>(fixture, '.confirm .ui-button--danger').click();
    await settle(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(
      {
        type: 'https://nfnn.cz/problems/content/changed-meanwhile',
        title: 'Mezitím se to změnilo',
        status: 409,
        version: '7a0f3c9e5d1b2846',
        current: { id: newsArticle().id },
      },
      { status: 409, statusText: 'Conflict' },
    );
    await settle(fixture);

    button(fixture, 'Nechat úpravy ve formuláři').click();
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Jiný titulek');
    expect(document.activeElement).toBe(button(fixture, 'Smazat aktualitu'));
  });

  it('when the article no longer exists, then the page returns to the list', async () => {
    const navigated = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(404, 'content/news-not-found', 'Aktualita nenalezena', '');
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigated).toHaveBeenCalledWith('/sprava/aktuality');
  });

  async function chooseLookBackYear(label: string): Promise<void> {
    const select = element<HTMLSelectElement>(fixture, '#news-look-back-year');
    const index = Array.from(select.options).findIndex(
      (option) => option.textContent?.trim() === label,
    );
    expect(index).toBeGreaterThanOrEqual(0);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
    await settle(fixture);
  }

  it('when they choose the year it looks back on and save, then the year goes to its own address with the version of the saved article', async () => {
    await loaded();
    expect(
      element<HTMLSelectElement>(
        fixture,
        '#news-look-back-year',
      ).selectedOptions[0].textContent?.trim(),
    ).toBe('Není ohlédnutím');

    await chooseLookBackYear('2025');
    await submit(fixture);
    const saving = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
    expect(saving.request.method).toBe('PUT');
    expect(saving.request.body.lookBackYear).toBeUndefined();
    saving.flush(newsArticle({ version: '5d0f2b8c31e4a967' }));
    await settle(fixture);

    const placing = http.expectOne(`${NEWS_URL}/${newsArticle().id}/look-back-year`);
    expect(placing.request.method).toBe('PUT');
    expect(placing.request.body).toEqual({ year: 2025 });
    expect(placing.request.headers.get('If-Match')).toBe('"5d0f2b8c31e4a967"');
    placing.flush(newsArticle({ version: '6e1a3c9d42f5b078', lookBackYear: 2025 }));
    await settle(fixture);

    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
    expect(
      element<HTMLSelectElement>(
        fixture,
        '#news-look-back-year',
      ).selectedOptions[0].textContent?.trim(),
    ).toBe('2025');
  });

  it('when they save other changes and the year stays, then nothing is sent to the address of the year', async () => {
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle({ lookBackYear: 2024 }));
    await settle(fixture);

    await type(fixture, '#news-perex', 'Nový souhrn.');
    await submit(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle({ lookBackYear: 2024 }));
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${newsArticle().id}/look-back-year`);
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
  });

  it('when they also move the date of the published article and another article already looks back on the chosen year, then the alert says the article stays on the web under its old date', async () => {
    await loaded();
    await chooseLookBackYear('2025');
    await type(fixture, '#news-publish-date', '2026-10-25');
    await submit(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await settle(fixture);

    const taken = problem(
      409,
      'content/look-back-year-taken',
      'Rok už má ohlédnutí',
      'Za rokem 2025 se už ohlíží jiná aktualita.',
    );
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}/look-back-year`)
      .flush(taken.body, taken.options);
    await settle(fixture);

    http.expectNone(`${NEWS_URL}/${newsArticle().id}/publish`);
    expect(text(fixture, '[role="alert"]:not(:empty)')).toBe(
      'Ostatní změny jsme uložili, rok ohlédnutí a nové datum zveřejnění ale ne, takže aktualita zůstává na webu s původním datem. Rok už má ohlédnutí. Za rokem 2025 se už ohlíží jiná aktualita.',
    );
  });

  it('when another article already looks back on the chosen year, then the rest is saved, the alert says why and the choice stays to try again', async () => {
    await loaded();
    await chooseLookBackYear('2025');
    await submit(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await settle(fixture);

    const taken = problem(
      409,
      'content/look-back-year-taken',
      'Rok už má ohlédnutí',
      'Za rokem 2025 se už ohlíží jiná aktualita.',
    );
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}/look-back-year`)
      .flush(taken.body, taken.options);
    await settle(fixture);

    expect(text(fixture, '[role="alert"]:not(:empty)')).toBe(
      'Ostatní změny jsme uložili, rok ohlédnutí ale ne. Rok už má ohlédnutí. Za rokem 2025 se už ohlíží jiná aktualita.',
    );
    expect(
      element<HTMLSelectElement>(
        fixture,
        '#news-look-back-year',
      ).selectedOptions[0].textContent?.trim(),
    ).toBe('2025');

    await submit(fixture);
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}/look-back-year`)
      .flush(newsArticle({ lookBackYear: 2025 }));
    await settle(fixture);
    expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
      'Změny jsme uložili a na webu už jsou.',
    );
  });
});

describe('Given an administrator linked to a person of the foundation writing a new news article', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(null, { own: PAVEL }));
  });

  afterEach(() => http.verify());

  async function write(): Promise<void> {
    await type(fixture, '#news-title', 'Poděkování dárcům');
    await type(fixture, '#news-perex', 'Krátce.');
    await type(fixture, '#news-body', 'Text.');
  }

  it('when the editor opens, then the person linked to them signs it and every person of the foundation can be chosen', async () => {
    const signer = element<HTMLSelectElement>(fixture, '#news-signer');

    expect(signer.value).toBe(PERSON_ID);
    expect(Array.from(signer.options).map((option) => option.textContent?.trim())).toEqual([
      'Bez podpisu',
      'Pavel Vzorový',
      'Eva Vzorová',
    ]);

    await write();
    await submit(fixture);
    const request = http.expectOne(NEWS_URL);
    expect(request.request.body.signerId).toBe(PERSON_ID);
    request.flush(draftArticle({ signer: PAVEL }));
  });

  it('when they choose no signature, then the article is saved unsigned', async () => {
    const signer = element<HTMLSelectElement>(fixture, '#news-signer');
    signer.value = '';
    signer.dispatchEvent(new Event('change'));
    await settle(fixture);

    await write();
    await submit(fixture);
    const request = http.expectOne(NEWS_URL);
    expect(request.request.body.signerId).toBeNull();
    request.flush(draftArticle());
  });

  it('when they switch to the preview, then the signer shows under the article', async () => {
    await write();
    button(fixture, 'Náhled').click();
    await settle(fixture);

    expect(text(fixture, '.signer-name')).toBe('Pavel Vzorový');
    expect(text(fixture, '.signer-role')).toBe('Předseda správní rady');
  });
});

describe('Given an administrator editing a signed news article while the people of the foundation cannot be read', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;
  const signed = newsArticle({ signer: EVA });

  beforeEach(async () => {
    ({ fixture, http } = await setUp(signed.id, { members: 'fails' }));
    http.expectOne(`${NEWS_URL}/${signed.id}`).flush(signed);
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when they save it, then it keeps its signer', async () => {
    expect(element<HTMLSelectElement>(fixture, '#news-signer').value).toBe(OTHER_PERSON_ID);

    await type(fixture, '#news-perex', 'Nový souhrn.');
    await submit(fixture);

    const request = http.expectOne(`${NEWS_URL}/${signed.id}`);
    expect(request.request.body.signerId).toBe(OTHER_PERSON_ID);
    request.flush(signed);
  });
});

describe('Given an administrator editing a published news article on a device that keeps drafts', () => {
  const key = `news/${newsArticle().id}`;
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  async function open(): Promise<void> {
    ({ fixture, http } = await setUp(newsArticle().id, {}, memoryDraftShelfProviders(shelf)));
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
    await drafted();
  }

  async function drafted(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await settle(fixture);
    }
  }

  function keptDraft(
    title: string,
    base = `version:${newsArticle().version}`,
    cover: { readonly id: string | null; readonly alt: string } = { id: IMAGE_ID, alt: '' },
    lookBackYear?: number | null,
  ) {
    shelf.seed('administration', {
      key,
      base,
      values: {
        title,
        slug: 'zahrada-pro-deti',
        tag: 'Projekt',
        perex: newsArticle().perex,
        body: newsArticle().body,
        coverImageAlt: cover.alt,
        coverImageId: cover.id,
        signerId: '',
        publishDate: '2026-10-20',
        ...(lookBackYear === undefined ? {} : { lookBackYear }),
      },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  afterEach(() => http.verify());

  it('when they type into the text, then the whole form is kept on the device under the version they read', async () => {
    await open();

    await type(fixture, '#news-body', 'Rozepsaný odstavec.');
    await drafted();

    expect(shelf.draftOf('administration', key)).toMatchObject({
      base: `version:${newsArticle().version}`,
      values: { title: 'Zahrada pro děti', body: 'Rozepsaný odstavec.' },
    });
  });

  it('when they save the edit, then the draft leaves the device', async () => {
    await open();
    await type(fixture, '#news-body', 'Rozepsaný odstavec.');
    await drafted();
    expect(shelf.draftOf('administration', key)).not.toBeNull();

    await submit(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}`)
      .flush(newsArticle({ body: 'Rozepsaný odstavec.', version: '1111111111111111' }));
    await drafted();

    expect(shelf.draftOf('administration', key)).toBeNull();
  });

  it('when they leave without saving, then the draft leaves the device', async () => {
    await open();
    await type(fixture, '#news-body', 'Rozepsaný odstavec.');
    await drafted();
    expect(shelf.draftOf('administration', key)).not.toBeNull();

    const answer = fixture.componentInstance.canLeave();
    await settle(fixture);
    button(fixture, 'Odejít bez uložení').click();
    await drafted();

    await expect(answer).resolves.toBe(true);
    expect(shelf.draftOf('administration', key)).toBeNull();
  });

  it('when they take the article off the site with edits still unsaved, then the draft stays and is kept under the new version', async () => {
    await open();
    await type(fixture, '#news-body', 'Rozepsaný odstavec.');
    await drafted();

    button(fixture, 'Stáhnout z webu').click();
    await settle(fixture);
    http
      .expectOne(`${NEWS_URL}/${newsArticle().id}/unpublish`)
      .flush(newsArticle({ publishedOn: null, live: false, version: '5555555555555555' }));
    await drafted();

    expect(shelf.draftOf('administration', key)).toMatchObject({
      base: 'version:5555555555555555',
      values: { body: 'Rozepsaný odstavec.' },
    });
  });

  it('when they choose the year it looks back on, then the year is kept on the device with the rest of the form', async () => {
    await open();

    const select = element<HTMLSelectElement>(fixture, '#news-look-back-year');
    select.selectedIndex = Array.from(select.options).findIndex(
      (option) => option.textContent?.trim() === '2025',
    );
    select.dispatchEvent(new Event('change'));
    await drafted();

    expect(shelf.draftOf('administration', key)).toMatchObject({
      values: { title: 'Zahrada pro děti', lookBackYear: 2025 },
    });
  });

  it('when they continue a draft that chose the year it looks back on, then the year comes back with it', async () => {
    keptDraft('Zahrada pro všechny děti', `version:${newsArticle().version}`, undefined, 2024);
    await open();

    button(fixture, 'Pokračovat v rozepsaném').click();
    await drafted();

    expect(
      element<HTMLSelectElement>(
        fixture,
        '#news-look-back-year',
      ).selectedOptions[0].textContent?.trim(),
    ).toBe('2024');
  });

  it('when they continue a draft kept before the look-back year existed, then the saved year stays', async () => {
    keptDraft('Zahrada pro všechny děti');
    ({ fixture, http } = await setUp(newsArticle().id, {}, memoryDraftShelfProviders(shelf)));
    http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle({ lookBackYear: 2023 }));
    await drafted();

    button(fixture, 'Pokračovat v rozepsaném').click();
    await drafted();

    expect(
      element<HTMLSelectElement>(
        fixture,
        '#news-look-back-year',
      ).selectedOptions[0].textContent?.trim(),
    ).toBe('2023');
  });

  it('when the device kept the description of a photo they have not saved, then the description does not come back onto the saved photo', async () => {
    keptDraft('Zahrada pro všechny děti', `version:${newsArticle().version}`, {
      id: 'another-photo',
      alt: 'Děti sázejí rajčata.',
    });
    await open();

    button(fixture, 'Pokračovat v rozepsaném').click();
    await drafted();

    expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
      'Zahrada pro všechny děti',
    );
    expect(element<HTMLInputElement>(fixture, '#news-image-alt').value).toBe('');
  });

  it('when they only choose another photo, then nothing is kept, because drafts keep no photos', async () => {
    await open();

    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));
    http
      .expectOne(MEDIA_URL)
      .flush(uploadedImage({ id: 'another-photo', url: '/api/content/media/another-photo' }));
    await drafted();

    expect(shelf.draftOf('administration', key)).toBeNull();
  });

  it('when they choose another photo, describe it and edit the title, then the draft keeps the title and not the new description', async () => {
    await open();

    await chooseFile(fixture, new File(['png'], 'zahrada.png', { type: 'image/png' }));
    http
      .expectOne(MEDIA_URL)
      .flush(uploadedImage({ id: 'another-photo', url: '/api/content/media/another-photo' }));
    await settle(fixture);
    await type(fixture, '#news-image-alt', 'Děti sázejí rajčata.');
    await type(fixture, '#news-title', 'Zahrada pro všechny děti');
    await drafted();

    expect(shelf.draftOf('administration', key)?.values).toMatchObject({
      title: 'Zahrada pro všechny děti',
      coverImageAlt: '',
      coverImageId: IMAGE_ID,
    });
  });

  it('when the device kept the description of the saved photo, then it comes back', async () => {
    keptDraft('Zahrada pro všechny děti', `version:${newsArticle().version}`, {
      id: IMAGE_ID,
      alt: 'Děti sázejí rajčata.',
    });
    await open();

    button(fixture, 'Pokračovat v rozepsaném').click();
    await drafted();

    expect(element<HTMLInputElement>(fixture, '#news-image-alt').value).toBe(
      'Děti sázejí rajčata.',
    );
  });

  describe('when the device kept a draft of the version they open', () => {
    beforeEach(async () => {
      keptDraft('Zahrada pro všechny děti');
      await open();
    });

    it('then the page offers it above the form, which still shows the saved text', () => {
      expect(text(fixture, 'app-draft-offer')).toContain('Máte tu rozepsané úpravy');
      expect(text(fixture, 'app-draft-offer')).toContain('z 6. 11. 2026 10:00');
      expect(text(fixture, 'app-draft-offer')).not.toContain('Uložená verze se od té doby změnila');
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Zahrada pro děti');
    });

    it('and they continue it, then the form takes the draft, counts as unsaved and saves it under the version read', async () => {
      button(fixture, 'Pokračovat v rozepsaném').click();
      await drafted();

      expect(fixture.nativeElement.querySelector('app-draft-offer')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
        'Zahrada pro všechny děti',
      );
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Pokračujete v rozepsaných úpravách. Zůstanou jen na tomto zařízení, dokud je neuložíte.',
      );
      expect(document.activeElement?.tagName).toBe('H1');
      expect(fixture.componentInstance.canLeave()).not.toBe(true);
      fixture.componentInstance['stay']();
      await settle(fixture);

      await submit(fixture);
      const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(request.request.headers.get('If-Match')).toBe(`"${newsArticle().version}"`);
      expect(request.request.body.title).toBe('Zahrada pro všechny děti');
      request.flush(
        newsArticle({ title: 'Zahrada pro všechny děti', version: '2222222222222222' }),
      );
      await drafted();
      expect(shelf.draftOf('administration', key)).toBeNull();
    });

    it('and they discard it, then it leaves the device and the form keeps the saved text', async () => {
      button(fixture, 'Zahodit').click();
      await drafted();

      expect(fixture.nativeElement.querySelector('app-draft-offer')).toBeNull();
      expect(shelf.draftOf('administration', key)).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Zahrada pro děti');
      expect(text(fixture, '[role="status"]:not(:empty)')).toBe(
        'Rozepsané úpravy jsme z tohoto zařízení zahodili.',
      );
    });
  });

  describe('when the device kept a draft of an older version', () => {
    const older = '0000000000000001';

    beforeEach(async () => {
      keptDraft('Zahrada pro všechny děti', `version:${older}`);
      await open();
    });

    it('then the offer says the saved version changed since', () => {
      expect(text(fixture, 'app-draft-offer')).toContain('Uložená verze se od té doby změnila');
    });

    it('and they continue it and save, then the save names the older version and the refusal says the draft was overtaken', async () => {
      button(fixture, 'Pokračovat v rozepsaném').click();
      await drafted();

      await submit(fixture);
      const request = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(request.request.headers.get('If-Match')).toBe(`"${older}"`);
      expect(heldRecordOf(request.request.context)).toBeNull();
      request.flush(
        {
          type: 'https://nfnn.cz/problems/content/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: newsArticle().version,
          current: { id: newsArticle().id, updatedAt: '2026-11-05T08:00:00Z' },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(fixture);

      const sheet = element(fixture, 'app-changed-meanwhile-dialog dialog');
      expect(sheet.textContent).toContain(
        'Od chvíle, kdy jste na tomto zařízení začali s úpravami',
      );
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe(
        'Zahrada pro všechny děti',
      );

      button(fixture, 'Uložit svou verzi místo novější').click();
      await settle(fixture);
      const overwrite = http.expectOne(`${NEWS_URL}/${newsArticle().id}`);
      expect(overwrite.request.headers.get('If-Match')).toBe(`"${newsArticle().version}"`);
      overwrite.flush(
        newsArticle({ title: 'Zahrada pro všechny děti', version: '3333333333333333' }),
      );
      await drafted();
      expect(shelf.draftOf('administration', key)).toBeNull();
    });

    it('and they continue it, are refused and discard their edits, then the draft leaves the device and the newer version shows', async () => {
      button(fixture, 'Pokračovat v rozepsaném').click();
      await drafted();
      await submit(fixture);
      http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(
        {
          type: 'https://nfnn.cz/problems/content/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: newsArticle().version,
          current: { id: newsArticle().id },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await settle(fixture);

      button(fixture, 'Zahodit své úpravy a načíst novější verzi').click();
      await settle(fixture);
      http.expectOne(`${NEWS_URL}/${newsArticle().id}`).flush(newsArticle());
      await drafted();

      expect(shelf.draftOf('administration', key)).toBeNull();
      expect(fixture.nativeElement.querySelector('app-draft-offer')).toBeNull();
      expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Zahrada pro děti');
    });
  });
});

describe('Given an administrator writing a new news article on a device that keeps drafts', () => {
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  async function drafted(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await settle(fixture);
    }
  }

  beforeEach(async () => {
    shelf = new MemoryDraftShelf();
    ({ fixture, http } = await setUp(null, {}, memoryDraftShelfProviders(shelf)));
    await drafted();
  });

  afterEach(() => http.verify());

  it('when they type a title, then it is kept as the draft of a new article, and once created that draft leaves the device', async () => {
    await type(fixture, '#news-title', 'Benefiční koncert');
    await drafted();
    expect(shelf.draftOf('administration', 'news/new')?.values).toMatchObject({
      title: 'Benefiční koncert',
      slug: 'beneficni-koncert',
    });

    await type(fixture, '#news-perex', 'Zveme vás na koncert.');
    await type(fixture, '#news-body', 'Text o koncertu.');
    await submit(fixture);
    http.expectOne(NEWS_URL).flush(draftArticle());
    await drafted();

    expect(shelf.draftOf('administration', 'news/new')).toBeNull();
    expect(shelf.draftOf('administration', `news/${draftArticle().id}`)).toBeNull();
  });
});

describe('Given an administrator who starts a new news article before the people of the foundation arrive', () => {
  it('when they type and the people arrive, then the draft keeps what they typed', async () => {
    const shelf = new MemoryDraftShelf();
    const { fixture, http } = await setUp(null, { later: true }, memoryDraftShelfProviders(shelf));
    await type(fixture, '#news-title', 'Benefiční koncert');

    http.expectOne(PEOPLE_URL).flush({ members: [PAVEL, EVA], note: null, footnote: null });
    http.expectOne(`${PEOPLE_URL}/me`).flush({ member: null });
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await settle(fixture);
    }

    expect(shelf.draftOf('administration', 'news/new')?.values).toMatchObject({
      title: 'Benefiční koncert',
    });
    http.verify();
  });
});

describe('Given an administrator opening a new news article with a draft whose publish date has passed', () => {
  let fixture: ComponentFixture<AdminNewsEditor>;
  let http: HttpTestingController;

  beforeEach(async () => {
    const shelf = new MemoryDraftShelf();
    shelf.seed('administration', {
      key: 'news/new',
      base: 'new',
      values: {
        title: 'Benefiční koncert',
        slug: '',
        tag: '',
        perex: '',
        body: '',
        coverImageAlt: '',
        coverImageId: null,
        signerId: '',
        publishDate: '2020-01-15',
      },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
    ({ fixture, http } = await setUp(null, {}, memoryDraftShelfProviders(shelf)));
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
      await settle(fixture);
    }
  });

  afterEach(() => http.verify());

  it('when they continue it, then the date moves to today and the status says so', async () => {
    button(fixture, 'Pokračovat v rozepsaném').click();
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#news-title').value).toBe('Benefiční koncert');
    const date = element<HTMLInputElement>(fixture, '#news-publish-date').value;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(date > '2020-01-15').toBe(true);
    expect(text(fixture, '[role="status"]:not(:empty)')).toContain(
      'Datum zveřejnění z rozepsaných úprav už minulo, proto jsme ho posunuli na dnešek.',
    );
  });
});

describe('Given an administrator offline whose device keeps the administration copy', () => {
  it('when an article opens, then the editor shows it from the copy with its signers and saving needs a connection', async () => {
    const article = heldArticle();
    const { page, http } = await openOfflineFromCopy(
      AdminNewsEditor,
      contentCopy({
        'content/news': [article],
        'content/people': [
          {
            members: [heldPerson()],
            note: null,
            footnote: null,
            noteVersion: 'n',
            footnoteVersion: 'f',
          },
        ],
      }),
      { path: 'sprava/aktuality/:id', url: `/sprava/aktuality/${article.id}` },
    );

    expect((page.querySelector('#news-title') as HTMLInputElement | null)?.value).toBe(
      article.title,
    );
    expect(TestBed.inject(ShownAnswers).oldest()).toBe(Date.parse(COPY_STORED_AT));
    expect([...page.querySelectorAll('option')].map((option) => textOf(option))).toContainEqual(
      expect.stringContaining('Eva Vzorová'),
    );
    waitsForConnection(page, 'Uložit a ukázat na webu');
    http.verify();
  });
});
