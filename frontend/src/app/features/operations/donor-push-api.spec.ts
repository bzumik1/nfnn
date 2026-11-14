import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DonorPushApi } from './donor-push-api';

describe('Given the push notifications of a donor', () => {
  let api: DonorPushApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DonorPushApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('when the card reads, subscribes, switches, turns off and tests, then each goes to its address of this device', () => {
    api.view().subscribe();
    http.expectOne({ method: 'GET', url: '/api/operations/push' }).flush({});

    api
      .subscribe({
        endpoint: 'https://fcm.googleapis.com/fcm/send/x',
        keys: { p256dh: 'p', auth: 'a' },
      })
      .subscribe();
    const subscribe = http.expectOne({ method: 'PUT', url: '/api/operations/push/device' });
    expect(subscribe.request.body).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      keys: { p256dh: 'p', auth: 'a' },
    });
    subscribe.flush({});

    api.changeNotifications({ gifts: false, yearlyReceipts: true }).subscribe();
    const change = http.expectOne({
      method: 'PUT',
      url: '/api/operations/push/device/notifications',
    });
    expect(change.request.body).toEqual({ gifts: false, yearlyReceipts: true });
    change.flush({});

    api.remove().subscribe();
    http.expectOne({ method: 'DELETE', url: '/api/operations/push/device' }).flush(null);

    api.test().subscribe();
    http.expectOne({ method: 'POST', url: '/api/operations/push/test' }).flush({});
  });
});
