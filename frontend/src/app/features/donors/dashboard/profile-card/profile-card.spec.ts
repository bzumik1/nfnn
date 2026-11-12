import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor } from '../../../../core/auth/donor';
import {
  authResponse,
  DONOR_VERSION,
  problem,
  sampleDonor,
} from '../../../../core/auth/testing/donor-fixtures';
import { heldRecordOf } from '../../../../core/version/row-version';
import {
  draftWorkOf,
  MemoryDraftShelf,
  memoryDraftShelfProviders,
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
      expect(request.request.headers.get('If-Match')).toBe(`"${DONOR_VERSION}"`);
      expect(heldRecordOf(request.request.context)).toEqual({
        name: 'Jana Nováková',
        street: 'Dlouhá 12',
        city: 'Ústí nad Labem',
        postalCode: '400 01',
        preferredLocale: 'cs',
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

    function refuseAsChangedMeanwhile(current: Record<string, unknown>): void {
      http.expectOne({ method: 'PATCH', url: '/api/donors/me' }).flush(
        {
          type: 'https://nfnn.cz/problems/donors/changed-meanwhile',
          title: 'Mezitím se to změnilo',
          status: 409,
          version: '00000000000000d9',
          current,
        },
        { status: 409, statusText: 'Conflict' },
      );
    }

    const SAVED_ELSEWHERE = {
      name: 'Jana Nováková',
      street: 'Dlouhá 12',
      city: 'Děčín',
      postalCode: '405 02',
      preferredLocale: 'cs',
    };

    describe('and saves while the data were changed meanwhile, as in another window', () => {
      beforeEach(async () => {
        await click('.profile-edit');
        await fillIn('#profile-street', 'Krátká 3');
        await submit();
        refuseAsChangedMeanwhile(SAVED_ELSEWHERE);
        await settle();
      });

      it('then the card says so calmly, keeps what they typed and fills the fields they left as they are stored now', () => {
        const notice = element('.profile-changed');
        expect(notice.getAttribute('role')).toBe('alert');
        expect(notice.textContent?.replace(/\s+/g, ' ').trim()).toContain(
          'Mezitím se uložené údaje změnily, třeba v jiném okně nebo na jiném zařízení. Vaše úpravy jsme zatím neuložili, zůstávají ve formuláři.',
        );
        expect(notice.textContent?.replace(/\s+/g, ' ').trim()).toContain(
          'Údaje, které jste neměnili, jsme ve formuláři doplnili tak, jak jsou uložené teď.',
        );
        expect(element<HTMLInputElement>('#profile-street').value).toBe('Krátká 3');
        expect(element<HTMLInputElement>('#profile-city').value).toBe('Děčín');
        expect(element<HTMLInputElement>('#profile-postal-code').value).toBe('405 02');
        expect(element('.profile-error')?.textContent?.trim() ?? '').toBe('');
      });

      it('then the form offers no second save beside the notice, only cancelling', () => {
        expect(element('.profile-save')).toBeNull();
        expect(element('.profile-cancel')).not.toBeNull();
        expect(element('.profile-changed-keep').textContent?.trim()).toBe('Uložit své úpravy');
        expect(element('.profile-changed-load').textContent?.trim()).toBe(
          'Zahodit své úpravy a načíst uložené údaje',
        );
      });

      it('then saving their edits sends them with the newer data in the fields they left, so nothing saved elsewhere goes back', async () => {
        await click('.profile-changed-keep');

        const again = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
        expect(again.request.headers.get('If-Match')).toBe('"00000000000000d9"');
        expect(heldRecordOf(again.request.context)).toEqual(SAVED_ELSEWHERE);
        expect(again.request.body).toEqual({
          name: 'Jana Nováková',
          address: { street: 'Krátká 3', city: 'Děčín', postalCode: '405 02' },
          preferredLocale: 'cs',
        });
        again.flush(
          sampleDonor({
            address: { street: 'Krátká 3', city: 'Děčín', postalCode: '405 02' },
            version: '00000000000000da',
          }),
        );
        await settle();

        expect(element('.profile-form')).toBeNull();
        expect(element('.profile-changed')).toBeNull();
        expect(store.donor()?.version).toBe('00000000000000da');
      });

      it('then saving their edits keeps the focus on the form while it saves, and there after a failure', async () => {
        element<HTMLButtonElement>('.profile-changed-keep').focus();
        await click('.profile-changed-keep');
        expect(document.activeElement).toBe(element('.profile-save'));

        http
          .expectOne({ method: 'PATCH', url: '/api/donors/me' })
          .flush(problem('server-error', 'Chyba serveru'), {
            status: 500,
            statusText: 'Server Error',
          });
        await settle();

        expect(element('.profile-error').textContent).toContain('Chyba serveru');
        expect(document.activeElement).toBe(element('.profile-save'));
      });

      it('then loading the saved data shows them and drops their edits', async () => {
        await click('.profile-changed-load');

        http.expectOne({ method: 'GET', url: '/api/donors/me' }).flush(
          sampleDonor({
            address: { street: 'Dlouhá 12', city: 'Děčín', postalCode: '405 02' },
            version: '00000000000000d9',
          }),
        );
        await settle();

        expect(element('.profile-form')).toBeNull();
        expect(shown()).toEqual(['Jana Nováková', 'Dlouhá 12, 405 02 Děčín', 'čeština']);
        expect(element('.profile-status').textContent?.trim()).toBe(
          'Vaše úpravy jsme zahodili a načetli uložené údaje.',
        );
        expect(document.activeElement).toBe(element('.profile-edit'));
      });

      it('then cancelling loads the saved data instead of showing the outdated ones, and says so', async () => {
        await click('.profile-cancel');

        http.expectOne({ method: 'GET', url: '/api/donors/me' }).flush(
          sampleDonor({
            address: { street: 'Dlouhá 12', city: 'Děčín', postalCode: '405 02' },
            version: '00000000000000d9',
          }),
        );
        await settle();

        http.expectNone({ method: 'PATCH', url: '/api/donors/me' });
        expect(element('.profile-form')).toBeNull();
        expect(shown()).toEqual(['Jana Nováková', 'Dlouhá 12, 405 02 Děčín', 'čeština']);
        expect(element('.profile-status').textContent?.trim()).toBe(
          'Úpravy jsme zrušili a načetli uložené údaje.',
        );
      });

      it('and the tab then holds another account, then the edit closes and nothing can be saved into that account', async () => {
        store.login('petr@example.cz', 'correct horse battery').subscribe();
        http
          .expectOne('/api/donors/auth/login')
          .flush(
            authResponse(
              'token-2',
              sampleDonor({ id: '01a18e56-bdb0-775a-bd0a-a60756839999', name: 'Petr Svoboda' }),
            ),
          );
        await settle();

        expect(element('.profile-form')).toBeNull();
        expect(element('.profile-changed')).toBeNull();
        expect(shown()[0]).toBe('Petr Svoboda');
        expect(element('.profile-status').textContent?.trim()).toBe(
          'V tomto okně je teď přihlášený jiný účet. Rozepsané úpravy jsme zahodili, nic jsme neuložili.',
        );
        http.expectNone({ method: 'PATCH', url: '/api/donors/me' });
      });
    });

    it('and saves a field that was also changed meanwhile, then the notice names it and the form keeps their value', async () => {
      await click('.profile-edit');
      await fillIn('#profile-city', 'Most');
      await submit();
      refuseAsChangedMeanwhile(SAVED_ELSEWHERE);
      await settle();

      expect(element('.profile-changed').textContent?.replace(/\s+/g, ' ').trim()).toContain(
        'Mezitím se jinak uložilo i to, co jste změnili: město. Ve formuláři zůstávají vaše hodnoty, ostatní údaje jsou doplněné tak, jak jsou uložené teď.',
      );
      expect(element<HTMLInputElement>('#profile-city').value).toBe('Most');
      expect(element<HTMLInputElement>('#profile-postal-code').value).toBe('405 02');

      await click('.profile-changed-keep');
      const again = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
      expect(again.request.body.address).toEqual({
        street: 'Dlouhá 12',
        city: 'Most',
        postalCode: '405 02',
      });
      again.flush(sampleDonor({ version: '00000000000000da' }));
      await settle();
    });

    it('and the tab comes to hold another account while they edit, then the edit closes without a request', async () => {
      await click('.profile-edit');
      await fillIn('#profile-name', 'Jana Malá');

      store.login('petr@example.cz', 'correct horse battery').subscribe();
      http
        .expectOne('/api/donors/auth/login')
        .flush(
          authResponse(
            'token-2',
            sampleDonor({ id: '01a18e56-bdb0-775a-bd0a-a60756839999', name: 'Petr Svoboda' }),
          ),
        );
      await settle();

      expect(element('.profile-form')).toBeNull();
      expect(shown()[0]).toBe('Petr Svoboda');
      http.expectNone({ method: 'PATCH', url: '/api/donors/me' });
    });

    it('and the app is older than the server and sends no version, then the form line says what the server said', async () => {
      await click('.profile-edit');
      await submit();
      http.expectOne({ method: 'PATCH', url: '/api/donors/me' }).flush(
        {
          type: 'https://nfnn.cz/problems/shared/version-required',
          title: 'Načtěte stránku znovu',
          status: 428,
        },
        { status: 428, statusText: 'Precondition Required' },
      );
      await settle();

      expect(element('.profile-error').textContent).toContain('Načtěte stránku znovu');
      expect(element('.profile-changed')).toBeNull();
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

  describe('when the account was opened from the copy on the device, which holds no version', () => {
    beforeEach(() => render(sampleDonor({ version: '' })));

    it('and the donor saves an edit, then the stored data are read first and the edit goes with their version, leaving the stored language as it is', async () => {
      await click('.profile-edit');
      await fillIn('#profile-street', 'Krátká 3');

      await submit();
      http.expectNone({ method: 'PATCH', url: '/api/donors/me' });
      http
        .expectOne({ method: 'GET', url: '/api/donors/me' })
        .flush(sampleDonor({ preferredLocale: 'en', version: '00000000000000d5' }));
      await settle();

      const save = http.expectOne({ method: 'PATCH', url: '/api/donors/me' });
      expect(save.request.headers.get('If-Match')).toBe('"00000000000000d5"');
      expect(save.request.body).toEqual({
        name: 'Jana Nováková',
        address: { street: 'Krátká 3', city: 'Ústí nad Labem', postalCode: '400 01' },
        preferredLocale: 'en',
      });
      save.flush(sampleDonor({ preferredLocale: 'en', version: '00000000000000d6' }));
      await settle();

      expect(element('.profile-changed')).toBeNull();
      expect(element('.profile-form')).toBeNull();
    });

    it('and the stored data cannot be read, then nothing is sent and the form says so', async () => {
      await click('.profile-edit');

      await submit();
      http
        .expectOne({ method: 'GET', url: '/api/donors/me' })
        .flush(problem('server-error', 'Chyba serveru'), {
          status: 500,
          statusText: 'Server Error',
        });
      await settle();

      http.expectNone({ method: 'PATCH', url: '/api/donors/me' });
      expect(element('.profile-error').textContent).toContain('Chyba serveru');
      expect(element('.profile-form')).not.toBeNull();
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
  let shelf: MemoryDraftShelf;
  let fixture: ComponentFixture<ProfileCard>;
  let http: HttpTestingController;

  const root = () => fixture.nativeElement as HTMLElement;

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await draftWorkOf(fixture.componentInstance);
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

  function keptDraft(startedFrom: string): void {
    shelf.seed('donor', {
      key: 'profile',
      base: `version:${startedFrom}`,
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
    expect(shelf.draftOf('donor', 'profile')).not.toBeNull();

    button('Zrušit').click();
    await settle();

    expect(shelf.draftOf('donor', 'profile')).toBeNull();
  });

  describe('when the device kept an edit started from the saved data', () => {
    beforeEach(async () => {
      keptDraft(DONOR_VERSION);
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
        'Pokračujete v rozepsaných úpravách. Zůstanou jen na tomto zařízení, dokud je neuložíte.',
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
      keptDraft('00000000000000d0');
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

      button('Uložit své úpravy místo nich').focus();
      button('Uložit své úpravy místo nich').click();
      await settle();
      expect(document.activeElement).toBe(root().querySelector('.profile-save'));
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
