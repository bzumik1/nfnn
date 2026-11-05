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
