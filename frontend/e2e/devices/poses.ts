import { devices } from '@playwright/test';

export interface DeviceOptions {
  textScale: number;
}

export interface Pose {
  id: string;
  device: keyof typeof devices;
  form: 'phone' | 'tablet';
  textScale?: number;
}

export const LARGE_TEXT = 200;

export const POSES: Pose[] = [
  { id: 'iphone-se', device: 'iPhone SE (3rd gen)', form: 'phone' },
  { id: 'iphone-17-pro', device: 'iPhone 17 Pro', form: 'phone' },
  { id: 'iphone-17-pro-landscape', device: 'iPhone 17 Pro landscape', form: 'phone' },
  {
    id: 'iphone-17-pro-max-large-text',
    device: 'iPhone 17 Pro Max',
    form: 'phone',
    textScale: LARGE_TEXT,
  },
  { id: 'ipad-pro-11', device: 'iPad Pro 11', form: 'tablet' },
  {
    id: 'ipad-pro-11-landscape-large-text',
    device: 'iPad Pro 11 landscape',
    form: 'tablet',
    textScale: LARGE_TEXT,
  },
  { id: 'pixel-7', device: 'Pixel 7', form: 'phone' },
];

export const DEVICE_PROJECT_PREFIX = 'device-';

export interface SafariPose {
  id: string;
  device: string;
  form: 'phone' | 'tablet' | 'desktop';
  platform: 'iOS' | 'mac';
  devicePattern?: RegExp;
  window?: { width: number; height: number };
  textScale?: number;
}

export const SAFARI_PREFIX = 'safari-';

export const SAFARI_POSES: SafariPose[] = [
  {
    id: 'safari-iphone-small',
    device: 'the smallest iPhone simulator (SE or e)',
    form: 'phone',
    platform: 'iOS',
    devicePattern: /^iPhone (SE|\d+e)\b/,
  },
  {
    id: 'safari-iphone-pro',
    device: 'the newest iPhone Pro simulator',
    form: 'phone',
    platform: 'iOS',
    devicePattern: /^iPhone \d+ Pro$/,
  },
  {
    id: 'safari-iphone-pro-max-large-text',
    device: 'the newest iPhone Pro Max simulator',
    form: 'phone',
    platform: 'iOS',
    devicePattern: /^iPhone \d+ Pro Max$/,
    textScale: LARGE_TEXT,
  },
  {
    id: 'safari-ipad',
    device: 'the newest 11-inch iPad simulator',
    form: 'tablet',
    platform: 'iOS',
    devicePattern: /^iPad (Pro|Air) 11/,
  },
  {
    id: 'safari-mac',
    device: 'Safari on macOS, window 1280 × 800',
    form: 'desktop',
    platform: 'mac',
    window: { width: 1280, height: 800 },
  },
  {
    id: 'safari-mac-large-text',
    device: 'Safari on macOS, window 1280 × 800',
    form: 'desktop',
    platform: 'mac',
    window: { width: 1280, height: 800 },
    textScale: LARGE_TEXT,
  },
];
