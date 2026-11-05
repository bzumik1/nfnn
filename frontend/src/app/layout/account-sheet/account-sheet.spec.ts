import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { Donor } from '../../core/auth/donor';
import { sampleDonor } from '../../core/auth/testing/donor-fixtures';
import { SignedOutNotice } from '../../core/auth/signed-out-notice';
import { CompactLayout } from '../../core/layout/compact-layout';
import { APP_DEPTH_KEY } from '../../core/navigation/back-target';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { FakeDialogHistory } from '../../shared/ui/dialog/testing/fake-dialog-history';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppInstall, InstallWay } from '../../core/install/app-install';
import { AccountSheet } from './account-sheet';

describe('Given the account sheet of a signed-in donor', () => {
  const donor = signal<Donor | null>(null);
  const admin = signal(false);
  const compact = signal(true);
  const logout = vi.fn(() => of(undefined));
  const installWay = signal<InstallWay>('none');
  const install = vi.fn(() => Promise.resolve('accepted' as const));
  let fixture: ComponentFixture<AccountSheet>;
  let history: FakeDialogHistory;
  let closed: number;

  beforeEach(async () => {
    donor.set(sampleDonor({ name: 'Jana Nováková', variableSymbol: '1234567890' }));
    admin.set(false);
    compact.set(true);
    logout.mockClear();
    installWay.set('none');
    install.mockClear();
    await TestBed.configureTestingModule({
      imports: [AccountSheet],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: DialogHistory, useClass: FakeDialogHistory },
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        { provide: AppInstall, useValue: { way: installWay.asReadonly(), install } },
        {
          provide: AuthStore,
          useValue: { donor: donor.asReadonly(), isAdmin: admin.asReadonly(), logout },
        },
      ],
    }).compileComponents();
    history = TestBed.inject(DialogHistory) as unknown as FakeDialogHistory;
  });

  function open(): HTMLElement {
    fixture = TestBed.createComponent(AccountSheet);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(sheet: HTMLElement): string[] {
    return Array.from(sheet.querySelectorAll('nav a')).map(
      (link) => link.querySelector('.ui-list__title')?.textContent?.trim() ?? '',
    );
  }

  it('when it opens, then it names the donor and their variable symbol over the sections of the account', () => {
    const sheet = open();

    expect(sheet.querySelector('#account-sheet-title')?.textContent?.trim()).toBe('Jana Nováková');
    expect(sheet.querySelector('.account-symbol')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Variabilní symbol 1234567890',
    );
    expect(sheet.querySelector('.account-initials')?.textContent?.trim()).toBe('JN');
    expect(rows(sheet)).toEqual([
      'Můj přehled',
      'Moje dary',
      'Potvrzení o daru',
      'Bankovní účty',
      'Údaje a zabezpečení',
    ]);
    expect(sheet.querySelector('.account-sign-out')?.textContent?.trim()).toBe('Odhlásit se');
  });

  it('when a question waits under Bankovní účty, then that row shows how many and names them', () => {
    TestBed.inject(AccountBadges).show('/darce/ucty', {
      count: 2,
      description: '2 otázky čekají na odpověď',
    });

    const sheet = open();
    const row = sheet.querySelector('nav a[href="/darce/ucty"]')!;

    expect(row.querySelector('.account-count')?.textContent?.trim()).toBe('2');
    expect(row.querySelector('.account-count')?.getAttribute('aria-hidden')).toBe('true');
    expect(row.querySelector('.visually-hidden')?.textContent?.trim()).toBe(
      '2 otázky čekají na odpověď',
    );
    expect(sheet.querySelectorAll('nav .account-count')).toHaveLength(1);
  });

  it('when the header hands it the portrait of the administrator, then the head shows it in place of the initials', () => {
    fixture = TestBed.createComponent(AccountSheet);
    fixture.componentRef.setInput('portrait', '/api/content/media/portrait?w=480');
    fixture.detectChanges();
    const sheet = fixture.nativeElement as HTMLElement;

    expect(sheet.querySelector('.account-initials img')?.getAttribute('src')).toBe(
      '/api/content/media/portrait?w=480',
    );
    expect(sheet.querySelector('.account-initials')?.textContent?.trim()).toBe('');
  });

  it('when the donor is an administrator, then the sheet also leads to the administration, named as theirs alone', () => {
    admin.set(true);

    const sheet = open();

    expect(rows(sheet).at(-1)).toBe('Správa');
    expect(sheet.querySelector('a[href="/sprava"] .account-note')?.textContent?.trim()).toBe(
      'jen správci',
    );
  });

  it('when it opens on a phone, then it slides up as a sheet, and on a computer it stays a centred dialog', () => {
    expect(open().querySelector('dialog')?.getAttribute('data-presentation')).toBe('sheet');
    fixture.destroy();

    compact.set(false);

    expect(open().querySelector('dialog')?.getAttribute('data-presentation')).toBe('centered');
  });

  it('when no name is kept, then the sheet is named Účet and shows a person instead of initials', () => {
    donor.set(sampleDonor({ name: '' }));

    const sheet = open();

    expect(sheet.querySelector('#account-sheet-title')?.textContent?.trim()).toBe('Účet');
    expect(sheet.querySelector('.account-initials svg')).not.toBeNull();
  });

  it('when the site already runs as an app or cannot be added, then the sheet offers no Přidat na plochu', () => {
    const sheet = open();

    expect(sheet.querySelector('.account-install')).toBeNull();
  });

  it('when the browser can install the site, then Přidat na plochu closes the sheet and asks the browser to install it', async () => {
    installWay.set('prompt');
    const sheet = open();
    const row = sheet.querySelector<HTMLButtonElement>('.account-install button')!;

    expect(row.textContent?.replace(/\s+/g, ' ').trim()).toBe('Přidat na plochu');

    row.click();
    await fixture.whenStable();

    expect(install).toHaveBeenCalledOnce();
    expect(closed).toBe(1);
  });

  it('when the site runs in Safari on an iPhone, then Přidat na plochu unfolds how to add it from the share menu', () => {
    installWay.set('ios-share');
    const sheet = open();
    const row = sheet.querySelector<HTMLButtonElement>('.account-install button')!;

    expect(row.getAttribute('aria-expanded')).toBe('false');

    row.click();
    fixture.detectChanges();

    expect(row.getAttribute('aria-expanded')).toBe('true');
    const how = sheet.querySelector(`#${row.getAttribute('aria-controls')}`);
    expect(how?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Klepněte na Sdílet (v Safari ho najdete i pod tlačítkem ⋯) a pak na Přidat na plochu. V aplikaci se přihlásíte ještě jednou.',
    );
    expect(install).not.toHaveBeenCalled();
    expect(closed).toBe(0);
  });

  it('when the site runs in Safari on a Mac, then Přidat na plochu unfolds how to add it to the Dock', () => {
    installWay.set('mac-dock');
    const sheet = open();
    const row = sheet.querySelector<HTMLButtonElement>('.account-install button')!;

    row.click();
    fixture.detectChanges();

    expect(
      sheet
        .querySelector(`#${row.getAttribute('aria-controls')}`)
        ?.textContent?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'V Safari zvolte v nabídce Soubor položku Přidat do Docku. V aplikaci se přihlásíte ještě jednou.',
    );
  });

  it('when a section is chosen, then the sheet hands its history entry to that page, one level deeper, and closes', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a[href="/darce/potvrzeni"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(history.handedOver).toEqual(['/darce/potvrzeni']);
    expect(closed).toBe(1);
    expect(navigate).toHaveBeenCalledWith('/darce/potvrzeni', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: 1 },
    });
  });

  it('when the section already open is chosen, then the sheet only closes and the row says it is the current page', async () => {
    await TestBed.inject(Router).navigateByUrl('/darce/ucty');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();
    const row = sheet.querySelector<HTMLAnchorElement>('nav a[href="/darce/ucty"]')!;

    expect(row.getAttribute('aria-current')).toBe('page');
    expect(sheet.querySelectorAll('nav a[aria-current]')).toHaveLength(1);

    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(history.handedOver).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(closed).toBe(1);
  });

  it('when the sheet kept no history entry of its own, then a chosen section opens as a new entry over the page under it', async () => {
    history.ownsEntry = false;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a[href="/darce/potvrzeni"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/darce/potvrzeni');
  });

  it('when it opens, then under the sign-out it names how to reach the foundation, its register entry and the privacy policy', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();
    const foundation = sheet.querySelector('.account-foundation')!;

    expect(foundation.querySelector('a[href="mailto:info@nfnn.cz"]')?.textContent?.trim()).toBe(
      'info@nfnn.cz',
    );
    expect(foundation.textContent?.replace(/\s+/g, ' ')).toContain(
      'Zapsán u KS Ústí nad Labem, oddíl N, vložka 78 · IČO 27278794',
    );
    expect(foundation.querySelector('a[href="/o-nas#kontakt"]')?.textContent?.trim()).toBe(
      'Kontakt',
    );
    const privacy = foundation.querySelector<HTMLAnchorElement>(
      'a[href="/zasady-ochrany-osobnich-udaju"]',
    )!;
    expect(privacy.textContent?.trim()).toBe('Zásady ochrany osobních údajů');

    privacy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(closed).toBe(1);
    expect(navigate).toHaveBeenCalledWith('/zasady-ochrany-osobnich-udaju', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: 1 },
    });
  });

  it('when the donor signs out on the home page, then the session ends and the sheet only closes over it', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet.querySelector<HTMLButtonElement>('.account-sign-out')!.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(SignedOutNotice).shown()).toBe(true);
    expect(closed).toBe(1);
  });

  it('when the donor signs out, then the session ends, the home page opens and says they were signed out', async () => {
    await TestBed.inject(Router).navigateByUrl('/o-nas');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet.querySelector<HTMLButtonElement>('.account-sign-out')!.click();
    await fixture.whenStable();

    expect(logout).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/', expect.objectContaining({ replaceUrl: true }));
    expect(TestBed.inject(SignedOutNotice).shown()).toBe(true);
    expect(closed).toBe(1);
  });
});
