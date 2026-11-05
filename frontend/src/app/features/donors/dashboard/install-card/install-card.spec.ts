import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppInstall, InstallOutcome, InstallWay } from '../../../../core/install/app-install';
import { InstallCard } from './install-card';

describe('Given the install card in the donor overview', () => {
  let fixture: ComponentFixture<InstallCard>;
  let way: ReturnType<typeof signal<InstallWay>>;
  let offered: ReturnType<typeof signal<boolean>>;
  let install: ReturnType<typeof vi.fn>;
  let hideOffer: ReturnType<typeof vi.fn>;

  async function render(shown: InstallWay, outcome: InstallOutcome = 'accepted'): Promise<void> {
    way = signal<InstallWay>(shown);
    offered = signal(shown !== 'none');
    install = vi.fn(() => Promise.resolve(outcome));
    hideOffer = vi.fn(() => offered.set(false));
    TestBed.configureTestingModule({
      providers: [{ provide: AppInstall, useValue: { way, offered, install, hideOffer } }],
    });
    fixture = TestBed.createComponent(InstallCard);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  }

  afterEach(() => fixture.nativeElement.remove());

  const text = () =>
    (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim();
  const button = (name: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === name,
    );

  it('when the device can install nothing, then the card is not there', async () => {
    await render('none');

    expect(text()).toBe('');
  });

  it('when it appears on an iPhone, then it explains Share and Add to Home Screen, says the app asks to sign in again and takes no focus', async () => {
    await render('ios-share');

    expect(fixture.nativeElement.querySelector('h2')?.textContent?.trim()).toBe(
      'Nová naděje jako aplikace',
    );
    expect(text()).toContain(
      'Klepněte na Sdílet (v Safari ho najdete i pod tlačítkem ⋯) a pak na Přidat na plochu. V aplikaci se přihlásíte ještě jednou.',
    );
    expect(button('Nainstalovat aplikaci')).toBeUndefined();
    expect(fixture.nativeElement.contains(document.activeElement)).toBe(false);
  });

  it('when it appears in Safari on a Mac, then it explains Add to Dock', async () => {
    await render('mac-dock');

    expect(text()).toContain('V Safari zvolte v nabídce Soubor položku Přidat do Docku.');
  });

  describe('when the browser offers its own install', () => {
    beforeEach(() => render('prompt'));

    it('then the card offers a button for it and no manual steps', () => {
      expect(button('Nainstalovat aplikaci')).toBeDefined();
      expect(text()).not.toContain('Sdílet');
    });

    it('and the donor installs, then the card says so and the line takes the focus', async () => {
      button('Nainstalovat aplikaci')?.click();
      await vi.waitFor(() => expect(install).toHaveBeenCalled());
      await fixture.whenStable();

      expect(text()).toBe(
        'Aplikace se instaluje. Najdete ji mezi ostatními aplikacemi v zařízení.',
      );
      expect(document.activeElement?.classList).toContain('install-card__closed');
    });
  });

  it('when the donor turns the browser install down and the browser stops offering it, then the card says so and the line takes the focus', async () => {
    await render('prompt', 'dismissed');
    install.mockImplementation(() => {
      way.set('none');
      offered.set(false);
      return Promise.resolve('dismissed');
    });

    button('Nainstalovat aplikaci')?.click();
    await vi.waitFor(() => expect(install).toHaveBeenCalled());
    await fixture.whenStable();

    expect(text()).toBe(
      'Aplikaci teď instalovat nebudeme. Přidat si ji můžete kdykoli z nabídky prohlížeče.',
    );
    expect(document.activeElement?.classList).toContain('install-card__closed');
  });

  it('when the donor presses Teď ne, then the offer is hidden, the card says where to install later and the focus stays on it', async () => {
    await render('ios-share');

    button('Teď ne')?.click();
    await fixture.whenStable();

    expect(hideOffer).toHaveBeenCalledTimes(1);
    expect(text()).toBe(
      'Dobře, nabídku na tři měsíce skryjeme. Web si jako aplikaci můžete přidat kdykoli z nabídky prohlížeče.',
    );
    expect(document.activeElement?.classList).toContain('install-card__closed');
  });
});
