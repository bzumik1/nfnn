import { APPEARANCE_STORAGE_KEY } from '../../core/appearance/appearance';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { Component, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
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
import { OpenAlerts } from '../../core/push/open-alerts';
import { OpenAlert } from '../../core/push/open-alerts-api';
import { AccountSheet } from './account-sheet';
import { ACCOUNT_SECTION_PAGES, AccountSectionPages } from './account-section';

@Component({
  imports: [FormsModule],
  template: `<p class="stub-page">Obsah sekce</p>
    <a class="stub-gifts" href="/darce/dary">Moje dary</a>
    <a class="stub-elsewhere" href="/overit">Ověřit potvrzení</a>
    <form class="stub-form"><input class="stub-input" name="note" ngModel /></form>`,
})
class StubSection {}

function sectionPages(): AccountSectionPages {
  return {
    '/darce/prehled': () => Promise.resolve(StubSection),
    '/darce/dary': () => Promise.resolve(StubSection),
    '/darce/potvrzeni': () => Promise.resolve(StubSection),
    '/darce/ucty': () => Promise.resolve(StubSection),
    '/darce/udaje': () => Promise.resolve(StubSection),
  };
}

describe('Given the account sheet of a signed-in donor', () => {
  const donor = signal<Donor | null>(null);
  const admin = signal(false);
  const openAlerts = signal<readonly OpenAlert[] | null>(null);
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
    openAlerts.set(null);
    compact.set(true);
    logout.mockClear();
    installWay.set('none');
    install.mockClear();
    await TestBed.configureTestingModule({
      imports: [AccountSheet],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: DialogHistory, useClass: FakeDialogHistory },
        { provide: ACCOUNT_SECTION_PAGES, useFactory: sectionPages },
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        { provide: OpenAlerts, useValue: { alerts: openAlerts.asReadonly() } },
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

  it('when it opens, then it is named Účet under the logo of the foundation, with the card of the donor leading to Údaje a zabezpečení above the sections', () => {
    const sheet = open();

    expect(sheet.querySelector('#account-sheet-title')?.textContent?.trim()).toBe('Účet');
    expect(sheet.querySelector('#account-sheet-title img.account-logo')?.getAttribute('alt')).toBe(
      '',
    );
    const profile = sheet.querySelector('a.account-profile')!;
    expect(profile.getAttribute('href')).toBe('/darce/udaje');
    expect(profile.querySelector('.account-name')?.textContent?.trim()).toBe('Jana Nováková');
    expect(profile.querySelector('.account-profile-detail')?.textContent?.trim()).toBe(
      'Údaje a zabezpečení',
    );
    expect(sheet.querySelector('.account-initials')?.textContent?.trim()).toBe('JN');
    expect(rows(sheet)).toEqual(['Můj přehled', 'Moje dary', 'Potvrzení o daru', 'Bankovní účty']);
    expect(sheet.querySelector('.account-symbol')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Variabilní symbol pro vaše dary: 1234567890',
    );
    expect(sheet.querySelector('.account-sign-out')?.textContent?.trim()).toBe('Odhlásit se');
  });

  describe('when an administrator has open faults', () => {
    function faultRow(sheet: HTMLElement): HTMLAnchorElement | null {
      return sheet.querySelector('.account-faults a');
    }

    beforeEach(() => admin.set(true));

    it('then one fault is the first row, named by its area and time, leading to its page', () => {
      openAlerts.set([{ area: 'backups', since: '2026-11-14T02:00:05Z' }]);
      const sheet = open();

      const row = faultRow(sheet)!;
      expect(row.querySelector('.ui-list__title')?.textContent?.trim()).toBe('Nefunguje: Zálohy');
      expect(row.querySelector('.ui-list__meta')?.textContent?.trim()).toBe('od 14. 11. 2026 3:00');
      expect(row.getAttribute('href')).toBe('/sprava/zalohy');
      expect(
        sheet
          .querySelector('.account-faults')!
          .compareDocumentPosition(sheet.querySelector('nav')!),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('then several faults are one row with their count and areas, leading to the alerts page', () => {
      openAlerts.set([
        { area: 'backups', since: '2026-11-14T02:00:05Z' },
        { area: 'mail', since: '2026-11-14T04:00:00Z' },
      ]);
      const sheet = open();

      const row = faultRow(sheet)!;
      expect(row.querySelector('.ui-list__title')?.textContent?.trim()).toBe('Poruchy: 2');
      expect(row.querySelector('.ui-list__meta')?.textContent?.trim()).toBe(
        'Zálohy, Odesílání e-mailů',
      );
      expect(row.getAttribute('href')).toBe('/sprava/upozorneni');
    });

    it('then without a fault there is no such row', () => {
      openAlerts.set([]);

      expect(faultRow(open())).toBeNull();
    });

    it('then a donor without the role never sees the row, whatever is known', () => {
      admin.set(false);
      openAlerts.set([{ area: 'backups', since: '2026-11-14T02:00:05Z' }]);

      expect(faultRow(open())).toBeNull();
    });
  });

  describe('when a section is chosen on a phone', () => {
    let navigate: ReturnType<typeof vi.spyOn>;
    let sheet: HTMLElement;

    const choose = async (selector: string): Promise<void> => {
      sheet
        .querySelector<HTMLAnchorElement>(selector)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };

    beforeEach(async () => {
      navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      sheet = open();
      await choose('nav a[href="/darce/potvrzeni"]');
    });

    it('then it opens inside the sheet under its title with Zpět, and the sheet goes one step deeper', () => {
      expect(navigate).not.toHaveBeenCalled();
      expect(closed).toBe(0);
      expect(sheet.querySelector('#account-section-title')?.textContent?.trim()).toBe(
        'Potvrzení o daru',
      );
      expect(sheet.querySelector('.stub-page')?.textContent).toBe('Obsah sekce');
      expect(sheet.querySelector('button.account-back')?.getAttribute('aria-label')).toBe('Zpět');
      expect(sheet.querySelector('nav.account-nav')).toBeNull();
      expect(history.steps.at(-1)).toBe(1);
    });

    it('then its title takes the focus', () => {
      expect(document.activeElement?.id).toBe('account-section-title');
    });

    it('and Zpět is pressed, then the sheet steps back through the history', () => {
      const back = vi.spyOn(TestBed.inject(Location), 'back');

      sheet.querySelector<HTMLButtonElement>('button.account-back')!.click();

      expect(back).toHaveBeenCalledOnce();
    });

    it('and the visitor goes back and opens it again, then its page stands in the very first frame', async () => {
      history.listener?.stepBack();
      fixture.detectChanges();
      await fixture.whenStable();

      sheet
        .querySelector<HTMLAnchorElement>('nav a[href="/darce/potvrzeni"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(sheet.querySelector('.stub-page')?.textContent).toBe('Obsah sekce');
    });

    it('and the visitor goes back, then the list of the account returns with the focus on the row they came from', async () => {
      history.listener?.stepBack();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(sheet.querySelector('#account-section-title')).toBeNull();
      expect(sheet.querySelector('nav.account-nav')).not.toBeNull();
      expect((document.activeElement as HTMLAnchorElement | null)?.getAttribute('href')).toBe(
        '/darce/potvrzeni',
      );
      expect(closed).toBe(0);
    });

    describe('and something is written in a form of the section and the visitor goes back', () => {
      const settle = async (): Promise<void> => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };

      beforeEach(async () => {
        const input = sheet.querySelector<HTMLInputElement>('input.stub-input')!;
        input.value = 'rozepsáno';
        input.dispatchEvent(new Event('input'));
        await settle();
        history.listener?.stepBack();
        await settle();
      });

      it('then the section stays with its step and a dialog asks whether to discard what is written', () => {
        expect(sheet.querySelector('#account-section-title')).not.toBeNull();
        expect(history.steps.at(-1)).toBe(1);
        expect(document.querySelector('#account-discard-title')?.textContent?.trim()).toBe(
          'Zahodit rozepsané údaje?',
        );
      });

      it('and they choose to keep writing, then the dialog closes and the section stays', async () => {
        document.querySelector<HTMLButtonElement>('button.account-discard-keep')!.click();
        await settle();

        expect(document.querySelector('#account-discard-title')).toBeNull();
        expect(sheet.querySelector('#account-section-title')).not.toBeNull();
        expect(sheet.querySelector<HTMLInputElement>('input.stub-input')?.value).toBe('rozepsáno');
      });

      it('and they choose to discard, then the sheet steps back and the list of the account returns', async () => {
        const back = vi.spyOn(TestBed.inject(Location), 'back');

        document.querySelector<HTMLButtonElement>('button.account-discard-leave')!.click();
        await settle();
        history.listener?.stepBack();
        await settle();

        expect(back).toHaveBeenCalledOnce();
        expect(document.querySelector('#account-discard-title')).toBeNull();
        expect(sheet.querySelector('#account-section-title')).toBeNull();
        expect(sheet.querySelector('nav.account-nav')).not.toBeNull();
      });
    });

    it('and a link inside it leads to another section, then that section opens inside the sheet', async () => {
      await choose('a.stub-gifts');

      expect(navigate).not.toHaveBeenCalled();
      expect(sheet.querySelector('#account-section-title')?.textContent?.trim()).toBe('Moje dary');
    });

    it('and a link inside it leads elsewhere, then the sheet closes and that page opens', async () => {
      await choose('a.stub-elsewhere');

      expect(closed).toBe(1);
      expect(navigate).toHaveBeenCalledWith('/overit', expect.anything());
    });
  });

  it('when the appearance button is pressed again and again, then it goes Automaticky, Světlý, Tmavý and back, says each choice aloud and keeps it on the device', () => {
    localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    const sheet = open();
    const button = () => sheet.querySelector<HTMLButtonElement>('button.account-appearance')!;
    const announcer = TestBed.inject(DialogAnnouncer);

    expect(button().getAttribute('aria-label')).toBe('Vzhled: Automaticky');
    expect(button().hasAttribute('appNeedsConnection')).toBe(false);

    const said: string[] = [];
    for (const expected of ['Vzhled: Světlý', 'Vzhled: Tmavý', 'Vzhled: Automaticky']) {
      button().click();
      fixture.detectChanges();
      expect(button().getAttribute('aria-label')).toBe(expected);
      said.push(announcer.message());
    }

    expect(said).toEqual(['Vzhled: Světlý', 'Vzhled: Tmavý', 'Vzhled: Automaticky']);
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
    document.documentElement.removeAttribute('data-appearance');
  });

  it('when the card of the donor is chosen on a phone, then Údaje a zabezpečení opens inside the sheet', async () => {
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a.account-profile')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(sheet.querySelector('#account-section-title')?.textContent?.trim()).toBe(
      'Údaje a zabezpečení',
    );
  });

  it('when Správa is chosen, then the sheet closes and the administration opens as a page', async () => {
    admin.set(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a[href="/sprava"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(closed).toBe(1);
    expect(navigate.mock.calls[0][0]).toBe('/sprava');
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

  it('when no name is kept, then the card of the donor shows a person instead of initials and still leads to Údaje a zabezpečení', () => {
    donor.set(sampleDonor({ name: '' }));

    const sheet = open();

    expect(sheet.querySelector('#account-sheet-title')?.textContent?.trim()).toBe('Účet');
    expect(sheet.querySelector('.account-initials svg')).not.toBeNull();
    expect(sheet.querySelector('a.account-profile')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Údaje a zabezpečení',
    );
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

  it('when a section is chosen on a computer, then the sheet hands its history entry to that page, one level deeper, and closes', async () => {
    compact.set(false);
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

  it('when the sheet kept no history entry of its own on a computer, then a chosen section opens as a new entry over the page under it', async () => {
    compact.set(false);
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
