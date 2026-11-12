/// <reference types="@angular/localize" />

import { DeviceBrowser, DevicePlatform, SignedInDevice } from '../../../../core/auth/donor';
import { BrowserSessionKind } from '../../../../core/auth/session-jar';

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

const APP = $localize`:@@donor.account.devices.app:aplikace`;

const SESSION_KINDS: Record<BrowserSessionKind, string> = {
  REMEMBERED: $localize`:@@donor.account.devices.kind.remembered:zapamatované přihlášení`,
  BROWSER: $localize`:@@donor.account.devices.kind.browser:do zavření prohlížeče`,
  PUBLIC: $localize`:@@donor.account.devices.kind.public:cizí počítač`,
};

export function deviceName(
  device: Pick<SignedInDevice, 'platform' | 'browser' | 'session'>,
): string {
  const installedApp = device.session === 'APP';
  if (device.platform === 'OTHER' && device.browser === 'OTHER' && !installedApp) {
    return $localize`:@@donor.account.devices.unknown:Neznámé zařízení`;
  }
  const platform =
    device.platform === 'OTHER'
      ? $localize`:@@donor.account.devices.platform.other:Jiné zařízení`
      : PLATFORMS[device.platform];
  return `${platform} · ${installedApp ? APP : browserName(device.browser)}`;
}

export function sessionKindName(device: Pick<SignedInDevice, 'session'>): string | null {
  return device.session === undefined || device.session === 'APP'
    ? null
    : SESSION_KINDS[device.session];
}

function browserName(browser: DeviceBrowser): string {
  return browser === 'OTHER'
    ? $localize`:@@donor.account.devices.browser.other:jiný prohlížeč`
    : BROWSERS[browser];
}
