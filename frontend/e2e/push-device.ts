import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface NotificationCase {
  readonly input: { readonly kind: string };
  readonly expected: { readonly tag: string; readonly url: string };
}

const NOTIFICATION_CASES: readonly NotificationCase[] = (
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'shared-cases', 'push', 'notification.json'), 'utf8'),
  ) as { cases: NotificationCase[] }
).cases;

function notificationOf(kind: string): NotificationCase['expected'] {
  const found = NOTIFICATION_CASES.find((sharedCase) => sharedCase.input.kind === kind);
  if (found === undefined) {
    throw new Error(`shared-cases/push/notification.json has no case of the kind ${kind}`);
  }
  return found.expected;
}

export interface PushDeviceOptions {
  readonly subscribedWith?: string;
  readonly permission?: 'granted' | 'denied' | 'default';
  readonly permissionAnswer?: 'granted' | 'denied' | 'default';
}

export const DEVICE_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-device';
export const DEVICE_P256DH = `B${'Q'.repeat(86)}`;
export const DEVICE_AUTH = 'A'.repeat(22);

export interface PushDeviceRecord {
  readonly subscribedWith: readonly string[];
  readonly unsubscribed: number;
  readonly permissionRequests: number;
  readonly badges: readonly (number | null)[];
}

export async function fakePushDevice(page: Page, options: PushDeviceOptions = {}): Promise<void> {
  await page.addInitScript(
    ({ endpoint, p256dh, auth, subscribedWith, permission, permissionAnswer }) => {
      let current = permission;
      const listeners = new Map<string, Set<(event: unknown) => void>>();
      const record = {
        subscribedWith: [] as string[],
        unsubscribed: 0,
        permissionRequests: 0,
        badges: [] as (number | null)[],
      };
      const bytesOf = (key: string): Uint8Array =>
        Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      let subscribed = subscribedWith !== null;
      let applicationServerKey: ArrayBuffer | null =
        subscribedWith === null ? null : (bytesOf(subscribedWith).buffer as ArrayBuffer);
      const subscription = {
        endpoint,
        get options() {
          return { userVisibleOnly: true, applicationServerKey };
        },
        toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
        unsubscribe: () => {
          subscribed = false;
          record.unsubscribed += 1;
          return Promise.resolve(true);
        },
      };
      const pushManager = {
        subscribe: (options: { applicationServerKey: Uint8Array }) => {
          subscribed = true;
          applicationServerKey = new Uint8Array(options.applicationServerKey).slice().buffer;
          record.subscribedWith.push(
            btoa(String.fromCharCode(...new Uint8Array(options.applicationServerKey)))
              .replace(/\+/g, '-')
              .replace(/\//g, '_')
              .replace(/=+$/, ''),
          );
          return Promise.resolve(subscription);
        },
        getSubscription: () => Promise.resolve(subscribed ? subscription : null),
      };
      const controller = {
        state: 'activated',
        scriptURL: '/ngsw-worker.js',
        postMessage: () => undefined,
      };
      const registration = { scope: `${location.origin}/`, active: controller, pushManager };
      const container = {
        controller,
        ready: Promise.resolve(registration),
        register: () => Promise.resolve(registration),
        getRegistration: () => Promise.resolve(registration),
        getRegistrations: () => Promise.resolve([registration]),
        addEventListener: (type: string, listener: (event: unknown) => void) => {
          const set = listeners.get(type) ?? new Set();
          set.add(listener);
          listeners.set(type, set);
        },
        removeEventListener: (type: string, listener: (event: unknown) => void) => {
          listeners.get(type)?.delete(listener);
        },
      };
      Object.defineProperty(Notification, 'permission', {
        configurable: true,
        get: () => current,
      });
      Object.defineProperty(Notification, 'requestPermission', {
        configurable: true,
        value: () => {
          record.permissionRequests += 1;
          current = permissionAnswer;
          return Promise.resolve(permissionAnswer);
        },
      });
      Object.defineProperty(Navigator.prototype, 'serviceWorker', {
        configurable: true,
        get: () => container,
      });
      Object.defineProperty(Navigator.prototype, 'setAppBadge', {
        configurable: true,
        value: (count: number) => {
          record.badges.push(count);
          return Promise.resolve();
        },
      });
      Object.defineProperty(Navigator.prototype, 'clearAppBadge', {
        configurable: true,
        value: () => {
          record.badges.push(null);
          return Promise.resolve();
        },
      });
      Object.defineProperty(window, '__nfnnPushDevice', {
        value: {
          record,
          post: (data: unknown) => {
            for (const listener of listeners.get('message') ?? []) {
              listener(new MessageEvent('message', { data }));
            }
          },
        },
      });
    },
    {
      endpoint: DEVICE_ENDPOINT,
      p256dh: DEVICE_P256DH,
      auth: DEVICE_AUTH,
      subscribedWith: options.subscribedWith ?? null,
      permission: options.permission ?? 'granted',
      permissionAnswer: options.permissionAnswer ?? options.permission ?? 'granted',
    },
  );
}

interface DeviceWindow {
  __nfnnPushDevice: { record: PushDeviceRecord; post(data: unknown): void };
}

export function deviceRecord(page: Page): Promise<PushDeviceRecord> {
  return page.evaluate(() => (window as unknown as DeviceWindow).__nfnnPushDevice.record);
}

export function workerPosts(page: Page, data: unknown): Promise<void> {
  return page.evaluate(
    (message) => (window as unknown as DeviceWindow).__nfnnPushDevice.post(message),
    data,
  );
}

export function alertMessage(kind: string, count: number, route = notificationOf(kind).url) {
  return {
    v: 1,
    kind,
    count,
    notification: {
      title: 'Nová naděje',
      body: 'Zkušební upozornění',
      tag: notificationOf(kind).tag,
      renotify: true,
      lang: 'cs',
      icon: '/icon-192.png',
      data: {
        kind,
        count,
        onActionClick: { default: { operation: 'focusLastFocusedOrOpen', url: route } },
      },
    },
  };
}
