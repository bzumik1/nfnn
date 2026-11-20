import { signal, type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Connectivity } from '../../../../core/connectivity/connectivity';
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
