import { computed, inject, Injectable, Signal } from '@angular/core';
import { AuthStore } from '../../../core/auth/auth-store';
import { ConnectedAppList, PasskeyList, SignedInDeviceList } from '../../../core/auth/donor';
import { KeptAnswers } from '../../../core/kept/kept-answers';
import { BankAccountItem } from '../../donations/bank-accounts-api';
import { DonorDonationsRead } from '../../donations/device-copy/donor-donations-repository';

export interface KeptBankCheck {
  readonly endedAt: number;
  readonly bankDataAsOf: string | null;
}

export interface KeptDonorAnswerTypes {
  readonly devices: SignedInDeviceList;
  readonly passkeys: PasskeyList;
  readonly connections: ConnectedAppList;
  readonly 'bank-accounts': { readonly items: readonly BankAccountItem[] };
  readonly donations: DonorDonationsRead;
  readonly 'bank-check': KeptBankCheck;
}

export type KeptDonorAnswer = keyof KeptDonorAnswerTypes;

@Injectable({ providedIn: 'root' })
export class KeptDonorAnswers extends KeptAnswers<KeptDonorAnswerTypes> {
  constructor() {
    super(signedInDonor());
  }
}

function signedInDonor(): Signal<string | null> {
  const donor = inject(AuthStore).donor;
  return computed(() => donor()?.id ?? null);
}
