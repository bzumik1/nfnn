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
import { ReceiptSignatoryResponse } from '../admin-api';
import {
  noReceiptSignatory,
  noReceiptSignature,
  receiptSignatory,
  receiptSignature,
} from '../testing/admin-fixtures';
import { AdminPeople } from './admin-people';

const PEOPLE_URL = '/api/admin/content/people';
const MEDIA_URL = '/api/admin/content/media';
const SIGNATORY_URL = '/api/admin/donations/receipt-signatory';
const RECEIPT_SIGNATURES = '/api/admin/donations/receipt-signatures/';

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
  signatory: ReceiptSignatoryResponse | 'pending' = noReceiptSignatory(),
): Promise<{
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
  if (signatory !== 'pending') {
    http.expectOne(SIGNATORY_URL).flush(signatory);
  }
  return { fixture, http };
}

function verifyLeavingReceiptSignatures(http: HttpTestingController): void {
  http
    .match((request) => request.url.startsWith(RECEIPT_SIGNATURES))
    .filter((pending) => !pending.cancelled)
    .forEach((pending) => pending.flush(noReceiptSignature()));
  http.verify();
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

  afterEach(() => verifyLeavingReceiptSignatures(http));

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
      members: [
        person({
          personalEmail: 'eva@example.org',
          fundEmail: 'eva@nfnn.cz',
          linkedToAccount: true,
        }),
        ADAM,
      ],
      note: 'Děkujeme.',
      footnote: 'Web zajišťuje Petr Vzor.',
    });
    await settle(fixture);
  });

  afterEach(() => verifyLeavingReceiptSignatures(http));

  it('when the page opens, then the list names both in order with their badges and the note and the line under the board are filled in', () => {
    expect(rows(fixture)).toEqual(['Eva Vzorová', 'Adam Vzor']);
    expect(badges(fixture)).toEqual([
      'Karta s portrétem',
      'Ve správní radě (předsedkyně)',
      'Propojeno s účtem na webu',
    ]);
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

  afterEach(() => verifyLeavingReceiptSignatures(http));

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

describe('Given an administrator and two people of the foundation, one of whom signs the receipts', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp(receiptSignatory({ personId: PERSON_ID })));
    http.expectOne(PEOPLE_URL).flush({ members: [person(), ADAM], note: null });
    await settle(fixture);
  });

  afterEach(() => verifyLeavingReceiptSignatures(http));

  it('when the page opens, then the person who signs carries a badge saying so', () => {
    expect(badges(fixture)).toContain('Podepisuje potvrzení');
  });

  it('when they edit the signatory, then the part for receipts says so with the receipt role, shows their receipt signature and refuses removing them', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);

    expect(text(fixture, '.receipt-part h3')).toBe('Na potvrzení o daru');
    expect(text(fixture, '.receipt-part .field-hint')).toBe(
      'Tato osoba podepisuje potvrzení o daru. Potvrzení vždy podepisuje jen jedna osoba; jinou vyberete u ní.',
    );
    expect(element<HTMLInputElement>(fixture, '#person-receipt-role').value).toBe(
      'předsedkyně správní rady',
    );
    expect(fixture.nativeElement.querySelector('#person-signs-receipts')).toBeNull();
    http
      .expectOne({ method: 'GET', url: `${RECEIPT_SIGNATURES}${PERSON_ID}` })
      .flush(noReceiptSignature());
    await settle(fixture);
    expect(text(fixture, '.receipt-part h4')).toBe('Podpis na potvrzení');
    expect(findButton(fixture, 'Odebrat osobu z webu')).toBeNull();
    expect(text(fixture, '.remove-part .ui-callout')).toBe(
      'Osoba podepisuje potvrzení o daru, a tak ji nejde odebrat. Nejdřív vyberte jinou osobu, která je bude podepisovat.',
    );
  });

  it('when they let another person sign with a receipt role, then the choice is saved and the badge moves', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);
    expect(text(fixture, '#person-signs-receipts-hint')).toBe(
      'Potvrzení vždy podepisuje jen jedna osoba; teď je to Eva Vzorová. Po uložení je bude podepisovat tato osoba.',
    );
    expect(fixture.nativeElement.querySelector('#person-receipt-role')).toBeNull();

    await check(fixture, 'signsReceipts');
    await type(fixture, '#person-receipt-role', '  místopředseda správní rady ');
    await submit(fixture, '.receipt-form');

    const choice = http.expectOne(SIGNATORY_URL);
    expect(choice.request.method).toBe('PUT');
    expect(choice.request.body).toEqual({
      personId: OTHER_PERSON_ID,
      receiptRole: 'místopředseda správní rady',
    });
    choice.flush(
      receiptSignatory({
        personId: OTHER_PERSON_ID,
        name: 'Adam Vzor',
        receiptRole: 'místopředseda správní rady',
      }).signatory,
    );
    await settle(fixture);

    expect(text(fixture, '.receipt-part .ui-notice--status')).toBe(
      'Potvrzení vystavená od teď podepisuje Adam Vzor s funkcí místopředseda správní rady.',
    );
    expect(text(fixture, `.person-row:nth-child(2) .person-badges`)).toContain(
      'Podepisuje potvrzení',
    );
  });

  it('when they look at removing a person, then it says what leaves the site and that issued receipts keep their copies', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);

    expect(text(fixture, '.remove-part .ui-card__intro')).toBe(
      'Osoba hned zmizí z webu a její portrét a podpis na webu se smažou z databáze; ze záloh zmizí do 30 dnů. Její podpis na potvrzení už žádné další potvrzení neponese; podpis a portrét na už vystavených potvrzeních o daru zůstávají s nimi.',
    );
  });

  it('when the choice of another person fails, then the receipt part says so and the badge stays', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);
    await check(fixture, 'signsReceipts');
    await type(fixture, '#person-receipt-role', 'místopředseda správní rady');
    await submit(fixture, '.receipt-form');

    http.expectOne(SIGNATORY_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);

    expect(text(fixture, '.receipt-part [role="alert"]:not(:empty)')).toBe(
      'Podepisujícího se nepodařilo uložit. Zkuste to prosím znovu.',
    );
    expect(badges(fixture)).toContain('Podepisuje potvrzení');
  });

  it('when another person is chosen, then the previous signatory can be removed again', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);
    await check(fixture, 'signsReceipts');
    await type(fixture, '#person-receipt-role', 'místopředseda správní rady');
    await submit(fixture, '.receipt-form');
    http.expectOne(SIGNATORY_URL).flush(
      receiptSignatory({
        personId: OTHER_PERSON_ID,
        name: 'Adam Vzor',
        receiptRole: 'místopředseda správní rady',
      }).signatory,
    );
    await settle(fixture);

    await click(fixture, `#person-edit-${PERSON_ID}`);

    expect(findButton(fixture, 'Odebrat osobu z webu')?.disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('.remove-part .ui-callout')).toBeNull();
  });

  it('when a receipt signature uploads, then no other person can be opened until it is done', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    http
      .expectOne({ method: 'GET', url: `${RECEIPT_SIGNATURES}${PERSON_ID}` })
      .flush(noReceiptSignature());
    await settle(fixture);

    await chooseFile(
      fixture,
      '#receipt-signature-file',
      new File([new Uint8Array(10)], 'podpis.png', { type: 'image/png' }),
    );

    expect(element<HTMLButtonElement>(fixture, `#person-edit-${OTHER_PERSON_ID}`).disabled).toBe(
      true,
    );
    expect(findButton(fixture, 'Zavřít bez uložení')?.disabled).toBe(true);
    http
      .expectOne({ method: 'POST', url: `${RECEIPT_SIGNATURES}${PERSON_ID}` })
      .flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(element<HTMLButtonElement>(fixture, `#person-edit-${OTHER_PERSON_ID}`).disabled).toBe(
      false,
    );
  });

  it('when a receipt signature removal runs, then no other person can be opened and the editor cannot be closed until it is done', async () => {
    await click(fixture, `#person-edit-${PERSON_ID}`);
    http
      .expectOne({ method: 'GET', url: `${RECEIPT_SIGNATURES}${PERSON_ID}` })
      .flush(receiptSignature());
    await settle(fixture);

    await press(fixture, 'Odebrat podpis z potvrzení');
    await click(fixture, '.signature-confirm .ui-button--danger');

    expect(element<HTMLButtonElement>(fixture, `#person-edit-${OTHER_PERSON_ID}`).disabled).toBe(
      true,
    );
    expect(findButton(fixture, 'Zavřít bez uložení')?.disabled).toBe(true);
    http.expectOne({ method: 'DELETE', url: `${RECEIPT_SIGNATURES}${PERSON_ID}` }).flush(null);
    await settle(fixture);
    http
      .match(SIGNATORY_URL)
      .forEach((request) => request.flush(receiptSignatory({ personId: PERSON_ID })));
    await settle(fixture);
    expect(element<HTMLButtonElement>(fixture, `#person-edit-${OTHER_PERSON_ID}`).disabled).toBe(
      false,
    );
    expect(findButton(fixture, 'Zavřít bez uložení')?.disabled).toBe(false);
  });

  it('when they let another person sign without a receipt role, then the field says so and nothing is sent', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);
    await check(fixture, 'signsReceipts');
    await submit(fixture, '.receipt-form');

    expect(text(fixture, '.receipt-part app-form-field')).toContain(
      'Vyplňte prosím funkci, která se vytiskne pod jméno.',
    );
    http.expectNone(SIGNATORY_URL);
  });
});

describe('Given an administrator whose check of who signs the receipts fails', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp('pending'));
    http.expectOne(PEOPLE_URL).flush({ members: [person(), ADAM], note: null });
    http.expectOne(SIGNATORY_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
  });

  afterEach(() => verifyLeavingReceiptSignatures(http));

  it('when they edit a person, then the receipt part says the check failed, claims nobody signs, offers no choice and keeps removal off', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);

    expect(text(fixture, '.receipt-part [role="alert"]:not(:empty)')).toContain(
      'Nepodařilo se zjistit, kdo podepisuje potvrzení.',
    );
    expect(fixture.nativeElement.textContent).not.toContain('nikdo nepodepisuje');
    expect(fixture.nativeElement.querySelector('#person-signs-receipts')).toBeNull();
    expect(findButton(fixture, 'Odebrat osobu z webu')?.disabled ?? true).toBe(true);
  });

  it('when they try again, then the signatory loads and the part offers the choice', async () => {
    await click(fixture, `#person-edit-${OTHER_PERSON_ID}`);

    await press(fixture, 'Zjistit znovu');
    expect(document.activeElement?.textContent?.trim()).toBe('Na potvrzení o daru');
    http.expectOne(SIGNATORY_URL).flush(receiptSignatory({ personId: PERSON_ID }));
    await settle(fixture);

    expect(text(fixture, '#person-signs-receipts-hint')).toBe(
      'Potvrzení vždy podepisuje jen jedna osoba; teď je to Eva Vzorová. Po uložení je bude podepisovat tato osoba.',
    );
    expect(findButton(fixture, 'Odebrat osobu z webu')?.disabled).toBe(false);
  });
});

describe('Given an administrator who opens the signatory before the check of who signs arrives', () => {
  let fixture: ComponentFixture<AdminPeople>;
  let http: HttpTestingController;

  beforeEach(async () => {
    ({ fixture, http } = await setUp('pending'));
    http.expectOne(PEOPLE_URL).flush({ members: [person(), ADAM], note: null });
    await settle(fixture);
    await click(fixture, `#person-edit-${PERSON_ID}`);
  });

  afterEach(() => verifyLeavingReceiptSignatures(http));

  it('when the check runs, then the receipt part says so and offers no choice yet', () => {
    expect(text(fixture, '.receipt-part [role="status"]:not(:empty)')).toContain(
      'Načítáme, kdo potvrzení podepisuje…',
    );
    expect(fixture.nativeElement.querySelector('#person-signs-receipts')).toBeNull();
    http.expectOne(SIGNATORY_URL).flush(receiptSignatory({ personId: PERSON_ID }));
  });

  it('when the signatory arrives, then the receipt role of the open person is filled in', async () => {
    http.expectOne(SIGNATORY_URL).flush(receiptSignatory({ personId: PERSON_ID }));
    await settle(fixture);
    await settle(fixture);

    expect(element<HTMLInputElement>(fixture, '#person-receipt-role').value).toBe(
      'předsedkyně správní rady',
    );
  });
});
