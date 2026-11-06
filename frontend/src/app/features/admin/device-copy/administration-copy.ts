import { computed, inject, Injectable, type Signal } from '@angular/core';
import type { CopyContents } from '../../../core/device/store/account-store';
import { DeviceVault } from '../../../core/device/store/device-vault';
import type { AdministrationCopyPart } from './administration-sync-api';

export interface AdministrationYearOverview {
  readonly year: number;
  readonly [field: string]: unknown;
}

export interface AdministrationDonationsSummary {
  readonly today: string;
  readonly byYear: readonly AdministrationYearOverview[];
}

@Injectable({ providedIn: 'root' })
export class AdministrationCopy {
  private readonly vault = inject(DeviceVault);
  private readonly kinds = new Map<string, Signal<readonly unknown[] | null>>();

  private readonly contents = computed<CopyContents | null>(
    () => this.vault.administration()?.store.contents() ?? null,
  );

  readonly opened = computed(() => this.contents() !== null);
  readonly storedAt = computed(() => this.contents()?.storedAt ?? null);
  readonly summary = computed<AdministrationDonationsSummary | null>(() => {
    const summary = this.contents()?.summary;
    const donations =
      typeof summary === 'object' && summary !== null
        ? (summary as { donations?: unknown }).donations
        : null;
    return isDonationsSummary(donations) ? donations : null;
  });

  rows<T>(part: AdministrationCopyPart, kind: string): Signal<readonly T[] | null> {
    const key = `${part}/${kind}`;
    let rows = this.kinds.get(key);
    if (rows === undefined) {
      rows = computed(() => {
        const contents = this.contents();
        if (contents === null) {
          return null;
        }
        return contents.chunks
          .filter((chunk) => chunk.id === key || chunk.id.startsWith(`${key}:`))
          .sort((first, second) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0))
          .flatMap((chunk) => chunk.rows);
      });
      this.kinds.set(key, rows);
    }
    return rows as Signal<readonly T[] | null>;
  }
}

function isDonationsSummary(donations: unknown): donations is AdministrationDonationsSummary {
  return (
    typeof donations === 'object' &&
    donations !== null &&
    typeof (donations as { today?: unknown }).today === 'string' &&
    Array.isArray((donations as { byYear?: unknown }).byYear)
  );
}
