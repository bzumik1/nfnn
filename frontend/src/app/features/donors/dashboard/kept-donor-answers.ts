import { HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, untracked } from '@angular/core';
import { catchError, concat, defer, EMPTY, Observable, of, tap, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { ConnectedAppList, PasskeyList, SignedInDeviceList } from '../../../core/auth/donor';
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

const SESSION_REFUSED = 401;

@Injectable({ providedIn: 'root' })
export class KeptDonorAnswers {
  private readonly donor = inject(AuthStore).donor;
  private readonly answers = new Map<KeptDonorAnswer, unknown>();
  private owner: string | null = null;

  constructor() {
    effect(() => {
      const owner = this.donor()?.id ?? null;
      untracked(() => this.follow(owner));
    });
  }

  read<K extends KeptDonorAnswer>(
    answer: K,
    server: Observable<KeptDonorAnswerTypes[K]>,
  ): Observable<KeptDonorAnswerTypes[K]> {
    return defer(() => {
      const askedFor = this.currentOwner();
      const fresh = server.pipe(tap((value) => this.keepFor(askedFor, answer, value)));
      const shown = this.kept(answer);
      if (shown === null) {
        return fresh;
      }
      return concat(
        of(shown),
        fresh.pipe(
          catchError((failure: unknown) =>
            sessionRefused(failure) ? throwError(() => failure) : EMPTY,
          ),
        ),
      );
    });
  }

  kept<K extends KeptDonorAnswer>(answer: K): KeptDonorAnswerTypes[K] | null {
    this.follow(this.currentOwner());
    return this.answers.has(answer) ? (this.answers.get(answer) as KeptDonorAnswerTypes[K]) : null;
  }

  keep<K extends KeptDonorAnswer>(answer: K, value: KeptDonorAnswerTypes[K]): void {
    this.keepFor(this.currentOwner(), answer, value);
  }

  private keepFor<K extends KeptDonorAnswer>(
    owner: string | null,
    answer: K,
    value: KeptDonorAnswerTypes[K],
  ): void {
    this.follow(this.currentOwner());
    if (owner !== null && owner === this.owner) {
      this.answers.set(answer, value);
    }
  }

  private currentOwner(): string | null {
    return untracked(this.donor)?.id ?? null;
  }

  private follow(owner: string | null): void {
    if (owner !== this.owner) {
      this.answers.clear();
      this.owner = owner;
    }
  }
}

function sessionRefused(failure: unknown): boolean {
  return failure instanceof HttpErrorResponse && failure.status === SESSION_REFUSED;
}
