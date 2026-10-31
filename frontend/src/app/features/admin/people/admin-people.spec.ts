import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { IMAGE_ID, uploadedImage } from '../../content/testing/news-fixtures';
import {
  OTHER_PERSON_ID,
  person,
  PERSON_ID,
  PORTRAIT_ID,
} from '../../content/testing/people-fixtures';
import { AdminPeople } from './admin-people';

const PEOPLE_URL = '/api/admin/content/people';
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
  fixture: ComponentFixture<AdminPeople>;
  http: HttpTestingController;
}> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    imports: [AdminPeople],
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
  const fixture = TestBed.createComponent(AdminPeople);
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
  const control = element<HTMLInputElement | HTMLTextAreaElement>(fixture, selector);
  control.value = value;
  control.dispatchEvent(new Event('input'));
  control.dispatchEvent(new Event('blur'));
  await settle(fixture);
}

async function check(fixture: ComponentFixture<unknown>, name: string): Promise<void> {
  const box = element<HTMLInputElement>(fixture, `input[name="${name}"]`);
  box.click();
  await settle(fixture);
}

async function submit(fixture: ComponentFixture<unknown>, selector: string): Promise<void> {
  element<HTMLFormElement>(fixture, selector).dispatchEvent(new Event('submit'));
  await settle(fixture);
}

async function chooseFile(
  fixture: ComponentFixture<unknown>,
  selector: string,
  file: File,
): Promise<void> {
  const input = element<HTMLInputElement>(fixture, selector);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle(fixture);
}

async function click(fixture: ComponentFixture<unknown>, selector: string): Promise<void> {
  element<HTMLButtonElement>(fixture, selector).click();
  await settle(fixture);
}

async function press(fixture: ComponentFixture<unknown>, name: string): Promise<void> {
  button(fixture, name).click();
  await settle(fixture);
}

function badges(fixture: ComponentFixture<unknown>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll(
      '.person-row:first-child .person-badges li',
    ) as NodeListOf<HTMLElement>,
  ).map((badge) => badge.textContent?.trim() ?? '');
}

function rows(fixture: ComponentFixture<unknown>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('.person-name') as NodeListOf<HTMLElement>,
  ).map((name) => name.textContent?.trim() ?? '');
}

const ADAM = person({
  id: OTHER_PERSON_ID,
  name: 'Adam Vzor',
  role: null,
  position: 1,
  boardNote: null,
  featured: false,
  portrait: null,
});

describe('Given an administrator and no people of the foundation yet', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(PEOPLE_URL).flush({ members: [], note: null, footnote: null });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then it says the site keeps its own block and offers to add a person', () => {
    expect(text(fixture, 'h1')).toBe('Lidé fondu');
    expect(document.activeElement).toBe(element(fixture, 'h1'));
    expect(text(fixture, '.ui-card__empty')).toBe(
      'Zatím tu nikdo není, web ukazuje svůj vlastní blok „Kdo fond vede“.',
    );
    expect(button(fixture, 'Přidat osobu').getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('#person-name')).toBeNull();
  });

  it('when they add a person with a portrait and both e-mails, then the trimmed fields go to the administration and the list shows the person', async () => {
    await press(fixture, 'Přidat osobu');
    expect(document.activeElement).toBe(element(fixture, '#person-name'));
    expect(text(fixture, '#person-editor-title')).toBe('Nová osoba');

    await type(fixture, '#person-name', '  Eva Vzorová ');
    await type(fixture, '#person-role', 'Zakladatelka');
    await check(fixture, 'featured');
    await check(fixture, 'onBoard');
    await type(fixture, '#person-board-note', ' předsedkyně ');
    await type(fixture, '#person-personal-email', ' eva@example.org ');
    await type(fixture, '#person-fund-email', 'eva@nfnn.cz');
    await chooseFile(
      fixture,
      '#person-portrait',
      new File(['png'], 'eva.png', { type: 'image/png' }),
    );
    http.expectOne(MEDIA_URL).flush(uploadedImage({ width: 640, height: 640 }));
    await settle(fixture);
    expect(element<HTMLImageElement>(fixture, '.portrait-preview img').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );

    await submit(fixture, '#person-editor form');

    const add = http.expectOne(PEOPLE_URL);
    expect(add.request.method).toBe('POST');
    expect(add.request.body).toEqual({
      name: 'Eva Vzorová',
      role: 'Zakladatelka',
      onBoard: true,
      boardNote: 'předsedkyně',
      featured: true,
      portraitId: IMAGE_ID,
      personalEmail: 'eva@example.org',
      fundEmail: 'eva@nfnn.cz',
    });
    add.flush(person({ personalEmail: 'eva@example.org', fundEmail: 'eva@nfnn.cz' }));
    await settle(fixture);

    expect(rows(fixture)).toEqual(['Eva Vzorová']);
    expect(text(fixture, '.ui-notice--status')).toBe(
      'Přidali jsme mezi lidi fondu: Eva Vzorová. Web ukazuje změnu hned.',
    );
    expect(fixture.nativeElement.querySelector('#person-name')).toBeNull();
    expect(document.activeElement).toBe(element(fixture, `#person-edit-${PERSON_ID}`));
  });

  it('when an e-mail has no domain, then the field says so and nothing is sent', async () => {
    await press(fixture, 'Přidat osobu');
    await type(fixture, '#person-name', 'Eva Vzorová');
    await type(fixture, '#person-fund-email', 'eva@nfnn');
    await submit(fixture, '#person-editor form');

    expect(element(fixture, '#person-fund-email').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Zadejte e-mail ve tvaru jana@example.cz.');
    http.expectNone(PEOPLE_URL);
  });

  it('when they add a person without a name, then the name field says so and nothing is sent', async () => {
    await press(fixture, 'Přidat osobu');
    await submit(fixture, '#person-editor form');

    expect(element(fixture, '#person-name').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Vyplňte prosím jméno.');
    http.expectNone(PEOPLE_URL);
  });

  it('when they write the founders note, then the trimmed text is saved, and an emptied note goes as none', async () => {
    await type(fixture, '#founders-note', '  Děkujeme všem.  ');
    await submit(fixture, 'form:has(#founders-note)');

    const save = http.expectOne(`${PEOPLE_URL}/note`);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ text: 'Děkujeme všem.' });
    save.flush({ text: 'Děkujeme všem.' });
    await settle(fixture);
    expect(text(fixture, '.ui-notice--status')).toBe('Slovo zakladatelů je uložené a na webu.');

    await type(fixture, '#founders-note', '   ');
    await submit(fixture, 'form:has(#founders-note)');
    const empty = http.expectOne(`${PEOPLE_URL}/note`);
    expect(empty.request.body).toEqual({ text: null });
    empty.flush({ text: null });
    await settle(fixture);
    expect(text(fixture, '.ui-notice--status')).toBe('Slovo zakladatelů jsme z webu odebrali.');
  });

  it('when they write the line under the board, then the trimmed text is saved, and an emptied line goes as none', async () => {
    await type(fixture, '#people-footnote', '  Web zajišťuje Petr Vzor.  ');
    await submit(fixture, 'form:has(#people-footnote)');

    const save = http.expectOne(`${PEOPLE_URL}/footnote`);
    expect(save.request.method).toBe('PUT');
    expect(save.request.body).toEqual({ text: 'Web zajišťuje Petr Vzor.' });
    save.flush({ text: 'Web zajišťuje Petr Vzor.' });
    await settle(fixture);
    expect(text(fixture, '.ui-notice--status')).toBe(
      'Řádek pod správní radou je uložený a na webu.',
    );

    await type(fixture, '#people-footnote', '   ');
    await submit(fixture, 'form:has(#people-footnote)');
    const empty = http.expectOne(`${PEOPLE_URL}/footnote`);
    expect(empty.request.body).toEqual({ text: null });
    empty.flush({ text: null });
    await settle(fixture);
    expect(text(fixture, '.ui-notice--status')).toBe(
      'Řádek pod správní radou jsme z webu odebrali.',
    );
  });
});

describe('Given an administrator and two people of the foundation', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
    http.expectOne(PEOPLE_URL).flush({
      members: [person({ personalEmail: 'eva@example.org', fundEmail: 'eva@nfnn.cz' }), ADAM],
      note: 'Děkujeme.',
      footnote: 'Web zajišťuje Petr Vzor.',
    });
    await settle(fixture);
  });

  afterEach(() => http.verify());

  it('when the page opens, then the list names both in order with their badges and the note and the line under the board are filled in', () => {
    expect(rows(fixture)).toEqual(['Eva Vzorová', 'Adam Vzor']);
    expect(badges(fixture)).toEqual(['Karta s portrétem', 'Ve správní radě (předsedkyně)']);
    expect(element<HTMLButtonElement>(fixture, `#person-up-${PERSON_ID}`).disabled).toBe(true);
    expect(element<HTMLButtonElement>(fixture, `#person-down-${OTHER_PERSON_ID}`).disabled).toBe(
      true,
    );
    expect(element(fixture, `#person-down-${PERSON_ID}`).getAttribute('aria-label')).toBe(
      'Níž: Eva Vzorová',
    );
    expect(element<HTMLTextAreaElement>(fixture, '#founders-note').value).toBe('Děkujeme.');
    expect(element<HTMLTextAreaElement>(fixture, '#people-footnote').value).toBe(
      'Web zajišťuje Petr Vzor.',
    );
  });

  it('when the page opens, then a person without a portrait shows their initials in its place, hidden from the screen reader', () => {
    const thumbs = fixture.nativeElement.querySelectorAll(
      '.person-thumb',
    ) as NodeListOf<HTMLElement>;

    expect(thumbs[0].querySelector('img')?.getAttribute('src')).toBe(
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );
    expect(thumbs[1].textContent?.trim()).toBe('AV');
    expect(thumbs[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('when they move the first person down, then the new order is saved and focus stays on the moved person', async () => {
    await click(fixture, `#person-down-${PERSON_ID}`);

    const order = http.expectOne(`${PEOPLE_URL}/order`);
    expect(order.request.method).toBe('PUT');
    expect(order.request.body).toEqual({ memberIds: [OTHER_PERSON_ID, PERSON_ID] });
    order.flush({
      members: [{ ...ADAM, position: 0 }, person({ position: 1 })],
      note: 'Děkujeme.',
      footnote: 'Web zajišťuje Petr Vzor.',
    });
    await settle(fixture);

    expect(rows(fixture)).toEqual(['Adam Vzor', 'Eva Vzorová']);
    expect(text(fixture, '.ui-notice--status')).toBe('Pořadí je uložené, web ho ukazuje hned.');
    expect(document.activeElement).toBe(element(fixture, `#person-up-${PERSON_ID}`));
  });

  it('when they edit a person, then the form holds their fields with the e-mails and saving replaces them', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);

    expect(text(fixture, '#person-editor-title')).toBe('Upravit: Eva Vzorová');
    expect(element<HTMLInputElement>(fixture, '#person-personal-email').value).toBe(
      'eva@example.org',
    );
    expect(element<HTMLInputElement>(fixture, '#person-fund-email').value).toBe('eva@nfnn.cz');
    expect(element<HTMLImageElement>(fixture, '.portrait-preview img').getAttribute('src')).toBe(
      `/api/content/media/${PORTRAIT_ID}?w=480`,
    );

    await type(fixture, '#person-personal-email', '');
    await press(fixture, 'Bez portrétu');
    await submit(fixture, '#person-editor form');

    const update = http.expectOne(`${PEOPLE_URL}/${PERSON_ID}`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({
      name: 'Eva Vzorová',
      role: 'Zakladatelka a předsedkyně správní rady',
      onBoard: true,
      boardNote: 'předsedkyně',
      featured: true,
      portraitId: null,
      personalEmail: null,
      fundEmail: 'eva@nfnn.cz',
    });
    update.flush(person({ portrait: null, fundEmail: 'eva@nfnn.cz' }));
    await settle(fixture);

    expect(text(fixture, '.ui-notice--status')).toBe('Změny u Eva Vzorová jsou uložené a na webu.');
  });

  it('when they upload a web signature, then it is uploaded and set at once, and the page says where it shows', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    await chooseFile(
      fixture,
      '#person-signature',
      new File(['png'], 'podpis.png', { type: 'image/png' }),
    );

    http.expectOne(MEDIA_URL).flush(uploadedImage({ width: 600, height: 180 }));
    await settle(fixture);
    const set = http.expectOne(`${PEOPLE_URL}/${PERSON_ID}/web-signature`);
    expect(set.request.method).toBe('POST');
    expect(set.request.body).toEqual({ imageId: IMAGE_ID });
    set.flush(
      person({
        webSignature: {
          id: IMAGE_ID,
          url: `/api/content/media/${IMAGE_ID}`,
          width: 600,
          height: 180,
        },
      }),
    );
    await settle(fixture);

    expect(text(fixture, '.signature-part .ui-notice--status')).toBe(
      'Podpis je uložený a ukáže se pod slovem zakladatelů.',
    );
    expect(element<HTMLImageElement>(fixture, '.signature-preview').getAttribute('src')).toBe(
      `/api/content/media/${IMAGE_ID}?w=480`,
    );
    expect(button(fixture, 'Odebrat podpis')).toBeTruthy();
    expect(badges(fixture)).toContain('Podpis na webu');
  });

  it('when the signature file is not an image, then the page says so and nothing is uploaded', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    await chooseFile(
      fixture,
      '#person-signature',
      new File(['%PDF'], 'podpis.pdf', { type: 'application/pdf' }),
    );

    expect(text(fixture, '.signature-part .ui-notice--alert')).toBe(
      'Vyberte prosím obrázek ve formátu PNG, JPEG nebo WebP.',
    );
    http.expectNone(MEDIA_URL);
  });

  it('when they start removing and cancel, then nothing is sent and focus returns to the button', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    await press(fixture, 'Odebrat osobu z webu');

    expect(text(fixture, '[role="group"]')).toContain('Opravdu odebrat z webu osobu Eva Vzorová?');
    expect(document.activeElement).toBe(element(fixture, '#person-remove-cancel'));

    await press(fixture, 'Zrušit');

    expect(fixture.nativeElement.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(element(fixture, '#person-remove'));
  });

  it('when they confirm the removal, then the person goes from the list and the page says what was deleted', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    await press(fixture, 'Odebrat osobu z webu');
    await press(fixture, 'Odebrat a smazat');

    const removal = http.expectOne(`${PEOPLE_URL}/${PERSON_ID}`);
    expect(removal.request.method).toBe('DELETE');
    removal.flush(null);
    await settle(fixture);

    expect(rows(fixture)).toEqual(['Adam Vzor']);
    expect(text(fixture, '.ui-notice--status')).toBe(
      'Eva Vzorová už mezi lidmi fondu není; portrét a podpis jsme smazali.',
    );
    expect(document.activeElement).toBe(element(fixture, '#people-add'));
  });

  it('when the server refuses the save, then the editor carries its words and stays open', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    await submit(fixture, '#person-editor form');
    const refusal = problem(
      404,
      'content/person-not-found',
      'Osoba nenalezena',
      'Načtěte stránku znovu.',
    );
    http.expectOne(`${PEOPLE_URL}/${PERSON_ID}`).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(text(fixture, '#person-editor .ui-notice--alert')).toBe(
      'Osoba nenalezena. Načtěte stránku znovu.',
    );
    expect(fixture.nativeElement.querySelector('#person-name')).not.toBeNull();
  });
});

describe('Given an administrator whose people do not load', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp());
  });

  afterEach(() => http.verify());

  it('when the server fails, then the page offers to try again, and trying again loads them', async () => {
    http.expectOne(PEOPLE_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle(fixture);

    expect(text(fixture, '[role="alert"]')).toContain('Lidi fondu se nepodařilo načíst.');

    await press(fixture, 'Zkusit znovu');
    http.expectOne(PEOPLE_URL).flush({ members: [ADAM], note: null, footnote: null });
    await settle(fixture);

    expect(rows(fixture)).toEqual(['Adam Vzor']);
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const refusal = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(PEOPLE_URL).flush(refusal.body, refusal.options);
    await settle(fixture);

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
  });
});
