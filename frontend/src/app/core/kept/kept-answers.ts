import { HttpErrorResponse } from '@angular/common/http';
import { effect, Signal, untracked } from '@angular/core';
import { catchError, concat, defer, EMPTY, Observable, of, tap, throwError } from 'rxjs';

const REFUSALS = [401, 403];

export class KeptAnswers<Types extends object> {
  private readonly answers = new Map<keyof Types, unknown>();
  private owner: string | null = null;

  constructor(private readonly ownerNow: Signal<string | null>) {
    effect(() => {
      const owner = ownerNow();
      untracked(() => this.follow(owner));
    });
  }

  read<K extends keyof Types>(answer: K, server: Observable<Types[K]>): Observable<Types[K]> {
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
            refused(failure) ? throwError(() => failure) : EMPTY,
          ),
        ),
      );
    });
  }

  kept<K extends keyof Types>(answer: K): Types[K] | null {
    this.follow(this.currentOwner());
    return this.answers.has(answer) ? (this.answers.get(answer) as Types[K]) : null;
  }

  keep<K extends keyof Types>(answer: K, value: Types[K]): void {
    this.keepFor(this.currentOwner(), answer, value);
  }

  forget(answer: keyof Types): void {
    this.answers.delete(answer);
  }

  private keepFor<K extends keyof Types>(owner: string | null, answer: K, value: Types[K]): void {
    this.follow(this.currentOwner());
    if (owner !== null && owner === this.owner) {
      this.answers.set(answer, value);
    }
  }

  private currentOwner(): string | null {
    return untracked(this.ownerNow);
  }

  private follow(owner: string | null): void {
    if (owner !== this.owner) {
      this.answers.clear();
      this.owner = owner;
    }
  }
}

function refused(failure: unknown): boolean {
  return failure instanceof HttpErrorResponse && REFUSALS.includes(failure.status);
}
