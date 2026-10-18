import { TestBed } from '@angular/core/testing';
import { LoginDialogService } from './login-dialog.service';

describe('Given the sign-in dialog service', () => {
  let service: LoginDialogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoginDialogService);
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
});
