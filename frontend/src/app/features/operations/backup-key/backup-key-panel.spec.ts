import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BackupKeyPanel, backupKeyFile } from './backup-key-panel';

const KEY = 'AGE-SECRET-KEY-1R45A984EXXAFC85YZSYGY9R6XJTD4E9AKY65ZCRGPDQ89E7ANW8QKT6GWH';

interface StoredCredential {
  id: string;
  password: string;
  name: string;
}

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

  async function save(): Promise<void> {
    (root().querySelector('.backup-key-save') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve));
    await settle();
  }

  afterEach(() => {
    delete (globalThis as { PasswordCredential?: unknown }).PasswordCredential;
    Reflect.deleteProperty(navigator, 'credentials');
    vi.restoreAllMocks();
  });

  it('when it is shown, then the key and its 24 numbered words are there', async () => {
    await render();

    expect(text('.backup-key')).toBe(KEY);
    const words = Array.from(root().querySelectorAll('ol.backup-key-word-list li'));
    expect(words.map((word) => word.textContent?.trim())).toEqual(
      'divoch komora probudit najednou dekl komando nikl odebrat biograf bytovka dodnes mikrofon motivace naivita zdaleka ekonomie jeseter azyl atlas obyvatel glazura vytesat moudrost studna'.split(
        ' ',
      ),
    );
    expect(text('.backup-key-words')).toContain('stačí první čtyři písmena');
  });

  describe('when the browser stores passwords through the Credential Management API', () => {
    let stored: StoredCredential[];

    beforeEach(async () => {
      stored = [];
      class FakePasswordCredential {
        constructor(readonly data: StoredCredential) {}
      }
      (globalThis as { PasswordCredential?: unknown }).PasswordCredential = FakePasswordCredential;
      Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: {
          store: vi.fn(async (credential: FakePasswordCredential) => {
            stored.push(credential.data);
            return credential;
          }),
        },
      });
      await render();
    });

    it('then saving hands the key to the password manager under its own name', async () => {
      await save();

      expect(stored).toEqual([{ id: 'Klíč k zálohám', password: KEY, name: 'Klíč k zálohám' }]);
      expect(text('app-live-notice [role="status"]')).toContain('Pokud prohlížeč nabídl uložení');
      expect(document.querySelector('body > form')).toBeNull();
    });

    it('and the browser refuses, then the panel says to copy the key by hand', async () => {
      vi.mocked(navigator.credentials.store).mockRejectedValueOnce(new Error('NotAllowedError'));

      await save();

      expect(text('app-live-notice [role="alert"]')).toContain('Klíč prosím zkopírujte');
    });
  });

  describe('when the browser has no Credential Management API', () => {
    beforeEach(() => render());

    it('then saving submits an off-screen form with the key as a new password and removes it', async () => {
      const submitted: { username: string; password: string; prevented: boolean }[] = [];
      vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(function (
        this: HTMLFormElement,
      ) {
        const fields = Array.from(this.querySelectorAll('input'));
        const event = new Event('submit', { cancelable: true });
        this.dispatchEvent(event);
        submitted.push({
          username: fields.find((field) => field.autocomplete === 'username')?.value ?? '',
          password:
            fields.find(
              (field) => field.type === 'password' && field.autocomplete === 'new-password',
            )?.value ?? '',
          prevented: event.defaultPrevented,
        });
        expect(this.isConnected).toBe(true);
        expect(this.getAttribute('action')).toBeNull();
        expect(this.getAttribute('name')).toBeNull();
      });

      await save();

      expect(submitted).toEqual([{ username: 'Klíč k zálohám', password: KEY, prevented: true }]);
      expect(document.querySelector('body > form')).toBeNull();
      expect(text('app-live-notice [role="status"]')).toContain('Pokud prohlížeč nabídl uložení');
    });
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
