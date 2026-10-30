import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter, Router } from '@angular/router';

import { Connectivity } from '../../core/navigation/connectivity';
import { ExternalNavigation } from '../../core/navigation/external-navigation';
import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';
import { ChunkProbe } from '../../core/reload/chunk-probe';
import { ReloadGuard } from '../../core/reload/reload-guard';
import { ChunkLoadNotice } from './chunk-load-notice';

@Component({ template: '' })
class Page {}

const MESSAGE =
  'Stránku se nepodařilo otevřít. Web byl mezitím možná aktualizován nebo vypadlo připojení. Zkuste ji načíst znovu.';

describe('Given the chunk-load notice', () => {
  let fixture: ComponentFixture<ChunkLoadNotice>;
  let loadFromServer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    loadFromServer = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ChunkLoadNotice],
      providers: [
        provideRouter([
          { path: 'jinam', component: Page },
          { path: 'dale', component: Page, title: 'Dále | Nová naděje – nadační fond' },
        ]),
        { provide: ReloadGuard, useValue: { claim: () => false } },
        { provide: ExternalNavigation, useValue: { loadFromServer } },
        { provide: Connectivity, useValue: { isOffline: () => false } },
        { provide: ChunkProbe, useValue: { reloadWouldLand: () => Promise.resolve(true) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ChunkLoadNotice);
    fixture.detectChanges();
  });

  afterEach(() => document.documentElement.classList.remove('has-floating-notice'));

  const element = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) =>
    element().querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const reloadButton = () =>
    Array.from(element().querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Načíst znovu',
    );

  async function failToLoad(): Promise<void> {
    await TestBed.inject(ChunkLoadRecovery).handleNavigationError(
      new NavigationError(
        1,
        '/aktuality',
        new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk-x.js'),
      ),
    );
    await fixture.whenStable();
  }

  it('when every page loaded, then it shows nothing and reserves no room', () => {
    expect(element().textContent?.trim()).toBe('');
    expect(document.documentElement.classList).not.toContain('has-floating-notice');
  });

  describe('when a later page could not be loaded and no automatic reload is left', () => {
    beforeEach(async () => {
      await TestBed.inject(Router).navigateByUrl('/jinam');
      await failToLoad();
    });

    it('then a bar over the page says the page did not open and what to do', () => {
      expect(text('.chunk-load-bar')).toBe(`${MESSAGE} Načíst znovu`);
      expect(element().querySelector('main')).toBeNull();
    });

    it('then its button takes the focus', () => {
      expect(document.activeElement).toBe(reloadButton());
    });

    it('then the button that takes the focus announces the message once, as its description, and no alert repeats it', () => {
      const describedBy = reloadButton()?.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(describedBy)?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        MESSAGE,
      );
      expect(element().querySelector('[role="alert"], [aria-live]')).toBeNull();
    });

    describe('and the focus moves to a control the bar covers', () => {
      let scrollBy: ReturnType<typeof vi.fn>;
      let frames: FrameRequestCallback[];
      let control: HTMLInputElement;

      beforeEach(() => {
        frames = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
          frames.push(frame);
          return frames.length;
        });
        scrollBy = vi.fn();
        window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
        const bar = element().querySelector('.chunk-load-bar') as HTMLElement;
        vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 700, 800, 60));
        control = document.createElement('input');
        vi.spyOn(control, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 690, 200, 40));
      });

      afterEach(() => {
        control.closest('dialog')?.remove();
        control.remove();
        vi.restoreAllMocks();
      });

      it('then it scrolls the control above the bar only after the page has laid out again', () => {
        document.body.append(control);
        control.focus();

        expect(scrollBy).not.toHaveBeenCalled();
        frames.forEach((frame) => frame(0));
        expect(scrollBy).toHaveBeenCalledOnce();
        expect(scrollBy.mock.calls[0][0].top).toBeGreaterThanOrEqual(30);
      });

      it('and the control is inside an open dialog, then the page behind it does not move', () => {
        const dialog = document.createElement('dialog');
        dialog.setAttribute('open', '');
        dialog.append(control);
        document.body.append(dialog);
        control.focus();

        frames.forEach((frame) => frame(0));
        expect(scrollBy).not.toHaveBeenCalled();
      });
    });

    it('then the page keeps room for it at its end', () => {
      expect(document.documentElement.classList).toContain('has-floating-notice');
    });

    it('and the visitor presses the button, then the page is loaded from the server', () => {
      reloadButton()?.click();

      expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/aktuality');
    });

    it('and a later navigation succeeds, then the bar goes and the room is given back', async () => {
      await TestBed.inject(Router).navigateByUrl('/dale');
      await fixture.whenStable();

      expect(element().querySelector('.chunk-load-bar')).toBeNull();
      expect(document.documentElement.classList).not.toContain('has-floating-notice');
    });
  });

  describe('when the first page could not be loaded and no automatic reload is left', () => {
    beforeEach(failToLoad);

    it('then a page of its own says so under a main heading that takes the focus', () => {
      const heading = element().querySelector('main h1');

      expect(heading?.textContent?.trim()).toBe('Stránku se nepodařilo otevřít');
      expect(document.activeElement).toBe(heading);
      expect(text('main p')).toBe(
        'Web byl mezitím možná aktualizován nebo vypadlo připojení. Zkuste ji načíst znovu.',
      );
    });

    it('then it offers to load the page again or to go to the home page', () => {
      expect(reloadButton()).toBeTruthy();
      const home = element().querySelector<HTMLAnchorElement>('main a');
      expect(home?.textContent?.trim()).toBe('Přejít na úvod');
      expect(home?.getAttribute('href')).toBe('/');
    });

    it('then the tab says the page did not open, until a later page opens', async () => {
      expect(document.title).toBe('Stránku se nepodařilo otevřít | Nová naděje – nadační fond');

      await TestBed.inject(Router).navigateByUrl('/dale');
      await fixture.whenStable();

      expect(document.title).toBe('Dále | Nová naděje – nadační fond');
    });

    it('then it reserves no room for a bar', () => {
      expect(document.documentElement.classList).not.toContain('has-floating-notice');
    });

    it('and the visitor presses the button, then the page is loaded from the server', () => {
      reloadButton()?.click();

      expect(loadFromServer).toHaveBeenCalledExactlyOnceWith('/aktuality');
    });
  });
});
