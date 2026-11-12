import { HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, untracked } from '@angular/core';
import { catchError, concat, defer, EMPTY, Observable, of, tap, throwError } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';

export type KeptDonorAnswer =
  'devices' | 'passkeys' | 'connections' | 'bank-accounts' | 'donations' | 'bank-check';

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

  read<T>(answer: KeptDonorAnswer, server: Observable<T>): Observable<T> {
    return defer(() => {
      const fresh = server.pipe(tap((value) => this.keep(answer, value)));
      const shown = this.kept<T>(answer);
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

  kept<T>(answer: KeptDonorAnswer): T | null {
    this.follow(untracked(this.donor)?.id ?? null);
    return this.answers.has(answer) ? (this.answers.get(answer) as T) : null;
  }

  keep<T>(answer: KeptDonorAnswer, value: T): void {
    const owner = untracked(this.donor)?.id ?? null;
    this.follow(owner);
    if (owner !== null) {
      this.answers.set(answer, value);
    }
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
