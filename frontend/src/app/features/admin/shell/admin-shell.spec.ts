import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_DEPTH_KEY, BackTarget } from '../../../core/navigation/back-target';
import { AccountReturn } from '../../../layout/account-sheet/account-return';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { PAGE_TRANSITION_CLASS } from '../../../core/navigation/page-transitions';
import { DIALOG_PRESENTATION } from '../../../shared/ui/dialog/dialog-presentation';
import { DIALOG_SUSPENSION } from '../../../shared/ui/dialog/dialog-suspension';
import { AdminShell } from './admin-shell';
import { ADMINISTRATION_LOCK } from './administration-lock';
import { withOrdinarySpaces } from '../../../../testing/ordinary-spaces';

@Component({
  template: `<h1>Stránka</h1>
    <p class="look">{{ look }}</p>
    <input id="pole" />
    <p class="suspended">{{ suspended() }}</p>`,
})
class Page {
  protected readonly look = inject(DIALOG_PRESENTATION);
  protected readonly suspended = inject(DIALOG_SUSPENSION);
}

@Component({ template: `<h1>{{ name() }}</h1>` })
class NamedPage {
  readonly name = signal('Načítáme dárce…');
}

@Component({ template: '<p class="lock-panel" tabindex="-1">Správa je zamčená</p>' })
class LockPanel {}

describe('Given an administrator anywhere in the administration', () => {
  const compact = signal(false);
  const locked = signal(false);
  const keepsPage = signal(false);
  const firstDownload = signal<{ done: number; total: number } | null>(null);
  const firstDownloadEnd = signal<'stored' | 'failed' | null>(null);
  let fixture: ComponentFixture<AdminShell>;
  let router: Router;

  beforeEach(async () => {
    compact.set(false);
    locked.set(false);
    keepsPage.set(false);
    firstDownload.set(null);
    firstDownloadEnd.set(null);
    await TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: compact.asReadonly() } },
        {
          provide: ADMINISTRATION_LOCK,
          useValue: {
            locked: locked.asReadonly(),
            panel: signal(LockPanel).asReadonly(),
            keepsPage: keepsPage.asReadonly(),
            firstDownload: firstDownload.asReadonly(),
            firstDownloadEnd: firstDownloadEnd.asReadonly(),
            retryFirstDownload: () => undefined,
          },
        },
        provideRouter([
          { path: 'sprava', component: Page, data: { headTitle: 'Stránka' } },
          { path: 'sprava/darci', component: Page, data: { headTitle: 'Stránka' } },
          { path: 'sprava/darci/:id', component: Page, data: { headTitle: 'Stránka' } },
          { path: 'sprava/platby', component: Page, data: { headTitle: 'Platby z banky' } },
          {
            path: 'sprava/lide',
            component: NamedPage,
            data: { headTitle: 'Načítáme dárce…', headTitleFollowsHeading: true },
          },
          { path: 'sprava/stranka', component: NamedPage },
          {
            path: 'sprava/aktuality/nova',
            component: Page,
            data: { parent: '/sprava', adminFrame: 'full' },
          },
          { path: 'aktuality', component: Page },
          { path: '', component: Page },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AdminShell);
    await router.navigateByUrl('/sprava');
    await settle();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function nav(): HTMLElement {
    return fixture.nativeElement.querySelector('nav.side-nav-panel');
  }

  function element(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function clean(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  function currentLinks(): string[] {
    return Array.from(nav().querySelectorAll('a[aria-current="page"]')).map((link) =>
      clean(withOrdinarySpaces(link.textContent)),
    );
  }

  it('when the panel is shown, then it lists the overview and the sections grouped by how often they are needed', () => {
    const groups = Array.from(nav().querySelectorAll('ul')).map((list) => ({
      label: clean(
        list.hasAttribute('aria-labelledby')
          ? withOrdinarySpaces(
              fixture.nativeElement.querySelector(`#${list.getAttribute('aria-labelledby')}`)
                ?.textContent,
            )
          : '',
      ),
      links: Array.from(list.querySelectorAll('a')).map((link) => [
        clean(withOrdinarySpaces(link.textContent)),
        link.getAttribute('href'),
      ]),
    }));

    expect(nav().getAttribute('aria-label')).toBe('Správa');
    expect(groups).toEqual([
      { label: '', links: [['Přehled', '/sprava']] },
      {
        label: 'Každý den',
        links: [
          ['Platby z banky', '/sprava/platby'],
          ['Dárci', '/sprava/darci'],
          ['Aktuality', '/sprava/aktuality'],
          ['Pomáháme', '/sprava/projekty'],
        ],
      },
      {
        label: 'Občas',
        links: [
          ['Hromadná potvrzení', '/sprava/hromadna-potvrzeni'],
          ['Ověřit potvrzení', '/sprava/overit'],
          ['Fotka v sekci O nás', '/sprava/o-nas'],
          ['Fotka v pruhu Přispět', '/sprava/pruh-prispet'],
          ['Lidé fondu', '/sprava/lide-fondu'],
          ['Správci', '/sprava/spravci'],
          ['Měsíční e-mail', '/sprava/prehledy'],
          ['Zálohy', '/sprava/zalohy'],
          ['Upozornění', '/sprava/upozorneni'],
          ['Historie změn', '/sprava/historie'],
        ],
      },
      {
        label: 'Pro technika',
        links: [
          ['Nastavení', '/sprava/nastaveni'],
          ['Logy a diagnostika', '/sprava/logy'],
          ['Odpovědi o starších symbolech', '/sprava/starsi-symboly'],
          ['Loga bank', '/sprava/loga-bank'],
        ],
      },
    ]);
  });

  it('when the overview is open, then only the overview is marked as the current page', () => {
    expect(currentLinks()).toEqual(['Přehled']);
  });

  it('when a donor of the donors section is open, then the donors link is the current page', async () => {
    await router.navigateByUrl('/sprava/darci/019a1c00-0000-7000-8000-000000000001');
    await settle();

    expect(currentLinks()).toEqual(['Dárci']);
  });

  it('when it opens on a computer, then the app header offers the account and the side panel leads without the site tabs', () => {
    expect(element('header.app-header a.brand')?.getAttribute('href')).toBe('/');
    expect(element('#admin-nav')).not.toBeNull();
    expect(element('nav[aria-label="Hlavní sekce"]')).toBeNull();
    expect(element('app-dashboard-top-bar')).toBeNull();
  });

  it('when the page is shown, then it stands in the main landmark of the skip link', () => {
    expect(withOrdinarySpaces(element('main#obsah h1')?.textContent)).toBe('Stránka');
  });

  it('when a page of the administration opens a dialog, then the dialog comes up as a sheet from the bottom', () => {
    expect(clean(withOrdinarySpaces(element('main#obsah .look')?.textContent))).toBe('sheet');
  });

  describe('when the window narrows to a phone or a tablet', () => {
    beforeEach(async () => {
      compact.set(true);
      await settle();
    });

    it('then no side panel is drawn and the same page stays in the main landmark', () => {
      expect(element('#admin-nav')).toBeNull();
      expect(withOrdinarySpaces(element('main#obsah h1')?.textContent)).toBe('Stránka');
    });

    it('then no menu button stands above the page, since the overview lists the sections', () => {
      expect(fixture.nativeElement.querySelector('main#obsah')?.previousElementSibling).toBeNull();
      expect(element('button.side-nav-toggle')).toBeNull();
    });

    it('then the administration stands in a sheet over the page, with Zpět and Zavřít in its head instead of the header of the app', () => {
      const sheet = element('.admin-sheet');

      expect(sheet).not.toBeNull();
      expect(sheet!.querySelector('[role="banner"] button[aria-label="Zpět"]')).not.toBeNull();
      expect(sheet!.querySelector('[role="banner"] button[aria-label="Zavřít"]')).not.toBeNull();
      expect(withOrdinarySpaces(sheet!.querySelector('main#obsah h1')?.textContent)).toBe(
        'Stránka',
      );
      expect(element('header.app-header')).toBeNull();
      expect(element('.admin-sheet-backdrop')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('then the head names the page in its middle, as an account section does, while the heading of the page stays for screen readers', () => {
      const title = element('.admin-sheet [role="banner"] p[aria-hidden="true"]');

      expect(clean(withOrdinarySpaces(title?.textContent))).toBe('Stránka');
      expect(
        element('.admin-sheet [role="banner"] h1, .admin-sheet [role="banner"] h2'),
      ).toBeNull();
      expect(withOrdinarySpaces(element('main#obsah h1')?.textContent)).toBe('Stránka');
    });

    it('and a page opens, then the head names it from its route in the same pass as the page, never from the heading the page draws', async () => {
      await router.navigateByUrl('/sprava/platby');
      fixture.detectChanges();

      expect(
        clean(
          withOrdinarySpaces(
            element('.admin-sheet [role="banner"] p[aria-hidden="true"]')?.textContent,
          ),
        ),
      ).toBe('Platby z banky');
    });

    it('and a page that names no title of its own changes its heading, then the head stays as its route has it', async () => {
      await router.navigateByUrl('/sprava/stranka');
      await settle();
      const page = fixture.debugElement.query(
        (node) => node.componentInstance instanceof NamedPage,
      );

      (page.componentInstance as NamedPage).name.set('Jana Nováková');
      await settle();
      await settle();

      expect(
        clean(element('.admin-sheet [role="banner"] p[aria-hidden="true"]')?.textContent),
      ).toBe('');
    });

    it('and the page names itself only once its data arrive, then the head follows its heading', async () => {
      await router.navigateByUrl('/sprava/lide');
      await settle();
      const page = fixture.debugElement.query(
        (node) => node.componentInstance instanceof NamedPage,
      );
      const title = () =>
        clean(
          withOrdinarySpaces(
            element('.admin-sheet [role="banner"] p[aria-hidden="true"]')?.textContent,
          ),
        );
      expect(title()).toBe('Načítáme dárce…');

      (page.componentInstance as NamedPage).name.set('Jana Nováková');
      await settle();
      await settle();

      expect(title()).toBe('Jana Nováková');
      const heading = element('main#obsah h1')!;
      expect(heading.closest('[aria-hidden="true"]')).toBeNull();
      expect(getComputedStyle(heading).visibility).not.toBe('hidden');
      expect(clean(heading.textContent)).toBe('Jana Nováková');
    });

    it('and a news editor opens, then it stands full screen under the header of the app, as before', async () => {
      await router.navigateByUrl('/sprava/aktuality/nova');
      await settle();

      expect(element('.admin-sheet')).toBeNull();
      expect(element('header.app-header')).not.toBeNull();
      expect(withOrdinarySpaces(element('main#obsah h1')?.textContent)).toBe('Stránka');
    });

    it('and the window widens again, then the page keeps its state, since the frame changes around the same page', async () => {
      const before = fixture.debugElement.query((node) => node.componentInstance instanceof Page);
      compact.set(false);
      await settle();
      const after = fixture.debugElement.query((node) => node.componentInstance instanceof Page);

      expect(after.componentInstance).toBe(before.componentInstance);
      expect(element('.admin-sheet')).toBeNull();
    });

    it('and Zavřít is pressed after the administration opened by itself, then the site opens at home', async () => {
      await router.navigateByUrl('/sprava/platby');
      await settle();

      element('.admin-sheet [role="banner"] button[aria-label="Zavřít"]')!.click();
      await settle();

      expect(router.url).toBe('/');
    });

    it('then no site tabs stand at the bottom, since the administration is no tab of the site', () => {
      expect(element('nav[aria-label="Hlavní sekce"]')).toBeNull();
    });
  });

  describe('when the administration is locked', () => {
    beforeEach(async () => {
      locked.set(true);
      await settle();
    });

    it('then the lock panel stands in the main landmark instead of the page', () => {
      expect(clean(withOrdinarySpaces(element('main#obsah .lock-panel')?.textContent))).toBe(
        'Správa je zamčená',
      );
      expect(element('main#obsah h1')).toBeNull();
    });

    it('then the header and the side panel stay, so the administrator can still leave', () => {
      expect(element('header.app-header')).not.toBeNull();
      expect(element('#admin-nav')).not.toBeNull();
    });

    it('and the window is a phone, then the head of the sheet stays with Zavřít, so the administrator can still leave', async () => {
      compact.set(true);
      await settle();

      expect(element('.admin-sheet [role="banner"] button[aria-label="Zavřít"]')).not.toBeNull();
    });

    it('and it is unlocked again, then the page comes back', async () => {
      locked.set(false);
      await settle();

      expect(withOrdinarySpaces(element('main#obsah h1')?.textContent)).toBe('Stránka');
      expect(element('.lock-panel')).toBeNull();
    });

    it('and it is unlocked again while a step moves the still copy of a sheet, then the focus still moves to the heading of the page that comes back', async () => {
      document.body.appendChild(fixture.nativeElement);
      const step = stillCopyOfASheet();
      locked.set(false);
      await settle();
      await settle();
      step.remove();

      expect(document.activeElement).toBe(element('main#obsah h1'));
      fixture.nativeElement.remove();
    });

    it('and it is unlocked again, then the focus moves to the heading of the page that comes back', async () => {
      document.body.appendChild(fixture.nativeElement);
      locked.set(false);
      await settle();
      await settle();

      expect(document.activeElement).toBe(element('main#obsah h1'));
      fixture.nativeElement.remove();
    });

    it('then no download bar stands above the panel, even while the copy downloads', async () => {
      firstDownload.set({ done: 3, total: 40 });
      await settle();

      expect(clean(withOrdinarySpaces(element('.admin-first-download')?.textContent))).toBe('');
    });
  });

  describe('when the administration locks while a form of the page is half-typed', () => {
    let page: HTMLElement;

    beforeEach(async () => {
      document.body.appendChild(fixture.nativeElement);
      page = element('main#obsah h1')!;
      (element('#pole') as HTMLInputElement).focus();
      keepsPage.set(true);
      locked.set(true);
      await settle();
      element('.lock-panel')!.focus();
    });

    afterEach(() => fixture.nativeElement.remove());

    it('then a dialog the page holds open steps aside, so nothing hidden blocks the panel', () => {
      expect(withOrdinarySpaces(element('.suspended')?.textContent)).toBe('true');
    });

    it('and it is unlocked again, then the dialogs of the page come back and the focus returns to the field it left', async () => {
      keepsPage.set(false);
      locked.set(false);
      await settle();
      await settle();

      expect(withOrdinarySpaces(element('.suspended')?.textContent)).toBe('false');
      expect(document.activeElement).toBe(element('#pole'));
    });

    it('then the page stays alive under the panel, hidden and out of reach', () => {
      const kept = element('main#obsah .admin-page')!;

      expect(clean(withOrdinarySpaces(element('main#obsah .lock-panel')?.textContent))).toBe(
        'Správa je zamčená',
      );
      expect(kept.hidden).toBe(true);
      expect(kept.hasAttribute('inert')).toBe(true);
      expect(kept.contains(page)).toBe(true);
    });

    it('and it is unlocked again, then the same page comes back as it was', async () => {
      keepsPage.set(false);
      locked.set(false);
      await settle();

      const shown = element('main#obsah .admin-page')!;
      expect(shown.hidden).toBe(false);
      expect(shown.hasAttribute('inert')).toBe(false);
      expect(element('main#obsah h1')).toBe(page);
      expect(element('.lock-panel')).toBeNull();
    });
  });

  describe('when the administration is first stored on this device after unlocking', () => {
    it('then a bar above the page says how much of it is stored', async () => {
      firstDownload.set({ done: 18, total: 40 });
      await settle();

      expect(clean(withOrdinarySpaces(element('main#obsah .first-download')?.textContent))).toBe(
        'Ukládáme správu do zařízení 18 z 40',
      );
    });

    it('then screen readers hear that it started once, and never each stored part', async () => {
      firstDownload.set({ done: 0, total: 40 });
      await settle();
      const live = element('main#obsah .admin-first-download [aria-live="polite"]')!;
      expect(clean(withOrdinarySpaces(live.textContent))).toBe('Ukládáme správu do zařízení.');

      firstDownload.set({ done: 18, total: 40 });
      await settle();

      expect(clean(withOrdinarySpaces(live.textContent))).toBe('Ukládáme správu do zařízení.');
      expect(element('main#obsah .admin-first-download [aria-live="polite"]')).toBe(live);
      const count = element('main#obsah .first-download__count')!;
      expect(clean(withOrdinarySpaces(count.textContent))).toBe('18 z 40');
      expect(live.contains(count)).toBe(false);
      expect(count.closest('[aria-live]')).toBeNull();
      expect(count.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('and saving it again after a failure succeeds, then the focus moves from Uložit znovu to the heading of the page, never to the body', async () => {
      document.body.appendChild(fixture.nativeElement);
      firstDownloadEnd.set('failed');
      await settle();
      const retry = element('.first-download button') as HTMLButtonElement;
      retry.focus();
      retry.click();
      firstDownload.set({ done: 0, total: 0 });
      firstDownloadEnd.set(null);
      await settle();
      expect(document.activeElement).toBe(retry);

      firstDownload.set(null);
      firstDownloadEnd.set('stored');
      await settle();

      expect(document.activeElement).toBe(element('main#obsah h1'));
      fixture.nativeElement.remove();
    });

    it('and it is stored, then the bar goes', async () => {
      firstDownload.set({ done: 40, total: 40 });
      await settle();
      firstDownload.set(null);
      await settle();

      expect(
        clean(
          withOrdinarySpaces(element('.admin-first-download app-fold:not([inert])')?.textContent),
        ),
      ).toBe('');
    });
  });
});

describe('Given an administrator who opened the administration on a phone over a page of the site', () => {
  let fixture: ComponentFixture<AdminShell>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CompactLayout, useValue: { isCompact: signal(true).asReadonly() } },
        {
          provide: ADMINISTRATION_LOCK,
          useValue: {
            locked: signal(false).asReadonly(),
            panel: signal(LockPanel).asReadonly(),
            keepsPage: signal(false).asReadonly(),
            firstDownload: signal(null).asReadonly(),
            firstDownloadEnd: signal(null).asReadonly(),
            retryFirstDownload: () => undefined,
          },
        },
        provideRouter([
          { path: 'aktuality', component: Page },
          { path: 'sprava', component: Page },
          { path: 'sprava/darci', component: Page },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    TestBed.inject(BackTarget);
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/sprava', { replaceUrl: true, state: { [APP_DEPTH_KEY]: 4 } });
    fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  function close(): void {
    fixture.nativeElement
      .querySelector('.admin-sheet [role="banner"] button[aria-label="Zavřít"]')
      .click();
  }

  it('when Zavřít is pressed two pages deep, then the site steps back past every page of the administration to the page it came from, as a press of a button', async () => {
    await router.navigateByUrl('/sprava/darci');
    await fixture.whenStable();
    fixture.detectChanges();
    const steps = vi
      .spyOn(TestBed.inject(BackTarget), 'backBy')
      .mockImplementation(() => undefined);

    close();

    expect(steps).toHaveBeenCalledWith(2);
  });

  it('when Zavřít steps back, then the account sheet is told that the step closes Správa, so it does not open again', () => {
    vi.spyOn(TestBed.inject(BackTarget), 'backBy').mockImplementation(() => undefined);
    const closing = vi.spyOn(TestBed.inject(AccountReturn), 'closeAdministration');

    close();

    expect(closing).toHaveBeenCalledOnce();
  });

  it('when the page is reloaded deeper in the administration, then Zavřít still knows where the administration was opened', async () => {
    await router.navigateByUrl('/sprava/darci');
    await fixture.whenStable();
    fixture.destroy();
    fixture = TestBed.createComponent(AdminShell);
    await fixture.whenStable();
    fixture.detectChanges();
    const steps = vi
      .spyOn(TestBed.inject(BackTarget), 'backBy')
      .mockImplementation(() => undefined);

    close();

    expect(steps).toHaveBeenCalledWith(2);
  });

  it('when the router creates the administration while it opens it, then Zavřít counts from its first page, not from the page before', async () => {
    fixture.destroy();
    await router.navigateByUrl('/aktuality', { state: { [APP_DEPTH_KEY]: 6 } });
    const opening = router.navigateByUrl('/sprava');
    fixture = TestBed.createComponent(AdminShell);
    await opening;
    await router.navigateByUrl('/sprava/darci');
    await fixture.whenStable();
    fixture.detectChanges();
    const steps = vi
      .spyOn(TestBed.inject(BackTarget), 'backBy')
      .mockImplementation(() => undefined);

    close();

    expect(steps).toHaveBeenCalledWith(2);
  });

  it('when Zpět is pressed, then the site steps back towards the parent of the page', () => {
    const back = vi.spyOn(TestBed.inject(BackTarget), 'back').mockImplementation(() => undefined);

    fixture.nativeElement
      .querySelector('.admin-sheet [role="banner"] button[aria-label="Zpět"]')
      .click();

    expect(back).toHaveBeenCalledWith('/');
  });

  it('when Esc is pressed, then the site steps back the same way as with Zpět', () => {
    const back = vi.spyOn(TestBed.inject(BackTarget), 'back').mockImplementation(() => undefined);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

    document.body.dispatchEvent(escape);

    expect(back).toHaveBeenCalledWith('/');
    expect(escape.defaultPrevented).toBe(true);
  });

  it.each([
    ['a search field', 'input', ['type', 'search']],
    ['a text area', 'textarea', null],
    ['an editable text', 'div', ['contenteditable', 'true']],
  ] as const)(
    'when Esc is pressed while typing in %s, then the field keeps it and the site stays',
    (_, tag, attribute) => {
      const back = vi.spyOn(TestBed.inject(BackTarget), 'back').mockImplementation(() => undefined);
      const field = document.createElement(tag);
      if (attribute !== null) {
        field.setAttribute(attribute[0], attribute[1]);
      }
      fixture.nativeElement.querySelector('.admin-sheet').append(field);
      const escape = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });

      field.dispatchEvent(escape);
      field.remove();

      expect(back).not.toHaveBeenCalled();
      expect(escape.defaultPrevented).toBe(false);
    },
  );

  it('when Esc is pressed while a step moves the still copy of a sheet, then the site steps back the same way as with Zpět', () => {
    const back = vi.spyOn(TestBed.inject(BackTarget), 'back').mockImplementation(() => undefined);
    const step = stillCopyOfASheet();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    step.remove();

    expect(back).toHaveBeenCalledWith('/');
  });

  it('when Esc is pressed while a dialog of the page is open, then the dialog keeps it and the site stays', () => {
    const back = vi.spyOn(TestBed.inject(BackTarget), 'back').mockImplementation(() => undefined);
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    dialog.remove();

    expect(back).not.toHaveBeenCalled();
  });
});

function stillCopyOfASheet(): HTMLElement {
  const step = document.createElement('div');
  step.className = PAGE_TRANSITION_CLASS;
  const copy = document.createElement('dialog');
  copy.setAttribute('open', '');
  step.append(copy);
  document.body.append(step);
  return step;
}
