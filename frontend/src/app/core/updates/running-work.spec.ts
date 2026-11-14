import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { RunningWork } from './running-work';

describe('Given the registry of work a reload would break', () => {
  let work: RunningWork;

  beforeEach(() => {
    work = TestBed.inject(RunningWork);
  });

  it('when nothing was started, then nothing runs', () => {
    expect(work.any()).toBe(false);
  });

  it('when work starts, then something runs until it ends, and ending it twice changes nothing more', () => {
    const first = work.start();
    const second = work.start();

    first();
    first();

    expect(work.any()).toBe(true);

    second();

    expect(work.any()).toBe(false);
  });

  describe('when a promise runs as work', () => {
    it('then something runs until it settles with its value', async () => {
      let settle: (value: number) => void = () => undefined;
      const result = work.until(new Promise<number>((resolve) => (settle = resolve)));

      expect(work.any()).toBe(true);

      settle(7);

      await expect(result).resolves.toBe(7);
      expect(work.any()).toBe(false);
    });

    it('then a failure ends it too and passes on', async () => {
      const result = work.until(Promise.reject(new Error('cancelled')));

      await expect(result).rejects.toThrow('cancelled');
      expect(work.any()).toBe(false);
    });
  });

  describe('when an observable runs as work', () => {
    it('then nothing runs before it is subscribed, and something runs until it completes', () => {
      const source = new Subject<number>();
      const running = work.during(source);

      expect(work.any()).toBe(false);

      const seen: number[] = [];
      running.subscribe((value) => seen.push(value));
      source.next(1);

      expect(work.any()).toBe(true);

      source.complete();

      expect(seen).toEqual([1]);
      expect(work.any()).toBe(false);
    });

    it('then a subscriber that leaves before the end ends it too', () => {
      const subscription = work.during(new Subject<number>()).subscribe();

      subscription.unsubscribe();

      expect(work.any()).toBe(false);
    });
  });
});
