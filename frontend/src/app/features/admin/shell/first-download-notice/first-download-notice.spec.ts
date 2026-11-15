import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Connectivity } from '../../../../core/connectivity/connectivity';
import {
  ADMINISTRATION_LOCK,
  type FirstDownloadEnd,
  type FirstDownloadProgress,
} from '../administration-lock';
import {
  FIRST_DOWNLOAD_ENDING_AFTER_MS,
  FIRST_DOWNLOAD_STORED_MS,
  FirstDownloadNotice,
} from './first-download-notice';

describe('Given the line about the first saving of the administration on this device', () => {
  let fixture: ComponentFixture<FirstDownloadNotice>;
  const locked = signal(false);
  const progress = signal<FirstDownloadProgress | null>(null);
  const end = signal<FirstDownloadEnd | null>(null);
  const offline = signal(false);
  let retries: number;

  beforeEach(() => {
    vi.useFakeTimers();
    locked.set(false);
    progress.set(null);
    end.set(null);
    offline.set(false);
    retries = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: Connectivity, useValue: { offline: offline.asReadonly() } },
        {
          provide: ADMINISTRATION_LOCK,
          useValue: {
            locked: locked.asReadonly(),
            panel: signal(null).asReadonly(),
            keepsPage: signal(false).asReadonly(),
            firstDownload: progress.asReadonly(),
            firstDownloadEnd: end.asReadonly(),
            retryFirstDownload: () => retries++,
          },
        },
      ],
    });
    fixture = TestBed.createComponent(FirstDownloadNotice);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  function region(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[aria-live="polite"]');
  }

  function said(): string {
    return (region()?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function after(ms: number): void {
    vi.advanceTimersByTime(ms);
    fixture.detectChanges();
  }

  function ends(outcome: FirstDownloadEnd | null): void {
    progress.set(null);
    end.set(outcome);
    after(0);
  }

  it('when nothing is being saved, then the region is there and says nothing', () => {
    expect(region()).not.toBeNull();
    expect(said()).toBe('');
  });

  it('when the saving runs, then the bar says how much of it is stored', () => {
    progress.set({ done: 18, total: 40 });
    after(0);

    expect(said()).toBe('Ukládáme správu do zařízení 18 z 40');
  });

  it('when the saving took longer than a second and is stored, then the bar says so for a few seconds and goes', () => {
    progress.set({ done: 0, total: 40 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

    ends('stored');
    expect(said()).toBe('Správa je uložená v tomto zařízení.');

    after(FIRST_DOWNLOAD_STORED_MS - 1);
    expect(said()).toBe('Správa je uložená v tomto zařízení.');
    after(1);
    expect(said()).toBe('');
  });

  it('when the saving is stored within a second, then the bar goes without a word, as it was barely seen', () => {
    progress.set({ done: 0, total: 2 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS - 1);

    ends('stored');

    expect(said()).toBe('');
  });

  describe('when the saving fails', () => {
    beforeEach(() => {
      progress.set({ done: 0, total: 0 });
      after(0);
      ends('failed');
    });

    it('then the bar says it could not be saved, that everything works online, and offers to save again, and stays', () => {
      expect(said()).toBe(
        'Správu se do tohoto zařízení teď nepodařilo uložit. Online vše funguje dál. Uložit znovu',
      );

      after(FIRST_DOWNLOAD_STORED_MS * 10);
      expect(said()).toContain('nepodařilo uložit');
    });

    it('and the administrator saves again, then the saving is asked for once', () => {
      region()!.querySelector('button')!.click();

      expect(retries).toBe(1);
    });

    it('and the device is offline, then saving again waits for the connection', () => {
      offline.set(true);
      after(0);
      region()!.querySelector('button')!.click();

      expect(retries).toBe(0);
      expect(region()!.querySelector('button')!.getAttribute('aria-disabled')).toBe('true');
    });

    it('and the saving runs again, then the failure gives way to the bar', () => {
      progress.set({ done: 0, total: 0 });
      end.set(null);
      after(0);

      expect(said()).toBe('Ukládáme správu do zařízení');
    });
  });

  it('when the administration locks, then neither the bar nor its ending stands above the panel', () => {
    progress.set({ done: 3, total: 40 });
    locked.set(true);
    after(0);
    expect(said()).toBe('');

    ends('failed');
    expect(said()).toBe('');
  });

  it('when the saving ends for another reason, such as another account, then the bar goes without a word', () => {
    progress.set({ done: 0, total: 0 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

    ends(null);

    expect(said()).toBe('');
  });
});
