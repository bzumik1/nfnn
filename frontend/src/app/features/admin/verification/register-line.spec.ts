import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdministrationCopy } from '../device-copy/administration-copy';
import type { AdminReceiptRow } from './receipt-register';
import { RegisterLine } from './register-line';
import { receiptRow, SIGNED_YEARLY } from './testing/register-fixtures';

describe('Given the register line under a verified receipt', () => {
  const rows = signal<readonly AdminReceiptRow[] | null>(null);
  const storedAt = signal<string | null>(null);

  async function render(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AdministrationCopy, useValue: { rows: () => rows, storedAt } },
      ],
    });
    const fixture = TestBed.createComponent(RegisterLine);
    fixture.componentRef.setInput('receipt', SIGNED_YEARLY);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function text(element: HTMLElement): string {
    return Array.from(element.querySelectorAll('h2, p, a'), (part) =>
      (part.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ).join(' ');
  }

  beforeEach(() => {
    rows.set(null);
    storedAt.set(null);
  });

  it('when the copy is not loaded yet, then it says the copy is still downloading and links no donor', async () => {
    const element = await render();

    expect(element.querySelector('h2')?.textContent?.trim()).toBe('V evidenci fondu');
    expect(text(element)).toContain('Kopie správy se do tohoto zařízení ještě stahuje.');
    expect(element.querySelector('a')).toBeNull();
    expect(text(element)).not.toContain('Podle kopie');
  });

  it('when the copy holds it as active, then it says valid, as of the copy, with the donor card', async () => {
    rows.set([receiptRow()]);
    storedAt.set('2027-02-10T07:05:00Z');

    const element = await render();

    expect(text(element)).toContain('Platné Kopie správy ho vede jako platné.');
    expect(text(element)).toContain('Podle kopie správy v tomto zařízení z 10. 02. 2027 08:05.');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/sprava/darci/donor-1');
  });

  it('when the copy holds it as replaced by a newer one, then it names the newer number and the day', async () => {
    rows.set([
      receiptRow({ status: 'REPLACED', supersededAt: '2027-01-31T23:30:00Z' }),
      receiptRow({ id: 'n', number: '2026-000020', issuedAt: '2027-01-31T23:30:00Z' }),
    ]);

    const element = await render();

    expect(text(element)).toContain(
      'Nahrazené Fond ho nahradil potvrzením č. 2026-000020. Nahrazeno 01. 02. 2027.',
    );
  });

  it('when the copy holds it as replaced by nothing it holds, then it says replaced by a newer one', async () => {
    rows.set([receiptRow({ status: 'REPLACED', supersededAt: null })]);

    const element = await render();

    expect(text(element)).toContain('Nahrazené Fond ho nahradil novějším potvrzením.');
    expect(text(element)).not.toContain('Nahrazeno');
  });

  it('when the copy holds it as withdrawn after the gifts changed, then it says outdated and the day', async () => {
    rows.set([
      receiptRow({
        status: 'WITHDRAWN',
        withdrawalReason: 'DONATIONS_CHANGED',
        withdrawnAt: '2027-02-02T08:00:00Z',
      }),
    ]);

    const element = await render();

    expect(text(element)).toContain(
      'Zastaralé Fond ho zrušil, protože se dary dárce od vystavení změnily. Zrušeno 02. 02. 2027.',
    );
  });

  it('when the copy holds it as withdrawn, then it says withdrawn', async () => {
    rows.set([receiptRow({ status: 'WITHDRAWN', withdrawnAt: '2027-02-02T08:00:00Z' })]);

    const element = await render();

    expect(text(element)).toContain('Zrušené Fond toto potvrzení zrušil. Zrušeno 02. 02. 2027.');
  });

  it('when the copy holds its number with other data, then it says it does not agree', async () => {
    rows.set([receiptRow({ totalAmountMinor: 1 })]);

    const element = await render();

    expect(text(element)).toContain('Nesouhlasí Fond vede potvrzení s tímto číslem s jinými údaji');
    expect(element.querySelector('a')).not.toBeNull();
  });

  it('when the copy does not hold its number, then it says not found and links no donor', async () => {
    rows.set([]);

    const element = await render();

    expect(text(element)).toContain('Nenalezeno Kopie správy v tomto zařízení potvrzení s tímto');
    expect(element.querySelector('a')).toBeNull();
  });
});
