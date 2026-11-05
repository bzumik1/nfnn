import { InjectionToken } from '@angular/core';
import type { PrfReading } from '../device/crypto/prf';

export interface DeviceAccount {
  readonly email: string;
  readonly userHandle: string;
}

export type SignInSecret =
  | { readonly kind: 'password'; readonly password: string }
  | { readonly kind: 'prf'; readonly reading: PrfReading }
  | { readonly kind: 'none' };

export interface SessionDevice {
  prfInput(): Promise<Uint8Array<ArrayBuffer> | null>;
  signedIn(account: DeviceAccount, secret: SignInSecret): Promise<void>;
  restored(account: DeviceAccount): Promise<void>;
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
}): DeviceAccount {
  return { email: donor.email, userHandle: userHandleOf(donor.id) };
}

export function userHandleOf(donorId: string): string {
  const hex = donorId.replace(/-/g, '');
  let binary = '';
  for (let index = 0; index < hex.length; index += 2) {
    binary += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
