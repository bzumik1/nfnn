import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, Injector, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { NavigationPreview } from '../navigation/navigation-preview';

import { Connectivity } from '../connectivity/connectivity';
import { APP_REVISION } from '../errors/app-revision';
import { ErrorReporter } from '../errors/error-reporter';
import { ExternalNavigation } from '../navigation/external-navigation';
import { ReloadGuard, ReloadReason, SESSION_STORAGE } from '../reload/reload-guard';
import { ReloadPlace } from '../reload/reload-place';
import { ServerVersion } from '../version/server-version';
import { DirtyForms } from './dirty-forms';
import { RunningWork } from './running-work';
import { SERVICE_WORKER_UPDATES, ServiceWorkerVersionEvent } from './service-worker-updates';

export const START_UP_WINDOW_MS = 10_000;
export const UPDATE_CHECK_TIMEOUT_MS = 10_000;

const FIRST_INPUTS = ['pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
const MOMENTS_THAT_MAY_FREE_THE_PAGE = ['submit', 'reset', 'close', 'pause', 'ended'] as const;

export const UPDATED_FOR_KEY = 'nfnn.update.loaded-for';

@Injectable({ providedIn: 'root' })
export class AppUpdates {
  private readonly serviceWorker = inject(SERVICE_WORKER_UPDATES);
  private readonly router = inject(Router);
  private readonly dirtyForms = inject(DirtyForms);
  private readonly runningWork = inject(RunningWork);
  private readonly connectivity = inject(Connectivity);
  private readonly guard = inject(ReloadGuard);
  private readonly place = inject(ReloadPlace);
  private readonly storage = inject(SESSION_STORAGE);
  private readonly navigation = inject(ExternalNavigation);
  private readonly preview = inject(NavigationPreview);
  private readonly reporter = inject(ErrorReporter);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly serverVersion = inject(ServerVersion);
  private lookedFor: string | null = null;
  private readonly ready = signal(false);
  private readonly unrecoverable = signal(false);
  private readonly startedAt = Date.now();
  private interacted = false;
  private movedOnWhileBusy = false;
  private fetchingNewVersion = false;
  private startAddress: string | null = null;
  private started = false;

  readonly versionReady = this.ready.asReadonly();

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.watchFirstInput();
    this.lookForServerBuild();
    this.reloadWhenOutdatedAndFree();
    this.watchThePage();
    const versions = this.serviceWorker.versionEvents.subscribe((event) => this.onVersion(event));
    const unrecoverable = this.serviceWorker.unrecoverable.subscribe(() => this.onUnrecoverable());
    const navigations = this.router.events.subscribe((event) => {
      if (this.preview.drives()) {
        return;
      }
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
    this.place.keep(url);
    if (!this.serviceWorker.isEnabled) {
      this.navigation.loadFromServer(url);
      return;
    }
    void this.fetchNewVersion().then(() => this.navigation.loadFromServer(url));
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

  private reloadWhenOutdatedAndFree(): void {
    effect(
      () => {
        if (this.outdated() && this.free()) {
          this.reloadHere();
        }
      },
      { injector: this.injector },
    );
  }

  private watchThePage(): void {
    const view = this.window;
    const shownAgain = (event: Event): void => {
      if ((event as PageTransitionEvent).persisted && this.serviceWorker.isEnabled) {
        this.serviceWorker.checkForUpdate().catch(() => false);
      }
    };
    const mayBeFree = (): void => {
      setTimeout(() => {
        if (this.outdated() && this.free()) {
          this.reloadHere();
        }
      });
    };
    view?.addEventListener('pageshow', shownAgain);
    for (const type of MOMENTS_THAT_MAY_FREE_THE_PAGE) {
      this.document.addEventListener(type, mayBeFree, { capture: true });
    }
    this.destroyRef.onDestroy(() => {
      view?.removeEventListener('pageshow', shownAgain);
      for (const type of MOMENTS_THAT_MAY_FREE_THE_PAGE) {
        this.document.removeEventListener(type, mayBeFree, { capture: true });
      }
    });
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
    if (stillStarting && this.free()) {
      this.reloadInto(this.here(), 'update');
    }
  }

  private onUnrecoverable(): void {
    this.reporter.report('sw-unrecoverable', 'service-worker');
    this.unrecoverable.set(true);
  }

  private onNavigationStart(url: string): void {
    if (!this.pending() || pathOf(url) === pathOf(this.router.url)) {
      return;
    }
    if (!this.free()) {
      this.movedOnWhileBusy = true;
      return;
    }
    this.reloadAt(url);
  }

  private onNavigationEnd(url: string): void {
    if (!this.movedOnWhileBusy || !this.pending() || !this.free()) {
      return;
    }
    this.movedOnWhileBusy = false;
    this.reloadAt(url);
  }

  private pending(): boolean {
    return this.ready() || this.outdated();
  }

  private outdated(): boolean {
    return this.serverVersion.mustUpdate() || this.unrecoverable();
  }

  private free(): boolean {
    return (
      !this.dirtyForms.any() &&
      !this.runningWork.any() &&
      !this.connectivity.offline() &&
      !this.connectivity.browserSaysOffline() &&
      !this.somethingOpenOrPlaying()
    );
  }

  private somethingOpenOrPlaying(): boolean {
    return (
      this.document.querySelector('dialog[open]') !== null ||
      Array.from(this.document.querySelectorAll('video, audio')).some(
        (media) => !(media as HTMLMediaElement).paused,
      )
    );
  }

  private reloadHere(): void {
    this.reloadAt(this.here());
  }

  private reloadAt(url: string): void {
    if (this.unrecoverable()) {
      this.reloadInto(url, 'unrecoverable');
      return;
    }
    if (this.ready()) {
      this.reloadInto(url, 'update');
      return;
    }
    if (!this.serverVersion.mustUpdate() || this.loadedForThisGeneration()) {
      return;
    }
    if (!this.serviceWorker.isEnabled) {
      this.reloadForThisGeneration(url);
      return;
    }
    if (this.fetchingNewVersion) {
      return;
    }
    this.fetchingNewVersion = true;
    void this.fetchNewVersion().then((found) => {
      this.fetchingNewVersion = false;
      if (found === true && this.free()) {
        this.reloadForThisGeneration(this.here());
      }
    });
  }

  private reloadForThisGeneration(url: string): void {
    const loadedFor = this.generationPair();
    if (this.reloadInto(url, 'update')) {
      try {
        this.storage().setItem(UPDATED_FOR_KEY, loadedFor);
      } catch {
        return;
      }
    }
  }

  private loadedForThisGeneration(): boolean {
    try {
      return this.storage().getItem(UPDATED_FOR_KEY) === this.generationPair();
    } catch {
      return true;
    }
  }

  private generationPair(): string {
    return `${this.serverVersion.apiGeneration()}:${APP_REVISION}`;
  }

  private fetchNewVersion(): Promise<unknown> {
    const checked = this.serviceWorker.checkForUpdate().catch(() => false);
    const waited = new Promise((done) => setTimeout(done, UPDATE_CHECK_TIMEOUT_MS));
    return Promise.race([checked, waited]);
  }

  private reloadInto(url: string, reason: ReloadReason): boolean {
    if (!this.guard.claim(reason)) {
      return false;
    }
    this.place.keep(url);
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
