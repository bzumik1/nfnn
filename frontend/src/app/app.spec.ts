import { TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter } from '@angular/router';
import { App } from './app';
import { ExternalNavigation } from './core/navigation/external-navigation';
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { ReloadGuard } from './core/reload/reload-guard';

describe('Given the App component', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('when bootstrapped, then it creates without errors', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('Given the App component when no automatic reload is left', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ReloadGuard, useValue: { claim: () => false } },
        { provide: ExternalNavigation, useValue: { loadFromServer: vi.fn() } },
      ],
    }).compileComponents();
  });

  it('when the first page fails to load, then it offers to load the page again', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(ChunkLoadRecovery).handleNavigationError(
      new NavigationError(1, '/projekty', new TypeError('Importing a module script failed.')),
    );
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('main') as HTMLElement).textContent).toContain(
      'Načíst znovu',
    );
  });
});
