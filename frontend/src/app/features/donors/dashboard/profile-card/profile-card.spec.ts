import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor } from '../../../../core/auth/donor';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
import {
  MemoryDraftShelf,
  memoryDraftShelfProviders,
  valuesBase,
} from '../../../../core/drafts/testing/memory-draft-shelf';
import { ProfileCard } from './profile-card';

describe('Given the donor data card in the overview', () => {
  let fixture: ComponentFixture<ProfileCard>;
  let http: HttpTestingController;
  let store: AuthStore;
  let sessionEnded: number;

  async function render(donor: Donor = sampleDonor()): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
    store.login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', donor));
    fixture = TestBed.createComponent(ProfileCard);
    sessionEnded = 0;
    fixture.componentInstance.sessionEnded.subscribe(() => sessionEnded++);
    await settle();
  }

  afterEach(() => http.verify());

  const root = () => fixture.nativeElement as HTMLElement;

  function element<T extends HTMLElement>(selector: string): T {
    return root().querySelector(selector) as T;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(selector: string): Promise<void> {
    element<HTMLButtonElement>(selector).click();
    await settle();
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function choose(selector: string, value: string): Promise<void> {
    const select = element<HTMLSelectElement>(selector);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  async function submit(): Promise<void> {
    element<HTMLFormElement>('.profile-form').dispatchEvent(new Event('submit'));
    await settle();
  }

  function shown(): string[] {
    return Array.from(root().querySelectorAll('.profile-data dd')).map(
      (value) => value.textContent?.trim() ?? '',
    );
  }

  describe('when a person opens the overview', () => {
    beforeEach(() => render());

    it('then it shows the data the receipts carry', () => {
      expect(element('h2').textContent).toContain('Údaje na potvrzení o daru');
      expect(shown()).toEqual(['Jana Nováková', 'Dlouhá 12, 400 01 Ústí nad Labem', 'čeština']);
    });

    it('and edits the address, then only the form is sent and the card shows the saved data', async () => {
      await click('.profile-edit');
      expect(document.activeElement).toBe(element('#profile-name'));
      await fillIn('#profile-street', 'Krátká 3');
      await fillIn('#profile-postal-code', '400 11');
      await choose('#profile-locale', 'en');

      await submit();
      const request = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
      expect(request.request.body).toEqual({
        name: 'Jana Nováková',
        address: { street: 'Krátká 3', city: 'Ústí nad Labem', postalCode: '400 11' },
        preferredLocale: 'en',
      });
      request.flush(
        sampleDonor({
          address: { street: 'Krátká 3', city: 'Ústí nad Labem', postalCode: '400 11' },
          preferredLocale: 'en',
        }),
      );
      await settle();

      expect(element('.profile-form')).toBeNull();
      expect(shown()).toEqual([
        'Jana Nováková',
        'Krátká 3, 400 11 Ústí nad Labem',
        'angličtina (dvojjazyčné)',
      ]);
      expect(element('.profile-status').textContent?.trim()).toBe(
        'Údaje jsme uložili. Jméno a adresu ponesou všechna potvrzení, která si stáhnete od teď, zvolený jazyk jen ta, která si stáhnete poprvé.',
      );
      expect(store.donor()?.address.street).toBe('Krátká 3');
      expect(document.activeElement).toBe(element('.profile-edit'));
    });

    it('and edits the data, then the address fields come in the order of the registration: street, postal code, city', async () => {
      await click('.profile-edit');

      const fields = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>(
          '.profile-form input',
        ),
      ].map((input) => input.id);
      expect(fields).toEqual([
        'profile-name',
        'profile-street',
        'profile-postal-code',
        'profile-city',
      ]);
    });

    it('and edits the data, then the language field says that receipts already downloaded keep their language', async () => {
      await click('.profile-edit');

      expect(element('#profile-locale').getAttribute('aria-describedby')).toBe(
        'profile-locale-hint',
      );
      expect(element('#profile-locale-hint').textContent?.trim()).toBe(
        'Platí pro potvrzení, která si stáhnete poprvé. Ta, která jste si už stáhli, zůstanou v původním jazyce.',
      );
    });

    it('and empties the city, then nothing is sent and the field says what is missing', async () => {
      await click('.profile-edit');
      await fillIn('#profile-city', '');

      await submit();

      http.expectNone('/api/donors/me');
      expect(element('#profile-city-error').textContent).toContain('Vyplňte prosím město.');
      expect(document.activeElement).toBe(element('#profile-city'));
    });

    it('and cancels the edit, then nothing is sent and the card shows the data it had', async () => {
      await click('.profile-edit');
      await fillIn('#profile-name', 'Jana Malá');

      await click('.profile-cancel');

      http.expectNone('/api/donors/me');
      expect(shown()[0]).toBe('Jana Nováková');
      expect(document.activeElement).toBe(element('.profile-edit'));
    });

    it('and the server refuses a field, then the form stays, the message stands at that field, which takes the focus, and the form line gives only the title', async () => {
      await click('.profile-edit');

      await submit();
      http.expectOne('/api/donors/me').flush(
        {
          ...problem('validation', 'Neplatný požadavek'),
          status: 400,
          errors: [{ field: 'address.postalCode', message: 'PSČ má pět číslic.' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      expect(element('.profile-form')).not.toBeNull();
      expect(element('#profile-postal-code-error').textContent).toContain('PSČ má pět číslic.');
      expect(element('#profile-postal-code').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(element('#profile-postal-code'));
      expect(element('.profile-form .ui-field-error').textContent).toContain('Neplatný požadavek');
      expect(element('.profile-form .ui-field-error').textContent).not.toContain(
        'PSČ má pět číslic.',
      );
      expect(element<HTMLButtonElement>('.profile-save').disabled).toBe(false);
    });

    it('and the server refuses the name, street and city as unprintable, then each field carries its message', async () => {
      await click('.profile-edit');

      await submit();
      const unprintable = 'Obsahuje znak, který na potvrzení o daru nevytiskneme.';
      http.expectOne('/api/donors/me').flush(
        {
          ...problem('validation', 'Neplatný požadavek'),
          status: 400,
          errors: [
            { field: 'name', message: unprintable },
            { field: 'address.street', message: unprintable },
            { field: 'address.city', message: unprintable },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );
      await settle();

      for (const id of ['profile-name', 'profile-street', 'profile-city']) {
        expect(element(`#${id}-error`).textContent).toContain(unprintable);
      }
      expect(document.activeElement).toBe(element('#profile-name'));
    });

    it('and types a character no receipt can print into the name, street or city, then nothing is sent and each of those fields says so', async () => {
      await click('.profile-edit');
      await fillIn('#profile-name', 'Jana 中 Nováková');
      await fillIn('#profile-street', 'Dlouhá 12 🏠');
      await fillIn('#profile-city', 'Ústí nad Labem');

      await submit();

      http.expectNone('/api/donors/me');
      const refusal =
        'Obsahuje znak, který na potvrzení o daru nevytiskneme, například emoji nebo čínské písmo. Napište prosím tento údaj latinkou, cyrilicí nebo řeckým písmem.';
      expect(element('#profile-name-error').textContent?.trim()).toBe(refusal);
      expect(element('#profile-street-error').textContent?.trim()).toBe(refusal);
      expect(element('#profile-city-error')).toBeNull();
      expect(element('#profile-name').getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(element('#profile-name'));
    });

    it('and types Greek, Cyrillic or Vietnamese letters, then they are sent', async () => {
      await click('.profile-edit');
      await fillIn('#profile-name', 'Nguyễn Thị Minh Khai');
      await fillIn('#profile-street', 'Хрещатик 1');
      await fillIn('#profile-city', 'Αθήνα');

      await submit();

      const request = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
      expect(request.request.body.name).toBe('Nguyễn Thị Minh Khai');
      request.flush(sampleDonor());
      await settle();
    });

    it('and the session has ended, then the overview is told to send the donor to sign in', async () => {
      await click('.profile-edit');

      await submit();
      http.expectOne('/api/donors/me').flush(problem('auth/unauthenticated', 'Nejste přihlášeni'), {
        status: 401,
        statusText: 'Unauthorized',
      });
      await settle();

      expect(sessionEnded).toBe(1);
    });
  });

  describe('when a company opens the overview', () => {
    beforeEach(() =>
      render(
        sampleDonor({
          type: 'COMPANY',
          name: 'Stavby Novák s.r.o.',
          companyIdentifier: '45274649',
        }),
      ),
    );

    it('then it shows the company identification number, which cannot be edited', async () => {
      expect(shown()).toEqual([
        'Stavby Novák s.r.o.',
        '45274649',
        'Dlouhá 12, 400 01 Ústí nad Labem',
        'čeština',
      ]);

      await click('.profile-edit');

      expect(element('label[for="profile-name"]').textContent).toContain('Název firmy');
      expect(element('#profile-company-identifier')).toBeNull();
    });
  });
});

describe('Given the donor data card on a device that keeps drafts', () => {
  const saved = {
    name: 'Jana Nováková',
    street: 'Dlouhá 12',
    city: 'Ústí nad Labem',
    postalCode: '400 01',
    preferredLocale: 'cs',
  };
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<ProfileCard>;
  let http: HttpTestingController;

  const root = () => fixture.nativeElement as HTMLElement;

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(root().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name,
    );
    if (found === undefined) {
      throw new Error(`No button ${name}`);
    }
    return found;
  }

  function input(selector: string): HTMLInputElement {
    return root().querySelector(selector) as HTMLInputElement;
  }

  async function fillIn(selector: string, value: string): Promise<void> {
    input(selector).value = value;
    input(selector).dispatchEvent(new Event('input'));
    await settle();
  }

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProfileCard],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        ...memoryDraftShelfProviders(shelf),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor()));
    fixture = TestBed.createComponent(ProfileCard);
    await settle();
  }

  async function keptDraft(startedFrom: typeof saved): Promise<void> {
    shelf.seed('donor', {
      key: 'profile',
      base: await valuesBase(startedFrom),
      values: { street: 'Krátká 3' },
      savedAt: '2026-11-06T09:00:00.000Z',
    });
  }

  beforeEach(() => {
    shelf = new MemoryDraftShelf();
  });

  afterEach(() => http.verify());

  it('when the donor edits the address, then it is kept in the copy of their own account until they save', async () => {
    await render();
    button('Upravit údaje').click();
    await settle();

    await fillIn('#profile-street', 'Krátká 3');
    expect(shelf.draftOf('donor', 'profile')?.values).toEqual({ street: 'Krátká 3' });
    expect(shelf.draftOf('administration', 'profile')).toBeNull();

    root().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    http
      .expectOne({ method: 'PATCH', url: '/api/donors/me' })
      .flush(sampleDonor({ address: { ...sampleDonor().address, street: 'Krátká 3' } }));
    await settle();
    expect(shelf.draftOf('donor', 'profile')).toBeNull();
  });

  it('when the donor cancels the edit, then the draft leaves the device', async () => {
    await render();
    button('Upravit údaje').click();
    await settle();
    await fillIn('#profile-street', 'Krátká 3');

    button('Zrušit').click();
    await settle();

    expect(shelf.draftOf('donor', 'profile')).toBeNull();
  });

  describe('when the device kept an edit started from the saved data', () => {
    beforeEach(async () => {
      await keptDraft(saved);
      await render();
    });

    it('and they continue it, then the form opens with it and saves it without asking', async () => {
      expect(root().querySelector('app-draft-offer')?.textContent).not.toContain(
        'Uložená verze se od té doby změnila',
      );
      expect(root().querySelector('.profile-edit')).toBeNull();

      button('Pokračovat v rozepsaném').click();
      await settle();
      expect(input('#profile-street').value).toBe('Krátká 3');
      expect(root().querySelector('[role="status"]:not(:empty)')?.textContent?.trim()).toBe(
        'Pokračujete v rozepsaných úpravách. Zatím jsou jen na tomto zařízení a platit začnou, až je uložíte.',
      );

      root().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
      const save = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
      expect(save.request.body.address.street).toBe('Krátká 3');
      save.flush(sampleDonor({ address: { ...sampleDonor().address, street: 'Krátká 3' } }));
      await settle();
      expect(shelf.draftOf('donor', 'profile')).toBeNull();
    });

    it('and they discard it, then it leaves the device and the card shows the saved data', async () => {
      button('Zahodit').click();
      await settle();

      expect(document.activeElement).toBe(button('Upravit údaje'));
      expect(shelf.draftOf('donor', 'profile')).toBeNull();
      expect(root().textContent).toContain('Dlouhá 12');
      expect(root().querySelector('app-draft-offer')).toBeNull();
    });
  });

  describe('when the device kept an edit started from data saved differently since', () => {
    beforeEach(async () => {
      await keptDraft({ ...saved, city: 'Děčín' });
      await render();
      button('Pokračovat v rozepsaném').click();
      await settle();
      root().querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle();
    });

    it('then only the field the draft changed comes back and the newer saved data stay in the others', () => {
      expect(input('#profile-street').value).toBe('Krátká 3');
      expect(input('#profile-city').value).toBe('Ústí nad Labem');
      http.expectNone('/api/donors/me');
    });

    it('then saving asks first instead of overwriting silently, and keeping the edits saves them', async () => {
      http.expectNone('/api/donors/me');
      expect(root().querySelector('.profile-stale')?.textContent).toContain(
        'se uložené údaje změnily',
      );

      button('Uložit své úpravy místo nich').click();
      await settle();
      http
        .expectOne({ method: 'PATCH', url: '/api/donors/me' })
        .flush(sampleDonor({ address: { ...sampleDonor().address, street: 'Krátká 3' } }));
      await settle();
      expect(shelf.draftOf('donor', 'profile')).toBeNull();
    });

    it('and they drop the edits, then the draft leaves the device and the saved data show', async () => {
      button('Zahodit své úpravy').click();
      await settle();

      http.expectNone('/api/donors/me');
      expect(shelf.draftOf('donor', 'profile')).toBeNull();
      expect(root().textContent).toContain('Dlouhá 12');
    });
  });
});
