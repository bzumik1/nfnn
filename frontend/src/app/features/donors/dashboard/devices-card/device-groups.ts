import { SignedInDevice } from '../../../../core/auth/donor';

export const OLDER_AFTER_DAYS = 30;

const OLDER_AFTER_MS = OLDER_AFTER_DAYS * 24 * 60 * 60 * 1000;

export interface DeviceGroups {
  readonly current: readonly SignedInDevice[];
  readonly recent: readonly SignedInDevice[];
  readonly older: readonly SignedInDevice[];
}

export function groupDevices(devices: readonly SignedInDevice[]): DeviceGroups {
  const lastUse = (device: SignedInDevice) => Date.parse(device.lastUsedAt);
  const newestUse = Math.max(...devices.map(lastUse));
  const others = devices
    .filter((device) => !device.current)
    .sort((first, second) => lastUse(second) - lastUse(first));
  const isOlder = (device: SignedInDevice) => newestUse - lastUse(device) > OLDER_AFTER_MS;
  return {
    current: devices.filter((device) => device.current),
    recent: others.filter((device) => !isOlder(device)),
    older: others.filter(isOlder),
  };
}
