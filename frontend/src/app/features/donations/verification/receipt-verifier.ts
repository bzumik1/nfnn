import { DOCUMENT } from '@angular/common';
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
  signedDigest,
  type ValidProof,
} from './receipt-proof';
import { type ReceiptStatus, ReceiptStatusApi } from './receipt-status-api';

export type SignedStatus = ReceiptStatus | 'offline' | 'unavailable';

export type VerificationOutcome =
  | { readonly state: 'empty' }
  | { readonly state: 'broken' }
  | { readonly state: 'newer' }
  | { readonly state: 'no-connection' }
  | { readonly state: 'failed' }
  | { readonly state: 'invalid' }
  | { readonly state: 'revoked' }
  | { readonly state: 'unknown-key'; readonly online: boolean }
  | { readonly state: 'signed'; readonly receipt: SignedReceipt; readonly status: SignedStatus };

export const SIGNATURE_CHECK = new InjectionToken<SignatureCheck>('SIGNATURE_CHECK', {
  providedIn: 'root',
  factory: () => ed25519Verifies,
});

const NEWER_TEXT_VERSION = /^[2-9][0-9]*$/;
const REQUEST_TIMEOUT_MS = 10_000;
const STATUSES: readonly string[] = ['active', 'replaced', 'withdrawn', 'unknown'];

@Injectable({ providedIn: 'root' })
export class ReceiptVerifier {
  private readonly keysApi = inject(ReceiptKeysApi);
  private readonly statusApi = inject(ReceiptStatusApi);
  private readonly store = inject(ReceiptKeyStore);
  private readonly verifies = inject(SIGNATURE_CHECK);
  private readonly navigator = inject(DOCUMENT).defaultView?.navigator;

  async verify(fragment: string | null): Promise<VerificationOutcome> {
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
      if (fresh === null && kept === null) {
        return { state: 'no-connection' };
      }
      const reading = fresh === null ? first : await this.read(text, fresh);
      return await this.outcomeOf(reading, fresh !== null);
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

  private async freshKeys(): Promise<TrustedKeys | null> {
    if (this.navigator?.onLine === false) {
      return null;
    }
    try {
      const list = await firstValueFrom(this.keysApi.list().pipe(timeout(REQUEST_TIMEOUT_MS)));
      const trusted = await this.store.trusted(list);
      if (trusted !== null) {
        this.store.replace(list);
      }
      return trusted;
    } catch {
      return null;
    }
  }

  private async outcomeOf(reading: ProofReading, online: boolean): Promise<VerificationOutcome> {
    if (reading.verdict === 'valid') {
      return {
        state: 'signed',
        receipt: reading.receipt,
        status: online ? await this.status(reading) : 'offline',
      };
    }
    switch (reading.reason) {
      case 'unknown-key':
        return { state: 'unknown-key', online };
      case 'revoked-key':
        return { state: 'revoked' };
      case 'reserved-flags':
        return { state: 'newer' };
      default:
        return { state: 'invalid' };
    }
  }

  private async status(proof: ValidProof): Promise<SignedStatus> {
    const digest = await signedDigest(proof);
    try {
      const answer = await firstValueFrom(
        this.statusApi.status(digest).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      return STATUSES.includes(answer?.status) ? answer.status : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
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
