import { TestBed } from '@angular/core/testing';
import { DirtyForms } from '../updates/dirty-forms';
import {
  ACCESS_CLOCK,
  ADMINISTRATION_LOCK_AFTER_MS,
  AdministrationAccess,
} from './administration-access';

describe('Given the administration access of this tab', () => {
  let now: number;
  let visibility: DocumentVisibilityState;
  let access: AdministrationAccess;
  let dirty: boolean;

  function becomes(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    dirty = false;
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({ providers: [{ provide: ACCESS_CLOCK, useValue: () => now }] });
    TestBed.inject(DirtyForms).register(() => dirty);
    access = TestBed.inject(AdministrationAccess);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('when the app starts, then the administration is locked', () => {
    expect(access.unlocked()).toBe(false);
  });

  it('when the administrator signs in, then the administration is unlocked', () => {
    access.signedIn();

    expect(access.unlocked()).toBe(true);
  });

  describe('when the administrator signed in', () => {
    beforeEach(() => access.signedIn());

    it('and the app is away for just under five minutes, then it stays unlocked', () => {
      becomes('hidden');
      now += ADMINISTRATION_LOCK_AFTER_MS - 1;
      vi.advanceTimersByTime(ADMINISTRATION_LOCK_AFTER_MS - 1);
      becomes('visible');

      expect(access.unlocked()).toBe(true);
    });

    it('and the app is away for five minutes, then it locks while still away', () => {
      becomes('hidden');
      vi.advanceTimersByTime(ADMINISTRATION_LOCK_AFTER_MS);

      expect(access.unlocked()).toBe(false);
    });

    it('and the device slept so the timer never ran, then it locks when the app comes back', () => {
      becomes('hidden');
      now += ADMINISTRATION_LOCK_AFTER_MS;
      becomes('visible');

      expect(access.unlocked()).toBe(false);
    });

    it('and it locks with nothing half-typed, then the page is not kept under the panel', () => {
      access.lock();

      expect(access.keepsPage()).toBe(false);
    });

    it('and it locks while a form is half-typed, then the page is kept under the panel until it unlocks', () => {
      dirty = true;

      access.lock();

      expect(access.keepsPage()).toBe(true);
      access.unlock();
      expect(access.keepsPage()).toBe(false);
      expect(access.unlocked()).toBe(true);
    });

    it('and the session ends, then the administration is locked again', () => {
      access.ended();

      expect(access.unlocked()).toBe(false);
    });
  });
});
