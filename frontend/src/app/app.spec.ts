import { ChangeDetectionStrategy, Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter } from '@angular/router';
import { App } from './app';
import { LoginDialogService } from './core/auth/login-dialog.service';
import { ErrorReporter } from './core/errors/error-reporter';
import { LOGIN_DIALOG_LOADER, LoginDialogLoader } from './login-dialog-loader';
import { ExternalNavigation } from './core/navigation/external-navigation';
import { ChunkLoadRecovery } from './core/reload/chunk-load-recovery';
import { ReloadGuard } from './core/reload/reload-guard';
import { withOrdinarySpaces } from '../testing/ordinary-spaces';

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

    expect(
      withOrdinarySpaces((fixture.nativeElement.querySelector('main') as HTMLElement).textContent),
    ).toContain('Načíst znovu');
  });
});

describe('Given the App component with the sign-in dialog not loaded yet', () => {
  let load: ReturnType<typeof vi.fn<LoginDialogLoader>>;

  beforeEach(async () => {
    load = vi.fn<LoginDialogLoader>(() => Promise.resolve(LoadedDialog));
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: LOGIN_DIALOG_LOADER, useValue: load }],
    }).compileComponents();
  });

  it('when nobody opens the dialog, then its code is never loaded', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(load).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('app-loaded-dialog')).toBeNull();
  });

  it('when the dialog opens, then its code is loaded and the dialog is shown', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(LoginDialogService).open();
    await fixture.whenStable();

    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('app-loaded-dialog')).not.toBeNull();
  });

  it('when the dialog opens a second time, then its code is not loaded again', async () => {
    const fixture = TestBed.createComponent(App);
    const dialog = TestBed.inject(LoginDialogService);
    dialog.open();
    await fixture.whenStable();
    dialog.close();
    await fixture.whenStable();

    dialog.open();
    await fixture.whenStable();

    expect(load).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('app-loaded-dialog')).not.toBeNull();
  });

  it('when the dialog closes before its code arrives, then nothing is shown', async () => {
    let arrive: (dialog: Type<unknown>) => void = () => undefined;
    load.mockImplementation(() => new Promise((resolve) => (arrive = resolve)));
    const fixture = TestBed.createComponent(App);
    const dialog = TestBed.inject(LoginDialogService);
    dialog.open();
    await fixture.whenStable();
    dialog.close();

    arrive(LoadedDialog);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('app-loaded-dialog')).toBeNull();
  });

  it('when the code of the dialog cannot be loaded, then the dialog closes, the failure is reported and a bar offers a reload', async () => {
    load.mockRejectedValue(new TypeError('Importing a module script failed.'));
    const report = vi.spyOn(TestBed.inject(ErrorReporter), 'report').mockReturnValue(undefined);
    const fixture = TestBed.createComponent(App);
    const dialog = TestBed.inject(LoginDialogService);
    dialog.open();
    await fixture.whenStable();

    expect(dialog.isOpen()).toBe(false);
    expect(report).toHaveBeenCalledWith('chunk-load', 'global', expect.any(TypeError));
    expect(
      withOrdinarySpaces(
        (fixture.nativeElement.querySelector('.chunk-load-bar') as HTMLElement).textContent,
      ),
    ).toContain('Načíst znovu');
  });

  it('when the dialog opens again after its code could not be loaded, then the code is asked for again', async () => {
    load.mockRejectedValueOnce(new TypeError('Importing a module script failed.'));
    vi.spyOn(TestBed.inject(ErrorReporter), 'report').mockReturnValue(undefined);
    const fixture = TestBed.createComponent(App);
    const dialog = TestBed.inject(LoginDialogService);
    dialog.open();
    await fixture.whenStable();

    dialog.open();
    await fixture.whenStable();

    expect(load).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('app-loaded-dialog')).not.toBeNull();
  });
});

@Component({
  selector: 'app-loaded-dialog',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LoadedDialog {}
