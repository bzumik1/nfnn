import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { type ReceiptDisplay, receiptDisplay } from '../receipt-format';
import type { VerificationOutcome } from './receipt-verifier';

export type FinalOutcome = Exclude<VerificationOutcome, { readonly state: 'empty' }>;

type ResultKind =
  | 'signed'
  | 'replaced'
  | 'withdrawn'
  | 'unrecorded'
  | 'invalid'
  | 'revoked'
  | 'unknown-key-online'
  | 'unknown-key-offline'
  | 'no-connection'
  | 'broken'
  | 'newer'
  | 'failed';

type Tone = 'success' | 'caution' | 'danger';

const TONES: Readonly<Record<ResultKind, Tone>> = {
  signed: 'success',
  replaced: 'caution',
  withdrawn: 'danger',
  unrecorded: 'caution',
  invalid: 'danger',
  revoked: 'danger',
  'unknown-key-online': 'danger',
  'unknown-key-offline': 'caution',
  'no-connection': 'caution',
  broken: 'caution',
  newer: 'caution',
  failed: 'caution',
};

const ICONS: Readonly<Record<Tone, string>> = { success: '✓', caution: '!', danger: '×' };

const RETRIABLE: readonly ResultKind[] = ['unknown-key-offline', 'no-connection', 'failed'];

const UNCHECKED: readonly ResultKind[] = ['no-connection', 'broken', 'newer', 'failed'];

@Component({
  selector: 'app-verification-result',
  templateUrl: './verification-result.html',
  styleUrl: './verification-result.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerificationResult {
  readonly outcome = input.required<FinalOutcome>();
  readonly retry = output<void>();

  protected readonly kind = computed(() => kindOf(this.outcome()));
  protected readonly tone = computed(() => TONES[this.kind()]);
  protected readonly icon = computed(() => ICONS[this.tone()]);
  protected readonly status = computed(() => {
    const outcome = this.outcome();
    return outcome.state === 'signed' ? outcome.status : null;
  });
  protected readonly receipt = computed<ReceiptDisplay | null>(() => {
    const outcome = this.outcome();
    return outcome.state === 'signed' ? receiptDisplay(outcome.receipt) : null;
  });
  protected readonly statusAsked = computed(() => {
    const status = this.status();
    return status !== null && status !== 'offline';
  });
  protected readonly checked = computed(() => !UNCHECKED.includes(this.kind()));
  protected readonly retriable = computed(
    () => RETRIABLE.includes(this.kind()) || this.status() === 'unavailable',
  );
}

function kindOf(outcome: FinalOutcome): ResultKind {
  switch (outcome.state) {
    case 'signed':
      switch (outcome.status) {
        case 'replaced':
          return 'replaced';
        case 'withdrawn':
          return 'withdrawn';
        case 'unknown':
          return 'unrecorded';
        default:
          return 'signed';
      }
    case 'unknown-key':
      return outcome.online ? 'unknown-key-online' : 'unknown-key-offline';
    default:
      return outcome.state;
  }
}
