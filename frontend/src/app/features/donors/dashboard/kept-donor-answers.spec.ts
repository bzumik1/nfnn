import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { KeptDonorAnswers } from './kept-donor-answers';

interface FakeDonor {
  readonly id: string;
}

describe("Given the donor's answers kept in memory between visits", () => {
  const donor = signal<FakeDonor | null>({ id: 'donor-a' });
  let kept: KeptDonorAnswers;

  beforeEach(() => {
    donor.set({ id: 'donor-a' });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { donor } }],
    });
    kept = TestBed.inject(KeptDonorAnswers);
  });

  function read(server: Subject<string[]>): string[][] {
    const seen: string[][] = [];
    kept.read('devices', server).subscribe((answer) => seen.push(answer));
    return seen;
  }

  it('when nothing was read yet, then the answer comes only from the server', () => {
    const server = new Subject<string[]>();
    const seen = read(server);
    expect(seen).toEqual([]);
    server.next(['mac']);
    expect(seen).toEqual([['mac']]);
  });

  describe('when the server answered once', () => {
    beforeEach(() => {
      const first = new Subject<string[]>();
      read(first);
      first.next(['mac']);
      first.complete();
    });

    it('then the next read shows the kept answer at once and the fresh one after it', () => {
      const server = new Subject<string[]>();
      const seen = read(server);
      expect(seen).toEqual([['mac']]);
      server.next(['mac', 'iphone']);
      expect(seen).toEqual([['mac'], ['mac', 'iphone']]);
    });

    it('then a failed refresh keeps the shown answer without an error', () => {
      const server = new Subject<string[]>();
      const errors: unknown[] = [];
      kept.read('devices', server).subscribe({ error: (failure: unknown) => errors.push(failure) });
      server.error(new HttpErrorResponse({ status: 503 }));
      expect(errors).toEqual([]);
    });

    it('then a refresh refused for an ended session still reports the failure', () => {
      const server = new Subject<string[]>();
      const errors: unknown[] = [];
      kept.read('devices', server).subscribe({ error: (failure: unknown) => errors.push(failure) });
      server.error(new HttpErrorResponse({ status: 401 }));
      expect(errors).toHaveLength(1);
    });

    it('then a change made on the page is what the next visit shows', () => {
      kept.keep('devices', ['iphone']);
      const seen = read(new Subject<string[]>());
      expect(seen).toEqual([['iphone']]);
    });

    it('then another donor never sees it', () => {
      donor.set({ id: 'donor-b' });
      const seen = read(new Subject<string[]>());
      expect(seen).toEqual([]);
    });

    it('then signing out forgets it', () => {
      donor.set(null);
      TestBed.tick();
      donor.set({ id: 'donor-a' });
      const seen = read(new Subject<string[]>());
      expect(seen).toEqual([]);
    });
  });
});
