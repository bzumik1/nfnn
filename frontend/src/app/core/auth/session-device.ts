import { InjectionToken } from '@angular/core';
import type { PrfReading } from '../device/crypto/prf';
import type { CopyProfile, CopySession } from './copy-profile';
import type { SessionKind } from './session-jar';

export interface DeviceAccount {
  readonly email: string;
  readonly userHandle: string;
  readonly administrator?: boolean;
}

export type SignInSecret =
  | { readonly kind: 'password'; readonly password: string }
  | { readonly kind: 'prf'; readonly reading: PrfReading }
  | { readonly kind: 'none' };

export interface OfflineAccount {
  readonly profile: CopyProfile;
  readonly session: CopySession;
}

export interface SessionDevice {
  prepare?(): void;
  openedOffline?(expected: SessionKind): Promise<OfflineAccount | null>;
  prfInput(): Promise<Uint8Array<ArrayBuffer> | null>;
  signedIn(
    account: DeviceAccount,
    secret: SignInSecret,
    storeNothing?: boolean,
    deviceSecret?: string,
  ): Promise<void>;
  restored(account: DeviceAccount, storeNothing?: boolean): Promise<void>;
  signedOut(account: DeviceAccount): Promise<void>;
  signedOutElsewhere(): void;
  sessionLost(): Promise<void>;
  passwordChanged(account: DeviceAccount, password: string): Promise<void>;
  passwordRemoved(account: DeviceAccount): Promise<void>;
  passkeyAdded(account: DeviceAccount, reading: PrfReading): Promise<void>;
}

export const NO_SESSION_DEVICE: SessionDevice = {
  prfInput: async () => null,
  signedIn: async () => undefined,
  restored: async () => undefined,
  signedOut: async () => undefined,
  signedOutElsewhere: () => undefined,
  sessionLost: async () => undefined,
  passwordChanged: async () => undefined,
  passwordRemoved: async () => undefined,
  passkeyAdded: async () => undefined,
};

export const SESSION_DEVICE = new InjectionToken<SessionDevice>('SESSION_DEVICE', {
  providedIn: 'root',
  factory: () => NO_SESSION_DEVICE,
});

export function deviceAccountOf(donor: {
  readonly id: string;
  readonly email: string;
  readonly roles?: readonly string[];
}): DeviceAccount {
  return {
    email: donor.email,
    userHandle: userHandleOf(donor.id),
    administrator: donor.roles?.includes(ADMINISTRATOR_ROLE) ?? false,
  };
}

const ADMINISTRATOR_ROLE = 'ADMIN';

export function userHandleOf(donorId: string): string {
  const hex = donorId.replace(/-/g, '');
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
