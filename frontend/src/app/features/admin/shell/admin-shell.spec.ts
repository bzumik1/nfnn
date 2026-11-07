import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { DIALOG_PRESENTATION } from '../../../shared/ui/dialog/dialog-presentation';
import { DIALOG_SUSPENSION } from '../../../shared/ui/dialog/dialog-suspension';
import { AdminShell } from './admin-shell';
import { ADMINISTRATION_LOCK } from './administration-lock';

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

@Component({ template: '<p class="lock-panel" tabindex="-1">Správa je zamčená</p>' })
class LockPanel {}

describe('Given an administrator anywhere in the administration', () => {
  const compact = signal(false);
  const locked = signal(false);
  const keepsPage = signal(false);
  const firstDownload = signal<{ done: number; total: number } | null>(null);
  let fixture: ComponentFixture<AdminShell>;
  let router: Router;
  let pushSettings: TestRequest[];

  beforeEach(async () => {
    compact.set(false);
    locked.set(false);
    keepsPage.set(false);
    firstDownload.set(null);
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
          },
        },
        provideRouter([
          { path: 'sprava', component: Page },
          { path: 'sprava/darci', component: Page },
          { path: 'sprava/darci/:id', component: Page },
          { path: 'sprava/platby', component: Page },
        ]),
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AdminShell);
    await router.navigateByUrl('/sprava');
    await settle();
    pushSettings = TestBed.inject(HttpTestingController).match('/api/admin/operations/push');
    for (const request of pushSettings) {
      request.flush({ publicKey: 'B', subscriptions: [], openAlerts: [] });
    }
  });

  it('when the administration opens, then it reads the push settings once for the badge of the app icon', async () => {
    await router.navigateByUrl('/sprava/darci');
    await settle();

    expect(pushSettings).toHaveLength(1);
    TestBed.inject(HttpTestingController).expectNone('/api/admin/operations/push');
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
      clean(link.textContent),
    );
  }

  it('when the panel is shown, then it lists the overview and the sections grouped by how often they are needed', () => {
    const groups = Array.from(nav().querySelectorAll('ul')).map((list) => ({
      label: clean(
        list.hasAttribute('aria-labelledby')
          ? fixture.nativeElement.querySelector(`#${list.getAttribute('aria-labelledby')}`)
              ?.textContent
          : '',
      ),
      links: Array.from(list.querySelectorAll('a')).map((link) => [
        clean(link.textContent),
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
          ['Projekty', '/sprava/projekty'],
        ],
      },
      {
        label: 'Občas',
        links: [
          ['Hromadná potvrzení', '/sprava/hromadna-potvrzeni'],
          ['Fotka v sekci O nás', '/sprava/o-nas'],
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

  it('when it opens, then the app header offers the account and the site tabs stay at the bottom, as everywhere in the app', () => {
    expect(element('header.app-header a.brand')?.getAttribute('href')).toBe('/');
    const tabs = element('nav[aria-label="Hlavní sekce"]');
    expect(
      Array.from(tabs?.querySelectorAll('a') ?? []).map((link) => clean(link.textContent)),
    ).toEqual(['O nás', 'Aktuality', 'Pomáháme', 'Přispět']);
    expect(element('app-dashboard-top-bar')).toBeNull();
  });

  it('when the page is shown, then it stands in the main landmark of the skip link', () => {
    expect(element('main#obsah h1')?.textContent).toBe('Stránka');
  });

  it('when a page of the administration opens a dialog, then the dialog comes up as a sheet from the bottom', () => {
    expect(clean(element('main#obsah .look')?.textContent)).toBe('sheet');
  });

  describe('when the window narrows to a phone or a tablet', () => {
    beforeEach(async () => {
      compact.set(true);
      await settle();
    });

    it('then no side panel is drawn and the same page stays in the main landmark', () => {
      expect(element('#admin-nav')).toBeNull();
      expect(element('main#obsah h1')?.textContent).toBe('Stránka');
    });

    it('then no menu button stands above the page, since the overview lists the sections', () => {
      expect(fixture.nativeElement.querySelector('main#obsah')?.previousElementSibling).toBeNull();
      expect(element('button.side-nav-toggle')).toBeNull();
    });
  });

  describe('when the administration is locked', () => {
    beforeEach(async () => {
      locked.set(true);
      await settle();
    });

    it('then the lock panel stands in the main landmark instead of the page', () => {
      expect(clean(element('main#obsah .lock-panel')?.textContent)).toBe('Správa je zamčená');
      expect(element('main#obsah h1')).toBeNull();
    });

    it('then the header and the tabs stay, so the administrator can still leave', () => {
      expect(element('header.app-header')).not.toBeNull();
      expect(element('nav[aria-label="Hlavní sekce"]')).not.toBeNull();
    });

    it('and it is unlocked again, then the page comes back', async () => {
      locked.set(false);
      await settle();

      expect(element('main#obsah h1')?.textContent).toBe('Stránka');
      expect(element('.lock-panel')).toBeNull();
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

      expect(clean(element('.admin-first-download')?.textContent)).toBe('');
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
      expect(element('.suspended')?.textContent).toBe('true');
    });

    it('and it is unlocked again, then the dialogs of the page come back and the focus returns to the field it left', async () => {
      keepsPage.set(false);
      locked.set(false);
      await settle();
      await settle();

      expect(element('.suspended')?.textContent).toBe('false');
      expect(document.activeElement).toBe(element('#pole'));
    });

    it('then the page stays alive under the panel, hidden and out of reach', () => {
      const kept = element('main#obsah .admin-page')!;

      expect(clean(element('main#obsah .lock-panel')?.textContent)).toBe('Správa je zamčená');
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

      expect(clean(element('main#obsah .admin-first-download')?.textContent)).toBe(
        'Ukládáme správu do zařízení 18 z 40',
      );
      expect(element('main#obsah .admin-first-download')?.getAttribute('aria-live')).toBe('polite');
    });

    it('and it is stored, then the bar goes', async () => {
      firstDownload.set({ done: 40, total: 40 });
      await settle();
      firstDownload.set(null);
      await settle();

      expect(clean(element('.admin-first-download')?.textContent)).toBe('');
    });
  });
});
