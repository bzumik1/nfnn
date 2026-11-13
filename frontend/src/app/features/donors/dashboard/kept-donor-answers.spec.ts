import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth-store';
import { SignedInDevice, SignedInDeviceList } from '../../../core/auth/donor';
import { KeptDonorAnswers } from './kept-donor-answers';

interface FakeDonor {
  readonly id: string;
}

function devices(...ids: string[]): SignedInDeviceList {
  return { items: ids.map((id) => ({ id }) as SignedInDevice) };
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

  function read(server: Subject<SignedInDeviceList>): SignedInDeviceList[] {
    const seen: SignedInDeviceList[] = [];
    kept.read('devices', server).subscribe((answer) => seen.push(answer));
    return seen;
  }

  it('when nothing was read yet, then the answer comes only from the server', () => {
    const server = new Subject<SignedInDeviceList>();
    const seen = read(server);
    expect(seen).toEqual([]);
    server.next(devices('mac'));
    expect(seen).toEqual([devices('mac')]);
  });

  it('when the donor changes while the answer is on its way, then it is not kept for the next one', () => {
    const server = new Subject<SignedInDeviceList>();
    read(server);
    donor.set({ id: 'donor-b' });
    server.next(devices('mac'));

    expect(read(new Subject<SignedInDeviceList>())).toEqual([]);
  });

  describe('when the server answered once', () => {
    beforeEach(() => {
      const first = new Subject<SignedInDeviceList>();
      read(first);
      first.next(devices('mac'));
      first.complete();
    });

    it('then the next read shows the kept answer at once and the fresh one after it', () => {
      const server = new Subject<SignedInDeviceList>();
      const seen = read(server);
      expect(seen).toEqual([devices('mac')]);
      server.next(devices('mac', 'iphone'));
      expect(seen).toEqual([devices('mac'), devices('mac', 'iphone')]);
    });

    it('then a failed refresh keeps the shown answer without an error', () => {
      const server = new Subject<SignedInDeviceList>();
      const errors: unknown[] = [];
      kept.read('devices', server).subscribe({ error: (failure: unknown) => errors.push(failure) });
      server.error(new HttpErrorResponse({ status: 503 }));
      expect(errors).toEqual([]);
    });

    it('then a refresh refused for an ended session still reports the failure', () => {
      const server = new Subject<SignedInDeviceList>();
      const errors: unknown[] = [];
      kept.read('devices', server).subscribe({ error: (failure: unknown) => errors.push(failure) });
      server.error(new HttpErrorResponse({ status: 401 }));
      expect(errors).toHaveLength(1);
    });

    it('then a change made on the page is what the next visit shows', () => {
      kept.keep('devices', devices('iphone'));
      expect(read(new Subject<SignedInDeviceList>())).toEqual([devices('iphone')]);
    });

    it('then another donor never sees it', () => {
      donor.set({ id: 'donor-b' });
      expect(read(new Subject<SignedInDeviceList>())).toEqual([]);
    });

    it('then signing out forgets it', () => {
      donor.set(null);
      TestBed.tick();
      donor.set({ id: 'donor-a' });
      expect(read(new Subject<SignedInDeviceList>())).toEqual([]);
    });
  });
});
