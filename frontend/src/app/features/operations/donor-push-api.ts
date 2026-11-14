import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export type DonorPushService = 'google' | 'apple' | 'mozilla' | 'microsoft';

export interface DonorNotificationSwitches {
  readonly gifts: boolean;
  readonly yearlyReceipts: boolean;
}

export interface DonorPushDevice {
  readonly service: DonorPushService;
  readonly notifications: DonorNotificationSwitches;
  readonly createdAt: string;
  readonly lastDeliveredAt: string | null;
  readonly failuresInARow: number;
}

export interface DonorPushResponse {
  readonly publicKey: string;
  readonly deviceSession: boolean;
  readonly device: DonorPushDevice | null;
  readonly devices: readonly string[];
}

export interface DonorPushTestResponse {
  readonly delivered: number;
  readonly failed: number;
  readonly removed: number;
}

export interface DonorPushSubscriptionRequest {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
  readonly notifications?: DonorNotificationSwitches;
}

const PUSH = '/api/operations/push';

@Injectable({ providedIn: 'root' })
export class DonorPushApi {
  private readonly http = inject(HttpClient);

  view(): Observable<DonorPushResponse> {
    return this.http.get<DonorPushResponse>(PUSH);
  }

  subscribe(request: DonorPushSubscriptionRequest): Observable<DonorPushDevice> {
    return this.http.put<DonorPushDevice>(`${PUSH}/device`, request);
  }

  changeNotifications(notifications: DonorNotificationSwitches): Observable<DonorPushDevice> {
    return this.http.put<DonorPushDevice>(`${PUSH}/device/notifications`, notifications);
  }

  remove(): Observable<void> {
    return this.http.delete<void>(`${PUSH}/device`);
  }

  test(): Observable<DonorPushTestResponse> {
    return this.http.post<DonorPushTestResponse>(`${PUSH}/test`, {});
  }
}
