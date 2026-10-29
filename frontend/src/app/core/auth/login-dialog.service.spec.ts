import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DialogHistory } from '../../shared/ui/dialog/dialog-history';
import { FakeDialogHistory } from '../../shared/ui/dialog/testing/fake-dialog-history';
import { LoginDialogService } from './login-dialog.service';

describe('Given the sign-in dialog service', () => {
  let service: LoginDialogService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let history: FakeDialogHistory;

  beforeEach(() => {
    history = new FakeDialogHistory();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: DialogHistory, useValue: history }],
    });
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

  it('when the dialog is opened from the donate section and then from elsewhere, then only the first registration leads back after the e-mail', () => {
    service.open('register', { confirmationReturnTo: '/#prispet' });

    expect(service.confirmationReturnTo()).toBe('/#prispet');

    service.close();
    service.open('register');

    expect(service.confirmationReturnTo()).toBeNull();
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
    it('then the dialog closes, hands its history entry to that page and opens it', () => {
      const signedIn = vi.fn();
      service.open('login', { returnTo: '/sprava/platby', afterSignIn: signedIn });

      service.signedIn();

      expect(service.isOpen()).toBe(false);
      expect(history.handedOver).toEqual(['/sprava/platby']);
      expect(history.closed).toBe(0);
      expect(navigate).toHaveBeenCalledWith('/sprava/platby');
      expect(signedIn).not.toHaveBeenCalled();
    });
  });

  describe('when the visitor presses Back', () => {
    it('on the first step, then the dialog closes like with its cross and no destination opens', () => {
      service.open('login', { returnTo: '/darce/prehled' });

      history.listener?.close();

      expect(service.isOpen()).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('on a further step, then the dialog hears it and stays open', () => {
      const stepBack = vi.fn();
      service.open('login');
      service.onStepBack(stepBack);
      service.showStep(1);

      history.listener?.stepBack();

      expect(history.steps).toEqual([1]);
      expect(stepBack).toHaveBeenCalledTimes(1);
      expect(service.isOpen()).toBe(true);
    });
  });

  it('when the dialog is closed, then the history entries it added are taken back', () => {
    service.open('login');

    service.close();

    expect(history.closed).toBe(1);
    expect(history.released).toBe(0);
  });

  it('when a link in the dialog opens another page in its place, then the dialog closes and leaves history to that page', () => {
    service.open('register');

    service.closeForNavigation();

    expect(service.isOpen()).toBe(false);
    expect(history.released).toBe(1);
    expect(history.closed).toBe(0);
  });

  it('when the dialog is opened again without a destination, then an earlier destination is forgotten', () => {
    service.open('login', { returnTo: '/darce/prehled' });
    service.close();
    service.open();

    service.signedIn();

    expect(navigate).not.toHaveBeenCalled();
  });

  it('when the dialog is opened with an address, then it offers that address until it is opened without one', () => {
    service.open('register', { email: 'spravce@nfnn.cz' });

    expect(service.initialEmail()).toBe('spravce@nfnn.cz');

    service.close();
    service.open('login');

    expect(service.initialEmail()).toBe('');
  });

  describe('when a half-filled registration is kept as the dialog closes', () => {
    const draft = {
      donorType: 'PERSON' as const,
      signInMethod: 'password' as const,
      name: 'Jana Nováková',
      companyIdentifier: '',
      street: 'Dlouhá 12',
      city: '',
      postalCode: '',
      email: 'jana@example.cz',
    };

    beforeEach(() => {
      service.open('register');
      service.keepRegistrationDraft(draft);
      service.close();
    });

    it('then the next dialog gets it back', () => {
      service.open('login');

      expect(service.registrationDraft()).toEqual(draft);
    });

    it('and the donor then signs in, then it is forgotten', () => {
      service.open('login');

      service.signedIn();

      expect(service.registrationDraft()).toBeNull();
    });

    it('and it is dropped, then the next dialog starts empty', () => {
      service.dropRegistrationDraft();

      expect(service.registrationDraft()).toBeNull();
    });
  });
});
