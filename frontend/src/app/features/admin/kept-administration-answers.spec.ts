import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthStore } from '../../core/auth/auth-store';
import { AdministratorListResponse } from './admin-api';
import { KeptAdministrationAnswers } from './kept-administration-answers';

describe("Given the administration's answers kept in memory between visits", () => {
  const donor = signal<{ id: string } | null>({ id: 'admin-a' });
  const isAdmin = signal(true);
  let kept: KeptAdministrationAnswers;
  const list = { items: [] } as unknown as AdministratorListResponse;

  beforeEach(() => {
    donor.set({ id: 'admin-a' });
    isAdmin.set(true);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: { donor, isAdmin } }],
    });
    kept = TestBed.inject(KeptAdministrationAnswers);
    const first = new Subject<AdministratorListResponse>();
    kept.read('administrators', first).subscribe();
    first.next(list);
  });

  it('when the administrator opens the page again, then the kept answer shows at once', () => {
    const seen: AdministratorListResponse[] = [];
    kept
      .read('administrators', new Subject<AdministratorListResponse>())
      .subscribe((answer) => seen.push(answer));

    expect(seen).toEqual([list]);
  });

  it('when the account loses the administrator role, then the kept answers are forgotten', () => {
    isAdmin.set(false);
    TestBed.tick();
    isAdmin.set(true);

    expect(kept.kept('administrators')).toBeNull();
  });

  it('when another administrator signs in on the same tab, then the answers of the first are not shown', () => {
    donor.set({ id: 'admin-b' });

    expect(kept.kept('administrators')).toBeNull();
  });
});
