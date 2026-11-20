import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CopyButton } from './copy-button';

describe('Given a copy button for an account number', () => {
  let fixture: ComponentFixture<CopyButton>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await TestBed.configureTestingModule({ imports: [CopyButton] }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('value', '5544332217/2010');
    fixture.componentRef.setInput('what', 'číslo účtu');
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const status = () =>
    (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent?.trim();

  async function press(): Promise<void> {
    button().click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  it('when it renders, then it says what it copies', () => {
    expect(button().textContent?.replace(/\s+/g, ' ').trim()).toBe('Kopírovat číslo účtu');
    expect(status()).toBe('');
  });

  it('when it is pressed, then the value is in the clipboard and the status says it once', async () => {
    await press();

    expect(writeText).toHaveBeenCalledWith('5544332217/2010');
    expect(status()).toBe('Zkopírováno.');
  });

  it('when it is pressed, then its accessible name stays and the visible Zkopírováno is hidden from a screen reader', async () => {
    await press();

    expect(button().textContent?.replace(/\s+/g, ' ').trim()).toBe('Kopírovat číslo účtu');
    const shown = button().querySelector('[data-label="Zkopírováno"]') as HTMLElement;
    expect(shown.getAttribute('aria-hidden')).toBe('true');
    expect(button().classList).toContain('ui-pill-button--done');
  });

  it('when it renders, then the copied wording already holds its width hidden from a screen reader', () => {
    const reserve = button().querySelector('[data-label="Zkopírováno"]') as HTMLElement;

    expect(reserve.getAttribute('aria-hidden')).toBe('true');
    expect(reserve.textContent?.trim()).toBe('');
  });

  it('when it is pressed, then it reports the copy once it is in the clipboard', async () => {
    let copies = 0;
    fixture.componentInstance.copied.subscribe(() => copies++);

    await press();

    expect(copies).toBe(1);
  });

  it('when the browser refuses to copy, then it reports no copy', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    let copies = 0;
    fixture.componentInstance.copied.subscribe(() => copies++);

    await press();

    expect(copies).toBe(0);
  });

  it('when a moment has passed after copying, then it offers to copy again', async () => {
    await press();

    await vi.advanceTimersByTimeAsync(2500);
    fixture.detectChanges();

    expect(button().textContent).toContain('Kopírovat');
    expect(status()).toBe('');
  });

  it('when the browser refuses to copy, then it says so', async () => {
    writeText.mockRejectedValue(new Error('denied'));

    await press();

    expect(button().textContent).toContain('Kopírovat');
    expect(status()).toBe('Zkopírovat se nepodařilo, opište si údaj prosím ručně.');
  });
});

describe('Given a copy button with a label of its own', () => {
  let fixture: ComponentFixture<CopyButton>;

  beforeEach(async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    await TestBed.configureTestingModule({ imports: [CopyButton] }).compileComponents();
    fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('value', 'Zálohy nefungují.');
    fixture.componentRef.setInput('what', 'zprávu pro technika');
    fixture.componentRef.setInput('label', 'Zkopírovat zprávu pro technika');
    fixture.detectChanges();
  });

  it('when it renders, then the button shows the label alone', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.textContent?.replace(/\s+/g, ' ').trim()).toBe('Zkopírovat zprávu pro technika');
  });

  it('when it renders, then the copied wording shares the cell of the longer label', () => {
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const faces = button.querySelector('.copy-button__faces') as HTMLElement;

    expect(faces.querySelector('[data-label="Zkopírováno"]')).not.toBeNull();
    expect(faces.textContent).toContain('Zkopírovat zprávu pro technika');
  });
});

describe('Given a copy button with sentences of its own for its status', () => {
  let fixture: ComponentFixture<CopyButton>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await TestBed.configureTestingModule({ imports: [CopyButton] }).compileComponents();
    fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('value', 'https://nfnn.cz/aktuality/zahrada-pro-deti');
    fixture.componentRef.setInput('what', 'odkaz na stránku');
    fixture.componentRef.setInput('copiedStatus', 'Odkaz je zkopírovaný.');
    fixture.componentRef.setInput('failedStatus', 'Odkaz najdete v adresním řádku.');
    fixture.detectChanges();
  });

  const status = () =>
    (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent?.trim();

  async function press(): Promise<void> {
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('when it copies, then its status says its own sentence', async () => {
    await press();

    expect(status()).toBe('Odkaz je zkopírovaný.');
  });

  it('when the browser refuses to copy, then its status says its own sentence', async () => {
    writeText.mockRejectedValue(new Error('denied'));

    await press();

    expect(status()).toBe('Odkaz najdete v adresním řádku.');
  });
});

describe('Given a copy button in a row whose other actions are small tinted buttons', () => {
  let fixture: ComponentFixture<CopyButton>;

  beforeEach(async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    await TestBed.configureTestingModule({ imports: [CopyButton] }).compileComponents();
    fixture = TestBed.createComponent(CopyButton);
    fixture.componentRef.setInput('value', 'Zálohy nefungují.');
    fixture.componentRef.setInput('what', 'zprávu pro technika');
    fixture.componentRef.setInput('look', 'tinted');
    fixture.detectChanges();
  });

  const button = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  it('when it renders, then it is the small tinted button instead of the pill', () => {
    expect([...button().classList]).toEqual(
      expect.arrayContaining(['ui-button', 'ui-button--small']),
    );
    expect(button().classList).not.toContain('ui-pill-button');
  });

  it('when it is pressed, then it shows Zkopírováno and stays tinted without the outline of the pill', async () => {
    button().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button().classList).toContain('copy-button--copied');
    expect(button().classList).not.toContain('ui-pill-button--done');
    expect(button().classList).toContain('ui-button--small');
  });
});
