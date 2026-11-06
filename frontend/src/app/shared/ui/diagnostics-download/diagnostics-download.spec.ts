import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthStore } from '../../../core/auth/auth-store';
import { Diagnostics } from '../../../core/diagnostics/diagnostics';
import { DiagnosticsDownload } from './diagnostics-download';

@Component({
  imports: [DiagnosticsDownload],
  template: `<app-diagnostics-download source="receipt-pdf" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {}

describe('Given the offer of a diagnostic file', () => {
  let fixture: ComponentFixture<Host>;
  let download: ReturnType<typeof vi.fn>;
  let storesNothing: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    download = vi.fn(() => Promise.resolve());
    storesNothing = signal(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: Diagnostics, useValue: { download } },
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

  it('when the button is pressed, then the file of its place is downloaded and the button waits meanwhile', async () => {
    let finish: () => void = () => undefined;
    download.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

    button().click();
    await fixture.whenStable();

    expect(download).toHaveBeenCalledWith('receipt-pdf');
    expect(button().disabled).toBe(true);
    expect(button().textContent?.trim()).toBe('Připravujeme soubor…');
    finish();
    await vi.waitFor(() => expect(button().disabled).toBe(false));
  });

  it('when the file cannot be made, then an alert says so and what to do instead', async () => {
    download.mockRejectedValue(new Error('Blob refused'));

    button().click();

    await vi.waitFor(() =>
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
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
