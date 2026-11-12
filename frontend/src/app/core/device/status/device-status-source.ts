import { InjectionToken, Injector, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { DeviceStatus, DeviceStatusApi, DeviceStatusResponse } from './device-status-api';

export const DEVICE_STATUS_TIMEOUT_MS = 10_000;

export type DeviceStatusSource = (deviceSecret: string) => Promise<DeviceStatusResponse | null>;

const STATUSES: ReadonlySet<DeviceStatus> = new Set([
  'signed-in',
  'signed-out',
  'wipe-admin',
  'wipe-all',
  'unknown',
]);

export const DEVICE_STATUS_SOURCE = new InjectionToken<DeviceStatusSource>('DEVICE_STATUS_SOURCE', {
  providedIn: 'root',
  factory: () => {
    const injector = inject(Injector);
    return (deviceSecret) =>
      firstValueFrom(
        injector.get(DeviceStatusApi).status(deviceSecret).pipe(timeout(DEVICE_STATUS_TIMEOUT_MS)),
      ).then(statusAnswer, () => null);
  },
});

export function statusAnswer(answer: unknown): DeviceStatusResponse | null {
  if (typeof answer !== 'object' || answer === null) {
    return null;
  }
  const { status, administrator } = answer as Partial<Record<keyof DeviceStatusResponse, unknown>>;
  if (typeof status !== 'string' || !STATUSES.has(status as DeviceStatus)) {
    return null;
  }
  if (typeof administrator !== 'boolean') {
    return null;
  }
  return { status: status as DeviceStatus, administrator };
}
