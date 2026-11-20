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
    return (fixture.nativeElement as HTMLElement).querySelector('.admin-first-download');
  }

  function live(): HTMLElement | null {
    return region()?.querySelector('[aria-live="polite"]') ?? null;
  }

  function clean(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
  }

  function fold(): HTMLElement | null {
    return region()?.querySelector('app-fold') ?? null;
  }

  function said(): string {
    return clean(region()?.querySelector('app-fold:not([inert]) .first-download')?.textContent);
  }

  function kept(): string {
    return clean(fold()?.querySelector('.first-download')?.textContent);
  }

  function retryButton(): HTMLButtonElement {
    return region()!.querySelector('button')!;
  }

  function heard(): string {
    return clean(live()?.textContent);
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

  it('when nothing is being saved, then the region and its live line are there and say nothing', () => {
    expect(region()).not.toBeNull();
    expect(live()).not.toBeNull();
    expect(said()).toBe('');
    expect(heard()).toBe('');
  });

  it('when the saving runs, then the bar says how much of it is stored, and screen readers hear only that it started', () => {
    progress.set({ done: 18, total: 40 });
    after(0);

    expect(said()).toBe('Ukládáme správu do zařízení 18 z 40');
    expect(heard()).toBe('Ukládáme správu do zařízení.');
  });

  it('when the saving took longer than a second and is stored, then the bar says so for a few seconds and goes', () => {
    progress.set({ done: 0, total: 40 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

    const line = live();
    ends('stored');
    expect(said()).toBe('Správa je uložená v tomto zařízení.');
    expect(heard()).toBe('Správa je uložená v tomto zařízení.');
    expect(live()).toBe(line);
    expect(region()!.querySelector('.first-download__title')!.getAttribute('aria-hidden')).toBe(
      'true',
    );

    after(FIRST_DOWNLOAD_STORED_MS - 1);
    expect(said()).toBe('Správa je uložená v tomto zařízení.');
    after(1);
    expect(said()).toBe('');
    expect(heard()).toBe('');
  });

  it('when the saving is stored within a second, then the bar goes without a word, as it was barely seen', () => {
    progress.set({ done: 0, total: 2 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS - 1);

    ends('stored');

    expect(said()).toBe('');
    expect(heard()).toBe('');
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

    it('then screen readers hear the failure once in the live line, and can still reach the button', () => {
      expect(heard()).toBe(
        'Správu se do tohoto zařízení teď nepodařilo uložit. Online vše funguje dál.',
      );
      const button = region()!.querySelector('button')!;
      expect(button.closest('[aria-hidden="true"]')).toBeNull();
      expect(live()!.contains(button)).toBe(false);
    });

    it('and the administrator saves again, then the saving is asked for once', () => {
      retryButton().click();

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
      after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

      expect(said()).toBe('Ukládáme správu do zařízení');
      expect(heard()).toBe('Ukládáme správu do zařízení.');
    });

    describe('and the administrator presses Uložit znovu', () => {
      let handedOn: number;

      beforeEach(() => {
        handedOn = 0;
        fixture.componentInstance.releasesFocus.subscribe(() => handedOn++);
        document.body.appendChild(fixture.nativeElement);
        retryButton().focus();
        retryButton().click();
        progress.set({ done: 0, total: 0 });
        end.set(null);
        after(0);
      });

      afterEach(() => fixture.nativeElement.remove());

      it('then the failure stays in place with its button while the saving runs, and screen readers hear that it started', () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS - 1);

        expect(said()).toContain('nepodařilo uložit');
        expect(heard()).toBe('Ukládáme správu do zařízení.');
        expect(document.activeElement).toBe(retryButton());
        expect(handedOn).toBe(0);
      });

      it('then the button stays focused but busy while the saving runs, and a second press asks for nothing', () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS / 2);

        expect(retryButton().getAttribute('aria-disabled')).toBe('true');
        expect(retryButton().disabled).toBe(false);
        expect(document.activeElement).toBe(retryButton());

        retryButton().click();
        retryButton().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(retries).toBe(1);
      });

      it('and it fails again, then the button is no longer busy and saving again is asked for once more', () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS / 2);

        ends('failed');

        expect(retryButton().hasAttribute('aria-disabled')).toBe(false);
        retryButton().click();
        expect(retries).toBe(2);
      });

      it('and it is stored within a second, then the failure folds away with its text in place, the focus is handed on at once and screen readers hear once that it is stored', () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS / 2);
        const line = live();

        ends('stored');

        expect(said()).toBe('');
        expect(kept()).toContain('nepodařilo uložit');
        expect(fold()!.hasAttribute('inert')).toBe(true);
        expect(fold()!.getAttribute('aria-hidden')).toBe('true');
        expect(handedOn).toBe(1);
        expect(heard()).toBe('Správa je uložená v tomto zařízení.');
        expect(live()).toBe(line);

        after(FIRST_DOWNLOAD_STORED_MS - 1);
        expect(heard()).toBe('Správa je uložená v tomto zařízení.');
        after(1);
        expect(heard()).toBe('');
        expect(handedOn).toBe(1);
      });

      it("and it runs longer than a second, then the bar takes the failure's place and the focus is handed on as the button goes", () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

        expect(said()).toBe('Ukládáme správu do zařízení');
        expect(handedOn).toBe(1);
      });

      it('and it fails again, then the failure stays with its button and screen readers hear it again', () => {
        after(FIRST_DOWNLOAD_ENDING_AFTER_MS / 2);

        ends('failed');

        expect(said()).toContain('nepodařilo uložit');
        expect(heard()).toBe(
          'Správu se do tohoto zařízení teď nepodařilo uložit. Online vše funguje dál.',
        );
        expect(handedOn).toBe(0);
      });
    });

    it('and the press left the focus nowhere, as Safari does on a tap, when saving again succeeds, then the focus is handed on', () => {
      let handedOn = 0;
      fixture.componentInstance.releasesFocus.subscribe(() => handedOn++);
      document.body.appendChild(fixture.nativeElement);
      retryButton().click();
      progress.set({ done: 0, total: 0 });
      end.set(null);
      after(0);

      ends('stored');

      expect(handedOn).toBe(1);
      fixture.nativeElement.remove();
    });

    it('and the focus is elsewhere on the page when saving again succeeds, then it stays there', () => {
      let handedOn = 0;
      fixture.componentInstance.releasesFocus.subscribe(() => handedOn++);
      const field = document.createElement('input');
      document.body.append(fixture.nativeElement, field);
      retryButton().click();
      field.focus();
      progress.set({ done: 0, total: 0 });
      end.set(null);
      after(0);

      ends('stored');

      expect(said()).toBe('');
      expect(document.activeElement).toBe(field);
      expect(handedOn).toBe(0);
      field.remove();
      fixture.nativeElement.remove();
    });
  });

  it('when the stored line goes after its few seconds, then it folds away rather than vanishing, out of reach at once', () => {
    progress.set({ done: 0, total: 40 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS);
    ends('stored');

    after(FIRST_DOWNLOAD_STORED_MS);

    expect(said()).toBe('');
    expect(kept()).toBe('Správa je uložená v tomto zařízení.');
    expect(fold()!.hasAttribute('inert')).toBe(true);
    expect(fold()!.getAttribute('aria-hidden')).toBe('true');
  });

  it('when the bar first comes, then it stands open at once rather than folding in', () => {
    progress.set({ done: 0, total: 40 });
    after(0);

    expect(fold()!.hasAttribute('inert')).toBe(false);
    expect(fold()!.querySelector('.fold')!.classList.contains('fold--moves')).toBe(false);
  });

  it('when the administration locks, then neither the bar nor its ending stands above the panel', () => {
    progress.set({ done: 3, total: 40 });
    locked.set(true);
    after(0);
    expect(said()).toBe('');
    expect(heard()).toBe('');

    ends('failed');
    expect(said()).toBe('');
    expect(heard()).toBe('');
  });

  it('when the saving ends for another reason, such as another account, then the bar goes without a word', () => {
    progress.set({ done: 0, total: 0 });
    after(0);
    after(FIRST_DOWNLOAD_ENDING_AFTER_MS);

    ends(null);

    expect(said()).toBe('');
    expect(heard()).toBe('');
  });
});
