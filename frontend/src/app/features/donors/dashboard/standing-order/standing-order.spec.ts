import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { foundationPaymentDetails } from '../../../donations/testing/payment-details-fixtures';
import { StandingOrder } from './standing-order';

const PAYMENT_DETAILS_URL = '/api/donations/payment-details';

describe('Given the standing order guide of the donor area', () => {
  let fixture: ComponentFixture<StandingOrder>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StandingOrder],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(StandingOrder);
    fixture.componentRef.setInput('variableSymbol', '9876543210');
    document.body.appendChild(fixture.nativeElement);
    await settle();
  });

  afterEach(() => {
    http.verify();
    fixture.nativeElement.remove();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function element<T extends HTMLElement = HTMLElement>(selector: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  }

  function text(selector: string): string {
    return normalized(element(selector)?.textContent ?? '');
  }

  function texts(selector: string): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(selector)].map(
      (node) => normalized(node.textContent ?? ''),
    );
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  async function toggle(): Promise<void> {
    element<HTMLButtonElement>('.standing-toggle')!.click();
    await settle();
  }

  it('when it is shown, then a collapsed button names the guide and asks nothing yet', () => {
    const button = element<HTMLButtonElement>('.standing-toggle')!;
    expect(normalized(button.textContent ?? '')).toBe('Jak nastavit trvalý příkaz');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.hidden).toBe(true);
    http.expectNone(PAYMENT_DETAILS_URL);
  });

  describe('when the donor opens it', () => {
    beforeEach(async () => {
      await toggle();
    });

    it('then the panel opens and says the account is on its way', () => {
      expect(element('.standing-toggle')?.getAttribute('aria-expanded')).toBe('true');
      expect(element<HTMLElement>('.standing-panel')?.hidden).toBe(false);
      expect(text('.standing-loading')).toBe('Načítáme číslo účtu…');
      http.expectOne((request) => request.url === PAYMENT_DETAILS_URL);
    });

    it('then it lists the account, the variable symbol, any amount and monthly, with copy buttons for the numbers', async () => {
      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails());
      await settle();

      expect(text('.standing-lead')).toBe(
        'Trvalý příkaz si nastavíte ve své bance, v aplikaci nebo v internetovém bankovnictví. Vyplňte:',
      );
      expect(texts('.standing-details dt')).toEqual([
        'Číslo účtu',
        'Variabilní symbol',
        'Částka',
        'Opakování',
      ]);
      expect(texts('.standing-details dd .standing-value')).toEqual([
        '5544332217/2010',
        '9876543210',
        'Jakákoli, kterou chcete posílat',
        'Každý měsíc, nebo jak často chcete',
      ]);
      expect(texts('.standing-details app-copy-button button')).toEqual([
        'Kopírovat číslo účtu',
        'Kopírovat variabilní symbol',
      ]);
      expect(text('.standing-after')).toBe(
        'Každá platba se vám tu pak objeví sama a do ročního potvrzení se započítají všechny.',
      );
      expect(text('.standing-bank-only')).toBe(
        'Částku i den platby pak měníte jen ve své bance. Na tomto webu nic nastavovat nemusíte.',
      );
    });

    it('then a line for a standing order with an older symbol keeps the way to the bank accounts', async () => {
      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails());
      await settle();

      expect(text('.standing-older')).toBe(
        'Posíláte už trvalým příkazem s jiným nebo starším symbolem? Změňte v něm symbol na 9876543210, nebo ověřte účet v části Bankovní účty.',
      );
      expect(element('.standing-older a')?.getAttribute('href')).toBe('/darce/ucty');
    });

    it('and the account cannot be loaded, then an alert says so and trying again asks once more', async () => {
      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(element('.standing-error')?.getAttribute('role')).toBe('alert');
      expect(text('.standing-error p')).toBe(
        'Číslo účtu se nepodařilo načíst. Zkuste to prosím znovu.',
      );
      expect(element('.standing-error a')).toBeNull();

      element<HTMLButtonElement>('.standing-retry')!.click();
      await settle();

      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails());
      await settle();
      expect(element('.standing-error')).toBeNull();
      expect(text('.standing-details dd .standing-value')).toBe('5544332217/2010');
    });

    it('and closes and opens it again, then the account is not asked for again', async () => {
      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails());
      await settle();

      await toggle();
      expect(element<HTMLElement>('.standing-panel')?.hidden).toBe(true);
      await toggle();

      http.expectNone(PAYMENT_DETAILS_URL);
      expect(text('.standing-details dd .standing-value')).toBe('5544332217/2010');
    });

    it('and presses Escape inside the panel, then it closes and the focus returns to the button', async () => {
      http
        .expectOne((request) => request.url === PAYMENT_DETAILS_URL)
        .flush(foundationPaymentDetails());
      await settle();

      element('.standing-panel')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await settle();

      expect(element('.standing-toggle')?.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(element('.standing-toggle'));
    });
  });

  describe('when the payment card it sits in has an amount chosen', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('account', {
        kind: 'ready',
        account: foundationPaymentDetails().account,
      });
    });

    it('then the amount row names that amount and still allows another one', async () => {
      fixture.componentRef.setInput('amount', 400);
      await toggle();

      expect(texts('.standing-details dd .standing-value')[2]).toBe(
        '400 Kč, nebo jiná, kterou chcete posílat',
      );
    });

    it('then a later choice in the card changes the amount row with thousands spaced', async () => {
      fixture.componentRef.setInput('amount', 400);
      await toggle();
      fixture.componentRef.setInput('amount', 1000);
      await settle();

      expect(texts('.standing-details dd .standing-value')[2]).toBe(
        '1 000 Kč, nebo jiná, kterou chcete posílat',
      );
    });

    it('then an amount not entered yet leaves the row open for any amount', async () => {
      fixture.componentRef.setInput('amount', null);
      await toggle();

      expect(texts('.standing-details dd .standing-value')[2]).toBe(
        'Jakákoli, kterou chcete posílat',
      );
    });
  });

  describe('when the account comes from the payment card it sits in', () => {
    it('then it shows that account and asks for nothing', async () => {
      fixture.componentRef.setInput('account', {
        kind: 'ready',
        account: foundationPaymentDetails().account,
      });
      await toggle();

      http.expectNone(PAYMENT_DETAILS_URL);
      expect(texts('.standing-details dd .standing-value').slice(0, 2)).toEqual([
        '5544332217/2010',
        '9876543210',
      ]);
    });

    it('then while the card loads it says the account is on its way', async () => {
      fixture.componentRef.setInput('account', { kind: 'loading' });
      await toggle();

      http.expectNone(PAYMENT_DETAILS_URL);
      expect(text('.standing-loading')).toBe('Načítáme číslo účtu…');
    });

    it('then a card that failed shows the alert and trying again asks the card to load again', async () => {
      const retries: unknown[] = [];
      fixture.componentInstance.retryRequested.subscribe((value) => retries.push(value));
      fixture.componentRef.setInput('account', { kind: 'failed' });
      await toggle();

      expect(text('.standing-error p')).toBe(
        'Číslo účtu se nepodařilo načíst. Zkuste to prosím znovu.',
      );
      element<HTMLButtonElement>('.standing-retry')!.click();
      await settle();

      expect(retries).toHaveLength(1);
      http.expectNone(PAYMENT_DETAILS_URL);
    });
  });
});
