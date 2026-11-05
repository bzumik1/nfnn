import { HttpHeaders } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { SignedOutNotice } from '../../core/auth/signed-out-notice';
import { Connectivity } from '../../core/navigation/connectivity';
import { ExternalNavigation } from '../../core/navigation/external-navigation';
import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';
import { ChunkProbe } from '../../core/reload/chunk-probe';
import { ReloadGuard } from '../../core/reload/reload-guard';
import { AppUpdates } from '../../core/updates/app-updates';
import { SERVICE_WORKER_UPDATES } from '../../core/updates/service-worker-updates';
import { API_GENERATION } from '../../core/version/api-generation';
import { ServerVersion } from '../../core/version/server-version';
import { DialogAnnouncer } from '../../shared/ui/dialog/dialog-announcer';
import { UpdateNotice } from './update-notice';

@Component({ template: '' })
class Page {}

const MESSAGE = 'Web má novou verzi. Než budete cokoli odesílat, načtěte ji.';
const RELOAD_MESSAGE =
  'Web má novou verzi a tahle stránka ji potřebuje načíst. Rozepsaný text si nejdřív zkopírujte, načtením by se ztratil.';

describe('Given the notice that the app must load a new version', () => {
  let fixture: ComponentFixture<UpdateNotice>;
  let loadFromServer: ReturnType<typeof vi.fn>;
  let unrecoverable: Subject<string>;

  beforeEach(async () => {
    loadFromServer = vi.fn();
    unrecoverable = new Subject<string>();
    await TestBed.configureTestingModule({
      imports: [UpdateNotice],
      providers: [
        provideRouter([{ path: 'darce/prehled', component: Page }]),
        { provide: ExternalNavigation, useValue: { loadFromServer } },
        { provide: ReloadGuard, useValue: { claim: () => false } },
        { provide: Connectivity, useValue: { isOffline: () => false } },
        { provide: ChunkProbe, useValue: { reloadWouldLand: () => Promise.resolve(false) } },
        {
          provide: SERVICE_WORKER_UPDATES,
          useValue: {
            isEnabled: false,
            versionEvents: new Subject(),
            unrecoverable,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate: () => Promise.resolve(false),
          },
        },
      ],
    }).compileComponents();
    TestBed.inject(AppUpdates).start();
    fixture = TestBed.createComponent(UpdateNotice);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
    document.documentElement.classList.remove('has-floating-notice');
  });

  const element = () => fixture.nativeElement as HTMLElement;
  const region = () => element().querySelector('[aria-live="polite"]') as HTMLElement;
  const text = () => region().textContent?.replace(/\s+/g, ' ').trim();
  const button = () =>
    Array.from(element().querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === 'Načíst novou verzi',
    );

  async function serverSpeaks(generation: number): Promise<void> {
    TestBed.inject(ServerVersion).observe(
      new HttpHeaders({ 'Cache-Control': 'no-store', 'Nfnn-Api': String(generation) }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('when the page is shown, then the notice adds no status region beside the ones of the page', () => {
    expect(element().querySelector('[role="status"]')).toBeNull();
  });

  it('when the server speaks the API the app is built for, then its live region is there and stays quiet', async () => {
    await serverSpeaks(API_GENERATION);

    expect(region()).not.toBeNull();
    expect(region().getAttribute('aria-atomic')).toBe('true');
    expect(text()).toBe('');
    expect(document.documentElement.classList).not.toContain('has-floating-notice');
  });

  describe('when the server speaks another API generation', () => {
    beforeEach(() => serverSpeaks(API_GENERATION + 1));

    it('then the live region says so and offers to load the new version, and the page keeps room for it', () => {
      expect(text()).toBe(`${MESSAGE} Načíst novou verzi`);
      expect(button()).toBeDefined();
      expect(document.documentElement.classList).toContain('has-floating-notice');
    });

    it('then it leaves the focus where it was', () => {
      expect(element().contains(document.activeElement)).toBe(false);
    });

    it('and the visitor presses the button, then the page they are on loads again from the server', async () => {
      await TestBed.inject(Router).navigateByUrl('/darce/prehled');

      button()?.click();

      expect(loadFromServer).toHaveBeenCalledWith('/darce/prehled');
    });

    it('and the server speaks the app generation again, then the notice goes', async () => {
      await serverSpeaks(API_GENERATION);

      expect(text()).toBe('');
      expect(document.documentElement.classList).not.toContain('has-floating-notice');
    });
  });

  describe('when the service worker cannot serve this version any more and the page was not reloaded for it', () => {
    beforeEach(async () => {
      unrecoverable.next('Hash mismatch');
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('then the live region asks to load the new version and to copy any half-typed text first', () => {
      expect(text()).toBe(`${RELOAD_MESSAGE} Načíst novou verzi`);
    });

    it('and the visitor presses the button, then the page loads again from the server and the button says it is loading', async () => {
      await TestBed.inject(Router).navigateByUrl('/darce/prehled');

      button()?.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(loadFromServer).toHaveBeenCalledWith('/darce/prehled');
      expect(text()).toBe(`${RELOAD_MESSAGE} Načítáme novou verzi…`);
      expect(element().querySelector('button')?.disabled).toBe(true);
    });
  });

  it('when the signed-out notice is on the screen, then this one waits until it is gone', async () => {
    const signedOut = TestBed.inject(SignedOutNotice);
    signedOut.show();
    await serverSpeaks(API_GENERATION + 1);

    expect(text()).toBe('');

    signedOut.dismiss();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text()).toBe(`${MESSAGE} Načíst novou verzi`);
  });

  it('when a page failed to open and its own notice offers to load it again, then this one stays away', async () => {
    await TestBed.inject(ChunkLoadRecovery).handleNavigationError(
      new NavigationError(
        1,
        '/aktuality',
        new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk-x.js'),
      ),
    );
    await serverSpeaks(API_GENERATION + 1);

    expect(text()).toBe('');
  });

  it('when a modal dialog is open as it appears, then the dialog announces it, because the page behind is inert', async () => {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.showModal();

    await serverSpeaks(API_GENERATION + 1);

    expect(TestBed.inject(DialogAnnouncer).message()).toBe(MESSAGE);
  });

  it('when no dialog is open as it appears, then nothing is left for a dialog opened later to announce', async () => {
    await serverSpeaks(API_GENERATION + 1);

    expect(TestBed.inject(DialogAnnouncer).message()).toBe('');
  });
});
