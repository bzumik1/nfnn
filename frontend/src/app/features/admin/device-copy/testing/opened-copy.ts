import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, type Provider, type Signal, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { Connectivity, type OfflineCause } from '../../../../core/connectivity/connectivity';
import type {
  AccountStore,
  CopyContents,
  StoredChunk,
} from '../../../../core/device/store/account-store';
import { DeviceVault, type OpenedCopy } from '../../../../core/device/store/device-vault';
import { AdministrationCopyDownload } from '../administration-copy-download';

export const COPY_STORED_AT = '2026-11-12T08:00:00.000Z';

export function copyOf(chunks: Readonly<Record<string, readonly unknown[]>>): CopyContents {
  return {
    chunks: Object.entries(chunks).map(([id, rows]): StoredChunk => ({
      id,
      rowsSha256: 'x',
      rows,
    })),
    summary: { donations: { today: '2026-11-12', byYear: [] } },
    storedAt: COPY_STORED_AT,
  };
}

export interface FakeConnectivity {
  readonly offline: Signal<boolean>;
  readonly cause: Signal<OfflineCause | null>;
  readonly set: (cause: OfflineCause | null) => void;
}

export function fakeConnectivity(cause: OfflineCause | null): FakeConnectivity {
  const held = signal(cause);
  return {
    offline: computed(() => held() !== null),
    cause: held.asReadonly(),
    set: (next) => held.set(next),
  };
}

export function openedCopyProviders(
  contents: CopyContents,
  offline: boolean | FakeConnectivity,
): Provider[] {
  const connectivity =
    typeof offline === 'boolean' ? fakeConnectivity(offline ? 'network' : null) : offline;
  const opened: OpenedCopy = {
    store: {
      copyId: 'copy-1',
      contents: signal(contents).asReadonly(),
    } as unknown as AccountStore,
    reason: 'unlocked',
    account: { email: 'admin@example.cz', userHandle: 'h', administrator: true },
  };
  return [
    { provide: DeviceVault, useValue: { administration: signal(opened).asReadonly() } },
    {
      provide: Connectivity,
      useValue: { offline: connectivity.offline, cause: connectivity.cause },
    },
    {
      provide: AdministrationCopyDownload,
      useValue: {
        refresh: () => Promise.resolve('unchanged'),
        checkedAt: signal<string | null>(null).asReadonly(),
        writesAtStart: () => null,
      },
    },
  ];
}

export const NO_PEOPLE = {
  members: [],
  note: null,
  footnote: null,
  noteVersion: 'note-version',
  footnoteVersion: 'footnote-version',
};

export function contentCopy(chunks: Readonly<Record<string, readonly unknown[]>>): CopyContents {
  return copyOf({ 'content/people': [NO_PEOPLE], ...chunks });
}

export interface PageFromCopy {
  readonly page: HTMLElement;
  readonly http: HttpTestingController;
  readonly settle: () => Promise<void>;
  readonly connectivity: FakeConnectivity;
}

interface CopyRoute {
  readonly path: string;
  readonly url: string;
}

const ADMIN_HOME: CopyRoute = { path: 'sprava', url: '/sprava' };

export function openOfflineFromCopy(
  component: Type<unknown>,
  contents: CopyContents,
  route: CopyRoute = ADMIN_HOME,
  cause: OfflineCause = 'network',
): Promise<PageFromCopy> {
  return openWithCopy(component, contents, route, cause);
}

export async function openWithCopy(
  component: Type<unknown>,
  contents: CopyContents,
  route: CopyRoute = ADMIN_HOME,
  cause: OfflineCause | null = null,
): Promise<PageFromCopy> {
  const connectivity = fakeConnectivity(cause);
  localStorage.clear();
  await TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: route.path, component }]),
      ...openedCopyProviders(contents, connectivity),
    ],
  }).compileComponents();
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create(route.url);
  const settle = async () => {
    for (let round = 0; round < 3; round++) {
      await harness.fixture.whenStable();
      harness.fixture.detectChanges();
    }
  };
  await settle();
  return { page: harness.routeNativeElement as HTMLElement, http, settle, connectivity };
}

export function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function waitsForConnection(page: HTMLElement, label: string): void {
  const control = [...page.querySelectorAll<HTMLElement>('button, input[type="file"], label')].find(
    (candidate) => textOf(candidate) === label,
  );
  const offered = [...page.querySelectorAll('button')].map((button) => textOf(button));
  expect(control, `the control ${label} among ${offered.join(' | ')}`).toBeDefined();
  expect(control?.getAttribute('aria-disabled')).toBe('true');
  const hints = (control?.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => textOf(page.ownerDocument.getElementById(id)));
  expect(hints).toContain('Potřebuje připojení');
}
