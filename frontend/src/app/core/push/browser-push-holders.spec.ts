import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthStore } from '../auth/auth-store';
import { authResponse, sampleDonor } from '../auth/testing/donor-fixtures';
import { BrowserPushHolders } from './browser-push-holders';

describe('Given one push subscription of this browser shared by the donor notifications and the administration alerts', () => {
  let holders: BrowserPushHolders;
  let http: HttpTestingController;

  function signIn(roles: string[]): void {
    TestBed.inject(AuthStore).login('jana@example.cz', 'correct horse battery').subscribe();
    http.expectOne('/api/donors/auth/login').flush(authResponse('token-1', sampleDonor({ roles })));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    holders = TestBed.inject(BrowserPushHolders);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when a donor without the administrator role asks, then no administration alert holds the browser and nothing is asked', async () => {
    signIn(['DONOR']);

    expect(await holders.administrationAlertsHere()).toBe(false);
  });

  it.each([
    [[{ current: true }], true],
    [[{ current: false }], false],
    [[], false],
  ])(
    'when the administration lists %j, then this device holds the browser: %s',
    async (subscriptions, held) => {
      signIn(['DONOR', 'ADMIN']);
      const answer = holders.administrationAlertsHere();
      http.expectOne('/api/admin/operations/push').flush({ subscriptions });

      expect(await answer).toBe(held);
    },
  );

  it.each([
    [{ device: { service: 'google' } }, true],
    [{ device: null }, false],
  ])(
    'when the donor notifications answer %j, then they hold the browser: %s',
    async (view, held) => {
      const answer = holders.donorNotificationsHere();
      http.expectOne('/api/operations/push').flush(view);

      expect(await answer).toBe(held);
    },
  );

  it('when either question fails, then the browser is kept, so nothing of the other side is lost', async () => {
    signIn(['DONOR', 'ADMIN']);
    const administration = holders.administrationAlertsHere();
    http.expectOne('/api/admin/operations/push').flush(null, { status: 503, statusText: 'Busy' });
    const donor = holders.donorNotificationsHere();
    http.expectOne('/api/operations/push').flush(null, { status: 503, statusText: 'Busy' });

    expect(await administration).toBe(true);
    expect(await donor).toBe(true);
  });
});
