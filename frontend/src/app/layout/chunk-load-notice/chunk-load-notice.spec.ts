import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter } from '@angular/router';

import { ExternalNavigation } from '../../core/navigation/external-navigation';
import { ChunkLoadRecovery } from '../../core/reload/chunk-load-recovery';
import { ReloadGuard } from '../../core/reload/reload-guard';
import { ChunkLoadNotice } from './chunk-load-notice';

describe('Given the chunk-load notice', () => {
  let fixture: ComponentFixture<ChunkLoadNotice>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    assign = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ChunkLoadNotice],
      providers: [
        provideRouter([]),
        { provide: ReloadGuard, useValue: { claim: () => false } },
        { provide: ExternalNavigation, useValue: { assign } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ChunkLoadNotice);
    fixture.detectChanges();
  });

  const alert = () => fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
  const reloadButton = () =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;

  async function failToLoad(): Promise<void> {
    TestBed.inject(ChunkLoadRecovery).handleNavigationError(
      new NavigationError(
        1,
        '/aktuality',
        new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk-x.js'),
      ),
    );
    await fixture.whenStable();
  }

  it('when every page loaded, then it shows nothing', () => {
    expect(alert()).toBeNull();
    expect(reloadButton()).toBeNull();
  });

  describe('when a page could not be loaded and no automatic reload is left', () => {
    beforeEach(failToLoad);

    it('then an alert says the page did not open and why that may be', () => {
      expect(alert()?.textContent?.replace(/\s+/g, ' ').trim()).toContain(
        'Stránku se nepodařilo otevřít. Web mezitím mohl dostat novou verzi, nebo vypadlo připojení.',
      );
    });

    it('then it offers to load the page again', () => {
      expect(reloadButton()?.textContent?.trim()).toBe('Načíst znovu');
    });

    it('and the visitor presses the button, then the page is loaded from the server', () => {
      reloadButton()?.click();

      expect(assign).toHaveBeenCalledExactlyOnceWith('/aktuality');
    });
  });
});
