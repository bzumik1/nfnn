import { computed, inject, Injectable, Signal } from '@angular/core';
import { AuthStore } from '../../core/auth/auth-store';
import { KeptAnswers } from '../../core/kept/kept-answers';
import { PeopleResponse } from '../content/people-api';
import { AdministratorListResponse, ReceiptSigningKeysResponse } from './admin-api';
import type { SignatureBlock } from './settings/receipt-signatory/receipt-signatory';

export interface KeptAdministrationAnswerTypes {
  readonly administrators: AdministratorListResponse;
  readonly people: PeopleResponse;
  readonly 'receipt-signatory': { readonly block: SignatureBlock | null };
  readonly 'receipt-signing-keys': ReceiptSigningKeysResponse;
}

@Injectable({ providedIn: 'root' })
export class KeptAdministrationAnswers extends KeptAnswers<KeptAdministrationAnswerTypes> {
  constructor() {
    super(signedInAdministrator());
  }
}

function signedInAdministrator(): Signal<string | null> {
  const auth = inject(AuthStore);
  return computed(() => (auth.isAdmin() ? (auth.donor()?.id ?? null) : null));
}
