import { Observable, of } from 'rxjs';

import {
  DonorNotificationSwitches,
  DonorPushApi,
  DonorPushDevice,
  DonorPushResponse,
  DonorPushTestResponse,
} from '../donor-push-api';

const NO_DEVICE: DonorPushDevice = {
  service: 'google',
  notifications: { gifts: true, yearlyReceipts: true },
  createdAt: '2026-11-12T09:00:00Z',
  lastDeliveredAt: null,
  failuresInARow: 0,
};

export class FakeDonorPushApi implements Pick<
  DonorPushApi,
  'view' | 'subscribe' | 'changeNotifications' | 'remove' | 'test'
> {
  answer: DonorPushResponse = {
    publicKey: `B${'E'.repeat(86)}`,
    deviceSession: true,
    device: null,
    devices: [],
  };

  view(): Observable<DonorPushResponse> {
    return of(this.answer);
  }

  subscribe(): Observable<DonorPushDevice> {
    return of(NO_DEVICE);
  }

  changeNotifications(notifications: DonorNotificationSwitches): Observable<DonorPushDevice> {
    return of({ ...NO_DEVICE, notifications });
  }

  remove(): Observable<void> {
    return of(undefined);
  }

  test(): Observable<DonorPushTestResponse> {
    return of({ delivered: 0, failed: 0, removed: 0 });
  }
}
