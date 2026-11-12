import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { heldRecordOf } from '../../../core/version/row-version';
import { authInterceptor } from '../../../core/auth/auth-interceptor';
import { AuthStore } from '../../../core/auth/auth-store';
import { authResponse, sampleDonor } from '../../../core/auth/testing/donor-fixtures';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { DirtyForms } from '../../../core/updates/dirty-forms';
import { BankNames } from '../../donations/bank-names';
import { AdminBankLogoResponse } from '../admin-api';
import { adminBankLogo } from '../testing/admin-fixtures';
import { AdminBankLogos } from './admin-bank-logos';

const LIST_URL = '/api/admin/donations/bank-logos';
const NEW_SOURCE = 'https://is2-ssl.mzstatic.com/image/thumb/Purple/csas-new/512x512bb.jpg';
const NEWER_VERSION = '9e4b2d7c1a0f6358';

function problem(status: number, type: string, title: string, detail: string) {
  return {
    body: { type: `https://nfnn.cz/problems/${type}`, title, detail, status },
    options: {
      status,
      statusText: 'Error',
      headers: { 'Content-Type': 'application/problem+json' },
    },
  };
}

describe('Given an administrator on the bank logos page', () => {
  let fixture: ComponentFixture<AdminBankLogos>;
  let http: HttpTestingController;

  const csas = adminBankLogo();
  const fio = adminBankLogo({
    code: '2010',
    bankName: 'Fio banka, a.s.',
    sourceUrl: 'https://www.fio.cz/logo.png',
    version: '1b2c3d4e5f607182',
    imageId: null,
    imageSha256: null,
    fetchedAt: null,
    checkedAt: null,
    lastFailure: 'redirected',
  });
  const unknown = adminBankLogo({
    code: '4000',
    bankName: null,
    sourceUrl: 'https://www.example.cz/logo.png',
    sourceAllowed: false,
    version: '2c3d4e5f60718293',
    checkedAt: '2026-11-12T04:50:00Z',
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminBankLogos],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http
      .expectOne('/api/donors/auth/login')
      .flush(authResponse('token-1', sampleDonor({ roles: ['DONOR', 'ADMIN'] })));
    fixture = TestBed.createComponent(AdminBankLogos);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
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

  async function listed(items: AdminBankLogoResponse[] = [csas, fio, unknown]): Promise<void> {
    http.expectOne({ method: 'GET', url: LIST_URL }).flush({ items });
    await settle();
  }

  function element<T extends HTMLElement>(selector: string): T {
    const found = (fixture.nativeElement as HTMLElement).querySelector(selector) as T | null;
    if (found === null) {
      throw new Error(`No element matches ${selector}`);
    }
    return found;
  }

  function text(selector: string): string {
    return normalized(
      (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent ?? '',
    );
  }

  function normalized(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  function row(code: string): HTMLElement {
    return element(`[data-code="${code}"]`);
  }

  function button(within: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(within.querySelectorAll('button')).find(
      (candidate) => normalized(candidate.textContent ?? '') === name,
    );
    if (found === undefined) {
      throw new Error(`No button "${name}" in "${normalized(within.textContent ?? '')}"`);
    }
    return found;
  }

  async function type(selector: string, value: string): Promise<void> {
    const input = element<HTMLInputElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await settle();
  }

  async function submit(within: HTMLElement): Promise<void> {
    within.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  it('when the list arrives, then each bank shows its logo or monogram, its code and name, its address and how its last download went', async () => {
    expect(text('[role="status"]:not(:empty)')).toBe('Načítáme loga bank…');

    await listed();

    expect(text('h1')).toBe('Loga bank');
    expect(text('.ui-page-intro:not(.intro-lead)')).toContain(
      'nebo obrázku z webu velkých bank (Česká spořitelna, ČSOB, KB, MONETA, Fio, Air Bank, Raiffeisenbank, UniCredit, mBank)',
    );
    expect(normalized(row('0800').querySelector('.bank-title')!.textContent!)).toBe(
      '0800 · Česká spořitelna',
    );
    expect(row('0800').querySelector('app-bank-mark img')?.getAttribute('src')).toBe(
      `/api/donations/bank-logos/images/${csas.imageId}`,
    );
    expect(text('[data-code="0800"] .bank-state')).toBe('Staženo 11. 11. 2026 5:50.');
    expect(element<HTMLInputElement>('#bank-logo-source-0800').value).toBe(csas.sourceUrl);
    expect(element<HTMLInputElement>('#bank-logo-source-0800').getAttribute('enterkeyhint')).toBe(
      'send',
    );
    expect(text('label[for="bank-logo-source-0800"]')).toBe('Adresa loga');

    expect(row('2010').querySelector('app-bank-mark img')).toBeNull();
    expect(row('2010').querySelector('[data-monogram]')?.getAttribute('data-monogram')).toBe('FB');
    expect(text('[data-code="2010"] .bank-state')).toBe('Zatím nestaženo.');
    expect(text('[data-code="2010"] .bank-failure')).toBe(
      'Poslední stažení se nepovedlo: adresa přesměrovává jinam.',
    );

    expect(normalized(row('4000').querySelector('.bank-title')!.textContent!)).toBe(
      '4000 · Banka, kterou seznam ČNB nezná',
    );
    expect(text('[data-code="4000"] .bank-state')).toBe(
      'Staženo 11. 11. 2026 5:50, naposledy zkontrolováno 12. 11. 2026 5:50.',
    );
    expect(text('[data-code="4000"] .bank-not-allowed')).toContain('Adresa už není povolená');
    expect(
      Array.from(row('4000').querySelectorAll('button')).map((b) => normalized(b.textContent!)),
    ).toEqual(['Uložit a stáhnout', 'Odebrat']);
    expect(button(row('0800'), 'Stáhnout znovu')).toBeTruthy();
  });

  it('when the list arrives, then the address field and every button of a row name the bank they act on', async () => {
    await listed();

    const title = element('#bank-title-0800');
    expect(normalized(title.textContent!)).toBe('0800 · Česká spořitelna');
    expect(element('#bank-logo-source-0800').getAttribute('aria-label')).toBe(
      'Adresa loga 0800 · Česká spořitelna',
    );
    for (const name of ['Uložit a stáhnout', 'Stáhnout znovu', 'Odebrat']) {
      expect(button(row('0800'), name).getAttribute('aria-describedby')).toBe('bank-title-0800');
    }
  });

  it('when the session has ended, then the administrator is sent home to sign in', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const ended = problem(401, 'auth/unauthenticated', 'Přihlaste se', '');

    http.expectOne(LIST_URL).flush(ended.body, ended.options);
    http
      .expectOne('/api/donors/auth/logout')
      .flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(TestBed.inject(AuthStore).signedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/');
    expect(TestBed.inject(LoginDialogService).isOpen()).toBe(true);
  });

  it('when the role was taken away meanwhile, then the page goes to the overview', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const forbidden = problem(403, 'auth/forbidden', 'Nemáte oprávnění', 'Jen pro správce.');

    http.expectOne(LIST_URL).flush(forbidden.body, forbidden.options);
    await settle();

    expect(navigate).toHaveBeenCalledWith('/darce/prehled');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.ui-load-state--error'),
    ).toBeNull();
  });

  it('when no bank has a logo, then the card says so and the form to add one stays', async () => {
    await listed([]);

    expect(text('.ui-card__empty')).toBe(
      'Žádná banka zatím logo nemá. U čísel účtů se ukazují zkratky názvů bank.',
    );
    expect(element('#bank-logo-new-code')).toBeTruthy();
  });

  it('when the list cannot be loaded, then an alert offers a retry that loads again', async () => {
    http.expectOne(LIST_URL).flush(null, { status: 500, statusText: 'Error' });
    await settle();

    expect(text('.ui-load-state--error')).toContain('Loga bank se nepodařilo načíst.');
    element<HTMLButtonElement>('.ui-load-state--error button').click();
    await settle();

    await listed([csas]);
    expect(row('0800')).toBeTruthy();
  });

  it('when a new address is saved, then it goes with the version the page holds, the row shows the answer and the status says so', async () => {
    await listed();

    const forget = vi.spyOn(TestBed.inject(BankNames), 'forgetLogos');
    await type('#bank-logo-source-0800', NEW_SOURCE);
    expect(TestBed.inject(DirtyForms).any()).toBe(true);
    await submit(row('0800'));

    const request = http.expectOne({ method: 'PUT', url: `${LIST_URL}/0800` });
    expect(request.request.body).toEqual({ sourceUrl: NEW_SOURCE });
    expect(request.request.headers.get('If-Match')).toBe(`"${csas.version}"`);
    expect(heldRecordOf(request.request.context)).toEqual(csas);
    expect(button(row('0800'), 'Stahujeme…').disabled).toBe(true);
    request.flush({
      ...csas,
      sourceUrl: NEW_SOURCE,
      version: NEWER_VERSION,
      fetchedAt: '2026-11-11T09:00:00Z',
      checkedAt: '2026-11-11T09:00:00Z',
    });
    await settle();

    expect(text('.ui-notice--status')).toBe('Logo banky 0800 jsme stáhli z nové adresy a uložili.');
    expect(text('[data-code="0800"] .bank-state')).toBe('Staženo 11. 11. 2026 10:00.');
    expect(TestBed.inject(DirtyForms).any()).toBe(false);
    expect(forget).toHaveBeenCalledOnce();
  });

  it('when the address is saved unchanged, then the status says the logo was downloaded and saved without calling the address new', async () => {
    await listed();

    await submit(row('0800'));
    http
      .expectOne({ method: 'PUT', url: `${LIST_URL}/0800` })
      .flush({ ...csas, version: NEWER_VERSION });
    await settle();

    expect(text('.ui-notice--status')).toBe('Logo banky 0800 jsme znovu stáhli a uložili.');
  });

  it('when the address is empty or not https, then the field says so and nothing is sent', async () => {
    await listed();

    await type('#bank-logo-source-0800', '');
    await submit(row('0800'));
    expect(text('[data-code="0800"] app-form-field')).toContain('Vyplňte prosím adresu loga.');

    await type('#bank-logo-source-0800', 'http://is1-ssl.mzstatic.com/a.jpg');
    await submit(row('0800'));
    expect(text('[data-code="0800"] app-form-field')).toContain(
      'Adresa musí začínat https:// a nesmí obsahovat mezery.',
    );
    http.expectNone({ method: 'PUT', url: `${LIST_URL}/0800` });
  });

  it('when the server refuses the address or the download, then the field or the row says why in the words of the server', async () => {
    await listed();

    await type('#bank-logo-source-0800', 'https://www.example.cz/logo.png');
    await submit(row('0800'));
    const invalid = problem(
      400,
      'donations/bank-logo-source-invalid',
      'Tuto adresu loga nelze použít',
      'Logo banky se stahuje jen z ikon aplikací v App Store.',
    );
    http.expectOne(`${LIST_URL}/0800`).flush(invalid.body, invalid.options);
    await settle();

    expect(text('[data-code="0800"] app-form-field .field-error')).toBe(
      'Tuto adresu loga nelze použít. Logo banky se stahuje jen z ikon aplikací v App Store.',
    );
    expect(row('0800').querySelector('[role="alert"]')).toBeNull();

    button(row('0800'), 'Stáhnout znovu').click();
    await settle();
    const limited = problem(
      429,
      'donations/rate-limited',
      'Příliš mnoho pokusů',
      'Zkuste to prosím za hodinu.',
    );
    http.expectOne(`${LIST_URL}/0800/refresh`).flush(limited.body, limited.options);
    await settle();

    expect(text('[data-code="0800"] [role="alert"]')).toBe(
      'Příliš mnoho pokusů. Zkuste to prosím za hodinu.',
    );
  });

  it('when a logo is downloaded again, then the row shows the answer and the status says whether the picture changed', async () => {
    await listed();

    const forget = vi.spyOn(TestBed.inject(BankNames), 'forgetLogos');
    button(row('0800'), 'Stáhnout znovu').click();
    await settle();
    const request = http.expectOne({ method: 'POST', url: `${LIST_URL}/0800/refresh` });
    expect(button(row('0800'), 'Stahujeme…').disabled).toBe(true);
    request.flush({ ...csas, checkedAt: '2026-11-12T08:00:00Z' });
    await settle();

    expect(text('.ui-notice--status')).toBe(
      'Logo banky 0800 jsme stáhli znovu. Obrázek se nezměnil.',
    );
    expect(forget).toHaveBeenCalledOnce();
    expect(text('[data-code="0800"] .bank-state')).toBe(
      'Staženo 11. 11. 2026 5:50, naposledy zkontrolováno 12. 11. 2026 9:00.',
    );

    button(row('0800'), 'Stáhnout znovu').click();
    await settle();
    http
      .expectOne(`${LIST_URL}/0800/refresh`)
      .flush({ ...csas, imageId: '019a7c00-0000-7000-8000-0000000000bb' });
    await settle();

    expect(text('.ui-notice--status')).toBe('Logo banky 0800 jsme stáhli znovu. Obrázek je nový.');
  });

  it('when a logo is added for another bank code, then it is created only if none exists and the new row is shown', async () => {
    await listed([csas]);

    await type('#bank-logo-new-code', '0800');
    await type('#bank-logo-new-source', NEW_SOURCE);
    await submit(element('.add-card'));
    expect(text('.add-card app-form-field .field-error')).toBe(
      'Banka 0800 už logo má. Adresu změňte v jejím řádku výše.',
    );
    expect(element('#bank-logo-new-code').getAttribute('aria-invalid')).toBe('true');
    expect(element('.add-card').querySelector('[role="alert"]')).toBeNull();
    http.expectNone({ method: 'PUT', url: `${LIST_URL}/0800` });

    await type('#bank-logo-new-code', '0100');
    await submit(element('.add-card'));
    const request = http.expectOne({ method: 'PUT', url: `${LIST_URL}/0100` });
    expect(request.request.headers.get('If-None-Match')).toBe('*');
    expect(request.request.headers.has('If-Match')).toBe(false);
    expect(request.request.body).toEqual({ sourceUrl: NEW_SOURCE });
    request.flush(
      adminBankLogo({ code: '0100', bankName: 'Komerční banka, a.s.', sourceUrl: NEW_SOURCE }),
    );
    await settle();

    expect(text('.ui-notice--status')).toBe('Logo banky 0100 jsme stáhli a uložili.');
    expect(normalized(row('0100').querySelector('.bank-title')!.textContent!)).toBe(
      '0100 · Komerční banka',
    );
    expect(element<HTMLInputElement>('#bank-logo-new-code').value).toBe('');
  });

  it('when the new bank code is not four digits, then the field says so and nothing is sent', async () => {
    await listed([csas]);

    await type('#bank-logo-new-code', '80');
    await type('#bank-logo-new-source', NEW_SOURCE);
    await submit(element('.add-card'));

    expect(text('.add-card app-form-field')).toContain('Kód banky má čtyři číslice, třeba 0800.');
    http.expectNone({ method: 'PUT', url: `${LIST_URL}/80` });
  });

  describe('when a logo is to be removed', () => {
    beforeEach(async () => {
      await listed();
      button(row('0800'), 'Odebrat').click();
      await settle();
    });

    function dialog(): HTMLElement {
      return element('.remove-dialog dialog');
    }

    it('then a dialog asks first and cancelling sends nothing', async () => {
      expect(normalized(dialog().textContent!)).toContain('Odebrat logo banky 0800?');
      button(dialog(), 'Zrušit').click();
      await settle();

      expect((fixture.nativeElement as HTMLElement).querySelector('.remove-dialog')).toBeNull();
    });

    it('then confirming deletes it with its version, the row goes and the status says so', async () => {
      const forget = vi.spyOn(TestBed.inject(BankNames), 'forgetLogos');
      button(dialog(), 'Odebrat logo').click();
      await settle();

      const request = http.expectOne({ method: 'DELETE', url: `${LIST_URL}/0800` });
      expect(request.request.headers.get('If-Match')).toBe(`"${csas.version}"`);
      expect(button(dialog(), 'Odebíráme…').disabled).toBe(true);
      request.flush(null, { status: 204, statusText: 'No Content' });
      await settle();

      expect((fixture.nativeElement as HTMLElement).querySelector('[data-code="0800"]')).toBeNull();
      expect(text('.ui-notice--status')).toBe(
        'Logo banky 0800 jsme odebrali. U jejích účtů se teď ukazuje zkratka názvu.',
      );
      expect(forget).toHaveBeenCalledOnce();
    });

    it('then a logo someone else removed meanwhile closes the dialog, the page says so in an alert and reads the list again', async () => {
      button(dialog(), 'Odebrat logo').click();
      await settle();
      const gone = problem(
        404,
        'donations/bank-logo-not-found',
        'Logo banky nenalezeno',
        'Pro tuto banku není nastavené žádné logo.',
      );
      http.expectOne({ method: 'DELETE', url: `${LIST_URL}/0800` }).flush(gone.body, gone.options);
      await settle();

      expect((fixture.nativeElement as HTMLElement).querySelector('.remove-dialog')).toBeNull();
      expect(text('.ui-notice--alert')).toBe(
        'Logo banky nenalezeno. Pro tuto banku není nastavené žádné logo.',
      );
      await listed([fio, unknown]);
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-code="0800"]')).toBeNull();
      expect(document.activeElement).toBe(element('app-live-notice'));
    });

    it('then a refusal other than a stale version stays in the dialog', async () => {
      button(dialog(), 'Odebrat logo').click();
      await settle();
      http.expectOne(`${LIST_URL}/0800`).flush(null, { status: 500, statusText: 'Error' });
      await settle();

      expect(text('.remove-dialog [role="alert"]')).toBe(
        'Logo se nepodařilo odebrat. Zkuste to prosím znovu.',
      );
    });
  });

  describe('when someone else changed the logo while the page was open', () => {
    beforeEach(async () => {
      await listed();
      await type('#bank-logo-source-0800', NEW_SOURCE);
      await submit(row('0800'));
      const refusal = problem(409, 'donations/changed-meanwhile', 'Mezitím se to změnilo', '');
      http
        .expectOne(`${LIST_URL}/0800`)
        .flush(
          { ...refusal.body, version: NEWER_VERSION, current: { ...csas, version: NEWER_VERSION } },
          refusal.options,
        );
      await settle();
    });

    it('then the sheet keeps the address in the form and saving it again sends the newer version', async () => {
      const sheet = element('app-changed-meanwhile-dialog dialog');
      expect(sheet.textContent).toContain('zůstávají ve formuláři');
      expect(element<HTMLInputElement>('#bank-logo-source-0800').value).toBe(NEW_SOURCE);

      button(sheet, 'Uložit svou verzi místo novější').click();
      await settle();
      const request = http.expectOne({ method: 'PUT', url: `${LIST_URL}/0800` });
      expect(request.request.headers.get('If-Match')).toBe(`"${NEWER_VERSION}"`);
      expect(request.request.body).toEqual({ sourceUrl: NEW_SOURCE });
      request.flush({ ...csas, sourceUrl: NEW_SOURCE, version: '0f0f0f0f0f0f0f0f' });
      await settle();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('app-changed-meanwhile-dialog'),
      ).toBeNull();
      expect(text('.ui-notice--status')).toBe(
        'Logo banky 0800 jsme stáhli z nové adresy a uložili.',
      );
    });

    it('then discarding reads the list again and the form shows what is stored', async () => {
      button(
        element('app-changed-meanwhile-dialog dialog'),
        'Zahodit své úpravy a načíst novější verzi',
      ).click();
      await settle();
      expect(row('0800')).toBeTruthy();
      expect(text('.ui-card [role="status"]')).toBe('');
      await listed([{ ...csas, version: NEWER_VERSION }]);

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('app-changed-meanwhile-dialog'),
      ).toBeNull();
      expect(element<HTMLInputElement>('#bank-logo-source-0800').value).toBe(csas.sourceUrl);
      expect(TestBed.inject(DirtyForms).any()).toBe(false);
      expect(document.activeElement).toBe(element('#bank-logo-source-0800'));
    });
  });

  it('when a saved logo is gone meanwhile, then the page says so in an alert and reads the list again', async () => {
    await listed([csas]);
    await type('#bank-logo-source-0800', NEW_SOURCE);
    await submit(row('0800'));
    const gone = problem(
      404,
      'donations/bank-logo-not-found',
      'Logo banky nenalezeno',
      'Pro tuto banku není nastavené žádné logo.',
    );
    http.expectOne(`${LIST_URL}/0800`).flush(gone.body, gone.options);
    await settle();

    expect(text('.ui-notice--alert')).toBe(
      'Logo banky nenalezeno. Pro tuto banku není nastavené žádné logo.',
    );
    expect(row('0800')).toBeTruthy();
    await listed([]);
    expect(text('.ui-card__empty')).toContain('Žádná banka zatím logo nemá.');
    expect(document.activeElement).toBe(element('app-live-notice'));
  });

  it('when a new address finds the logo changed and without a version in the refusal, then the sheet offers only to read the list again', async () => {
    await listed([csas]);
    await type('#bank-logo-source-0800', NEW_SOURCE);
    await submit(row('0800'));
    const refusal = problem(409, 'donations/changed-meanwhile', 'Mezitím se to změnilo', '');
    http.expectOne({ method: 'PUT', url: `${LIST_URL}/0800` }).flush(refusal.body, refusal.options);
    await settle();

    const sheet = element('app-changed-meanwhile-dialog dialog');
    expect(sheet.textContent).not.toContain('Uložit svou verzi');
    button(sheet, 'Načíst aktuální stav').click();
    await settle();
    await listed([{ ...csas, version: NEWER_VERSION }]);

    expect(element<HTMLInputElement>('#bank-logo-source-0800').value).toBe(csas.sourceUrl);
  });

  it('when a logo is added for a code someone else gave a logo meanwhile, then the sheet offers to save it over that newer version', async () => {
    await listed([csas]);
    await type('#bank-logo-new-code', '0100');
    await type('#bank-logo-new-source', NEW_SOURCE);
    await submit(element('.add-card'));
    const refusal = problem(409, 'donations/changed-meanwhile', 'Mezitím se to změnilo', '');
    const kb = adminBankLogo({
      code: '0100',
      bankName: 'Komerční banka, a.s.',
      version: NEWER_VERSION,
    });
    http
      .expectOne({ method: 'PUT', url: `${LIST_URL}/0100` })
      .flush({ ...refusal.body, version: NEWER_VERSION, current: kb }, refusal.options);
    await settle();

    button(
      element('app-changed-meanwhile-dialog dialog'),
      'Uložit svou verzi místo novější',
    ).click();
    await settle();
    const request = http.expectOne({ method: 'PUT', url: `${LIST_URL}/0100` });
    expect(request.request.headers.get('If-Match')).toBe(`"${NEWER_VERSION}"`);
    expect(request.request.headers.has('If-None-Match')).toBe(false);
    expect(request.request.body).toEqual({ sourceUrl: NEW_SOURCE });
    request.flush({ ...kb, sourceUrl: NEW_SOURCE, version: '0f0f0f0f0f0f0f0f' });
    await settle();

    expect(normalized(row('0100').querySelector('.bank-title')!.textContent!)).toBe(
      '0100 · Komerční banka',
    );
    expect(text('.ui-notice--status')).toBe('Logo banky 0100 jsme stáhli a uložili.');
  });

  it('when a removal finds another version, then the refusal without a version offers only to read the list again', async () => {
    await listed([csas]);
    button(row('0800'), 'Odebrat').click();
    await settle();
    button(element('.remove-dialog dialog'), 'Odebrat logo').click();
    await settle();
    const refusal = problem(409, 'donations/changed-meanwhile', 'Mezitím se to změnilo', '');
    http.expectOne(`${LIST_URL}/0800`).flush(refusal.body, refusal.options);
    await settle();

    const sheet = element('app-changed-meanwhile-dialog dialog');
    expect(sheet.textContent).not.toContain('Uložit svou verzi');
    button(sheet, 'Načíst aktuální stav').click();
    await settle();
    await listed([]);

    expect(text('.ui-card__empty')).toContain('Žádná banka zatím logo nemá.');
  });
});
