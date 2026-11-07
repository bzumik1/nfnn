import { DOCUMENT } from '@angular/common';
import { inject, Injectable, InjectionToken } from '@angular/core';

import { AdministrationAccess } from '../auth/administration-access';
import { AuthStore } from '../auth/auth-store';
import { Connectivity } from '../connectivity/connectivity';
import { APP_REVISION } from '../errors/app-revision';
import { platformOf } from '../errors/client-platform';
import { errorNameOf } from '../errors/error-vocabulary';
import { saveBlob, type SavedFile } from '../files/file-download';
import { SESSION_STORAGE } from '../reload/reload-guard';
import {
  BOOT_LAST_ATTEMPT_KEY,
  BOOT_RECOVERED_KEY,
  CODE_ARRIVED_ATTRIBUTE,
  STARTED_ATTRIBUTE,
} from '../updates/boot-report';
import { DEVICE_COPY_DIAGNOSTICS, DeviceCopyDiagnostics } from './device-copy-diagnostics';
import { DiagnosticEvents } from './diagnostic-events';
import {
  createdAtOf,
  DiagnosticsFile,
  DiagnosticSource,
  diagnosticsFileName,
  pageOf,
  RELOAD_REASONS,
  sanitizedDiagnostics,
  SessionAccount,
} from './diagnostics-schema';

export const BROWSER_ANSWER_WAIT_MS = 2_000;
export const NEARLY_FULL_FREE_BYTES = 50 * 1024 * 1024;
export const NEARLY_FULL_SHARE = 0.9;
const LONGEST_KEPT_VALUE = 512;
const APPLE_TOUCH_DEVICE = /iPad|iPhone|iPod/;
const DESKTOP_SAFARI_ON_IPAD = /Macintosh/;
const JSON_TYPE = 'application/json';

export type PreparedDiagnostics = SavedFile;

export type DiagnosticsShareOutcome = 'shared' | 'dismissed' | 'failed';

export interface SharingNavigator {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
  canShare?(data: ShareData): boolean;
  share?(data: ShareData): Promise<void>;
}

export const DIAGNOSTICS_NAVIGATOR = new InjectionToken<SharingNavigator>(
  'navigator for delivering the diagnostic file',
  { providedIn: 'root', factory: () => navigator },
);

interface WorkerCounts {
  readonly registrations: number;
  readonly active: number;
  readonly waiting: number;
  readonly installing: number;
}

function answered<T>(question: () => Promise<T> | undefined): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), BROWSER_ANSWER_WAIT_MS);
  });
  let asked: Promise<T | null>;
  try {
    asked = Promise.resolve(question() ?? null).catch(() => null);
  } catch {
    asked = Promise.resolve(null);
  }
  return Promise.race([asked, late]).finally(() => clearTimeout(timer));
}

function present(check: () => unknown): boolean {
  try {
    return Boolean(check());
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class Diagnostics {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthStore);
  private readonly access = inject(AdministrationAccess);
  private readonly connectivity = inject(Connectivity);
  private readonly events = inject(DiagnosticEvents);
  private readonly sessionStorage = inject(SESSION_STORAGE);
  private readonly deviceCopy = inject(DEVICE_COPY_DIAGNOSTICS);
  private readonly sharing = inject(DIAGNOSTICS_NAVIGATOR);

  async file(source: DiagnosticSource): Promise<DiagnosticsFile> {
    const view = this.document.defaultView;
    const navigator = view?.navigator ?? null;
    const [persisted, nearlyFull, workers, caches, deviceCopy] = await Promise.all([
      answered(() => navigator?.storage?.persisted?.()),
      answered(() => this.nearlyFull(navigator)),
      answered(() => this.workerCounts(navigator)),
      answered(() => view?.caches?.keys().then((names) => names.length)),
      answered(() => this.deviceCopy()),
    ]);
    const now = Date.now();
    const root = this.document.documentElement;
    return sanitizedDiagnostics({
      createdAt: createdAtOf(new Date(now)),
      source,
      app: {
        revision: APP_REVISION,
        bundle: null,
        started: root.hasAttribute(STARTED_ATTRIBUTE),
        codeArrived: root.hasAttribute(CODE_ARRIVED_ATTRIBUTE),
      },
      platform: platformOf(view),
      page: pageOf(view?.location.pathname ?? ''),
      network: {
        browserOnline: navigator?.onLine !== false,
        appOffline: this.connectivity.offline(),
        offlineCause: this.connectivity.cause(),
      },
      support: this.support(view),
      storage: { persisted, nearlyFull },
      serviceWorker: {
        controlled: present(() => navigator?.serviceWorker?.controller),
        registrations: workers?.registrations ?? null,
        active: workers?.active ?? null,
        waiting: workers?.waiting ?? null,
        installing: workers?.installing ?? null,
        caches,
      },
      reloads: Object.fromEntries(
        RELOAD_REASONS.map((reason) => [reason, this.secondsSince(`nfnn.reload.${reason}`, now)]),
      ),
      boot: {
        recovered: this.kept(BOOT_RECOVERED_KEY) !== null,
        previous: this.previousStart(now),
      },
      session: this.session(),
      deviceCopy: this.copyState(deviceCopy),
      events: this.events.listed(),
    });
  }

  async prepare(source: DiagnosticSource): Promise<PreparedDiagnostics> {
    const file = await this.file(source);
    return {
      blob: new Blob([`${JSON.stringify(file, null, 2)}\n`], { type: JSON_TYPE }),
      fileName: diagnosticsFileName(new Date()),
    };
  }

  save(prepared: PreparedDiagnostics): void {
    saveBlob(prepared);
  }

  needsSecondTap(prepared: PreparedDiagnostics): boolean {
    const agent = this.sharing.userAgent;
    const appleTouch =
      APPLE_TOUCH_DEVICE.test(agent) ||
      (DESKTOP_SAFARI_ON_IPAD.test(agent) && this.sharing.maxTouchPoints > 1);
    return appleTouch && this.canShare(prepared);
  }

  async share(prepared: PreparedDiagnostics): Promise<DiagnosticsShareOutcome> {
    if (this.sharing.share === undefined) {
      return 'failed';
    }
    try {
      await this.sharing.share({ files: [this.asFile(prepared)] });
      return 'shared';
    } catch (failure: unknown) {
      return errorNameOf(failure) === 'AbortError' ? 'dismissed' : 'failed';
    }
  }

  private canShare(prepared: PreparedDiagnostics): boolean {
    try {
      return this.sharing.canShare?.({ files: [this.asFile(prepared)] }) ?? false;
    } catch {
      return false;
    }
  }

  private asFile(prepared: PreparedDiagnostics): File {
    return new File([prepared.blob], prepared.fileName, { type: JSON_TYPE });
  }

  private async nearlyFull(navigator: Navigator | null): Promise<boolean | null> {
    const estimate = await navigator?.storage?.estimate?.();
    const { usage, quota } = estimate ?? {};
    if (typeof usage !== 'number' || typeof quota !== 'number' || quota <= 0) {
      return null;
    }
    return quota - usage < NEARLY_FULL_FREE_BYTES || usage / quota >= NEARLY_FULL_SHARE;
  }

  private async workerCounts(navigator: Navigator | null): Promise<WorkerCounts | null> {
    const registrations = await navigator?.serviceWorker?.getRegistrations?.();
    if (registrations === undefined) {
      return null;
    }
    return {
      registrations: registrations.length,
      active: registrations.filter((registration) => registration.active !== null).length,
      waiting: registrations.filter((registration) => registration.waiting !== null).length,
      installing: registrations.filter((registration) => registration.installing !== null).length,
    };
  }

  private support(view: Window | null): Record<string, boolean> {
    const navigator = view?.navigator;
    return {
      serviceWorker: present(() => navigator && 'serviceWorker' in navigator),
      indexedDb: present(() => view?.indexedDB),
      webLocks: present(() => navigator?.locks),
      broadcastChannel: present(() => typeof BroadcastChannel === 'function'),
      subtleCrypto: present(() => view?.crypto?.subtle),
      webAuthn: present(() => typeof PublicKeyCredential === 'function'),
      webAssembly: present(() => typeof WebAssembly === 'object'),
      storageManager: present(() => navigator?.storage),
      trustedTypes: present(() => (view as { trustedTypes?: unknown } | null)?.trustedTypes),
    };
  }

  private session(): Record<string, unknown> {
    const kind = this.auth.session();
    const account = this.account();
    const administrator = account === 'administrator';
    return {
      account,
      kind,
      administrationUnlocked: administrator ? this.access.unlocked() : null,
    };
  }

  private account(): SessionAccount {
    if (this.auth.status() === 'unknown') {
      return 'unknown';
    }
    if (!this.auth.signedIn()) {
      return 'none';
    }
    if (this.auth.storesNothing()) {
      return 'signed-in';
    }
    return this.auth.isAdmin() ? 'administrator' : 'donor';
  }

  private copyState(state: DeviceCopyDiagnostics | null): Record<string, unknown> | null {
    if (state === null) {
      return null;
    }
    return {
      mode: state.mode,
      donor: state.donorCopy,
      storedAge: state.storedAge,
      administration: this.auth.storesNothing() ? null : state.administrationCopy,
    };
  }

  private kept(key: string): string | null {
    try {
      const value = this.sessionStorage().getItem(key);
      return value !== null && value.length <= LONGEST_KEPT_VALUE ? value : null;
    } catch {
      return null;
    }
  }

  private secondsSince(key: string, now: number): number | null {
    const kept = this.kept(key);
    const at = kept === null ? Number.NaN : Number(kept);
    return Number.isFinite(at) && at <= now ? Math.floor((now - at) / 1000) : null;
  }

  private previousStart(now: number): unknown {
    const kept = this.kept(BOOT_LAST_ATTEMPT_KEY);
    if (kept === null) {
      return null;
    }
    try {
      const attempt: unknown = JSON.parse(kept);
      if (attempt === null || typeof attempt !== 'object') {
        return null;
      }
      const { panelShown, codeArrived, waitedSeconds, at } = attempt as Record<string, unknown>;
      const secondsAgo =
        typeof at === 'number' && Number.isFinite(at) && at <= now
          ? Math.floor((now - at) / 1000)
          : null;
      return { panelShown, codeArrived, waitedSeconds, secondsAgo };
    } catch {
      return null;
    }
  }
}
