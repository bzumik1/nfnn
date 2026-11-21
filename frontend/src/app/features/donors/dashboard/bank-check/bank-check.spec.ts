import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import { LOADING_TIMINGS } from '../../../../shared/ui/skeleton/loading-view';
import { DonorDonations } from '../donor-donations';
import { BankCheck } from './bank-check';
import { withOrdinarySpaces } from '../../../../../testing/ordinary-spaces';

describe('Given the bank check of a signed-in donor', () => {
  let fixture: ComponentFixture<BankCheck>;
  let offline: WritableSignal<boolean>;
  let refreshFromBank: ReturnType<typeof vi.fn>;
  let checkingBank: WritableSignal<boolean>;

  function checkButton(): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.bank-check-btn',
    )!;
  }

  beforeEach(async () => {
    offline = signal(false);
    refreshFromBank = vi.fn();
    checkingBank = signal(false);
    TestBed.configureTestingModule({
      imports: [BankCheck],
      providers: [
        { provide: Connectivity, useValue: { offline } },
        {
          provide: DonorDonations,
          useValue: {
            checkingBank,
            bankCheckOutcome: signal(null),
            incomingCount: signal(0),
            bankDataAsOf: signal(null),
            refreshFromBank,
            clearBankCheckOutcome: vi.fn(),
            showIncoming: vi.fn(),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BankCheck);
    await fixture.whenStable();
  });

  it('when a check is running, then Zkontrolovat nové platby stays focusable with its name, says it is unavailable and asks the bank no second time', async () => {
    checkingBank.set(true);
    await fixture.whenStable();

    expect(checkButton().disabled).toBe(false);
    expect(checkButton().getAttribute('aria-disabled')).toBe('true');
    expect(withOrdinarySpaces(checkButton().textContent)?.trim()).toBe('Zkontrolovat nové platby');

    checkButton().click();
    await fixture.whenStable();
    expect(refreshFromBank).not.toHaveBeenCalled();

    checkingBank.set(false);
    await fixture.whenStable();
    expect(checkButton().hasAttribute('aria-disabled')).toBe(false);
  });

  it('when the device is offline and the donor presses Zkontrolovat nové platby, then the button says it needs a connection and the bank is not asked', async () => {
    offline.set(true);
    await fixture.whenStable();

    checkButton().click();
    await fixture.whenStable();

    expect(refreshFromBank).not.toHaveBeenCalled();
    expect(checkButton().getAttribute('aria-disabled')).toBe('true');
    const hint = document.getElementById(checkButton().getAttribute('aria-describedby') ?? '');
    expect(withOrdinarySpaces(hint?.textContent)?.trim()).toBe('Potřebuje připojení');
  });
});

describe('Given the bank check of a signed-in donor in a theme that delays loading looks', () => {
  let fixture: ComponentFixture<BankCheck>;
  let checkingBank: WritableSignal<boolean>;

  const root = () => fixture.nativeElement as HTMLElement;
  const statusText = () =>
    (withOrdinarySpaces(root().querySelector('.bank-check-status')?.textContent) ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  const checkButton = () => root().querySelector<HTMLButtonElement>('.bank-check-btn')!;
  const looksBusy = () =>
    checkButton().getAttribute('aria-disabled') === 'true' &&
    !checkButton().classList.contains('bank-check-btn--busy-unseen');

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    checkingBank = signal(false);
    TestBed.configureTestingModule({
      imports: [BankCheck],
      providers: [
        { provide: Connectivity, useValue: { offline: signal(false) } },
        {
          provide: LOADING_TIMINGS,
          useValue: () => ({ delayMs: 300, minimumMs: 400, appearMs: 300 }),
        },
        {
          provide: DonorDonations,
          useValue: {
            checkingBank,
            bankCheckOutcome: signal(null),
            incomingCount: signal(0),
            bankDataAsOf: signal('2026-10-18T08:05:00Z'),
            refreshFromBank: vi.fn(),
            clearBankCheckOutcome: vi.fn(),
            showIncoming: vi.fn(),
          },
        },
      ],
    });
    vi.useFakeTimers();
    fixture = TestBed.createComponent(BankCheck);
    await wait(0);
  });

  afterEach(() => vi.useRealTimers());

  it('when a check ends within the delay, then the line keeps the bank time and the button never looks busy, while it says it is unavailable from the start', async () => {
    checkingBank.set(true);
    await wait(0);

    expect(statusText()).toBe('Údaje z banky k 18. 10. 2026 10:05');
    expect(checkButton().getAttribute('aria-disabled')).toBe('true');
    expect(looksBusy()).toBe(false);

    await wait(130);
    checkingBank.set(false);
    await wait(0);

    expect(statusText()).toBe('Údaje z banky k 18. 10. 2026 10:05');
    expect(checkButton().hasAttribute('aria-disabled')).toBe(false);

    await wait(1000);
    expect(statusText()).toBe('Údaje z banky k 18. 10. 2026 10:05');
  });

  it('when a check runs past the delay, then the line says Kontrolujeme nové platby v bance… and the button looks busy for at least the minimum', async () => {
    checkingBank.set(true);
    await wait(300);

    expect(statusText()).toBe('Kontrolujeme nové platby v bance…');
    expect(looksBusy()).toBe(true);

    await wait(50);
    checkingBank.set(false);
    await wait(0);

    expect(statusText()).toBe('Kontrolujeme nové platby v bance…');
    expect(looksBusy()).toBe(true);

    await wait(350);

    expect(statusText()).toBe('Údaje z banky k 18. 10. 2026 10:05');
    expect(checkButton().hasAttribute('aria-disabled')).toBe(false);
  });
});
