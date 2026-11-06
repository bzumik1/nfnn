import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthStore } from '../../../core/auth/auth-store';
import { Diagnostics, PreparedDiagnostics } from '../../../core/diagnostics/diagnostics';
import { DiagnosticsDownload } from './diagnostics-download';

@Component({
  imports: [DiagnosticsDownload],
  template: `<app-diagnostics-download source="receipt-pdf" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {}

const PREPARED: PreparedDiagnostics = {
  blob: new Blob(['{}'], { type: 'application/json' }),
  fileName: 'nfnn-diagnostika-2026-11-06-1403.json',
};

describe('Given the offer of a diagnostic file', () => {
  let fixture: ComponentFixture<Host>;
  let diagnostics: {
    prepare: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    needsSecondTap: ReturnType<typeof vi.fn>;
    share: ReturnType<typeof vi.fn>;
  };
  let storesNothing: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    diagnostics = {
      prepare: vi.fn(() => Promise.resolve(PREPARED)),
      save: vi.fn(),
      needsSecondTap: vi.fn(() => false),
      share: vi.fn(() => Promise.resolve('shared')),
    };
    storesNothing = signal(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: Diagnostics, useValue: diagnostics },
        { provide: AuthStore, useValue: { storesNothing } },
      ],
    });
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  function region(role: 'status' | 'alert'): string {
    return fixture.nativeElement.querySelector(`[role="${role}"]`)?.textContent?.trim() ?? '';
  }

  it('when it is shown, then it says what the file holds, that nothing is sent by itself and where to send it', () => {
    expect(text()).toContain(
      'Když nám píšete o potížích s webem, přiložte prosím diagnostický soubor. Je v něm jen stav webu v tomto zařízení, žádné vaše údaje ani hesla, a sám se nikam neodesílá.',
    );
    expect(button().textContent?.trim()).toBe('Stáhnout diagnostický soubor');
    expect(button().type).toBe('button');
  });

  it('when it is shown, then its e-mail link carries only the subject', () => {
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;

    expect(link.textContent?.trim()).toBe('info@nfnn.cz');
    expect(link.getAttribute('href')).toBe(
      'mailto:info@nfnn.cz?subject=Diagnostick%C3%BD%20soubor',
    );
  });

  it('when the button is pressed, then the file of its place is prepared while the focused button stays and waits', async () => {
    let finish: (prepared: PreparedDiagnostics) => void = () => undefined;
    diagnostics.prepare.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    button().focus();

    button().click();
    await fixture.whenStable();

    expect(diagnostics.prepare).toHaveBeenCalledWith('receipt-pdf');
    expect(button().disabled).toBe(false);
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().textContent?.trim()).toBe('Připravujeme soubor…');
    expect(document.activeElement).toBe(button());
    button().click();
    expect(diagnostics.prepare).toHaveBeenCalledTimes(1);
    finish(PREPARED);
    await vi.waitFor(() => expect(button().getAttribute('aria-disabled')).toBeNull());
  });

  it('when the file is saved, then a status line names it and says to attach it to an e-mail', async () => {
    button().click();

    await vi.waitFor(() =>
      expect(region('status')).toBe(
        'Soubor nfnn-diagnostika-2026-11-06-1403.json je ve stažených souborech. Přiložte ho prosím k e‑mailu na info@nfnn.cz.',
      ),
    );
    expect(diagnostics.save).toHaveBeenCalledWith(PREPARED);
    expect(button().textContent?.trim()).toBe('Stáhnout diagnostický soubor');
  });

  describe('when the device shares files instead of saving them, as an iPhone does', () => {
    beforeEach(async () => {
      diagnostics.needsSecondTap.mockReturnValue(true);
      button().focus();
      button().click();
      await vi.waitFor(() =>
        expect(button().textContent?.trim()).toBe('Sdílet diagnostický soubor'),
      );
    });

    it('then the same focused button asks for a second tap and says what it is for', () => {
      expect(document.activeElement).toBe(button());
      expect(region('status')).toBe(
        'Soubor je připravený. Klepnutím na Sdílet diagnostický soubor ho pošlete e‑mailem na info@nfnn.cz.',
      );
      expect(diagnostics.save).not.toHaveBeenCalled();
    });

    it('and the second tap shares it, then the button starts over', async () => {
      button().click();

      await vi.waitFor(() =>
        expect(button().textContent?.trim()).toBe('Stáhnout diagnostický soubor'),
      );
      expect(diagnostics.share).toHaveBeenCalledWith(PREPARED);
      expect(region('status')).toBe('');
    });

    it('and the share sheet is closed, then the file stays ready for another tap', async () => {
      diagnostics.share.mockResolvedValue('dismissed');

      button().click();
      await fixture.whenStable();
      await Promise.resolve();

      expect(button().textContent?.trim()).toBe('Sdílet diagnostický soubor');
    });

    it('and sharing fails, then the file is saved instead and the status line says where', async () => {
      diagnostics.share.mockResolvedValue('failed');

      button().click();

      await vi.waitFor(() => expect(diagnostics.save).toHaveBeenCalledWith(PREPARED));
      await vi.waitFor(() => expect(region('status')).toContain('je ve stažených souborech'));
    });
  });

  it('when the file cannot be made, then an alert says so and what to do instead', async () => {
    diagnostics.prepare.mockRejectedValue(new Error('Blob refused'));

    button().click();

    await vi.waitFor(() =>
      expect(region('alert')).toBe(
        'Soubor se nepodařilo připravit. Napište nám prosím i bez něj, v jakém prohlížeči a na které stránce potíže máte.',
      ),
    );
  });

  it("when the donor signed in on someone else's computer, then it asks to delete the file after sending it", async () => {
    storesNothing.set(true);
    await fixture.whenStable();

    expect(text()).toContain(
      'Soubor zůstane ve stažených souborech tohoto počítače. Po odeslání ho prosím smažte.',
    );
  });

  it('when the donor uses their own device, then it says nothing about deleting the file', () => {
    expect(text()).not.toContain('smažte');
  });
});
