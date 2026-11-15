import { BrowserPlatformLocation, PlatformLocation } from '@angular/common';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { AuthStatus, AuthStore } from '../auth/auth-store';
import { OWN_HISTORY_KEY, installOwnHistory } from './own-history';
import { SignedOutHistory } from './signed-out-history';

@Component({ template: '' })
class Blank {}

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Given the history of a tab where an administrator worked', () => {
  let storage: MemoryStorage;
  let uninstall: () => void;
  const status = signal<AuthStatus>('signed-in');

  beforeEach(async () => {
    window.history.replaceState(null, '', '/');
    storage = new MemoryStorage();
    uninstall = installOwnHistory(window, storage);
    status.set('signed-in');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: Blank }]),
        { provide: PlatformLocation, useClass: BrowserPlatformLocation },
        { provide: AuthStore, useValue: { status } },
      ],
    });
    const router = TestBed.inject(Router);
    const started = new Promise<void>((resolve) => {
      const events = router.events.subscribe((event) => {
        if (event instanceof NavigationEnd) {
          events.unsubscribe();
          resolve();
        }
      });
    });
    router.initialNavigation();
    await started;
    await router.navigateByUrl('/aktuality');
    await router.navigateByUrl('/sprava/darci?q=novak');
    await router.navigateByUrl('/darce/prehled');
    TestBed.inject(SignedOutHistory);
    TestBed.tick();
  });

  afterEach(() => uninstall());

  function kept(): string[] {
    return (JSON.parse(storage.getItem(OWN_HISTORY_KEY) ?? '[]') as { url: string }[]).map(
      (entry) => new URL(entry.url).pathname,
    );
  }

  it('when the session lasts, then every page stays in the history', () => {
    expect(kept()).toEqual(['/', '/aktuality', '/sprava/darci', '/darce/prehled']);
  });

  it('when the session ends and the app goes home, then the history keeps no page of the administration or the donor area', async () => {
    status.set('anonymous');
    TestBed.tick();
    await TestBed.inject(Router).navigateByUrl('/');

    expect(kept()).toEqual(['/', '/aktuality', '/']);
    expect(storage.getItem(OWN_HISTORY_KEY)).not.toContain('novak');
  });

  it('when the session ends without leaving the page, then only the current page of the donor area stays until the app moves on', () => {
    status.set('anonymous');
    TestBed.tick();

    expect(kept()).toEqual(['/', '/aktuality', '/darce/prehled']);
  });
});
