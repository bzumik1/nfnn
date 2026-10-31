/// <reference types="@angular/localize" />

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { formatBankTime } from '../../../donations/donation-date';
import { AdminApi, ReceiptSigningKeysResponse } from '../../admin-api';
import { unpublishedKeyIds, unpublishedKeysSentence } from './unpublished-keys';

type LoadState = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-receipt-signing-key',
  templateUrl: './receipt-signing-key.html',
  styleUrl: './receipt-signing-key.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSigningKey {
  private readonly api = inject(AdminApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<LoadState>('loading');
  protected readonly keys = signal<ReceiptSigningKeysResponse | null>(null);

  protected readonly current = computed(() => this.keys()?.keys.find((key) => key.current) ?? null);
  protected readonly currentKeyId = computed(() => this.keys()?.currentKeyId ?? null);
  protected readonly unpublished = computed(() => {
    const keys = this.keys();
    const ids = keys === null ? [] : unpublishedKeyIds(keys);
    return ids.length === 0 ? null : unpublishedKeysSentence(ids);
  });
  protected readonly earlier = computed(() => {
    const keys = (this.keys()?.keys ?? []).filter((key) => key.published && !key.current);
    if (keys.length === 0) {
      return null;
    }
    const list = keys
      .map(
        (key) =>
          $localize`:@@admin.signingKey.earlierKey:${key.keyId}:key: (zaregistrovaný ${formatBankTime(key.registeredAt)}:time:)`,
      )
      .join(', ');
    return $localize`:@@admin.signingKey.earlier:Zveřejněné jsou i dřívější klíče: ${list}:keys:.`;
  });

  constructor() {
    this.load();
  }

  protected registeredAt(instant: string): string {
    return formatBankTime(instant);
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .receiptSigningKeys()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (keys) => {
          this.keys.set(keys);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }
}
