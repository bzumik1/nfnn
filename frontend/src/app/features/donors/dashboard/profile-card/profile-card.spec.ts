import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../../core/auth/auth-store';
import { Donor } from '../../../../core/auth/donor';
import { authResponse, problem, sampleDonor } from '../../../../core/auth/testing/donor-fixtures';
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

    it('and the server refuses the data, then the form stays and says why', async () => {
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
      expect(element('.profile-form .ui-field-error').textContent).toContain(
        'Neplatný požadavek. PSČ má pět číslic.',
      );
      expect(element<HTMLButtonElement>('.profile-save').disabled).toBe(false);
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
