import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { type ReceiptDisplay, receiptDisplay } from '../receipt-format';
import type { ReceiptStatus } from './receipt-status-api';
import type { VerificationOutcome } from './receipt-verifier';

export type FinalOutcome = Exclude<VerificationOutcome, { readonly state: 'empty' }>;

type ResultKind =
  | 'signed'
  | 'signed-no-answer'
  | 'replaced'
  | 'withdrawn'
  | 'unrecorded'
  | 'invalid'
  | 'revoked'
  | 'unknown-key-online'
  | 'unknown-key-offline'
  | 'unknown-key-no-answer'
  | 'no-connection'
  | 'no-answer'
  | 'keys-refused'
  | 'broken'
  | 'newer'
  | 'failed';

type Tone = 'success' | 'caution' | 'danger';

const TONES: Readonly<Record<ResultKind, Tone>> = {
  signed: 'success',
  'signed-no-answer': 'caution',
  replaced: 'caution',
  withdrawn: 'danger',
  unrecorded: 'caution',
  invalid: 'danger',
  revoked: 'danger',
  'unknown-key-online': 'danger',
  'unknown-key-offline': 'caution',
  'unknown-key-no-answer': 'caution',
  'no-connection': 'caution',
  'no-answer': 'caution',
  'keys-refused': 'caution',
  broken: 'caution',
  newer: 'caution',
  failed: 'caution',
};

const ICONS: Readonly<Record<Tone, string>> = { success: '✓', caution: '!', danger: '×' };

const RETRIABLE: readonly ResultKind[] = [
  'signed-no-answer',
  'unknown-key-offline',
  'unknown-key-no-answer',
  'no-connection',
  'no-answer',
  'failed',
];

const UNCHECKED: readonly ResultKind[] = [
  'no-connection',
  'no-answer',
  'keys-refused',
  'broken',
  'newer',
  'failed',
];

const ANSWERED: readonly string[] = [
  'active',
  'replaced',
  'withdrawn',
  'unknown',
] satisfies readonly ReceiptStatus[];

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
  protected readonly statusAnswered = computed(() => ANSWERED.includes(this.status() ?? ''));
  protected readonly statusUnanswered = computed(() => this.status() === 'unanswered');
  protected readonly checked = computed(() => !UNCHECKED.includes(this.kind()));
  protected readonly retriable = computed(() => RETRIABLE.includes(this.kind()));
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
        case 'no-answer':
        case 'unanswered':
          return 'signed-no-answer';
        default:
          return 'signed';
      }
    case 'unknown-key':
      return `unknown-key-${outcome.reach}`;
    default:
      return outcome.state;
  }
}
