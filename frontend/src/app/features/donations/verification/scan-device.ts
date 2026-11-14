import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';
import { pictureSize } from './picture-size';
import type { QrImage } from './qr-image';

export type FrameRegion = 'centre' | 'whole';

export interface ScanDevice {
  hasCamera(): boolean;
  openCamera(): Promise<MediaStream>;
  attach(video: HTMLVideoElement, stream: MediaStream): Promise<void>;
  frame(video: HTMLVideoElement, region: FrameRegion): QrImage | null;
  picture(file: Blob): Promise<QrImage>;
}

export const SCAN_CAMERA_KEY = 'nfnn.scan-camera';
export const LARGEST_FRAME_SIDE = 1_280;
export const LARGEST_CENTRE_SIDE = 1_600;
const CAMERA_SIZE = { width: { ideal: 1_920 }, height: { ideal: 1_080 } };
const CAMERA_REFUSALS = ['NotAllowedError', 'SecurityError'];
const CAMERA_GONE = ['NotFoundError', 'OverconstrainedError'];
const FOCUS_WAIT_MS = 1_000;
const LARGEST_PICTURE_SIDE = 2_400;
const HAVE_CURRENT_DATA = 2;
export const LARGEST_PICTURE_PIXELS = 50_000_000;

export class PictureTooLarge extends Error {}

function scaled(width: number, height: number, largest: number): { width: number; height: number } {
  const factor = Math.min(1, largest / Math.max(width, height));
  return { width: Math.round(width * factor), height: Math.round(height * factor) };
}

export interface FrameCut {
  readonly x: number;
  readonly y: number;
  readonly side: { readonly width: number; readonly height: number };
  readonly size: { readonly width: number; readonly height: number };
}

export function frameCut(width: number, height: number, region: FrameRegion): FrameCut {
  if (region === 'whole') {
    return { x: 0, y: 0, side: { width, height }, size: scaled(width, height, LARGEST_FRAME_SIDE) };
  }
  const side = Math.min(width, height, LARGEST_CENTRE_SIDE);
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    side: { width: side, height: side },
    size: { width: side, height: side },
  };
}

function pixels(document: Document, source: CanvasImageSource, cut: FrameCut): QrImage | null {
  const { width, height } = cut.size;
  if (width === 0 || height === 0) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) {
    return null;
  }
  context.drawImage(source, cut.x, cut.y, cut.side.width, cut.side.height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

interface FocusCapabilities {
  readonly focusMode?: readonly string[];
}

async function focusContinuously(stream: MediaStream): Promise<void> {
  for (const track of stream.getVideoTracks()) {
    const capabilities = (track.getCapabilities?.() ?? {}) as FocusCapabilities;
    if (capabilities.focusMode?.includes('continuous')) {
      const focused = track
        .applyConstraints({
          ...CAMERA_SIZE,
          advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
        })
        .catch(() => undefined);
      await Promise.race([focused, new Promise((resolve) => setTimeout(resolve, FOCUS_WAIT_MS))]);
    }
  }
}

function savedCamera(storage: Storage | null): string | null {
  try {
    return storage?.getItem(SCAN_CAMERA_KEY) || null;
  } catch {
    return null;
  }
}

function saveCamera(storage: Storage | null, stream: MediaStream): void {
  const settings = stream.getVideoTracks()[0]?.getSettings();
  const deviceId = settings?.facingMode === 'user' ? undefined : settings?.deviceId;
  try {
    if (deviceId) {
      storage?.setItem(SCAN_CAMERA_KEY, deviceId);
    }
  } catch {
    return;
  }
}

function forgetCamera(storage: Storage | null): void {
  try {
    storage?.removeItem(SCAN_CAMERA_KEY);
  } catch {
    return;
  }
}

export async function openScanCamera(
  media: MediaDevices | undefined,
  storage: Storage | null,
): Promise<MediaStream> {
  if (typeof media?.getUserMedia !== 'function') {
    throw new DOMException('', 'NotFoundError');
  }
  const saved = savedCamera(storage);
  const choices: MediaTrackConstraints[] = [
    ...(saved === null ? [] : [{ deviceId: { exact: saved } }]),
    { facingMode: { exact: 'environment' } },
    {},
  ];
  let failure: unknown = new DOMException('', 'NotFoundError');
  for (const [index, choice] of choices.entries()) {
    let stream: MediaStream;
    try {
      stream = await media.getUserMedia({ audio: false, video: { ...choice, ...CAMERA_SIZE } });
    } catch (refused: unknown) {
      if (refused instanceof DOMException && CAMERA_REFUSALS.includes(refused.name)) {
        throw refused;
      }
      if (
        saved !== null &&
        index === 0 &&
        refused instanceof DOMException &&
        CAMERA_GONE.includes(refused.name)
      ) {
        forgetCamera(storage);
      }
      failure = refused;
      continue;
    }
    try {
      saveCamera(storage, stream);
      await focusContinuously(stream);
    } catch (broken: unknown) {
      stream.getTracks().forEach((track) => track.stop());
      throw broken;
    }
    return stream;
  }
  throw failure;
}

function localStorageOf(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

export const SCAN_DEVICE = new InjectionToken<ScanDevice>('scan device', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    const media = document.defaultView?.navigator.mediaDevices;
    return {
      hasCamera: () => typeof media?.getUserMedia === 'function',
      openCamera: () => openScanCamera(media, localStorageOf(document)),
      attach: async (video, stream) => {
        video.srcObject = stream;
        await video.play();
      },
      frame: (video, region) =>
        video.readyState < HAVE_CURRENT_DATA
          ? null
          : pixels(document, video, frameCut(video.videoWidth, video.videoHeight, region)),
      picture: async (file) => {
        const size = pictureSize(new Uint8Array(await file.arrayBuffer()));
        if (size === null) {
          throw new Error('The picture is no PNG, JPEG or WebP.');
        }
        if (size.width * size.height > LARGEST_PICTURE_PIXELS) {
          throw new PictureTooLarge();
        }
        const bitmap = await createImageBitmap(file);
        try {
          const image = pixels(document, bitmap, {
            x: 0,
            y: 0,
            side: { width: bitmap.width, height: bitmap.height },
            size: scaled(bitmap.width, bitmap.height, LARGEST_PICTURE_SIDE),
          });
          if (image === null) {
            throw new Error('The picture has no pixels.');
          }
          return image;
        } finally {
          bitmap.close();
        }
      },
    };
  },
});
