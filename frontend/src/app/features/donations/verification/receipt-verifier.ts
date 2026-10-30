import { DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ed25519Verifies } from './ed25519';
import { ReceiptKeyStore } from './receipt-key-store';
import { keyLookup, type TrustedKeys } from './receipt-keys';
import { ReceiptKeysApi } from './receipt-keys-api';
import {
  PROOF_ADDRESS,
  type ProofReading,
  readReceiptProof,
  type SignatureCheck,
  type SignedReceipt,
  statusDigest,
  type ValidProof,
} from './receipt-proof';
import { type ReceiptStatus, ReceiptStatusApi } from './receipt-status-api';

export type Reach = 'online' | 'offline' | 'no-answer';

export type SignedStatus = ReceiptStatus | Exclude<Reach, 'online'> | 'unanswered';

export type VerificationStep = 'asking-status';

export type VerificationOutcome =
  | { readonly state: 'empty' }
  | { readonly state: 'broken' }
  | { readonly state: 'newer' }
  | { readonly state: 'no-connection' }
  | { readonly state: 'no-answer' }
  | { readonly state: 'keys-refused' }
  | { readonly state: 'failed' }
  | { readonly state: 'invalid' }
  | { readonly state: 'revoked' }
  | { readonly state: 'unknown-key'; readonly reach: Reach }
  | { readonly state: 'signed'; readonly receipt: SignedReceipt; readonly status: SignedStatus };

export const SIGNATURE_CHECK = new InjectionToken<SignatureCheck>('SIGNATURE_CHECK', {
  providedIn: 'root',
  factory: () => ed25519Verifies,
});

type FreshKeys =
  | { readonly reach: 'online'; readonly keys: TrustedKeys }
  | { readonly reach: Exclude<Reach, 'online'> };

const NEWER_TEXT_VERSION = /^[2-9][0-9]*$/;
const REQUEST_TIMEOUT_MS = 5_000;
const STATUSES: readonly string[] = ['active', 'replaced', 'withdrawn', 'unknown'];

@Injectable({ providedIn: 'root' })
export class ReceiptVerifier {
  private readonly keysApi = inject(ReceiptKeysApi);
  private readonly statusApi = inject(ReceiptStatusApi);
  private readonly store = inject(ReceiptKeyStore);
  private readonly verifies = inject(SIGNATURE_CHECK);
  private readonly navigator = inject(DOCUMENT).defaultView?.navigator;

  async verify(
    fragment: string | null,
    progress: (step: VerificationStep) => void = () => undefined,
  ): Promise<VerificationOutcome> {
    if (!fragment) {
      return { state: 'empty' };
    }
    if (NEWER_TEXT_VERSION.test(fragment)) {
      return { state: 'newer' };
    }
    const text = PROOF_ADDRESS + fragment;
    try {
      const kept = await this.store.stored();
      const first = await this.read(text, kept);
      const unreadable = unreadableOutcome(first);
      if (unreadable !== null) {
        return unreadable;
      }
      const fresh = await this.freshKeys();
      if (fresh.reach !== 'online' && kept === null) {
        return { state: fresh.reach === 'offline' ? 'no-connection' : 'no-answer' };
      }
      const reading = fresh.reach === 'online' ? await this.read(text, fresh.keys) : first;
      return await this.outcomeOf(reading, fresh.reach, progress);
    } catch {
      return { state: 'failed' };
    }
  }

  private read(text: string, keys: TrustedKeys | null): Promise<ProofReading> {
    return readReceiptProof(
      text,
      keys?.foundationCompanyIdentifier ?? '',
      keyLookup(keys),
      this.verifies,
    );
  }

  private async freshKeys(): Promise<FreshKeys> {
    if (this.navigator?.onLine === false) {
      return { reach: 'offline' };
    }
    try {
      const list = await firstValueFrom(this.keysApi.list().pipe(timeout(REQUEST_TIMEOUT_MS)));
      const trusted = await this.store.trusted(list);
      if (trusted === null) {
        return { reach: 'no-answer' };
      }
      this.store.replace(list);
      return { reach: 'online', keys: trusted };
    } catch (failure: unknown) {
      return { reach: reachOf(failure) };
    }
  }

  private async outcomeOf(
    reading: ProofReading,
    reach: Reach,
    progress: (step: VerificationStep) => void,
  ): Promise<VerificationOutcome> {
    if (reading.verdict === 'valid') {
      if (reach !== 'online') {
        return { state: 'signed', receipt: reading.receipt, status: reach };
      }
      progress('asking-status');
      return { state: 'signed', receipt: reading.receipt, status: await this.status(reading) };
    }
    switch (reading.reason) {
      case 'unknown-key':
        return { state: 'unknown-key', reach };
      case 'revoked-key':
        return { state: 'revoked' };
      case 'reserved-flags':
        return { state: 'newer' };
      default:
        return { state: 'invalid' };
    }
  }

  private async status(proof: ValidProof): Promise<SignedStatus> {
    const digest = await statusDigest(proof);
    try {
      const answer = await firstValueFrom(
        this.statusApi.status(digest).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      return STATUSES.includes(answer?.status) ? answer.status : 'no-answer';
    } catch (failure: unknown) {
      return reachOf(failure);
    }
  }
}

function reachOf(failure: unknown): Exclude<Reach, 'online'> {
  return failure instanceof HttpErrorResponse && failure.status === 0 ? 'offline' : 'no-answer';
}

function unreadableOutcome(reading: ProofReading): VerificationOutcome | null {
  if (reading.verdict === 'valid') {
    return null;
  }
  switch (reading.reason) {
    case 'not-a-proof':
    case 'digits':
    case 'truncated':
      return { state: 'broken' };
    case 'unknown-format':
      return { state: 'newer' };
    default:
      return null;
  }
}
