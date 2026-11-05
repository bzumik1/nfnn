import { InjectionToken } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';

export interface DevicePushSubscription {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface PushNotificationClick {
  readonly action: string;
  readonly data: unknown;
}

export interface ServiceWorkerPush {
  readonly isEnabled: boolean;
  readonly controllerChanges: Observable<void>;
  readonly messages: Observable<unknown>;
  readonly notificationClicks: Observable<PushNotificationClick>;
  requestSubscription(publicKey: string): Promise<DevicePushSubscription>;
  unsubscribe(): Promise<void>;
}

export const NO_PUSH: ServiceWorkerPush = {
  isEnabled: false,
  controllerChanges: EMPTY,
  messages: EMPTY,
  notificationClicks: EMPTY,
  requestSubscription: () => Promise.reject(new Error('Push is not available')),
  unsubscribe: () => Promise.resolve(),
};

export const SERVICE_WORKER_PUSH = new InjectionToken<ServiceWorkerPush>('SERVICE_WORKER_PUSH', {
  providedIn: 'root',
  factory: () => NO_PUSH,
});

export function devicePushSubscriptionOf(subscription: {
  readonly endpoint: string;
  toJSON(): { readonly keys?: Record<string, string> };
}): DevicePushSubscription {
  const keys = subscription.toJSON().keys ?? {};
  const p256dh = keys['p256dh'];
  const auth = keys['auth'];
  if (!subscription.endpoint || !p256dh || !auth) {
    throw new Error('The push subscription carries no endpoint or keys');
  }
  return { endpoint: subscription.endpoint, p256dh, auth };
}
