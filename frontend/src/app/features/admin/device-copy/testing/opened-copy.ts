import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type Provider, signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { authInterceptor } from '../../../../core/auth/auth-interceptor';
import { Connectivity } from '../../../../core/connectivity/connectivity';
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

export function openedCopyProviders(contents: CopyContents, offline: boolean): Provider[] {
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
      useValue: { offline: signal(offline).asReadonly(), cause: signal(null).asReadonly() },
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
}

export async function openOfflineFromCopy(
  component: Type<unknown>,
  contents: CopyContents,
  route: { readonly path: string; readonly url: string } = { path: 'sprava', url: '/sprava' },
): Promise<PageFromCopy> {
  localStorage.clear();
  await TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([{ path: route.path, component }]),
      ...openedCopyProviders(contents, true),
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
  return { page: harness.routeNativeElement as HTMLElement, http, settle };
}

export function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
