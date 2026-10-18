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
  const status = () => (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).textContent?.trim();

  async function press(): Promise<void> {
    button().click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  it('when it renders, then it says what it copies', () => {
    expect(button().textContent?.replace(/\s+/g, ' ').trim()).toBe('Kopírovat číslo účtu');
    expect(status()).toBe('');
  });

  it('when it is pressed, then the value is in the clipboard and the button says it is copied', async () => {
    await press();

    expect(writeText).toHaveBeenCalledWith('5544332217/2010');
    expect(button().textContent).toContain('Zkopírováno');
    expect(button().textContent?.trim()).toBe('Zkopírováno');
    expect(status()).toBe('Zkopírováno.');
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
