import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppInstall, InstallWay } from '../../../../core/install/app-install';
import { InstallRow } from './install-row';

@Component({
  imports: [InstallRow],
  template: '<app-install-row howId="install-how" />',
})
class Host {}

describe('Given the row Přidat na plochu of the account', () => {
  const way = signal<InstallWay>('none');
  const install = vi.fn(() => Promise.resolve('accepted' as const));
  let fixture: ComponentFixture<Host>;

  beforeEach(async () => {
    way.set('none');
    install.mockClear();
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: AppInstall, useValue: { way: way.asReadonly(), install } }],
    }).compileComponents();
  });

  function open(): HTMLElement {
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function normalized(value: string | null | undefined): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
  }

  it('when the site already runs as an app or cannot be added, then no row shows', () => {
    expect(open().querySelector('button')).toBeNull();
  });

  it('when the browser can install the site, then the row asks the browser to install it', () => {
    way.set('prompt');
    const row = open().querySelector<HTMLButtonElement>('button')!;

    expect(normalized(row.textContent)).toBe('Přidat na plochu');
    expect(row.hasAttribute('aria-expanded')).toBe(false);

    row.click();

    expect(install).toHaveBeenCalledOnce();
  });

  it('when the site runs in Safari on an iPhone, then the row unfolds how to add it from the share menu', () => {
    way.set('ios-share');
    const host = open();
    const row = host.querySelector<HTMLButtonElement>('button')!;

    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector<HTMLElement>('#install-how')?.hidden).toBe(true);

    row.click();
    fixture.detectChanges();

    expect(row.getAttribute('aria-expanded')).toBe('true');
    const how = host.querySelector<HTMLElement>(`#${row.getAttribute('aria-controls')}`)!;
    expect(how.hidden).toBe(false);
    expect(normalized(how.textContent)).toBe(
      'Klepněte na Sdílet (v Safari ho najdete i pod tlačítkem ⋯) a pak na Přidat na plochu. V aplikaci se přihlásíte ještě jednou.',
    );
    expect(install).not.toHaveBeenCalled();
  });

  it('when the site runs in Safari on a Mac, then the row unfolds how to add it to the Dock', () => {
    way.set('mac-dock');
    const host = open();
    const row = host.querySelector<HTMLButtonElement>('button')!;

    row.click();
    fixture.detectChanges();

    expect(
      normalized(host.querySelector(`#${row.getAttribute('aria-controls')}`)?.textContent),
    ).toBe(
      'V Safari zvolte v nabídce Soubor položku Přidat do Docku. V aplikaci se přihlásíte ještě jednou.',
    );
  });
});
