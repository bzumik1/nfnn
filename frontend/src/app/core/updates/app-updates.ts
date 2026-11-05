import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

import { APP_REVISION } from '../errors/app-revision';
import { ErrorReporter } from '../errors/error-reporter';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard, ReloadReason } from '../reload/reload-guard';
import { ServerVersion } from '../version/server-version';
import { DirtyForms } from './dirty-forms';
import { SERVICE_WORKER_UPDATES, ServiceWorkerVersionEvent } from './service-worker-updates';

export const START_UP_WINDOW_MS = 10_000;
export const UPDATE_CHECK_TIMEOUT_MS = 10_000;

const FIRST_INPUTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly serviceWorker = inject(SERVICE_WORKER_UPDATES);
  private readonly router = inject(Router);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly guard = inject(ReloadGuard);
  private readonly navigation = inject(ExternalNavigation);
  private readonly reporter = inject(ErrorReporter);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly serverVersion = inject(ServerVersion);
  private lookedFor: string | null = null;
  private readonly ready = signal(false);
  private readonly broken = signal(false);
  private readonly startedAt = Date.now();
  private interacted = false;
  private leftDirtyPage = false;
  private startAddress: string | null = null;
  private started = false;

  readonly versionReady = this.ready.asReadonly();
  readonly mustReload = this.broken.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.watchFirstInput();
    this.lookForServerBuild();
    const versions = this.serviceWorker.versionEvents.subscribe((event) => this.onVersion(event));
    const unrecoverable = this.serviceWorker.unrecoverable.subscribe(() => this.onUnrecoverable());
    const navigations = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.onNavigationStart(event.url);
      } else if (event instanceof NavigationEnd) {
        this.startAddress ??= this.here();
        this.onNavigationEnd(event.urlAfterRedirects);
      }
    });
    this.destroyRef.onDestroy(() => {
      versions.unsubscribe();
      unrecoverable.unsubscribe();
      navigations.unsubscribe();
    });
  }

  loadNewVersion(url: string): void {
    if (!this.serviceWorker.isEnabled) {
      this.navigation.loadFromServer(url);
      return;
    }
    const checked = this.serviceWorker.checkForUpdate().catch(() => false);
    const waited = new Promise((done) => setTimeout(done, UPDATE_CHECK_TIMEOUT_MS));
    void Promise.race([checked, waited]).then(() => this.navigation.loadFromServer(url));
  }

  private lookForServerBuild(): void {
    effect(
      () => {
        const revision = this.serverVersion.revision();
        if (
          !this.serviceWorker.isEnabled ||
          revision === null ||
          revision === APP_REVISION ||
          revision === this.lookedFor
        ) {
          return;
        }
        this.lookedFor = revision;
        this.serviceWorker.checkForUpdate().catch(() => false);
      },
      { injector: this.injector },
    );
  }

  private watchFirstInput(): void {
    const view = this.window;
    if (!view) {
      return;
    }
    const noticed = (): void => {
      this.interacted = true;
      for (const type of FIRST_INPUTS) {
        view.removeEventListener(type, noticed, { capture: true });
      }
    };
    for (const type of FIRST_INPUTS) {
      view.addEventListener(type, noticed, { capture: true, passive: true });
    }
    this.destroyRef.onDestroy(noticed);
  }

  private onVersion(event: ServiceWorkerVersionEvent): void {
    if (event.type === 'installation-failed') {
      this.reporter.report('sw-install', 'service-worker');
      return;
    }
    if (event.type !== 'ready') {
      return;
    }
    this.ready.set(true);
    const stillStarting =
      !this.interacted &&
      Date.now() - this.startedAt < START_UP_WINDOW_MS &&
      (this.startAddress === null || this.startAddress === this.here());
    if (stillStarting && !this.dirtyForms.any()) {
      this.reloadInto(this.here(), 'update');
    }
  }

  private onUnrecoverable(): void {
    this.reporter.report('sw-unrecoverable', 'service-worker');
    if (this.dirtyForms.any() || !this.reloadInto(this.here(), 'unrecoverable')) {
      this.broken.set(true);
    }
  }

  private onNavigationStart(url: string): void {
    if (!this.ready() || pathOf(url) === pathOf(this.router.url)) {
      return;
    }
    if (this.dirtyForms.any()) {
      this.leftDirtyPage = true;
      return;
    }
    this.reloadInto(url, 'update');
  }

  private onNavigationEnd(url: string): void {
    if (!this.ready() || !this.leftDirtyPage || this.dirtyForms.any()) {
      return;
    }
    this.leftDirtyPage = false;
    this.reloadInto(url, 'update');
  }

  private reloadInto(url: string, reason: ReloadReason): boolean {
    if (!this.guard.claim(reason)) {
      return false;
    }
    this.navigation.loadFromServer(url);
    return true;
  }

  private here(): string {
    const location = this.window?.location;
    return location ? `${location.pathname}${location.search}${location.hash}` : this.router.url;
  }
}

function pathOf(url: string): string {
  return url.replace(/[?#].*$/, '');
}
