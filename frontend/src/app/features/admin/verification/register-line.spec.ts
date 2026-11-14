import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SignedStatus } from '../../donations/verification/receipt-verifier';
import { AdministrationCopy } from '../device-copy/administration-copy';
import type { AdminReceiptRow } from './receipt-register';
import { RegisterLine } from './register-line';
import { receiptRow, SIGNED_YEARLY } from './testing/register-fixtures';

describe('Given the register line under a verified receipt', () => {
  const rows = signal<readonly AdminReceiptRow[] | null>(null);
  const storedAt = signal<string | null>(null);
  let fixture: ComponentFixture<RegisterLine>;

  async function render(status: SignedStatus = 'offline'): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdministrationCopy, useValue: { rows: () => rows, storedAt } },
      ],
    });
    fixture = TestBed.createComponent(RegisterLine);
    fixture.componentRef.setInput('receipt', SIGNED_YEARLY);
    fixture.componentRef.setInput('status', status);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function text(element: HTMLElement): string {
    return Array.from(element.querySelectorAll('h2, p, a'), (part) =>
      (part.textContent ?? '').replace(/\s+/g, ' ').trim(),
    )
      .filter((part) => part !== '')
      .join(' ');
  }

  function stateText(element: HTMLElement): string {
    return Array.from(element.querySelectorAll('[role="status"] p'), (part) =>
      (part.textContent ?? '').replace(/[ \t\n\r]+/g, ' ').trim(),
    ).join(' ');
  }

  beforeEach(() => {
    rows.set(null);
    storedAt.set(null);
  });

  it('when the copy is not loaded, then it says the data are not here yet in a status region and links no donor', async () => {
    const element = await render();

    expect(element.querySelector('h2')?.textContent?.trim()).toBe('V evidenci fondu');
    expect(stateText(element)).toContain(
      'Údaje správy v tomto zařízení zatím nejsou k dispozici: buď se ještě stahují, nebo se stažení nepovedlo.',
    );
    expect(element.querySelector('a')).toBeNull();
    expect(text(element)).not.toContain('Podle údajů správy');
  });

  it('when the copy loads while the line is shown, then the same status region says the result', async () => {
    const element = await render();
    const region = element.querySelector('[role="status"]');

    rows.set([receiptRow()]);
    await fixture.whenStable();

    expect(element.querySelector('[role="status"]')).toBe(region);
    expect(stateText(element)).toContain('Platné');
  });

  describe('when the fund was not asked, as offline', () => {
    it('and the copy holds it as active, then it says the fund keeps it as valid, as of the download, with the donor card', async () => {
      rows.set([receiptRow()]);
      storedAt.set('2027-02-10T07:05:00Z');

      const element = await render();

      expect(stateText(element)).toBe('Platné Fond ho vede jako platné.');
      expect(text(element)).toContain(
        'Podle údajů správy stažených do tohoto zařízení 10. 2. 2027 v 8:05.',
      );
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/sprava/darci/donor-1');
    });

    it('and the copy holds it as replaced by a newer one it holds, then it names the day, the newer number and what counts', async () => {
      rows.set([
        receiptRow({ status: 'REPLACED', supersededAt: '2027-01-31T23:30:00Z' }),
        receiptRow({ id: 'n', number: '2026-000020', issuedAt: '2027-01-31T23:30:00Z' }),
      ]);

      const element = await render();

      expect(stateText(element)).toBe(
        'Nahrazené Fond ho 1. 2. 2027 nahradil potvrzením č.\u00a02026-000020. Platí to novější; najdete ho na kartě dárce.',
      );
    });

    it('and the copy holds it as replaced by nothing it holds and without a day, then it says replaced by a newer one', async () => {
      rows.set([receiptRow({ status: 'REPLACED', supersededAt: null })]);

      const element = await render();

      expect(stateText(element)).toContain('Nahrazené Fond ho nahradil novějším potvrzením.');
    });

    it('and the copy holds it as withdrawn after the gifts changed, then it says outdated, the day and where to look', async () => {
      rows.set([
        receiptRow({
          status: 'WITHDRAWN',
          withdrawalReason: 'DONATIONS_CHANGED',
          withdrawnAt: '2027-02-02T08:00:00Z',
        }),
      ]);

      const element = await render();

      expect(stateText(element)).toBe(
        'Zastaralé Od vystavení se dary dárce změnily, proto ho fond 2. 2. 2027 zrušil. Na kartě dárce uvidíte, zda už má nové.',
      );
    });

    it('and the copy holds it as withdrawn, then it says withdrawn, the day and not to take it as valid', async () => {
      rows.set([receiptRow({ status: 'WITHDRAWN', withdrawnAt: '2027-02-02T08:00:00Z' })]);

      const element = await render();

      expect(stateText(element)).toBe(
        'Zrušené Fond ho 2. 2. 2027 zrušil. Nepovažujte ho za platné.',
      );
    });

    it('and the copy holds its number with other data, then it says it does not agree and what to do', async () => {
      rows.set([receiptRow({ totalAmountMinor: 1 })]);

      const element = await render();

      expect(stateText(element)).toContain(
        'Nesouhlasí Fond vede potvrzení s tímto číslem, ale s jinými údaji',
      );
      expect(stateText(element)).toContain('dejte vědět technikovi.');
      expect(element.querySelector('a')).not.toBeNull();
    });

    it('and the copy does not hold its number, then it says not found, to verify again once the fund answers, and links no donor', async () => {
      rows.set([]);

      const element = await render();

      expect(stateText(element)).toContain(
        'Nenalezeno Údaje správy v tomto zařízení potvrzení s tímto číslem nemají.',
      );
      expect(stateText(element)).toContain('Ověřte ho znovu, až fond odpoví.');
      expect(element.querySelector('a')).toBeNull();
    });
  });

  describe('when the fund answered', () => {
    it('and the answer is active as the copy holds it, then it shows only the badge and repeats no sentence', async () => {
      rows.set([receiptRow()]);

      const element = await render('active');

      expect(stateText(element)).toBe('Platné');
    });

    it('and the answer is replaced as the copy holds it, then it adds the day and the newer number the fund did not say', async () => {
      rows.set([
        receiptRow({ status: 'REPLACED', supersededAt: '2027-01-31T23:30:00Z' }),
        receiptRow({ id: 'n', number: '2026-000020', issuedAt: '2027-01-31T23:30:00Z' }),
      ]);

      const element = await render('replaced');

      expect(stateText(element)).toBe(
        'Nahrazené Fond ho 1. 2. 2027 nahradil potvrzením č.\u00a02026-000020.',
      );
    });

    it('and the answer is replaced while the copy holds it as active, then it says the copy is behind and the fund counts, never valid', async () => {
      rows.set([receiptRow()]);

      const element = await render('replaced');

      expect(stateText(element)).toBe(
        'Starší údaje Údaje správy v tomto zařízení říkají o potvrzení něco jiného než odpověď fondu výše, nejspíš jsou starší. Platí odpověď fondu.',
      );
      expect(text(element)).not.toContain('Platné');
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/sprava/darci/donor-1');
    });

    it('and the answer is active while the copy does not hold its number, then it says the copy misses it, why, and that the answer counts, and links no donor', async () => {
      rows.set([]);

      const element = await render('active');

      expect(stateText(element)).toBe(
        'Nenalezeno Údaje správy v tomto zařízení ho nemají: nejspíš vzniklo až po jejich posledním stažení, nebo patří vymazanému dárci. Platí odpověď fondu.',
      );
      expect(element.querySelector('a')).toBeNull();
    });

    it('and the answer is replaced while the copy holds its number with other data, then it says they disagree in red and to tell the technician', async () => {
      rows.set([receiptRow({ giftCount: 3 })]);

      const element = await render('replaced');

      expect(stateText(element)).toBe(
        'Nesouhlasí Fond potvrzení vede tak, jak uvádí odpověď výše, údaje správy v tomto zařízení ho ale mají s jinými údaji. Platí odpověď fondu; dejte prosím vědět technikovi.',
      );
      expect(element.querySelector('.ui-badge--danger')).not.toBeNull();
    });

    it('and the answer is outdated as the copy holds it, then it adds only the day and repeats no next step', async () => {
      rows.set([
        receiptRow({
          status: 'WITHDRAWN',
          withdrawalReason: 'DONATIONS_CHANGED',
          withdrawnAt: '2027-02-02T08:00:00Z',
        }),
      ]);

      const element = await render('outdated');

      expect(stateText(element)).toBe('Zastaralé Fond ho 2. 2. 2027 zrušil.');
    });

    it('and the fund does not know the receipt the copy holds with these data, then it says they disagree and never valid', async () => {
      rows.set([receiptRow()]);

      const element = await render('unknown');

      expect(stateText(element)).toBe(
        'Nesouhlasí Údaje správy v tomto zařízení potvrzení s těmito údaji mají, fond ho ale podle odpovědi výše nevede. Nepovažujte ho za platné a dejte vědět technikovi.',
      );
      expect(element.querySelector('.ui-badge--danger')).not.toBeNull();
    });

    it('and the fund does not know the receipt and neither does the copy, then it says the copy agrees', async () => {
      rows.set([]);

      const element = await render('unknown');

      expect(stateText(element)).toBe(
        'Nenalezeno Ani údaje správy v tomto zařízení potvrzení s tímto číslem nemají.',
      );
    });
  });
});
