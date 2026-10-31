/// <reference types="@angular/localize" />

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthStore } from '../../../../core/auth/auth-store';
import { PasskeyAuthenticator } from '../../../../core/auth/passkey-authenticator';
import { LiveNotice, Notice } from '../../../../shared/ui/live-notice/live-notice';
import { formatBankTime } from '../../../donations/donation-date';
import {
  AdminApi,
  ReceiptSigningKeyResponse,
  ReceiptSigningKeysResponse,
  ReceiptSigningKeyWithdrawalResponse,
} from '../../admin-api';
import { watchKeyRenewal } from './key-renewal';
import { KeyWithdrawalDialog } from './key-withdrawal-dialog';
import {
  mismatchSentence,
  withdrawnCurrentKeyId,
  withdrawnCurrentKeySentence,
} from './key-warnings';
import { unpublishedKeyIds, unpublishedKeysSentence } from './unpublished-keys';

type LoadState = 'loading' | 'ready' | 'error';

interface Withdrawal {
  keyId: string;
  current: boolean;
  hasPasskey: boolean;
}

interface WithdrawalOffer {
  keyId: string;
  label: string;
}

@Component({
  selector: 'app-receipt-signing-key',
  imports: [KeyWithdrawalDialog, LiveNotice],
  templateUrl: './receipt-signing-key.html',
  styleUrl: './receipt-signing-key.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptSigningKey {
  private readonly api = inject(AdminApi);
  private readonly auth = inject(AuthStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly passkeySupported = inject(PasskeyAuthenticator).supported();
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly state = signal<LoadState>('loading');
  protected readonly keys = signal<ReceiptSigningKeysResponse | null>(null);
  protected readonly withdrawal = signal<Withdrawal | null>(null);
  protected readonly opening = signal(false);
  protected readonly restartingFor = signal<string | null>(null);
  protected readonly restartSlow = signal(false);
  private readonly stillWithdrawnAfterRestart = signal(false);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly current = computed(() => this.keys()?.keys.find((key) => key.current) ?? null);
  protected readonly currentKeyId = computed(() => this.keys()?.currentKeyId ?? null);
  private readonly reverted = computed(() =>
    (this.keys()?.auditMismatches ?? [])
      .filter((mismatch) => mismatch.kind === 'reverted')
      .map((mismatch) => mismatch.keyId),
  );
  protected readonly warnings = computed(() => {
    const keys = this.keys();
    if (keys === null) {
      return [];
    }
    const ids = unpublishedKeyIds(keys);
    const withdrawn =
      this.restartingFor() === null && !this.stillWithdrawnAfterRestart()
        ? withdrawnCurrentKeyId(keys)
        : null;
    return [
      ...(ids.length === 0 ? [] : [unpublishedKeysSentence(ids)]),
      ...(withdrawn === null ? [] : [withdrawnCurrentKeySentence(withdrawn)]),
      ...keys.auditMismatches.map(mismatchSentence),
    ];
  });
  protected readonly offers = computed<WithdrawalOffer[]>(() =>
    (this.keys()?.keys ?? [])
      .filter((key) => this.withdrawable(key))
      .sort((first, second) => Number(second.current) - Number(first.current))
      .map((key) => ({ keyId: key.keyId, label: this.offerLabel(key) })),
  );
  protected readonly earlier = computed(() => {
    const keys = (this.keys()?.keys ?? []).filter((key) => key.published && !key.current);
    if (keys.length === 0) {
      return null;
    }
    const list = keys
      .map((key) =>
        key.status === 'revoked'
          ? $localize`:@@admin.signingKey.earlierKeyWithdrawn:${key.keyId}:key: (zaregistrovaný ${formatBankTime(key.registeredAt)}:time:, stažený)`
          : $localize`:@@admin.signingKey.earlierKey:${key.keyId}:key: (zaregistrovaný ${formatBankTime(key.registeredAt)}:time:)`,
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
          this.stillWithdrawnAfterRestart.set(false);
          this.keys.set(keys);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  private showAfterRestart(keyId: string, keys: ReceiptSigningKeysResponse): void {
    const same = keys.currentKeyId === keyId;
    this.stillWithdrawnAfterRestart.set(same);
    this.keys.set(keys);
    this.state.set('ready');
    this.notice.set(this.afterRestartNotice(keyId, keys));
  }

  protected ask(keyId: string): void {
    if (this.opening()) {
      return;
    }
    const current = keyId === this.currentKeyId();
    const usesCode = this.auth.donor()?.secondFactor.enabled ?? false;
    if (!usesCode || !this.passkeySupported) {
      this.withdrawal.set({ keyId, current, hasPasskey: false });
      return;
    }
    this.opening.set(true);
    this.auth
      .hasPasskeys()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((hasPasskey) => {
        this.opening.set(false);
        this.withdrawal.set({ keyId, current, hasPasskey });
      });
  }

  protected cancel(): void {
    this.withdrawal.set(null);
  }

  protected withdrawn(response: ReceiptSigningKeyWithdrawalResponse): void {
    const keyId = this.withdrawal()?.keyId ?? '';
    this.withdrawal.set(null);
    this.keys.set(response);
    this.state.set('ready');
    if (response.restarting) {
      this.restartingFor.set(keyId);
      this.watchRestart();
    } else {
      this.notice.set({
        kind: 'status',
        text: $localize`:@@admin.signingKey.withdrawn:Klíč ${keyId}:key: je stažený.`,
      });
    }
    afterNextRender(() => this.title()?.nativeElement.focus(), { injector: this.injector });
  }

  protected watchRestart(): void {
    const keyId = this.restartingFor() ?? '';
    this.restartSlow.set(false);
    this.notice.set({
      kind: 'status',
      text: $localize`:@@admin.signingKey.restarting:Klíč ${keyId}:key: je stažený. Web se restartuje a vytvoří si nový klíč, obvykle do minuty.`,
    });
    watchKeyRenewal(() => this.api.receiptSigningKeys(), keyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((keys) => {
        if (keys === null) {
          this.notice.set(null);
          this.restartSlow.set(true);
          return;
        }
        this.restartingFor.set(null);
        this.showAfterRestart(keyId, keys);
      });
  }

  private afterRestartNotice(keyId: string, keys: ReceiptSigningKeysResponse): Notice | null {
    if (keys.currentKeyId === keyId) {
      return {
        kind: 'alert',
        text: $localize`:@@admin.signingKey.notRenewed:Klíč ${keyId}:key: je stažený, ale web po restartu nový klíč nemá, takže se potvrzení o daru nestáhnou; obraťte se prosím na technika serveru.`,
      };
    }
    if (!keys.currentKeyPublished) {
      return {
        kind: 'alert',
        text: $localize`:@@admin.signingKey.renewedUnpublished:Klíč ${keyId}:key: je stažený a web po restartu má nový klíč ${keys.currentKeyId}:newKey:, který ale zatím není zveřejněný.`,
      };
    }
    return withdrawnCurrentKeyId(keys) === null
      ? {
          kind: 'status',
          text: $localize`:@@admin.signingKey.renewed:Klíč ${keyId}:key: je stažený a web po restartu podepisuje novým klíčem.`,
        }
      : null;
  }

  private withdrawable(key: ReceiptSigningKeyResponse): boolean {
    return (
      this.restartingFor() === null &&
      key.published &&
      (key.status === 'active' || this.reverted().includes(key.keyId))
    );
  }

  private offerLabel(key: ReceiptSigningKeyResponse): string {
    if (key.status === 'revoked') {
      return $localize`:@@admin.signingKey.withdrawAgain:Stáhnout klíč ${key.keyId}:key: znovu…`;
    }
    return key.current
      ? $localize`:@@admin.signingKey.withdrawCurrent:Stáhnout klíč serveru…`
      : $localize`:@@admin.signingKey.withdrawEarlier:Stáhnout klíč ${key.keyId}:key:…`;
  }
}
