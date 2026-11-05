/// <reference types="@angular/localize" />

import { DeviceBrowser, DevicePlatform, SignedInDevice } from '../../../../core/auth/donor';

const PLATFORMS: Record<Exclude<DevicePlatform, 'OTHER'>, string> = {
  IPHONE: $localize`:@@donor.account.devices.platform.iphone:iPhone`,
  IPAD: $localize`:@@donor.account.devices.platform.ipad:iPad`,
  ANDROID: $localize`:@@donor.account.devices.platform.android:Android`,
  MAC: $localize`:@@donor.account.devices.platform.mac:Mac`,
  WINDOWS: $localize`:@@donor.account.devices.platform.windows:Windows`,
  CHROMEBOOK: $localize`:@@donor.account.devices.platform.chromebook:Chromebook`,
  LINUX: $localize`:@@donor.account.devices.platform.linux:Linux`,
};

const BROWSERS: Record<Exclude<DeviceBrowser, 'OTHER'>, string> = {
  SAFARI: $localize`:@@donor.account.devices.browser.safari:Safari`,
  CHROME: $localize`:@@donor.account.devices.browser.chrome:Chrome`,
  FIREFOX: $localize`:@@donor.account.devices.browser.firefox:Firefox`,
  EDGE: $localize`:@@donor.account.devices.browser.edge:Edge`,
};

export function deviceName(device: Pick<SignedInDevice, 'platform' | 'browser'>): string {
  if (device.platform === 'OTHER' && device.browser === 'OTHER') {
    return $localize`:@@donor.account.devices.unknown:Neznámé zařízení`;
  }
  const platform =
    device.platform === 'OTHER'
      ? $localize`:@@donor.account.devices.platform.other:Jiné zařízení`
      : PLATFORMS[device.platform];
  const browser =
    device.browser === 'OTHER'
      ? $localize`:@@donor.account.devices.browser.other:jiný prohlížeč`
      : BROWSERS[device.browser];
  return `${platform} · ${browser}`;
}
