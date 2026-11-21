import type { Mock } from 'vitest';
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
import { APP_DEPTH_KEY, BackTarget } from '../../core/navigation/back-target';
import { APP_ACCOUNT_KEY } from './account-return';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { FakeDialogHistory } from '../../shared/ui/dialog/testing/fake-dialog-history';
import { AccountBadges } from '../../core/layout/account-badges';
import { AppInstall, InstallWay } from '../../core/install/app-install';
import { OpenAlerts } from '../../core/push/open-alerts';
import { OpenAlert } from '../../core/push/open-alerts-api';
import { AccountSheet, leaveAccountStep } from './account-sheet';
import { ACCOUNT_SECTION_PAGES, AccountSectionPages } from './account-section';
import { withOrdinarySpaces } from '../../../testing/ordinary-spaces';

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
      (link) =>
        withOrdinarySpaces(link.querySelector('.ui-list__title')?.textContent)?.trim() ?? '',
    );
  }

  it('when it opens, then it is named Účet under the logo of the foundation, with the card of the donor leading to Údaje a zabezpečení above the sections', () => {
    const sheet = open();

    expect(
      withOrdinarySpaces(sheet.querySelector('#account-sheet-title')?.textContent)?.trim(),
    ).toBe('Účet');
    expect(sheet.querySelector('#account-sheet-title img.account-logo')?.getAttribute('alt')).toBe(
      '',
    );
    const profile = sheet.querySelector('a.account-profile')!;
    expect(profile.getAttribute('href')).toBe('/darce/udaje');
    expect(withOrdinarySpaces(profile.querySelector('.account-name')?.textContent)?.trim()).toBe(
      'Jana Nováková',
    );
    expect(
      withOrdinarySpaces(profile.querySelector('.account-profile-detail')?.textContent)?.trim(),
    ).toBe('Údaje a zabezpečení');
    expect(withOrdinarySpaces(sheet.querySelector('.account-initials')?.textContent)?.trim()).toBe(
      'JN',
    );
    expect(rows(sheet)).toEqual(['Můj přehled', 'Moje dary', 'Potvrzení o daru', 'Bankovní účty']);
    expect(
      withOrdinarySpaces(sheet.querySelector('.account-symbol')?.textContent)
        ?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Variabilní symbol pro vaše dary: 1234567890');
    expect(withOrdinarySpaces(sheet.querySelector('.account-sign-out')?.textContent)?.trim()).toBe(
      'Odhlásit se',
    );
  });

  it('when it opens on a computer, then it is still named Účet but shows no logo, because the header of the page above it already does', () => {
    compact.set(false);
    const sheet = open();

    expect(
      withOrdinarySpaces(sheet.querySelector('#account-sheet-title')?.textContent)?.trim(),
    ).toBe('Účet');
    expect(sheet.querySelector('.account-logo')).toBeNull();
    expect(sheet.querySelector('nav')?.getAttribute('aria-labelledby')).toBe('account-sheet-title');
    expect(rows(sheet)).toEqual(['Můj přehled', 'Moje dary', 'Potvrzení o daru', 'Bankovní účty']);
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
      expect(withOrdinarySpaces(row.querySelector('.ui-list__title')?.textContent)?.trim()).toBe(
        'Nefunguje: Zálohy',
      );
      expect(withOrdinarySpaces(row.querySelector('.ui-list__meta')?.textContent)?.trim()).toBe(
        'od 14. 11. 2026 3:00',
      );
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
      expect(withOrdinarySpaces(row.querySelector('.ui-list__title')?.textContent)?.trim()).toBe(
        'Poruchy: 2',
      );
      expect(withOrdinarySpaces(row.querySelector('.ui-list__meta')?.textContent)?.trim()).toBe(
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

    it('then it opens inside the sheet under its title between Zpět and Zavřít, and the sheet goes one step deeper', () => {
      expect(navigate).not.toHaveBeenCalled();
      expect(closed).toBe(0);
      expect(
        withOrdinarySpaces(sheet.querySelector('#account-section-title')?.textContent)?.trim(),
      ).toBe('Potvrzení o daru');
      expect(withOrdinarySpaces(sheet.querySelector('.stub-page')?.textContent)).toBe(
        'Obsah sekce',
      );
      expect(sheet.querySelector('button[aria-label="Zpět"]')).not.toBeNull();
      expect(sheet.querySelectorAll('button[aria-label="Zavřít"]')).toHaveLength(1);
      expect(sheet.querySelector('nav.account-nav')).toBeNull();
      expect(history.steps.at(-1)).toBe(1);
    });

    it('then its title takes the focus', () => {
      expect(document.activeElement?.id).toBe('account-section-title');
    });

    it('then the sheet pushes the section in, which it does not when it opens', () => {
      expect(fixture.nativeElement.classList).toContain('account-sheet--push');
      expect(fixture.nativeElement.classList).not.toContain('account-sheet--pop');
    });

    it('and the visitor goes back, then the sheet pops the section off', async () => {
      history.listener?.stepBack();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.classList).toContain('account-sheet--pop');
      expect(fixture.nativeElement.classList).not.toContain('account-sheet--push');
    });

    it('and Zpět is pressed, then the sheet steps back through the history', () => {
      const back = vi.spyOn(TestBed.inject(Location), 'back');

      sheet.querySelector<HTMLButtonElement>('button[aria-label="Zpět"]')!.click();

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

      expect(withOrdinarySpaces(sheet.querySelector('.stub-page')?.textContent)).toBe(
        'Obsah sekce',
      );
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

    it('and Zavřít is pressed, then the whole sheet closes over the page, as at its first step', async () => {
      sheet.querySelector<HTMLButtonElement>('button[aria-label="Zavřít"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(closed).toBe(1);
      expect(navigate).not.toHaveBeenCalled();
    });

    describe('and something is written in a form of the section and the visitor presses Zavřít', () => {
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
        sheet.querySelector<HTMLButtonElement>('button[aria-label="Zavřít"]')!.click();
        await settle();
      });

      it('then the sheet stays open and a dialog asks whether to discard what is written, without speaking of going back', () => {
        expect(closed).toBe(0);
        expect(sheet.querySelector('#account-section-title')).not.toBeNull();
        expect(
          withOrdinarySpaces(document.querySelector('#account-discard-title')?.textContent)?.trim(),
        ).toBe('Zahodit rozepsané údaje?');
        expect(
          withOrdinarySpaces(document.querySelector('.account-discard-lead')?.textContent)?.trim(),
        ).toBe('Co jste do formuláře napsali, se neuloží.');
      });

      it('and they choose to keep writing, then the dialog closes and the section stays', async () => {
        document.querySelector<HTMLButtonElement>('button.account-discard-keep')!.click();
        await settle();

        expect(closed).toBe(0);
        expect(document.querySelector('#account-discard-title')).toBeNull();
        expect(sheet.querySelector<HTMLInputElement>('input.stub-input')?.value).toBe('rozepsáno');
      });

      it('and they choose to discard, then the whole sheet closes', async () => {
        const back = vi.spyOn(TestBed.inject(Location), 'back');

        document.querySelector<HTMLButtonElement>('button.account-discard-leave')!.click();
        await settle();

        expect(closed).toBe(1);
        expect(back).not.toHaveBeenCalled();
      });
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
        expect(
          withOrdinarySpaces(document.querySelector('#account-discard-title')?.textContent)?.trim(),
        ).toBe('Zahodit rozepsané údaje?');
        expect(
          withOrdinarySpaces(document.querySelector('.account-discard-lead')?.textContent)?.trim(),
        ).toBe('Když se teď vrátíte, co jste vyplnili, se neuloží.');
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
      expect(
        withOrdinarySpaces(sheet.querySelector('#account-section-title')?.textContent)?.trim(),
      ).toBe('Moje dary');
    });

    it('and a link inside it leads elsewhere, then the sheet closes and that page opens', async () => {
      await choose('a.stub-elsewhere');

      expect(closed).toBe(1);
      expect(navigate).toHaveBeenCalledWith('/overit', expect.anything());
    });

    it('and a link inside it leads elsewhere, then that page takes the entry of the sheet and names the section a step back returns to', async () => {
      await choose('a.stub-elsewhere');

      expect(history.handedOver).toEqual(['/overit']);
      expect(navigate).toHaveBeenCalledWith('/overit', {
        replaceUrl: true,
        state: { [APP_DEPTH_KEY]: 1, [APP_ACCOUNT_KEY]: '/darce/potvrzeni' },
      });
    });

    it('and a link inside it leads to another section, then the sheet goes one more step deeper', async () => {
      await choose('a.stub-gifts');

      expect(history.steps.at(-1)).toBe(2);
    });

    it('and a link inside it leads to another section and the visitor goes back, then the section before returns with the focus on the link they followed', async () => {
      await choose('a.stub-gifts');

      history.listener?.stepBack();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(
        withOrdinarySpaces(sheet.querySelector('#account-section-title')?.textContent)?.trim(),
      ).toBe('Potvrzení o daru');
      expect(history.steps.at(-1)).toBe(1);
      expect((document.activeElement as HTMLAnchorElement | null)?.className).toBe('stub-gifts');
      expect(closed).toBe(0);
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

  it('when the appearance button is pressed, then the icon of the new choice fades in over the icon of the old one, which stays in its place to fade out', () => {
    localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    const sheet = open();
    const button = sheet.querySelector<HTMLButtonElement>('button.account-appearance')!;
    const icons = () => Array.from(button.querySelectorAll('svg.appearance-icon'));
    const shown = () => icons().filter((icon) => icon.classList.contains('appearance-icon--shown'));
    const before = icons();
    const automatic = shown();

    button.click();
    fixture.detectChanges();

    expect(before).toHaveLength(3);
    expect(automatic).toHaveLength(1);
    expect(icons()).toEqual(before);
    expect(shown()).toHaveLength(1);
    expect(shown()[0]).not.toBe(automatic[0]);
    expect(icons().every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
    document.documentElement.removeAttribute('data-appearance');
  });

  it('when it opens, then the sheet neither pushes nor pops a step', () => {
    open();

    expect(fixture.nativeElement.classList).not.toContain('account-sheet--push');
    expect(fixture.nativeElement.classList).not.toContain('account-sheet--pop');
  });

  it('when it opens, then each row that can be the current page carries its own wording, so its bold weight keeps the width the row reserves for it', () => {
    admin.set(true);
    const sheet = open();

    const labels = Array.from(sheet.querySelectorAll<HTMLElement>('.account-current-label')).map(
      (label) => [label.textContent?.trim(), label.dataset['label']],
    );

    expect(labels).toEqual([
      ['Údaje a\u00a0zabezpečení', 'Údaje a\u00a0zabezpečení'],
      ['Můj přehled', 'Můj přehled'],
      ['Moje dary', 'Moje dary'],
      ['Potvrzení o\u00a0daru', 'Potvrzení o\u00a0daru'],
      ['Bankovní účty', 'Bankovní účty'],
      ['Správa', 'Správa'],
    ]);
  });

  it('when the card of the donor is chosen on a phone, then Údaje a zabezpečení opens inside the sheet', async () => {
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a.account-profile')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      withOrdinarySpaces(sheet.querySelector('#account-section-title')?.textContent)?.trim(),
    ).toBe('Údaje a zabezpečení');
  });

  it('when Správa is chosen on a phone, then the administration takes the entry of the sheet and names the list of the account as where a step back returns', async () => {
    admin.set(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet
      .querySelector<HTMLAnchorElement>('a[href="/sprava"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/sprava', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: 1, [APP_ACCOUNT_KEY]: '' },
    });
  });

  it('when a step back opens it again on a section, then it stands on that section with its step at once', async () => {
    fixture = TestBed.createComponent(AccountSheet);
    fixture.componentRef.setInput('reopenedOn', '/darce/dary');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const sheet = fixture.nativeElement as HTMLElement;

    expect(
      withOrdinarySpaces(sheet.querySelector('#account-section-title')?.textContent)?.trim(),
    ).toBe('Moje dary');
    expect(history.steps.at(-1)).toBe(1);
  });

  it('when a step back from the administration opens it again on its list, then the row of Správa takes the focus', async () => {
    admin.set(true);
    vi.spyOn(TestBed.inject(BackTarget), 'leftPath', 'get').mockReturnValue('/sprava');
    fixture = TestBed.createComponent(AccountSheet);
    fixture.componentRef.setInput('reopenedOn', '');
    fixture.detectChanges();
    await fixture.whenStable();

    expect((document.activeElement as HTMLAnchorElement | null)?.getAttribute('href')).toBe(
      '/sprava',
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

    expect(withOrdinarySpaces(row.querySelector('.account-count')?.textContent)?.trim()).toBe('2');
    expect(row.querySelector('.account-count')?.getAttribute('aria-hidden')).toBe('true');
    expect(withOrdinarySpaces(row.querySelector('.visually-hidden')?.textContent)?.trim()).toBe(
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
    expect(withOrdinarySpaces(sheet.querySelector('.account-initials')?.textContent)?.trim()).toBe(
      '',
    );
  });

  it('when the donor is an administrator, then the sheet also leads to the administration, named as theirs alone', () => {
    admin.set(true);

    const sheet = open();

    expect(rows(sheet).at(-1)).toBe('Správa');
    expect(
      withOrdinarySpaces(
        sheet.querySelector('a[href="/sprava"] .account-note')?.textContent,
      )?.trim(),
    ).toBe('jen správci');
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

    expect(
      withOrdinarySpaces(sheet.querySelector('#account-sheet-title')?.textContent)?.trim(),
    ).toBe('Účet');
    expect(sheet.querySelector('.account-initials svg')).not.toBeNull();
    expect(
      withOrdinarySpaces(sheet.querySelector('a.account-profile')?.textContent)
        ?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Údaje a zabezpečení');
  });

  it('when the site already runs as an app or cannot be added, then the sheet offers no Přidat na plochu', () => {
    const sheet = open();

    expect(sheet.querySelector('.account-install')).toBeNull();
  });

  it('when the browser can install the site, then Přidat na plochu closes the sheet and asks the browser to install it', async () => {
    installWay.set('prompt');
    const sheet = open();
    const row = sheet.querySelector<HTMLButtonElement>('.account-install button')!;

    expect(withOrdinarySpaces(row.textContent)?.replace(/\s+/g, ' ').trim()).toBe(
      'Přidat na plochu',
    );

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
    expect(withOrdinarySpaces(how?.textContent)?.replace(/\s+/g, ' ').trim()).toBe(
      'Klepněte na „Sdílet“ (v Safari ho najdete i pod tlačítkem ⋯) a pak na „Přidat na plochu“. V aplikaci se přihlásíte ještě jednou.',
    );
    expect(
      withOrdinarySpaces(how?.textContent)
        ?.replace(/[ \n]+/g, ' ')
        .trim(),
    ).toBe(
      'Klepněte na „Sdílet“ (v Safari ho najdete i pod tlačítkem ⋯) a pak na „Přidat na plochu“. V aplikaci se přihlásíte ještě jednou.',
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
      withOrdinarySpaces(sheet.querySelector(`#${row.getAttribute('aria-controls')}`)?.textContent)
        ?.replace(/\s+/g, ' ')
        .trim(),
    ).toBe(
      'V Safari zvolte v nabídce „Soubor“ položku „Přidat do Docku“. V aplikaci se přihlásíte ještě jednou.',
    );
    expect(
      withOrdinarySpaces(sheet.querySelector(`#${row.getAttribute('aria-controls')}`)?.textContent)
        ?.replace(/[ \n]+/g, ' ')
        .trim(),
    ).toBe(
      'V Safari zvolte v nabídce „Soubor“ položku „Přidat do Docku“. V aplikaci se přihlásíte ještě jednou.',
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

  it('when it opens, then the register entry and the IČO use the shared separator that hides at a line break', () => {
    const registry = open().querySelector('.account-foundation .registry')!;

    expect(registry.classList).toContain('ui-separated');
    expect(registry.querySelector('.registry-id')?.classList).toContain('ui-separated__item');
    expect(registry.querySelector('.registry-id > span')?.classList).toContain(
      'ui-separated__separator',
    );
  });

  it('when it opens, then under the sign-out it names how to reach the foundation, its register entry and the privacy policy, which a step back leaves for the list of the account', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();
    const foundation = sheet.querySelector('.account-foundation')!;

    expect(
      withOrdinarySpaces(
        foundation.querySelector('a[href="mailto:info@nfnn.cz"]')?.textContent,
      )?.trim(),
    ).toBe('info@nfnn.cz');
    expect(withOrdinarySpaces(foundation.textContent)?.replace(/[^\S\u00a0]+/g, ' ')).toContain(
      'Zapsán u KS Ústí nad Labem, oddíl N, vložka 78 · IČO 27278794',
    );
    expect(
      withOrdinarySpaces(foundation.querySelector('a[href="/o-nas#kontakt"]')?.textContent)?.trim(),
    ).toBe('Kontakt');
    const privacy = foundation.querySelector<HTMLAnchorElement>(
      'a[href="/zasady-ochrany-osobnich-udaju"]',
    )!;
    expect(withOrdinarySpaces(privacy.textContent)?.trim()).toBe('Zásady ochrany osobních údajů');

    privacy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    expect(closed).toBe(1);
    expect(navigate).toHaveBeenCalledWith('/zasady-ochrany-osobnich-udaju', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: 1, [APP_ACCOUNT_KEY]: '' },
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

  it('when the donor signs out on a phone, then the home page names no account sheet to return to', async () => {
    await TestBed.inject(Router).navigateByUrl('/o-nas');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const sheet = open();

    sheet.querySelector<HTMLButtonElement>('.account-sign-out')!.click();
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/', {
      replaceUrl: true,
      state: { [APP_DEPTH_KEY]: 1 },
    });
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

describe('Given a step of the account sheet that leaves', () => {
  interface Motion {
    readonly finished: Promise<unknown>;
    readonly effect: { getComputedTiming: () => { endTime: number } };
  }

  let step: HTMLElement;
  let complete: Mock<() => void>;

  beforeEach(() => {
    step = document.createElement('div');
    step.className = 'account-step';
    step.innerHTML = `
      <div class="account-step-head"><h2 id="account-section-title">Moje dary</h2></div>
      <div class="account-step-body"><div id="account-install-how"></div></div>
    `;
    document.body.append(step);
    complete = vi.fn<() => void>();
  });

  afterEach(() => {
    step.remove();
    vi.useRealTimers();
  });

  function moving(endTime: number, finished: Promise<unknown>): void {
    for (const part of Array.from(step.children)) {
      (part as unknown as { getAnimations: () => Motion[] }).getAnimations = () => [
        { finished, effect: { getComputedTiming: () => ({ endTime }) } },
      ];
    }
  }

  function leave(): void {
    leaveAccountStep({ target: step, animationComplete: complete });
  }

  it('when it starts to leave, then it is out of reach and gives up its ids at once, before its motion ends', () => {
    moving(350, new Promise(() => undefined));

    leave();

    expect(step.hasAttribute('inert')).toBe(true);
    expect(step.getAttribute('aria-hidden')).toBe('true');
    expect(step.classList).toContain('account-step--leaving');
    expect(step.querySelectorAll('[id]')).toHaveLength(0);
    expect(complete).not.toHaveBeenCalled();
  });

  it('when its head and body have moved away, then it is gone', async () => {
    let finish!: () => void;
    moving(
      350,
      new Promise<void>((done) => {
        finish = done;
      }),
    );

    leave();
    finish();
    await new Promise((done) => setTimeout(done));

    expect(complete).toHaveBeenCalledOnce();
  });

  it('when the browser never ends its motion, then it is gone at the latest 0.3 s after its duration, so it never stays over the new step', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    moving(350, new Promise(() => undefined));

    leave();
    vi.advanceTimersByTime(649);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(complete).toHaveBeenCalledOnce();
  });

  it('when nothing moves it, then it is gone at once', () => {
    leave();

    expect(complete).toHaveBeenCalledOnce();
  });
});
