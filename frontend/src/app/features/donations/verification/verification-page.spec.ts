import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { SignedReceipt } from './receipt-proof';
import {
  ReceiptVerifier,
  type VerificationOutcome,
  type VerificationStep,
} from './receipt-verifier';
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

const GREEN = '✓';
const AMBER = '!';
const RED = '×';

class FakeVerifier {
  readonly calls: (string | null)[] = [];
  progress: (step: VerificationStep) => void = () => undefined;
  answer: (fragment: string | null) => Promise<VerificationOutcome> = () =>
    Promise.resolve({ state: 'empty' });

  verify(
    fragment: string | null,
    progress: (step: VerificationStep) => void,
  ): Promise<VerificationOutcome> {
    this.calls.push(fragment);
    this.progress = progress;
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

  function tone(): string {
    return text('.ui-status [aria-hidden="true"]');
  }

  function lead(): string {
    return (
      root().querySelector('h1')?.nextElementSibling?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );
  }

  function button(name: string): HTMLButtonElement | undefined {
    return Array.from(root().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );
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

  describe('when the check is still running', () => {
    beforeEach(async () => {
      verifier.answer = () => new Promise(() => undefined);
      await open(`/overit#${FRAGMENT}`);
    });

    it('then it says so in a status line', () => {
      expect(heading().textContent?.trim()).toBe('Ověřujeme potvrzení…');
      expect(root().querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Kontrolujeme podpis fondu v kódu z potvrzení.',
      );
    });

    it('and the signature has passed, then the same status line says the fund is being asked', async () => {
      const line = root().querySelector('[role="status"]');

      verifier.progress('asking-status');
      await settle();

      expect(root().querySelector('[role="status"]')).toBe(line);
      expect(line?.textContent?.trim()).toBe('Podpis sedí, ptáme se fondu na stav potvrzení…');
    });
  });

  describe('when a single receipt is signed and the fund keeps it as valid', () => {
    beforeEach(() =>
      open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'active' }),
    );

    it('then the heading says the fund signed it, takes the focus and the status line follows', () => {
      expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
      expect(document.activeElement).toBe(heading());
      expect(lead()).toBe(
        'Údaje v tomto kódu podepsal fond Nová naděje ke dni vystavení. Porovnejte je s papírem.',
      );
      expect(root().textContent).toContain('Fond toto potvrzení vede jako platné.');
      expect(tone()).toBe(GREEN);
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
      expect(root().textContent?.replace(/\s+/g, ' ')).toContain(
        'Podpis jsme ověřili ve vašem zařízení. Fondu jsme poslali jen otisk podepsaných údajů, aby nám sdělil stav potvrzení; jméno, adresa ani částky se nikam neposílají.',
      );
    });

    it('then the word "pravé" stands nowhere on the page', () => {
      expect(root().textContent).not.toMatch(/pravé/i);
    });
  });

  it('when a yearly receipt of a company that replaces another is signed, then every gift, the identifier and the replaced receipt are listed, each amount named by its day', async () => {
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
      Array.from(row.children).map((cell) => [
        cell.tagName.toLowerCase(),
        cell.getAttribute('scope'),
        cell.textContent?.trim(),
      ]),
    );
    expect(rows).toEqual([
      [
        ['th', 'row', '15. 03. 2026'],
        ['td', null, '500 Kč'],
      ],
      [
        ['th', 'row', '03. 11. 2026'],
        ['td', null, '1 250,50 Kč'],
      ],
    ]);
    expect(text('caption')).toBe('Jednotlivé dary (2)');
  });

  it('when the receipt is signed but checked offline, then it stays signed and says a replacement cannot be seen', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'offline' });

    expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
    expect(tone()).toBe(GREEN);
    const page = root().textContent?.replace(/\s+/g, ' ');
    expect(page).toContain(
      'Bez připojení nelze zjistit, zda fond potvrzení později nenahradil novějším nebo nezrušil.',
    );
    expect(page).toContain(
      'Ověření proběhlo jen ve vašem zařízení; údaje z kódu se nikam neposílají.',
    );
    expect(page).not.toContain('Fondu jsme poslali');
  });

  describe('when the signature holds but the fund gave no usable answer', () => {
    beforeEach(() =>
      open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status: 'no-answer' }),
    );

    it('then the result is not green, the heading says the fund did not answer and the data are listed', () => {
      expect(heading().textContent?.trim()).toBe(
        'Podpis sedí, ale fond teď neodpověděl, zda potvrzení vede',
      );
      expect(tone()).toBe(AMBER);
      expect(lead()).toBe(
        'Údaje v tomto kódu podepsal fond Nová naděje, fond ale teď neodpověděl, zda potvrzení vede jako platné. Dokud neodpoví, nevíte, zda ho nenahradil novějším nebo nezrušil. Zkuste to za chvíli znovu.',
      );
      expect(data()['Číslo potvrzení']).toBe('2026-000042');
      expect(button('Zkusit znovu')).toBeDefined();
    });

    it('then it does not claim that the digest reached the fund', () => {
      const page = root().textContent?.replace(/\s+/g, ' ');
      expect(page).not.toContain('Fondu jsme poslali');
      expect(page).toContain(
        'Ověření proběhlo jen ve vašem zařízení; údaje z kódu se nikam neposílají.',
      );
    });
  });

  for (const [status, title, glyph] of [
    ['replaced', 'Fond toto potvrzení nahradil novějším', AMBER],
    ['withdrawn', 'Fond toto potvrzení zrušil', RED],
    ['unknown', 'Fond toto potvrzení ve své evidenci nevede', AMBER],
  ] as const) {
    it(`when the fund answers ${status}, then the result is not green and the heading says so`, async () => {
      await open(`/overit#${FRAGMENT}`, { state: 'signed', receipt: SINGLE, status });

      expect(heading().textContent?.trim()).toBe(title);
      expect(tone()).toBe(glyph);
      expect(data()['Číslo potvrzení']).toBe('2026-000042');
    });
  }

  for (const [outcome, title, copy, glyph, retry] of [
    [
      { state: 'invalid' },
      'Neověřeno: podpis neodpovídá údajům',
      'Tento kód fond nepodepsal, nebo v něm někdo údaje změnil. Potvrzení nepovažujte za ověřené. Máte-li pochybnost, napište na info@nfnn.cz s číslem potvrzení.',
      RED,
      false,
    ],
    [
      { state: 'revoked' },
      'Neověřeno: fond tento klíč zneplatnil',
      'Kód je podepsaný klíčem, který fond přestal používat, protože se mohl dostat do cizích rukou. Potvrzení nepovažujte za ověřené a požádejte fond o nové na info@nfnn.cz.',
      RED,
      false,
    ],
    [
      { state: 'unknown-key', reach: 'online' },
      'Neověřeno: kód podepsal klíč, který fond nezveřejnil',
      'Fond takový klíč mezi svými klíči nemá. Potvrzení nepovažujte za ověřené. Máte-li pochybnost, napište na info@nfnn.cz s číslem potvrzení.',
      RED,
      false,
    ],
    [
      { state: 'unknown-key', reach: 'offline' },
      'Neověřeno: tento podpis zatím neumíme ověřit',
      'Kód podepsal klíč, který tato stránka zatím nezná. Připojte se k internetu a zkuste to znovu.',
      AMBER,
      true,
    ],
    [
      { state: 'unknown-key', reach: 'no-answer' },
      'Neověřeno: tento podpis zatím neumíme ověřit',
      'Kód podepsal klíč, který tato stránka zatím nezná, a fond teď neposlal svůj seznam klíčů. Zkuste to za chvíli znovu.',
      AMBER,
      true,
    ],
    [
      { state: 'no-connection' },
      'Nelze ověřit bez připojení',
      'Stránka potřebuje načíst klíče fondu, a to jde jen s připojením. Připojte se k internetu a zkuste to znovu.',
      AMBER,
      true,
    ],
    [
      { state: 'no-answer' },
      'Ověření teď nejde dokončit',
      'Stránka teď nedostala od fondu klíče k ověření podpisu. Zkuste to za chvíli znovu.',
      AMBER,
      true,
    ],
    [
      { state: 'broken' },
      'Odkaz je neúplný',
      'Kód se nepřečetl celý, nebo je adresa opsaná s chybou. Naskenujte ho znovu, blíž a se světlem.',
      AMBER,
      false,
    ],
    [
      { state: 'newer' },
      'Tento kód je novější než stránka',
      'Načtěte stránku znovu s připojením a naskenujte kód ještě jednou. Když to nepomůže, napište na info@nfnn.cz.',
      AMBER,
      false,
    ],
    [
      { state: 'failed' },
      'Ověření se nepodařilo',
      'Tento prohlížeč podpis nedokázal zkontrolovat. Zkuste to znovu, případně v jiném prohlížeči.',
      AMBER,
      true,
    ],
  ] as const) {
    it(`when the outcome is ${outcome.state}${'reach' in outcome ? ` (${outcome.reach})` : ''}, then the heading reads "${title}", takes the focus, says what to do and lists no data`, async () => {
      await open(`/overit#${FRAGMENT}`, outcome);

      expect(heading().textContent?.trim()).toBe(title);
      expect(document.activeElement).toBe(heading());
      expect(lead()).toBe(copy);
      expect(tone()).toBe(glyph);
      expect(button('Zkusit znovu') !== undefined).toBe(retry);
      expect(root().querySelector('dl')).toBeNull();
    });
  }

  for (const state of ['no-connection', 'no-answer', 'broken', 'newer', 'failed'] as const) {
    it(`when the outcome is ${state}, then the page does not claim that a verification took place`, async () => {
      await open(`/overit#${FRAGMENT}`, { state });

      expect(root().textContent).not.toContain('ve vašem zařízení');
    });
  }

  it('when the page cannot verify without a connection, then trying again verifies the same code again with the focus on the checking heading', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'no-connection' });
    let answer: (outcome: VerificationOutcome) => void = () => undefined;
    verifier.answer = () => new Promise((resolve) => (answer = resolve));

    button('Zkusit znovu')?.click();
    await settle();

    expect(heading().textContent?.trim()).toBe('Ověřujeme potvrzení…');
    expect(document.activeElement).toBe(heading());

    answer({ state: 'signed', receipt: SINGLE, status: 'active' });
    await settle();

    expect(verifier.calls).toEqual([FRAGMENT, FRAGMENT]);
    expect(heading().textContent?.trim()).toBe('Podepsáno fondem Nová naděje');
    expect(document.activeElement).toBe(heading());
  });

  it('when another code arrives in the address, then that code is verified', async () => {
    await open(`/overit#${FRAGMENT}`, { state: 'broken' });

    await harness.navigateByUrl('/overit#1234');
    await settle();

    expect(verifier.calls).toEqual([FRAGMENT, '1234']);
  });
});
