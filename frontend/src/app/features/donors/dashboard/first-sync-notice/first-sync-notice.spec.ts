import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  type DonorCopy,
  DonorCopyLink,
  type SyncOutcome,
} from '../../../donations/device-copy/donor-copy';
import type { DonorCopyView } from '../../../donations/device-copy/donor-copy-view';
import { FIRST_SYNC_NOTICE_DELAY_MS, FirstSyncNotice, STORED_NOTICE_MS } from './first-sync-notice';

const VIEW = { items: [] } as unknown as DonorCopyView;

describe('Given the line about the first saving of the donor’s data on this device', () => {
  let fixture: ComponentFixture<FirstSyncNotice>;
  let running: ReturnType<typeof signal<boolean>>;
  let view: ReturnType<typeof signal<DonorCopyView | null>>;
  let keeps: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    vi.useFakeTimers();
    running = signal(false);
    view = signal<DonorCopyView | null>(null);
    keeps = signal(true);
    const copy: DonorCopy = {
      open: signal(true),
      owner: signal<string | null>('jana'),
      view,
      firstSync: running,
      keepsOnDevice: keeps,
      sync: () => Promise.resolve<SyncOutcome>('stored'),
      catchUp: () => Promise.resolve<SyncOutcome>('stored'),
    };
    TestBed.inject(DonorCopyLink).copy.set(copy);
    fixture = TestBed.createComponent(FirstSyncNotice);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('has-floating-notice');
  });

  function region(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
  }

  function status(): string {
    return (region()?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function after(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  it('when the first saving ends within a second, then nothing is said', () => {
    running.set(true);
    after(0);
    after(FIRST_SYNC_NOTICE_DELAY_MS - 1);
    expect(status()).toBe('');

    view.set(VIEW);
    running.set(false);
    after(0);
    expect(status()).toBe('');
    after(STORED_NOTICE_MS);

    expect(status()).toBe('');
  });

  it('when the page opens on a copy that already holds the gifts, then nothing is said, not even that they are saved', () => {
    view.set(VIEW);
    fixture.destroy();
    fixture = TestBed.createComponent(FirstSyncNotice);
    fixture.detectChanges();
    after(0);

    expect(status()).toBe('');
    after(FIRST_SYNC_NOTICE_DELAY_MS);
    expect(status()).toBe('');
  });

  it('when the first saving takes longer, then a bar over the page says the overview is being saved and then that it is, for a few seconds, without promising it offline', () => {
    expect(region()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="status"]')).toBeNull();
    running.set(true);
    after(0);
    after(FIRST_SYNC_NOTICE_DELAY_MS);
    expect(status()).toBe('Ukládáme přehled vašich darů do tohoto zařízení…');
    expect(region()?.querySelector('.ui-notice--floating')).not.toBeNull();
    expect(document.documentElement.classList).toContain('has-floating-notice');

    view.set(VIEW);
    running.set(false);
    after(0);
    expect(status()).toBe('Přehled vašich darů je uložený v tomto zařízení.');

    after(STORED_NOTICE_MS);
    expect(status()).toBe('');
    expect(document.documentElement.classList).not.toContain('has-floating-notice');
  });

  it('when the first saving takes longer and fails, then the line goes without saying the gifts are saved', () => {
    running.set(true);
    after(0);
    after(FIRST_SYNC_NOTICE_DELAY_MS);

    running.set(false);
    after(0);

    expect(status()).toBe('');
  });

  it('when the device keeps nothing, as Cizí počítač, then nothing is said', () => {
    keeps.set(false);
    running.set(true);
    after(0);
    after(FIRST_SYNC_NOTICE_DELAY_MS);

    expect(status()).toBe('');
  });
});
