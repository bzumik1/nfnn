import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginDialogService } from './login-dialog.service';

describe('Given the sign-in dialog service', () => {
  let service: LoginDialogService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(LoginDialogService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  it('when nothing has opened the dialog, then it is closed and would start on sign-in', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.initialMode()).toBe('login');
  });

  it('when the dialog is opened without a mode, then it starts on sign-in', () => {
    service.open('reset');
    service.close();

    service.open();

    expect(service.isOpen()).toBe(true);
    expect(service.initialMode()).toBe('login');
  });

  it('when the dialog is opened on the password reset, then it starts on the reset tab', () => {
    service.open('reset');

    expect(service.isOpen()).toBe(true);
    expect(service.initialMode()).toBe('reset');
  });

  it('when the dialog is closed, then it is no longer open', () => {
    service.open('register');

    service.close();

    expect(service.isOpen()).toBe(false);
  });

  describe('when a donor signs in through a dialog opened without a destination', () => {
    it('then the dialog closes, the page stays and the opener hears about it', () => {
      const signedIn = vi.fn();
      service.open('login', { afterSignIn: signedIn });

      service.signedIn();

      expect(service.isOpen()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
      expect(signedIn).toHaveBeenCalledTimes(1);
    });
  });

  describe('when a donor signs in through a dialog opened for a protected page', () => {
    it('then the dialog closes and the page they asked for opens', () => {
      const signedIn = vi.fn();
      service.open('login', { returnTo: '/sprava/platby', afterSignIn: signedIn });

      service.signedIn();

      expect(service.isOpen()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/sprava/platby');
      expect(signedIn).not.toHaveBeenCalled();
    });
  });

  it('when the dialog is opened again without a destination, then an earlier destination is forgotten', () => {
    service.open('login', { returnTo: '/darce/prehled' });
    service.close();
    service.open();

    service.signedIn();

    expect(navigate).not.toHaveBeenCalled();
  });
});
