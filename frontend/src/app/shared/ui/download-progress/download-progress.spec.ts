import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DownloadProgress, DownloadProgressState } from './download-progress';

describe('Given a download progress line', () => {
  let fixture: ComponentFixture<DownloadProgress>;
  let cancelled: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DownloadProgress] }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(DownloadProgress);
    cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  const element = (selector: string) =>
    fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const status = () => element('[role="status"]')?.textContent?.trim();

  async function show(progress: DownloadProgressState | null): Promise<void> {
    fixture.componentRef.setInput('progress', progress);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  function running(step: number, text: string): DownloadProgressState {
    return { kind: 'running', step, steps: 3, text };
  }

  it('when nothing is downloading, then its status region is there and silent and no bar shows', () => {
    expect(element('[role="status"]')).not.toBeNull();
    expect(status()).toBe('');
    expect(element('progress')).toBeNull();
  });

  describe('when a download runs', () => {
    beforeEach(() => show(running(1, 'Připravujeme údaje potvrzení…')));

    it('then the status names the phase and the bar shows how far it is', () => {
      expect(status()).toBe('Připravujeme údaje potvrzení…');
      const bar = element('progress') as HTMLProgressElement;
      expect(bar.max).toBe(3);
      expect(bar.value).toBe(1);
      expect(bar.getAttribute('aria-label')).toBe('Připravujeme údaje potvrzení…');
    });

    it('then no cancel is offered in the first eight seconds', async () => {
      await vi.advanceTimersByTimeAsync(7900);
      fixture.detectChanges();

      expect(element('.download-progress-cancel')).toBeNull();
    });

    it('and it takes longer than eight seconds while its pages advance, then a cancel is offered and pressing it says so', async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await show(running(3, 'Kreslíme stranu 2…'));
      await vi.advanceTimersByTimeAsync(3100);
      fixture.detectChanges();

      const cancel = element('.download-progress-cancel') as HTMLButtonElement;
      expect(cancel.textContent?.trim()).toBe('Zrušit');
      cancel.click();
      expect(cancelled).toBe(1);
    });

    it('and it ends, then the bar and the cancel go and the success line stays', async () => {
      await vi.advanceTimersByTimeAsync(9000);
      await show({ kind: 'done', step: 3, steps: 3, text: 'Potvrzení x.pdf je stažené.' });

      expect(status()).toBe('Potvrzení x.pdf je stažené.');
      expect(element('progress')).toBeNull();
      expect(element('.download-progress-cancel')).toBeNull();
    });
  });

  describe('when the file waits for a second tap to open', () => {
    beforeEach(() => show({ kind: 'ready', step: 3, steps: 3, text: 'Potvrzení je připravené.' }));

    it('then the status says so and it adds no button of its own, as the button that started the download opens the file', () => {
      expect(status()).toBe('Potvrzení je připravené.');
      expect(element('button')).toBeNull();
      expect(element('progress')).toBeNull();
    });
  });
});
