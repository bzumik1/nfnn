import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { SignedReceipt } from './receipt-proof';
import { ReceiptVerifier, type VerificationOutcome } from './receipt-verifier';
import { VerificationPage } from './verification-page';

const SINGLE: SignedReceipt = {
  kind: 'single',
  number: '2026-000042',
  issuedOn: '2026-11-05',
  year: null,
  replaces: null,
  donor: {
    type: 'person',
    name: 'Marie Dvořáková',
    street: 'Lipová 12',
    city: 'Liberec',
    postalCode: '460 01',
    companyIdentifier: null,
  },
  gifts: [{ receivedOn: '2026-11-03', amountMinor: 250000 }],
  totalMinor: 250000,
};

const YEARLY: SignedReceipt = {
  ...SINGLE,
  kind: 'yearly',
  number: '2027-000007',
  issuedOn: '2027-01-15',
  year: 2026,
  replaces: { number: '2026-000042', issuedOn: '2026-11-05' },
  donor: { ...SINGLE.donor, type: 'company', name: 'Acme s.r.o.', companyIdentifier: '25596641' },
  gifts: [
    { receivedOn: '2026-03-15', amountMinor: 50000 },
    { receivedOn: '2026-11-03', amountMinor: 125050 },
  ],
  totalMinor: 175050,
};

const FRAGMENT = '10031885061882060800046343990168929322040303989858395561963591784434255';

class FakeVerifier {
  readonly calls: (string | null)[] = [];
  answer: (fragment: string | null) => Promise<VerificationOutcome> = () =>
    Promise.resolve({ state: 'empty' });

  verify(fragment: string | null): Promise<VerificationOutcome> {
    this.calls.push(fragment);
    return this.answer(fragment);
  }
}

describe('Given the verification page', () => {
  let harness: RouterTestingHarness;
  let verifier: FakeVerifier;

  beforeEach(() => {
    verifier = new FakeVerifier();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'overit', component: VerificationPage }]),
        { provide: ReceiptVerifier, useValue: verifier },
      ],
    });
  });

  async function open(url: string, outcome?: VerificationOutcome): Promise<void> {
    if (outcome !== undefined) {
      verifier.answer = () => Promise.resolve(outcome);
    }
    harness = await RouterTestingHarness.create(url);
    await settle();
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      harness.detectChanges();
      await harness.fixture.whenStable();
    }
  }

  function root(): HTMLElement {
    return harness.routeNativeElement as HTMLElement;
  }

  function text(selector: string): string {
    return root().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function heading(): HTMLElement {
    return root().querySelector('h1') as HTMLElement;
  }

  function data(): Record<string, string> {
    const terms = Array.from(root().querySelectorAll('dt'));
    return Object.fromEntries(
      terms.map((term) => [
        term.textContent?.trim() ?? '',
        term.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      ]),
    );
  }

  it('when it opens without a code, then it explains how verification works and verifies nothing', async () => {
    await open('/overit');

    expect(heading().textContent?.trim()).toBe('Ověření potvrzení o daru');
    expect(text('.verify-lead')).toContain('QR kód');
    expect(text('.verify-domain')).toBe(
      'Fond ověřuje potvrzení jen na adrese nfnn.cz/overit. Zkontrolujte, že ji máte v adresním řádku prohlížeče.',
    );
    expect(verifier.calls).toEqual([null]);
  });

  it('when it opens, then search engines are asked not to index it, and leaving it lifts that', async () => {
    await open('/overit');
    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');

    harness.fixture.destroy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('when it opens with a code, then it reads the code once and drops it from the address', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'active' });

    expect(verifier.calls).toEqual([FRAGMENT]);
    expect(TestBed.inject(Location).path(true)).toBe('/overit');
  });

  it('when the check is still running, then it says so in a status line', async () => {
    verifier.answer = () => new Promise(() => undefined);
    await open(`/overit#${FRAGMENT}`);

    expect(heading().textContent?.trim()).toBe('Ověřujeme potvrzení…');
    expect(root().querySelector('[role="status"]')?.textContent).toContain(
      'Kontrolujeme podpis fondu',
    );
  });

  describe('when a single receipt is signed and the fund keeps it as valid', () => {
    beforeEach(() =>
      open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'active' }),
    );

    it('then the heading says the fund signed it, takes the focus and the status line follows', () => {
      expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
      expect(document.activeElement).toBe(heading());
      expect(text('.verify-lead')).toBe(
        'Údaje v tomto kódu podepsal fond Nová naděje ke dni vystavení. Porovnejte je s papírem.',
      );
      expect(text('.verify-status')).toBe('Fond toto potvrzení vede jako platné.');
      expect(root().querySelector('.ui-status__icon--success')).not.toBeNull();
    });

    it('then the signed data are listed as on paper', () => {
      expect(data()).toEqual({
        'Číslo potvrzení': '2026-000042',
        Vystaveno: '05. 11. 2026',
        Dárce: 'Marie Dvořáková',
        Adresa: 'Lipová 12, 460 01 Liberec',
        'Dar ze dne': '03. 11. 2026',
        Částka: '2 500 Kč',
      });
      expect(root().querySelector('table')).toBeNull();
    });

    it('then it says what left the device for the status check', () => {
      expect(text('.verify-local')).toBe(
        'Podpis jsme ověřili ve vašem zařízení. Fondu jsme poslali jen otisk podepsaných údajů, aby nám sdělil stav potvrzení; jméno, adresa ani částky se nikam neposílají.',
      );
    });

    it('then the word "pravé" stands nowhere on the page', () => {
      expect(root().textContent).not.toMatch(/pravé/i);
    });
  });

  it('when a yearly receipt of a company that replaces another is signed, then every gift, the identifier and the replaced receipt are listed', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: YEARLY, status: 'active' });

    expect(data()).toEqual({
      'Číslo potvrzení': '2027-000007',
      Vystaveno: '15. 01. 2027',
      'Nahrazuje potvrzení': '2026-000042 ze dne 05. 11. 2026',
      Dárce: 'Acme s.r.o.',
      IČO: '25596641',
      Adresa: 'Lipová 12, 460 01 Liberec',
      'Za rok': '2026',
      Celkem: '1 750,50 Kč',
    });
    const rows = Array.from(root().querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['15. 03. 2026', '500\u00a0Kč'],
      ['03. 11. 2026', '1\u00a0250,50\u00a0Kč'],
    ]);
    expect(text('caption')).toBe('Jednotlivé dary (2)');
  });

  it('when the receipt is signed but checked offline, then it stays signed and says a replacement cannot be seen', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'offline' });

    expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
    expect(text('.verify-status')).toBe(
      'Bez připojení nelze zjistit, zda fond potvrzení později nenahradil novějším nebo nezrušil.',
    );
    expect(text('.verify-local')).toBe(
      'Ověření proběhlo jen ve vašem zařízení; údaje z kódu se nikam neposílají.',
    );
  });

  it('when the status could not be learned, then it says so and offers to try again', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'unavailable' });

    expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
    expect(text('.verify-status')).toContain('Stav potvrzení se teď u fondu nepodařilo zjistit');
    expect(root().querySelector('button')?.textContent?.trim()).toBe('Zkusit znovu');
  });

  for (const [status, title, tone] of [
    ['replaced', 'Fond toto potvrzení nahradil novějším', 'caution'],
    ['withdrawn', 'Fond toto potvrzení zrušil', 'danger'],
    ['unknown', 'Fond toto potvrzení ve své evidenci nevede', 'caution'],
  ] as const) {
    it(`when the fund answers ${status}, then the result is not green and the heading says so`, async () => {
      await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status });

      expect(heading().textContent?.trim()).toBe(title);
      expect(root().querySelector('.ui-status__icon--success')).toBeNull();
      expect(root().querySelector(`.ui-status__icon--${tone}`)).not.toBeNull();
      expect(data()['Číslo potvrzení']).toBe('2026-000042');
    });
  }

  for (const [outcome, title, tone] of [
    [{ state: 'invalid' }, 'Neověřeno: podpis neodpovídá údajům', 'danger'],
    [{ state: 'revoked' }, 'Neověřeno: fond tento klíč zneplatnil', 'danger'],
    [
      { state: 'unknown-key', online: true },
      'Neověřeno: kód nepodepsal žádný klíč fondu',
      'danger',
    ],
    [
      { state: 'unknown-key', online: false },
      'Neověřeno: tento podpis zatím neumíme ověřit',
      'caution',
    ],
    [{ state: 'no-connection' }, 'Nelze ověřit bez připojení', 'caution'],
    [{ state: 'broken' }, 'Odkaz je neúplný', 'caution'],
    [{ state: 'newer' }, 'Tento kód je novější než stránka', 'caution'],
    [{ state: 'failed' }, 'Ověření se nepodařilo', 'caution'],
  ] as const) {
    it(`when the outcome is ${outcome.state}${'online' in outcome ? (outcome.online ? ' online' : ' offline') : ''}, then the heading reads "${title}", takes the focus and lists no data`, async () => {
      await open(`/overit#${FRAGMENT}`, outcome);

      expect(heading().textContent?.trim()).toBe(title);
      expect(document.activeElement).toBe(heading());
      expect(root().querySelector(`.ui-status__icon--${tone}`)).not.toBeNull();
      expect(root().querySelector('dl')).toBeNull();
    });
  }

  for (const state of ['no-connection', 'broken', 'newer', 'failed'] as const) {
    it(`when the outcome is ${state}, then the page does not claim that a verification took place`, async () => {
      await open(`/overit#${FRAGMENT}`, { state });

      expect(root().querySelector('.verify-local')).toBeNull();
    });
  }

  it('when the page cannot verify without a connection, then trying again verifies the same code again', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'no-connection' });
    verifier.answer = () => Promise.resolve({ state: 'signed', receipt: SINGLE, status: 'active' });

    root().querySelector<HTMLButtonElement>('button')?.click();
    await settle();

    expect(verifier.calls).toEqual([FRAGMENT, FRAGMENT]);
    expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
  });

  it('when another code arrives in the address, then that code is verified', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'broken' });

    await harness.navigateByUrl('/overit#1234');
    await settle();

    expect(verifier.calls).toEqual([FRAGMENT, '1234']);
  });
});
