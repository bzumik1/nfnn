import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfProgress, PdfProgressState } from './pdf-progress';

describe('Given the line under a PDF button', () => {
  let fixture: ComponentFixture<PdfProgress>;
  let cancelled: number;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PdfProgress] }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(PdfProgress);
    cancelled = 0;
    fixture.componentInstance.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  const element = (selector: string) =>
    fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  const status = () => element('[role="status"]')?.textContent?.trim();

  async function show(progress: PdfProgressState | null): Promise<void> {
    fixture.componentRef.setInput('progress', progress);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  it('when nothing is prepared, then its status line is there, reserved and silent, with no bar', () => {
    expect(element('[role="status"]')).not.toBeNull();
    expect(element('[role="status"]')?.classList).toContain('pdf-progress__line');
    expect(status()).toBe('');
    expect(element('progress')).toBeNull();
  });

  describe('when a phase starts', () => {
    beforeEach(() => show({ kind: 'running', text: 'Načítáme nástroje pro PDF…' }));

    it('then the line names it only once it has lasted 300 ms', async () => {
      await wait(290);
      expect(status()).toBe('');

      await wait(10);
      expect(status()).toBe('Načítáme nástroje pro PDF…');
      expect(element('progress')).toBeNull();
    });

    it('and the next phase follows quickly, then the line skips the short one and names the next once it lasts', async () => {
      await wait(400);
      await show({ kind: 'running', text: 'Vytváříme PDF… · strana 1' });
      await wait(100);
      await show({ kind: 'running', text: 'Vytváříme PDF… · strana 2' });
      await wait(200);
      expect(status()).toBe('Načítáme nástroje pro PDF…');

      await wait(100);
      expect(status()).toBe('Vytváříme PDF… · strana 2');
    });

    it('and the same phase is reported again, then its wait does not start over', async () => {
      await wait(200);
      await show({ kind: 'running', text: 'Načítáme nástroje pro PDF…' });
      await wait(100);

      expect(status()).toBe('Načítáme nástroje pro PDF…');
    });

    it('then no cancel is offered in the first eight seconds', async () => {
      await wait(7900);

      expect(element('.pdf-progress__cancel')).toBeNull();
    });

    it('and it takes longer than eight seconds, then a cancel outside the status is offered and pressing it says so', async () => {
      await wait(8000);

      const cancel = element('.pdf-progress__cancel') as HTMLButtonElement;
      expect(cancel.textContent?.trim()).toBe('Zrušit');
      expect(element('[role="status"] .pdf-progress__cancel')).toBeNull();
      cancel.click();
      expect(cancelled).toBe(1);
    });
  });

  describe('when the PDF waits for a second tap', () => {
    beforeEach(() =>
      show({
        kind: 'ready',
        text: 'Potvrzení x.pdf je připravené. Otevřete ho tlačítkem Otevřít PDF.',
        brief: 'PDF je připravené',
      }),
    );

    it('then at once the line shows the brief with a check and the status says the whole sentence', () => {
      const brief = element('.pdf-progress__brief') as HTMLElement;
      expect(brief.dataset['brief']).toBe('PDF je připravené');
      expect(brief.getAttribute('aria-hidden')).toBe('true');
      expect(brief.querySelector('svg')).not.toBeNull();
      expect(status()).toBe('Potvrzení x.pdf je připravené. Otevřete ho tlačítkem Otevřít PDF.');
      expect(element('.pdf-progress__line--done')).not.toBeNull();
      expect(element('button')).toBeNull();
    });
  });

  it('when a running phase ends with a saved file before 300 ms, then the end shows at once', async () => {
    await show({ kind: 'running', text: 'Načítáme nástroje pro PDF…' });
    await show({ kind: 'done', text: 'Potvrzení x.pdf je stažené.', brief: 'PDF je stažené' });

    expect(status()).toBe('Potvrzení x.pdf je stažené.');
    expect(element('.pdf-progress__brief')?.dataset['brief']).toBe('PDF je stažené');
    await wait(500);
    expect(status()).toBe('Potvrzení x.pdf je stažené.');
  });

  it('when a preparation is cancelled, then the line says so without the check of a success', async () => {
    await show({
      kind: 'cancelled',
      text: 'Přípravu potvrzení jste zrušili.',
      brief: 'Příprava je zrušená',
    });

    expect(status()).toBe('Přípravu potvrzení jste zrušili.');
    expect(element('.pdf-progress__line--done')).toBeNull();
    expect(element('.pdf-progress__brief svg')).toBeNull();
  });
});
