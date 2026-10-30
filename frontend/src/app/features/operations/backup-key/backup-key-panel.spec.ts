import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BackupKeyPanel, backupKeyFile } from './backup-key-panel';

const KEY = 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH';

describe('Given the backup key panel', () => {
  let fixture: ComponentFixture<BackupKeyPanel>;

  async function render(): Promise<void> {
    await TestBed.configureTestingModule({ imports: [BackupKeyPanel] }).compileComponents();
    fixture = TestBed.createComponent(BackupKeyPanel);
    fixture.componentRef.setInput('key', KEY);
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const root = () => fixture.nativeElement as HTMLElement;

  function text(selector: string): string {
    return (root().querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('when it is shown, then the key is there as its 24 numbered words only', async () => {
    await render();

    expect(root().textContent).not.toContain(KEY);
    const words = Array.from(root().querySelectorAll('ol.backup-key-word-list li'));
    expect(words.map((word) => word.textContent?.trim())).toEqual(
      'divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon motivace naivita zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat moudrost studna'.split(
        ' ',
      ),
    );
    expect(text('.backup-key-hint')).toContain('stačí první čtyři písmena');
  });

  it('when the words are copied, then the clipboard holds the 24 words in order', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();

    (root().querySelector('app-copy-button button') as HTMLButtonElement).click();
    await settle();

    expect(writeText).toHaveBeenCalledWith(
      'divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon motivace naivita zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat moudrost studna',
    );
  });

  it('when it is shown, then it offers copying and the file and nothing that hands the key to the browser', async () => {
    await render();

    const labels = Array.from(root().querySelectorAll('button')).map((button) =>
      button.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual(['Kopírovat slova klíče k zálohám', 'Stáhnout jako soubor']);
  });
});

describe('Given a backup key', () => {
  it('when its file is written, then age reads the key from the last line and the words stand as comments', () => {
    const lines = backupKeyFile(KEY).split('\n');

    expect(lines.at(-2)).toBe(KEY);
    expect(lines.at(-1)).toBe('');
    expect(lines.slice(0, -2).every((line) => line.startsWith('#'))).toBe(true);
    expect(lines).toContain(
      '# 1. divoch  2. komora  3. probudit  4. najednou  5. dekl  6. komando  7. nikl  8. odebrat  9. biograf  10. bytovka  11. dodnes  12. mikrofon',
    );
    expect(lines.join('\n')).toContain('24. studna');
  });
});
