import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginDialogService } from '../../../core/auth/login-dialog.service';
import { PasskeyAuthenticator } from '../../../core/auth/passkey-authenticator';
import { APP_JAR, SESSION_JAR } from '../../../core/auth/session-jar';
import { authResponse, FakePasskeyAuthenticator } from '../../../core/auth/testing/donor-fixtures';
import { DialogHistory } from '../../../shared/ui/dialog/dialog-history';
import { FakeDialogHistory } from '../../../shared/ui/dialog/testing/fake-dialog-history';
import { LoginDialog } from './login-dialog';

describe('Given the sign-in dialog in the installed app', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PasskeyAuthenticator, useValue: new FakePasskeyAuthenticator() },
        { provide: DialogHistory, useValue: new FakeDialogHistory() },
        { provide: SESSION_JAR, useValue: APP_JAR },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when it opens and the donor signs in, then no choice of session is offered and the app session is asked for', async () => {
    TestBed.inject(LoginDialogService).open('login', {});
    const fixture = TestBed.createComponent(LoginDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.session-choice')).toBeNull();
    expect(host.textContent).not.toContain('Zapamatovat si mě');

    for (const [selector, value] of [
      ['#login-email', 'jana@example.cz'],
      ['#login-password', 'correct horse battery'],
    ]) {
      const input = host.querySelector<HTMLInputElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    host.querySelector('.login-form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    const request = http.expectOne('/api/donors/auth/login');

    expect(request.request.body.session).toBe('APP');
    request.flush(authResponse('token-1'));
  });
});
